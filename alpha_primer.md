# Alpha Primer

## Purpose

This document describes the current `Alpha` AI tier as it exists in the codebase today. It is not a future design note. It is a primer on the shipped architecture, runtime flow, search behavior, model stack, training pipeline, deployment path, and the most practical next improvements.

In project terms:

- `Basic` is the simple baseline AI.
- `Tactical` is the heuristic AI.
- `Engine` is the search plus NNUE tier.
- `Alpha` is the transformer policy/value plus PUCT/MCTS tier.

`Alpha` is a real end-to-end AI line in the repo today. It runs in UI, headless, MCP, and tooling, but it is still early-stage and materially less battle-tested than a mature AlphaZero-style system.

## High-Level Architecture

The current Alpha stack is split across a few concrete runtime surfaces:

- `packages/ai`
  - `src/ai-controller.ts`
    - main synchronous entry point for `generateNextCommand(...)`
    - owns turn-context lifecycle, queued-plan invalidation, strategy dispatch, and optional shadow Alpha diagnostics
  - `src/strategy/alpha-strategy.ts`
    - Alpha-specific strategy wrapper
    - runs phase-control helpers first, then calls `searchAlphaBestAction(...)`
  - `src/alpha/search.ts`
    - transformer-guided PUCT/MCTS runtime
  - `src/alpha/state-encoder.ts`
    - emits Alpha state tokens plus heuristic value targets
  - `src/alpha/action-encoder.ts`
    - emits one embedding per legal macro-action
  - `src/alpha/inference.ts`
    - TensorFlow.js transformer inference runtime and seed-model construction
    - Node-side Alpha tooling now boots the native `tfjs-node` backend before this module is used
  - `src/alpha/training.ts`
    - trainable tensor wrapper plus Alpha batch-loss implementation
  - `src/alpha/model-registry.ts`
    - validates, registers, and resolves Alpha models
  - `src/alpha/default-model.ts`
    - materializes the live default Alpha model from the tracked promoted override
  - `src/alpha/serialization.ts`
    - JSON serialization helpers for deployable Alpha model artifacts
- `packages/ui`
  - `src/game/hooks/useAITurn.ts`
    - in-game AI loop
    - sends `Alpha` work to a dedicated worker instead of running MCTS on the main thread
  - `src/game/hooks/alpha-ai.worker.ts`
    - worker-side bridge that calls `generateNextCommand(...)`
  - `src/game/screens/ArmyLoadScreen.tsx`
    - exposes `Alpha` in the preset-army setup flow
    - exposes `Balanced` and `Tournament` Alpha presets plus optional shadow Alpha
  - `src/game/screens/ArmyBuilderScreen.tsx`
    - exposes the same `Alpha` and shadow Alpha controls in the builder flow
- `packages/headless`
  - `src/session.ts`
    - `HeadlessMatchSession`
    - persistent match host that can run `Alpha`, `Engine`, `Tactical`, or human/agent players
  - `src/index.ts`
    - one-shot `runHeadlessMatch(...)` entry used by tooling and tests
  - `src/cli.ts`
    - CLI tier parsing, Alpha model flags, Alpha simulation caps, and shadow Alpha flags
- `packages/mcp-server`
  - `src/register-tools.ts`
    - Zod schema surface for remote match creation, AI advancement, Alpha config fields, and shadow Alpha config
- `tools/alpha`
  - `common.mjs`
    - shared defaults, config builders, replay-buffer encoding, instrumented match helpers, model load/save helpers, output-path helpers, and TensorFlow backend bootstrap for Node-side Alpha tooling
  - `distill-engine.mjs`
    - Engine-teacher distillation into Alpha replay-buffer rows
  - `self-play.mjs`
    - Alpha self-play and curriculum-data generation
  - `train.mjs`
    - supervised Alpha training and serialized model export
  - `gate.mjs`
    - candidate-vs-Tactical / Engine / default-Alpha benchmark runner
  - `promote-model.mjs`
    - archive-backed promotion workflow for the live default Alpha model
  - `inspect-buffer.mjs`
    - corpus summary and replay-buffer inspection
  - `run-with-compatible-node.mjs`
    - package-script launcher that re-execs TensorFlow-heavy Alpha tools under a compatible Node runtime so `@tensorflow/tfjs-node` is used instead of the slow pure-JS backend

