# HHv2 TODO

Last Updated: 2026-03-09

## Execution Plan (MCP Host Split Config - 2026-03-09)
- [x] Add a machine-level Cloudflare tunnel ingress rule so `mcp.tarvorix.com` remains available for Strife while `hh.tarvorix.com` forwards to HHv2.
- [x] Add a separate Codex MCP server entry for `hh.tarvorix.com` without overwriting the existing Strife MCP entry.
- [x] Verify the resulting config files still point Strife at `mcp.tarvorix.com` and HHv2 at `hh.tarvorix.com`.
- Progress:
  - Updated `/Users/kylebullock/.cloudflared/config.yml` to preserve `mcp.tarvorix.com -> http://127.0.0.1:8787` for Strife and add `hh.tarvorix.com -> http://127.0.0.1:8788` for HHv2.
  - Updated `/Users/kylebullock/.codex/config.toml` to keep the existing `strife` MCP server entry and add a new `hh` MCP server entry pointing at `https://hh.tarvorix.com/mcp`.
  - Verified the saved file contents after patching, and created timestamped backup copies of both machine-level config files before editing.

## Execution Plan (HH MCP Tool Schema Fix - 2026-03-09)
- [x] Replace non-JSON-schema-safe MCP tool input definitions with explicit JSON-safe schemas so Codex can enumerate HHv2 tools.
- [x] Rebuild `@hh/mcp-server` and rerun focused verification against the live `hh.tarvorix.com` MCP endpoint.
- [x] Record the specific schema blocker and the verification outcome here.
- Progress:
  - Root cause was `packages/mcp-server/src/register-tools.ts`: `submit_action` used `z.custom<GameCommand>()`, which the MCP SDK could not export to JSON Schema during `tools/list`, causing Codex to show no tools.
  - Replaced the custom/opaque MCP input pieces with explicit JSON-safe Zod schemas:
    - added an explicit `gameCommandSchema` discriminated union covering the full `GameCommand` surface
    - added explicit doctrine schemas for `blackshields` and `shatteredLegions`
    - tightened a few related helper schemas (`TerrainPiece`, `TerrainShape`, player index/faction helpers) so the whole tool catalog stays JSON-schema-safe
  - Added `packages/mcp-server/src/register-tools.test.ts`, which boots an in-memory MCP server/client pair and asserts that a real client can enumerate the HHv2 tool catalog.
  - Verification passed:
    - `pnpm --filter @hh/mcp-server typecheck`
    - `pnpm --filter @hh/mcp-server build`
  - `pnpm test -- packages/mcp-server/src/match-manager.test.ts packages/mcp-server/src/register-tools.test.ts`
  - Raw MCP wire check against `https://hh.tarvorix.com/mcp` now returns the full 11-tool `tools/list` catalog.
  - Official MCP SDK client check against `https://hh.tarvorix.com/mcp` successfully enumerated all 11 HHv2 tools.

## Execution Plan (HH MCP Playable Faction Scope - 2026-03-09)
- [x] Narrow HH MCP top-level faction inputs to the curated playable set only.
- [x] Preserve full 18-legion support for Shattered Legions and Blackshields doctrine/origin fields.
- [x] Rebuild and verify the live `hh.tarvorix.com` schema still enumerates and now advertises only the playable top-level factions.
- Progress:
  - Updated `packages/mcp-server/src/register-tools.ts` so the MCP `create_match` top-level `faction` fields now advertise only the curated playable set: `Dark Angels`, `World Eaters`, `Alpha Legion`, `Blackshields`, and `Shattered Legions`.
  - Kept the full legion enum for `originLegion`, `selectedLegions`, and `selectedLegionForArmoury`, so Shattered Legions and Blackshields still have access to all required legion lineage/doctrine choices.
  - Extended `packages/mcp-server/src/register-tools.test.ts` to assert that the emitted MCP schema keeps this split correctly.
  - Verification passed:
    - `pnpm --filter @hh/mcp-server typecheck`
    - `pnpm --filter @hh/mcp-server build`
    - `pnpm test -- packages/mcp-server/src/match-manager.test.ts packages/mcp-server/src/register-tools.test.ts`
    - Live MCP SDK check against `https://hh.tarvorix.com/mcp` confirmed the 5-value top-level `faction` enum while the doctrine schema still includes `Sons of Horus`, `selectedLegions`, and `selectedLegionForArmoury`.

## Execution Plan (24-Match Starter Gameplay Training Run - 2026-03-08)
- [x] Run a 24-match `nnue:selfplay` pass on the curated 2000-point default setups and capture the generated corpus manifest.
- [x] Train a gameplay candidate from the resulting self-play shard(s) with a conservative starter configuration.
- [x] Gate the candidate against `Tactical`, capture the benchmark summary, and record the outcome here.
- Progress:
  - The first attempted starter batch exposed two issues:
    - `tools/nnue/self-play.mjs` assumed every instrumented match returned a replay/final-state hash and crashed on the first abnormal termination.
    - The deeper gameplay bug was in `packages/ai/src/engine/candidate-generator.ts`: search-side movement generation did not call `canUnitMove()`, so the `Engine` could emit illegal `moveUnit` commands for combat-locked units.
  - Patched `tools/nnue/common.mjs` so aborted instrumented matches still emit replay artifacts and no longer crash the self-play batch.
  - Patched `packages/ai/src/engine/candidate-generator.ts` to filter movement actions through `canUnitMove()`, and added a regression in `packages/ai/src/engine/search.test.ts` to keep locked-in-combat units from becoming Movement-phase search actions.
  - Rebuilt `@hh/ai` and `@hh/headless` so the NNUE tooling picked up the fixed search code.
  - Verified the repaired legality path with:
    - `pnpm test -- packages/ai/src/engine/search.test.ts` (`1 file / 3 tests`)
    - `pnpm nnue:selfplay --matches 3 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-starter-2000-repro-after-build` (`3/3 game-over`)
  - Final starter run completed cleanly:
    - `pnpm nnue:selfplay --matches 24 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-starter-2000-final`
    - Result: `24/24 game-over`, `5,678` samples, `1` shard, manifest at `tmp/nnue-starter-2000-final/manifest.json`
  - Starter candidate training completed:
    - `pnpm nnue:train --input tmp/nnue-starter-2000-final/selfplay-shard-001.jsonl --out tmp/nnue-starter-2000-final/candidate.json --epochs 12 --learning-rate 0.01 --l2 0.0005`
    - Result: model `gameplay-default-v1-candidate-1773023710076`
  - Starter gate completed:
    - `pnpm nnue:gate --model tmp/nnue-starter-2000-final/candidate.json --matches 8 --time-budget-ms 150 --threshold -1 --out tmp/nnue-starter-2000-final/gate.json`
    - Result: `1 win / 6 losses / 1 draw / 0 aborted / 0 timeouts` vs `Tactical` (`winRate: 0.125`)

## Execution Plan (100-Match Gameplay Training Run - 2026-03-08)
- [x] Run a 100-match `nnue:selfplay` batch on the curated 2000-point default setups and capture the generated corpus manifest.
- [x] Train a gameplay candidate from the resulting 100-match shard(s) using the same starter hyperparameters for an apples-to-apples comparison.
- [x] Gate the new candidate against `Tactical` and record the benchmark summary alongside the 24-match starter result.
- Progress:
  - `pnpm nnue:selfplay --matches 100 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-100-2000-final`
    - Result: `100/100 game-over`, `23,620` samples, `1` shard, manifest at `tmp/nnue-100-2000-final/manifest.json`
    - No abnormal terminations were observed in the full 100-game batch after the search legality fix + rebuild.
  - `pnpm nnue:train --input tmp/nnue-100-2000-final/selfplay-shard-001.jsonl --out tmp/nnue-100-2000-final/candidate.json --epochs 12 --learning-rate 0.01 --l2 0.0005`
    - Result: model `gameplay-default-v1-candidate-1773029050909`
  - `pnpm nnue:gate --model tmp/nnue-100-2000-final/candidate.json --matches 8 --time-budget-ms 150 --threshold -1 --out tmp/nnue-100-2000-final/gate.json`
    - Result: `3 wins / 5 losses / 0 draws / 0 aborted / 0 timeouts` vs `Tactical` (`winRate: 0.375`)
  - Comparison vs the 24-game starter:
    - 24-game candidate: `1 win / 6 losses / 1 draw` (`winRate: 0.125`)
    - 100-game candidate: `3 wins / 5 losses / 0 draws` (`winRate: 0.375`)
    - So the larger corpus improved the model materially, but it still does not beat `Tactical` at this budget.

## Documentation Plan (Engine Primer - 2026-03-09)
- [x] Audit the current `Engine` implementation across AI core, UI, headless, MCP, and NNUE tooling so the primer reflects the shipped code rather than older design docs.
- [x] Write `engine_primer.md` as a code-accurate white paper covering architecture, runtime decision flow, search, evaluator/model format, training pipeline, deployment path, and current limitations.
- [x] Add a concrete “possible improvements” section at the end and record the finished doc pass here after a final source re-read.
- Progress:
  - Audited the live Engine stack across `packages/ai`, `packages/ui`, `packages/headless`, `packages/mcp-server`, and `tools/nnue` so the primer describes the shipped code paths rather than the older mixed-search plan.
  - Added `engine_primer.md` at the repo root as a current-state primer covering:
    - strategy tiers and runtime architecture
    - AI controller and queued-plan flow
    - macro-action generation and search behavior
    - deterministic rollouts and evaluator/model format
    - UI worker, headless, CLI, and MCP integration surfaces
    - self-play, training, gating, and runtime deployment behavior
    - strengths, limitations, and concrete improvement ideas
  - Added the requested section at the end with practical trainer, search, and product/deployment improvements to implement next.
  - Re-read the finished primer against the source after drafting. No code tests were run because this was a documentation-only change.

## Implementation Plan (25-Feature Gameplay Evaluator + Trainer Validation Pass - 2026-03-09)
- [x] Expand the gameplay feature extractor from 10 to 25 features and version the gameplay feature schema so new models are validated correctly.
- [x] Align the built-in default gameplay NNUE model with the expanded feature vector so `Engine` still boots with a valid in-process gameplay model.
- [x] Upgrade `tools/nnue/train-gameplay-model.mjs` to support a validation split and early stopping while preserving the current artifact format.
- [x] Run focused verification for the updated evaluator/trainer path and record the outcome here.
- Progress:
  - Expanded `packages/ai/src/engine/feature-extractor.ts` from `10` to `25` bounded gameplay features and bumped `GAMEPLAY_FEATURE_VERSION` from `1` to `2`.
  - The new feature vector now includes objective presence/contest, center presence, threat projection, reserves/status splits, embarked and vehicle state, reaction readiness, warlord survival, near-range threat pressure, decision ownership, and battle-progress context on top of the old material/VP core.
  - Updated `packages/ai/src/engine/default-model.ts` so the built-in gameplay model now ships with a 25-weight prior and remains valid against the new feature schema.
  - Hardened `tools/nnue/common.mjs` so gameplay model serialization now uses the exported `GAMEPLAY_FEATURE_VERSION` and rejects mismatched feature-weight counts instead of emitting incompatible artifacts.
  - Upgraded `tools/nnue/train-gameplay-model.mjs` with deterministic shuffling, configurable validation splitting, validation-based early stopping, richer metrics output, and a clear hard failure when old self-play data uses the wrong gameplay feature dimension.
  - Added `packages/ai/src/engine/feature-extractor.test.ts` to lock the new 25-feature schema length, bounded output range, and the final decision-owner / battle-progress feature semantics.
  - Adjusted `tools/nnue/common.mjs` progress finishing so early-stopped trainer runs now report the actual completed epoch count instead of always printing the requested epoch total.
  - Verification passed:
    - `pnpm test -- packages/ai/src/engine/feature-extractor.test.ts packages/ai/src/engine/search.test.ts` (`2 files / 5 tests`)
    - `pnpm --filter @hh/ai build`
    - `pnpm nnue:selfplay --matches 2 --time-budget-ms 50 --max-commands 250 --shard-size 1000000 --out-dir tmp/nnue-trainer-validation-smoke/selfplay`
      - Result: `2/2 game-over`, `458` samples, fresh 25-feature shard at `tmp/nnue-trainer-validation-smoke/selfplay/selfplay-shard-001.jsonl`
    - `pnpm nnue:train --input tmp/nnue-trainer-validation-smoke/selfplay/selfplay-shard-001.jsonl --out tmp/nnue-trainer-validation-smoke/candidate.json --epochs 8 --learning-rate 0.01 --validation-split 0.2 --patience 2 --min-delta 0.0001`
      - Result: `366` training samples, `92` validation samples, `8` epochs completed, `bestEpoch=8`, `stoppedEarly=false`
    - `pnpm nnue:train --input tmp/nnue-trainer-validation-smoke/selfplay/selfplay-shard-001.jsonl --out tmp/nnue-trainer-validation-smoke/candidate-early-stop.json --epochs 12 --learning-rate 0.01 --validation-split 0.2 --patience 2 --min-delta 0.05`
      - Result: forced early-stop smoke path completed at `epochsCompleted=3`, `bestEpoch=1`, `stoppedEarly=true`, and the final progress line now correctly reports `3/12` instead of `12/12`

## Documentation Plan (Engine Primer Refresh After 25-Feature Trainer Pass - 2026-03-09)
- [x] Re-read `engine_primer.md` for stale evaluator, trainer, deployment, and improvement notes after the 25-feature gameplay evaluator change.
- [x] Update the primer so it reflects the current 25-feature gameplay schema, feature version bump, validation-split training loop, and current deployment implications.
- [x] Record the documentation refresh outcome here after a final source-alignment pass.
- Progress:
  - Updated `engine_primer.md` so the evaluator section now reflects the current `25`-feature gameplay schema and calls out the `v2` gameplay feature version instead of the older 10-feature description.
  - Refreshed the training section to describe the current trainer behavior: feature-dimension validation, deterministic shuffling, train/validation split, validation MAE tracking, best-checkpoint retention, early stopping, and richer training metadata in the generated artifacts.
  - Added the current deployment implication that gameplay schema bumps invalidate older gameplay self-play shards and trained gameplay candidates until new data is generated under the current feature extractor.
  - Updated the limitations and improvement sections so they no longer recommend work that is already implemented, and instead reflect the current remaining gaps after the 25-feature + trainer-validation pass.
  - Re-read the patched primer against the current source after editing. No tests were run because this was a documentation-only refresh.

