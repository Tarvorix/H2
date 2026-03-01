# HHv2 Implementation Plan

Date: February 28, 2026  
Workspace: `/Users/kylebullock/HHv2`  
Reference implementation: `/Users/kylebullock/HH`

## 1) Objective

Build a playable digital Horus Heresy: Age of Darkness core game slice with:

- exactly 3 legions in MVP:
  - World Eaters
  - Alpha Legion
  - Dark Angels
- only units defined in `HH_v2_units.md`
- no units outside `HH_v2_units.md` available anywhere in app/API
- full army builder using relevant detachment rules/layouts from the reference codebase (`/Users/kylebullock/HH`)
- full mission and objective flow (not skirmish-only)
- player vs heuristic AI in MVP
- all primarch and super-heavy units present in `HH_v2_units.md` included in MVP
- headless gameplay support from day one
- browser delivery with responsive support for desktop and phone (tablet-friendly)
- rendering architecture that starts with simple placeholders and upgrades cleanly to pre-rendered sprites + terrain assets later

## 2) Scope Lock (Non-Negotiable Rules)

1. **Unit content source of truth** is `HH_v2_units.md`.
2. **Legion scope** is only the three legions above for MVP.
3. **No out-of-scope unit imports** from the existing `/Users/kylebullock/HH` dataset.
4. **Army builder scope** is full builder for the MVP unit pool, including relevant detachments from the reference implementation.
5. **Mission scope** is full missions/objectives and full game loop.
6. **MVP game mode** is human player vs heuristic AI opponent.
7. **Multiplayer** is explicitly out of MVP and tracked as future expansion.
8. **Rules baseline** comes from existing engine behavior + rule markdown docs when needed (`reference.md`, `HH_Core.md`, `HH_Rules_Battle.md`, `HH_Armoury.md`, etc.).
9. **Headless parity**: every gameplay action must be executable without UI rendering.

## 3) Tech Decision

### 3.1 Recommended stack (for speed + expandability)

- **Language:** TypeScript (Node 20+)
- **Monorepo:** pnpm workspace
- **Engine model:** pure deterministic domain logic (no renderer dependencies)
- **Client UI:** React + PixiJS (2D WebGL renderer)
- **Headless runtime:** Node CLI + optional lightweight HTTP service
- **State + replay:** command/event log + seedable RNG

### 3.2 Why TypeScript again

- Maximum reuse from `/Users/kylebullock/HH` package graph (`types`, `data`, `geometry`, `engine`, `army-builder`).
- Fastest path to playable MVP with lower migration risk than switching to Rust/C#/Godot/Unity.
- Straight path to browser desktop/mobile now, with optional desktop wrappers later (Tauri/Electron).
- Existing TS rules/tests can be ported with minimal semantic drift.

## 4) Target Architecture

### 4.1 Package layout

```
packages/
  types/              # contracts, enums, command/result types
  geometry/           # LOS, coherency, distance, movement envelope
  engine/             # rules execution, phase machine, validations
  data/               # unit/rules/weapon data loading + registries
  army-builder/       # force org + points + legality checks
  ai/                 # heuristic AI policies and evaluation
  headless/           # CLI + optional HTTP game session host
  ui-web/             # React + PixiJS presentation + touch/desktop input
tools/
  content-build/      # parse HH_v2_units.md -> per-unit JSON + index
  content-validate/   # hard guardrails for unit whitelist and schema
content/
  units/
  weapons/
  rules/
  legion/
  indexes/
```

### 4.2 Dependency direction

- `types` <- `geometry`, `data`, `engine`, `army-builder`, `headless`, `ui-web`
- `data` <- `engine`, `army-builder`, `headless`, `ui-web`
- `geometry` <- `engine`
- `engine` <- `headless`, `ui-web`
- `ui-web` never mutates game state directly; it dispatches commands to `engine`

### 4.3 Headless-first contract

Define a single engine session interface used by both UI and headless runtimes:

- `createGameSession(config, seed)`
- `getState(sessionId)`
- `getValidCommands(sessionId, playerId)`
- `applyCommand(sessionId, command)`
- `undo/redo` (optional in MVP)
- `exportReplay(sessionId)`
- `importReplay(replay)`

UI and bots both call this same contract.

## 5) Content/Data Plan (Per-Unit JSON)

### 5.1 Unit file structure

Each unit gets its own JSON file.

Suggested path pattern:

- `content/units/common/<unit-id>.json`
- `content/units/world-eaters/<unit-id>.json`
- `content/units/alpha-legion/<unit-id>.json`
- `content/units/dark-angels/<unit-id>.json`

### 5.2 Required indexes

- `content/indexes/unit-index.json`  
  map: `unitId -> path, role, legionTags`
- `content/indexes/legion-index.json`  
  map: `legion -> allowedUnitIds, allowedRules, allowedWargearLists`
- `content/indexes/mvp-whitelist.json`  
  all unit IDs permitted in MVP (generated from `HH_v2_units.md`)

### 5.3 Hard whitelist enforcement

Fail build/test/runtime if:

- any unit exists outside whitelist
- a roster references unknown unit
- a legion roster includes another legion’s restricted unit

Implementation guardrails:

- compile-time content validation script
- unit tests for index/whitelist consistency
- runtime assertion in data registry startup

### 5.4 Data pipeline

1. Parse `HH_v2_units.md` headings and sheets.
2. Normalize IDs + deduplicate aliases.
3. Emit one JSON per unit.
4. Emit indexes + whitelist.
5. Validate schema + cross-reference weapons/rules.
6. Snapshot test generated output.

Use parser/converter patterns from `/Users/kylebullock/HH/packages/data/src/unit-parser.ts` and `profile-converter.ts`, but output split files instead of a single monolithic generated TS payload.