The runtime Alpha stack is still command-based from end to end. Search does not directly mutate the game. It proposes macro-actions, simulates them through the real command processor, and returns one legal `GameCommand` at a time to the caller.

## Outer Runtime Architecture

The important architectural point is that `Alpha` is not a tooling-only experiment. The same core path is reused everywhere:

1. UI worker or headless session decides an AI player should act.
2. `generateNextCommand(...)` in `packages/ai` resolves the configured tier.
3. `AlphaStrategy` calls the Alpha search stack.
4. Alpha search generates macro-actions from the shared generator, evaluates them with the transformer, and samples transitions through the real command processor.
5. One legal command is emitted.
6. If the macro-action had follow-up commands, they are stored in the shared queued plan and only replayed if the state fingerprint still matches.
7. If the live seat is not Alpha but `shadowAlpha` is enabled, the AI controller also runs Alpha sidecar search and attaches shadow diagnostics without emitting Alpha commands.

That same path is used by:

- the browser worker path
- one-shot headless matches
- persistent `HeadlessMatchSession`
- MCP `advance_ai_decision`
- Alpha self-play corpus generation
- Alpha gate matches

This reuse is one of the strongest parts of the current Alpha implementation. It means most Alpha bugs, determinism issues, and legality issues can be reproduced in headless runs and then fixed at the shared core.

## What the Alpha Tier Is

The `Alpha` tier is declared in the AI type system as the fourth strategy tier after `Basic`, `Tactical`, and `Engine`.

At runtime:

1. The caller provides an `AIPlayerConfig`.
2. The AI controller resolves the requested tier.
3. `Alpha` maps to `AlphaStrategy`.
4. `AlphaStrategy` delegates turn decisions to `searchAlphaBestAction(...)`.
5. Search evaluates the current state and legal macro-actions with a transformer policy/value model.

This tier is additive. `Basic`, `Tactical`, and `Engine` still exist and remain usable across UI, headless, and MCP.

## Runtime Decision Flow

### 1. Configuration

The Alpha tier uses the normal AI config shape plus Alpha-specific knobs:

- `timeBudgetMs`
- `alphaModelId`
- `baseSeed`
- `maxSimulations`
- `diagnosticsEnabled`
- `shadowAlpha`

These are stored in `AIPlayerConfig` and flow through UI, headless, and MCP.

The current shared Alpha search defaults are:

- if `timeBudgetMs` is omitted
  - default to `1500 ms`
- if `maxSimulations` is omitted
  - use `256` when the budget is `600 ms` or below
  - use `640` above that
- `baseSeed`
  - defaults to `9001`
- `reuseRoots`
  - enabled
- `puctExploration`
  - `1.35`
- `policyPriorBlend`
  - `0.2`
- `valueBlend`
  - `0.15`

The UI currently exposes:

- `Balanced`
  - `600 ms`
  - `256` simulations
- `Tournament`
  - `1500 ms`
  - `640` simulations

### 2. AI controller

`generateNextCommand(...)` in the AI controller is the main runtime entry point.

Its job is to:

- decide whether the AI should act
- reset or invalidate the turn context when state ownership changes
- emit queued follow-up commands if search already planned a multi-step macro-action
- otherwise create the configured strategy and ask it for the next command
- optionally attach shadow Alpha diagnostics to a non-Alpha live seat

The controller also stores:

- latest diagnostics
- latest error
- latest state fingerprint
- queued follow-up commands
- last engine score

The queued-plan invalidation path is shared across `Engine` and `Alpha`, so Alpha benefits from the same stale-plan protection as the regular Engine path.

### 3. Alpha strategy

`AlphaStrategy` does three things:

- tries phase-control helpers first for obvious phase/sub-phase housekeeping
- calls `searchAlphaBestAction(...)`
- stores diagnostics and queued follow-up commands back into the shared turn context

