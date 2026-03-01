# HH Digital Porting Reference

Purpose: quick map of where the core game systems live, and what you need to copy to build a smaller sister project that uses the same rules (fewer units, 2-3 legions) without touching the main codebase.

Workspace root: `/Users/kylebullock/HH`

## 1) Package Architecture

Current workspace package graph:

`@hh/types` -> shared contracts (base dependency)

`@hh/data` -> depends on `@hh/types`

`@hh/geometry` -> depends on `@hh/types`

`@hh/engine` -> depends on `@hh/types`, `@hh/data`, `@hh/geometry`

`@hh/army-builder` -> depends on `@hh/types`, `@hh/data`

`@hh/ai` -> depends on `@hh/types`, `@hh/data`, `@hh/geometry`, `@hh/engine`

`@hh/ui` -> depends on all of the above

Key config files:

- `tsconfig.json` (project refs for all packages)
- `packages/*/tsconfig.json` (package-level references)
- `package.json` (workspace scripts; `dev` runs `@hh/ui`)

## 2) Runtime Entry Flow (UI -> Engine)

Main app entry:

- `packages/ui/src/main.tsx`
- `packages/ui/src/App.tsx`

Game mode root:

- `packages/ui/src/game/GameSession.tsx`
- `packages/ui/src/game/GameSetup.tsx`
- `packages/ui/src/game/reducer.ts`
- `packages/ui/src/game/types.ts`

Reducer-to-engine bridge:

- `packages/ui/src/game/command-bridge.ts`
- `packages/ui/src/game/reducer.ts` (`applyEngineCommand` + `DISPATCH_ENGINE_COMMAND`)

Engine command entry:

- `packages/engine/src/command-processor.ts` (`processCommand`, `getValidCommands`)

## 3) Subsystem Map

## 3.1 Shared Types and Rules Contracts

- `packages/types/src/index.ts` (barrel export)
- `packages/types/src/game-state.ts` (GameState, GameCommand, phase/subphase command types)
- `packages/types/src/enums.ts` (Phase, SubPhase, statuses, factions, reactions)
- `packages/types/src/army-building.ts`
- `packages/types/src/mission-types.ts`
- `packages/types/src/legion-rules.ts`

If you port only one package first, port `@hh/types` first.

## 3.2 Data Layer (profiles, weapons, missions, legion content)

Primary registry and content access:

- `packages/data/src/index.ts`
- `packages/data/src/profile-registry.ts` (runtime profile lookup used by UI and engine)
- `packages/data/src/generated/unit-profiles.ts` (large generated profile payload)
- `packages/data/src/weapons.ts`
- `packages/data/src/special-rules.ts`
- `packages/data/src/missions.ts`
- `packages/data/src/legion-tacticas.ts`
- `packages/data/src/legion-advanced-reactions.ts`
- `packages/data/src/legion-gambits.ts`
- `packages/data/src/rites-of-war.ts`
- `packages/data/src/detachment-layouts.ts`

Profile generation pipeline (useful for your smaller dataset build):

- `packages/data/src/unit-parser.ts`
- `packages/data/src/profile-converter.ts`
- `packages/data/src/units.ts`

## 3.3 Army Builder

Headless builder logic package:

- `packages/army-builder/src/index.ts`
- `packages/army-builder/src/validation.ts`
- `packages/army-builder/src/points.ts`
- `packages/army-builder/src/detachments.ts`
- `packages/army-builder/src/rite-enforcement.ts`
- `packages/army-builder/src/serialization.ts`

Army builder UI:

- `packages/ui/src/game/screens/ArmyBuilderScreen.tsx`
- `packages/ui/src/game/screens/army-builder/FactionSelector.tsx`
- `packages/ui/src/game/screens/army-builder/DetachmentPanel.tsx`
- `packages/ui/src/game/screens/army-builder/UnitBrowser.tsx`
- `packages/ui/src/game/screens/army-builder/UnitConfigPanel.tsx`
- `packages/ui/src/game/screens/army-builder/ArmySummaryPanel.tsx`

Legacy preset army flow:

- `packages/ui/src/game/screens/ArmyLoadScreen.tsx`

## 3.4 Game Setup Pipeline (missions/terrain/objectives/deployment)

Setup screens:

- `packages/ui/src/game/screens/MissionSelectScreen.tsx`
- `packages/ui/src/game/screens/TerrainSetupScreen.tsx`
- `packages/ui/src/game/screens/ObjectivePlacementScreen.tsx`
- `packages/ui/src/game/screens/DeploymentScreen.tsx`

State transitions and setup actions:

- `packages/ui/src/game/reducer.ts` (`CONFIRM_MISSION`, `CONFIRM_TERRAIN`, `CONFIRM_ALL_OBJECTIVES`, `CONFIRM_DEPLOYMENT`)
- `packages/ui/src/game/types.ts` (`GameUIAction`, `MissionSelectUIState`, `ObjectivePlacementUIState`, `DeploymentState`)

## 3.5 Core Engine / Rules / Mechanics

Main engine exports:

- `packages/engine/src/index.ts`

Command routing and phase validation:

- `packages/engine/src/command-processor.ts`

State transitions and helpers:

- `packages/engine/src/state-machine.ts`
- `packages/engine/src/state-helpers.ts`
- `packages/engine/src/game-queries.ts`
- `packages/engine/src/types.ts`
- `packages/engine/src/dice.ts`
- `packages/engine/src/tables.ts`
- `packages/engine/src/profile-lookup.ts`

Phase modules:

- `packages/engine/src/phases/start-phase.ts`
- `packages/engine/src/phases/shooting-phase.ts`
- `packages/engine/src/phases/assault-phase.ts`
- `packages/engine/src/phases/end-phase.ts`

Mechanics modules:

- `packages/engine/src/movement/*`
- `packages/engine/src/shooting/*`
- `packages/engine/src/assault/*`
- `packages/engine/src/special-rules/*`

Legion systems:

- `packages/engine/src/legion/index.ts`
- `packages/engine/src/legion/tacticas/*`
- `packages/engine/src/legion/advanced-reactions/*`
- `packages/engine/src/legion/legion-gambits/*`
- `packages/engine/src/legion/rite-of-war-registry.ts`
- `packages/engine/src/legion/allegiance.ts`

Missions and victory:

- `packages/engine/src/missions/index.ts`
- `packages/engine/src/missions/mission-state.ts`
- `packages/engine/src/missions/objective-queries.ts`
- `packages/engine/src/missions/secondary-objectives.ts`
- `packages/engine/src/missions/victory-handler.ts`

## 3.6 Geometry and Spatial Rules

- `packages/geometry/src/index.ts`
- `packages/geometry/src/distance.ts`
- `packages/geometry/src/line-of-sight.ts`
- `packages/geometry/src/coherency.ts`
- `packages/geometry/src/movement-envelope.ts`
- `packages/geometry/src/terrain.ts`
- `packages/geometry/src/blast-template.ts`
- `packages/geometry/src/vehicle-facing.ts`
- `packages/geometry/src/shapes.ts`
- `packages/geometry/src/intersection.ts`
- `packages/geometry/src/vec2.ts`

## 3.7 Rendering / Canvas / Game UI Overlays

Canvas stack:

- `packages/ui/src/canvas/BattlefieldCanvas.tsx`
- `packages/ui/src/canvas/renderer.ts`
- `packages/ui/src/canvas/modelRenderer.ts`
- `packages/ui/src/canvas/gridRenderer.ts`
- `packages/ui/src/canvas/terrainRenderer.ts`
- `packages/ui/src/canvas/selectionRenderer.ts`

Game adapter layer on top of canvas:

- `packages/ui/src/game/canvas/GameBattlefieldCanvas.tsx`
- `packages/ui/src/game/canvas/gameCanvasAdapter.ts`
- `packages/ui/src/game/canvas/gameModelRenderer.ts`

Overlays:

- `packages/ui/src/overlays/*`

In-game interaction panels and flows:

- `packages/ui/src/game/panels/*`
- `packages/ui/src/game/flows/*`

## 3.8 AI (optional for the smaller sandbox)

AI package:

- `packages/ai/src/index.ts`
- `packages/ai/src/ai-controller.ts`
- `packages/ai/src/phases/*`
- `packages/ai/src/deployment/deployment-ai.ts`
- `packages/ai/src/evaluation/*`
- `packages/ai/src/helpers/*`

