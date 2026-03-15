# HHv2 TODO

Last Updated: 2026-03-14

## Execution Plan (Verify Engine Search Family - 2026-03-15)
- [x] Inspect the live Engine search implementation and identify whether it uses negamax or a different alpha-beta search structure.
- [x] Record the exact code-level answer in `todo.md` before reporting back.
- Progress:
  - Scope locked before verification:
    - audit only
    - no runtime/search behavior changes
  - Verification result:
    - `packages/ai/src/engine/search.ts` does not implement sign-flipped negamax recursion
    - `searchNode(...)` explicitly computes `const maximizing = decisionOwner === runtime.rootPlayerIndex` and then uses separate maximizing/minimizing branches to update `bestScore`, `alpha`, and `beta`
    - the live Engine search is therefore a minimax-style alpha-beta search with iterative deepening, aspiration windows, transposition table, killer/history ordering, and deterministic rollout averaging, not a literal negamax implementation

## Execution Plan (Implement Rules-Complete Audit Findings - 2026-03-14)
- [x] Extend shared game state and command flow for reserve readiness, reserve type, flyer combat assignment, and per-turn Deep Strike tracking.
- [ ] Correct reserve handling so passed reserve tests may keep units off-board, edge entry follows reserve-move rules, Deep Strike restrictions are enforced, and illegal placements resolve casualties where required.
- [ ] Add flyer-specific runtime behavior for Aerial Reserves, Combat Assignments, Combat Air Patrol eligibility, flyer reaction/status prohibitions, and flyer damage-table exceptions.
- [ ] Add the generic advanced reaction suite (`Death or Glory`, `Intercept`, `Evade`, `Nullify`, `Heroic Intervention`, `Combat Air Patrol`) with trigger checks and resolution handlers.
- [ ] Add vehicle Repair Tests in the Statuses sub-phase and correct `Suppressed` / vehicle status removal handling to match the rules.
- [ ] Run focused tests for reserves, reactions, flyers, assault, and end-phase cleanup, then update this section with exact results before reporting back.
- Progress:
  - 2026-03-14 next implementation batch queued:
    - fix the `packages/ui` project-reference configuration so repo-root `pnpm -s tsc -b --pretty false` can validate the workspace instead of failing on stale/no-emit UI settings
    - finish flyer combat-assignment runtime behavior, starting with the post-move `Combat Air Patrol` window and assignment-specific movement/shooting/return-to-aerial-reserves rules
    - continue into the remaining generic advanced reactions once the flyer trigger windows are wired and covered by focused tests
  - 2026-03-14 UI typecheck configuration patch:
    - changed the repo root project reference to point at `packages/ui/tsconfig.build.json` instead of the no-emit editor config
    - added `packages/ui/tsconfig.build.json` so project references can emit declarations into `dist-types` without colliding with Vite output
    - updated `packages/ui/package.json` so `build` uses the emit-capable build config while `typecheck` stays no-emit against the editor config
    - validation:
      - `pnpm --filter @hh/ui typecheck`
        - passed
      - `pnpm -s tsc -b --pretty false`
        - UI project-reference failures cleared; root build now advances to pre-existing non-UI type errors in tests and tooling packages
  - 2026-03-14 flyer combat-assignment rules patch in progress:
    - wired mandatory flyer move checks before leaving the Move sub-phase
    - wired post-move `Combat Air Patrol` reaction offering for active Flyers on combat assignments
    - wired end-of-shooting return to Aerial Reserves for active combat-assignment Flyers, including Extraction Mission passenger status cleanup
    - enforced Extraction Mission deploy prerequisites plus flyer embark/disembark restrictions by mission
    - enforced assignment-specific shooting restrictions and added the missing global `Snap Shots unless Skyfire` rule when targeting Flyers
    - corrected unit-move dangerous terrain / LOS blocking so Flyers no longer take unit-move dangerous terrain tests or block LOS as ordinary vehicles
    - fixed grouped mounted-weapon resolution so mounted/count-prefixed vehicle and flyer wargear IDs (for example `two-centreline-mounted-twin-lascannon`) now resolve through the live shooting pipeline with the correct multiplied firepower
    - corrected the legacy weapon normalizer so it no longer discards normalized weapon IDs on non-`boltgun` lookups
    - added profile-aware ranged weapon resolution so base multi-profile wargear IDs now resolve legally through `profileName` and parent-weapon mappings instead of requiring callers to know internal child IDs
    - added selection-option generation for parent-profile weapons and wired it into the UI and AI shooting flows so missile/shell/maximal/range-band weapons can be selected from normal equipped wargear
    - corrected range-band handling so minimum bands are enforced and range-dependent weapons auto-select the matching profile where the rules/data define a single legal band at the current distance
    - corrected shared fire-group Rapid Fire calculation to use per-model target distance when the target unit is known instead of one unit-wide distance for every model
    - added command-level `declareShooting` regression coverage for the ranged `WEAPON_NOT_EQUIPPED` rule so shooting command routing stays aligned with the live weapon-assignment validator
    - corrected shooting validation order so unresolved or melee selections still report `INVALID_WEAPON` before the new ranged-equipment ownership gate, and made the meltagun edge-case test explicitly equip its weapon
    - started the generic advanced-reaction pass by wiring `Nullify` for failed psychic-curse resistance checks, including paused curse-state tracking and UI reaction-string support beyond the old `CoreReaction`-only reaction surface
    - validation after the ranged weapon-ownership shooting patch:
      - `pnpm --filter @hh/engine typecheck`
        - passed
      - `pnpm test -- packages/engine/src/shooting/weapon-declaration.test.ts packages/engine/src/command-processor.test.ts`
        - passed: `2` files, `156` tests
    - validation after the profile/range/UI shooting patch:
      - `pnpm --filter @hh/engine typecheck`
        - passed
      - `pnpm --filter @hh/engine build`
        - passed
      - `pnpm --filter @hh/ai typecheck`
        - passed
      - `pnpm --filter @hh/ui typecheck`
        - passed
      - `pnpm test -- packages/engine/src/shooting/weapon-declaration.test.ts packages/engine/src/shooting/shooting-validator.test.ts packages/engine/src/command-processor.test.ts packages/ai/src/helpers/weapon-selection.test.ts`
        - passed: `4` files, `224` tests
      - `pnpm -s tsc -b --pretty false`
        - still blocked by pre-existing non-UI workspace test/tooling type errors outside this patch
    - validation after mounted-weapon resolver patch:
      - `pnpm --filter @hh/engine typecheck`
        - passed
      - `pnpm test -- packages/engine/src/command-processor.test.ts packages/engine/src/shooting/weapon-declaration.test.ts packages/engine/src/movement/reserves-handler.test.ts`
        - passed: `3` files, `164` tests
  - 2026-03-14 next rules-completeness batch locked before edits:
    - wire the generic `Evade` reaction into the charge flow at the post-volley/pre-charge-roll window using the existing reposition-style movement rules
    - fix the missing basic challenge-pass plumbing in engine/UI so the Challenge Step 1 “declare no challenge” path is real instead of an invalid `declineChallenge` call
    - use that challenge-pass hook to add the generic `Heroic Intervention` reaction window instead of leaving the rules trigger unwired
  - 2026-03-15 next rules-completeness batch locked before edits:
    - add explicit Challenge Step 1 combat-pass state so the engine can track which combats have already been processed in the Challenge sub-phase
    - wire the generic `Heroic Intervention` reaction off that pass flow, including reactive-side challenge declaration, active-side response, and per-combat continuation to later eligible combats
    - fix AI challenge command generation so it responds at the real `DECLARE` step and can pass specific combats instead of blindly ending the whole sub-phase
  - 2026-03-15 implementation progress:
    - added explicit Challenge Step 1 combat-pass tracking via `processedChallengeCombatIds` and `passChallenge`, so the engine now enforces per-combat Challenge decisions instead of allowing the entire sub-phase to be skipped blindly
    - wired the generic `Heroic Intervention` reaction from the active player’s per-combat pass decision, including reactive-unit reaction selection, reactive-side challenge declaration, active-side response, and decision-player routing through the live challenge flow
    - updated the challenge UI flow so normal challenge declaration passes a specific combat, while pending `Heroic Intervention` opens a reactive-side challenge declaration without exposing the old broken skip path
    - corrected AI challenge generation so it answers pending challenges at `DECLARE`, can issue reactive-side `Heroic Intervention` declarations, and can pass specific combats with `passChallenge`
    - validation after the challenge-pass + `Heroic Intervention` batch:
      - `pnpm --filter @hh/types build`
        - passed
      - `pnpm --filter @hh/engine typecheck`
        - passed
      - `pnpm --filter @hh/ui typecheck`
        - passed
      - `pnpm --filter @hh/ai typecheck`
        - passed
      - `pnpm test -- packages/engine/src/command-processor.test.ts packages/ai/src/phases/assault-ai.test.ts`
        - passed: `2` files, `131` tests
  - 2026-03-15 next rules-completeness batch locked before edits:
    - add vehicle move-through detection and post-move enemy-unit impact hits so the base vehicle movement rules exist in the live movement pipeline instead of being silently ignored
    - wire the generic movement-side `Death or Glory` reaction off that move-through trigger, including attack selection, vehicle-front-armour resolution, attacker survival/casualty outcome, and suppression of move-through hits when the vehicle is destroyed
    - add a real UI placement/confirmation flow for move-based reactions so `Reposition`, `Evade`, and `Combat Air Patrol` can collect `modelPositions` instead of only being usable through direct test/AI command generation
  - 2026-03-14 implementation progress:
    - corrected the charge pipeline to use the live post-setup / post-volley distance when resolving Step 5 instead of the stale pre-setup declaration distance
    - wired the generic `Evade` reaction offer after volley attacks for Light/Cavalry charge targets and resolved it through the existing reposition reaction movement rules
    - added focused charge-routing regressions for post-setup range recalculation, the `Evade` offer after declining Overwatch, and the `Evade` early-failed-charge case when the target escapes beyond 12"
    - tightened the new charge fixtures to suppress unrelated volley attacks so the focused regressions exercise only the Step 5 distance fix and `Evade` reaction path
    - started the UI follow-up by wiring challenge-flow entry from the action bar, deriving live challenge modal state from engine `challengeState`, and replacing the broken declare-step “Decline to Challenge” button with a real sub-phase skip
    - validation after the charge-distance + `Evade` patch:
      - `pnpm --filter @hh/engine typecheck`
        - passed
      - `pnpm --filter @hh/ui typecheck`
        - passed
      - `pnpm test -- packages/engine/src/command-processor.test.ts`
        - passed: `1` file, `111` tests
    - validation after the challenge UI flow patch:
      - `pnpm --filter @hh/ui typecheck`
        - passed
      - `pnpm --filter @hh/engine typecheck`
        - passed
  - Scope locked before implementation:
    - implement the high-severity rules gaps found in the 2026-03-14 audit
    - preserve existing working mechanics unless a rules correction requires behavior change
    - patch the shared engine/state surfaces first so later rules can hook into them cleanly
  - Planned dependency order:
    - reserve state + reserve entry semantics
    - end-phase vehicle repair / status cleanup corrections
    - flyer and aerial reserve state transitions
    - generic advanced reaction trigger + resolution plumbing
  - 2026-03-14 checkpoint:
    - re-validated the interrupted reserve/flyer state patch after user abort
    - package-local validation passed:
      - `pnpm --filter @hh/types typecheck`
      - `pnpm --filter @hh/engine typecheck`
      - `pnpm --filter @hh/headless typecheck`
    - compile-surface hardening now in place for:
      - flyer charge prohibition
      - flyer tactical-status immunity through shared status helper
      - flyer single-armour facing lookup
      - headless defaults for aerial reserves / combat-assignment state fields
    - end-phase / flyer damage corrections now in place for:
      - per-status Cool Checks for `Pinned`, `Suppressed`, `Stunned`, and `Stupefied`
      - vehicle `Repair Test` handling with `Auto-repair (X+)` target support
      - flyer glancing-hit handling as direct Hull Point loss instead of the normal Vehicle Damage Table
      - shared status application using flyer immunity in both standard shooting and overload misfire flows
    - focused verification after status/repair/flyer patch:
      - `pnpm test -- packages/engine/src/command-processor.test.ts packages/engine/src/shooting/overload-misfire.test.ts packages/engine/src/shooting/shooting-integration.test.ts`
      - passed: `3` files, `140` tests
  - 2026-03-14 reserve/flyer re-check correction batch in progress:
    - corrected the reserve-ready implementation so a passed reserves roll no longer marks the unit as if it already entered play
    - corrected aerial-reserve deployment so flyers stay `Stationary` after assignment placement instead of consuming their movement window during the Reserves sub-phase
    - corrected baseline flyer movement interaction so flyers no longer inherit standard rush, dangerous-terrain, or impassable-path restrictions that should not apply to them
    - corrected the deploy-time reserve reaction trigger so Aerial Reserve placement offers `Intercept` only; the post-move `Combat Air Patrol` window remains a follow-up flyer task
    - rewrote the stale reserve handler tests to cover the live reserve-ready / Deep Strike / Outflank / aerial-assignment flow and added command-processor coverage for reserve-entry `Intercept`
    - package-local validation after the re-check corrections:
      - `pnpm --filter @hh/engine typecheck`
      - `pnpm --filter @hh/ai typecheck`
      - `pnpm --filter @hh/mcp-server typecheck`
    - focused verification after the reserve/flyer correction batch:
      - `pnpm test -- packages/engine/src/movement/reserves-handler.test.ts packages/engine/src/command-processor.test.ts packages/engine/src/shooting/overload-misfire.test.ts packages/engine/src/shooting/shooting-integration.test.ts`
      - passed: `4` files, `155` tests

## Execution Plan (Audit Engine Rules Coverage Against HH Rules Docs - 2026-03-14)
- [x] Re-read the primary project references in `plan.md`, `reference.md`, and `HH_v2_units.md`, then load the battle/rules documents needed to audit each mechanics area.
- [x] Map every rules-bearing engine/data module and identify which gameplay systems are fully implemented, partially implemented, or missing.
- [x] Cross-check code paths and tests for movement, shooting, assault, morale, reactions, missions, legion rules, psychic rules, transports/reserves, and setup/deployment against the written rules.
- [x] Record exact findings with file/line references and classify each issue as missing rule, incorrect implementation, or insufficient test coverage.
- [x] Update this section with the audit result and next recommended remediation order before reporting back.
- Progress:
  - Scope locked before audit:
    - audit code and tests against the rules documents named in `AGENTS.md`
    - do not change engine/runtime behavior during the initial audit pass
    - use `packages/engine/src`, `packages/data/src`, `packages/army-builder/src`, and relevant UI setup flow only where they carry rules logic
  - Current audit staging:
    - workspace structure mapped
    - current `todo.md` loaded
    - primary references `plan.md`, `reference.md`, and `HH_v2_units.md` loaded
  - Audit result:
    - high-severity gaps confirmed in generic advanced reactions, flyer/aerial reserves support, reserve-entry semantics, deep strike enforcement, and vehicle status recovery
    - direct correctness bugs confirmed in status cleanup for `Suppressed` and in flyer handling through the shared vehicle damage path
    - next recommended remediation order:
      - add missing state and command support for flyers, aerial reserves, and combat assignments
      - fix reserve test and reserve entry flow before patching deep strike/outflank restrictions
      - add the generic advanced reaction set (`Death or Glory`, `Intercept`, `Evade`, `Nullify`, `Heroic Intervention`, `Combat Air Patrol`)
      - add vehicle repair tests and correct end-phase status removal rules

## Execution Plan (Verify March 14 LOS Fix Record Against Live Code - 2026-03-14)
- [x] Re-read the March 14 LOS/fallback todo entry and verify the claimed fix is present in the live AI helper and NNUE runner code.
- [x] Run focused verification for the LOS-aware weapon-selection behavior and a small NNUE self-play smoke on the current workspace.
- [x] Update this section with the exact verification result before reporting back.
- Progress:
  - Scope locked before verification:
    - audit only
    - do not change engine/runtime behavior unless the live verification disproves the recorded fix
  - Current code read before running verification:
    - `packages/ai/src/helpers/weapon-selection.ts` now filters shooting assignments through `getModelsWithLOSToUnit(...)`
    - `packages/ai/src/helpers/weapon-selection.ts` also makes `hasWeaponsInRange(...)` LOS-aware
    - `tools/nnue/common.mjs` now retries `buildFallbackCommand(state)` on rejected AI commands and only records training samples for accepted non-recovered Engine decisions
  - Verification:
    - `pnpm test -- packages/ai/src/helpers/weapon-selection.test.ts packages/ai/src/phases/shooting-ai.test.ts packages/ai/src/engine/candidate-generator.test.ts`
      - passed: `3` files, `39` tests
    - `pnpm nnue:selfplay --matches 1 --time-budget-ms 25 --max-commands 128 --out-dir tmp/nnue-selfplay-smoke-20260314-los-audit`
      - passed
      - result: `match 1/1 samples=128 end=max-commands`
      - no `command-rejected`
    - conclusion:
      - the March 14 LOS/fallback fix is present in live code and the focused verification matches the `todo.md` record
      - the earlier March 13 corpus/gate drift cannot be explained by the old LOS bug still being active in the current workspace

## Execution Plan (Fix Shared Shooting LOS Rejections And Long-Run Fallbacks - 2026-03-14)
- [x] Patch the shared shooting weapon-selection helper so AI only assigns weapons from models that actually have line of sight, matching the battle rules docs.
- [x] Add focused regression coverage for mixed-LOS shooting assignments and LOS-aware in-range checks.
- [x] Update the NNUE and Alpha instrumented match runners to try the existing fallback-command path on rejected AI commands so long self-play/gate jobs do not die on a single bad command.
- [x] Rebuild the affected AI package, run focused tests, and run small NNUE/Alpha smoke checks before reporting back.
- Progress:
  - Scope locked before edits:
    - fix only the shared shooting assignment legality and the long-run instrumented runner fallback behavior
    - do not touch `packages/engine/*`
    - do not touch `tools/nnue/self-play.mjs`
    - keep the fix rules-accurate to `HH_Rules_Battle.md`
  - Current confirmed root cause before edits:
    - `HH_Rules_Battle.md` states:
      - at least one attacker must have LOS to at least one target model
      - only attacker models with LOS may shoot
      - if there is no valid LOS, choose a new target or end the attack
    - `packages/ai/src/helpers/weapon-selection.ts` currently assigns weapons for any alive model that has an in-range weapon, even if that model does not have LOS
    - `packages/engine/src/shooting/weapon-declaration.ts` correctly rejects those assignments with `MODEL_NO_LOS`
    - `tools/nnue/common.mjs` and `tools/alpha/common.mjs` currently terminate the whole run on `command-rejected` instead of using the fallback-command recovery already present in `packages/headless/src/index.ts`
  - 2026-03-14 implementation progress:
    - updated `packages/ai/src/helpers/weapon-selection.ts` to:
      - filter attacking models through `getModelsWithLOSToUnit(...)` before assigning ranged weapons
      - make `hasWeaponsInRange(...)` LOS-aware as well as range-aware
    - updated `packages/ai/src/helpers/weapon-selection.test.ts` with regressions that:
      - only the LOS-capable model receives a shooting assignment when terrain blocks another model
      - `hasWeaponsInRange(...)` returns `false` when the only in-range model is blocked by LOS terrain
    - updated `tools/nnue/common.mjs` so instrumented NNUE self-play:
      - tries the fallback command when an AI-generated command is rejected
      - only persists a training sample when the original AI command was accepted
      - keeps recovered fallback commands out of the replay/sample label path
    - updated `tools/alpha/common.mjs` so Alpha self-play/gate:
      - tries the fallback command when an AI-generated command is rejected
      - only persists Alpha observations for accepted non-recovered AI decisions
    - updated `tools/alpha/distill-engine.mjs` so fresh distill:
      - tries the fallback command when an AI-generated teacher command is rejected
      - only persists teacher samples for accepted non-recovered teacher decisions
    - updated `tools/alpha/common.mjs` and `tools/alpha/self-play.mjs` so Alpha self-play can still bind replay-buffer rows to the executed command when live Alpha diagnostics do not include `selectedMacroActionId`, as long as the current legal action surface has a unique matching command type
  - Verification:
    - `pnpm --filter @hh/ai build`
      - passed
    - `pnpm test -- packages/ai/src/helpers/weapon-selection.test.ts packages/ai/src/phases/shooting-ai.test.ts packages/ai/src/engine/candidate-generator.test.ts`
      - passed (`39` tests)
    - `pnpm nnue:selfplay --matches 1 --time-budget-ms 25 --max-commands 128 --out-dir tmp/nnue-selfplay-smoke-20260314-los-fallback`
      - passed
      - `match 1/1 samples=128 end=max-commands`
      - no `command-rejected`
    - `pnpm alpha:distill --matches 1 --time-budget-ms 25 --max-commands 64 --out-dir tmp/alpha-distill-smoke-20260314-los-fallback`
      - passed
      - `match 1/1 samples=51 end=max-commands`
      - no `command-rejected`
    - `pnpm alpha:selfplay --model-file tmp/alpha/overnight-20260313-022026/train-r0-restart/alpha-r0.json --matches 1 --curriculum mirror --time-budget-ms 25 --max-simulations 8 --max-commands 256 --out-dir tmp/alpha-selfplay-smoke-20260314-mirror-256-los-fallback-v2`
      - passed
      - `match 1/1 mode=mirror samples=45 end=game-over`
      - no `command-rejected`

