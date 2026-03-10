# Engine Primer

## Purpose

This document describes the current `Engine` AI tier as it exists in the codebase today. It is not a future design note. It is a primer on the shipped architecture, runtime flow, search behavior, evaluation model, training pipeline, deployment path, and the most practical next improvements.

In project terms:

- `Basic` is the simple baseline AI.
- `Tactical` is the current heuristic AI.
- `Engine` is the search plus NNUE tier.

`Engine` is the closest thing this project currently has to a "Stockfish-style" AI tier, but it is still early-stage and materially weaker than a mature engine.

## High-Level Architecture

The current Engine stack is split across a few layers:

- `packages/ai`
  - Owns AI types, controller flow, the `EngineStrategy`, macro-action generation, search, feature extraction, evaluator runtime, model registry, and model serialization.
- `packages/ui`
  - Owns the in-game AI loop and the dedicated worker path used when `Engine` is selected.
- `packages/headless`
  - Owns headless match execution, replay generation, session hosting, generated/curated roster setup, and CLI integration.
- `packages/mcp-server`
  - Exposes AI configuration and match/session control over MCP.
- `tools/nnue`
  - Owns self-play, training, gating, model load/save helpers, and progress reporting.

The runtime engine is command-based from end to end. Search does not directly mutate the game. It proposes macro-actions, simulates them through the real command processor, and returns one legal `GameCommand` at a time to the caller.

## What the Engine Tier Is

The `Engine` tier is declared in the AI type system as the third strategy tier after `Basic` and `Tactical`.

At runtime:

1. The caller provides an `AIPlayerConfig`.
2. The AI controller resolves the requested tier.
3. `Engine` maps to `EngineStrategy`.
4. `EngineStrategy` delegates turn decisions to `searchBestAction(...)`.
5. Search evaluates positions with the gameplay NNUE evaluator.

This tier is additive. `Basic` and `Tactical` still exist and remain usable across UI, headless, and MCP.

## Runtime Decision Flow

### 1. Configuration

The Engine tier uses the normal AI config shape plus Engine-specific knobs:

- `timeBudgetMs`
- `nnueModelId`
- `baseSeed`
- `rolloutCount`
- `maxDepthSoft`
- `diagnosticsEnabled`

These are stored in `AIPlayerConfig` and flow through UI, headless, and MCP.

### 2. AI controller

`generateNextCommand(...)` in the AI controller is the main runtime entry point.

Its job is to:

- decide whether the AI should act
- reset or invalidate the turn context when state ownership changes
- emit queued follow-up commands if search already planned a multi-step macro-action
- otherwise create the configured strategy and ask it for the next command

The controller also stores:

- latest diagnostics
- latest error
- latest state fingerprint
- queued follow-up commands
- last engine score

### 3. Engine strategy

`EngineStrategy` does three things:

- tries phase-control helpers first for obvious phase/sub-phase housekeeping
- calls `searchBestAction(...)`
- stores diagnostics and queued follow-up commands back into the shared turn context

If the chosen macro-action contains multiple commands, the strategy only emits the first one immediately. The rest are stored as a queued plan and consumed on later calls if the game state still matches the expected fingerprint.

### 4. Queued plans and invalidation

The queued-plan system exists because the public AI API still emits one `GameCommand` per call, while search chooses at the macro-action level.

The queued plan is invalidated when:

- phase changes
- sub-phase changes
- decision owner changes
- state fingerprint no longer matches
- the last emitted command was rejected

This prevents search from blindly continuing a stale multi-step plan after the engine state has diverged.

## Search Model

### Search unit of choice

The Engine searches over `MacroAction` objects, not raw commands.

A macro-action contains:

- an `id`
- a display `label`
- one or more `commands`
- an `orderingScore`
- `actorIds`
- free-form `reasons`

This is important because many meaningful game decisions are multi-step:

- declare shooting, then continue casualty resolution
- challenge/gambit sequences
- aftermath choices
- reactions
- phase-end actions

### Search algorithm

The current implementation is a deterministic, depth-limited search with:

- iterative deepening
- alpha-beta style maximizing/minimizing node search
- aspiration windows
- a transposition table
- killer move tracking
- history heuristic ordering
- cheap root pre-ordering from transitioned states plus static evaluation
- deterministic rollout sampling for stochastic commands
- best-completed-depth fallback when time expires

The current default configuration is budget-aware:

- `timeBudgetMs <= 600`
  - `maxDepthSoft = 3`
  - `maxRootActions = 20`
  - `maxActionsPerUnit = 4`
- above that
  - `maxDepthSoft = 4`
  - `maxRootActions = 24`
  - `maxActionsPerUnit = 5`

Search is not "full-tree exhaustive." It is a selective search bounded by time, root breadth, per-unit action breadth, and depth.

### Deterministic rollouts

The search uses `SeededDiceProvider`, which hashes a seed bundle into a reproducible RNG state. The current seed bundle includes:

- `baseSeed`
- the state fingerprint before the command
- the macro-action id
- rollout sample index
- command index within the macro-action

That means the same state plus config plus model plus seed will replay the same sampled dice path inside search.

### Auto-advance behavior

Search only treats real player decisions as search nodes.

If the state is in a procedural step with no meaningful choice, search can automatically advance by simulating `endSubPhase` or `endPhase` commands up to a configured limit. This keeps search focused on actual decisions instead of wasting depth on mandatory bookkeeping.

## Macro-Action Surface

The current macro-action generator covers the following surfaces:

- Movement
  - reserves tests
  - reserve deployment
  - diversified normal movement candidates
  - rush
- Shooting
  - declare shooting
  - blast placements
  - template placements
  - directed target-model selection
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

Every generated action is filtered against the current `getValidCommands(state)` result so the engine is not considering command types that are illegal for the current phase/sub-phase.

The generator is more selective and more structured than the earlier baseline:

- Movement candidates are no longer just "top N destinations by one generic score." They are diversified into tactically distinct lanes: `objective`, `fire`, `safety`, `pressure`, `center`, and fallback best-score destinations.
- Shooting candidates are no longer pruned only by coarse target heuristics. The generator now widens the coarse target pool, selects actual weapons, estimates expected damage from those weapon assignments, and then boosts warlord, objective-holder, and kill-pressure targets before final pruning.
- Reaction generation still does not invent alternate reaction types, because `reactionType` is already fixed by engine state. Instead, it now scores eligible reacting units and decline options within that fixed reaction-type surface.

The earlier movement-legality fix is still critical: movement generation uses `canUnitMove()` before constructing move actions, which prevents search from generating `moveUnit` for combat-locked, pinned, embarked, undeployed, or otherwise non-movable units.

## Evaluation Model

### What "NNUE" means here

The current gameplay evaluator is a compact quantized two-layer network:

- hidden layer with ReLU activation
- output layer with identity activation
- quantized integer weights and biases
- floating-point feature input

The evaluator resolves a gameplay model by `modelId`, extracts gameplay features for the acting player, runs the quantized layers, and returns a scalar score.

### Current gameplay features

The current gameplay feature extractor emits 25 bounded features and is currently versioned as gameplay feature schema `v2`.

The feature vector currently includes:

1. alive model differential
2. alive wound differential
3. alive unit differential
4. VP differential
5. objective-control differential
6. objective-contest differential
7. objective-pressure differential
8. center-presence differential
9. threat-projection differential
10. reserve differential
11. pinned differential
12. suppressed differential
13. stunned differential
14. routed differential
15. locked-in-combat differential
16. embarked-unit differential
17. vehicle-count differential
18. vehicle-wound differential
19. reaction-allotment differential
20. reaction-ready-unit differential
21. warlord-alive differential
22. units within 12" of an enemy differential
23. units within 24" of an enemy differential
24. decision owner
25. battle progress

This is still a compact board-summary evaluator, not a full piece-square-style board encoding, but it is materially richer than the original 10-feature baseline and now captures more of transport state, reactions, warlord risk, near-term engagement pressure, and objective posture.

### Model registry and default model

The model registry is process-local and currently seeded with built-in defaults:

- `gameplay-default-v1`
- `roster-default-v1`

Each model has a manifest with:

- `modelId`
- `modelKind`
- `schemaVersion`
- `featureVersion`
- `weightsChecksum`

The registry validates:

- model kind
- schema version
- feature version
- expected input size
- payload length
- checksum

If a requested model id is missing or incompatible, evaluation fails closed with an error rather than silently falling back to a heuristic model.

One practical consequence of the current schema versioning is that old gameplay self-play shards and old trained gameplay candidates are not automatically reusable after a feature-schema bump. When the gameplay feature dimension changes, self-play data needs to be regenerated and new candidates need to be trained against the current extractor version.

### Model serialization

Serialized model files are plain JSON and contain:

- `manifest`
- `inputSize`
- `hiddenLayer`
- `outputLayer`
- optional metadata added by tooling

This is the format written by training and loaded by gate scripts. It is the deployable model artifact format.

### Current default model behavior

The current built-in default gameplay model is still simple. It is a hand-built baseline registered under `gameplay-default-v1`.

Trained candidate models can outperform or underperform it, but today the in-game UI still points Engine selection at the built-in default gameplay model id unless runtime registration is changed.

## UI, Headless, and MCP Surfaces

### UI runtime

In the UI:

- `Basic` and `Tactical` can run inline in the hook path.
- `Engine` is sent through a dedicated web worker so search does not block the main thread.

When `Engine` is selected in the setup screens, the UI currently sends:

- `timeBudgetMs`
- `nnueModelId`
- `baseSeed`
- `rolloutCount`
- `maxDepthSoft`
- `diagnosticsEnabled`

The current in-game presets expose:

- `Normal`: 500 ms
- `Turbo`: 1000 ms

The UI currently uses `DEFAULT_GAMEPLAY_NNUE_MODEL_ID` when Engine is selected.

One important implementation detail: Engine still uses tactical deployment logic for pre-game placement. Gameplay decisions use the search plus NNUE path; deployment does not yet have a separate engine searcher.

### Headless runtime

Headless supports Engine in two ways:

- one-shot match execution with `runHeadlessMatch(...)`
- persistent match hosting with `HeadlessMatchSession`

Both headless surfaces understand:

- tier selection
- time budget
- model id
- base seed
- rollout count
- soft depth
- diagnostics

Headless is also what powers self-play, replay artifacts, deterministic verification, curated setup usage, and generated-roster setup.

### MCP runtime

The MCP server exposes match/session creation and AI advancement on top of the headless session layer. Engine-specific configuration fields are part of the schema, so Engine matches can be created and advanced externally while still using the same core AI code.

## Training and Benchmarking Pipeline

### Self-play

`tools/nnue/self-play.mjs` runs Engine-vs-Engine matches and records:

- replay artifacts
- per-decision feature snapshots
- search values
- selected command types
- selected macro-action ids/labels
- principal variations
- final outcome labels

By default, self-play now uses the curated 2000-point army-list registry, not the old tiny mirror setup.

### Training

`tools/nnue/train-gameplay-model.mjs` currently performs a lightweight supervised fit over the fixed gameplay feature basis:

- read JSONL samples
- validate that the sample feature dimension matches the current gameplay schema
- initialize from prior feature weights
- deterministically shuffle samples
- split them into training and validation subsets
- fit weights and bias across epochs
- track training MAE and validation MAE
- keep the best validation checkpoint
- stop early if validation improvement stalls past the configured patience window
- build a quantized paired gameplay model
- write `candidate.json`
- write `candidate.json.metrics.json`

The current trainer also records richer metadata alongside the serialized model, including training sample count, validation sample count, epochs requested, epochs completed, best epoch, and whether early stopping fired.

This trainer is effective enough to prove the pipeline works and is now less blind than the original single-stream fit, but it is still not a sophisticated NNUE training stack.

In practical terms, the current trainer is closer to "learn better weights over a small fixed feature basis" than "train a rich chess-engine-scale evaluator."

### Gating

`tools/nnue/gate-gameplay-model.mjs` loads a serialized model file, registers it into the tool process, and runs Engine-vs-Tactical benchmark matches.

The gate reports:

- wins
- losses
- draws
- aborted runs
- timeouts
- win rate
- per-match termination details

This is the main mechanism currently used to judge whether a trained candidate is stronger than the heuristic baseline.

## Deployment Path Today

There are two different meanings of "deploy" in the current project:

### Tooling deployment

The tooling can load a serialized model JSON directly. The gate path does this today by deserializing the file and registering it into the model registry for that process.

### Runtime deployment

The actual game surfaces do not yet hot-load arbitrary gameplay model files at runtime.

Today:

- the UI points Engine selection at `gameplay-default-v1`
- headless and MCP accept `nnueModelId`
- but that model id must already exist in the process-local registry

So the current production deployment path is still effectively a promotion step:

- generate a candidate
- gate it
- bless it
- then make it available to the runtime registry and/or replace the built-in default model

This means the training pipeline exists, but the runtime model-loading product story is not fully finished yet.

## Determinism and Safety Properties

The current engine stack is trying to preserve a few core guarantees:

- command legality is still enforced by the real engine command processor
- search simulations use the same command processor as live play
- search rollouts are deterministic for a fixed state plus seed plus config
- queued macro-action continuations are invalidated when the state no longer matches
- headless can emit replay artifacts and verify replay determinism

This is a strong foundation. It is one of the most valuable things already present in the current implementation.

## Current Strengths

- Single AI stack shared across UI, headless, MCP, and tooling
- Real search plus real engine command simulation
- Deterministic seeded search rollouts
- Macro-action support for more than trivial one-command decisions
- Off-main-thread UI execution for Engine via web worker
- Clean replay artifacts and self-play data generation
- Versioned, checksummed model format
- Curated 2000-point default training surface

## Current Limitations

- The gameplay evaluator is richer than before, but 25 summary features is still a very small representation for a full tabletop battle state.
- The trainer now has validation splitting and early stopping, but it is still a lightweight weight-fitting loop over a fixed feature basis.
- The built-in default gameplay model is still a lightweight baseline.
- Search breadth is still intentionally narrow because of budget constraints, even after the recent candidate-generation improvements.
- Phase-specific candidate generation is better than the earlier baseline, but it is still heuristic and selective rather than exhaustive.
- Runtime model deployment still depends on model ids already being registered; there is no finished user-facing model loader in the UI.
- Engine gameplay uses tactical deployment logic rather than a separate engine deployment planner.

## Possible Improvements to Implement

### Trainer / evaluator improvements

- Expand the gameplay feature set beyond the current 25 summary features.
  - Add transport occupancy depth and passenger quality, not just embarked/vehicle differentials.
  - Add unit-role and threat composition features.
  - Add damage projection and expected retaliation features.
  - Add objective holding strength rather than only presence/contest pressure.
  - Add leader, warlord, and scoring-unit exposure.
- Improve the training target.
  - Test different blends of search value and final outcome.
  - Try phase-aware or discounted outcome targets.
- Improve the optimizer loop.
  - Add mini-batching.
  - Compare candidate metrics before quantization and after quantization.
  - Add stronger reporting around generalization across curated matchup families.
- Make the evaluator richer.
  - Learn more than the current output-weight style fit.
  - Consider a larger hidden representation while preserving the quantized runtime format.
- Bootstrap training rounds.
  - Use the best promoted candidate as the self-play model for the next training batch instead of always generating from the weakest baseline.

### Search improvements

- Make movement diversification more phase-aware.
  - Distinguish ranged-anchor, assault-staging, fallback, and objective-flip lanes by unit role instead of using one shared lane set for every unit.
  - Add formation-preservation and transport rendezvous concepts to movement candidate generation.
- Make shooting pre-scores more faithful.
  - Use richer damage estimation that accounts for target profile mix, AP/save pressure, and multi-wound kill breakpoints.
  - Add better blast/template target-shape heuristics before full simulation.
- Improve reaction search inside the current fixed-type command surface.
  - Better unit-selection scoring for `Reposition`, `Return Fire`, and `Overwatch`.
  - Better decline heuristics when reacting would expose a unit or waste a scarce advanced reaction.
- Improve ordering.
  - TT-first ordering.
  - Better evaluator-assisted pre-sort.
  - More informative action ordering scores beyond the current cheap root pre-order plus history/killer mix.
- Improve time management.
  - Spend more time in tactically sharp positions.
  - Spend less time on obvious or procedural states.
- Add tactical search extensions.
  - Extend in unstable combat and shooting states instead of stopping too early on static evaluation.
- Continue legality hardening.
  - Treat any self-play abnormal termination as an engine bug and keep closing remaining legality gaps until long runs are boringly clean.

### Product and deployment improvements

- Add runtime loading/registration of external gameplay model files.
- Add UI model selection rather than only hardcoding the default gameplay model id.
- Add a proper promotion workflow for blessed gameplay candidates.
- Add benchmark suites with stable seeds, curated matchup rotations, and tracked historical results.
- Split gameplay deployment AI from gameplay turn AI if deployment quality becomes a bottleneck.

## Closing Summary

The current Engine is real and end to end:

- it searches
- it evaluates with a quantized gameplay NNUE model
- it runs in UI, headless, and MCP
- it has a self-play, training, and gating pipeline

What it does not yet have is mature strength. The current system is best understood as a functional first engine platform with a real architecture and tooling stack, not yet a fully tuned competitive engine.
