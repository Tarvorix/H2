# HHv2 TODO

Last Updated: 2026-02-28

## Active Goal
Execute `plan.md` phase-by-phase with continuously enforced MVP scope (3 legions, units from `HH_v2_units.md` only) while keeping build/test green.

## Hotfix Plan (Deployment/Render Regression - 2026-02-28)
- [x] Verify and fix deployment-to-playing model persistence so deployed units are visible on game start.
- [x] Fix terrain label scaling so terrain names do not render at giant sizes.
- [x] Run targeted verification and record results.

## Hotfix Verification (Deployment/Render Regression - 2026-02-28)
- `pnpm --filter @hh/ui typecheck`: PASS
- `pnpm typecheck`: PASS
- `pnpm test -- packages/ui/src/canvas/assets.test.ts`: PASS (1 file, 4 tests)

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