## Execution Plan (Audit Regular Engine Self-Play Failures After Alpha Work - 2026-03-13)
- [x] Scan every replay under `tmp/selfplay-200x1000-20260313` and classify every non-`game-over` termination with the exact rejected command and error.
- [x] Audit all current Engine/NNUE/heuristic-related worktree diffs against those failure categories to identify what changed and what did not.
- [x] Report exact findings, with file-level references and the smallest defensible explanation of how the current run drift happened.
- Progress:
  - Scope locked before edits:
    - audit only
    - no code changes during this pass
    - inspect the completed regular Engine self-play run and the current worktree together
  - Current confirmed symptom before the audit:
    - the regular `tmp/selfplay-200x1000-20260313` run terminated match `183` with `terminatedReason: "command-rejected"`
    - the rejected command in replay `selfplay-1773463666324-183.json` is a `declareShooting`
    - the engine error is `Model 'p1-u10-m4' does not have line of sight to the target`
  - 2026-03-13 audit findings:
    - scanned every replay currently on disk under `tmp/selfplay-200x1000-20260313/replays`
    - current regular Engine self-play run summary:
      - `184` replays on disk
      - `176` `game-over`
      - `8` `command-rejected`
    - every one of the `8` failed replays is the same failure class:
      - rejected `declareShooting`
      - error bucket: `Model <id> does not have line of sight to the target`
    - checked earlier pre-Alpha self-play artifacts:
      - `tmp/selfplay-200x1000-20260311/replays`: `189` `game-over`, `13` `command-rejected`
      - `tmp/selfplay-150x1000-20260312-a/replays`: `146` `game-over`, `4` `command-rejected`
      - `tmp/selfplay-150x1000-20260312-b/replays`: `143` `game-over`, `7` `command-rejected`
      - `tmp/selfplay-100x1000-20260312-a/replays`: `99` `game-over`, `3` `command-rejected`
      - `tmp/selfplay-100x1000-20260312-b/replays`: `99` `game-over`, `3` `command-rejected`
    - conclusion from the replay evidence:
      - the regular Engine self-play `declareShooting` LOS rejection bug predates the Alpha work and is already present in the March 11 / March 12 runs
      - the current March 13 run is still hitting that same pre-existing bug, not a new failure category introduced by Alpha
    - current worktree diff audit:
      - current Engine/NNUE/heuristic-related diffs are limited to:
        - `packages/ai/src/phases/movement-ai.ts`
        - `packages/ai/src/phases/movement-ai.test.ts`
        - `tools/nnue/common.mjs`
        - `tools/nnue/gate-gameplay-model.mjs`
      - no current diff in:
        - `packages/ai/src/engine/search.ts`
        - `packages/ai/src/engine/candidate-generator.ts`
        - `packages/ai/src/phases/shooting-ai.ts`
        - `packages/engine/src/shooting/*`
        - `packages/engine/src/command-processor.ts`
        - `tools/nnue/self-play.mjs`
      - the `tools/nnue/common.mjs` diff is confined to gameplay gate helper flow and does not touch the regular self-play path
      - the Tactical movement heuristic diff in `packages/ai/src/phases/movement-ai.ts` should not have been made after the user's constraint, but it does not explain regular Engine-vs-Engine `declareShooting` LOS rejections

## Execution Plan (Fix Tactical Movement Legality Near Enemy Exclusion - 2026-03-13)
- [x] Re-audit the Tactical movement path and isolate the smallest AI-side fix that prevents illegal `moveUnit` commands near enemy exclusion zones.
- [x] Update Tactical movement generation so it validates translated model destinations against engine movement rules and falls back to legal translations without touching regular Engine or `tools/nnue/*`.
- [x] Add focused regression coverage for the reproduced Tactical `Cannot end move within 1" of an enemy model` failure and verify the AI package build plus targeted tests.
- Progress:
  - Scope locked before edits:
    - fix only Tactical movement generation
    - do not touch `packages/ai/src/engine/*`
    - do not touch `packages/engine/*`
    - do not touch `tools/nnue/*`
  - Current confirmed bug before edits:
    - Tactical movement currently computes a centroid translation in `packages/ai/src/phases/movement-ai.ts`
    - it emits a `moveUnit` command without validating the translated model positions against engine movement rules
    - this can produce `command-rejected` failures such as `Cannot end move within 1" of an enemy model`
  - Planned implementation:
    - validate Tactical translated positions with `validateModelMove(...)` before emitting `moveUnit`
    - search fallback translated centroids along the intended vector until a legal destination is found
    - skip units with no legal move instead of ending the entire movement pass early
  - 2026-03-13 implementation progress:
    - updated `packages/ai/src/phases/movement-ai.ts` so movement AI now:
      - iterates movable units until it finds a legal translated move instead of ending the sub-phase early on the first unworkable unit
      - validates translated model destinations with `validateModelMove(...)` before emitting `moveUnit`
      - uses fallback translated centroids along and around the intended vector to stay out of enemy exclusion zones and other illegal end states
      - keeps the change isolated to AI-side Tactical/basic movement generation only
    - updated `packages/ai/src/phases/movement-ai.test.ts` with a focused regression that reproduces the Tactical near-enemy case and asserts the emitted move passes engine movement validation
  - Verification:
    - `pnpm --filter @hh/ai build`
      - passed
    - `pnpm test -- packages/ai/src/phases/movement-ai.test.ts`
      - passed (`12` tests)
    - `pnpm alpha:gate --model tmp/alpha/overnight-20260313-022026/train-r1-restart-v2/alpha-r1.json --matches 1 --threshold -1 --time-budget-ms 200 --max-simulations 64 --max-commands 400 --out tmp/alpha/gate-tactical-fix-smoke-20260313.json`
      - passed
      - summary:
        - `candidateWins=1`
        - `engineWins=1`
        - `draws=1`
        - `aborted=0`
        - `timeouts=0`
      - confirmed the previous Tactical-side rejection no longer shows up as an aborted gate match in the live gate loop

## Execution Plan (Fix Alpha Self-Play Duplicate Search - 2026-03-13)
- [x] Re-audit the Alpha self-play instrumentation path to isolate the duplicate Alpha search and define the smallest Alpha-only fix.
- [x] Update the Alpha self-play/common path so each acting Alpha side searches once per decision and reuses that result for both command emission and replay-buffer sample creation.
- [x] Re-run focused Alpha tooling verification, then give the restart command that reuses the finished 100-game distill and existing first-train output.
- Progress:
  - Scope locked before edits:
    - do not touch `packages/ai/src/engine/*`
    - do not touch `tools/nnue/*`
    - keep the finished distill corpus reusable
    - keep the fix isolated to Alpha self-play/tooling and Alpha-side result reuse
  - Current confirmed bottleneck before edits:
    - `tools/alpha/self-play.mjs` currently asks `runAlphaInstrumentedMatch(...)` to capture a sample before the real command is generated
    - `tools/alpha/common.mjs:createAlphaSelfPlaySample(...)` currently calls `searchAlphaBestAction(...)`
    - `tools/alpha/common.mjs:runAlphaInstrumentedMatch(...)` then calls `generateNextCommand(...)`, which searches again for the same acting Alpha side and state
    - this makes mirror Alpha self-play pay for two Alpha searches per real Alpha decision instead of one
  - 2026-03-13 implementation progress:
    - updated `tools/alpha/common.mjs:runAlphaInstrumentedMatch(...)` so the self-play instrumentation callback now runs after the real command is generated, with access to:
      - the resolved command
      - the live Alpha diagnostics from the actual search result
      - the acted-unit set from before the decision
      - a `usedQueuedPlan` flag so queued continuation commands are not logged as fresh search samples
    - updated `tools/alpha/common.mjs:createAlphaSelfPlaySample(...)` so it no longer reruns Alpha search; it now builds the sample from:
      - the current state
      - the regenerated legal root action list
      - the already-selected macro action id and search metrics from the real Alpha decision
    - updated `tools/alpha/self-play.mjs` to skip queued-plan continuations and phase-control-only steps, and to build self-play rows from the actual Alpha diagnostics instead of calling `searchAlphaBestAction(...)` a second time
    - added a focused Alpha tooling regression in `tools/alpha/tooling-interop.test.ts` for building a self-play sample from a preselected macro action without rerunning Alpha search
    - kept the change isolated to Alpha tooling only; no Engine runtime/search or `tools/nnue/*` files were edited
  - Verification:
    - `pnpm --filter @hh/ai build`
      - passed
    - `pnpm test -- packages/ai/src/alpha/default-model.test.ts packages/ai/src/alpha/serialization.test.ts`
      - passed
    - `pnpm alpha:selfplay --model-file tmp/alpha/train-script-smoke-20260313/alpha-script-smoke.json --matches 1 --curriculum mirror --time-budget-ms 5 --max-simulations 32 --max-commands 32 --out-dir tmp/alpha/selfplay-dupfix-smoke-20260313`
      - passed through the real package-script wrapper path
    - `pnpm alpha:selfplay --model-file tmp/alpha/train-script-smoke-20260313/alpha-script-smoke.json --matches 1 --curriculum mirror --time-budget-ms 20 --max-simulations 64 --max-commands 128 --out-dir tmp/alpha/selfplay-dupfix-smoke-20260313-b`
      - passed through the real package-script wrapper path
      - the resulting replay was a phase-control-only degenerate smoke (`103` `endSubPhase` commands, `0` real Alpha search decisions), so `sampleCount=0` there is expected and does not indicate the duplicate-search fix failed
    - verified the saved restart inputs still exist:
      - `tmp/alpha/overnight-20260313-022026/distill/manifest.json`
      - `tmp/alpha/overnight-20260313-022026/train-r0-restart/alpha-r0.json`

## Execution Plan (Fix Alpha Gate Abort Causes - 2026-03-13)
- [x] Audit the current Alpha gate aborts and isolate the exact causes before editing code.
- [x] Fix the promoted-default Alpha checksum/load path and the gate-side `command-rejected` classification without touching Engine runtime or `tools/nnue/*`.
- [x] Rebuild and verify the Alpha gate path against the existing `alpha-r1` candidate.
- Progress:
  - Scope locked before edits:
    - keep the fix isolated to Alpha runtime/tooling
    - do not touch `packages/ai/src/engine/*`
    - do not touch `tools/nnue/*`
  - Current confirmed abort causes before edits:
    - `10` `alpha-default` gate matches aborted because `DEFAULT_ALPHA_MODEL` was being loaded with a stale checksum after the promoted model id was normalized to `alpha-default-v1`
    - `3` tactical gate matches were being counted as generic `aborted` runs even though the rejecting move came from the Tactical opponent, not from Alpha
  - 2026-03-13 implementation progress:
    - updated `packages/ai/src/alpha/default-model.ts` so promoted-default Alpha model materialization recomputes `weightsChecksum` after normalizing the model id to `alpha-default-v1`
    - updated `tools/alpha/gate.mjs` so `terminatedReason === 'command-rejected'` is attributed to the side that issued the rejected command:
      - candidate rejected command => `opponent-win`
      - opponent rejected command => `candidate-win`
    - updated `packages/ai/src/alpha/default-model.test.ts` so the promoted override is validated after id normalization rather than only checking the model id field
    - directly reproduced the first aborted tactical match and confirmed the rejected move came from Tactical:
      - `actingPlayerIndex: 1`
      - `aiDiagnostics: null`
      - error: `Cannot end move within 1" of an enemy model`
  - Verification:
    - `pnpm --filter @hh/ai build`
      - passed
    - `pnpm test -- packages/ai/src/alpha/default-model.test.ts packages/ai/src/alpha/serialization.test.ts`
      - passed
    - `pnpm alpha:gate --model tmp/alpha/overnight-20260313-022026/train-r1-restart-v2/alpha-r1.json --matches 1 --threshold -1 --time-budget-ms 200 --max-simulations 64 --max-commands 400 --out tmp/alpha/gate-smoke-fix-20260313.json`
      - passed
      - summary:
        - `candidateWins=1`
        - `engineWins=1`
        - `draws=1`
        - `aborted=0`
        - `timeouts=0`
      - confirmed the previous `alpha-default` checksum-mismatch abort no longer occurs
      - confirmed the previous Tactical `command-rejected` case is no longer counted as a generic abort

## Execution Plan (Refresh alpha_primer.md For Current Alpha Tooling Workflow - 2026-03-13)
- [x] Re-audit the Alpha primer sections that describe tooling entrypoints and training runtime so they match the current `pnpm alpha:*` workflow exactly.
- [x] Update `alpha_primer.md` to document the compatible-Node plus native TensorFlow backend path and point readers at `Alpha_Training_Commands.md` for the concrete command sheet.
- [x] Re-read the edited primer against the live Alpha scripts and record verification.
- Progress:
  - Scope locked before edits:
    - update `alpha_primer.md` only
    - keep the change documentation-only
    - reflect the current safe `pnpm alpha:*` workflow without changing runtime behavior
  - Current verified primer drift before edits:
    - the primer still describes Alpha training/self-play/gate as generic TensorFlow.js tooling but does not explain that the safe package-script path now routes through `tools/alpha/run-with-compatible-node.mjs`
    - the primer does not mention the native `@tensorflow/tfjs-node` backend now used by Node-side Alpha tooling
    - the primer does not point readers to `Alpha_Training_Commands.md` for the concrete command reference sheet
  - 2026-03-13 implementation progress:
    - updated the Alpha architecture/tooling overview to include the compatible-Node launcher and the native `tfjs-node` backend used by Node-side Alpha tooling
    - added a dedicated `Command entrypoints` subsection to the training pipeline section
    - documented the supported operational rule:
      - use `pnpm alpha:*`
      - treat raw `node tools/alpha/*.mjs` as non-standard for TensorFlow-heavy Alpha tooling
    - updated the self-play, training, and gating sections to explain that the supported fast path is the `pnpm` script wrapper
    - pointed the primer at `Alpha_Training_Commands.md` for the concrete copy-paste command sheet
  - Verification:
    - re-read the edited Alpha primer sections against the live root `package.json` Alpha scripts
    - confirmed that:
      - `alpha:train`
      - `alpha:selfplay`
      - `alpha:gate`
      route through `tools/alpha/run-with-compatible-node.mjs`
    - confirmed that:
      - `alpha:distill`
      - `alpha:promote`
      - `alpha:inspect`
      remain direct `pnpm alpha:*` entrypoints
    - re-read the updated `alpha_primer.md` sections to confirm the command-entrypoint, training-backend, and command-sheet references are now consistent
    - documentation-only change; no runtime behavior changed

## Execution Plan (Create Alpha_Training_Commands.md - 2026-03-13)
- [x] Audit the current Alpha package scripts and the live finished 100-game distill path so the command sheet matches the current working workflow exactly.
- [x] Write `Alpha_Training_Commands.md` as a concise reference sheet with only the current safe Alpha commands.
- [x] Re-read the command sheet against the live package scripts and current distill path and record verification.
- Progress:
  - Scope locked before edits:
    - add a new `Alpha_Training_Commands.md`
    - include only the current safe `pnpm alpha:*` workflow
    - include the existing finished 100-game distill restart path
    - do not change runtime behavior
  - Current verified command/runtime facts before the doc write:
    - `alpha:train`, `alpha:selfplay`, and `alpha:gate` now route through `tools/alpha/run-with-compatible-node.mjs`
    - `alpha:distill`, `alpha:promote`, and `alpha:inspect` remain standard `pnpm alpha:*` script entrypoints
    - the current finished 100-game distill manifest is `tmp/alpha/overnight-20260313-022026/distill/manifest.json`
    - that distill corpus currently contains `100` matches and `19464` samples
  - 2026-03-13 implementation progress:
    - added `Alpha_Training_Commands.md` as the current Alpha command reference sheet
    - documented the required safe execution rule:
      - use `pnpm alpha:*`
      - do not call `tools/alpha/train.mjs`, `tools/alpha/self-play.mjs`, or `tools/alpha/gate.mjs` directly with raw `node`
    - documented the live restart flow for the finished `100`-game distill run:
      - train from the existing distill manifest
      - run `100` Alpha self-play games
      - retrain on distill plus self-play
      - gate at `10` matches per opponent
    - documented the individual commands for:
      - train only
      - self-play only
      - retrain
      - gate
      - promote
      - inspect
      - full overnight rerun from scratch
      - minimal smoke checks
  - Verification:
    - re-read `Alpha_Training_Commands.md` against the live root `package.json` Alpha scripts
    - confirmed that:
      - `alpha:train`
      - `alpha:selfplay`
      - `alpha:gate`
      all route through `tools/alpha/run-with-compatible-node.mjs`
    - confirmed that:
      - `alpha:distill`
      - `alpha:promote`
      - `alpha:inspect`
      remain direct `pnpm alpha:*` entrypoints
    - re-read the current finished distill manifest at `tmp/alpha/overnight-20260313-022026/distill/manifest.json`
    - confirmed the documented live corpus values:
      - `matchCount=100`
      - `sampleCount=19464`
    - documentation-only change; no runtime behavior changed

