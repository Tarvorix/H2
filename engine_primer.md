# Engine Primer

## Purpose

This document describes the current `Engine` AI tier as it exists in the codebase today. It is not a future design note. It is a primer on the shipped architecture, runtime flow, search behavior, evaluation model, training pipeline, deployment path, and the most practical next improvements.

In project terms:

- `Basic` is the simple baseline AI.
- `Tactical` is the current heuristic AI.
- `Engine` is the search plus NNUE tier.

`Engine` is the closest thing this project currently has to a "Stockfish-style" AI tier, but it is still early-stage and materially weaker than a mature engine.

## High-Level Architecture

The current Engine stack is split across a few concrete runtime surfaces:

- `packages/ai`
  - `src/ai-controller.ts`
    - main synchronous entry point for `generateNextCommand(...)`
    - owns turn-context lifecycle, queued-plan invalidation, and strategy dispatch
  - `src/strategy/engine-strategy.ts`
    - Engine-specific strategy wrapper
    - runs phase-control helpers first, then calls `searchBestAction(...)`
  - `src/engine/search.ts`
    - deterministic macro-action search runtime
  - `src/engine/candidate-generator.ts`
    - movement, shooting, reaction, assault, and phase-control macro-action generation
  - `src/engine/feature-extractor.ts`
    - emits the gameplay evaluator feature vector
  - `src/engine/tactical-signals.ts`
    - computes higher-level threat, exposure, holder, retaliation, and anti-vehicle signals shared by evaluation and action ordering
  - `src/engine/evaluator.ts`
    - quantized gameplay NNUE runtime
  - `src/engine/model-registry.ts`
    - validates, registers, and resolves gameplay and roster models
- `packages/ui`
  - `src/game/hooks/useAITurn.ts`
    - in-game AI loop
    - sends `Engine` work to a dedicated worker instead of running search on the main thread
  - `src/game/hooks/engine-ai.worker.ts`
    - worker-side bridge that calls `generateNextCommand(...)`
  - `src/game/screens/ArmyLoadScreen.tsx`
    - exposes `Engine` in the UI and maps the `Normal` and `Turbo` presets to `500ms` and `1000ms`
- `packages/headless`
  - `src/session.ts`
    - `HeadlessMatchSession`
    - persistent match host that can run `Engine`, `Tactical`, or human/agent players
  - `src/index.ts`
    - one-shot `runHeadlessMatch(...)` entry used by tooling and tests
  - curated/generated army-list setup and replay helpers live here as well
- `packages/mcp-server`
  - `src/register-tools.ts`
    - Zod schema surface for remote match creation, AI advancement, and Engine config fields
- `tools/nnue`
  - `common.mjs`
    - shared setup/defaults, model load/save helpers, headless instrumentation, and gate helpers
  - `self-play.mjs`
    - Engine-vs-Engine corpus generation
  - `train-gameplay-model.mjs`
    - supervised gameplay-model fitting and quantized model export
  - `gate-gameplay-model.mjs`
    - Engine-vs-Tactical benchmark runner

The runtime engine is command-based from end to end. Search does not directly mutate the game. It proposes macro-actions, simulates them through the real command processor, and returns one legal `GameCommand` at a time to the caller.

## Outer Runtime Architecture

The important architectural point is that `Engine` is not a standalone subsystem used only by tooling. The same core path is reused everywhere:

1. UI worker or headless session decides an AI player should act.
2. `generateNextCommand(...)` in `packages/ai` resolves the configured tier.
3. `EngineStrategy` calls the search stack.
4. Search generates macro-actions and simulates them through the real engine command processor.
5. One legal command is emitted.
6. If the macro-action had follow-up commands, they are stored in the shared queued plan and only replayed if the state fingerprint still matches.

That same path is used by:

- the browser worker path
- one-shot headless matches
- persistent `HeadlessMatchSession`
- MCP `advance_ai_decision`
- self-play corpus generation
- gameplay gating

This reuse is one of the strongest parts of the current implementation. It means most Engine bugs, determinism issues, and legality issues can be reproduced in headless runs and then fixed at the shared core.

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
- a scored emergency root baseline so timeout can still return an evaluated move
- deterministic rollout sampling for stochastic commands
- best-completed-depth fallback when deeper search expires

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

The current budget behavior is stricter than the earlier implementation:

- search now reserves a safety margin inside the requested budget instead of spending right up to the raw deadline
- timeout checks exist inside root iteration, rollout loops, recursive search, and multi-command action transitions
- if deeper search cannot complete, the engine falls back to a scored emergency root pass instead of blindly returning the first generated root action

That means the current engine should not hit the old "depth 0 because we timed out before finishing a real scored pass" failure mode during normal budgeted search.

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

- Movement candidates are no longer just "top N destinations by one generic score." They are diversified into tactically distinct lanes: `objective`, `fire`, `safety`, `pressure`, `center`, and fallback best-score destinations. The objective lane is now heavily driven by projected scoring swing, held-VP protection, and reachable objective value rather than only generic distance pressure.
- Shooting candidates are no longer pruned only by coarse target heuristics. The generator now widens the coarse target pool, selects actual weapons, estimates expected damage from those weapon assignments, and then boosts warlord, objective-holder, scorer, retaliation-cut, and direct objective-swing targets before final pruning.
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

The current gameplay feature extractor emits 50 bounded features and is currently versioned as gameplay feature schema `v4`.

The feature order is explicit and versioned. This is the current extractor order:

1. Alive model differential
   - `(friendly alive models - enemy alive models) / total alive models`
2. Alive wound differential
   - `(friendly alive wounds - enemy alive wounds) / total alive wounds`
3. Alive unit differential
   - `(friendly alive units - enemy alive units) / total alive units`
4. Victory-point differential
   - `(friendly VP - enemy VP) / 10`
5. Controlled-objective count differential
   - actual objectives controlled under the real mission control query
6. Contested-objective count differential
   - actual objectives contested under the real mission control query
7. Controlled-objective VP differential
   - current VP value of objectives each side actually controls
8. Contested-objective VP differential
   - current VP value tied up in contested objectives
9. Objective tactical-strength differential
   - actual objective-control strength across all active objectives
10. Objective control-margin differential
   - aggregate friendly-vs-enemy control margin on objectives
11. Durable-held-VP differential
   - VP currently held on objectives that are not under immediate flip pressure
12. Threatened-held-VP advantage
   - `(enemy threatened held VP - friendly threatened held VP)`
13. Flippable-enemy-VP differential
   - VP currently under realistic near-term flip pressure in your favor
14. Reachable-objective-VP differential
   - VP on neutral/enemy objectives that friendly units can plausibly reach next turn
15. Projected scoring-swing differential
   - `flippable enemy VP + reachable VP - threatened held VP`
16. Scoring-unit count differential
   - count of units judged useful for objective play
17. Scoring-unit value differential
   - strategic value of likely scorers, weighted by their scoring profile
18. Ready-scoring-unit value differential
   - scorer value that can still move/act meaningfully
19. Warlord-alive differential
   - `friendly alive warlords - enemy alive warlords`
20. Reaction-allotment differential
   - `(friendly reaction allotment remaining - enemy allotment remaining) / total reaction allotment`
21. Reaction-ready-unit differential
   - `(friendly units able to react - enemy units able to react) / total alive units`
22. Reserve deployment advantage
   - `(enemy reserves - friendly reserves) / total units`
23. Pinned-status advantage
   - `(enemy pinned - friendly pinned) / total units`
24. Suppressed-status advantage
   - `(enemy suppressed - friendly suppressed) / total units`
25. Stunned-status advantage
   - `(enemy stunned - friendly stunned) / total units`
26. Routed-status advantage
   - `(enemy routed - friendly routed) / total units`
27. Locked-in-combat advantage
   - `(enemy locked units - friendly locked units) / total units`
28. Embarked-unit differential
   - `(friendly embarked units - enemy embarked units) / total units`
29. Vehicle-count differential
   - `(friendly vehicles - enemy vehicles) / total vehicles`
30. Vehicle-wound differential
   - `(friendly vehicle wounds - enemy vehicle wounds) / total vehicle wounds`
31. Threat-projection differential
   - broad closeness-to-enemy pressure estimate
32. Charge-range differential
   - `(friendly units with an enemy within 12" - enemy units with a friendly within 12") / total alive units`
33. Best ranged pressure into enemy objective holders
   - top ranged kill pressure specifically against current holders
34. Best melee pressure into enemy objective holders
   - top melee kill pressure specifically against current holders