If the chosen macro-action contains multiple commands, the strategy only emits the first one immediately. The rest are stored as a queued plan and consumed on later calls if the game state still matches the expected fingerprint.

### 4. Queued plans and invalidation

The queued-plan system exists because the public AI API still emits one `GameCommand` per call, while Alpha search chooses at the macro-action level.

The queued plan is invalidated when:

- phase changes
- sub-phase changes
- decision owner changes
- state fingerprint no longer matches
- the last emitted command was rejected

This is shared controller behavior, not Alpha-only behavior.

## Search Model

### Search unit of choice

Alpha searches over `MacroAction` objects, not raw commands.

A macro-action contains:

- an `id`
- a display `label`
- one or more `commands`
- an `orderingScore`
- `actorIds`
- free-form `reasons`

This is the same shared action unit used by the regular Engine searcher.

### Search algorithm

The current Alpha implementation is a transformer-guided PUCT/MCTS search with:

- a cached reusable root keyed by state fingerprint, acted-unit signature, and model id
- decision nodes and reaction nodes
- explicit chance nodes for sampled stochastic outcomes
- batched transformer leaf evaluation
- heuristic value fallback from `estimateAlphaValueTargets(...)`
- policy priors blended with shared macro-action ordering scores
- queued-plan continuation for multi-command macro-actions

The current runtime config is intentionally budget-aware:

- `timeBudgetMs <= 600`
  - `maxRootActions = 18`
  - `maxActionsPerUnit = 4`
  - default `maxSimulations = 256`
- above that
  - `maxRootActions = 24`
  - `maxActionsPerUnit = 5`
  - default `maxSimulations = 640`

Other current search settings are:

- `maxAutoAdvanceSteps = 8`
- `puctExploration = 1.35`
- `dirichletAlpha = 0.22`
- `dirichletEpsilon = 0`
- `policyPriorBlend = 0.2`
- `valueBlend = 0.15`
- `rootTemperature = 1`
- `reuseRoots = true`

One practical consequence of the current config is that runtime Alpha search does not inject Dirichlet root noise today, because `dirichletEpsilon` is currently `0`. Self-play therefore improves mostly through seed variation, curriculum mix, and retraining rather than explicit AlphaZero-style root noise.

### Leaf evaluation

Leaf evaluation currently works like this:

1. Generate the legal macro-actions from the shared generator.
2. Encode the state into Alpha state tokens.
3. Encode each legal macro-action into an Alpha action embedding.
4. Batch those encoded states/actions through TensorFlow.js.
5. Read back:
   - policy logits / priors
   - scalar value
   - auxiliary VP-delta estimate
   - auxiliary tactical-swing estimate
6. Blend the model value with the heuristic value target and expand the node.

### Chance handling

Alpha handles stochastic resolution explicitly through `sampleMacroActionTransition(...)`.

That transition path:

- simulates the macro-action through the real command processor
- records queued follow-up commands for later emission
- keys sampled outcomes so the search tree can revisit the same stochastic branch

The search is therefore not pretending the game is deterministic. It explicitly models the sampled outcome branch that was taken.

## Macro-Action Surface

Alpha does not own a separate command generator today. It reuses the shared macro-action generator from the Engine stack.

That means Alpha currently searches over the same major surfaces:

- Movement
  - reserves tests
  - reserve deployment
  - normal movement candidates
  - rush declaration plus rushed move continuation
- Shooting
  - declare shooting
  - bundled blast/template placement payloads on `declareShooting`
  - target-model selection
  - casualty resolution continuation
- Reactions
  - select reaction
  - decline reaction
- Assault
  - declare charge
  - challenge declaration
  - challenge acceptance/decline
  - gambit selection
  - fight resolution
  - aftermath selection
- Phase control
  - `endSubPhase`
  - `endPhase`

Two concrete details matter here:

- Alpha is only as wide as the shared macro-action generator. If that generator does not search a choice, Alpha does not search it either.
- The current action encoder already understands command types such as `manifestPsychicPower` and `declareWeapons`, but the shared macro-action generator still does not search those psychic choices in the regular action surface, so Alpha does not yet make those decisions as part of its normal search.