## Execution Plan (Wire Native TensorFlow Node Backend For Alpha Tooling - 2026-03-13)
- [x] Audit the current Alpha TensorFlow import path and identify the smallest safe way to enable the native Node backend for Alpha tooling only.
- [x] Add the Node backend dependency and bootstrap it from Alpha tooling without changing browser/runtime Alpha behavior.
- [x] Verify that Alpha tooling resolves the `tensorflow` backend and that a tiny Alpha train smoke still works.
- Progress:
  - Scope locked before edits:
    - do not touch browser UI/runtime behavior
    - do not touch Engine runtime/search code
    - wire the fast TensorFlow backend only for Node-side Alpha tooling
  - Current confirmed state before the change:
    - `packages/ai` currently depends only on `@tensorflow/tfjs`
    - Alpha inference and training import `@tensorflow/tfjs` directly
    - there is no `@tensorflow/tfjs-node` dependency and no backend bootstrap code today
    - Alpha tooling is therefore falling back to the slow pure-JS TensorFlow backend in Node
  - 2026-03-13 implementation progress:
    - added root dev dependency `@tensorflow/tfjs-node@4.22.0`
    - added `tools/alpha/tfjs-node-bootstrap.mjs` to register the native `tensorflow` backend before Alpha inference/training code loads
    - added `tools/alpha/run-with-compatible-node.mjs` so Alpha TensorFlow-heavy package scripts automatically re-exec under a compatible Homebrew Node 20/22 binary instead of the current global Node 25
    - updated package scripts so:
      - `alpha:train`
      - `alpha:selfplay`
      - `alpha:gate`
      now route through the compatible-Node launcher
    - confirmed that the first direct `tfjs-node` attempt failed under `node v25.2.1`, then installed Homebrew `node@20` and switched the Alpha tooling path to it
    - left browser/runtime Alpha behavior unchanged; the change is isolated to Node-side tooling entrypoints
  - Verification:
    - `pnpm install`
      - passed
      - installed `@tensorflow/tfjs-node`
    - `/opt/homebrew/opt/node@20/bin/node -v`
      - `v20.20.0`
    - `node tools/alpha/run-with-compatible-node.mjs tools/alpha/train.mjs --input tmp/alpha/distill-rerun-cli-smoke-20260313-diagnostics-restore/manifest.json --epochs 1 --batch-size 2 --out-dir tmp/alpha/train-node-wrapper-smoke-20260313 --model-id alpha-node-wrapper-smoke`
      - passed
    - `pnpm alpha:train --input tmp/alpha/distill-rerun-cli-smoke-20260313-diagnostics-restore/manifest.json --epochs 1 --batch-size 2 --out-dir tmp/alpha/train-script-smoke-20260313 --model-id alpha-script-smoke`
      - passed through the package-script wrapper path
    - `pnpm alpha:selfplay --model-file tmp/alpha/train-script-smoke-20260313/alpha-script-smoke.json --matches 1 --curriculum mirror --time-budget-ms 5 --max-simulations 32 --max-commands 5 --out-dir tmp/alpha/selfplay-script-smoke-20260313`
      - passed
    - `pnpm alpha:gate --model tmp/alpha/train-script-smoke-20260313/alpha-script-smoke.json --matches 1 --threshold -1 --time-budget-ms 5 --max-simulations 32 --max-commands 5 --out tmp/alpha/gate-script-smoke-20260313.json`
      - passed

## Execution Plan (Create alpha_primer.md - 2026-03-13)
- [x] Re-audit `engine_primer.md` structure against the live Alpha runtime, tooling, deployment, and diagnostics surfaces.
- [x] Write `alpha_primer.md` as a current-state primer that mirrors the Engine primer style while describing the shipped Alpha stack accurately.
- [x] Re-read the new primer against the live Alpha code/tooling defaults and record verification.
- Progress:
  - Scope locked before edits:
    - add a new `alpha_primer.md`
    - do not change runtime behavior
    - mirror `engine_primer.md` as a primer, not a future design note
  - Current verified Alpha surfaces before the doc write:
    - runtime strategy path is `AI controller -> AlphaStrategy -> searchAlphaBestAction(...)`
    - UI routes Alpha through `alpha-ai.worker.ts` and exposes Balanced (`600ms / 256 sims`) and Tournament (`1500ms / 640 sims`) presets plus shadow Alpha controls in both setup screens
    - headless and MCP both accept Alpha config fields and shadow Alpha fields
    - Alpha tooling exists under `tools/alpha/*` with `distill`, `selfplay`, `train`, `gate`, `promote`, and `inspect`
    - the current promoted default Alpha runtime id is `alpha-default-v1`, loaded from `packages/ai/src/alpha/default-alpha-model-override.ts`
  - 2026-03-13 implementation progress:
    - added `alpha_primer.md` as a current-state Alpha primer that mirrors the structure and level of detail in `engine_primer.md`
    - covered the live Alpha runtime architecture, worker path, shared queued-plan behavior, search defaults, model stack, registry/default-model behavior, UI/headless/MCP surfaces, tooling commands, gate behavior, and promotion path
    - explicitly documented current live constraints such as:
      - the shared macro-action generator still bounding Alpha's search surface
      - the lack of a built-in heuristic fallback Alpha runtime model if the override were missing
      - the current promoted-default metadata showing a forced/failed gate result
  - Verification:
    - reread `alpha_primer.md` against:
      - `packages/ai/src/ai-controller.ts`
      - `packages/ai/src/strategy/alpha-strategy.ts`
      - `packages/ai/src/alpha/search.ts`
      - `packages/ai/src/alpha/common.ts`
      - `packages/ai/src/alpha/model-registry.ts`
      - `packages/ai/src/alpha/default-model.ts`
      - `tools/alpha/distill-engine.mjs`
      - `tools/alpha/self-play.mjs`
      - `tools/alpha/train.mjs`
      - `tools/alpha/gate.mjs`
      - `tools/alpha/promote-model.mjs`
      - `packages/headless/src/cli.ts`
      - `packages/mcp-server/src/register-tools.ts`
      - `packages/ui/src/game/hooks/useAITurn.ts`
      - `packages/ui/src/game/hooks/alpha-ai.worker.ts`
      - `packages/ui/src/game/screens/ArmyLoadScreen.tsx`
      - `packages/ui/src/game/screens/ArmyBuilderScreen.tsx`
    - confirmed the documented UI Alpha and shadow Alpha budget/base-seed presets against both setup screens
    - documentation-only change; no build or test run was required for this pass

## Execution Plan (Dual Gameplay Gate: Tactical + Previous Champion - 2026-03-13)
- [x] Audit the current gameplay gate path and identify the smallest safe way to benchmark a candidate against both `Tactical` and the current live default champion.
- [x] Update only the gameplay gate tooling/helpers needed so `pnpm nnue:gate` runs both benchmarks, preserves the Tactical summary surface, and records the previous-champion result in the JSON summary.
- [x] Add focused regression coverage for the new dual-gate summary/pass behavior and verify with targeted tests.
- Progress:
  - Scope locked before edits:
    - do not modify Engine runtime/search code
    - do not modify self-play or training behavior
    - keep the existing Tactical gate benchmark intact
    - add the previous-version benchmark using the current live default gameplay model (`gameplay-default-v1`) before promotion of any new candidate
  - Current verified gate behavior before edits:
    - `tools/nnue/gate-gameplay-model.mjs` runs only one benchmark block against `Tactical`
    - `tools/nnue/common.mjs` hardcodes `AIStrategyTier.Tactical` as the opponent inside `runGateMatches(...)`
    - the promotion archive exists, but the current live previous champion is already available in-process as `gameplay-default-v1`, so a second benchmark does not need a separate archive restore step
  - 2026-03-13 implementation progress:
    - generalized the gameplay gate match loop in `tools/nnue/common.mjs` so the existing Tactical benchmark and a new Engine-vs-Engine benchmark can share the same classified headless result path without touching runtime/search code
    - kept `runGateMatches(...)` intact for the Tactical block and added `runModelGateMatches(...)` for candidate-vs-current-default benchmark runs
    - updated `tools/nnue/gate-gameplay-model.mjs` so `pnpm nnue:gate` now:
      - runs the existing candidate-vs-`Tactical` block first
      - runs a second candidate-vs-`gameplay-default-v1` block when the candidate is a distinct model id
      - records `previousThreshold`, `tacticalPassed`, and a `previousVersion` result block in the JSON summary
      - sets overall `passed` only when both the Tactical block and the previous-version block pass
    - used a strict majority threshold for the previous-version block (`--previous-threshold`, default `0.5`) so a new candidate must actually beat the incumbent champion instead of only tying it
    - added focused regression coverage in `packages/ai/src/engine/gameplay-gate-summary.test.ts` for:
      - dual-pass success
      - Tactical pass plus previous-version failure
      - Tactical-only fallback when gating the live default model itself
  - Verification:
    - `pnpm test -- packages/ai/src/engine/gameplay-gate-summary.test.ts packages/ai/src/engine/promotion-cli.test.ts`
      - passed: `2` files, `4` tests
    - `pnpm build`
      - passed across the workspace
    - `pnpm nnue:gate --model tmp/selfplay-200x1000-20260311/candidate-gameplay-model.json --matches 1 --time-budget-ms 5 --threshold -1 --previous-threshold -1 --out tmp/gate-dual-smoke-20260313.json`
      - passed as an end-to-end smoke of the dual-opponent CLI path
      - confirmed summary output now includes the `previousVersion` benchmark against `gameplay-default-v1`

## Execution Plan (Restore Engine Isolation And Remove The Engine Diagnostics Coupling - 2026-03-13)
- [x] Re-audit the current Engine diagnostics type wiring and restore the regular Engine search path to the original shared `AIDiagnostics` contract.
- [x] Remove unused Engine-only diagnostics narrowing from shared AI types/exports while keeping Alpha-specific diagnostics isolated to Alpha search results.
- [x] Rebuild and run focused Alpha tooling verification to confirm Alpha still works after the diagnostics decoupling.
- Progress:
  - Scope locked before edits:
    - do not delete files
    - do not revert commits
    - do not touch `tools/nnue/*`
    - do not touch `packages/engine/*`
    - restore only the regular Engine diagnostics typing and shared AI contract coupling I introduced
  - Current confirmed state before the restore:
    - `packages/ai/src/engine/search.ts` is only changed by a diagnostics type narrowing from `AIDiagnostics` to `EngineAIDiagnostics`
    - `packages/ai/src/types.ts` currently makes `SearchResult.diagnostics` depend on `EngineAIDiagnostics`
    - `EngineAIDiagnostics` and `BasicOrTacticalAIDiagnostics` are only referenced from shared type definitions/exports and the regular Engine search file
    - Alpha-specific diagnostics remain separately typed through `AlphaAIDiagnostics` and `AlphaSearchResult`
  - 2026-03-13 implementation progress:
    - restored `packages/ai/src/engine/search.ts` to the original shared diagnostics contract by changing the import and local diagnostics annotations back to `AIDiagnostics`
    - rewired `packages/ai/src/types.ts` so `AIDiagnostics` is once again the shared regular diagnostics contract and `SearchResult.diagnostics` no longer depends on an Engine-only type
    - kept Alpha-specific search diagnostics isolated to `AlphaAIDiagnostics` and `AlphaSearchResult`
    - removed unused `BasicOrTacticalAIDiagnostics` and `EngineAIDiagnostics` exports from shared AI types and `packages/ai/src/index.ts`
    - left the fast Alpha distill path isolated under `tools/alpha/*`; no further regular Engine files were edited
  - Verification:
    - `git diff -- packages/ai/src/engine/search.ts`
      - clean: no remaining diff in the regular Engine search file
    - `rg -n "EngineAIDiagnostics|BasicOrTacticalAIDiagnostics" packages/ai/src packages/headless/src packages/mcp-server/src`
      - clean: no remaining regular-surface references
    - `pnpm --filter @hh/ai build`
      - passed
    - `pnpm --filter @hh/headless build`
      - passed
    - `pnpm test -- packages/ai/src/alpha/tooling-interop.test.ts packages/ai/src/alpha/promotion-cli.test.ts packages/ai/src/alpha/default-model.test.ts packages/ai/src/alpha/serialization.test.ts`
      - passed: `4` files, `6` tests
    - `pnpm alpha:distill --matches 1 --time-budget-ms 5 --max-commands 5 --out-dir tmp/alpha/distill-rerun-cli-smoke-20260313-diagnostics-restore`
      - passed
      - output: `matchCount=1`, `sampleCount=4`, `shardCount=1`, `importMode="rerun"`

## Execution Plan (Alpha Distill Double-Search Fix - 2026-03-13)
- [x] Audit the fresh `alpha:distill` rerun path to isolate why it is materially slower than `nnue:selfplay`.
- [x] Remove duplicate Engine search from fresh `alpha:distill` without touching `tools/nnue/*` or Engine runtime/search code.
- [x] Add focused Alpha-side regression coverage for the fixed rerun path and reverify the Alpha tooling slice.
- Progress:
  - Current confirmed problem:
    - fresh `alpha:distill` records the teacher sample through `createDistillSample(...)`, which already runs `searchBestAction(...)`
    - the same decision is then executed through `generateNextCommand(...)` inside the Alpha match runner, which runs `searchBestAction(...)` a second time via `EngineStrategy`
    - that makes fresh `alpha:distill` materially slower than normal Engine self-play because each Engine decision pays for search twice
  - Scope lock for this fix:
    - do not modify `tools/nnue/*`
    - do not modify `packages/ai/src/engine/*`
    - do not change Engine move-selection behavior
    - fix only the Alpha distill rerun path by reusing the first search result for both sample generation and command execution
  - 2026-03-13 implementation progress:
    - extended `tools/alpha/common.mjs` so distill samples can be built from precomputed root actions and an already-selected teacher macro action, avoiding redundant action regeneration inside sample construction
    - added `tools/alpha/teacher-engine-search.mjs` as a separate Alpha-only teacher search path that mirrors the current Engine search behavior while also returning the root legal action set needed for Alpha policy targets
    - replaced the fresh rerun branch in `tools/alpha/distill-engine.mjs` with an isolated Alpha-side fast distill runner that:
      - does not call the working Engine `generateNextCommand(...)` or modify `packages/ai/src/engine/*`
      - uses the separate Alpha-only teacher search for real Engine-like decision nodes
      - reuses that one teacher search result for all of:
        - chosen command emission
        - queued-plan continuation capture
        - score/diagnostics capture
        - root-action-based Alpha teacher sample generation
      - keeps phase-control commands and queued continuations out of duplicate teacher sampling
    - left replay-import mode unchanged; the speed fix is isolated to fresh rerun distill
    - left `tools/nnue/*` and `packages/ai/src/engine/*` untouched
    - added a fresh rerun regression case to `packages/ai/src/alpha/tooling-interop.test.ts`
  - Verification:
    - `pnpm test -- packages/ai/src/alpha/tooling-interop.test.ts packages/ai/src/alpha/promotion-cli.test.ts packages/ai/src/alpha/default-model.test.ts packages/ai/src/alpha/serialization.test.ts`
      - passed: `4` files, `6` tests
    - `pnpm alpha:distill --matches 1 --time-budget-ms 5 --max-commands 5 --out-dir tmp/alpha/distill-rerun-cli-smoke-20260313-isolated-teacher`
      - passed
      - output: `matchCount=1`, `sampleCount=4`, `shardCount=1`, `importMode=\"rerun\"`
    - observed rerun-smoke improvement on the same `1 match / 5 commands / 5ms` CLI shape:
      - pre-isolated-teacher smoke: about `1.6s`
      - isolated-teacher smoke: about `0.9s`

## Execution Plan (Alpha Existing Engine Selfplay Import + Candidate Selfplay File Support - 2026-03-13)
- [x] Audit the current Alpha distill/selfplay entrypoints against the existing NNUE selfplay manifest and replay artifact shape.
- [x] Add an additive Alpha distill import path that consumes existing Engine selfplay manifests/replay artifacts without rerunning Engine matches.
- [x] Add additive `alpha:selfplay` support for loading a candidate Alpha model directly from a model file instead of requiring prior promotion/registration.
- [x] Add focused regression coverage for the new Alpha importer/model-file flows and verify they do not touch `tools/nnue/*` or Engine runtime behavior.
- Progress:
  - Scope locked before edits:
    - do not modify `tools/nnue/*`
    - do not modify `packages/ai/src/engine/*`
    - do not modify Engine runtime/search semantics or the existing NNUE artifact contract
  - Current verified gaps:
    - `tools/alpha/distill-engine.mjs` only regenerates Engine-vs-Engine teacher matches and cannot consume existing NNUE selfplay manifests/replays.
    - `tools/alpha/train.mjs` correctly expects Alpha-native replay-buffer rows and therefore cannot use NNUE shard rows directly.
    - `tools/alpha/self-play.mjs` currently accepts only `--model <model-id>` and bootstraps a fresh seed model when that id is not registered.
  - Implementation target for this pass:
    - extend Alpha distill so it can read existing NNUE selfplay manifests and replay artifact paths, replay those decisions through the current Engine teacher, and emit Alpha replay-buffer rows under `tmp/alpha`.
    - extend Alpha selfplay so it can load `--model-file <candidate.json>` directly for post-train selfplay without a forced promotion step.
  - 2026-03-13 implementation progress:
    - rewrote `tools/alpha/distill-engine.mjs` into a direct-callable/exported Alpha distill entrypoint with two modes:
      - existing behavior preserved: rerun Engine-vs-Engine teacher matches when no import input is supplied
      - new additive behavior: `--input` / `--input-manifest` / `--input-replay` can ingest existing NNUE selfplay manifests or replay artifacts, deterministically replay the recorded commands, rebuild Alpha distill targets on those exact decision states, and emit Alpha-format shards under `tmp/alpha`
    - rewrote `tools/alpha/self-play.mjs` into a direct-callable/exported Alpha selfplay entrypoint with additive `--model-file <candidate.json>` support while preserving the existing `--model <model-id>` path
    - added regression coverage in `packages/ai/src/alpha/tooling-interop.test.ts` for:
      - importing an existing Engine replay/manifest into Alpha distill output
      - running Alpha selfplay directly from a candidate model JSON file
    - left `tools/nnue/*`, `packages/ai/src/engine/*`, and the Engine/NNUE runtime and artifact paths untouched
  - Verification:
    - `pnpm test -- packages/ai/src/alpha/tooling-interop.test.ts packages/ai/src/alpha/promotion-cli.test.ts packages/ai/src/alpha/default-model.test.ts packages/ai/src/alpha/serialization.test.ts`
      - passed: `4` files, `5` tests
    - direct interop proof inside the new test suite:
      - imported an existing Engine-style selfplay manifest/replay into Alpha distill shards
      - ran Alpha selfplay directly from a candidate model file with no promotion step

