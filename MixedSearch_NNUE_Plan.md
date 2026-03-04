## Mixed Search + NNUE Plan for HHv2 AI

### Summary
- Feasibility is high with current architecture because the engine is already command-driven and replay/hash deterministic at fixed dice sequences.
- A pure Stockfish clone is not sufficient for this game because of chance (dice), reactions, and continuous movement; the right fit is mixed search.
- Chosen direction: mixed search core (alpha-beta + stochastic handling) with an NNUE-style incremental evaluator, shared by UI and headless.
- Key integration anchors: `packages/ai/src/ai-controller.ts`, `packages/ui/src/game/hooks/useAITurn.ts`, `packages/engine/src/command-processor.ts`, `packages/headless/src/index.ts`.

### Public API and Interface Changes
- Extend `AIStrategyTier` with `Engine`.
- Extend `AIPlayerConfig` with:
  - `timeBudgetMs`
  - `searchMode: "mixed"`
  - `nnueModelId`
  - `rolloutCount`
  - `maxDepthSoft`
- Add new AI interfaces:
  - `SearchConfig`
  - `SearchResult` (best command, PV, score, nodes, elapsedMs)
  - `Evaluator` (heuristic + nnue implementations)
  - `MacroAction` (decision-level action mapped to one or more engine commands)
- Add headless options:
  - per-player `timeBudgetMs`
  - per-player `nnueModelId`
  - search diagnostics output toggle

### 1) Decision Model and Macro-Action Generator
- Add a decision-node detector from `GameState` to separate tactical choices from auto-flow.
- Introduce macro-action generation for full-turn planning:
  - Movement: unit-level destination templates (not raw per-model Cartesian explosion).
  - Shooting: attacker/target/weapon bundle candidates.
  - Assault: charge target and challenge/aftermath candidates.
  - Reactions: select/decline with eligible unit ranking.
- Convert each macro-action to valid engine command sequence and stop expansion on first invalid command.
- Keep `endSubPhase`/`endPhase` available but deprioritized in ordering unless no tactical action exists.

### 2) Mixed Search Core
- Build iterative deepening search under `@hh/ai` with hard time cutoff (300–800ms budget).
- Use alpha-beta on player decision nodes.
- Use stochastic handling at chance-heavy nodes:
  - Fast expected-value pre-pass for ordering.
  - Rollout sampling on top candidates (`rolloutCount`) with a deterministic seed schedule per root move.
  - Deterministic seed schedule spec:
    - `baseSeed` defaults to `0x1234ABCD` unless provided in config.
    - `rootSeed = (baseSeed + rootMoveIndex) >>> 0`.
    - Example: root move `0` uses `0x1234ABCD`, root move `1` uses `0x1234ABCE`.
    - Per rollout/chance node, derive `nodeSeed = hash32(rootSeed, ply, rolloutIndex, chanceNodeIndex)`.
    - Use a fixed PRNG implementation (`mulberry32`) in both UI worker and headless paths.
- Add transposition table keyed by `hashGameState + sideToAct + pendingReaction fingerprint + depth`.
- Define `pendingReaction fingerprint` to include:
  - `pendingReaction` identity fields (`reactionType`, sorted `eligibleUnitIds`, `triggerSourceUnitId`)
  - both players' `reactionAllotmentRemaining`
  - per-unit `hasReactedThisTurn` flags
  - `advancedReactionsUsed` snapshot
- Add move ordering: TT move, tactical captures/finishing shots, killer/history heuristics, NNUE prior.
- Add fail-soft aspiration windows and fallback to best completed depth on timeout.

### 3) NNUE Evaluator (Shared UI + Headless)
- Implement sparse feature extractor from `GameState` with active-player-relative encoding.
- Feature groups:
  - Unit/material and wound buckets.
  - Objective control potential and current VP pressure.
  - Threat-range/contact buckets.
  - Tactical statuses and reaction economy.
  - Phase/sub-phase tempo and initiative pressure.
- Implement incremental accumulator updates for command deltas where possible, with full recompute fallback for safety.
- Use quantized integer weights (`int16/int32`) and typed-array inference for deterministic parity.
- Provide graceful fallback to current heuristic eval if model missing or incompatible version.

### 4) Self-Play Data and NNUE Training Pipeline
- Add headless self-play data generation producing `(features, teacher_value, outcome, metadata)`.
- Bootstrap teacher value from existing tactical heuristics plus game-outcome blend.
- Train offline NNUE model from self-play datasets; export versioned model artifact used by both UI and headless.
- Add model manifest and compatibility checks (`schemaVersion`, `featureVersion`, `weightsChecksum`).
- Add continuous improvement loop: generate games, train, gate, promote model.

### 5) UI and Headless Integration
- Integrate `Engine` strategy in `generateNextCommand`.
- Add search cancellation token and run search in a UI Worker to avoid blocking render/input.
- Make worker progress updates mandatory:
  - worker posts `searchProgress` every ~50 ms (configurable 50–100 ms).
  - include `elapsedMs`, `depth`, `nodes`, `nps`, `bestScore`, `principalVariation`.
  - UI displays live "thinking" telemetry without blocking input/render.
- Surface diagnostics (optional): depth, nodes, nps, eval, principal variation.
- Keep deployment AI path unchanged initially, then optionally migrate to search later.
- Extend headless CLI to choose `Engine` tier and NNUE model for both players.

### 6) Advanced AI Army List Builder
- Add a dedicated roster-generation pipeline in `@hh/army-builder` that produces legal, high-strength `ArmyList` outputs.