So Alpha currently has a richer model and searcher than Engine, but it still inherits the same legal macro-action surface limitations.

## Model Stack

### What the Alpha model is

The current Alpha model is a TypeScript plus TensorFlow.js transformer policy/value model.

The live default hyperparameters are:

- `stateFeatureDimension = 96`
- `actionFeatureDimension = 96`
- `coordinateFeatureDimension = 16`
- `modelWidth = 256`
- `layerCount = 6`
- `attentionHeads = 8`
- `feedForwardWidth = 1024`
- `dropoutRate = 0.1`
- `maxStateTokens = 96`
- `maxActionTokens = 32`

The current architecture includes:

- state projection
- coordinate projection
- action projection
- learned token-type embeddings
- 6 pre-norm transformer encoder blocks
- a policy head that cross-attends action queries into state memory
- a value head that predicts:
  - scalar game value
  - VP delta
  - tactical swing

Fresh seed models are deterministically initialized from the model id and tensor name, so tooling can bootstrap a reproducible seed model before the first real promotion.

### Current state encoding

The Alpha state encoder emits variable-length tokens for:

- one global token
- unit tokens
- objective tokens
- terrain tokens
- context tokens

The current encoder uses:

- active-player-relative normalized coordinates
- Fourier coordinate features
- token-type embeddings
- hashed identity slices
- tactical signal summaries from the shared `tactical-signals.ts` helpers
- deterministic sorting and truncation rules persisted in the model manifest

The live manifest sorting/truncation rules currently preserve:

- global token first
- unit tokens prioritized by side, strategic value, projected objective value, and unit id
- objective tokens by VP value
- terrain tokens by relevance and size
- context tokens by urgency

and then truncate down to `96` state tokens while always preserving the global token.

### Current action encoding

The Alpha action encoder emits one embedding per legal macro-action and currently includes:

- whether the action exists and how many commands it contains
- actor and target counts
- shared ordering score
- continuation flags
- reaction flags
- command-type one-hot encoding
- objective delta
- exposure delta
- outgoing-pressure delta
- objective-removal swing
- move distance
- shooting weapon summary
  - weapon count
  - average range
  - average strength
  - average damage
  - average AP
- hashed slices over:
  - macro-action id
  - label
  - actor ids
  - target ids
  - reasons

The current action cap is `32` embeddings per decision after truncation.

### Model registry and validation

The model registry is process-local and seeded with the promoted default model if that default override exists.

Each model manifest includes:

- `modelFamily`
- `schemaVersion`
- `tokenSchemaVersion`
- `actionSchemaVersion`
- `modelId`
- `weightsChecksum`
- `trainingMetadata`
- `hyperparameters`
- token sorting rules
- token truncation rules

The registry validates:

- model family
- schema version
- token schema version
- action schema version
- tensor-shape map
- checksum

If a requested model id is missing or incompatible, evaluation fails closed with an error rather than silently falling back.

### Model serialization

Serialized Alpha model files are plain JSON and contain:

- `manifest`
- `tensors`

Tensor payloads are base64-encoded `Float32Array` data. This is the format written by Alpha training and loaded by Alpha gate, self-play, and promotion tooling.

### Current default model behavior

The runtime-facing default Alpha model id is:

- `alpha-default-v1`

The live runtime default is currently driven by:

- `packages/ai/src/alpha/default-model.ts`
- `packages/ai/src/alpha/default-alpha-model-override.ts`

Unlike the regular Engine stack, Alpha does not currently keep a separate hand-built heuristic fallback model in source. `default-model.ts` materializes the default Alpha model from the tracked override file. If that override were `null`, the runtime default would also be `null`.

In the current repo, the override does exist, so `alpha-default-v1` is registered into the Alpha model registry at process start.

The current override metadata records:

- source model id: `alpha-initial-v1-candidate`
- promoted at: `2026-03-13T05:01:01.658Z`
- gate result:
  - `passed: false`
  - `aborted: 1`
  - `timeouts: 2`
  - `threshold: 0.25`
  - `matchesPerOpponent: 1`