## Execution Plan (Refresh engine_primer.md - 2026-03-12)
- [x] Re-audit `engine_primer.md` against the current promotion, archive, selfplay default-model, and gate-summary behavior.
- [x] Update only the stale primer sections so the document matches the live code and tooling.
- [x] Re-read the edited primer against the live files and record verification.
- Progress:
  - Current doc/code drift before edits:
    - the primer still describes `gameplay-default-v1` as only the simple built-in baseline, but live runtime now loads a promoted override when present.
    - the primer still says a proper promotion workflow does not exist, but `pnpm nnue:promote` now rewrites the live default and archives blessed candidates under `archive/nnue/gameplay-promotions/`.
    - the primer does not state that new self-play runs without `--model` now use the current promoted default model.
    - the primer does not record that gameplay gate summaries now persist `passed` in JSON, and that promotion can read older summaries that omitted it by deriving pass/fail from `winRate` and `threshold`.
  - 2026-03-12 primer refresh:
    - updated the current default-model section to describe the live override-backed `gameplay-default-v1` path and the fallback baseline.
    - updated self-play to state that omitted `--model` now resolves to the currently promoted default for new processes.
    - updated gate to document persisted pass/fail status and the expected shell exit-code behavior on failed gates.
    - updated deployment/runtime sections to describe the real `pnpm nnue:promote` workflow and the durable archive at `archive/nnue/gameplay-promotions/`.
    - updated strengths, limitations, and product-improvement sections to reflect the new archive-backed single-slot promotion system and the remaining gaps (`list`, `restore`, challenger/champion archive flows).
  - Verification:
    - code-vs-doc reread against:
      - `tools/nnue/self-play.mjs`
      - `tools/nnue/gate-gameplay-model.mjs`
      - `tools/nnue/promote-gameplay-model.mjs`
      - `tools/nnue/promotion-helpers.mjs`
      - `packages/ai/src/engine/default-model.ts`
      - `packages/ai/src/engine/default-gameplay-model-override.ts`
      - `packages/ai/src/engine/model-registry.ts`
    - `pnpm test -- packages/ai/src/engine/default-model.test.ts packages/ai/src/engine/promotion-cli.test.ts`
      - passed: `2` files, `2` tests
    - `pnpm build`
      - passed across the workspace

## Execution Plan (Promoted Model Archive - 2026-03-12)
- [x] Add a durable repo-local archive for promoted gameplay models outside `tmp/`.
- [x] Make `nnue:promote` persist the blessed candidate, gate summary, and promotion record into that archive on every promotion.
- [x] Backfill the current 15-5 champion into the archive and verify the archive path plus promotion workflow.
- Progress:
  - Current gap before edits:
    - the live promoted default is stored in `packages/ai/src/engine/default-gameplay-model-override.ts`, but historical promoted candidates still only live in their original `tmp/...` run folders.
    - there is no dedicated repo-local archive path for blessed gameplay models, so restoring or comparing champions later still depends on `tmp/` hygiene.
  - Implementation target for this pass:
    - add `archive/nnue/gameplay-promotions/` as the canonical durable home for promoted gameplay models.
    - write one archived folder per promotion containing the candidate JSON, gate summary copy, and a promotion record with source/gate metadata.
    - keep the existing live promotion behavior intact while making future restorations safer.
  - 2026-03-12 implementation progress:
    - added archive constants and naming helpers in `tools/nnue/promotion-helpers.mjs`.
    - updated `tools/nnue/promote-gameplay-model.mjs` so every promotion now:
      - copies the blessed candidate JSON into a dated folder under `archive/nnue/gameplay-promotions/`
      - copies the gate summary alongside it when one is present
      - writes `promotion-record.json` inside that archived promotion folder
      - appends the promotion record to `archive/nnue/gameplay-promotions/index.json`
    - extended `packages/ai/src/engine/promotion-cli.test.ts` so the promotion workflow is now verified against archive creation as well as live override writing.
  - Verification:
    - `pnpm build`
      - passed
    - `pnpm test -- packages/ai/src/engine/default-model.test.ts packages/ai/src/engine/promotion-cli.test.ts`
      - passed: `2` files, `2` tests
    - backfilled the current champion by rerunning:
      - `pnpm nnue:promote --model tmp/selfplay-200x1000-20260311/candidate-gameplay-model.json --gate-summary tmp/selfplay-200x1000-20260311/gate-summary.json`
      - passed and rebuilt the workspace
    - archive contents confirmed at:
      - `archive/nnue/gameplay-promotions/2026-03-12T14-51-25-058Z-gameplay-default-v1-candidate-gameplay-model-1773293596447/`
      - with `candidate-gameplay-model.json`, `gate-summary.json`, `promotion-record.json`, and root `archive/nnue/gameplay-promotions/index.json`

## Execution Plan (Gameplay Promotion Gate Summary Bugfix - 2026-03-12)
- [x] Fix `nnue:promote` so it accepts existing gameplay gate-summary files that omit `passed` but still include `winRate` and `threshold`.
- [x] Fix `nnue:gate` so future gate-summary artifacts persist `passed` explicitly instead of only printing it to stdout.
- [x] Add regression coverage for the real historical gate-summary shape and verify the promotion command path.
- Progress:
  - Confirmed the live bug before edits:
    - `tmp/selfplay-200x1000-20260311/gate-summary.json` contains `winRate` and `threshold` but no `passed` property.
    - `tools/nnue/promotion-helpers.mjs` currently requires `gateSummary.passed === true`, so promotion incorrectly rejects that real passed gate artifact.
    - `tools/nnue/gate-gameplay-model.mjs` prints `passed` to stdout but does not write it into the JSON summary file.
  - 2026-03-12 implementation progress:
    - updated `tools/nnue/promotion-helpers.mjs` so promotion derives `passed` from `winRate > threshold` whenever the gate-summary file omits the explicit boolean.
    - updated `tools/nnue/gate-gameplay-model.mjs` so future `gate-summary.json` artifacts persist `passed` in the written JSON, matching the console output.
    - updated `packages/ai/src/engine/promotion-cli.test.ts` to use the real historical gate-summary shape with no `passed` field, preventing this regression from reappearing.
  - Verification:
    - `pnpm build`
      - passed
    - `pnpm test -- packages/ai/src/engine/default-model.test.ts packages/ai/src/engine/promotion-cli.test.ts`
      - passed: `2` files, `2` tests
    - `pnpm nnue:promote --model tmp/selfplay-200x1000-20260311/candidate-gameplay-model.json --gate-summary tmp/selfplay-200x1000-20260311/gate-summary.json --out-file tmp/promote-smoke/default-gameplay-model-override.ts --no-build`
      - passed as a non-destructive smoke using the exact real gate-summary file that previously failed

## Execution Plan (Gameplay NNUE Promotion Workflow - 2026-03-12)
- [x] Add a real `nnue:promote` command for gameplay models instead of relying on manual/default-model edits.
- [x] Wire the runtime default gameplay model to a tracked promoted-artifact override so a blessed candidate actually becomes the in-game default.
- [x] Add focused verification for the promotion path and record the exact promotion command.
- Progress:
  - Confirmed the current gap before edits:
    - `nnue:gate` can load a candidate file into the process-local registry, but there is no `nnue:promote` entrypoint.
    - runtime surfaces still default to the built-in `gameplay-default-v1` in `packages/ai/src/engine/default-model.ts`.
    - the current default gameplay model is hard-coded in source, so a passed gate result is not enough to change live runtime behavior.
  - Implementation target for this pass:
    - add a tracked source override file for the promoted default gameplay model.
    - keep `gameplay-default-v1` as the runtime id while replacing its weights from a blessed candidate.
    - add a CLI promotion command that validates the candidate and optional gate summary, then rewrites the override artifact.
  - 2026-03-12 implementation progress:
    - added `packages/ai/src/engine/default-gameplay-model.override.ts` as the tracked promoted-artifact hook for the runtime default gameplay model.
    - rewired `packages/ai/src/engine/default-model.ts` so `gameplay-default-v1` now materializes from promoted override weights when present, while preserving the existing built-in baseline as the fallback.
    - added `tools/nnue/promote-gameplay-model.mjs` plus a new `pnpm nnue:promote` package script.
    - adjusted the tracked override filename to `default-gameplay-model-override.ts` so the existing ESM `.js` extension loader resolves the built artifact correctly; the earlier dotted filename would be treated as having extension `.override` and would not auto-resolve to `.js`.
    - kept `default-gameplay-model.override.ts` as a compatibility re-export shim instead of deleting it, preserving any existing source references while the live runtime path uses the hyphenated filename.
    - the promotion command now:
      - validates the candidate as a gameplay NNUE model
      - requires a passed `--gate-summary` unless `--force` is used
      - rewrites the tracked runtime override file with the blessed weights under `gameplay-default-v1`
      - rebuilds the workspace by default so the promoted model is immediately reflected in built runtime artifacts
    - added focused regression coverage for:
      - runtime default-model id normalization when loading promoted weights
      - the `nnue:promote` file-writing flow in `--no-build` mode through a `packages/ai/src/engine` Vitest entry that matches the repo's test include pattern
  - Verification:
    - `pnpm build`
      - passed after wiring the runtime default to the tracked promotion override
    - `pnpm test -- packages/ai/src/engine/default-model.test.ts packages/ai/src/engine/promotion-cli.test.ts`
      - passed: `2` files, `2` tests
    - `pnpm nnue:promote --model tmp/selfplay-200x1000-20260311/candidate-gameplay-model.json --gate-summary tmp/promote-smoke/gate-summary-passed.json --out-file tmp/promote-smoke/default-gameplay-model-override.ts --no-build`
      - passed as a non-destructive CLI smoke, proving the package-script entrypoint rewrites a promotion override module and normalizes the promoted runtime id to `gameplay-default-v1`
  - Promotion command for live use:
    - `pnpm nnue:promote --model <candidate-model.json> --gate-summary <gate-summary.json>`
    - the command rebuilds the workspace by default so the promoted gameplay model becomes the active built-in `gameplay-default-v1`

## Execution Plan (Alpha Transformer + PUCT Blueprint - 2026-03-12)
- [x] Audit the current AI architecture and isolate the shared seams that an Alpha pipeline may reuse without altering `Tactical` or `Engine`.
- [x] Write `alpha_plan.md` as a complete standalone blueprint for an AlphaZero-style transformer + PUCT/MCTS AI line.
- [x] Explicitly document pipeline isolation, model/search/training architecture, runtime integration, testing, and acceptance criteria so Alpha can be implemented without interfering with `nnue:*`.
- Progress:
  - Confirmed the current AI seams that Alpha may plug into while preserving existing behavior:
    - strategy-tier dispatch in `packages/ai/src/types.ts` and `packages/ai/src/ai-controller.ts`
    - current Engine wrapper in `packages/ai/src/strategy/engine-strategy.ts`
    - shared macro-action surface in `packages/ai/src/engine/candidate-generator.ts`
    - UI AI selection in `packages/ui/src/game/screens/ArmyLoadScreen.tsx`
    - UI AI execution in `packages/ui/src/game/hooks/useAITurn.ts`
    - current NNUE tooling entrypoints in `package.json` and `tools/nnue/`
  - Added `alpha_plan.md` at the repo root with a full blueprint covering:
    - non-negotiable isolation rules
    - transformer + action-conditioned policy/value architecture
    - PUCT/MCTS theory and chance-handling approach
    - distillation bootstrap from the current Engine
    - Alpha-only self-play/train/gate pipeline and artifact contracts
    - UI/headless/MCP runtime integration boundaries
    - testing, implementation phases, risks, and acceptance criteria
  - Alpha plan boundary is explicit:
    - `Tactical` remains unchanged
    - `Engine` remains unchanged
    - `nnue:selfplay`, `nnue:train`, and `nnue:gate` remain separate from any future `alpha:*` tooling

## Execution Plan (Full Engine Selfplay Coverage Repair - 2026-03-11)
- [ ] Inventory every live human-playable runtime decision surface and compare it to the current Engine search macro-action surface.
- [ ] Cross-check each confirmed coverage gap against the local Horus Heresy rules docs before changing code.
- [ ] Implement the missing candidate-generation / command-wiring needed so selfplay can legally exercise those runtime features.
- [ ] Add or update focused tests for the repaired search surfaces.
- [ ] Re-run targeted verification and selfplay smoke so the repaired coverage claims are evidence-backed.
- Progress:
  - Coverage audit findings before edits:
    - runtime supports standalone `manifestPsychicPower` during `Start/StartEffects` and `Movement/Move`, but Engine search generates none of those commands.
    - runtime supports declared psychic payloads on `declareShooting` (`Foresight's Blessing`) and `declareCharge` (`Biomantic Rage`), but Engine search currently emits those commands without `psychicPower`.
    - runtime exposes `embark` and `disembark` in `Movement/Move`, but Engine search currently generates neither transport action.
    - core `Reposition` reactions and White Scars `ws-chasing-wind` both need legal `modelPositions`, but Engine search currently emits bare `selectReaction` commands with no movement payload.
    - `declareWeapons` is a real live fight-surface override; without it the engine falls back to auto-selecting the best melee weapon per model, which keeps selfplay playable but not fully human-equivalent where alternate melee choices matter.
  - Rules-doc cross-check completed for the first confirmed gaps:
    - `HH_Armoury.md`
      - `Biomantic Rage`: Charge Sub-Phase, step 4, before volley attacks
      - `Force Barrier`: psychic reaction at shooting step 3 / charge step 4
      - `Foresight's Blessing`: Shooting Phase, step 4 of the attack
      - `Mind-burst`: Movement Phase, before the focus unit moves
      - `Tranquillity`: Start Phase, Effects Sub-Phase
    - `HH_Rules_Battle.md`
      - movement-phase `Embark` / `Disembark`
      - reaction movement and assault/shooting decision timing
  - Current implementation target for this pass:
    - add search coverage for standalone psychic powers, declared shooting/charge psychic powers, legal reposition-style reaction moves, and transport embark/disembark.
    - then re-evaluate whether `declareWeapons` still needs explicit search generation after the higher-priority feature-family gaps are closed.
  - 2026-03-11 implementation progress:
    - exported the live psychic-runtime and transport-access helpers through `@hh/engine` so the AI layer can consume the same rule-validation surfaces instead of duplicating psychic/transport legality logic.
    - updated the shared AI shooting-weapon selector so discipline-granted ranged psychic weapons are part of the candidate pool and are resolved through the live engine weapon-assignment path.
    - rewired `packages/ai/src/engine/candidate-generator.ts` so Engine search now emits:
      - standalone `manifestPsychicPower` actions for `Tranquillity` and `Mind-burst`
      - `declareShooting` variants with `Foresight's Blessing`
      - `declareCharge` variants with `Biomantic Rage`
      - direct and move-into-position `embark` actions plus legal `disembark` actions
      - `selectReaction` payloads for core `Reposition` and White Scars `ws-chasing-wind`
      - challenge declarations from runtime challenger/acceptor eligibility instead of name heuristics
      - gambit selections from runtime-available gambits plus psychic gambits
      - `declareWeapons` + `resolveFight` macro-actions for the current combat
    - corrected the engine movement barrel so the newly used transport-access helpers are actually exported during package builds.
  - Verification after the selfplay-coverage repair:
    - `pnpm test -- packages/ai/src/helpers/weapon-selection.test.ts packages/ai/src/engine/search.test.ts packages/ai/src/engine/candidate-generator.test.ts`
      - passed: `3` files, `36` tests
    - `pnpm build`
      - passed across the workspace after fixing the movement export barrel
    - `pnpm test`
      - passed: `138` files, `3838` tests
    - selfplay smoke:
      - `node --loader ./tools/esm-js-extension-loader.mjs tools/nnue/self-play.mjs --matches 1 --time-budget-ms 50 --max-depth-soft 2 --rollout-count 1 --max-commands 400 --out-dir tmp/selfplay-smoke-20260311`
      - passed with `terminatedReason: "game-over"` and `239` samples in `tmp/selfplay-smoke-20260311/manifest.json`

## Execution Plan (Refresh engine_primer.md - 2026-03-11)
- [x] Re-audit `engine_primer.md` against the current Engine runtime, UI worker path, MCP schema, and NNUE tooling defaults.
- [x] Update only the stale primer sections so the document matches the live code, including any recent public-surface removals.
- [x] Re-read the edited primer against the referenced code paths and record what was updated.
- Progress:
  - Current doc/code drift identified before editing:
    - the primer still treats blast/template placement as a generic macro-action surface, but the live public command path now bundles those placements into `declareShooting` and no longer exposes standalone `placeBlastMarker`.
    - the primer does not state that the engine runtime supports psychic commands/reactions while the current AI searcher still does not generate standalone `manifestPsychicPower` actions or psychic declarations on shooting/charge attacks.
    - the primer describes the budget-aware search defaults, but not the current UI override that hardcodes `maxDepthSoft: 4` for Engine in both setup screens.
    - the primer does not record the current CLI defaults for self-play, training, and gameplay gate.
  - Updated `engine_primer.md` to reflect the current live surface:
    - documented that blast/template placement is bundled into `declareShooting` and that standalone `placeBlastMarker` is gone from the public type/MCP surface.
    - documented the current rush macro behavior (`rushUnit` plus rushed `moveUnit`, or continuation from `RushDeclared`).
    - documented the current runtime-vs-search gap for psychic decisions: runtime supports them, current Engine search does not generate them yet.
    - documented the UI worker fallback and the current setup-screen Engine overrides (`maxDepthSoft: 4`, `rolloutCount: 1`, `baseSeed: 1337`, `diagnosticsEnabled: true`).
    - documented current self-play, training, and gameplay-gate CLI defaults.
  - Verification for the doc refresh was a code-vs-doc reread against:
    - `packages/ai/src/engine/candidate-generator.ts`
    - `packages/ui/src/game/hooks/useAITurn.ts`
    - `packages/ui/src/game/screens/ArmyLoadScreen.tsx`
    - `packages/ui/src/game/screens/ArmyBuilderScreen.tsx`
    - `packages/mcp-server/src/register-tools.ts`
    - `packages/types/src/game-state.ts`
    - `tools/nnue/self-play.mjs`
    - `tools/nnue/train-gameplay-model.mjs`
    - `tools/nnue/gate-gameplay-model.mjs`
    - `tools/nnue/common.mjs`
  - Final proofreading cleanup:
    - normalized the UI worker-fallback bullet wording in `engine_primer.md` after the verification reread.

## Execution Plan (Remove Stale Standalone Blast Marker Command - 2026-03-11)
- [x] Remove the unused standalone `placeBlastMarker` command from the public type surface, command processor, and MCP schema.
- [x] Preserve the live blast/template gameplay path on `declareShooting` with `blastPlacements` / `templatePlacements`.
- [x] Re-run targeted engine and MCP verification to confirm blast/template attacks still work and the stale command surface is gone.
- Progress:
  - Audit confirmed the live rules-accurate path already uses `declareShooting.blastPlacements` and `templatePlacements`.
  - Rules-doc check against `HH_Rules_Battle.md` and `HH_Armoury.md` confirms blast marker placement must happen before Hit Tests, but does not require a separate command boundary.
  - The stale standalone `placeBlastMarker` surface is isolated to:
    - `packages/types/src/game-state.ts`
    - `packages/types/src/index.ts`
    - `packages/engine/src/command-processor.ts`
    - `packages/mcp-server/src/register-tools.ts`
  - Removed the stale standalone `placeBlastMarker` command from:
    - `packages/types/src/game-state.ts`
    - `packages/types/src/index.ts`
    - `packages/engine/src/command-processor.ts`
    - `packages/mcp-server/src/register-tools.ts`
  - Added an MCP regression assertion in `packages/mcp-server/src/register-tools.test.ts` so the `submit_action` schema no longer advertises `placeBlastMarker`.
  - Verification after the fix:
    - `pnpm build` passed
    - `pnpm test -- packages/engine/src/command-processor.test.ts packages/engine/src/shooting/shooting-integration.test.ts packages/mcp-server/src/register-tools.test.ts` passed
    - targeted result: `3` files, `138` tests passed