35. Best ranged pressure into enemy scorers
   - top ranged pressure against likely scoring units, not just current holders
36. Best melee pressure into enemy scorers
   - top melee pressure against likely scoring units, not just current holders
37. Best ranged pressure into enemy high-value targets
   - differential from `summarizeTacticalBalance(...)`
38. Best melee pressure into enemy high-value targets
   - differential from `summarizeTacticalBalance(...)`
39. Objective-holder durability differential
   - value of holders adjusted down by incoming exposure
40. Objective-holder exposure advantage
   - `(enemy exposed holder value - friendly exposed holder value)`
41. Scoring-unit exposure advantage
   - `(enemy exposed scorer value - friendly exposed scorer value)`
42. High-value-target exposure advantage
   - `(enemy exposed high-value value - friendly exposed high-value value)`
43. Retaliation-pressure advantage
   - `(enemy retaliation pressure - friendly retaliation pressure)`
44. Warlord-exposure advantage
   - `(enemy warlord exposure value - friendly warlord exposure value)`
45. Transport-payload exposure advantage
   - `(enemy transport payload exposure - friendly transport payload exposure)`
46. Transport-delivery differential
   - value of embarked payloads adjusted by likely objective delivery distance and safety
47. Anti-vehicle ranged-pressure differential
   - best ranged kill pressure into vehicle targets
48. Anti-vehicle melee-pressure differential
   - best melee kill pressure into vehicle targets
49. Decision-owner flag
   - `+1` if the extractor player currently owns the decision, otherwise `-1`
50. Battle-progress
   - normalized current battle turn mapped into `[-1, 1]`

The tactical-summary portion comes from `summarizeTacticalBalance(...)` in `tactical-signals.ts`, which in turn is built from concrete unit-level estimators:

- `estimateUnitStrategicValue(...)`
- `estimateUnitRangedDamagePotential(...)`
- `estimateUnitMeleeDamagePotential(...)`
- `estimateUnitExposureBreakdown(...)`
- `estimateProjectedOutgoingPressure(...)`
- `estimateProjectedObjectiveValue(...)`

So the evaluator is still a compact board-summary model, but it is no longer limited to raw model counts and VP totals. It now explicitly tries to encode who matters, what can threaten whom, which VP is actually controlled, what held VP is at risk, what enemy VP is flippable, which scorers are exposed, and what retaliation is likely next.

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

The concrete flow is:

1. `useAITurn.ts` notices the AI should act.
2. If the tier is `Engine`, it posts the full `GameState`, `AIPlayerConfig`, and `AITurnContext` to `engine-ai.worker.ts`.
3. The worker calls `generateNextCommand(...)`.
4. The worker returns the chosen command, updated context, diagnostics, and any error.
5. The hook dispatches the returned command back into the UI reducer.

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

`HeadlessMatchSession` is the main persistent host abstraction. It owns:

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

Headless is also what powers self-play, replay artifacts, deterministic verification, curated setup usage, and generated-roster setup.

### MCP runtime

The MCP server exposes match/session creation and AI advancement on top of the headless session layer. Engine-specific configuration fields are part of the schema, so Engine matches can be created and advanced externally while still using the same core AI code.

The exposed player schema already includes the Engine-specific fields:

- `strategyTier`
- `timeBudgetMs`
- `nnueModelId`
- `baseSeed`
- `rolloutCount`
- `maxDepthSoft`
- `diagnosticsEnabled`

So MCP is not a parallel AI implementation. It is a transport and schema layer over the same headless + AI runtime.

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

The current default self-play flow is:

1. Build a curated 2000-point matchup through `createDefaultSetupOptions(...)`.
2. Create Engine configs for both players with the requested time budget and model id.
3. Run the match through the shared headless instrumentation path.
4. Emit replay artifacts plus JSONL samples.
5. Write a manifest recording match outcomes, sample count, and shard paths.

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

The trainer now defaults to an outcome-heavier target blend:

- `0.9 * finalOutcome`
- `0.1 * searchValue`

Those weights are configurable at the CLI, but the default no longer leans as hard on weak self-search labels.

The current trainer also records richer metadata alongside the serialized model, including training sample count, validation sample count, epochs requested, epochs completed, best epoch, whether early stopping fired, and the normalized target-weight split used for that run.

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