So the live default Alpha model is real and promoted, but the current tracked metadata also shows that the first promotion was not a clean passed gate. That is important context for interpreting current Alpha strength.

## UI, Headless, and MCP Surfaces

### UI runtime

In the UI:

- `Basic` and `Tactical` can run inline in the hook path.
- `Engine` and `Alpha` are both sent through dedicated web workers so search does not block the main thread.
- If worker creation fails, the hook falls back to inline `generateNextCommand(...)` on the main thread.

When `Alpha` is selected in the setup screens, the UI currently sends:

- `timeBudgetMs`
- `maxSimulations`
- `alphaModelId`
- `baseSeed`
- `diagnosticsEnabled`

The current setup screens hardcode these Alpha defaults:

- `alphaModelId: DEFAULT_ALPHA_MODEL_ID`
- `diagnosticsEnabled: true`
- `baseSeed: 7331`

The current shadow Alpha UI defaults use:

- `alphaModelId: DEFAULT_ALPHA_MODEL_ID`
- `diagnosticsEnabled: true`
- `baseSeed: 9001`

The concrete flow is:

1. `useAITurn.ts` notices the AI should act.
2. If the tier is `Alpha`, it posts the full `GameState`, `AIPlayerConfig`, and `AITurnContext` to `alpha-ai.worker.ts`.
3. The worker calls `generateNextCommand(...)`.
4. The worker returns the chosen command, updated context, diagnostics, and any error.
5. The hook dispatches the returned command back into the UI reducer.

One important implementation detail: Alpha still uses tactical deployment logic for pre-game placement. Alpha gameplay decisions use the transformer plus PUCT path; deployment does not yet have a separate Alpha planner.

### Headless runtime

Headless supports Alpha in two ways:

- one-shot match execution with `runHeadlessMatch(...)`
- persistent match hosting with `HeadlessMatchSession`

Both headless surfaces understand:

- tier selection
- time budget
- Alpha model id
- base seed
- max simulations
- diagnostics
- optional shadow Alpha

`HeadlessMatchSession` is still the main persistent host abstraction. It owns:

- the current `GameState`
- per-player configs
- per-player AI turn contexts
- latest AI diagnostics
- command history
- replay-oriented dice recording

That makes it the common foundation for:

- MCP remote control
- headless debugging
- deterministic replay/export
- AI-vs-AI automation outside the browser

### Headless CLI

The current headless CLI accepts:

- `--player0-tier alpha`
- `--player1-tier alpha`
- `--player0-alpha-model`
- `--player1-alpha-model`
- `--player0-alpha-sims`
- `--player1-alpha-sims`
- full shadow Alpha flags for both players

The CLI currently defaults `maxCommands` to `2000` and supports Alpha sidecar diagnostics from the command line without needing a separate Alpha-specific CLI.

### MCP runtime

The MCP server exposes match/session creation and AI advancement on top of the headless session layer. Alpha-specific configuration fields are part of the schema, so Alpha matches can be created and advanced externally while still using the same core AI code.

The exposed player schema now includes:

- `strategyTier`
- `timeBudgetMs`
- `alphaModelId`
- `baseSeed`
- `maxSimulations`
- `diagnosticsEnabled`
- `shadowAlpha`

So MCP is not a parallel Alpha implementation. It is a transport and schema layer over the same headless plus AI runtime.

## Training and Benchmarking Pipeline

### Command entrypoints

The supported command path for Alpha tooling is the root `pnpm alpha:*` script surface.

Use:

- `pnpm alpha:distill`
- `pnpm alpha:train`
- `pnpm alpha:selfplay`
- `pnpm alpha:gate`
- `pnpm alpha:promote`
- `pnpm alpha:inspect`

Do not treat raw `node tools/alpha/*.mjs` execution as the normal operational path for TensorFlow-heavy tools.

Current entrypoint behavior is:

- `alpha:train`
- `alpha:selfplay`
- `alpha:gate`