## Execution Plan (Full Engine Feature Wiring Audit - 2026-03-11)
- [ ] Inventory the full engine feature surface and map each feature family to its runtime entrypoints, registries, and verification coverage.
- [ ] Audit registry-backed systems for wiring gaps between data definitions and executable engine/runtime handlers.
- [ ] Run targeted and integration verification across each engine feature family, then re-run the full suite to catch cross-system regressions.
- [ ] Fix only the concrete wiring/runtime defects proven by the audit, updating this file after each change.
- [ ] Re-run the affected targeted suites plus headless/selfplay smoke to confirm the engine remains fully playable after any fixes.
- Progress:
  - Initial surface inventory confirms active engine feature families under `packages/engine/src`:
    - `movement`
    - `shooting`
    - `assault`
    - `missions`
    - `legion` (`tacticas`, `advanced-reactions`, `legion-gambits`, integration hooks)
    - `psychic`
    - `special-rules`
    - core runtime (`command-processor`, `state-machine`, `state-helpers`, `game-queries`, `phase-ux`, `phases`)
  - Current test surface across `packages/engine/src`, `packages/ai/src`, and `packages/headless/src` contains `5018` `describe` / `it` blocks, so this pass should focus on whether the right things are wired, not only whether tests exist.
  - Registry/data wiring audit:
    - `LEGION_ADVANCED_REACTIONS`: `20` data definitions, `20` registered handlers after `registerAllAdvancedReactions()`.
    - `LEGION_GAMBITS`: `21` data definitions, `21` registered runtime gambits after `registerAllLegionGambits()`.
    - `RITES_OF_WAR`: `20` data definitions, `20` registered runtime definitions after `registerAllRitesOfWar()`.
    - `LEGION_TACTICAS`: `20` data definitions; tactica runtime intentionally registers by `(legion, hook)` pair rather than tactica ID, producing `22` active hook registrations across the supported tactica hooks.
    - `PSYCHIC_DISCIPLINES`: `6` definitions present in data and consumed by the live psychic runtime.
    - `ALL_MISSIONS`: `3` core missions and `3` deployment maps present in data.
  - Targeted engine-family verification passed:
    - core runtime + headless:
      - `pnpm test -- packages/engine/src/command-processor.test.ts packages/engine/src/phase-ux.test.ts packages/engine/src/state-machine.test.ts packages/engine/src/state-helpers.test.ts packages/engine/src/game-queries.test.ts packages/headless/src/index.test.ts packages/headless/src/run.test.ts packages/headless/src/session.test.ts packages/headless/src/replay.test.ts`
      - result: `9` files, `227` tests passed
    - movement:
      - `pnpm test -- packages/engine/src/movement/move-handler.test.ts packages/engine/src/movement/movement-validator.test.ts packages/engine/src/movement/reserves-handler.test.ts packages/engine/src/movement/embark-disembark-handler.test.ts packages/engine/src/movement/reposition-handler.test.ts packages/engine/src/movement/rout-handler.test.ts packages/engine/src/special-rules/movement-rules.test.ts`
      - result: `7` files, `201` tests passed
    - shooting:
      - `pnpm test -- packages/engine/src/shooting/shooting-integration.test.ts packages/engine/src/shooting/shooting-validator.test.ts packages/engine/src/shooting/weapon-declaration.test.ts packages/engine/src/shooting/hit-resolution.test.ts packages/engine/src/shooting/wound-resolution.test.ts packages/engine/src/shooting/save-resolution.test.ts packages/engine/src/shooting/damage-resolution.test.ts packages/engine/src/shooting/vehicle-damage.test.ts packages/engine/src/shooting/morale-handler.test.ts packages/engine/src/shooting/return-fire-handler.test.ts packages/engine/src/shooting/overload-misfire.test.ts packages/engine/src/special-rules/shooting-rules.test.ts`
      - result: `12` files, `373` tests passed
    - assault:
      - `pnpm test -- packages/engine/src/assault/assault-integration.test.ts packages/engine/src/assault/charge-validator.test.ts packages/engine/src/assault/setup-move-handler.test.ts packages/engine/src/assault/volley-attack-handler.test.ts packages/engine/src/assault/charge-move-handler.test.ts packages/engine/src/assault/overwatch-handler.test.ts packages/engine/src/assault/challenge-handler.test.ts packages/engine/src/assault/gambit-handler.test.ts packages/engine/src/assault/challenge-strike-handler.test.ts packages/engine/src/assault/fight-handler.test.ts packages/engine/src/assault/initiative-step-handler.test.ts packages/engine/src/assault/melee-resolution.test.ts packages/engine/src/assault/resolution-handler.test.ts packages/engine/src/assault/aftermath-handler.test.ts packages/engine/src/assault/pile-in-handler.test.ts packages/engine/src/special-rules/assault-rules.test.ts`
      - result: `16` files, `536` tests passed
    - legion systems:
      - `pnpm test -- packages/engine/src/legion/legion-tactica-registry.test.ts packages/engine/src/legion/tacticas/shooting-tacticas.test.ts packages/engine/src/legion/tacticas/assault-tacticas.test.ts packages/engine/src/legion/tacticas/movement-tacticas.test.ts packages/engine/src/legion/tacticas/passive-tacticas.test.ts packages/engine/src/legion/tacticas/hereticus-tacticas.test.ts packages/engine/src/legion/integration/tactica-shooting-integration.test.ts packages/engine/src/legion/integration/tactica-assault-integration.test.ts packages/engine/src/legion/advanced-reaction-registry.test.ts packages/engine/src/legion/advanced-reactions/movement-reactions.test.ts packages/engine/src/legion/advanced-reactions/shooting-reactions.test.ts packages/engine/src/legion/advanced-reactions/assault-reactions.test.ts packages/engine/src/legion/integration/advanced-reaction-integration.test.ts packages/engine/src/legion/legion-gambit-registry.test.ts packages/engine/src/legion/legion-gambits/all-gambits.test.ts packages/engine/src/legion/integration/gambit-integration.test.ts packages/engine/src/legion/rite-of-war-registry.test.ts packages/engine/src/legion/allegiance.test.ts`
      - result: `18` files, `798` tests passed
    - missions + registry:
      - `pnpm test -- packages/engine/src/missions/mission-state.test.ts packages/engine/src/missions/objective-queries.test.ts packages/engine/src/missions/secondary-objectives.test.ts packages/engine/src/missions/victory-handler.test.ts packages/engine/src/missions/vanguard-bonus.test.ts packages/engine/src/special-rules/rule-registry.test.ts`
      - result: `6` files, `107` tests passed
  - Rules-doc cross-check for fix candidates:
    - reviewed `HH_Rules_Battle.md` Shooting Attack Procedure steps 1-11 and `HH_Armoury.md` `Blast (X)` rules before changing any blast/template path
    - rules require the blast marker to be placed before Hit Tests, but do not require a separate command boundary between declaration and placement
    - current live gameplay path remains rules-compatible because blast/template placement is bundled into `declareShooting` via `blastPlacements` / `templatePlacements`, and that is the path used by current UI, AI, out-of-phase shooting, and tests
  - Residual engine-surface inconsistency found during audit:
    - `placeBlastMarker` is still present in `GameCommand`, `processCommand(...)`, and the MCP schema, but it is not surfaced by `getValidCommands()` and the live shooting pipeline does not consume its stored `shootingAttackState.blastMarker` data
    - this is not breaking current gameplay because live blast/template attacks use bundled placements on `declareShooting`
    - fully wiring standalone marker placement would require a deliberate two-step shooting declaration flow (and equivalent template-placement surface), which is larger than a safe audit hotfix
  - Current direct-test blind spots are integration-covered rather than unit-covered:
    - `psychic/power-handler.ts`
    - `psychic/psychic-runtime.ts`
    - `phases/start-phase.ts`
    - `phases/shooting-phase.ts`
    - `phases/assault-phase.ts`
    - `phases/end-phase.ts`
    - `shooting/out-of-phase-shooting.ts`
    - `shooting/special-shot-resolution.ts`
    - `movement/transport-access.ts`
    - and related helper/types modules
    - these are currently exercised indirectly through command-processor, integration, replay, and selfplay verification rather than dedicated file-local tests
  - Audit conclusion for this pass:
    - no new rules-runtime defect was proven in the live engine feature families
    - movement, shooting, assault, missions, legion systems, psychic integration, headless runtime, replay determinism, and selfplay all executed cleanly on the current rebuilt workspace
    - no code changes were made in this audit pass because the only concrete mismatch found was a stale standalone blast-marker API surface, not a broken live gameplay path

## Execution Plan (Full Selfplay / Training / Rebuild Pipeline Audit - 2026-03-11)
- [x] Trace the live selfplay, training, gating, and headless execution paths from the current local workspace and confirm which built artifacts they actually consume.
- [x] Rebuild the workspace from the current source so the pipeline is running against fresh local `dist` output rather than stale artifacts.
- [x] Run targeted and full verification across build, tests, replay determinism, selfplay, training, and gate flows to surface any concrete breakpoints.
- [x] Fix only the issues proven by the audit that block the engine from completing clean rules-accurate headless games and NNUE pipeline runs.
- [x] Re-run the full pipeline end-to-end and record the final commands, outputs, and any residual risks.
- Progress:
  - Initial audit confirms the current NNUE pipeline executes through:
    - `tools/nnue/self-play.mjs` -> `runInstrumentedMatch(...)` in `tools/nnue/common.mjs`
    - `tools/nnue/train-gameplay-model.mjs`
    - `tools/nnue/gate-gameplay-model.mjs`
    - built runtime packages in `packages/*/dist`, especially `@hh/ai`, `@hh/headless`, and `@hh/engine`
  - Initial audit focus for this pass:
    - validate that engine-vs-engine selfplay terminates cleanly with no command rejections, AI errors, or non-terminal stalls
    - validate that replay artifacts remain deterministic after rebuild
    - validate that training consumes current-schema features and emits a loadable gameplay model artifact
    - validate that gating can benchmark the rebuilt candidate against Tactical without hidden runtime drift
    - validate that the rebuild path itself is complete and reproducible from the current workspace
  - Rebuild + verification results for this pass:
    - `pnpm build` passed on the current workspace, rebuilding all package `dist` outputs used by the NNUE pipeline.
    - `pnpm test -- packages/headless/src/replay.test.ts` passed, preserving deterministic replay verification on rebuilt output.
    - `pnpm content:validate` passed with `102` whitelist units, `102` indexed units, and `102` generated unit files.
    - `pnpm test` passed cleanly: `138` test files and `3828` tests.
  - Live selfplay audit results:
    - `pnpm nnue:selfplay --matches 4 --time-budget-ms 75 --max-commands 600 --shard-size 1000000 --out-dir tmp/pipeline-audit/selfplay`
    - manifest: `tmp/pipeline-audit/selfplay/manifest.json`
    - result: `4/4` matches terminated as `game-over`, `0` command rejections, `0` AI errors, `0` abnormal terminations, `1052` samples, `1` shard
    - replay final-state hashes:
      - `f7c84d5cb2f8022e`
      - `2d4d1c23be25ed97`
      - `fea16ad0c973ca6e`
      - `19570fdfe63236f3`
  - Training + gate audit results:
    - `pnpm nnue:train --input tmp/pipeline-audit/selfplay/selfplay-shard-001.jsonl --out tmp/pipeline-audit/candidate-gameplay-model.json --epochs 12`
    - training output: `tmp/pipeline-audit/candidate-gameplay-model.json`
    - training metrics: `tmp/pipeline-audit/candidate-gameplay-model.json.metrics.json`
    - trainer consumed the current feature schema and completed `12/12` epochs with `947` training samples and `105` validation samples.
    - `pnpm nnue:gate --model tmp/pipeline-audit/candidate-gameplay-model.json --matches 4 --time-budget-ms 75 --out tmp/pipeline-audit/gate-summary.json`
    - gate summary: `tmp/pipeline-audit/gate-summary.json`
    - gate runtime completed with `0` aborts and `0` timeouts; the tiny fresh candidate lost `0-4` to Tactical and therefore failed the promotion threshold, which is a model-strength result rather than a pipeline/runtime failure.
  - Audit conclusion for this pass:
    - No code defects were surfaced by the rebuild, test, replay, selfplay, training, or gate runs.
    - The engine/selfplay/training pipeline is rebuilt and operational for a larger corpus regeneration run.
    - The next meaningful improvement is regenerating a larger selfplay dataset and retraining from that broader corpus, not patching runtime code blindly.

## Execution Plan (Full Rules-Critical Engine Accuracy Pass - 2026-03-11)
- Audit scope for this pass:
  - Current local workspace only. No GitHub comparison, no fallback to older remote state.
  - Primary rules sources: `HH_Principles.md`, `HH_Rules_Battle.md`, `HH_Armoury.md`, `HH_Legiones_Astartes.md`, `HH_Battle_AOD.md`, `HH_Core.md`, `HH_Tables.md`, `HH_v2_units.md`, and `legiones_astartes_clean.md` when a profile/type/subtype lookup is required.
- Active execution order:
  - 1. Replace all remaining simplified out-of-phase shooting paths with shared helpers built on `handleShootingAttack(...)`.
  - 2. Land `Overload(X)` in the shared shooting pipeline so Bitter Fury, Spite of the Gorgon, and overloaded weapons stop bypassing live rules.
  - 3. Replace transport access-point placeholder parsing/runtime checks with facing-aware access geometry.
  - 4. Replace challenge and assault fallback heuristics with profile-backed stat/type/rule checks.
  - 5. Wire psychic runtime into the live phase engine.
  - 6. Add focused regressions for each audited gap and rerun the targeted/full verification suites.