UI AI hooks:

- `packages/ui/src/game/hooks/useAITurn.ts`
- `packages/ui/src/game/hooks/useAIDeployment.ts`

## 4) Minimum Needed for a Smaller Sister Project

For a full playable rules sandbox (same ruleset, fewer units/legions):

1. Keep packages: `types`, `geometry`, `engine`, `data`, `ui`.
2. Keep `army-builder` if you want in-app list building; otherwise replace with fixed test rosters.
3. Keep `ai` only if you need AI opponent behavior.
4. Build a reduced data set in `@hh/data`:
- Keep only selected legions (2-3) in legion data files.
- Keep only units you want in `generated/unit-profiles.ts`.
- Keep every weapon/special rule referenced by kept units.
- Keep mission/deployment definitions you plan to test.
5. Preserve the UI->engine command bridge contract:
- `command-bridge.ts`
- reducer actions in `types.ts`
- `applyEngineCommand` path in reducer
6. Preserve canvas adapter bridge if reusing current render pipeline:
- `GameBattlefieldCanvas.tsx`
- `gameCanvasAdapter.ts`
- `renderer.ts`

## 5) Critical Findings to Address for "Fully Running" Port

These are important current wiring issues in the main code that you should explicitly fix in the smaller project.

1. `gameState` bootstrap is incomplete in reducer flow.
- `createInitialGameUIState()` starts with `gameState: null`.
- `applyEngineCommand()` early-returns when `gameState` is null.
- `GameUIAction` has no `SET_GAME_STATE`/`INIT_GAME_STATE` action.

2. `DeploymentScreen` creates a local game state but does not persist it to reducer state.
- `createInitialGameState()` exists in `DeploymentScreen.tsx`.
- It is used via local `useMemo` and not stored into `state.gameState`.

3. Deployment confirmation tries an engine command before game state is guaranteed.
- `handleConfirmDeployment` dispatches `DISPATCH_ENGINE_COMMAND` with `{ type: 'endPhase' }` when `!state.gameState`.
- But reducer passthrough still depends on `state.gameState` existing.

4. Phase mismatch for deployment command.
- Engine `deployUnit` is valid only in `Movement/Reserves` (`command-processor.ts`).
- Deployment initializer sets phase to `Start/StartEffects`.
- This can reject deploy commands if/when they are sent to engine.

5. Mission state initialization is not wired at runtime.
- `createInitialGameState()` sets `missionState: null`.
- `initializeMissionState()` exists in engine mission helpers but is currently used only in tests.

6. Start/End phase handlers are defined but not routed by command processor.
- `handleStartPhase`, `handleEndEffects`, `handleStatusCleanup`, `handleVictoryCheck` exist.
- `processEndSubPhase`/`processEndPhase` currently advance phase state without invoking those handlers.

## 6) Recommended Porting Order

1. Copy package skeleton with same boundaries (`types`, `data`, `geometry`, `engine`, `ui`).
2. Shrink data first (units/legions/missions) while keeping IDs stable.
3. Implement explicit game bootstrap action in UI reducer (`INIT_GAME_STATE`).
4. Build initial `GameState` once after setup, including mission state initialization.
5. Align deployment flow with engine phase rules (`Movement/Reserves` for `deployUnit`) or introduce separate setup deployment command path.
6. Wire phase handlers (start/end/victory) into command progression if you want full rules parity.
7. Add smoke tests:
- New game setup -> deployment -> first movement command accepted.
- Shooting -> casualties -> morale -> phase advance.
- End phase victory scoring with mission state present.

## 7) Fast Navigation List (most opened files)

- `packages/ui/src/game/reducer.ts`
- `packages/ui/src/game/types.ts`
- `packages/ui/src/game/command-bridge.ts`
- `packages/ui/src/game/screens/DeploymentScreen.tsx`
- `packages/engine/src/command-processor.ts`
- `packages/engine/src/state-machine.ts`
- `packages/engine/src/missions/mission-state.ts`
- `packages/engine/src/missions/victory-handler.ts`
- `packages/data/src/profile-registry.ts`
- `packages/data/src/generated/unit-profiles.ts`
- `packages/army-builder/src/validation.ts`
- `packages/geometry/src/line-of-sight.ts`