#### 6.1 Core Interfaces
- Add `ArmyBuildRequest`:
  - `faction`, `allegiance`, `pointsLimit`
  - optional `riteOfWar`, `doctrine`
  - optional `playstyle` weights (aggression, durability, mobility, objective focus)
  - optional `opponentProfile` (faction and threat archetype) for counter-list generation
- Add `ArmyBuildCandidate`:
  - `armyList`
  - `score`
  - `constraintPass`
  - `explanation` (top reasons)
  - `diagnostics` (slot coverage, caps usage, role spread)
- Add public APIs:
  - `generateArmyList(request): ArmyBuildCandidate`
  - `generateArmyListCandidates(request, count): ArmyBuildCandidate[]`
  - `generateCounterList(request, opponentCandidates): ArmyBuildCandidate`

#### 6.2 Hard-Constraint Layer (Non-Negotiable)
- Start from detachment templates (`createDetachment`, `findDetachmentTemplate`).
- Fill slots only through role-compatible assignment (`validateUnitAssignmentToSlot`).
- Enforce points and caps continuously (`calculateArmyTotalPoints`, LoW cap, allied cap).
- Apply rite/doctrine restrictions at each expansion step.
- Require final pass through `validateArmyListWithDoctrine` before candidate acceptance.
- Reject any candidate that violates faction scope/profile availability guards.

#### 6.3 Mixed-Search Roster Construction
- Stage A: Skeleton construction
  - Build primary detachment and fill mandatory slots first.
  - Add optional detachments only when unlock conditions are satisfied.
- Stage B: Beam expansion
  - Expand partial rosters with legal unit/profile/model-count/wargear additions.
  - Candidate pool comes from `getProfilesByFactionAndRole`.
  - Keep top `B` partial rosters by intermediate score and legality confidence.
- Stage C: Local optimization
  - Perform swap/mutate passes (replace unit, adjust model count, adjust wargear) under constraints.
  - Accept only improving legal mutations.
- Stage D: Adversarial ranking
  - Evaluate top `K` candidates using headless mixed-search matches against a curated opponent pool.
  - Select maximin candidate (best worst-case matchup), not only average EV.

#### 6.4 NNUE-Driven Roster Evaluation
- Extend evaluator to include roster-level features:
  - role coverage and detachment unlock efficiency
  - anti-infantry/anti-armor/durability balance
  - mobility and objective-control capacity
  - reaction economy potential and command density
  - curve smoothness (avoid brittle all-in lists)
- Use hybrid scoring:
  - fast NNUE + heuristic prior for large search breadth
  - selective headless simulation rollouts for top candidates
- Persist training examples from roster-vs-roster outcomes to continuously improve roster NNUE.

#### 6.5 Integration Targets
- UI:
  - Add `Auto Build` in Army Builder to generate and apply a legal list into current player state.
  - Show rationale panel (why this roster was selected).
- Headless:
  - Add CLI flags for roster generation:
    - `--auto-roster-player0`
    - `--auto-roster-player1`
    - `--auto-roster-playstyle`
    - `--auto-roster-candidates`
  - Emit chosen list plus top alternatives and scores.

#### 6.6 Validation and Safety Gates
- 100% generated rosters must pass `validateArmyListWithDoctrine`.
- Generation must never exceed time budget configured for roster building.
- If no legal candidate is found under constraints, return explicit error (no silent fallback to invalid lists).
- Deterministic mode (seeded) must reproduce identical roster outputs for same request + data snapshot.

### 7) Acceptance Gates
- Correctness gate:
  - 100% command legality from generated macro-actions in regression suite.
  - deterministic replay parity with fixed dice/model/version.
- Determinism gate:
  - identical best move, PV, and final decision score for same `GameState + baseSeed + config`.
  - seed schedule and PRNG outputs match exactly between UI worker and headless runner.
- Strength gate:
  - `Engine` (same time budget) wins >55% vs current Tactical over fixed-seed match set.
- Performance gate:
  - median decision time <= 800ms in UI mode.
  - no frame hitch from AI computation (worker path).
- Stability gate:
  - no increase in command rejection rate vs baseline.
  - no regression in reaction/challenge flow correctness.

### Test Cases and Scenarios
- Unit tests:
  - macro-action generation validity per sub-phase.
  - NNUE feature extraction symmetry and bounds.
  - accumulator incremental update equals full recompute.
  - TT key stability and collision-handling behavior.
- Integration tests:
  - mixed-search chooses legal command in every decision state.
  - reaction states always evaluate reactive player decisions correctly.
  - fixed-dice search reproducibility across runs.
- Headless match tests:
  - baseline Tactical vs Engine series with summary stats.
  - stress scenarios with high reaction density and assault-heavy states.
- Performance tests:
  - nodes/ms benchmarks on representative midgame states.
  - worker cancellation latency and timeout fallback behavior.

### Assumptions and Defaults
- Search approach: mixed (alpha-beta core + stochastic handling), not pure alpha-beta or pure MCTS.
- Evaluator: NNUE-style incremental evaluator is required in first release.
- Inference target: shared UI + headless.
- Training bootstrap: self-play + heuristic teacher labels.
- Time budget default: 500ms per decision (within 300–800ms target).
- Turbo mode:
  - headless/ladder profile defaults to `800–1000ms` per decision.
  - UI default remains `500ms`; Turbo UI is optional and user-toggleable.
- Army builder AI default:
  - beam-first legal construction, then NNUE + headless matchup ranking on top candidates.
  - deterministic seed mode available for reproducible testing.
- No engine rules changes are required; work is isolated to AI, integration glue, and tooling.
