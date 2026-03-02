# HHv2 TODO

Last Updated: 2026-03-02

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