## 6) Rendering Strategy (Now vs Later)

### 6.1 MVP rendering (no final sprites yet)

- PixiJS scene with:
  - base circles/rectangles for units
  - facing arcs, coherency links, threat/LOS overlays
  - basic terrain primitives
- zero dependency on final art assets

### 6.2 Upgrade path to pre-rendered assets

- Add `AssetManifest` abstraction:
  - sprite atlas references
  - terrain sprite/tiles references
  - scale, anchor, z-layer metadata
- Renderer consumes manifest; engine remains unchanged.
- Swap placeholder tokens -> sprites by data/config only where possible.

### 6.3 Input/platform support

- Desktop: mouse + keyboard shortcuts.
- Phone/tablet: touch gestures (tap select, drag pan, pinch zoom, long-press context).
- Keep minimum 44px touch targets and low-overdraw rendering.

## 7) Implementation Phases

### Phase 0 - Bootstrap and copy baseline

- Initialize workspace and package skeleton in `HHv2`.
- Port foundational packages from `/Users/kylebullock/HH`:
  - `types`, `geometry`, `engine` core, `army-builder` core, `ai` baseline
- Port/adapt detachment layout data and validators required for full builder.
- Strip non-MVP features that block fast progress, but preserve interfaces.

Exit criteria:

- Packages build and tests run in HHv2 workspace.
- Engine can start a minimal match headlessly.

### Phase 1 - Content pipeline + whitelist enforcement

- Build `tools/content-build` and `tools/content-validate`.
- Generate per-unit JSON files from `HH_v2_units.md`.
- Build legion and whitelist indexes.
- Add CI checks for out-of-scope units.

Exit criteria:

- `pnpm content:build` emits split JSON.
- `pnpm content:validate` fails on any scope violations.

### Phase 2 - Rule/core parity slice

- Port command processor and phase flow required for core match loop.
- Port needed weapons/special rules used by selected units, including primarch and super-heavy interactions.
- Port mission setup, objective tracking, and victory scoring for full mission flow.
- Keep deterministic dice provider support.

Exit criteria:

- headless integration test can run full mission setup through end-state scoring.
- command validation prevents illegal phase/subphase actions.

### Phase 3 - Army builder (MVP constrained)

- Implement constrained force construction:
  - only 3 legions
  - only whitelist units
  - full points + force org validation
  - relevant detachments wired and validated
- Export/import roster JSON.

Exit criteria:

- invalid unit selection impossible in UI and rejected in headless API.
- primarch and super-heavy selections are available and validated where legal.

### Phase 4 - UI-web with placeholder rendering

- Build React + Pixi board client.
- Connect to engine session interface.
- Implement full mission setup + play loop screens.
- Implement touch-friendly controls for phone and tablet browsers.
- Implement player vs heuristic AI match flow.

Exit criteria:

- player vs heuristic AI is playable end-to-end on desktop and phone browsers.

### Phase 5 - Replay, telemetry, regression safety

- Add command/event replay persistence.
- Add scenario regression tests (golden turn snapshots).
- Add AI behavior regression scenarios for stable turn quality.
- Add compatibility tests for future content additions.

Exit criteria:

- deterministic replay reproduces same game state hash.

### Phase 6 - Sprite/terrain readiness pass

- Introduce `AssetManifest` and loader interfaces.
- Confirm placeholder and sprite modes can be toggled without engine changes.

Exit criteria:

- renderer swap demo with no gameplay code modifications.

## 8) Testing Strategy

- **Unit tests:** data parsing, validation, command preconditions, rule effects.
- **Property tests (targeted):** dice + combat bounds, state invariants.
- **Integration tests:** full phase progression and reaction windows.
- **Golden tests:** serialized game-state snapshots per command sequence.
- **Headless vs UI parity tests:** same command stream => same final state hash.

## 9) Expandability Design Rules

1. New faction/legion content must be data-only by default.
2. New mechanics use registered rule hooks, not hardcoded legion conditionals.
3. Engine never imports UI modules.
4. Renderer never owns authoritative rules state.
5. Every new rule/mechanic requires replay-safe serialization.

## 10) Initial Deliverables

- `plan.md` (this file)
- architecture decision record (`docs/adr/0001-engine-and-renderer.md`)
- content schema (`docs/content-schema.md`)
- MVP whitelist (`content/indexes/mvp-whitelist.json`)
- bootstrapped package workspace

## 11) Risks and Mitigations

- **Risk:** rule drift from reference implementation.  
  **Mitigation:** replay parity tests against curated scenarios.

- **Risk:** content leakage from full HH dataset.  
  **Mitigation:** build-time whitelist + runtime guard + CI gate.

- **Risk:** mobile performance regressions.  
  **Mitigation:** sprite batching, low-overdraw overlays, perf budget tests on phone and tablet browsers.

- **Risk:** renderer lock-in.  
  **Mitigation:** strict renderer adapter boundary and asset manifest abstraction.

## 12) Confirmed Decisions

1. MVP includes a full army builder for the `HH_v2_units.md` pool with relevant detachments.
2. MVP includes full mission/objective flow.
3. MVP play mode is player vs heuristic AI (no multiplayer in MVP).
4. MVP includes primarch and super-heavy units from `HH_v2_units.md`.
5. MVP delivery target is browser-based with desktop + phone support.

## 13) Future Expansion

1. Multiplayer modes (async and/or live sessions) built on top of the headless session API.
2. Dedicated desktop wrapper (Tauri/Electron) after browser release stability.
3. Additional factions/legions beyond the initial three, following the same per-unit JSON pipeline and whitelist gates.