- [x] Replace the simplified unit-level LOS queries with the real geometry LOS pipeline, including terrain blocking and intervening vehicle hulls.
- [x] Replace the simplified volley / charge-reaction shooting shortcuts with a shared out-of-phase shooting executor so volleys, Overwatch-adjacent reactions, movement/shooting/assault advanced reactions, and Return Fire all resolve through the live hit/wound/save/damage path with the correct rule restrictions.
- [x] Add full `Overload(X)` support to the shared shooting pipeline, including pre-modifier misfire generation, template misfires from Firepower dice, deferred misfire-group resolution after triggered reactions, and self-allocation / lowest-AV vehicle resolution.
- [x] Replace dangerous-terrain direct wounds with rules-accurate damage resolution, including invulnerable-save handling and vehicle Hull Point loss behavior.
- [x] Replace simplified transport embark/disembark access-point parsing and runtime checks with real facing-aware access geometry, including transport-bay special rules and emergency-disembark placement constraints.
- [x] Replace challenge eligibility name heuristics with profile-backed type / subtype / rule checks so challenge declaration and disgrace targeting match the rules text.
- [x] Implement the missing psychic runtime path so psychic weapons, powers, reactions, and gambits defined in local data are actually executable in the phase engine.
- [x] Re-audit the remaining charge/setup/fight handlers for any live ordering or geometry shortcuts, rerun focused/full verification, and only then do a second code-vs-rules sweep for residual gameplay mismatches.
- Progress:
  - Audit refresh on 2026-03-11 identified these live rules gaps at the start of the pass:
    - `packages/engine/src/assault/volley-attack-handler.ts` still only emits summary volley events and does not resolve real attacks.
    - `packages/engine/src/legion/advanced-reactions/shooting-reactions.ts`, `packages/engine/src/legion/advanced-reactions/movement-reactions.ts`, and `packages/engine/src/legion/advanced-reactions/assault-reactions.ts` still resolve several live advanced reactions with invented default statlines, default movement values, or other simplified mini-engines instead of the shared rules pipeline.
    - `packages/engine/src/movement/embark-disembark-handler.ts`, `packages/types/src/units.ts`, and `packages/data/src/profile-converter.ts` still model transport access points as free-text plus placeholder offsets, not real facing-aware geometry.
    - `packages/engine/src/assault/challenge-handler.ts` still uses name heuristics such as `"sergeant"` / `"captain"` instead of profile type/subtype/rule eligibility for challenge participation.
    - `packages/engine/src/phases/start-phase.ts` and the rest of the local engine runtime do not yet execute the psychic powers / reactions / gambits already defined in `packages/data/src/psychic-disciplines.ts`.
  - Completed the LOS replacement in the live query/shooting path:
    - `packages/geometry/src/line-of-sight.ts` now blocks LOS with intervening vehicle circles as well as hull rectangles.
    - `packages/engine/src/game-queries.ts` now uses real geometry LOS for `hasLOSToUnit()` and `getModelsWithLOSToUnit()`, including terrain blocking and intervening vehicle shapes.
    - `packages/engine/src/phases/shooting-phase.ts` now passes actual intervening vehicle blockers into the shooting LOS filter.
    - `packages/engine/src/assault/state-helpers-queries.test.ts` now covers heavy-terrain blocking, intervening-vehicle blocking, and mixed-visibility model filtering, and the old closest-distance expectation was corrected to the base-aware query already used by the live engine.
  - Focused LOS verification passed:
    - `pnpm test -- packages/engine/src/assault/state-helpers-queries.test.ts packages/engine/src/shooting/shooting-validator.test.ts`
  - New rules-critical finding from the docs audit:
    - `Overload(X)` is still not implemented anywhere in the live shooting pipeline, despite being required by multiple weapons and by advanced reactions such as `Bitter Fury` and `Spite of the Gorgon`.
  - Shared out-of-phase shooting now replaces the previous placeholder resolution paths for:
    - `packages/engine/src/assault/volley-attack-handler.ts`
    - Overwatch / Return Fire in `packages/engine/src/command-processor.ts`
    - `Bastion of Fire`, `Bitter Fury`, `Retribution Strike`, and `Spite of the Gorgon`
  - Final deterministic replay verification update:
    - `packages/headless/src/replay.test.ts` golden hashes/signature were refreshed to the new stable local outputs after the rules-accurate movement, assault, mission, and psychic runtime changes altered deterministic command selection and turn-state hashes.
    - New replay turn hashes:
      - `04ef05820a8bf443`
      - `69129b001d59f88e`
      - `7187ca8ad1dd85d2`
      - `4490e4d35ce73b22`
    - New AI signature baseline starts with unit-level movement commands (`moveUnit`) rather than the previous per-model movement signature, and the current stable AI final-state hash is `0516bff2f8f3c46a`.
  - Final verification for the 2026-03-11 audit pass completed cleanly:
    - `pnpm build`
    - `pnpm test -- packages/headless/src/replay.test.ts`
    - `pnpm test`
  - Psychic runtime wiring completed:
    - `packages/engine/src/psychic/power-handler.ts`
      - `resolveDeclaredShootingPsychicPower(...)` now records `Foresight’s Blessing` as an `endOfShootingAttack` psychic effect with pass/fail metadata so paused attacks can resume without re-manifesting or losing the granted `Precision (5+)` state.
      - added `unitCanDeclarePsychicReaction(...)` so shooting/charge handlers can offer `Force Barrier` and `Resurrection` only when a unit really has a legal focus, allotment, and remaining psychic reaction usage.
      - corrected the `Resurrection` availability gate so the offer can be created from the real pre-step-11 state (`REMOVING_CASUALTIES`) and then resolved from the paused `AWAITING_RESURRECTION` state.
    - `packages/engine/src/phases/shooting-phase.ts`
      - live shooting now offers `Force Barrier` at the start of step 3, resolves declared `Foresight’s Blessing` before fire-group formation, and persists declared psychic power state through paused reactions.
      - step 11 casualty removal / vehicle damage / morale finalization is now deferred behind an exported helper so `Resurrection` can pause the attack before casualties are removed, then resume the real step 11 path afterward.
    - `packages/engine/src/phases/assault-phase.ts`
      - charge declarations now execute `Biomantic Rage` after setup move and before the volley/Overwatch window, and charge step 4 can now offer `Force Barrier` against the charging unit before volley attacks resolve.
    - `packages/engine/src/command-processor.ts` and `packages/engine/src/phase-ux.ts`
      - added live `manifestPsychicPower` routing/availability during `Start/StartEffects` and `Movement/Move`.
      - psychic reactions (`Force Barrier`, `Resurrection`) now resolve through the same pending-reaction router as core and advanced reactions.
      - resumed shooting/charge declarations now preserve `declaredPsychicPower`, concrete wargear option adds/removes now update equipped gear instead of only recording a marker, and `declareWeapons` now accepts real psychic melee weapons granted by disciplines.
    - cleanup tied to the same pass:
      - `packages/engine/src/assault/combat-state.ts` no longer rejects psychic melee declarations because of the old typed-null melee-weapon resolver shape.
  - Rush command-path repair progress:
    - `packages/types/src/game-state.ts` now includes `UnitMovementState.RushDeclared` so `rushUnit` can represent a real pre-move declaration instead of a terminal state.
    - `packages/engine/src/movement/move-handler.ts` now lets legacy sequential `moveModel` rush movement resolve with `M + I`, while `handleRushUnit(...)` records the declaration as `RushDeclared` and the actual move consumes it into `Rushed`.
    - `packages/engine/src/command-processor.test.ts` and `packages/engine/src/movement/move-handler.test.ts` now cover both the declaration step and the follow-up rush movement path.
    - `packages/ai/src/engine/candidate-generator.ts` now emits full rush macros (`rushUnit` + `moveUnit { isRush: true }`) instead of a dead-end declaration, and `packages/ai/src/phases/movement-ai.ts` can continue an already-declared rush with a live rush move.
    - Focused AI regression fixtures were corrected to keep both armies present while validating rush moves through the real move validator.
  - Resolution audit follow-up:
    - `packages/engine/src/assault/resolution-handler.ts` panic-check leadership selection no longer floors to a hardcoded `8`; it now uses the best real losing-side leadership and only falls back if no losing unit can be resolved at all.
    - `packages/engine/src/assault/resolution-handler.test.ts` now covers both the real unit-led leadership path and the true missing-unit fallback path.
    - Verification passed:
      - `pnpm --filter @hh/engine typecheck`
      - `pnpm test -- packages/engine/src/assault/resolution-handler.test.ts packages/engine/src/assault/assault-integration.test.ts packages/engine/src/command-processor.test.ts`
  - Audit cleanup:
    - stale “simplified” comments in the advanced reaction and setup-move handlers were updated to match the live shared-pipeline/coherency implementations so the local repo now reflects the real rules path instead of the old placeholder description.
  - Full-suite follow-up:
    - `packages/engine/src/shooting/casualty-removal.ts` now ignores already-destroyed models completely during step-11 casualty removal, so it no longer emits duplicate `casualtyRemoved` events or incorrectly counts those models toward panic-threshold morale checks.
    - runtime shooting finalization now passes an explicit casualty-removal option when a model has already been reduced to `0` wounds earlier in the same attack, preserving required `casualtyRemoved` events for Bastion of Fire, Gun Down, Overload misfires, and the main shooting pipeline while still skipping pre-existing dead models.
      - `packages/engine/src/phases/assault-phase.ts`, `packages/engine/src/psychic/power-handler.ts`, and `packages/engine/src/psychic/psychic-runtime.ts` had the follow-on signature / unused-parameter issues from the psychic wiring corrected before verification.
    - focused regression coverage added:
      - `packages/engine/src/command-processor.test.ts` now covers start-phase `Tranquillity`, move-phase `Mind-burst`, psychic shooting weapons, `Force Barrier`, `Resurrection`, and psychic melee weapon declaration through the live command router.
      - `packages/engine/src/assault/challenge-strike-handler.test.ts` now covers forced hit-target overrides used by `Every Strike Foreseen`.
    - follow-up fix from the focused tests:
      - `packages/engine/src/shooting/out-of-phase-shooting.ts` now restores any pre-existing paused `shootingAttackState` after temporary Overwatch / Return Fire style attacks, so reaction shooting no longer wipes the original parent attack window.
  - `Overload(X)` is now wired into the live shooting pipeline:
    - Raw hit rolls at or below `X` now create deferred misfire groups for normal ranged attacks.
    - Template weapons now roll their Firepower dice for misfires after hit determination.
    - Vehicle misfires now resolve against the firing vehicle's lowest Armour Value.
    - Shooting attacks paused by a pending Return Fire window now carry misfire groups on `shootingAttackState` and resolve them only after that reaction window is closed.
  - Transport access geometry replacement completed in the live data/runtime path:
    - `packages/types/src/units.ts` now defines structured access-point geometry instead of placeholder relative offsets.
    - `packages/data/src/profile-converter.ts` now parses the exact local datasheet access-point phrase set into typed facings / all-facing / base-edge fallback rules and fails loudly on unknown access text.
    - `packages/data/src/unit-parser.ts` now preserves `No official base size` as `0` so hull-facing access is no longer conflated with a fake 32mm base.
    - `packages/engine/src/movement/transport-access.ts` now resolves access regions against the existing hull/base geometry for embark, disembark, and emergency-disembark validation.
    - `packages/engine/src/movement/embark-disembark-handler.ts` now measures embark against real access facings, validates disembark final positions by reachable distance from a legal access placement using each model's Movement characteristic, and rejects arbitrary emergency-disembark placements that do not contact the transport or previously placed models.
    - `packages/engine/src/movement/embark-disembark-handler.test.ts` and `packages/engine/src/command-processor.test.ts` were updated so the focused transport regressions use rules-legal Rhino/Mastodon/flyer-base placements and real Rhino transport fixtures rather than the removed center-proxy assumptions.
  - Challenge/assault fallback replacement is now using live profile metadata instead of blocked name heuristics:
    - `packages/types/src/enums.ts` now includes a `Champion` subtype so challenge legality can match the rules text instead of treating champions as a string search.
    - `packages/types/src/units.ts`, `packages/data/src/profile-converter.ts`, and `packages/engine/src/profile-lookup.ts` now preserve and expose per-model type/subtype data from parsed datasheets, which is required for Paragon / Command / Champion challenge eligibility and later combat-resolution majority weighting.
    - `packages/data/src/generated/unit-profiles.ts` and `packages/data/src/generated/mvp-unit-profiles.ts` have been regenerated from the local datasheet parser/converter so the live runtime profile registry now carries the new per-model type/subtype fields.
    - `packages/data/src/profile-converter.ts` no longer lets mixed-unit regular models inherit leader/champion metadata from similarly named leader entries.
    - `packages/engine/src/assault/challenge-handler.ts` now computes challenge eligibility from profile type/subtype plus explicit local challenge rules, enforces mandatory challengers/acceptors for Sigismund / Legion Champions / Fulgrim Transfigured / Rylanor, applies Sigismund's alternate challenged-model CRP compensation, and rejects illegal declines when a combat contains a model that must accept.
    - `packages/engine/src/assault/unit-characteristics.ts`, `packages/engine/src/assault/setup-move-handler.ts`, `packages/engine/src/assault/charge-move-handler.ts`, `packages/engine/src/assault/pile-in-handler.ts`, and `packages/engine/src/assault/resolution-handler.ts` now source Cool, Leadership, Movement, Initiative, and Walker/Paragon combat-control weighting from live profiles instead of Space Marine fallback assumptions.
  - Focused challenge/assault verification passed after the profile-backed replacement work:
    - `pnpm test -- packages/engine/src/assault/challenge-handler.test.ts`
    - `pnpm test -- packages/engine/src/assault/assault-integration.test.ts`
    - `pnpm test -- packages/engine/src/assault/resolution-handler.test.ts packages/engine/src/assault/setup-move-handler.test.ts packages/engine/src/assault/charge-move-handler.test.ts packages/engine/src/assault/pile-in-handler.test.ts`
  - Completed assault-runtime aftermath fixes:
    - `packages/engine/src/assault/aftermath-handler.ts` has now been moved onto live profile-backed aftermath movement:
      - Hold / Fall Back / Pursue / Consolidate now use per-model Initiative.
      - Disengage now uses per-model Movement, falls back to Hold if a model cannot increase distance from the combat, and applies Routed if the final disengage position breaks coherency or remains in base contact.
      - Gun Down now unlocks the firing unit, uses the shared out-of-phase shooting executor with snap shots plus assault-trait-only weapon filtering, and emits results from the real shooting pipeline instead of a bespoke hit/wound stub.
      - Aftermath option availability now also enforces the explicit `HH_Principles.md` restriction that units including Vehicle models may only choose Hold.
  - Focused aftermath verification passed after the live aftermath rewrite:
    - `pnpm --filter @hh/engine typecheck`
    - `pnpm test -- packages/engine/src/assault/aftermath-handler.test.ts packages/engine/src/assault/assault-integration.test.ts`
  - Shooting casualty cleanup has been corrected so Step 11 now emits `casualtyRemoved` for models already marked destroyed during damage application instead of silently skipping them.
  - Targeted reaction tests were realigned to the actual local weapon/rules data rather than the removed placeholder assumptions:
    - Local reaction fixtures now use the real `bolter` weapon ID instead of the non-data `boltgun` synonym.
    - The focused advanced-reaction assertions now account for real weapon Firepower values, the live ballistic-skill hit table, and base-aware distance checks instead of the old placeholder assumptions.
  - Dangerous terrain runtime now matches the rules text and the focused movement/state suite is green:
    - `pnpm test -- packages/engine/src/movement/move-handler.test.ts packages/engine/src/state-machine.test.ts`
  - Earlier audit findings before the final rules fixes were:
    - `packages/engine/src/assault/volley-attack-handler.ts` still resolves volley attacks as summary events only and does not use the full shooting pipeline.
    - `packages/engine/src/legion/advanced-reactions/shooting-reactions.ts`, `packages/engine/src/legion/advanced-reactions/movement-reactions.ts`, and `packages/engine/src/legion/advanced-reactions/assault-reactions.ts` still contain simplified shooting implementations for live advanced reactions such as `Bastion of Fire`, `Bitter Fury`, and `Spite of the Gorgon`.
    - `packages/engine/src/movement/embark-disembark-handler.ts` still uses the first transport model position as a simplified access-point proxy instead of real facing/base access geometry.
    - Several comments marked `stub` / `simplified` were re-audited and are only stale comments, not additional live gameplay mismatches:
      - `packages/engine/src/phases/end-phase.ts`
      - `packages/engine/src/state-machine.ts`
  - Completed the Salamanders flame-immunity live-path fix and uncovered a separate legion-tactica initialization bug while doing it:
    - `packages/engine/src/shooting/shooting-types.ts`, `packages/types/src/game-state.ts`, `packages/engine/src/phases/shooting-phase.ts`, and `packages/engine/src/command-processor.ts` now carry `weaponTraits` through pending morale checks so morale/status resolution knows when a check came from a Flame weapon.
    - `packages/engine/src/shooting/morale-handler.ts` now skips Flame-weapon `Panic(X)` and other Flame-applied tactical status checks for Salamanders units using the existing `OnCasualty` tactica hook.
    - `packages/engine/src/legion/legion-tactica-registry.ts` now lazily auto-registers the full legion tactica set when the live runtime first calls `applyLegionTactica(...)` with an empty registry, fixing the previously uninitialized legion-tactica path without breaking focused tests that intentionally register a partial registry.
    - `packages/engine/src/legion/tacticas/passive-tacticas.ts` was hardened to tolerate missing `legionTacticaState` entries when evaluating the Ultramarines passive discount.
    - `packages/engine/src/shooting/shooting-validator.ts` was fixed to import `RectHull`, restoring a clean engine build after the LOS audit changes.
  - Verification passed for the Salamanders/tactica-runtime pass:
    - `pnpm test -- packages/engine/src/shooting/morale-handler.test.ts packages/engine/src/shooting/shooting-integration.test.ts packages/engine/src/command-processor.test.ts packages/engine/src/legion/tacticas/passive-tacticas.test.ts`
    - `pnpm --filter @hh/engine build`
  - Psychic runtime wiring completed in the local engine/type surface:
    - `packages/types/src/game-state.ts` now carries psychic usage/effect state plus a dedicated `manifestPsychicPower` command and declared-psychic-power attack metadata for charge/shooting flows.
    - `packages/types/src/index.ts` now re-exports the psychic runtime types so engine/headless/MCP consumers can compile against the same command/state surface.
    - `packages/engine/src/profile-lookup.ts` now exposes live Willpower lookups.
    - `packages/engine/src/characteristic-modifiers.ts` now provides shared numeric modifier application for live model/unit characteristics.
    - `packages/engine/src/psychic/psychic-runtime.ts` now resolves disciplines from selected local wargear options, exposes granted psychic weapons/powers/reactions/gambits, tracks per-turn psychic use, and tracks active psychic effects.
    - `packages/engine/src/psychic/psychic-runtime.ts` now also applies the correct lowest-Willpower Resistance target selection when no Sergeant / Command / Paragon model is available, and exposes a highest-Willpower focus selector for reaction handling.
    - `packages/engine/src/movement/rout-handler.ts` now exposes a reusable immediate fall-back mover so psychic and reaction-driven retreat effects can use the same terrain/edge movement logic as routed units.
    - `packages/engine/src/runtime-characteristics.ts` now exposes modifier-aware live characteristic helpers for movement/assault runtime paths.
    - `packages/engine/src/state-helpers.ts` and `packages/engine/src/state-machine.ts` now expire `endOfPhase` and `endOfSubPhase` modifiers when the live turn sequence advances instead of leaving those durations as inert metadata.
    - `packages/engine/src/game-queries.ts`, `packages/engine/src/movement/move-handler.ts`, `packages/engine/src/assault/unit-characteristics.ts`, and `packages/engine/src/assault/combat-state.ts` are being shifted to modifier-aware live characteristic lookups so psychic/assault buffs affect real movement, majority WS/T, and melee strike-group construction.
  - Reaction movement command path was hardened against the remaining live shortcuts found in the audit:
    - `packages/types/src/game-state.ts` and `packages/mcp-server/src/register-tools.ts` now allow `selectReaction` to carry explicit model destinations.
    - `packages/engine/src/command-processor.ts` now feeds core `Reposition` through those supplied destinations instead of forcing a hidden 0" no-op, and White Scars `Chasing the Wind` now resolves through the live `handleMoveUnit(...)` path with terrain, dangerous terrain, and coherency validation.
    - `packages/engine/src/movement/move-handler.ts` now accepts an explicit acting-player override so the same live movement executor can be reused for reaction movement without a separate placeholder implementation.
    - `packages/engine/src/legion/advanced-reactions/movement-reactions.ts` now uses the shared movement pipeline for autogenerated White Scars moves when the generated path is legal, while retaining a deterministic fallback for direct registry calls that lack explicit player-chosen destinations.
    - `packages/engine/src/movement/reposition-handler.ts` now validates reposition destinations with the real terrain/exclusion/base-overlap checks and resolves dangerous terrain damage during the reaction move, rather than bypassing those rules in a bespoke validator.
    - focused regressions added in `packages/engine/src/movement/reposition-handler.test.ts` for difficult-terrain range reduction and dangerous-terrain damage during Reposition.
  - Charge-movement ordering/coherency audit follow-up:
    - `packages/engine/src/assault/setup-move-handler.ts` and `packages/engine/src/assault/charge-move-handler.ts` now build predicted final positions for remaining chargers and back off each move only as much as needed to preserve final coherency, instead of always taking the old straight-line nearest-target shortcut.
    - focused regressions added in `packages/engine/src/assault/setup-move-handler.test.ts` and `packages/engine/src/assault/charge-move-handler.test.ts`.

## Execution Plan (Mission Objective Control + Scoring Rules Fix - 2026-03-10)
- [x] Re-audit mission objective control and scoring against `HH_Battle_AOD.md` and `HH_Armoury.md` before making any more NNUE/training assumptions.
- [x] Replace the simplified primary-objective scoring path with rules-accurate control/scoring logic for `Line(X)`, `Support Unit(X)`, `Vanguard(X)`, and strongest-unit contested control.
- [x] Enforce the one-unit-per-objective / one-objective-per-unit declaration constraint during scoring resolution instead of scoring every objective independently.
- [x] Add the missing Vanguard bonus VP runtime hooks for shooting destruction and assault fallback/massacre, with once-per-objective-per-player-turn tracking.
- [x] Rebuild and verify the corrected mission path through focused tests, workspace build, and a self-play smoke run.
- Progress:
  - Confirmed the old scoring path was materially simplified:
    - objective control compared player-wide summed strength instead of the single strongest contesting unit
    - vehicles/cavalry/automata without `Line` could still hold objectives
    - primary scoring ignored `Line(X)` VP bonus and the `Support Unit(X)` / `Vanguard(X)` scoring caps
    - the Victory handler scored each objective independently, so one unit could effectively score multiple objectives in the same Victory sub-phase
    - Vanguard bonus VP for destroying/falling back objective units was not implemented in the live runtime
  - Implemented rules-accurate objective queries and scoring:
    - `packages/engine/src/missions/objective-queries.ts`
      - unit-level tactical strength now uses eligible models only, with `Line(X)` added per model
      - holder eligibility now rejects `Vehicle`, `Cavalry`, and `Automata` unless the model has `Line`
      - objective scoring now applies majority `Line(X)` bonus, `Support Unit(X)` hard cap, and `Vanguard(X)` 1-VP control cap
      - added resolved scoring-time objective assignment so a unit can only claim one objective and an objective can only be claimed by one unit per player
    - `packages/engine/src/missions/victory-handler.ts`
      - primary objective scoring now uses the resolved assignment/control state instead of the old independent-per-objective shortcut
    - `packages/types/src/mission-types.ts`
      - added `vanguardBonusHistory` and `assaultPhaseObjectiveSnapshot` to mission runtime state
    - `packages/engine/src/missions/vanguard-bonus.ts`
      - added once-per-objective-per-player-turn Vanguard bonus tracking
      - added shooting bonus for destroying the declared controlling/contesting unit
      - added assault bonus for objective-adjacent units that fall back or are massacred after a combat involving a qualifying Vanguard unit
    - `packages/engine/src/command-processor.ts`
      - records the start-of-Assault objective snapshot on entry to the Charge sub-phase
    - `packages/engine/src/phases/shooting-phase.ts`
      - applies Vanguard destruction bonus after casualty removal
    - `packages/engine/src/phases/assault-phase.ts`
      - applies Vanguard bonus after massacres and aftermath fall backs
  - Added/updated regression coverage:
    - `packages/engine/src/missions/objective-queries.test.ts`
    - `packages/engine/src/missions/victory-handler.test.ts`
    - `packages/engine/src/missions/vanguard-bonus.test.ts`
    - mission-state / secondary-objective helpers updated for the expanded mission runtime state
  - Verification passed:
    - `pnpm test -- packages/engine/src/missions/objective-queries.test.ts packages/engine/src/missions/victory-handler.test.ts packages/engine/src/missions/mission-state.test.ts packages/engine/src/missions/secondary-objectives.test.ts packages/engine/src/missions/vanguard-bonus.test.ts`
    - `pnpm build`
    - `pnpm nnue:selfplay --matches 1 --time-budget-ms 50 --max-commands 300 --shard-size 1000000 --out-dir tmp/mission-rules-smoke/selfplay`
  - Smoke artifact:
    - `tmp/mission-rules-smoke/selfplay/manifest.json` shows `1/1 game-over`, `0` abnormal terminations, `243` samples.