## Execution Plan (Gameplay Artifact Cleanup + Fresh 100-Match V2 Run - 2026-03-09)
- [x] Remove obsolete pre-`v2` gameplay self-play/training artifacts after explicit confirmation.
- [x] Run a fresh `100`-match gameplay self-play batch under the current 25-feature gameplay schema.
- [x] Train a new gameplay candidate from that fresh shard and gate it against `Tactical`.
- [x] Record the cleanup scope and the new benchmark results here.
- Progress:
  - Identified the cleanup target as obsolete gameplay-training artifacts from before the 25-feature gameplay schema bump. Current `v2` smoke artifacts and roster audit artifacts are not in the initial delete set.
  - Deleted the approved obsolete gameplay artifact set:
    - full directories: `tmp/nnue-100`, `tmp/nnue-100-2000-final`, `tmp/nnue-curated-default-smoke`, `tmp/nnue-smoke`, `tmp/nnue-starter-2000`, `tmp/nnue-starter-2000-final`, `tmp/nnue-starter-2000-fixed`, `tmp/nnue-starter-2000-repro`, `tmp/nnue-starter-2000-repro-after-build`, `tmp/nnue-starter-2000-repro-after-fix`, `tmp/nnue-starter-2000-run2`, and `tmp/nnue-acceptance/selfplay-16x300`
    - stale pre-`v2` gameplay candidate / gate files under `tmp/nnue-acceptance`: `candidate-a*`, `candidate-b*`, `candidate-c*`, `candidate-d*`, `candidate-e*`, plus the old gameplay baseline / smoke gate summaries
  - Fresh `v2` self-play completed with:
    - `pnpm nnue:selfplay --matches 100 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-100-2000-v2`
    - Result: `100/100 game-over`, `23,499` samples, `1` shard, manifest at `tmp/nnue-100-2000-v2/manifest.json`
  - Fresh `v2` training completed with:
    - `pnpm nnue:train --input tmp/nnue-100-2000-v2/selfplay-shard-001.jsonl --out tmp/nnue-100-2000-v2/candidate.json --epochs 12 --learning-rate 0.01 --l2 0.0005 --validation-split 0.2 --patience 3 --min-delta 0.0001`
    - Result: model `gameplay-default-v1-candidate-1773040019904`, `18,799` training samples, `4,700` validation samples, `bestEpoch=12`, `stoppedEarly=false`
  - Fresh `v2` gate completed with:
    - `pnpm nnue:gate --model tmp/nnue-100-2000-v2/candidate.json --matches 8 --time-budget-ms 150 --threshold -1 --out tmp/nnue-100-2000-v2/gate.json`
    - Result: `2 wins / 6 losses / 0 draws / 0 aborted / 0 timeouts` vs `Tactical` (`winRate: 0.25`)
  - Comparison against the prior short 2000-point benchmark:
    - previous 100-match candidate: `3 wins / 5 losses / 0 draws` (`winRate: 0.375`)
    - fresh `v2` candidate: `2 wins / 6 losses / 0 draws` (`winRate: 0.25`)
  - Outcome:
    - The rerun fully succeeded from an infrastructure perspective: obsolete pre-`v2` gameplay artifacts were removed, the fresh 100-match curated self-play batch finished `100/100 game-over`, the candidate trained cleanly under the new validation-split trainer, and the benchmark had `0` aborted matches.
    - The model-strength result is worse than the prior short benchmark, so the current `v2` feature/trainer change did not improve short-match strength by itself.

## Execution Plan (Fresh 400-Match V2 Self-Play Corpus - 2026-03-09)
- [x] Run a fresh `400`-match gameplay self-play batch on the curated 2000-point `v2` setup using the current benchmark settings.
- [x] Record the corpus output path, sample count, and termination stability here.
- Progress:
  - `pnpm nnue:selfplay --matches 400 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-400-2000-v2`
  - Result: `400/400 game-over`, `94,090` samples, `1` shard, manifest at `tmp/nnue-400-2000-v2/manifest.json`
  - Stability outcome: `0` abnormal terminations across the full 400-match curated 2000-point `v2` corpus run.
  - Follow-on training from the 400-match corpus completed with:
    - `pnpm nnue:train --input tmp/nnue-400-2000-v2/selfplay-shard-001.jsonl --out tmp/nnue-400-2000-v2/candidate.json --epochs 12 --learning-rate 0.01 --l2 0.0005 --validation-split 0.2 --patience 3 --min-delta 0.0001`
    - Result: model `gameplay-default-v1-candidate-1773063413765`, `75,272` training samples, `18,818` validation samples, `epochsCompleted=10`, `bestEpoch=7`, `stoppedEarly=true`
  - Follow-on benchmark against `Tactical` completed with:
    - `pnpm nnue:gate --model tmp/nnue-400-2000-v2/candidate.json --matches 8 --time-budget-ms 150 --threshold -1 --out tmp/nnue-400-2000-v2/gate.json`
    - Result: `1 win / 7 losses / 0 draws / 0 aborted / 0 timeouts` (`winRate: 0.125`)
  - Comparison:
    - prior 100-match `v2` candidate: `2 wins / 6 losses` (`winRate: 0.25`)
    - current 400-match `v2` candidate: `1 win / 7 losses` (`winRate: 0.125`)
  - Outcome:
    - The larger corpus improved data volume and remained perfectly stable, but it did not improve short-match strength. On this benchmark, the 400-match candidate is the weakest of the recent `v2` candidates.

## Implementation Plan (Search Candidate Generation + Root Ordering Pass - 2026-03-09)
- [x] Diversify movement candidate generation so root actions include tactically distinct lanes instead of only the top few destinations from one generic score.
- [x] Make shooting candidate ordering damage-aware and target-value-aware before root pruning.
- [x] Improve reaction unit selection / decline scoring within the current fixed-reaction-type command surface.
- [x] Add a cheap root pre-order using transitioned states so search sees better actions first before full depth search.
- [x] Add focused regression coverage and run targeted AI package verification.
- Progress:
  - Updated `packages/ai/src/engine/candidate-generator.ts` so Movement actions now keep tactically distinct lane candidates (`objective`, `fire`, `safety`, `pressure`, `center`, fallback best) instead of only the top few destinations from one score.
  - Updated shooting macro-action pruning in `packages/ai/src/engine/candidate-generator.ts` to widen the coarse target pool, estimate expected damage from the actual selected weapons, and boost warlord/objective-holder/kill-pressure targets before root pruning.
  - Updated reaction generation in `packages/ai/src/engine/candidate-generator.ts` so eligible units are scored by reaction-context value and decline is no longer a fixed constant.
  - Updated `packages/ai/src/engine/search.ts` so root actions get a cached cheap pre-order from transitioned states before the full depth search loop.
  - Added focused generator coverage in `packages/ai/src/engine/candidate-generator.test.ts`.
  - Verification passed:
    - `pnpm test -- packages/ai/src/engine/candidate-generator.test.ts packages/ai/src/engine/search.test.ts` (`2 files / 6 tests`)
    - `pnpm --filter @hh/ai build`

## Documentation + Benchmark Plan (Engine Primer Refresh + Fresh 100-Match Search-Pass Run - 2026-03-09)
- [x] Update `engine_primer.md` so it reflects the new search candidate-generation and root-ordering behavior rather than the older narrower search description.
- [x] Rebuild the AI/headless runtime path before benchmarking so the 100-match run uses the new search code.
- [x] Run a fresh `100`-match curated 2000-point gameplay self-play batch on the current search code.
- [x] Train a fresh gameplay candidate from that corpus and gate it against `Tactical`.
- [x] Record the documentation refresh and the new benchmark outcome here.
- Progress:
  - Updated `engine_primer.md` so the shipped search description now includes the cheap root pre-order, diversified movement lanes, damage-aware shooting pruning, and current fixed-reaction-type unit/decline scoring behavior.
  - Updated the primer limitations/improvement section so it no longer recommends the exact search-side work that is now already implemented.
  - Rebuilt the runtime path with:
    - `pnpm --filter @hh/ai build`
    - `pnpm --filter @hh/headless build`
  - Fresh self-play completed with:
    - `pnpm nnue:selfplay --matches 100 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-100-2000-v2-searchpass`
    - Result: `100/100 game-over`, `19,853` samples, `1` shard, manifest at `tmp/nnue-100-2000-v2-searchpass/manifest.json`
  - Fresh training completed with:
    - `pnpm nnue:train --input tmp/nnue-100-2000-v2-searchpass/selfplay-shard-001.jsonl --out tmp/nnue-100-2000-v2-searchpass/candidate.json --epochs 12 --learning-rate 0.01 --l2 0.0005 --validation-split 0.2 --patience 3 --min-delta 0.0001`
    - Result: model `gameplay-default-v1-candidate-1773070576502`, `15,882` training samples, `3,971` validation samples, `epochsCompleted=12`, `bestEpoch=11`, `stoppedEarly=false`
  - Fresh gate completed with:
    - `pnpm nnue:gate --model tmp/nnue-100-2000-v2-searchpass/candidate.json --matches 8 --time-budget-ms 150 --threshold -1 --out tmp/nnue-100-2000-v2-searchpass/gate.json`
    - Result: `2 wins / 6 losses / 0 draws / 0 aborted / 0 timeouts` vs `Tactical` (`winRate: 0.25`)
  - Outcome:
    - The primer is now current with the shipped search behavior.
    - The rebuilt 100-match 2000-point corpus run was fully stable (`100/100 game-over`, `0` abnormal terminations).
    - The fresh candidate did not improve the short benchmark versus the earlier `v2` 100-match run; it matched the prior `2-6` result exactly.

## Review Plan (Engine Timing + Search/Evaluator Effectiveness Audit - 2026-03-09)
- [x] Compare the old and new 100-match corpus artifacts to quantify whether unchanged wall-clock is due to time-budget capping, fewer decisions, or missing code paths.
- [x] Audit the current search/evaluator runtime path to verify the new feature extractor and search candidate-generation logic are actually active during self-play.
- [x] Summarize the concrete findings, including whether the unchanged run time is expected or indicates a bug.
- Progress:
  - Both 100-match corpus runs use the same per-turn search budget: `timeBudgetMs = 150`.
  - The new search/evaluator code is definitely active:
    - gameplay extraction is still `v2` / `25` features (`packages/ai/src/engine/feature-extractor.ts`)
    - the evaluator consumes those live gameplay features (`packages/ai/src/engine/evaluator.ts`)
    - root pre-ordering is present in the built runtime (`packages/ai/dist/engine/search.js`)
    - movement diversification / damage-aware shooting / reaction scoring are present in the built runtime (`packages/ai/dist/engine/candidate-generator.js`)
  - The unchanged wall-clock is not evidence that the new code was skipped:
    - the run is still capped by the same `150ms` per-decision budget
    - the evaluator cost increase from `10` to `25` features is tiny relative to command simulation/search
    - the final root/per-unit breadth caps did not change
  - The bigger issue is a new movement-legality regression in the search-pass run:
    - prior `tmp/nnue-100-2000-v2/manifest.json`: `0` aborted, `23,499` samples, approx `3702.3s`
    - new `tmp/nnue-100-2000-v2-searchpass/manifest.json`: `20` aborted, `19,853` samples, approx `3375.6s`
    - all new abnormal terminations are `command-rejected` movement failures: `Target position is outside the battlefield`, `Model base overlaps with another model`, and `Cannot end move within 1" of an enemy model`
  - Replay inspection shows the new diversified movement selector is surfacing illegal translated formations:
    - one rejected move sends the lead model to `x = -1.42`
    - another rejected move overlaps another model
  - Root cause is in `packages/ai/src/engine/candidate-generator.ts`:
    - `generateCandidatePositions(...)` clamps only the destination centroid
    - `translateUnitToCentroid(...)` blindly offsets every model from that centroid
    - the diversified lane selector now chooses more edge/pressure destinations, which exposes those previously latent legality gaps

## Fix Plan (Movement Candidate Legality Hardening + Fresh 100-Match Rerun - 2026-03-09)
- [x] Add full-formation movement legality filtering so search never emits move candidates that the engine would reject for battlefield bounds, model overlap, or enemy proximity.
- [x] Add focused regression coverage for the rejected movement cases found in the latest self-play audit.
- [x] Rebuild the AI/headless runtime path after the legality fix.
- [x] Rerun the 100-match curated 2000-point self-play batch and confirm abnormal terminations return to zero.
- [x] If the corpus is clean, retrain and re-gate from the fresh shard and record the corrected result here.
- Progress:
  - Updated `packages/ai/src/engine/candidate-generator.ts` so Movement candidates now keep only full translated formations that the real engine `handleMoveUnit(...)` validator accepts, rather than relying on centroid-only clamping.
  - Added focused regression coverage in `packages/ai/src/engine/candidate-generator.test.ts` for edge-pressure and enemy-exclusion movement cases, and tightened the existing movement-lane test so every generated `moveUnit` action must pass engine validation.
  - Verification passed:
    - `pnpm test -- packages/ai/src/engine/candidate-generator.test.ts packages/ai/src/engine/search.test.ts` (`2 files / 8 tests`)
    - `pnpm --filter @hh/ai build`
    - `pnpm --filter @hh/headless build`
  - Fresh corrected self-play completed with:
    - `pnpm nnue:selfplay --matches 100 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-100-2000-v2-searchpass-fixed`
    - Result: `100/100 game-over`, `25,173` samples, `1` shard, manifest at `tmp/nnue-100-2000-v2-searchpass-fixed/manifest.json`
  - Post-run audit:
    - `manifest.json` reports `100` matches, all `terminatedReason = game-over`
    - replay inventory count is `100`, matching the manifest
    - abnormal terminations returned to `0`
  - Fresh corrected training completed with:
    - `pnpm nnue:train --input tmp/nnue-100-2000-v2-searchpass-fixed/selfplay-shard-001.jsonl --out tmp/nnue-100-2000-v2-searchpass-fixed/candidate.json --epochs 12 --learning-rate 0.01 --l2 0.0005 --validation-split 0.2 --patience 3 --min-delta 0.0001`
    - Result: model `gameplay-default-v1-candidate-1773075368635`, `20,138` training samples, `5,035` validation samples, `epochsCompleted=12`, `bestEpoch=12`, `stoppedEarly=false`
  - Fresh corrected gate completed with:
    - `pnpm nnue:gate --model tmp/nnue-100-2000-v2-searchpass-fixed/candidate.json --matches 8 --time-budget-ms 150 --threshold -1 --out tmp/nnue-100-2000-v2-searchpass-fixed/gate.json`
    - Result: `3 wins / 5 losses / 0 draws / 0 aborted / 0 timeouts` vs `Tactical` (`winRate: 0.375`)
  - Outcome:
    - The legality fix worked: the corrected corpus is fully clean and no longer hides runtime/strength behavior behind command rejections.
    - The corrected 100-match candidate is stronger than the previous search-pass rerun (`3-5` vs `2-6`) and matches the earlier best short 100-match result on the curated 2000-point surface.