By default, the gameplay gate now uses mirrored curated matchup pairs. So a pairing is benchmarked as:

- `army A vs army B`
- then `army B vs army A`

before the gate advances to the next curated pairing. This reduces the chance that player-slot bias or an intrinsically stronger curated army slot skews a short benchmark.

One important nuance: self-play and gate both use the same Engine runtime on the Engine side, but they are testing different opponents:

- self-play: `Engine` vs `Engine`
- gate: candidate `Engine` vs `Tactical`

So a candidate can fit self-play labels better while still benchmarking worse against `Tactical`.

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
- Hardened timeout behavior with a scored emergency root fallback
- Macro-action support for more than trivial one-command decisions
- Off-main-thread UI execution for Engine via web worker
- Clean replay artifacts and self-play data generation
- Versioned, checksummed model format
- Curated 2000-point default training surface
- Mirrored default gameplay gate pairings for fairer short benchmarks

## Current Limitations

- The gameplay evaluator is richer than before, but 50 summary features is still a compact representation for a full tabletop battle state.
- The trainer now has validation splitting and early stopping, but it is still a lightweight weight-fitting loop over a fixed feature basis.
- The built-in default gameplay model is still a lightweight baseline.
- Search breadth is still intentionally narrow because of budget constraints, even after the recent candidate-generation improvements.
- Phase-specific candidate generation is better than the earlier baseline, but it is still heuristic and selective rather than exhaustive.
- Runtime model deployment still depends on model ids already being registered; there is no finished user-facing model loader in the UI.
- Engine gameplay uses tactical deployment logic rather than a separate engine deployment planner.

## Possible Improvements to Implement

### Trainer / evaluator improvements

- Expand beyond the current tactical-summary board encoding.
  - Add role-cluster features so the evaluator understands not just value/exposure, but what kind of unit is exposed.
  - Add stronger transport payload and embarked-assault quality features.
  - Add better phase-sensitive features for shooting states, assault states, and challenge/aftermath transitions.
- Improve the training target.
  - Test whether pure-outcome training beats the current outcome-heavy blend.
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

## Engine Improvement Summary Since Inception

- Strategy surface
  - Added `Engine` as a third AI tier without removing or changing `Basic` / `Tactical`.
  - Wired Engine through UI, headless, and MCP.
- Search core
  - Added deterministic iterative-deepening search with alpha-beta, TT, killer/history heuristics, aspiration windows, and queued macro-action continuation.
  - Added legality hardening so self-play no longer tolerates silent command-rejected move candidates.
  - Added scored emergency-root fallback and tighter budget checks so timeout does not devolve into an unscored first-action return.
- Macro-action quality
  - Expanded Engine action generation across movement, shooting, reactions, charges, challenges, gambits, fights, aftermath, and phase control.
  - Improved movement with diversified lanes and full-formation legality filtering.
  - Improved shooting pruning with damage-aware ordering and special-shot placement handling.
- Evaluation
  - Started from a very small board-summary evaluator.
  - Expanded first to a richer aggregate feature set, then to the current objective-first tactical-summary evaluator that models controlled VP, threatened held VP, flippable enemy VP, scorer value, exposure, retaliation, payload risk, and anti-vehicle pressure.
- Training pipeline
  - Added deterministic self-play, candidate serialization, validation split, early stopping, progress reporting, and benchmark gating.
  - Moved the default gameplay training surface from tiny toy setups to curated 2000-point rosters.
  - Tightened the trainer target to rely more on real outcomes than on weak search labels.
  - Changed default gameplay gating to mirrored curated matchup pairs so short benchmark runs are less sensitive to army-slot skew.
- Data and legality
  - Fixed generated-roster legality problems, including allegiance mismatches and transport assignment correctness.
  - Added curated 2000-point rosters for the currently supported factions so training and benchmarking run on realistic army surfaces.
- Determinism and observability
  - Added replay artifacts, deterministic verification, diagnostics, and better benchmark logging so engine work can be audited instead of guessed at.

## Closing Summary

The current Engine is real and end to end:

- it searches
- it evaluates with a quantized gameplay NNUE model
- it runs in UI, headless, and MCP
- it has a self-play, training, and gating pipeline

What it does not yet have is mature strength. The current system is best understood as a functional first engine platform with a real architecture and tooling stack, not yet a fully tuned competitive engine.