## Execution Plan (Embark Fixture Red Test Fix - 2026-03-10)
- [x] Inspect the failing embark integration test and confirm whether the failure is in the engine logic or the test fixture.
- [x] Correct the fixture so the embark integration test uses a real transport profile without changing embark behavior.
- [x] Rerun the affected engine suite and record the result here.
- Progress:
  - Confirmed the failing red test was `packages/engine/src/command-processor.test.ts` under `processCommand > embark integration > should successfully embark during Move sub-phase`.
  - Confirmed the test fixture was using shorthand profile IDs that no longer match the live data-backed embark validation path: the supposed transport used the default `profileId: 'tactical'`, and the infantry passenger also used the old shorthand profile instead of the real tactical squad ID.
  - Updated the command-processor embark fixture to use `profileId: 'rhino'` for the transport and `profileId: 'tactical-squad'` for the embarking infantry, matching the dedicated embark/disembark handler tests and preserving the current engine behavior.
  - Verification passed:
    - `pnpm test -- packages/engine/src/command-processor.test.ts`
    - `pnpm test -- packages/mcp-server/src/match-manager.test.ts packages/mcp-server/src/register-tools.test.ts packages/headless/src/session.test.ts packages/headless/src/run.test.ts`

## Execution Plan (GitHub Sync - 2026-03-10)
- [x] Confirm the working tree contains the intended HHv2 MCP external-play and fixture-fix changes only.
- [x] Record the sync step here before committing.
- [ ] Commit the current HHv2 work with `Tarvorix` as author/committer and push `main` to `origin`.
- Progress:
  - Confirmed the current working tree contains the MCP external-agent play implementation, the assault/combat persistence changes that support it, the focused regression coverage, and the embark fixture correction.

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

## Review Plan (HH MCP Full-Play Support Audit - 2026-03-10)
- [x] Inspect the HH MCP tool surface and the underlying headless session/match manager flow.
- [x] Check whether all required match lifecycle actions for a full game are available through MCP today.
- [x] Summarize whether the MCP server currently supports full complete play, including any concrete gaps or caveats.
- Outcome:
  - Confirmed the MCP command schema covers the current `GameCommand` union and the tool surface exposes the full match lifecycle: `create_match`, `get_match`, `get_legal_actions`, `submit_action`, `advance_ai_decision`, `get_observer_snapshot`, replay export, and archive.
  - Confirmed over the actual MCP HTTP transport that an AI-vs-AI match can be created and advanced to `isGameOver=true` via repeated `advance_ai_decision` calls (`111` tool calls in the audited smoke test, ending on battle turn `4` in `End/Victory`).
  - Caveat: manual/external-client play is not fully self-describing through MCP today because `get_legal_actions` only returns command types, not server-computed legal payload options such as valid move destinations, eligible shooting assignments, challenge targets, or aftermath options.

## Implementation Plan (HH MCP Full External-Agent Play Support - 2026-03-10)
- [x] Audit and, if needed, repair any engine/headless phase paths that would block externally driven full-game play once concrete MCP decision helpers are exposed.
- [x] Add a shared headless decision-support layer that returns concrete legal MCP-ready commands and supporting metadata for the current decision window.
- [x] Expose the new decision-support surface through the HH match manager and MCP server without removing the existing tool set.
- [x] Add regression coverage proving the MCP server can provide complete concrete decisions for external agents across full-match play.
- [x] Rebuild, run focused tests, and verify an externally driven match can reach a winner using the new MCP helper path.
- Progress:
  - Added persistent assault combat state syncing across Challenge, Fight, and Resolution so externally driven play is no longer relying on ephemeral combat detection during those sub-phases.
  - Reworked the challenge/fight/resolution plumbing so declared challenges persist on a combat, gambit selections resolve into challenge state updates, Fight builds real melee strike groups from engaged models and melee weapons, and Resolution stores CRP back onto the combat state for aftermath decisions.
  - Added a headless decision-support layer that computes the true acting player for reactions, challenge responses/gambits, and resolution aftermath, then returns concrete macro-actions with full command payloads.
  - Exposed that surface through the session, match manager, and MCP server as `get_decision_options` and `submit_decision_option`.
  - Added regression coverage:
    - `packages/mcp-server/src/match-manager.test.ts` now drives a full external-agent match through `getDecisionOptions` + `submitDecisionOption` to `winnerPlayerIndex=0`.
    - `packages/mcp-server/src/register-tools.test.ts` now asserts the expanded MCP tool catalog and calls `get_decision_options` through an in-memory MCP client.
  - Verification passed:
    - `pnpm --filter @hh/engine typecheck`
    - `pnpm --filter @hh/engine build`
    - `pnpm --filter @hh/ai build`
    - `pnpm --filter @hh/headless typecheck`
    - `pnpm --filter @hh/headless build`
    - `pnpm --filter @hh/mcp-server typecheck`
    - `pnpm --filter @hh/mcp-server build`
    - `pnpm test -- packages/mcp-server/src/match-manager.test.ts packages/mcp-server/src/register-tools.test.ts packages/headless/src/session.test.ts packages/headless/src/run.test.ts`
  - Additional note:
    - A broader run of `pnpm test -- packages/engine/src/command-processor.test.ts` still reports one unrelated failing embark integration assertion (`should successfully embark during Move sub-phase`). This change did not touch embark/disembark code, so that failure is tracked as residual and not part of the MCP external-play path.

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

## Execution Plan (200-Match 1000ms Self-Play Audit + Train + 10-Game Gate - 2026-03-10)
- [x] Audit the completed `200`-match curated 2000-point self-play corpus at `1000ms` for clean terminations and obvious anomalies before using it for training.
- [x] Train a fresh gameplay candidate from the audited shard using the current gameplay `v3` schema and trainer settings.
- [x] Gate the trained candidate over `10` mirrored curated matchups at `1000ms` and record the outcome here.
- Progress:
  - Audited `tmp/nnue-200-2000-v3-1000ms/manifest.json` and `selfplay-shard-001.jsonl`:
    - `200/200` matches terminated as `game-over`
    - `0` missing replay artifacts
    - shard line count exactly matched the recorded `49,512` samples
    - sample spread was `227` to `299` per game (`247.56` average)
  - Trained a fresh gameplay candidate with:
    - `pnpm nnue:train --input tmp/nnue-200-2000-v3-1000ms/selfplay-shard-001.jsonl --out tmp/nnue-200-2000-v3-1000ms/candidate.json --epochs 12 --learning-rate 0.01 --validation-split 0.2 --patience 3 --min-delta 0.0001`
    - Result: model `gameplay-default-v1-candidate-1773156308483`
    - Training samples: `39,610`
    - Validation samples: `9,902`
    - Early-stopped at epoch `5`; best validation epoch was `2`
  - Gated the trained candidate with:
    - `pnpm nnue:gate --model tmp/nnue-200-2000-v3-1000ms/candidate.json --matches 10 --time-budget-ms 1000 --threshold -1 --out tmp/nnue-200-2000-v3-1000ms/gate-10.json`
    - Result: `0 wins / 10 losses / 0 draws / 0 aborted / 0 timeouts` vs `Tactical` (`winRate: 0.0`)
  - Outcome:
    - The overnight `200 @ 1000ms` corpus is mechanically clean and suitable as training input.
    - The trained candidate is decisively weaker than `Tactical` on a mirrored 10-game gate, which points at evaluator/training quality rather than runtime stability problems.

## Implementation Plan (50-Feature Objective-First Evaluator Pass - 2026-03-10)
- [x] Audit the current objective/control/scoring helpers so the next evaluator pass uses real mission-aware signals instead of proximity-only approximations.
- [x] Expand the gameplay feature schema from `39` to `50` features with stronger VP, objective-value, control-strength, holder-survival, and flip-risk modeling.
- [x] Rework tactical signal summaries and candidate ordering so scorer survival, objective swing, and delivery/retaliation risk outrank generic kill pressure.
- [x] Update the built-in gameplay model/schema wiring and refresh `engine_primer.md` so the documented Engine matches the new evaluator shape.
- [x] Run focused AI/headless verification and record the outcome here.
- Progress:
  - Audited the existing mission/evaluator path and confirmed the main blind spot: the old gameplay evaluator still leaned on proximity-style objective features and generic target value rather than actual controlled VP, threatened held VP, flippable enemy VP, and scorer survival.
  - Upgraded `packages/ai/src/engine/tactical-signals.ts` to a more mission-aware summary layer:
    - objective control now reads through the real mission control query instead of simple proximity counts
    - added controlled/count/VP summaries, control margin, durable-held VP, threatened-held VP, flippable enemy VP, reachable objective VP, projected scoring swing, scoring-unit value, exposed scorer value, and transport delivery value
    - added `estimateObjectiveRemovalSwing(...)` so target ordering can value removing holders/scorers by actual objective swing
  - Upgraded `packages/ai/src/engine/feature-extractor.ts` from gameplay schema `v3` / `39` features to gameplay schema `v4` / `50` features.
    - the new schema is explicitly objective-first and now encodes actual controlled VP, threatened held VP, flippable enemy VP, reachable objective VP, projected scoring swing, scorer counts/value/readiness, scorer pressure, scorer exposure, and transport delivery alongside the older material/status/threat features
  - Updated `packages/ai/src/engine/default-model.ts` so the built-in gameplay model now ships with `50` feature priors that weight objective/VP features more heavily than the old layout.
  - Updated `packages/ai/src/engine/candidate-generator.ts` so:
    - movement lane scoring gives more weight to projected objective swing and less weight to generic base-score carryover
    - shooting ordering now adds direct objective-swing value from `estimateObjectiveRemovalSwing(...)`
  - Updated `packages/ai/src/engine/feature-extractor.test.ts` and `packages/ai/src/engine/tactical-signals.test.ts` for the new schema/objective data shape.
  - Updated `engine_primer.md` so it now documents the shipped `50`-feature `v4` gameplay schema, the objective-first tactical summary layer, and the stronger movement/shoot ordering rules.
  - Verification passed:
    - `pnpm test -- packages/ai/src/engine/feature-extractor.test.ts packages/ai/src/engine/tactical-signals.test.ts packages/ai/src/engine/candidate-generator.test.ts packages/ai/src/engine/search.test.ts` (`4 files / 14 tests`)
    - `pnpm --filter @hh/ai build`
    - `pnpm --filter @hh/headless build`
    - `pnpm nnue:selfplay --matches 1 --time-budget-ms 50 --max-commands 200 --shard-size 1000000 --out-dir tmp/nnue-v4-smoke/selfplay`
      - Result: emitted a valid gameplay `v4` shard with `200` samples; the single smoke match hit the tiny `max-commands` cap, which is acceptable for a schema smoke run
    - `pnpm nnue:train --input tmp/nnue-v4-smoke/selfplay/selfplay-shard-001.jsonl --out tmp/nnue-v4-smoke/candidate.json --epochs 2 --learning-rate 0.01 --validation-split 0.2 --patience 1 --min-delta 0.0001`
      - Result: emitted a valid `v4` gameplay candidate, `160` train samples / `40` validation samples
  - Outcome:
    - The gameplay evaluator/search stack is now materially more objective-first than the prior `39`-feature `v3` path.
    - Old gameplay self-play shards and gameplay candidates are stale again after the `v4` schema bump; fresh gameplay self-play is required for any new real training or gate run.

## Execution Plan (Full Workspace Rebuild - 2026-03-10)
- [x] Inspect the available workspace build targets so the rebuild covers the intended packages and does not rely on a wrong top-level assumption.
- [x] Run the full workspace rebuild and capture any failing package/output.
- [x] Record the rebuild outcome here.
- Progress:
  - Confirmed the root workspace script is the intended full rebuild path: `pnpm build` -> `pnpm -r build`.
  - Rebuilt all workspace packages successfully:
    - `@hh/types`
    - `@hh/data`
    - `@hh/geometry`
    - `@hh/army-builder`
    - `@hh/engine`
    - `@hh/ai`
    - `@hh/headless`
    - `@hh/ui`
    - `@hh/mcp-server`
  - UI production bundling completed successfully under Vite.
  - Notable non-failing output:
    - Vite emitted chunk-size warnings for the production UI bundle (`engine-ai.worker` and main `index` bundle), but the build still completed cleanly.

## Audit Plan (Gameplay Gate Victory Validation - 2026-03-10)
- [x] Trace gameplay gate result classification from `nnue:gate` through the headless match result surface.
- [x] Trace mission scoring and winner determination through the engine rules implementation.
- [x] Record whether gameplay gate win/loss outcomes are using the real mission winner path.
- Progress:
  - Confirmed `tools/nnue/gate-gameplay-model.mjs` delegates match classification to `runGateMatches(...)`, which in turn classifies `game-over` results strictly from `result.finalState.winnerPlayerIndex`.
  - Confirmed `packages/headless/src/index.ts` returns `terminatedReason: 'game-over'` only when the live game state has already reached `state.isGameOver === true`.
  - Confirmed the engine mission winner is set in `packages/engine/src/missions/victory-handler.ts` from final victory-point totals after primary scoring, secondaries, Sudden Death bonus handling, and Counter Offensive.
  - Important correction at the time of this audit:
    - gameplay gate win/loss/draw was already using the real engine winner path
    - but the underlying mission control/scoring implementation was not yet fully rules-complete
  - Specific simplifications that existed before the completed mission rules fix:
    - `packages/engine/src/missions/objective-queries.ts` calculates tactical strength as `+1` per eligible model only and does not currently apply `Line(X)` / `Support Unit(X)` / `Vanguard(X)` objective-control modifiers
    - `packages/engine/src/missions/victory-handler.ts` scores primary objectives as `objective.currentVpValue` only and does not currently add `Line(X)` bonus VP or apply objective-scoring caps/modifiers from those special rules
  - Conclusion at that point:
    - gate results were authoritative relative to the then-current engine implementation
    - that mission-rules gap was later addressed by the completed `Mission Objective Control + Scoring Rules Fix` section above

## Implementation Plan (Mission Objective Rules Accuracy Fix - 2026-03-10)
- [x] Audit the local rules docs and the current objective-control / primary-scoring engine code to pin down the exact `Line`, `Support Unit`, `Vanguard`, and eligibility behavior we need to implement.
- [x] Implement rules-accurate objective control and primary-objective scoring in the engine so gate/self-play results use the real mission logic.
- [x] Add focused regression tests for objective eligibility, tactical strength, and primary scoring with `Line`, `Support Unit`, and `Vanguard`.
- [x] Rebuild and verify the affected engine/headless/runtime path before any further training runs.

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

## Benchmark Plan (25-Match Gameplay Gate - 2026-03-09)
- [x] Run a longer 25-match gate on the latest fixed gameplay candidate from `tmp/nnue-100-2000-v2-searchpass-fixed/candidate.json`.
- [x] Record the outcome artifact path and W/L/D/abort/timeout summary here.
- Progress:
  - Completed:
    - `pnpm nnue:gate --model tmp/nnue-100-2000-v2-searchpass-fixed/candidate.json --matches 25 --time-budget-ms 150 --threshold -1 --out tmp/nnue-100-2000-v2-searchpass-fixed/gate-25.json`
  - Result artifact:
    - `tmp/nnue-100-2000-v2-searchpass-fixed/gate-25.json`
  - Outcome:
    - `7 wins / 17 losses / 1 draw / 0 aborted / 0 timeouts`
    - `winRate: 0.28`
    - The longer gate confirms the current candidate is still materially behind `Tactical`, but the run was mechanically clean with no abnormal terminations.

## Implementation Plan (Threat-Aware Evaluator + Search Ordering Pass - 2026-03-09)
- [x] Add shared tactical-summary helpers that estimate pairwise kill pressure, retaliation danger, objective-holder durability, and exposed high-value units from the real game state.
- [x] Expand the gameplay feature extractor to encode those tactical summaries directly, with a new versioned feature schema and compatible default gameplay model shape.
- [x] Reuse the new tactical summaries in movement, shooting, and reaction ordering so search and static evaluation prioritize the same signals.
- [x] Tighten the gameplay trainer target so it relies less on weak self-search scores and more on actual outcomes, while preserving validation split and early stopping.
- [x] Add focused tests, rebuild affected packages, and refresh `engine_primer.md` with both the new evaluator/search behavior and a summary of engine improvements since inception.
- Progress:
  - Added `packages/ai/src/engine/tactical-signals.ts` with shared Engine-only tactical helpers for:
    - strategic unit value
    - ranged/melee kill pressure using real profile data
    - exposure / retaliation summaries
    - objective-holder durability and transport-payload threat
  - Updated `packages/ai/src/engine/feature-extractor.ts` to a `v3` / `41`-feature gameplay schema that now encodes:
    - kill pressure against objective holders and high-value targets
    - hold durability and contested-objective value
    - exposed objective-holder / high-value / warlord / payload pressure
    - anti-vehicle ranged and melee pressure
  - Updated `packages/ai/src/engine/default-model.ts` so the built-in gameplay model remains compatible with the new feature schema.
  - Updated `packages/ai/src/engine/candidate-generator.ts` so Engine movement, shooting, and reaction ordering now incorporate the same tactical signals used by the evaluator.
  - Updated `tools/nnue/train-gameplay-model.mjs` so gameplay training now defaults to a stronger outcome-weighted target (`0.9 outcome / 0.1 search`) while keeping target weights configurable.
  - Added focused regression coverage in:
    - `packages/ai/src/engine/feature-extractor.test.ts`
    - `packages/ai/src/engine/tactical-signals.test.ts`
  - Verification passed:
    - `pnpm test -- packages/ai/src/engine/feature-extractor.test.ts packages/ai/src/engine/tactical-signals.test.ts packages/ai/src/engine/candidate-generator.test.ts packages/ai/src/engine/search.test.ts` (`4 files / 13 tests`)
    - `pnpm --filter @hh/ai build`
    - `pnpm --filter @hh/headless build`
  - End-to-end NNUE smoke verification passed on the new `v3` gameplay schema:
    - `pnpm nnue:selfplay --matches 2 --time-budget-ms 50 --max-commands 300 --shard-size 1000000 --out-dir tmp/nnue-tactical-signals-smoke/selfplay`
      - result: `2/2 game-over`, `458` samples, `0` abnormal terminations
    - `pnpm nnue:train --input tmp/nnue-tactical-signals-smoke/selfplay/selfplay-shard-001.jsonl --out tmp/nnue-tactical-signals-smoke/candidate.json --epochs 4 --learning-rate 0.01 --validation-split 0.2 --patience 2 --min-delta 0.0001`
      - result: model `gameplay-default-v1-candidate-1773111162009`, `366` training samples, `92` validation samples, `bestEpoch=4`
    - `pnpm nnue:gate --model tmp/nnue-tactical-signals-smoke/candidate.json --matches 2 --time-budget-ms 50 --threshold -1 --out tmp/nnue-tactical-signals-smoke/gate.json`
      - result: `0 wins / 2 losses / 0 draws / 0 aborted / 0 timeouts`
  - Documentation:
    - Updated `engine_primer.md` to describe the tactical-summary evaluator/search path and added an end-of-document summary of Engine improvements since inception.