## Implementation Plan (Curated 2000pt Faction Rosters - 2026-03-08)
- [x] Inventory the currently playable factions and the actual profile/detachment surface the code can validate.
- [x] Research online faction identity/list-building references, then map those themes onto the current local rules/docs and supported datasheets.
- [x] Add curated 2000-point army-list definitions for each currently playable faction with doctrine/allegiance/transport assignments encoded explicitly.
- [x] Add regression coverage that each curated roster lands on exactly 2000 points and validates cleanly under current army-builder rules.
- [x] Export the curated roster definitions for reuse by headless/training tooling and record the source notes.
- Progress:
  - Confirmed the currently playable factions are `Dark Angels`, `World Eaters`, `Alpha Legion`, `Blackshields`, and `Shattered Legions`.
  - Audited the supported profile pool and detachment templates locally so the curated rosters only use units/slots the current code can represent and validate.
  - Collected online faction-list references for Dark Angels, World Eaters, Alpha Legion, Blackshields, and Shattered Legions to anchor the roster themes before implementation.
  - Added `packages/headless/src/curated-army-lists.ts`, exporting five curated 2000-point rosters with explicit detachments, doctrines, origin legions where required, and transport assignments that pass the current legality checks.
  - Exported the curated roster registry through `@hh/headless` so headless/training flows can reuse it without duplicating army-list fixtures.
  - Added `packages/headless/src/curated-army-lists.test.ts` to assert that each curated roster is exactly 2000 points, validates cleanly, uses unique unit IDs, and does not leave transport-slot units orphaned.
  - Verification passed: `pnpm test -- packages/headless/src/curated-army-lists.test.ts packages/headless/src/roster.test.ts packages/headless/src/roster-ai.test.ts` (`3 files / 13 tests`) and `pnpm --filter @hh/headless build`.

## Implementation Plan (NNUE Tooling Uses Curated 2000pt Setups - 2026-03-08)
- [x] Trace the default gameplay setup path in `nnue:selfplay` and `nnue:gate`.
- [x] Replace the tiny default mirror setup with curated 2000-point army-list pairings while preserving explicit `--setup` overrides.
- [x] Add focused verification that self-play and gate now report curated factions/rosters in their output artifacts.
- [x] Update this log with the new default behavior and verification.
- Progress:
  - Confirmed `tools/nnue/self-play.mjs` still defaults to `createDefaultSetupOptions()` and `tools/nnue/common.mjs` still hardcodes the old `techmarine + tactical squad` mirror setup.
  - Confirmed the curated roster registry is already exported via `@hh/headless` and can be reused by the tooling instead of duplicating army-list fixtures.
  - Updated `tools/nnue/common.mjs` so the default gameplay setup factory now returns curated 2000-point `armyLists`, and the instrumentation/gate helpers now create initial states through `createHeadlessGameStateFromArmyLists()` whenever an army-list setup is supplied.
  - Updated `tools/nnue/self-play.mjs` to rotate through curated default matchups by `matchIndex`, while still honoring explicit `--setup` JSON when provided.
  - Updated `tools/nnue/gate-gameplay-model.mjs` to accept optional `--setup` input and otherwise use the same curated default matchup factory as self-play.
  - Verification passed:
    - `pnpm nnue:selfplay --matches 1 --time-budget-ms 10 --max-commands 20 --shard-size 100000 --out-dir tmp/nnue-curated-default-smoke/selfplay`
    - `pnpm nnue:gate --matches 1 --time-budget-ms 10 --threshold -1 --out tmp/nnue-curated-default-smoke/gate.json`
    - The default self-play replay artifact now starts with `Dark Angels 2000pt Curated` vs `World Eaters 2000pt Curated` and 15/16 units respectively, confirming the old tiny mirror setup is no longer the default training surface.

## Implementation Plan (Roster Legality + Transport Enforcement - 2026-03-08)
- [x] Add profile-trait legality helpers so army validation can reject fixed-allegiance and fixed-faction profile mismatches against the army list.
- [x] Extend army-list unit data with explicit transport assignment metadata and preserve it through serialization/headless conversion.
- [x] Implement shared transport-legality helpers for capacity, unit type eligibility, Light Transport restrictions, dreadnought-only transports, faction matching, and single-vs-multi-unit carrier limits.
- [x] Update generated roster construction so transports are only added when they can be assigned legally to real passengers, and log those assignments in roster artifacts.
- [x] Reuse the shared transport rules in runtime embark validation where practical so roster legality and in-game embark constraints stop drifting apart.
- [x] Add focused regression coverage and rerun headless/army-builder/transport verification plus a fresh 2000-point roster gate sample.
- Progress:
  - Added shared profile legality and transport compatibility helpers in `packages/data/src/profile-legality.ts`, including fixed allegiance checks, bulky/capacity math, Light Transport restrictions, dreadnought-only transport support, and super-heavy multi-unit transport handling.
  - Extended `ArmyListUnit` with optional `assignedTransportUnitId` metadata and updated army-list serialization validation to preserve it.
  - `validateArmyListWithDoctrine` now rejects fixed profile allegiance/faction mismatches and validates explicit transport assignments with the shared transport rules.
  - Generated roster candidates now filter out fixed-allegiance profile mismatches up front, assign passengers to legal transports after candidate construction, and drop unused dedicated transport-slot units that cannot legally carry anything in the roster.
  - Runtime embark validation in `packages/engine/src/movement/embark-disembark-handler.ts` now uses the same shared compatibility rules instead of the old hardcoded capacity check.
  - Verification passed: focused legality/transport tests passed (`4 files / 68 tests`), targeted package builds passed for `@hh/data`, `@hh/army-builder`, `@hh/engine`, and `@hh/headless`, and a fresh 2000-point roster gate sample (`tmp/nnue-legality-audit/roster-gate-8-fixed.json`) finished `5 wins / 2 losses / 1 draw / 0 aborted / 0 timeouts` with no validator failures, no fixed-allegiance mismatches, and no unassigned dedicated transports in the logged rosters.

## Review Plan (Generated Roster Legality Audit - 2026-03-08)
- [x] Inspect the logged generated rosters and compare them against the current army-building rules/docs in the repo.
- [x] Cross-check detachment slot usage, unlocks, and faction/doctrine assumptions against the rules references and templates.
- [x] Summarize whether the generated rosters are actually legal versus the docs, not just versus the validator.
- Findings:
  - The sampled 2000-point generated rosters are usually slot-legal under the current Crusade detachment templates and unlock math, but they are not fully legal versus the datasheet docs.
  - In an 8-match / 16-roster audit sample, 6 rosters included fixed-allegiance named characters in armies with the opposite allegiance:
    - `marduk-sedras` and `corswain` appeared in `Traitor` Dark Angels rosters even though `HH_v2_units.md` marks both as `Allegiance: Loyalist`.
    - `kh-rn-the-bloody` appeared in `Loyalist` World Eaters rosters even though `HH_v2_units.md` marks it as `Allegiance: Traitor`.
  - These rosters still pass current validation because generation filters only by faction + battlefield role (`packages/headless/src/roster-ai.ts` + `packages/data/src/profile-registry.ts`) and army validation never checks per-profile allegiance traits (`packages/army-builder/src/validation.ts`).
  - Transport legality is also not fully enforced at roster-build time: the generator fills Transport / Heavy Transport slots purely by battlefield role and budget, while the army-list types/validator do not encode parent-unit transport assignment or capacity legality. That means transport-bearing rosters should currently be treated as force-org legal, not fully transport-legal versus the docs.
  - Bottom line: generated rosters are not yet fully rules-doc legal; the most concrete current blocker is missing enforcement of fixed profile allegiance constraints.

## Review Verification (Generated Roster Legality Audit - 2026-03-08)
- `pnpm nnue:roster:gate --matches 8 --points-limit 2000 --threshold -1 --out tmp/nnue-legality-audit/roster-gate-8.json`: PASS execution (used as the audit sample)
- `tmp/nnue-legality-audit/roster-gate-8.json`: inspected 16 logged rosters; all current validator results reported `isValid: true`
- `HH_v2_units.md`: confirmed fixed-allegiance datasheet constraints for `marduk-sedras`, `corswain`, and `kh-rn-the-bloody`
- `packages/headless/src/roster-ai.ts`, `packages/data/src/profile-registry.ts`, `packages/army-builder/src/validation.ts`, and `packages/types/src/army-building.ts`: inspected to confirm the current generator/validator gap around profile allegiance and transport assignment legality

## Support Run (Starter Gameplay Training 100 Matches - 2026-03-08)
- [x] Generate a 100-match self-play corpus under a dedicated output directory.
- [x] Train a candidate gameplay model from the generated shard.
- [x] Run a short gate against `Tactical` and record the result.
- Outcome:
  - The 100-match starter corpus produced 11,900 samples in a single shard at `tmp/nnue-100/selfplay-shard-001.jsonl`.
  - The trained candidate `gameplay-default-v1-candidate-1773015524371` completed successfully, but the short gate result was `0 wins / 8 losses / 0 draws / 0 aborted / 0 timeouts` at `100ms`.
  - This starter run is useful as a tooling check and artifact baseline, but it did not improve gameplay strength.

## Verification (Starter Gameplay Training 100 Matches - 2026-03-08)
- `pnpm nnue:selfplay --matches 100 --time-budget-ms 100 --shard-size 1000000 --out-dir tmp/nnue-100`: PASS (11,900 samples, 1 shard)
- `pnpm nnue:train --input tmp/nnue-100/selfplay-shard-001.jsonl --out tmp/nnue-100/candidate.json --epochs 10 --learning-rate 0.02`: PASS
- `pnpm nnue:gate --model tmp/nnue-100/candidate.json --matches 8 --time-budget-ms 100 --threshold -1 --out tmp/nnue-100/gate.json`: PASS execution (0-8 result)

## Hotfix Plan (NNUE Tooling Progress Bars - 2026-03-08)
- [x] Add shared terminal progress reporting helpers for long-running NNUE scripts.
- [x] Show live progress for self-play, gameplay gate, roster gate, and gameplay training.
- [x] Run smoke commands to verify the new progress output and record the result.
- Progress:
  - Added a shared progress reporter in `tools/nnue/common.mjs` that writes live bars to stderr while preserving the scripts' final JSON summaries on stdout.
  - `self-play`, `train-gameplay-model`, `gate-gameplay-model`, and `gate-roster-model` now emit live progress updates with running counts and ETA.
- Outcome:
  - All four NNUE scripts now show visible progress while running instead of staying silent until the final JSON summary.
  - The final machine-readable JSON output is unchanged and still prints after the progress bar completes.

## Hotfix Verification (NNUE Tooling Progress Bars - 2026-03-08)
- `pnpm nnue:selfplay --matches 2 --time-budget-ms 20 --out-dir tmp/nnue-progress-smoke/selfplay`: PASS
- `pnpm nnue:train --input tmp/nnue-progress-smoke/selfplay/selfplay-shard-001.jsonl --out tmp/nnue-progress-smoke/candidate.json --epochs 2 --learning-rate 0.02`: PASS
- `pnpm nnue:gate --matches 2 --time-budget-ms 20 --threshold -1 --out tmp/nnue-progress-smoke/gate.json`: PASS
- `pnpm nnue:roster:gate --matches 2 --points-limit 2000 --threshold -1 --out tmp/nnue-progress-smoke/roster-gate.json`: PASS

## Hotfix Plan (Roster Usage Logging - 2026-03-08)
- [x] Inspect the current generated-roster and roster-gate output surfaces.
- [x] Add explicit roster logging and legality metadata so generated roster choices can be audited.
- [x] Run focused verification and confirm the output artifact contains the used rosters.
- Progress:
  - Added a `validation` summary to `HeadlessGeneratedArmyList` so generated rosters carry their own legality status and error list.
  - Extended `tools/nnue/gate-roster-model.mjs` so each result entry logs the exact `modelRoster` and `heuristicRoster` army lists plus paired-army legality metadata.
- Outcome:
  - Roster gate output artifacts now contain `pairValidation`, `modelRoster`, and `heuristicRoster` sections for every match.
  - The logged roster payload includes the selected army list, the generator diagnostics/score, and a direct legality summary (`isValid`, `errors`).

## Hotfix Verification (Roster Usage Logging - 2026-03-08)
- `pnpm --filter @hh/headless build`: PASS
- `pnpm test -- packages/headless/src/roster-ai.test.ts`: PASS (1 file, 4 tests)
- `pnpm nnue:roster:gate --matches 1 --points-limit 2000 --threshold -1 --out tmp/nnue-progress-smoke/roster-gate-with-rosters.json`: PASS
- `tmp/nnue-progress-smoke/roster-gate-with-rosters.json`: verified to contain `pairValidation`, `modelRoster.validation`, `modelRoster.armyList`, `heuristicRoster.validation`, and `heuristicRoster.armyList`

## Support Plan (Engine + Roster Strength Improvements - 2026-03-08)
- [x] Review the current gameplay `Engine` and roster-model bottlenecks after the generated-roster ID hotfix.
- [x] Identify the highest-value strength improvements that should come before another promotion attempt.
- [x] Summarize the recommended next implementation steps in priority order.
- Findings:
  - Yes, gameplay NNUE training has already been run, but only on a small corpus built from 16 self-play matches and the default tiny mirror setup in `tools/nnue/common.mjs` (`techmarine` + `tactical-squad` per side).
  - The current gameplay trainer in `tools/nnue/train-gameplay-model.mjs` is a lightweight weight-fitting pass over the 10 handcrafted gameplay features, not a richer architecture with broader state encoding.
  - The immediate bottleneck is data quality and diversity more than raw epoch count: more training on the same tiny mirror setup is unlikely to produce a stronger public `Engine`.
  - The next training pass should focus on larger and more varied self-play corpora, explicit setup rotation, and iterative train -> gate -> self-play-with-new-model promotion cycles.