route through `tools/alpha/run-with-compatible-node.mjs`, which re-execs them under a compatible Node 20/22 runtime and enables the native `@tensorflow/tfjs-node` backend.

- `alpha:distill`
- `alpha:promote`
- `alpha:inspect`

remain direct `pnpm alpha:*` entrypoints because they do not need the same TensorFlow runtime wrapper.

The concrete, copy-paste command reference now lives in `Alpha_Training_Commands.md`.

### Distill

`tools/alpha/distill-engine.mjs` distills Engine teacher decisions into Alpha replay-buffer rows.

It currently supports two modes:

- fresh rerun mode
  - reruns Engine-vs-Engine matches and records Alpha-formatted samples directly
- replay import mode
  - imports existing Engine self-play manifests or replay artifacts and reconstructs Alpha samples from those recorded decisions

The fresh rerun path now uses a separate Alpha-side teacher search helper in `tools/alpha/teacher-engine-search.mjs` rather than calling the regular Engine runtime path. That keeps fresh Alpha distill isolated from the working Engine search file.

Current fresh-rerun defaults are:

- `--matches 6`
- `--time-budget-ms 250`
- `--max-commands 2000`
- `--shard-size 256`
- `--max-depth-soft 4`
- `--rollout-count 1`

Current distill output includes:

- replay artifacts
- Alpha-format `distill-shard-*.jsonl`
- `manifest.json`

Each persisted row contains Alpha-ready fields such as:

- `encodedState`
- `encodedActions`
- `policyTarget`
- `valueTarget`
- `vpDeltaTarget`
- `tacticalSwingTarget`
- replay artifact linkage

### Self-play

`tools/alpha/self-play.mjs` runs Alpha self-play and curriculum matches and records Alpha replay-buffer rows.

Operationally, the supported fast path is `pnpm alpha:selfplay`, not raw `node tools/alpha/self-play.mjs`, because the package script now routes through the compatible-Node plus `tfjs-node` launcher.

It currently supports:

- `--model <model-id>`
- `--model-file <candidate.json>`

If `--model` points at a missing model id, the script will bootstrap and register a deterministic seed model so self-play can still run before the first promotion.

Current self-play defaults are:

- `--matches 8`
- `--time-budget-ms 600`
- `--max-simulations 800`
- `--max-commands 2000`
- `--shard-size 256`
- `--curriculum mirror,tactical,engine`

The self-play output includes:

- replay artifacts
- Alpha-format `selfplay-shard-*.jsonl`
- `manifest.json`
- curriculum counts

One practical nuance: current self-play still uses the live runtime Alpha search config, and that config has `dirichletEpsilon = 0`. So the current self-play loop does not yet add explicit Dirichlet root noise.

### Training

`tools/alpha/train.mjs` performs a TensorFlow.js training pass over Alpha replay-buffer rows.

Operationally, the supported fast path is `pnpm alpha:train`. The package script now launches training through `tools/alpha/run-with-compatible-node.mjs`, which re-execs under a compatible Node runtime and enables the native `@tensorflow/tfjs-node` backend before Alpha inference and training modules load. This is materially faster than the old pure-JavaScript TensorFlow backend path.

It currently does the following:

- read manifests and/or JSONL shard files
- validate that the rows contain Alpha-native encoded state/action tensors and aligned policy targets
- initialize from either:
  - a prior model file
  - or a deterministic seed model
- deterministically shuffle rows by seed each epoch
- batch them
- optimize the transformer weights with Adam
- write a serialized candidate model
- write a training summary JSON

If `--input` is omitted, training currently defaults to any existing:

- `tmp/alpha/distill/manifest.json`
- `tmp/alpha/selfplay/manifest.json`

Current training defaults are:

- `--epochs 4`
- `--batch-size 8`
- `--learning-rate 1e-4`
- `--weight-decay 1e-5`
- `--entropy-regularization 5e-4`
- `--policy-weight 1`
- `--value-weight 1`
- `--vp-weight 0.35`
- `--tactical-swing-weight 0.35`
- `--seed 1337`

Unlike the current NNUE trainer, the Alpha trainer does not yet have:

- a validation split
- early stopping
- best-checkpoint selection

It is a real transformer trainer, but it is still a relatively direct epoch-and-batch loop.

### Inspect

`tools/alpha/inspect-buffer.mjs` summarizes Alpha replay-buffer corpora.

It currently reports:

- input files/manifests
- sample count
- unique match count
- source counts
- source-model counts
- curriculum counts
- final-outcome counts
- average state-token count
- average action-token count
- average target values
- preview rows

This is the main quick sanity-check tool for Alpha corpora today.

### Gating

`tools/alpha/gate.mjs` loads a serialized Alpha candidate file, registers it into the process-local Alpha registry, and runs benchmark matches against:

- `Tactical`
- `Engine`
- current `Alpha Default` if the candidate is not already `alpha-default-v1`

Operationally, the supported fast path is `pnpm alpha:gate`, which uses the same compatible-Node plus native-TensorFlow wrapper as Alpha training and self-play.

Current gate defaults are:

- `--matches 4`
- `--threshold 0.55`
- `--time-budget-ms 1500`
- `--max-simulations 640`
- `--max-commands 2000`

One important nuance: `--matches` is matches per opponent, not total matches.

The gate reports:

- candidate wins
- tactical wins
- engine wins
- default Alpha wins
- draws
- aborted runs
- timeouts
- win rate
- pass/fail
- per-opponent buckets
- per-match classifications

Failed Alpha gates return shell exit code `1`, while passed gates return exit code `0`.

### Promotion

`tools/alpha/promote-model.mjs` is the concrete deployment path for the live default Alpha model.

It currently does the following:

- load and validate the candidate JSON
- read and normalize the gate summary unless `--force` is used
- archive the candidate and gate summary under `archive/alpha/promotions/`
- write `promotion-record.json`
- append the archive index
- rewrite `packages/ai/src/alpha/default-alpha-model-override.ts`
- rebuild the workspace by default

So Alpha now has a real archive-backed promotion workflow, not just a manual source-edit story.

## Deployment Path Today

There are two different meanings of "deploy" in the current Alpha project path:

### Tooling deployment

The tooling can load a serialized Alpha model JSON directly. The current gate, self-play, train, and promote paths all do this today.

### Runtime deployment

The actual game surfaces do not yet hot-load arbitrary Alpha model files at runtime.

Today:

- the UI points Alpha selection at `alpha-default-v1`
- headless and MCP accept `alphaModelId`
- but that id must already exist in the process-local Alpha registry

The current production deployment path is:

- generate or retrain a candidate
- gate it
- run `pnpm alpha:promote`
- archive the blessed candidate and gate summary under `archive/alpha/promotions/`
- rewrite `packages/ai/src/alpha/default-alpha-model-override.ts`
- rebuild so new runtime processes load the promoted weights as `alpha-default-v1`

This is still not a full arbitrary-model loader for UI users, but it is a real runtime deployment path.

## Determinism and Safety Properties

The current Alpha stack is trying to preserve a few core guarantees:

- command legality is still enforced by the real engine command processor
- Alpha simulations use the same command processor as live play
- queued macro-action continuations are invalidated when the state no longer matches
- headless can emit replay artifacts and verify replay determinism
- Alpha distill and self-play write replay artifacts alongside training rows so failures can be inspected later

The Alpha search stack also tries to be deterministic for a fixed state plus config plus seed on the same runtime/backend. That said, Alpha now depends on TensorFlow.js rather than only integer-ish NNUE inference, so practical determinism is somewhat more backend-sensitive than the current Engine evaluator path.

## Current Strengths

- Full Alpha runtime integrated across UI, headless, MCP, and tooling
- Dedicated UI worker path for Alpha so search does not block the main thread
- Shared legal macro-action and command-simulation path with the rest of the game
- Much richer state and action representation than the current fixed-summary NNUE evaluator
- Real transformer policy/value inference in TypeScript with TensorFlow.js
- PUCT/MCTS with explicit chance handling and root reuse
- Optional shadow Alpha diagnostics on non-Alpha live seats
- Real `alpha:distill`, `alpha:selfplay`, `alpha:train`, `alpha:gate`, `alpha:promote`, and `alpha:inspect` commands
- Candidate-file self-play support without forcing promotion first
- Archive-backed default-model promotion under `archive/alpha/promotions/`
- Replay-import distill path for existing Engine self-play artifacts