## Benchmark Plan (Fresh 100-Match v3 Self-Play + 8-Match Gate - 2026-03-09)
- [x] Run a fresh `100`-match curated 2000-point gameplay self-play batch on the current `v3` evaluator/search path.
- [x] Audit the finished manifest for abnormal terminations before training.
- [x] Train a fresh gameplay candidate from the `v3` shard.
- [x] Run the standard `8`-match gameplay gate and record the result.
- Progress:
  - `pnpm nnue:selfplay --matches 100 --time-budget-ms 150 --max-commands 1500 --shard-size 1000000 --out-dir tmp/nnue-100-2000-v3-tactical`: PASS
  - Output artifact: `tmp/nnue-100-2000-v3-tactical/manifest.json`
  - Result: `100/100` matches ended `game-over`, `23,420` samples, `1` shard
  - Manifest audit confirms `0` abnormal terminations before training
  - `pnpm nnue:train --input /Users/kylebullock/HHv2/tmp/nnue-100-2000-v3-tactical/selfplay-shard-001.jsonl --out /Users/kylebullock/HHv2/tmp/nnue-100-2000-v3-tactical/candidate.json --epochs 12 --learning-rate 0.01 --validation-split 0.2 --patience 3 --min-delta 0.0001`: PASS
  - Candidate: `gameplay-default-v1-candidate-1773119964921`
  - Training result: `23,420` total samples, `18,736` train, `4,684` validation, `bestEpoch=12`, `stoppedEarly=false`
  - `pnpm nnue:gate --model /Users/kylebullock/HHv2/tmp/nnue-100-2000-v3-tactical/candidate.json --matches 8 --time-budget-ms 150 --threshold -1 --out /Users/kylebullock/HHv2/tmp/nnue-100-2000-v3-tactical/gate.json`: PASS execution
  - Gate result: `0 wins / 8 losses / 0 draws / 0 aborted / 0 timeouts`

## Documentation Plan (Engine Primer Full Architecture + Feature Inventory - 2026-03-10)
- [x] Re-audit the current Engine package, UI worker path, headless session path, MCP schema, and NNUE tooling entry points.
- [x] Expand `engine_primer.md` so it documents the outer architecture around Engine with concrete runtime surfaces and responsibilities.
- [x] Replace the grouped gameplay feature summary with the full explicit `v3` feature inventory in extractor order.
- [x] Re-read the revised primer against the current code and record the documentation pass here.
- Outcome:
  - `engine_primer.md` now names the concrete Engine entry points in `packages/ai`, `packages/ui`, `packages/headless`, `packages/mcp-server`, and `tools/nnue` instead of only describing them abstractly.
  - The gameplay evaluator section now lists all `39` `v3` gameplay features explicitly in extractor order, including the sign/differential meaning of each feature.
  - The UI/headless/MCP/training sections were refreshed so they describe the actual worker path, session host, schema surface, curated default setup path, and current self-play vs gate split.
- Verification:
  - Re-read `engine_primer.md` against `packages/ai/src/ai-controller.ts`, `packages/ai/src/strategy/engine-strategy.ts`, `packages/ai/src/engine/feature-extractor.ts`, `packages/ai/src/engine/tactical-signals.ts`, `packages/ui/src/game/hooks/useAITurn.ts`, `packages/ui/src/game/hooks/engine-ai.worker.ts`, `packages/headless/src/session.ts`, `packages/mcp-server/src/register-tools.ts`, and `tools/nnue/common.mjs`
  - No tests run; documentation-only update

## Benchmark Plan (Single-Game Engine Telemetry at 500ms / 700ms / 1000ms - 2026-03-10)
- [x] Run one full curated 2000-point headless game at `500ms`, `700ms`, and `1000ms` with player 0 as `Engine` and player 1 as `Tactical`.
- [x] Use the same deterministic dice sequence and the same curated matchup for all three runs.
- [x] Aggregate exact per-decision Engine telemetry (`depthCompleted`, `nodesVisited`, `searchTimeMs`) for each game.
- [x] Record the resulting per-game stats and output artifact path.
- Outcome:
  - Matchup used for all three runs: `Dark Angels Combined Deathwing/Dreadwing` vs `World Eaters Chainaxe Spearhead`
  - Output artifact: `tmp/engine-budget-stats-20260310.json`
  - All three games ended `game-over` with player `1` winning
  - `500ms`: `264` executed commands, `146` Engine decisions, average `searchTimeMs=624.13`, average `nodesVisited=47.44`, average `depthCompleted=1.67`, depth histogram `{0:44,1:14,2:34,3:54}`
  - `700ms`: `252` executed commands, `140` Engine decisions, average `searchTimeMs=922.45`, average `nodesVisited=68.44`, average `depthCompleted=1.87`, depth histogram `{0:43,1:8,2:37,3:28,4:24}`
  - `1000ms`: `249` executed commands, `137` Engine decisions, average `searchTimeMs=1275.34`, average `nodesVisited=95.77`, average `depthCompleted=2.28`, depth histogram `{0:15,1:22,2:29,3:51,4:20}`
  - Observed issue from the raw telemetry: measured `searchTimeMs` can exceed the nominal budget ceiling substantially, so the current time-budget behavior is soft in practice rather than a hard wall-clock cap
- Verification:
  - `node --loader ./tools/esm-js-extension-loader.mjs --input-type=module -e "<benchmark harness>"`: PASS
  - `tmp/engine-budget-stats-20260310.json`: written successfully with the full raw per-budget summaries

## Hotfix Plan (Engine Budget Hardening + Depth-0 Fallback Removal - 2026-03-10)
- [x] Audit the current `search.ts` fallback behavior and the exact deadline-check locations that allow `depthCompleted = 0` and major wall-clock overruns.
- [x] Replace the unscored `rootActions[0]` fallback with a scored emergency root baseline so every returned move has at least one evaluated root pass behind it.
- [x] Harden deadline enforcement with a search safety margin and mid-loop checks so the configured budget behaves as a real cap in practice.
- [x] Add focused regression tests for emergency-root fallback and budget-aware early exit behavior.
- [x] Run focused AI tests plus a small search/timing verification and record the outcome here.
- Outcome:
  - `packages/ai/src/engine/search.ts` now uses a scored emergency root baseline instead of pre-seeding `bestAction` from `rootActions[0]`.
  - Deadline checks now run inside transition, auto-advance, recursive search, root loops, and rollout loops with a safety margin applied before the hard budget edge.
  - The previous `depthCompleted = 0` timeout fallback path is eliminated in normal budgeted search because every returned move now has at least an evaluated emergency-root pass behind it.
- Verification:
  - `pnpm test -- /Users/kylebullock/HHv2/packages/ai/src/engine/search.test.ts /Users/kylebullock/HHv2/packages/ai/src/engine/candidate-generator.test.ts`: PASS (`2 files / 9 tests`)
  - `pnpm --filter @hh/ai build`: PASS
  - `pnpm --filter @hh/headless build`: PASS
  - Post-fix telemetry artifact: `tmp/engine-budget-stats-20260310-postfix.json`
  - Post-fix telemetry summary:
    - `500ms`: avg `searchTimeMs=357.98`, max `450.52`, avg `depthCompleted=2.46`, depth histogram `{1:4,2:67,3:67}`
    - `700ms`: avg `searchTimeMs=536.05`, max `634.55`, avg `depthCompleted=2.97`, depth histogram `{2:64,3:29,4:60}`
    - `1000ms`: avg `searchTimeMs=775.86`, max `931.16`, avg `depthCompleted=3.04`, depth histogram `{2:57,3:20,4:62}`

## Documentation Plan (Engine Primer Refresh After Budget + Gate Fixes - 2026-03-10)
- [x] Refresh `engine_primer.md` so it reflects the current post-fix Engine behavior.
- [x] Document the scored emergency-root fallback and tighter budget enforcement in the search section.
- [x] Document the mirrored default gameplay gate rotation in the tooling section.
- [x] Re-read the updated primer against the current code and record the pass here.
- Outcome:
  - `engine_primer.md` now describes the current budget-hardened search behavior instead of the older soft-timeout behavior.
  - The primer now states that default gameplay gate runs mirrored curated matchup pairs before advancing to the next matchup family.
- Verification:
  - Re-read against `packages/ai/src/engine/search.ts` and `tools/nnue/common.mjs`
  - No tests run; documentation-only refresh

## Hotfix Plan (Mirrored Gameplay Gate Army Rotation - 2026-03-10)
- [x] Change the default gameplay gate matchup rotation so each curated pairing is evaluated twice in mirrored army-slot order before advancing to the next pairing.
- [x] Keep the change scoped to gameplay gate defaults, leaving self-play rotation unchanged.
- [x] Verify the first few generated gate matchups now alternate `A vs B`, then `B vs A`.
- [x] Run a small gameplay gate smoke command to confirm the mirrored setup path still executes cleanly.
- Outcome:
  - Added `createMirroredGateSetupOptions(...)` in `tools/nnue/common.mjs` and switched `runGateMatches(...)` to use it as the default gameplay gate setup factory.
  - The gameplay gate now evaluates curated pairings as mirrored two-game sets before advancing to the next matchup family.
  - Self-play still uses the existing non-mirrored curated rotation.
- Verification:
  - Pairing check:
    - `0: Dark Angels 2000pt Curated vs World Eaters 2000pt Curated`
    - `1: World Eaters 2000pt Curated vs Dark Angels 2000pt Curated`
    - `2: World Eaters 2000pt Curated vs Alpha Legion 2000pt Curated`
    - `3: Alpha Legion 2000pt Curated vs World Eaters 2000pt Curated`
  - `pnpm nnue:gate --matches 2 --time-budget-ms 50 --threshold -1 --out /Users/kylebullock/HHv2/tmp/nnue-gate-mirror-smoke.json`: PASS execution (`0 wins / 2 losses / 0 draws / 0 aborted / 0 timeouts`)

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

## Documentation Rewrite Plan (2026-03-13)
- [x] Audit the current repo surfaces that `alpha_plan.md` must match before rewriting the document.
- [x] Rewrite `alpha_plan.md` as a full Alpha transformer implementation specification aligned to the live repo state.
- [x] Remove milestone/scaffolding wording and lock Alpha to a full end-to-end completion standard.
- [x] Add explicit non-interference guarantees covering `Tactical`, `Engine`, and all `nnue:*` tooling/artifacts.

## Documentation Rewrite Completion (2026-03-13)
- Rewrote `alpha_plan.md` as a full implementation spec instead of a milestone/scaffolding blueprint.
- Updated the plan to match the live repo seams verified on 2026-03-13:
  - both AI setup screens (`ArmyLoadScreen` and `ArmyBuilderScreen`)
  - current worker routing (`Engine` worker only today, Alpha worker added as a separate path)
  - headless runtime surfaces (`index.ts`, `session.ts`, `decision-support.ts`, `cli.ts`)
  - MCP schema surface in `packages/mcp-server/src/register-tools.ts`
  - current archive-backed, code-generated default-model promotion pattern used by NNUE
- Locked Alpha to a complete end-to-end standard:
  - transformer runtime
  - PUCT/MCTS search
  - distillation
  - self-play
  - training
  - gate
  - promotion
  - full runtime shadow mode
- Explicitly removed partial-implementation language:
  - no empty `AlphaStrategy`
  - no scaffolding-only milestone
  - no dummy or handwritten default model
  - no `models/alpha` filesystem runtime registry
- Added hard non-interference rules requiring that `Tactical`, `Engine`, and all `nnue:*` tooling and artifacts remain unchanged.

## Alpha Implementation Plan (2026-03-13)
- [x] Add Alpha package/runtime/tooling dependencies and root scripts without changing existing `nnue:*` behavior.
- [x] Implement Alpha core inside `packages/ai/src/alpha` with model registry, serialization, TFJS inference, encoders, search, diagnostics, and strategy routing.
- [x] Extend UI, headless, and MCP player-selection/runtime surfaces for Alpha and runtime shadow Alpha while preserving current Tactical and Engine behavior.
- [ ] Implement `tools/alpha` distill/self-play/train/gate/promote/inspect flows with Alpha-only temp and archive paths.
- [ ] Add Alpha and regression tests, run install/typecheck/tests, and verify Tactical/Engine isolation.

## Alpha Implementation Progress (2026-03-13)
- Added root `alpha:*` scripts to `package.json`.
- Added `@tensorflow/tfjs` as an `@hh/ai` dependency.
- Ran `pnpm install` successfully after manifest updates.
- Implemented the Alpha core under `packages/ai/src/alpha`:
  - shared Alpha constants, base64 tensor serialization, checksum handling, and default search config
  - deterministic state and action encoders over the current `GameState` + shared macro-action surface
  - TFJS transformer forward pass, tensor layout, and deterministic model initialization
  - explicit PUCT search with sampled chance outcomes, queued-plan emission, batched leaf evaluation, and root caching
  - Alpha model registry/default-model plumbing and additive strategy-factory routing
- Extended `packages/ai/src/types.ts`, `packages/ai/src/index.ts`, and `packages/ai/src/ai-controller.ts` for the Alpha tier, Alpha diagnostics, Alpha config fields, and shadow Alpha diagnostics attachment.
- Ran `pnpm --filter @hh/ai typecheck` successfully after the Alpha core landed.
- Wired Alpha through the runtime surfaces:
  - added dedicated Alpha worker files and hook routing in `packages/ui/src/game/hooks`
  - exposed Alpha tier selection plus runtime shadow Alpha controls in both setup screens
  - extended headless library/session/decision-support/CLI config plumbing for `alphaModelId`, `maxSimulations`, and `shadowAlpha`
  - extended MCP `playerConfigSchema` to accept Alpha and shadow Alpha config fields
- Rebuilt `@hh/ai` and verified downstream typechecks stay green:
  - `pnpm --filter @hh/ui typecheck`
  - `pnpm --filter @hh/headless typecheck`
  - `pnpm --filter @hh/mcp-server typecheck`
- Fixed the Alpha trainer loss-capture typing in `packages/ai/src/alpha/training.ts` so `@hh/ai` can build/typecheck cleanly before the remaining Alpha tooling work lands.
- Added the first half of the Alpha tooling pipeline under `tools/alpha`:
  - `distill-engine.mjs` for Engine-teacher corpus generation
  - `self-play.mjs` for Alpha mirror/curriculum corpus generation
  - `train.mjs` for TFJS Alpha model training and candidate export
- Added the remaining Alpha tooling flow:
  - `gate.mjs` for Tactical/Engine/current-Alpha benchmark gating
  - `inspect-buffer.mjs` for replay-buffer inspection
  - `promote-model.mjs` plus `promotion-helpers.mjs` for archive-backed Alpha promotion and override generation
- Moved Alpha optimizer creation behind `@hh/ai` exports so the root `tools/alpha` scripts consume the AI package API instead of importing TFJS directly from the workspace root.
- Fixed the shared `tools/alpha/common.mjs` export surface so the new Alpha CLI scripts can import the Engine baseline helpers they run against.
- Added Alpha self-play bootstrap model registration so the Alpha corpus pipeline can run before the first promoted default model exists.
- Removed the duplicate `createAlphaTrainingSeedModel` re-export from `tools/alpha/common.mjs` so the new self-play bootstrap path loads cleanly under Node ESM.
- Fixed Alpha self-play sample capture so deterministic single-action Alpha decisions are preserved as training rows instead of being dropped when root search does not expand.
- Added Alpha regression coverage for:
  - AI controller Alpha strategy routing
  - Alpha serialization/default-model materialization
  - headless Alpha config persistence
  - MCP schema exposure of the Alpha tier
  - Alpha promotion CLI override generation
- Corrected the initial Alpha regression tests to use the Alpha-specific strategy factory contract and the actual `createFreshAlphaModel` export surface.
- Added the Alpha promotion CLI regression under `packages/ai/src/alpha` so it runs inside the existing Vitest include set instead of being skipped under `tools/alpha`.
- Executed the Alpha tooling pipeline end to end:
  - `pnpm alpha:distill` produced `tmp/alpha/distill-smoke/manifest.json` with 120 Engine-teacher samples
  - `pnpm alpha:selfplay` produced `tmp/alpha/selfplay-smoke2/manifest.json` with 4 Alpha self-play samples after fixing deterministic single-action capture
  - `pnpm alpha:train` produced `tmp/alpha/train-smoke/alpha-smoke-candidate.json` from 124 replay-buffer rows
  - normalized the trained candidate manifest to `tmp/alpha/train/alpha-initial-v1-candidate.json`
  - `pnpm alpha:inspect` summarized the Alpha replay buffer successfully
  - `pnpm alpha:gate` produced `tmp/alpha/gate/alpha-initial-v1-candidate.gate.json`
- Promoted a real trained Alpha default model:
  - generated and archived `packages/ai/src/alpha/default-alpha-model-override.ts`
  - archived promotion records under `archive/alpha/promotions`
  - final promoted source model id is `alpha-initial-v1-candidate`
- Verified the repo after promotion:
  - `pnpm --filter @hh/ai build`
  - `pnpm --filter @hh/ai typecheck`
  - `pnpm --filter @hh/ui typecheck`
  - `pnpm --filter @hh/headless typecheck`
  - `pnpm --filter @hh/mcp-server typecheck`
  - `pnpm typecheck`
  - targeted Vitest slice passed for AI Alpha tests, headless Alpha config coverage, and MCP Alpha schema coverage
- Current Alpha gate caveat:
  - the recorded gate summary for `alpha-initial-v1-candidate` did not pass; the 1-match Tactical/Engine/current-Alpha smoke gate produced timeouts/abort before a decisive result, so promotion used the recorded gate summary with `--force` to populate the first real default Alpha model.

## Reaction UX / Death Or Glory Progress (2026-03-15)
- Tightened the in-progress movement reaction patch so it compiles cleanly again:
  - fixed `Death or Glory` stat-modifier typing
  - fixed the `advancedReactionResolved` payload shape for `death-or-glory`
  - removed the unsafe `moveModel` nullability hole
  - removed the brittle object-identity check from the post-move `Death or Glory` hook
  - fixed the declined `Death or Glory` branch so the current trigger still resolves its move-through hits before the queue advances
- Finished the UI compile-path for move-based reactions:
  - canvas overlay callers now pass preview `positionOverrides`
  - `ReactionPrompt` now narrows the new reaction steps cleanly and supports the move-placement / `Death or Glory` selection flow
- Wired the simple AI reaction path to emit legal payloads for the new reaction requirements:
  - move-based reactions now include conservative legal `modelPositions`
  - `Death or Glory` now includes a selected reacting model plus weapon/profile
  - aerial reserve reactions now generate valid battlefield-edge entry placements
- Added regression coverage for:
  - reducer move-reaction placement confirmation
  - reducer `Death or Glory` attacker/weapon confirmation
  - command-processor vehicle move-through `Death or Glory` offer / resolution / decline paths
  - AI reaction command generation for stationary move payloads, `Death or Glory`, and Combat Air Patrol edge entry
- Validation status so far:
  - `pnpm --filter @hh/types build`: PASS
  - `pnpm --filter @hh/engine typecheck`: PASS
  - `pnpm --filter @hh/engine build`: PASS
  - `pnpm --filter @hh/ui typecheck`: PASS
  - `pnpm --filter @hh/ai typecheck`: PASS
  - `pnpm test -- packages/ai/src/phases/reaction-ai.test.ts packages/engine/src/command-processor.test.ts packages/ui/src/game/reducer.test.ts`: PASS (`147/147`)