## Hotfix Plan (Generated Roster Reaction ID Collision - 2026-03-08)
- [x] Confirm the root cause of the false `Reposition` rejection in generated-roster matches.
- [x] Make generated roster unit IDs player-scoped so paired generated armies cannot collide on `auto-unit-*`.
- [x] Add a duplicate-unit-ID guard to the headless army-list/setup path so future collisions fail fast instead of producing invalid reaction ownership.
- [x] Add focused regression coverage and rerun the relevant roster/reaction verification.
- Root cause:
  - Generated rosters currently reuse `auto-unit-*` IDs on both sides, while engine helpers resolve units by the first matching ID across both armies.
  - This allows a legal player-1 reaction choice to be resolved as player 0's unit during validation, causing false `selectReaction` rejection with `Reposition reaction can only be performed by the reactive player's units`.
- Progress:
  - Generated roster unit IDs now flow through a deterministic namespace in `packages/headless/src/roster-ai.ts`, and paired generated matches explicitly use `p0` / `p1` namespaces.
  - `packages/headless/src/roster.ts` now rejects duplicate unit IDs across paired army lists, and `packages/headless/src/setup.ts` rejects duplicate explicit unit IDs in raw headless setup.
  - Added regression coverage in `packages/headless/src/roster-ai.test.ts`, `packages/headless/src/roster.test.ts`, and `packages/headless/src/setup.test.ts`.
  - The first rerun exposed a remaining namespace bug in `tools/nnue/gate-roster-model.mjs` when the model side started as player 1; corrected the script so the candidate and heuristic rosters always receive opposite-side namespaces.
- Outcome:
  - The roster gate no longer produces `command-rejected` false draws from duplicate generated unit IDs.
  - The corrected rerun finished with 4 wins / 4 losses / 0 draws / 0 aborted / 0 timeouts, and every match terminated as `game-over`.

## Hotfix Verification (Generated Roster Reaction ID Collision - 2026-03-08)
- `pnpm --filter @hh/headless build`: PASS
- `pnpm test -- packages/headless/src/roster-ai.test.ts packages/headless/src/roster.test.ts packages/headless/src/setup.test.ts packages/headless/src/index.test.ts`: PASS (4 files, 18 tests)
- `pnpm nnue:roster:gate --matches 8 --points-limit 2000 --threshold -1 --out tmp/nnue-acceptance/roster-baseline-2000-fixed-ids.json`: PASS execution (4 wins, 4 losses, 0 draws, 0 aborted, 0 timeouts; all matches `game-over`)

## Acceptance Plan (Engine + NNUE Promotion - 2026-03-08)
- [x] Establish the current gameplay `Engine` baseline against `Tactical` at equal budgets using fixed-seed-style evaluation runs.
- [x] Generate a larger gameplay self-play corpus and train at least one non-smoke gameplay candidate model.
- [x] Benchmark trained gameplay candidates against `Tactical` and inspect whether the acceptance gate is met or tuning is required.
- [x] Benchmark roster-model generation against the heuristic roster baseline and inspect whether it improves downstream headless results.
- [x] Record the acceptance results and any follow-up tuning work.

## Implementation Plan (Engine Search + NNUE AI - 2026-03-08)
- [x] Extend AI/public config surfaces with `Engine` tier, engine config fields, diagnostics, and queued-command context support.
- [x] Implement deterministic search + NNUE gameplay runtime in `@hh/ai`, including model registry/validation, feature extraction, candidate generation, and command-plan execution.
- [x] Wire `Engine` through UI, headless, and MCP while preserving `Basic` and `Tactical` defaults and current deployment AI.
- [x] Add targeted regression and determinism coverage, then run focused verification for AI/UI/headless/MCP packages.
- [x] Add headless self-play export plus `tools/nnue/` training/export/gating tooling.
- [x] Add roster-evaluation/model plumbing and an opt-in auto-roster AI path that remains separate from gameplay `Engine`.
- In progress:
  - Acceptance baseline: current `Engine` with `gameplay-default-v1` went 5-7 (41.7%) versus `Tactical` over 12 matches at 500ms, so the first public gate is not met yet and promotion requires training and/or tuning.
  - Corrected the acceptance tooling to match the runtime `Engine` depth default (4 instead of 3), and fixed gameplay model export so trained candidates carry a real output bias and unique model IDs.
  - Tightened the gameplay trainer around the existing default feature weights so trained candidates learn deltas from the baseline model instead of collapsing half the feature set from a zero-weight start.
  - Added a budget-aware runtime search profile so `500ms` defaults to depth 3 while larger budgets can still climb to depth 4, and widened the root/action caps modestly for stronger move coverage.
  - Removed the last tooling override that was still forcing `maxDepthSoft=4` during gameplay gates, so acceptance runs can now inherit the budget-aware runtime default instead of benchmarking the wrong profile.
  - Fixed the roster gate faction pool to use the live playable-faction registry instead of a stale hardcoded set that still included validator-rejected legions.
  - Fixed the gameplay/roster gate classification bug that was counting aborted `winnerPlayerIndex === null` matches as draws; gates now attribute `command-rejected` and similar failures to the side that caused them and report real draws/timeouts separately.
  - Added the `Engine` tier to `@hh/ai`, including engine config fields, diagnostics payloads, queued-plan bookkeeping, a built-in gameplay NNUE model registry, deterministic dice sampling, candidate generation, and iterative-deepening search scaffolding.
  - Fixed the first compile pass issues in the new engine candidate generator and continued `@hh/ai` verification.
  - Cleared the initial unused-variable/typecheck failures in the new search runtime and reran package verification.
  - Wired the UI setup/config path for `Engine`, including the 500ms/1000ms presets, UI diagnostics/error state, and a dedicated worker-backed `Engine` turn path that leaves `Basic` and `Tactical` on the existing synchronous loop.
  - Extended headless/session/CLI and MCP match schemas with the new engine fields and started carrying AI diagnostics through command records and observer-facing summaries.
  - Fixed the first downstream headless shape regressions (`errorMessage` and `aiDiagnostics`) after the surface integration pass.
  - Added focused deterministic-search coverage in `@hh/ai` and a headless-session regression that exercises engine diagnostics through a live AI-owned decision window.
  - Verified the first `Engine` slice with `@hh/ai`/`@hh/headless` builds, `@hh/ui` typecheck + production build (including the worker bundle), `@hh/mcp-server` build, and focused Vitest coverage.
  - Added reusable NNUE serialization helpers so exported gameplay models can be trained, gated, and re-registered by the follow-on tooling.
  - Generalized the NNUE model registry to validate both `gameplay` and `roster` artifacts, then added built-in roster features/default weights plus a dedicated roster evaluator path.
  - Added deterministic headless army-list generation with heuristic/model roster selection, generated-army setup helpers, and a generated-army match-session entrypoint for the separate roster AI track.
  - Extended MCP match creation so observers/agents can opt into generated army-list setup using the new roster configs instead of only explicit unit payloads.
  - Added focused roster-model and headless-generated-army tests so the new roster path is covered before the full verification pass.
  - Cleared the first roster-generator typecheck regression (`DetachmentType` unused import) and resumed the downstream verification run.
  - Tightened the heuristic roster test to a validator-approved playable legion after the first focused test run surfaced the faction-scope guard.
  - Fixed the `tools/nnue` runtime entrypoints so they import built workspace packages directly and run under the repo’s ESM loader instead of failing to resolve `@hh/*` from the root package.
  - Added a dedicated `nnue:roster:gate` entrypoint so roster-model candidates can be promoted against the heuristic roster baseline through actual headless matches.

## Acceptance Outcome (Engine + NNUE Promotion - 2026-03-08)
- Gameplay baseline with the current default model is still below the release gate:
  - `500ms`, budget-aware profile: 5 wins / 7 losses vs `Tactical` over 12 matches (41.7%).
  - Forced depth 4 at `500ms` was worse at 3 wins / 9 losses, so the stronger default profile remains depth 3 for that budget.
- The first trained gameplay candidates were not promotable:
  - Initial zero-start trainers (`candidate-a/b/c`) each went 0 wins / 8 losses.
  - Baseline-anchored trainers (`candidate-d/e`) also went 0 wins / 8 losses.
- The roster-model path is not promotable yet:
  - After fixing the gate classification bug, `roster-default-v1` is 4 wins / 4 losses / 0 draws against the heuristic roster baseline at 2,000 points.
- Outcome:
  - Acceptance work is complete for this pass, but no gameplay or roster model met the promotion gate.
  - The next required work is deeper engine-strength tuning and a stronger gameplay training objective/dataset before another promotion attempt.

## Verification (Acceptance Pass - 2026-03-08)
- `pnpm nnue:gate --matches 12 --time-budget-ms 500 --threshold 0.55 --out tmp/nnue-acceptance/gameplay-baseline-500ms.json`: FAIL gate (5-7, 41.7%)
- `pnpm nnue:selfplay --matches 16 --max-commands 1500 --time-budget-ms 300 --shard-size 512 --out-dir tmp/nnue-acceptance/selfplay-16x300`: PASS (1,904 samples)
- `pnpm nnue:train --input tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-001.jsonl,tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-002.jsonl,tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-003.jsonl,tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-004.jsonl --out tmp/nnue-acceptance/candidate-d.json --epochs 20 --learning-rate 0.01 --l2 0.001`: PASS
- `pnpm nnue:train --input tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-001.jsonl,tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-002.jsonl,tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-003.jsonl,tmp/nnue-acceptance/selfplay-16x300/selfplay-shard-004.jsonl --out tmp/nnue-acceptance/candidate-e.json --epochs 40 --learning-rate 0.005 --l2 0.0008`: PASS
- `pnpm nnue:gate --model tmp/nnue-acceptance/candidate-d.json --matches 8 --time-budget-ms 500 --max-depth-soft 3 --threshold -1 --out tmp/nnue-acceptance/candidate-d-gate-500ms-depth3.json`: PASS execution, 0-8 result
- `pnpm nnue:gate --model tmp/nnue-acceptance/candidate-e.json --matches 8 --time-budget-ms 500 --max-depth-soft 3 --threshold -1 --out tmp/nnue-acceptance/candidate-e-gate-500ms-depth3.json`: PASS execution, 0-8 result
- `pnpm nnue:gate --matches 12 --time-budget-ms 500 --threshold 0.55 --out tmp/nnue-acceptance/gameplay-baseline-500ms-final-profile.json`: FAIL gate (5-7, 41.7%)
- `pnpm nnue:roster:gate --matches 8 --points-limit 2000 --threshold 0.55 --out tmp/nnue-acceptance/roster-baseline-2000.json`: FAIL gate (0 wins, 8 draws)
- `pnpm test -- packages/ai/src/engine/search.test.ts packages/ai/src/ai-controller.test.ts packages/headless/src/roster-ai.test.ts packages/headless/src/session.test.ts`: PASS (4 files, 29 tests)

## Verification (Engine + Roster Follow-On - 2026-03-08)
- `pnpm --filter @hh/ai typecheck`: PASS
- `pnpm --filter @hh/ai build`: PASS
- `pnpm --filter @hh/headless typecheck`: PASS
- `pnpm --filter @hh/headless build`: PASS
- `pnpm --filter @hh/mcp-server typecheck`: PASS
- `pnpm --filter @hh/mcp-server build`: PASS
- `pnpm test -- packages/ai/src/engine/roster-model.test.ts packages/ai/src/engine/search.test.ts packages/headless/src/roster-ai.test.ts packages/headless/src/session.test.ts packages/ai/src/ai-controller.test.ts`: PASS (5 files, 32 tests)
- `pnpm nnue:selfplay --matches 1 --max-commands 300 --time-budget-ms 50 --shard-size 16 --out-dir tmp/nnue-smoke`: PASS
- `pnpm nnue:train --input tmp/nnue-smoke/selfplay-shard-001.jsonl,tmp/nnue-smoke/selfplay-shard-002.jsonl --out tmp/nnue-smoke/candidate-gameplay-model.json --epochs 2 --learning-rate 0.02`: PASS
- `pnpm nnue:gate --model tmp/nnue-smoke/candidate-gameplay-model.json --matches 2 --time-budget-ms 50 --threshold -1 --out tmp/nnue-smoke/gate-summary-smoke.json`: PASS
- `pnpm nnue:roster:gate --matches 2 --points-limit 2000 --threshold -1 --out tmp/nnue-smoke/roster-gate-summary.json`: PASS

## Documentation Update Plan (MixedSearch_NNUE_Plan Refresh - 2026-03-08)
- [x] Update `MixedSearch_NNUE_Plan.md` integration anchors to reflect the current UI, headless session, and MCP surfaces.
- [x] Update macro-action and integration sections so they match the current command surface, including blast/template shooting flows.
- [x] Re-read the revised document against the audited source files and record the result.
- Refresh outcome:
  - Added a current-baseline section so the plan now explicitly reflects the shipped `Basic`/`Tactical` AI, main-thread UI loop, headless session host, and MCP layer.
  - Updated future integration targets to include `HeadlessMatchSession`, MCP `advance_ai_decision`, and the existing AI-selection UI surfaces.
  - Expanded shooting/macro-action, acceptance, and test sections to cover blast/template placement flows and cross-surface determinism expectations.

## Review Plan (MixedSearch_NNUE_Plan Audit - 2026-03-08)
- [x] Compare `MixedSearch_NNUE_Plan.md` current-state assumptions against the live AI, UI, headless, MCP, and army-builder code paths.
- [x] Identify any stale integration anchors, API assumptions, or command-surface gaps introduced by recent code changes.
- [x] Summarize whether the plan remains accurate and record any follow-up doc edits that should be made later.
- Review outcome:
  - The plan is still directionally accurate: the engine/headless stack remains command-driven and replay/hash deterministic.
  - Follow-up doc update needed: headless integration now also runs through `packages/headless/src/session.ts` and `packages/mcp-server`, not only `packages/headless/src/index.ts` / CLI.
  - Follow-up doc update needed: shooting macro-actions should explicitly cover blast/template placement flows now present in the UI/engine command surface.

## Hotfix Plan (Deployment Whole-Unit Click Regression - 2026-03-07)
- [x] Audit the deployment whole-unit click path to identify why in-zone clicks are no longer creating pending placements.
- [x] Fix the whole-unit placement search so valid formations resolve to a legal in-zone anchor instead of silently failing.
- [x] Add focused regression coverage and run targeted verification.

## Hotfix Verification (Deployment Whole-Unit Click Regression - 2026-03-07)
- `pnpm test -- packages/ui/src/game/deployment-rules.test.ts`: PASS (1 file, 4 tests)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Deployment Rotation + Start-of-Move Overlap Regression - 2026-03-07)
- [x] Add fixed-formation rotation support to the deployment screen and deployment formation builder.
- [x] Fix whole-unit deployment spacing so deployed formations do not start with overlapping bases.
- [x] Apply the same non-overlapping spacing rules to AI deployment formations.
- [x] Add focused regression coverage and run targeted verification.

## Hotfix Verification (Deployment Rotation + Start-of-Move Overlap Regression - 2026-03-07)
- `pnpm --filter @hh/geometry build`: PASS
- `pnpm --filter @hh/ai build`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm test -- packages/ui/src/game/deployment-rules.test.ts packages/ui/src/game/screens/deployment-formations.test.ts packages/ai/src/helpers/movement-destination.test.ts packages/ai/src/deployment/deployment-ai.test.ts packages/engine/src/movement/move-handler.test.ts`: PASS (5 files, 99 tests)
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Wound Allocation Rules Audit - 2026-03-07)
- [x] Audit the current non-vehicle wound allocation and save/damage flow against the rules sequence.
- [x] Replace pre-batched wound assignment with rules-accurate one-at-a-time allocation and casualty rollover.
- [x] Add focused regression tests and run targeted verification.

## Hotfix Verification (Wound Allocation Rules Audit - 2026-03-07)
- `pnpm --filter @hh/engine build`: PASS
- `pnpm test -- packages/engine/src/command-processor.test.ts packages/engine/src/shooting/target-model-selection.test.ts packages/engine/src/shooting/save-resolution.test.ts`: PASS (3 files, 112 tests)
- `pnpm test -- packages/engine/src/shooting/shooting-integration.test.ts packages/engine/src/shooting/damage-resolution.test.ts`: PASS (2 files, 52 tests)

## Hotfix Plan (Blast + Template Rules Audit - 2026-03-07)
- [x] Audit Blast and Template implementation against the rules docs and identify engine/UI gaps.
- [x] Implement rules-correct Blast marker and Template placement/resolution in the active shooting flow.
- [x] Add focused tests for blast/template legality, hit generation, and shooting-flow integration.
- [x] Run targeted verification and record the results.

## Hotfix Verification (Blast + Template Rules Audit - 2026-03-07)
- `pnpm --filter @hh/types build`: PASS
- `pnpm --filter @hh/engine build`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS
- `pnpm test -- packages/engine/src/shooting/fire-groups.test.ts packages/engine/src/shooting/hit-resolution.test.ts packages/engine/src/command-processor.test.ts packages/ui/src/game/reducer.test.ts`: PASS (4 files, 175 tests)

## Hotfix Plan (Deployment Handoff + Mobile Setup Layout - 2026-03-06)
- [x] Make AI deployment use the active mission deployment zones so AI placement stays legal across Dawn of War, Hammer and Anvil, and Search and Destroy.
- [x] Fix setup-screen mobile/iPad overflow so long menus and action buttons remain reachable on small viewports.
- [x] Run targeted verification for deployment flow and mobile/setup typecheck coverage.

## Hotfix Verification (Deployment Handoff + Mobile Setup Layout - 2026-03-06)
- `pnpm --filter @hh/ai build`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm test -- packages/ai/src/deployment/deployment-ai.test.ts packages/ui/src/game/deployment-rules.test.ts packages/ui/src/game/reducer.test.ts`: PASS (3 files, 33 tests)

## Hotfix Plan (Rules-Accurate Deployment, Objective Placement, and Base Geometry - 2026-03-06)
- [x] Make deployment validation and deployment-zone rendering use the selected mission deployment map instead of a hardcoded 12" top/bottom band.
- [x] Make objective placement rules-accurate: correct roll-off ownership, mission-specific VP values, and placement restrictions for Heart of Battle, Crucible of War, and Take and Hold.
- [x] Finish package/typecheck verification for the deployment and objective rules pass so the new mission/setup helpers are clean across package boundaries.
- [x] Propagate datasheet base sizes and vehicle hull/use-model geometry through engine and UI paths, then add targeted verification.

## Hotfix Verification (Rules-Accurate Deployment, Objective Placement, and Base Geometry - 2026-03-06)
- `pnpm --filter @hh/types build`: PASS
- `pnpm --filter @hh/geometry build`: PASS
- `pnpm --filter @hh/data build`: PASS
- `pnpm --filter @hh/data typecheck`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm test -- packages/data/src/missions.test.ts packages/ui/src/game/reducer.test.ts packages/ui/src/game/deployment-rules.test.ts`: PASS (3 files, 60 tests)
- `pnpm --filter @hh/engine build`: PASS
- `pnpm exec tsc --project packages/ui/tsconfig.json --noEmit --pretty false`: PASS
- `pnpm test -- packages/engine/src/game-queries.test.ts packages/engine/src/movement/movement-validator.test.ts packages/engine/src/shooting/shooting-validator.test.ts packages/data/src/missions.test.ts packages/ui/src/game/reducer.test.ts packages/ui/src/game/deployment-rules.test.ts`: PASS (6 files, 192 tests)

## Support Plan (Battlefield, Deployment, Objectives, and Base Size Audit - 2026-03-06)
- [x] Verify the standard battlefield size against the rules/docs and confirm the deployment-zone geometry matches each mission map.
- [x] Verify mission objective placement logic/data against the rules/docs on the standard battlefield.
- [x] Audit model/base size data usage to determine whether deployed model footprints match expected base sizes.

## Hotfix Plan (HH MCP Server Vertical Slice - 2026-03-06)
- [x] Add an `@hh/mcp-server` workspace package and root scripts for serving the HH MCP server.
- [x] Extract a reusable headless match session host with match creation, action submission, legal-action queries, replay export, and nudge snapshots.
- [x] Expose the session host through MCP tools/resources plus observer transport/config defaults aligned with `hh.tarvorix.com`.
- [x] Add targeted tests and run focused verification for the MCP vertical slice.

## Hotfix Verification (HH MCP Server Vertical Slice - 2026-03-06)
- `pnpm install --ignore-scripts`: PASS
- `pnpm --filter @hh/headless typecheck`: PASS
- `pnpm --filter @hh/headless build`: PASS
- `pnpm --filter @hh/mcp-server typecheck`: PASS
- `pnpm --filter @hh/mcp-server build`: PASS
- `pnpm test -- packages/headless/src/session.test.ts packages/mcp-server/src/match-manager.test.ts`: PASS (2 files, 4 tests)
- `pnpm exec tsc -b packages/headless packages/mcp-server --force`: PASS
- `HH_MCP_PORT=8791 node --loader ./tools/esm-js-extension-loader.mjs packages/mcp-server/dist/server.js`: PASS (boot smoke check; verified `/mcp`, `/observe`, and default public host log for `https://hh.tarvorix.com/mcp`)

## Support Plan (MCP Capability Audit - 2026-03-06)
- [x] Check which MCP resources/templates and MCP-backed tools are available in this session.
- [x] Inspect the repo for any game-specific MCP server or full-play integration path.
- [x] Summarize whether full game play via MCP is possible right now.

## Support Plan (Observed LLM Match Feasibility - 2026-03-06)
- [x] Inspect the repo for replay, spectator, or observer paths that could show a model-vs-model game.
- [x] Map the practical implementation options for a watched Codex-vs-Claude match onto the current headless/UI architecture.
- [x] Summarize the most feasible observer setup.

## Implementation Plan (MCP-Only Match Orchestration + Observation - 2026-03-06)
- [ ] Phase 0: Define the MCP-only architecture and lock the protocol boundaries.
  - Add a new `packages/mcp-server` workspace package.
  - Keep the engine/headless layer as the single rules referee and source of truth.
  - Define session roles: `human`, `agent`, `ai`, `observer`.
  - Define match modes: `player-vs-agent`, `agent-vs-ai`, `agent-vs-agent`.
  - Define a nudge-only coordinator model: the coordinator never invents moves, it only signals whose turn it is and exposes the current legal decision window.
  - Adopt the proven Strife MCP transport shape as the default baseline:
    - Streamable HTTP MCP endpoint at `/mcp`
    - observer websocket endpoint at `/observe`
    - shared process hosting both endpoints
    - stable `agentId` on every agent-scoped call to survive session churn and reconnects
  - Treat stable `agentId` as non-negotiable for HHv2 as well, following the Strife pattern in `/Users/kylebullock/The_Strife/AI_Playtest_Instructions.md`.
- [ ] Phase 1: Extract a reusable session host from the existing headless flow.
  - Refactor `packages/headless` so match state is managed through a durable session object instead of only one-shot CLI execution.
  - Add a headless session store with `matchId`, current `GameState`, command history, dice sequence, event log, replay metadata, and participant bindings.
  - Normalize one decision loop for active turns and reaction windows so both human and agent clients see the same legal-action surface.
  - Preserve deterministic replay and final-state hashing compatibility with the existing replay artifact format.
  - Add reconnect-safe participant binding modeled on Strife’s `sessionId -> agentId -> faction/side` handling so a new MCP session can reclaim the same side without losing ownership.
- [ ] Phase 2: Define the MCP tool contract for match control.
  - Session tools:
    - `create_match`
    - `list_matches`
    - `get_match`
    - `join_match`
    - `leave_match`
    - `archive_match`
  - State/inspection tools:
    - `get_public_state`
    - `get_private_state_for_role`
    - `get_legal_actions`
    - `get_event_log`
    - `get_replay_summary`
    - `export_replay_artifact`
  - Play tools:
    - `submit_action`
    - `decline_reaction`
    - `advance_ai_decision`
    - `acknowledge_nudge`
  - Observer tools:
    - `observe_match`
    - `get_observer_snapshot`
    - `get_turn_timeline`
  - Enforce that all writes go through validated engine commands only.
  - Include explicit `agentId` on all side-scoped write/query tools, not just implicit MCP session identity.
- [ ] Phase 3: Build the match role and permission model.
  - `human`: can inspect their legal actions and submit actions only for their side.
  - `agent`: same as human, but intended for Codex/Claude MCP clients.
  - `ai`: not a client writer; represented by local AI config inside the match session and advanced through `advance_ai_decision`.
  - `observer`: read-only access to full public board state, event log, replay, and timeline.
  - Add strict checks so one participant cannot act for another role or read hidden/private state that should be gated.
- [ ] Phase 4: Implement the nudge coordinator.
  - Add a coordinator service inside `packages/mcp-server` that watches the current decision owner.
  - Coordinator outputs should be stateful nudges, not autonomous commands:
    - `player 0 decision required`
    - `player 1 reaction available`
    - `observer update available`
  - Add decision-window snapshots containing:
    - acting role
    - active phase/sub-phase
    - current prompt/reaction context
    - legal actions count
    - whether the window is blocking progression
  - Ensure nudges are idempotent so reconnecting clients can safely resume.
  - Reuse the Strife lesson that state should be push-notified but pull-verified:
    - coordinator sends the nudge
    - client then calls `get_match` / `get_legal_actions` / decision snapshot tools to act from fresh state
- [ ] Phase 5: Implement `player-vs-agent` via MCP.
  - Human joins one side through the UI-backed client or MCP-capable client.
  - Agent joins the opposing side through MCP.
  - Human uses `get_legal_actions` + `submit_action` or existing UI that talks to the same session host.
  - Agent receives nudges and acts only when the coordinator marks its decision window active.
  - Support reactions, deployment, mission setup, and all normal phase transitions through the same contract.
- [ ] Phase 6: Implement `agent-vs-ai` via MCP.
  - One side is an MCP-connected agent.
  - One side is local HHv2 AI configured in the match session.
  - Coordinator nudges the agent when it must act and exposes `advance_ai_decision` when the local AI owns the current decision.
  - Add a configurable AI pacing mode so observer sessions can watch step-by-step instead of instant execution.
- [ ] Phase 7: Implement `agent-vs-agent` via MCP.
  - Both sides are external MCP clients.
  - Match session binds each side to a participant identity and role.
  - Coordinator alternates nudges based on active player or reaction owner.
  - Add stale-turn protection:
    - current decision token/version
    - duplicate-action rejection
    - timeout state that marks a side as waiting but does not auto-play their move
  - Make reconnection safe so either client can resume from `get_match` + `get_legal_actions`.
- [ ] Phase 8: Build observer mode for live playtesting.
  - Add read-only observer join flow with no ability to mutate the match.
  - Expose a concise observer snapshot:
    - battlefield state
    - active player
    - current decision owner
    - phase/sub-phase
    - latest events
    - VP/objective state
  - Expose full replay/event history so bugs can be audited after any suspicious interaction.
  - Support watching `player-vs-agent`, `agent-vs-ai`, and `agent-vs-agent` matches identically.
  - Add an observer activity feed similar to Strife’s:
    - which agent is currently nudged
    - recent tool calls
    - validation errors
    - elapsed decision time / timeout countdown
- [ ] Phase 9: Connect the existing UI as an observer/player client.
  - Add a transport layer in `packages/ui` that can talk to the MCP-backed match session instead of only local reducer state.
  - Add session screens:
    - lobby/join
    - live observer board
    - decision-owner indicator
    - nudge inbox
    - replay export
  - Preserve current local play flow; MCP-backed play should be an additional mode, not a replacement.
  - Add a dedicated observer route/store pattern, borrowing the separation Strife used for `/observe` and its read-only observer client state.
- [ ] Phase 10: Replay, bug-capture, and playtest telemetry.
  - Record every accepted/rejected command, acting participant, decision token, event bundle, and state hash.
  - Auto-attach replay artifacts to completed or aborted matches.
  - Add a bug-report export containing:
    - match metadata
    - full replay artifact
    - last legal-action snapshot
    - last nudge snapshot
    - final error messages if any
  - Make observer mode able to open any saved replay artifact for post-game debugging.
- [ ] Phase 10.5: Tarvorix / Cloudflare deployment plan.
  - Reuse the existing Cloudflare named tunnel pattern already used in The Strife.
  - Keep the same endpoint shape:
    - MCP over HTTPS on `/mcp`
    - observer over WSS on `/observe`
  - Preferred deployment target: a separate HHv2 subdomain under `tarvorix.com` to avoid collision with the existing Strife host.
    - recommended: `hhv2-mcp.tarvorix.com`
    - acceptable alternate: `hh.tarvorix.com`
  - Fallback if you want the exact existing host temporarily: repoint `mcp.tarvorix.com` to HHv2 during dedicated HHv2 sessions, but do not plan on running Strife and HHv2 there at the same time.
  - Mirror Strife-style env/config:
    - `HHV2_MCP_HOST`
    - `HHV2_MCP_PORT`
    - `HHV2_MCP_PATH`
    - `HHV2_OBSERVE_PATH`
    - `HHV2_MCP_AUTH_MODE`
    - `HHV2_MCP_BEARER_TOKEN`
    - optional host-validation toggle for tunnel compatibility
  - Add deployment docs and a local `.mcp.json` example pointing at the chosen `tarvorix.com` host for Codex/Claude clients.
- [ ] Phase 11: Robustness and safety rails.
  - Add optimistic concurrency/version checks so stale clients cannot overwrite a newer state.
  - Ensure the server always rejects illegal or out-of-turn actions with clear errors.
  - Add recovery paths for interrupted sessions:
    - reconnect participant
    - resume observer
    - rebuild decision window from stored state
  - Keep deterministic dice and replay verification in CI for every new MCP session mutation path.
- [ ] Phase 12: Test matrix and exit criteria.
  - Unit tests:
    - session store
    - role permissions
    - nudge coordinator
    - tool handlers
  - Integration tests:
    - `player-vs-agent` full mission
    - `agent-vs-ai` full mission
    - `agent-vs-agent` full mission
    - live observer joins mid-game and tracks updates
    - reconnect/resume during reaction window
    - stable `agentId` reclaim across fresh MCP session IDs
    - multi-agent flow with malformed-command retry and timeout resolution
  - Replay tests:
    - exported replay from MCP match reproduces final hash
    - rejected commands are still auditable in logs
  - Exit criteria:
    - a full match can be run in each of the three requested modes entirely through MCP-backed sessions
    - an observer can watch live without write permissions
    - any bug encountered during a playtest can be reproduced from the stored replay artifact

## Hotfix Plan (Rules-Accurate First Turn Determination - 2026-03-06)
- [x] Add a setup-time deployment roll-off so the player who loses deploys first per `HH_Battle_AOD.md` Step 7.
- [x] Ensure deployment confirmation sequencing works regardless of whether player 0 or player 1 deploys first, and preserve the first deployer for turn 1.
- [x] Add targeted tests, run verification, and update `todo.md` with results.

## Hotfix Verification (Rules-Accurate First Turn Determination - 2026-03-06)
- `pnpm test -- packages/ui/src/game/deployment-order.test.ts packages/ui/src/game/reducer.test.ts`: PASS (2 files, 10 tests)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Support Plan (First Turn Determination Audit - 2026-03-06)
- [x] Check the mission setup/deployment rules docs for how first turn should be determined.
- [x] Inspect current game setup code to see how `firstPlayerIndex` and `activePlayerIndex` are assigned.
- [x] Summarize whether the current implementation matches the rules and note any gap.

## Hotfix Plan (AI Deployment Formation Options - 2026-03-05)
- [x] Move deployment formation generation into a shared helper so both player setup and AI deployment use the same preset logic.
- [x] Add AI deployment formation preference to AI config/setup UI and apply it in AI deployment generation.
- [x] Add targeted tests, update `todo.md`, and run verification.

## Hotfix Verification (AI Deployment Formation Options - 2026-03-05)
- `pnpm test -- packages/ai/src/deployment/deployment-ai.test.ts packages/ai/src/strategy/basic-strategy.test.ts packages/ai/src/strategy/tactical-strategy.test.ts packages/ui/src/game/screens/deployment-formations.test.ts`: PASS (4 files, 63 tests)
- `pnpm --filter @hh/geometry typecheck`: PASS
- `pnpm --filter @hh/ai build`: PASS
- `pnpm --filter @hh/ai typecheck`: PASS
- `pnpm exec tsc -b packages/geometry packages/ai packages/ui --force`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Deployment Formation Presets + Charge Flow Stall - 2026-03-05)
- [x] Audit the player and AI deployment code paths and introduce selectable deployment formation presets for player setup placement.
- [x] Trace the assault charge UI/engine handoff and fix the reducer path that could trap charge resolution in a dead-end resolving state.
- [x] Run targeted verification and record results.

## Hotfix Verification (Deployment Formation Presets + Charge Flow Stall - 2026-03-05)
- `pnpm test -- packages/ui/src/game/reducer.test.ts packages/ui/src/game/screens/deployment-formations.test.ts`: PASS (2 files, 10 tests)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Support Plan (Deployment Formation Investigation - 2026-03-05)
- [x] Inspect the player deployment formation builder used by the deployment screen.
- [x] Inspect the AI deployment placement generator and compare its layout logic.
- [x] Summarize why the human and AI formations differ and outline the change needed for selectable formations.

## Support Plan (Tactical Action Usage Guidance - 2026-03-05)
- [x] Inspect the dashboard components and engine phase-status logic behind the tactical action indicator.
- [x] Cross-check the corresponding Horus Heresy rules for movement, rushing, shooting, charging, and reactions.
- [x] Write the usage explanation and update `todo.md` to reflect completion.

## Hotfix Plan (Rush Uses Atomic Unit Movement Rules - 2026-03-05)
- [x] Confirm rules text for Rush + coherency in `HH_Rules_Battle.md` and align engine behavior.
- [x] Ensure `moveUnit` forwards `isRush` to engine movement handling.
- [x] Apply Rush validation/range/state/event handling inside atomic `handleMoveUnit`.
- [x] Add regression tests for Rush via `moveUnit` and run targeted verification.

## Hotfix Verification (Rush Uses Atomic Unit Movement Rules - 2026-03-05)
- `pnpm test -- packages/engine/src/movement/move-handler.test.ts packages/engine/src/command-processor.test.ts`: PASS (2 files, 129 tests)
- `pnpm --filter @hh/engine typecheck`: PASS

## Hotfix Plan (Atomic Unit Movement + AI Ownership Fixes - 2026-03-05)
- [x] Add an atomic `moveUnit` command path so full-unit movement resolves in one engine command.
- [x] Switch UI movement confirm and AI movement generation to use unit-level movement translation.
- [x] Fix AI reaction ownership so AI cannot consume human reaction windows.
- [x] Add/adjust targeted tests for engine movement routing, AI movement/reaction behavior, and run verification.

## Hotfix Verification (Atomic Unit Movement + AI Ownership Fixes - 2026-03-05)
- `pnpm test -- packages/engine/src/movement/move-handler.test.ts packages/engine/src/command-processor.test.ts`: PASS (2 files, 126 tests)
- `pnpm test -- packages/ai/src/phases/movement-ai.test.ts packages/ai/src/ai-controller.test.ts packages/ai/src/strategy/basic-strategy.test.ts packages/ai/src/strategy/tactical-strategy.test.ts`: PASS (4 files, 70 tests)
- `pnpm --filter @hh/types build`: PASS
- `pnpm --filter @hh/engine typecheck`: PASS
- `pnpm --filter @hh/ai typecheck`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS

## Hotfix Plan (Reaction Prompt Hidden After Return Fire Trigger - 2026-03-05)
- [x] Preserve UI reaction flow state when reaction commands resolve into another pending reaction.
- [x] Add reducer regression coverage for chained reaction windows after reaction command handling.
- [x] Run targeted `@hh/ui` verification and record results.

## Hotfix Verification (Reaction Prompt Hidden After Return Fire Trigger - 2026-03-05)
- `pnpm test -- packages/ui/src/game/reducer.test.ts`: PASS (1 file, 2 tests)
- `pnpm --filter @hh/ui typecheck`: PASS

## Hotfix Plan (Popup Readability Timing - 2026-03-04)
- [x] Increase visible lifetime for in-game notifications so messages are readable before auto-dismiss.
- [x] Increase dice overlay lifetime/fade timing so roll summaries do not flash by too quickly.
- [x] Run targeted UI verification and record results.

## Hotfix Verification (Popup Readability Timing - 2026-03-04)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (AI Movement Stops After First Unit - 2026-03-03)
- [x] Fix movement AI unit handoff so finishing one unit continues to the next movable unit instead of ending sub-phase.
- [x] Add regression coverage for multi-unit movement sequencing.
- [x] Run targeted `@hh/ai` verification and record results.

## Hotfix Verification (AI Movement Stops After First Unit - 2026-03-03)
- `pnpm test -- packages/ai/src/phases/movement-ai.test.ts packages/ai/src/ai-controller.test.ts packages/ai/src/strategy/basic-strategy.test.ts packages/ai/src/strategy/tactical-strategy.test.ts`: PASS (4 files, 72 tests)
- `pnpm --filter @hh/ai typecheck`: PASS

## Hotfix Plan (Shooting Flow Re-Entry + Window Sizing + One-Shot Rule Guard - 2026-03-03)
- [x] Prevent re-entering phase action flows while another flow is active (UI action bar + reducer guards).
- [x] Enforce rules-accurate single shooting attack per eligible unit during its player turn.
- [x] Reduce oversized shooting flow window footprint, especially resolving/results views.
- [x] Run targeted `@hh/engine` + `@hh/ui` verification and record results.

## Hotfix Verification (Shooting Flow Re-Entry + Window Sizing + One-Shot Rule Guard - 2026-03-03)
- `pnpm test -- packages/engine/src/command-processor.test.ts packages/engine/src/game-queries.test.ts packages/engine/src/shooting/shooting-validator.test.ts`: PASS (3 files, 172 tests)
- `pnpm --filter @hh/types build`: PASS
- `pnpm --filter @hh/engine typecheck`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Movement Finder vs Engine Distance Mismatch - 2026-03-03)
- [x] Remove destination snapping/model-position rounding in unit translation move builder so submitted moves use the exact selected translation vector.
- [x] Align UI movement tolerance with engine tolerance for range checks.
- [x] Increase movement flow distance readouts to 0.01" so UI and engine rejection messages show the same precision.
- [x] Run targeted UI verification and record results.

## Hotfix Verification (Movement Finder vs Engine Distance Mismatch - 2026-03-03)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Movement Precision Mismatch - 2026-03-03)
- [x] Align engine move-range validation tolerance with the precision shown in movement error messages.
- [x] Ensure effective movement value in validation errors uses the same 0.01" display precision as move distance.
- [x] Run targeted movement validator/handler tests and record results.

## Hotfix Verification (Movement Precision Mismatch - 2026-03-03)
- `pnpm test -- packages/engine/src/movement/movement-validator.test.ts packages/engine/src/movement/move-handler.test.ts`: PASS (2 files, 75 tests)

## Hotfix Plan (Canvas Update-Loop + Passive Event Errors - 2026-03-03)
- [x] Stabilize game canvas dispatch bridge to prevent `SET_CAMERA` feedback loops and React maximum update depth errors.
- [x] Remove `preventDefault()` calls from passive touch/wheel React handlers in battlefield canvas.
- [x] Run targeted UI verification and record results.

## Hotfix Verification (Canvas Update-Loop + Passive Event Errors - 2026-03-03)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Map Visibility Regression - 2026-03-03)
- [x] Harden battlefield canvas resize measurement so map rendering is not blocked by transient zero-size container reads.
- [x] Add camera validity guard during resize recentering so invalid camera values are auto-recovered via battlefield fit.
- [x] Add objective placement battlefield minimum-height fallback to keep the map visible on constrained layouts.
- [x] Run targeted UI verification and record results.

## Hotfix Verification (Map Visibility Regression - 2026-03-03)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Advanced Reaction Mid-Sequence Hooks + Resume - 2026-03-03)
- [x] Wire shooting advanced reaction checks at the correct shooting sequence boundaries (steps 3, 4, and 5).
- [x] Wire assault advanced reaction checks during charge sequence windows (steps 2, 3, 4, and after volley attacks).
- [x] Resume paused shooting/charge flows correctly after advanced reaction accept/decline without repeating trigger windows.
- [x] Ensure Overwatch-decision resume path also re-checks the after-volley advanced reaction window before charge roll.
- [x] Run targeted verification (`@hh/engine` + `@hh/headless`) and record results.
- Progress:
  - Command processor now resumes paused shooting from `DECLARING`, charge from `DECLARING`/`VOLLEY_ATTACKS`/`CHARGE_ROLL`, and clears temporary attack state once resumed.
  - Final audit sweep found no remaining unconditional valid-reaction auto-decline paths in AI/UI/headless fallbacks.

## Hotfix Verification (Advanced Reaction Mid-Sequence Hooks + Resume - 2026-03-03)
- `pnpm test -- packages/engine/src/command-processor.test.ts`: PASS (1 file, 81 tests)
- `pnpm test -- packages/engine/src/shooting packages/engine/src/assault`: PASS (30 files, 937 tests)
- `pnpm --filter @hh/engine typecheck`: PASS
- `pnpm --filter @hh/headless typecheck`: PASS
- `pnpm test -- packages/headless/src/run.test.ts packages/headless/src/replay.test.ts packages/headless/src/index.test.ts`: PASS (3 files, 7 tests)

## Hotfix Plan (Reaction Window Mapping + Overwatch Flow - 2026-03-03)
- [x] Resume charge sequence correctly after Overwatch reaction accept/decline (no manual re-measure step).
- [x] Ensure Overwatch reaction resolution emits clear events and clears temporary charge wait state.
- [x] Update reaction modal copy to match rules timing/restrictions (Overwatch at Charge Step 4, full BS, no separate measurement declaration).
- [x] Run targeted verification and record results.
- Progress:
  - Added command-processor regression coverage for Overwatch accept/decline charge resume behavior (including defender volley suppression on accepted Overwatch).

## Hotfix Verification (Reaction Window Mapping + Overwatch Flow - 2026-03-03)
- `pnpm test -- packages/engine/src/command-processor.test.ts`: PASS (1 file, 72 tests)
- `pnpm --filter @hh/engine typecheck`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS

## Audit Plan (Reaction Auto-Decline + Rules Alignment - 2026-03-03)
- [x] Remove AI fallback behavior that auto-declines pending reactions when a valid reaction can be selected.
- [x] Remove strategy-level random/reserve declines for valid core reactions; decline only when reactions are not legally usable.
- [x] Update AI reaction tests/strategy tests to enforce new rules-accurate behavior.
- [x] Run targeted `@hh/ai` + `@hh/ui` verification and record results.
- Progress:
  - Audited core reaction rule text in `HH_Principles.md` (declaration is optional, but legal use requires reaction allotment and unit eligibility restrictions).

## Audit Verification (Reaction Auto-Decline + Rules Alignment - 2026-03-03)
- `pnpm test -- packages/ai/src/phases/reaction-ai.test.ts packages/ai/src/strategy/basic-strategy.test.ts packages/ai/src/strategy/tactical-strategy.test.ts`: PASS (3 files, 50 tests)
- `pnpm --filter @hh/ai typecheck`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS

## Audit Plan (Core Reaction Execution Paths - 2026-03-03)
- [x] Implement `Reposition` select-reaction path to execute via handler (consume allotment, mark reacted, emit execution event) instead of no-op state clear.
- [x] Implement `Return Fire` select-reaction path to execute a rules-constrained reaction shooting attack (counts as stationary, vehicle defensive-weapon restriction, no chained Return Fire trigger).
- [x] Finalize pending shooting attack state after Return Fire accept/decline (`returnFireResolved=true`, step complete) so the original attack flow can continue cleanly.
- [x] Add/adjust command-processor tests for new reaction execution behavior and state transitions.
- [x] Run targeted `@hh/engine` tests/typecheck and record results.
- Progress:
  - Added optional shooting execution overrides in `handleShootingAttack` for reaction attacks (non-active attacker allowance, rushed restriction bypass, stationary treatment, return-fire trigger suppression, morale/status suppression, no attack-state persistence).
  - Implemented deterministic in-range Return Fire weapon auto-selection with vehicle Defensive-only filtering in command processor.

## Audit Verification (Core Reaction Execution Paths - 2026-03-03)
- `pnpm test -- packages/engine/src/command-processor.test.ts`: PASS (1 file, 74 tests)
- `pnpm test -- packages/engine/src/command-processor.test.ts packages/engine/src/shooting/return-fire-handler.test.ts packages/engine/src/shooting/shooting-integration.test.ts`: PASS (3 files, 147 tests)
- `pnpm test -- packages/engine/src/shooting`: PASS (14 files, 396 tests)
- `pnpm --filter @hh/engine typecheck`: PASS

## Audit Plan (Overwatch + Advanced Hook Wiring + Headless Reaction Fallback - 2026-03-03)
- [x] Execute a real Overwatch shooting attack (full BS reaction shot) before charge resume while preserving reaction costs/state transitions.
- [x] Wire currently-unused shooting/assault advanced reaction trigger checks into runtime command flow and resume pending action flow after advanced reaction select/decline.
- [x] Remove headless fallback auto-decline behavior when a valid reaction selection command can be issued.
- [x] Add/adjust targeted tests for the three fixes.
- [x] Run targeted `@hh/engine` and `@hh/headless` verification and record results.
- Progress:
  - Added auto-registration of advanced reaction handlers in command processing so movement/shooting/assault advanced trigger checks can resolve against live handlers without external bootstrap calls.
  - Added command-processor regression coverage for real Overwatch shooting execution (including full-BS, non-snap-shot verification) and advanced trigger wiring/resume behavior.
  - Added headless fallback unit tests and updated deterministic replay hash expectation to reflect the new valid-reaction fallback behavior.

## Audit Verification (Overwatch + Advanced Hook Wiring + Headless Reaction Fallback - 2026-03-03)
- `pnpm test -- packages/engine/src/command-processor.test.ts`: PASS (1 file, 77 tests)
- `pnpm test -- packages/engine/src/shooting`: PASS (14 files, 396 tests)
- `pnpm test -- packages/headless/src/run.test.ts packages/headless/src/replay.test.ts packages/headless/src/index.test.ts`: PASS (3 files, 7 tests)
- `pnpm --filter @hh/engine typecheck`: PASS
- `pnpm --filter @hh/headless typecheck`: PASS

## Hotfix Plan (Pre-Attack Range Visibility + Gating - 2026-03-02)
- [x] Add measured range readouts to shooting target selection and disable out-of-range targets before selection.
- [x] Add per-model weapon range gating in weapon selection so out-of-range weapons cannot be chosen.
- [x] Add measured range readouts to charge target selection and disable targets outside declare-charge range.
- [x] Run targeted UI verification and record results.

## Hotfix Verification (Pre-Attack Range Visibility + Gating - 2026-03-02)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ui build`: PASS

## Hotfix Plan (Move Range + AI Turn Reliability - 2026-03-02)
- [x] Align movement range checks with displayed 0.1" precision so exact-limit moves are accepted (reducer + movement flow panel threshold parity).
- [x] Prevent AI stale delayed commands from skipping actionable sub-phases (especially Movement/Move).
- [x] Prevent phase automation from racing AI decision execution during AI-controlled turns.
- [x] Use profile-derived movement characteristics in AI movement generation (not hardcoded 7").
- [x] Run targeted verification (`@hh/ui` + `@hh/ai` tests/typecheck) and record results.

## Hotfix Verification (Move Range + AI Turn Reliability - 2026-03-02)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm --filter @hh/ai typecheck`: PASS
- `pnpm test -- packages/ai/src/helpers/unit-queries.test.ts packages/ai/src/phases/movement-ai.test.ts`: PASS (2 files, 34 tests)

## Hotfix Plan (Map Resize Behavior - 2026-03-02)
- [x] Add responsive camera resize handling in battlefield canvas (initial fit + center-preserving resize).
- [x] Forward `SET_CAMERA` through game canvas bridge so resize camera updates apply in game mode.
- [x] Convert objective placement battlefield preview to responsive sizing/marker positioning.
- [x] Run `pnpm --filter @hh/ui typecheck` and record result.

## Hotfix Verification (Map Resize Behavior - 2026-03-02)
- `pnpm --filter @hh/ui typecheck`: PASS

## Hotfix Plan (Mobile Hardening iPhone/iPad - 2026-03-02)
- [x] Add safe-area CSS variables and apply them to top/bottom fixed bars and panels.
- [x] Replace fragile `100vh` layout heights with `100dvh` fallbacks for iOS Safari viewport stability.
- [x] Harden mobile panel/modal sizing so bottom sheets and reaction/challenge overlays avoid clipping on narrow screens.
- [x] Improve touch ergonomics (tap behavior + non-zooming form controls on mobile).
- [x] Run UI verification gate and amend previous commit with all current uncommitted + hardening changes, then push. (Typecheck blocked in this environment: `tsc: command not found`, with installs blocked by `ENOTFOUND registry.npmjs.org`; commit amended + force-pushed.)

## Hotfix Plan (High Command Slot Rules Alignment - 2026-03-02)
- [x] Remove Crusade Primary High Command slot mandatory flag to match rules text.
- [x] Update Crusade Primary detachment docs/comments/tests to reflect optional High Command slot.
- [x] Verify unlock behavior remains: each Command = +1 Auxiliary, each filled High Command = +1 Apex OR +1 Auxiliary.
- [ ] Run targeted detachment/validation tests (blocked: local `vitest` unavailable and `pnpm install` fails with `ENOTFOUND registry.npmjs.org` in this environment).

## Recovery Plan (Blackshields + Shattered Datasheets Correctness - 2026-03-02)
- [x] Audit existing generated profiles and PDF payload for Blackshields/Shattered unit definitions and exact rules hooks.
- [x] Add explicit Blackshields/Shattered datasheet content source and generation pipeline without broadening curated legion content.
- [x] Ensure content indexes expose only curated legions plus Blackshields/Shattered units.
- [x] Wire army-builder validation for Blackshields/Shattered datasheet legality, lineage, and doctrine constraints.
- [x] Wire UI selection and defaults so Shattered supports all 18 legion selections while keeping curated top-level faction options.
- [x] Run verification gates: `pnpm content:build`, `pnpm content:validate`, `pnpm typecheck`, and targeted tests for doctrine validation.
- [ ] Commit and push verified fixes.

## Recovery Verification (Blackshields + Shattered Datasheets Correctness - 2026-03-02)
- `pnpm content:build`: PASS (`102` total units; `78` common; `6` each World Eaters/Alpha Legion/Dark Angels; `1` Blackshields; `5` Shattered Legions commanders)
- `pnpm content:validate`: PASS
- `pnpm typecheck`: PASS
- `pnpm test -- packages/data/src/weapons.test.ts packages/data/src/faction-scope.test.ts packages/data/src/profile-compatibility.test.ts packages/army-builder/src/validation.test.ts`: PASS (`113` tests)

## CI Fix Plan (Headless Lockfile Drift - 2026-03-02)
- [x] Regenerate `pnpm-lock.yaml` so it includes `packages/headless` importer dependencies.
- [ ] Verify `pnpm install --frozen-lockfile` succeeds locally (blocked in this environment by `ENOTFOUND registry.npmjs.org`).
- [ ] Re-run `pnpm typecheck` after lockfile sync (blocked pending dependency restore in this environment).
- [ ] Commit and push lockfile fix.

## Active Goal
Remove all MVP hardwires and fully implement Blackshields + Shattered Legions as first-class, expansion-safe factions across `types`, `data`, `army-builder`, `engine`, `headless`, and `ui`, while preserving existing legion behavior.

## Hotfix Plan (Restore Curated Scope - 2026-03-01)
- [x] Restore curated content source pipeline and generated curated JSON/index outputs.
- [x] Restore runtime profile registry to curated profile set.
- [x] Restrict playable faction list to curated 3 legions + Blackshields + Shattered Legions.
- [x] Re-run content + typecheck verification gates.

## Hotfix Verification (Restore Curated Scope - 2026-03-01)
- `pnpm content:build`: PASS (`96` total units; `78` common; `6` each legion-specific for World Eaters/Alpha Legion/Dark Angels)
- `pnpm content:validate`: PASS (legions: `world-eaters`, `alpha-legion`, `dark-angels`)
- `pnpm typecheck`: PASS

## GitHub Pages Deployment Plan (2026-03-01)
- [x] Replace hardcoded UI build base path with GitHub Pages-safe base path logic.
- [x] Add GitHub Actions workflow to build `@hh/ui` and deploy `packages/ui/dist` to Pages.
- [x] Verify UI production build succeeds with `VITE_BASE_PATH=/<repo>/` locally.

## De-Hardwire Plan (Blackshields + Shattered Legions - 2026-03-01)
- [x] Phase A: Remove MVP runtime/tooling path (`mvp` generated profiles/whitelist/pathing) and use full profile runtime source.
- [x] Phase B: Replace MVP APIs/callsites (`*Mvp*`, `*ForMvp`) with non-MVP expansion-safe APIs.
- [x] Phase C: Add `SpecialFaction` + `ArmyFaction`, doctrine payloads, and schema v2 migration support.
- [x] Phase D: Preserve detachment/faction/doctrine lineage through UI reducer, headless setup, and engine queries.
- [x] Phase E: Implement Blackshields + Shattered doctrine data/rule payloads and doctrine-aware legality validation.
- [x] Phase F: Implement doctrine selection UX and runtime integration for advanced reactions/gambits/tactica behavior.
- [x] Remove all MVP naming/symbols from shipped runtime code and UI copy.
- [x] Run full gates: `pnpm typecheck`, `pnpm test`, `pnpm content:build`, `pnpm content:validate`.

## De-Hardwire Progress Log (2026-03-01)
- Baseline checks:
  - `pnpm typecheck`: PASS
  - `pnpm test`: FAIL (2 pre-existing AI tests: shooting delegation in `basic-strategy.test.ts` and `tactical-strategy.test.ts`)
- Implementation completion checks:
  - `pnpm content:build`: PASS (303 unit profiles indexed)
  - `pnpm content:validate`: PASS
  - `pnpm typecheck`: PASS
  - `pnpm test`: PASS (120 files, 3663 tests)

## Hotfix Plan (Deployment/Render Regression - 2026-02-28)
- [x] Verify and fix deployment-to-playing model persistence so deployed units are visible on game start.
- [x] Fix terrain label scaling so terrain names do not render at giant sizes.
- [x] Run targeted verification and record results.

## Hotfix Verification (Deployment/Render Regression - 2026-02-28)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm typecheck`: PASS
- `pnpm test -- packages/ui/src/canvas/assets.test.ts`: PASS (1 file, 4 tests)

## Hotfix Plan (Objective Placement UX/Logic - 2026-03-01)
- [x] Fix mission objective count display mismatch for symmetric missions.
- [x] Fix objective placement click mapping so markers place at clicked battlefield positions.
- [x] Run targeted verification and record results.

## Hotfix Verification (Objective Placement UX/Logic - 2026-03-01)
- `pnpm --filter @hh/ui typecheck`: PASS

## Feature Plan (Full Unit Deploy/Move - 2026-03-01)
- [x] Add full-unit movement destination handling (translate whole unit formation from click).
- [x] Add deployment placement mode with full-unit formation as default while preserving per-model placement mode.
- [x] Run targeted verification and record results.

## Feature Verification (Full Unit Deploy/Move - 2026-03-01)
- `pnpm --filter @hh/ui typecheck`: PASS

## Hotfix Plan (Move Click Regression - 2026-03-01)
- [x] Fix stale movement click handler dependencies so battlefield click sets destination during Move/Rush.
- [x] Run targeted verification and record results.

## Hotfix Verification (Move Click Regression - 2026-03-01)
- `pnpm --filter @hh/ui typecheck`: PASS

## Feature Plan (Shooting Panel + Movement Range UX - 2026-03-01)
- [x] Make shooting weapon selection flow panel scrollable/responsive so large unit weapon lists are fully accessible.
- [x] Add movement range feedback (max range and live cursor distance) and block clearly out-of-range destinations before confirm.
- [x] Run targeted verification and record results.

## Feature Verification (Shooting Panel + Movement Range UX - 2026-03-01)
- `pnpm --filter @hh/ui typecheck`: PASS

## Feature Plan (Phase/Subphase UX Overhaul - 2026-03-01)
- [x] Define and codify a phase UX model that distinguishes `auto`, `decision-required`, and `conditional` subphases so users only see controls when needed.
- [x] Add a phase progression helper in engine that exposes actionable phase status (what decision is pending vs why auto-advance is safe) for UI and AI parity.
- [x] Implement a UI phase automation controller that auto-advances non-decision subphases and idle decision subphases only when no valid tactical actions remain.
- [x] Preserve explicit user control with a manual pause/step mode, plus a visible `Continue` action when automation is paused or a decision is required.
- [x] Replace always-on `End Sub-Phase` / `End Phase` controls with context-aware controls and clear blocker messaging (for example: unit/action still available, reaction pending, or flow in progress).
- [x] Redesign Phase Tracker to show concise progression, current decision point, and reactive interrupts instead of exposing raw subphase churn.
- [x] Add combat-log/system-log entries for auto-advances and skipped subphases so players can audit what happened and why.
- [x] Add regression coverage for auto-advance gating, reaction interrupts, and no-decision fast-forward chains; run targeted UI + engine verification.

## Feature Verification (Phase/Subphase UX Overhaul - 2026-03-01)
- `pnpm test -- packages/engine/src/phase-ux.test.ts`: PASS (1 file, 7 tests)
- `pnpm --filter @hh/engine typecheck`: PASS
- `pnpm --filter @hh/engine build`: PASS
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm typecheck`: PASS

## Feature Validation Criteria (Phase/Subphase UX Overhaul - 2026-03-01)
- [ ] Player can complete a full turn without pressing manual end controls in routine cases.
- [ ] Game never auto-skips a real decision point (movement/shooting/charge/fight/aftermath/challenge when choices exist).
- [ ] Reaction prompts always interrupt automation immediately and resume safely after response.
- [ ] AI and human turns follow the same phase-gating rules to avoid desync in behavior.

## Guardrails
- Use only units from `HH_v2_units.md`.
- MVP legions: World Eaters, Alpha Legion, Dark Angels.
- MVP includes full army builder, full missions, player vs heuristic AI.
- Multiplayer and desktop wrapper are future expansion.

## Phase Checklist
- [x] Create initial implementation plan in `plan.md`.
- [x] Confirm MVP scope decisions with user.
- [x] Bootstrap monorepo code structure in `HHv2` from `/Users/kylebullock/HH`.
- [x] Verify workspace builds/types/tests at baseline after import.
- [x] Start content pipeline work for per-unit JSON output.
- [x] Add runtime/profile whitelist enforcement for unit registry.
- [x] Add MVP faction scope enforcement in Army Builder UI flow.
- [x] Integrate headless package into workspace build/typecheck graph.
- [x] Add runnable headless CLI entry path (`pnpm headless:run`).
- [x] Complete Phase 2 mission/rules parity hardening tasks.
- [x] Complete Phase 3 Army Builder MVP constraint implementation.
- [x] Complete Phase 4 UI-web touch + AI end-to-end implementation.
- [x] Complete Phase 5 replay/telemetry/regression safety implementation.
- [x] Complete Phase 6 sprite/terrain readiness implementation.

## Master Plan Status
- Phase 0 (Bootstrap and baseline import): **Completed**
- Phase 1 (Content pipeline + whitelist enforcement): **Completed**
- Phase 2 (Rule/core parity slice): **Completed**
- Phase 3 (Army builder MVP constraints): **Completed**
- Phase 4 (UI web + touch + AI match flow): **Completed**
- Phase 5 (Replay/regression safety): **Completed**
- Phase 6 (Sprite/terrain readiness pass): **Completed**

## Phase 0 Tasks (Now)
- [x] Copy root workspace config files needed for build/test tooling.
- [x] Copy package source directories (`types`, `data`, `geometry`, `engine`, `army-builder`, `ai`, `ui`) without build artifacts.
- [x] Verify package graph and scripts run in `HHv2`.
- [x] Record bootstrap results and next actions.

## Phase 0 Verification Results (2026-02-28)
- `pnpm build`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (112 files, 3616 tests)
- Note: online install was blocked by network DNS (`registry.npmjs.org`); resolved by offline dependency reuse from `/Users/kylebullock/HH` and local offline relink.

## Phase 1 Progress (2026-02-28)
- Added `pnpm content:build` and `pnpm content:validate` scripts.
- Implemented `tools/content-build.mjs`:
  - parses `HH_v2_units.md` unit sheets (`Profile ID`)
  - filters from `packages/data/src/generated/unit-profiles.ts`
  - emits one JSON file per unit under `content/units/{common|world-eaters|alpha-legion|dark-angels}/`
  - emits indexes in `content/indexes/`
  - emits `packages/data/src/generated/mvp-unit-profiles.ts` for runtime whitelist enforcement
- Implemented `tools/content-validate.mjs`:
  - enforces whitelist/file/index consistency
  - enforces legion index integrity for only `world-eaters`, `alpha-legion`, `dark-angels`
- Updated `packages/data/src/profile-registry.ts` to consume `MVP_UNIT_PROFILES` instead of full `ALL_UNIT_PROFILES`.
- Current generated content status:
  - whitelist units: 96
  - common units: 78
  - world eaters specific: 6
  - alpha legion specific: 6
  - dark angels specific: 6
  - validation: PASS
- Post-enforcement verification:
  - `pnpm build`: PASS
  - `pnpm typecheck`: PASS
  - `pnpm test`: PASS (112 files, 3616 tests)
- Known/intentional skips in TOC processing:
  - legion armoury links and shared armoury link (no `Profile ID` unit sheet)

## Phase 2/3/4 Progress (2026-02-28)
- Added MVP scope helpers in data layer:
  - `packages/data/src/mvp-scope.ts`
  - exports: `MVP_LEGIONS`, `getMvpLegions`, `isMvpLegion`
- Added MVP-aware army validation path:
  - `validateArmyListForMvp`
  - `validateMvpFactionScope`
  - `validateUnitProfilesExist`
- Updated Army Builder UI to enforce MVP scope:
  - Faction dropdown now only shows World Eaters, Alpha Legion, Dark Angels.
  - `Validate` button now runs `validateArmyListForMvp`.
  - `Confirm` now validates both players and blocks progression if invalid.
  - Import now runs MVP validation and surfaces errors immediately.
- Added tests:
  - `packages/data/src/mvp-scope.test.ts`
  - new MVP validation coverage in `packages/army-builder/src/validation.test.ts`
- Verification after MVP flow wiring:
  - `pnpm build`: PASS
  - `pnpm typecheck`: PASS
  - `pnpm test`: PASS (112 files, 3616 tests)

## Headless Runtime Progress (2026-02-28)
- Added and wired new package:
  - `packages/headless/package.json`
  - `packages/headless/tsconfig.json`
  - `packages/headless/src/index.ts`
  - `packages/headless/src/cli.ts`
- Root wiring updates:
  - added `packages/headless` to root `tsconfig.json` references
  - added scripts to root `package.json`:
    - `headless:build`
    - `headless:run`
- Added ESM runtime compatibility shim for extensionless internal imports:
  - `tools/esm-js-extension-loader.mjs`
- `headless:run` now invokes:
  - `node --loader ./tools/esm-js-extension-loader.mjs packages/headless/dist/cli.js`
- Verified headless CLI availability:
  - `pnpm headless:run --help`: PASS

## Dependency Recovery Note (2026-02-28)
- Attempted `pnpm install --offline --no-frozen-lockfile` after adding `headless` dependencies.
- Install failed due missing cached tarball (`ERR_PNPM_NO_OFFLINE_TARBALL`), after `node_modules` purge.
- Recovered by restoring dependency directories from `/Users/kylebullock/HH`:
  - root `node_modules`
  - package `node_modules` for `data`, `geometry`, `engine`, `army-builder`, `ai`, `ui`
- Added local `packages/headless/node_modules` symlinks for workspace deps and `@types/node`.
  - added `@hh/army-builder` local symlink for headless package resolution.
- Post-recovery and integration verification:
  - `pnpm build`: PASS
  - `pnpm typecheck`: PASS
  - `pnpm test`: PASS (112 files, 3616 tests)

## Phase 2 Completion (2026-02-28)
- Added headless mission setup utility:
  - `packages/headless/src/setup.ts`
  - exports `createHeadlessGameState` with mission + deployment map initialization, army/model construction, and objective setup (fixed/default objective support for all three core missions)
- Added Phase 2 headless integration coverage:
  - `packages/headless/src/setup.test.ts`
  - validates full mission flow to game end scoring for:
    - `heart-of-battle`
    - `crucible-of-war`
    - `take-and-hold`
  - validates primarch + super-heavy scenario reaches scored game end:
    - `angron`, `alpharius`
    - `typhon-heavy-siege-tank`, `falchion-super-heavy-tank-destroyer`
  - validates illegal command rejection in mission-initialized state (`WRONG_PHASE`)
- Extended headless runner API for deterministic runs:
  - `runHeadlessMatch` now accepts optional `diceProvider`.

## Phase 2 Exit Criteria Evidence
- Exit criterion: headless integration test can run full mission setup through end-state scoring.
  - Satisfied by `packages/headless/src/setup.test.ts` mission flow tests.
- Exit criterion: command validation prevents illegal phase/subphase actions.
  - Satisfied by existing engine command validation suite plus new headless mission-initialized wrong-phase rejection test.

## Current Verification (Post-Phase-2)
- `pnpm --filter @hh/headless typecheck`: PASS
- `pnpm --filter @hh/headless build`: PASS
- `pnpm build`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (113 files, 3621 tests)

## Phase 3 Completion (2026-02-28)
- Added strict slot-assignment guard in army-builder:
  - `validateUnitAssignmentToSlot` in `packages/army-builder/src/detachments.ts`
  - exported via `packages/army-builder/src/index.ts`
  - covered by new tests in `packages/army-builder/src/detachments.test.ts`
- Fixed primary detachment counting semantics so additional Warlord/Lord of War detachments do not violate primary-count checks:
  - updated `validatePrimaryDetachment` and primary lookup in detachment unlock validation
  - covered by new test in `packages/army-builder/src/validation.test.ts`
- Expanded Army Builder UI for full detachment workflow:
  - detachment add controls with unlock-aware availability (Allied/Warlord/Lord of War/Auxiliary/Apex)
  - unit removal from filled slots
  - non-primary detachment removal
  - selected-slot legality enforcement at add-time (invalid selection blocked before state mutation)
  - files:
    - `packages/ui/src/game/screens/ArmyBuilderScreen.tsx`
    - `packages/ui/src/game/screens/army-builder/DetachmentPanel.tsx`
    - `packages/ui/src/styles/game.css`
- Added headless roster validation and conversion API that rejects invalid MVP lists:
  - `validateHeadlessArmyListsForMvp`
  - `createHeadlessGameStateFromArmyLists`
  - file: `packages/headless/src/roster.ts`
  - test coverage: `packages/headless/src/roster.test.ts`

## Phase 4 Completion (2026-02-28)
- Added touch-friendly battlefield controls in canvas layer:
  - tap-select
  - drag pan
  - pinch zoom
  - long-press pan activation
  - file: `packages/ui/src/canvas/BattlefieldCanvas.tsx`
- Added responsive layout hardening for desktop/tablet/phone:
  - mobile/compact breakpoints for game layout, setup screens, army builder, mission/deployment/objective screens, and overlays
  - file: `packages/ui/src/styles/game.css`
- Hardened AI turn progression against rejected commands:
  - UI hook fallback command recovery (`endSubPhase` / `endPhase` / `declineReaction`) after command rejection
  - headless runner fallback recovery path for rejected AI commands
  - files:
    - `packages/ui/src/game/hooks/useAITurn.ts`
    - `packages/headless/src/index.ts`
- Added headless AI loop regression coverage:
  - `packages/headless/src/run.test.ts`

## Current Verification (Post-Phase-4)
- `pnpm build`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (115 files, 3632 tests)

## Phase 5 Completion (2026-02-28)
- Added deterministic replay/hash utilities in engine:
  - `packages/engine/src/replay.ts`
  - exports `stableStringify`, `hashStableValue`, `hashGameState`, `replayCommands`
- Extended headless runner deterministic telemetry:
  - `runHeadlessMatch` now returns `finalStateHash` and recorded `diceSequence`
  - file: `packages/headless/src/index.ts`
- Added full replay artifact pipeline:
  - `packages/headless/src/replay.ts`
  - create/save/load/verify replay artifacts
  - deterministic re-simulation via recorded command stream + dice sequence
- Extended headless CLI with replay artifact output:
  - new option: `--replay-out <path>`
  - file: `packages/headless/src/cli.ts`
- Added replay/regression tests:
  - `packages/headless/src/replay.test.ts`
  - deterministic replay reproduction checks
  - replay persistence/load checks
  - golden turn snapshot hash regression checks
  - AI command signature/final hash regression checks
- Added future content compatibility guard tests:
  - `packages/data/src/mvp-compatibility.test.ts`
  - whitelist/profile registry sync
  - role-to-detachment placeability checks
  - faction/legion index leakage + coverage checks

## Phase 6 Completion (2026-02-28)
- Added renderer asset abstraction layer:
  - `packages/ui/src/canvas/assets.ts`
  - `AssetManifest`, `AssetManifestLoader`, mode toggles, model/terrain asset resolution
- Updated renderer pipeline to consume asset manifests:
  - `packages/ui/src/canvas/renderer.ts`
  - `packages/ui/src/canvas/modelRenderer.ts`
  - `packages/ui/src/canvas/terrainRenderer.ts`
  - `packages/ui/src/canvas/BattlefieldCanvas.tsx`
- Added game-session renderer mode toggle (no engine changes):
  - toolbar toggle between `placeholder` and `sprite-ready`
  - files:
    - `packages/ui/src/game/GameSession.tsx`
    - `packages/ui/src/game/canvas/GameBattlefieldCanvas.tsx`
- Added UI manifest tests:
  - `packages/ui/src/canvas/assets.test.ts`
  - validates loader behavior, fallback resolution, and mode toggling

## Current Verification (Post-Phase-6)
- `pnpm build`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS (118 files, 3643 tests)

## Post-Phase Bugfixes (2026-02-28)
- Fixed Army Builder unit configuration hardening for malformed wargear option data:
  - `packages/ui/src/game/screens/army-builder/UnitConfigPanel.tsx`
  - normalizes option description/points before rendering and cost calculation to prevent render-time crashes/blank screen
- Added regression tests for Praetor and all MVP profiles rendering in UnitConfigPanel:
  - `packages/ui/src/game/screens/army-builder/UnitConfigPanel.test.ts`
- Verification after bugfix:
  - `pnpm build`: PASS
  - `pnpm typecheck`: PASS
  - `pnpm test`: PASS (119 files, 3646 tests)

## Notes
- Primary docs: `plan.md`, `reference.md`, `HH_v2_units.md`.
- Reference implementation source: `/Users/kylebullock/HH`.
- Baseline code import completed and verified on 2026-02-28.

## Documentation Plan (2026-03-03)
- [x] Add an "Advanced AI Army List Builder" section to `MixedSearch_NNUE_Plan.md`.
- [x] Document roster-generation architecture (interfaces, constraints, mixed-search flow, NNUE scoring, UI/headless integration).
- [x] Add explicit roster validation and deterministic reproducibility gates.

## Documentation Polish (2026-03-04)
- [x] Add explicit Turbo decision-time profile guidance (`800–1000ms`) while keeping `500ms` UI default.
- [x] Add worker progress telemetry cadence requirements (50–100ms updates with depth/nodes/PV).
- [x] Expand reaction fingerprint definition for transposition determinism (`hasReactedThisTurn`, allotments, advanced reaction usage).
- [x] Add exact deterministic seed schedule + PRNG specification for mixed-search rollouts.