## Current Limitations

- Alpha is still limited by the shared macro-action generator. If a choice is not in that surface, Alpha cannot search it.
- The runtime command surface supports psychic commands, but the current shared macro-action generator still does not search psychic decisions, so Alpha does not yet choose them.
- The current default Alpha model is real and promoted, but the tracked promotion metadata shows it was not a clean passed gate.
- The runtime default depends on the tracked promoted override. There is no separate built-in heuristic Alpha fallback model if the override is missing.
- The current trainer is real but still basic compared with mature transformer training stacks:
  - no validation split
  - no early stopping
  - no checkpoint selection
- Current runtime search uses no Dirichlet root noise, including self-play.
- Runtime UI model selection is still id-based and currently hardcodes the default Alpha id rather than loading arbitrary model files.
- Alpha gameplay still uses tactical deployment logic rather than a separate Alpha deployment planner.
- Search is still intentionally breadth-limited by token caps, action caps, and simulation budgets.

## Possible Improvements to Implement

### Trainer / model improvements

- Add validation splitting, checkpoint selection, and early stopping to `alpha:train`.
- Track richer training metrics across distill-only, self-play-only, and mixed datasets.
- Add more explicit challenger/champion training loops and curriculum weighting.
- Compare candidate quality before and after serialization/reload, not just after training.

### Search improvements

- Add real self-play exploration noise instead of leaving `dirichletEpsilon` at `0`.
- Improve root-time management so Alpha spends more simulations on tactically sharp positions and fewer on obvious or procedural states.
- Improve the reaction and chance-node policy surface.
- Add stronger policy/value calibration against actual match outcomes.

### Action-surface improvements

- Extend the shared macro-action generator so Alpha can search psychic decisions, not just encode them.
- Widen or specialize the action cap when the legal surface is tactically crowded.
- Add more explicit action features for transport delivery, challenge states, and aftermath paths.

### Product and deployment improvements

- Add runtime loading/registration of external Alpha model files.
- Add UI model selection rather than hardcoding `alpha-default-v1`.
- Add archive-management commands such as promoted-model `list`, `restore`, and challenger-vs-champion benchmark helpers.
- Split Alpha deployment planning from Alpha turn planning if deployment quality becomes a bottleneck.

## Alpha Improvement Summary Since Inception

- Strategy surface
  - Added `Alpha` as a fourth selectable AI tier without removing `Basic`, `Tactical`, or `Engine`.
  - Wired Alpha through UI, headless, MCP, and the shared AI controller.
- Runtime
  - Added `AlphaStrategy`, a dedicated worker path, shadow Alpha diagnostics, and shared queued-plan integration.
  - Added a transformer-based policy/value model running in TypeScript with TensorFlow.js.
- Search
  - Added PUCT/MCTS, sampled chance handling, root reuse, and batched leaf inference over the shared macro-action surface.
- Encoding
  - Added entity-style state tokens, action embeddings, deterministic manifest sorting/truncation rules, and auxiliary value targets.
- Tooling
  - Added Alpha-only distill, self-play, training, gate, inspect, and promotion commands.
  - Added candidate-file self-play and replay-import distill support.
  - Added a separate Alpha-side teacher search path for fresh distill reruns so Alpha distill stays isolated from the regular Engine search file.
- Deployment
  - Added archive-backed promotion of the live default Alpha model through `alpha:promote`.

## Closing Summary

The current Alpha stack is real and end to end:

- it searches
- it evaluates with a transformer policy/value model
- it runs in UI, headless, and MCP
- it has distill, self-play, training, gating, inspect, and promotion tooling

What it does not yet have is mature strength or mature operational polish. The current system is best understood as a functional first Alpha platform with a real runtime and tooling stack, not yet a fully tuned competitive AlphaZero-class implementation.
