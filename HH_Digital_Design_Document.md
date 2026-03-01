# Horus Heresy: Age of Darkness — Digital Port
## Project Design Document

**Project Codename:** HH-Digital
**Analog:** MegaMek (for BattleTech) — but with free movement instead of hex grid
**Version:** 0.1 (Architecture & Planning)
**Date:** 2026-02-23

---

## 1. Vision

A faithful digital implementation of Warhammer: The Horus Heresy — Age of Darkness (3rd Edition), enabling two players to resolve full battles using the complete official ruleset. The tabletop experience is preserved: free-form movement in inches on a continuous 2D plane, true line-of-sight, and all special rules interactions. No simplifications, no hex conversion, no variant rules.

---

## 2. Project Knowledge Base

All rules and data compiled from official sources. These are the authoritative reference documents for every implementation decision.

| File | Contents | Role in Engine |
|---|---|---|
| `HH_Core.md` | Terminology, game concepts, model/unit/army definitions | Type system foundations |
| `HH_Principles.md` | LOS, measurement, dice, hits/wounds/saves, vehicle damage, reactions, psychic, statuses, terrain, coherency, BS Hit Table | Core rules engine logic |
| `HH_Tables.md` | Melee Hit Table (WS vs WS), Wound Table (S vs T), Ranged Hit Table (BS) | Lookup tables for combat resolution |
| `HH_Rules_Battle.md` | Full turn sequence — every phase and sub-phase procedurally, including Challenge/Focus/Gambit system | Turn state machine, phase controllers |
| `HH_Battle_AOD.md` | Army selection, Force Org Charts, detachments, missions, deployment, objectives, victory conditions, modes of play | Army builder, mission system |
| `HH_Armoury.md` | All core Special Rules + Psychic Disciplines (Biomancy, Pyromancy, Telepathy, Telekinesis) | Special rules dictionary / behavior hooks |
| `HH_Legiones_Astartes.md` | 18 Legion Tacticas, Rites of War, Advanced Reactions, legion-specific wargear, complete weapon profile tables | Faction module, weapon database |
| `legiones_astartes_clean.md` | 303 unit datasheets — stat lines, wargear, options, points, types, composition | Unit data files (parse target) |

---

## 3. Architectural Decisions (Settled)

These decisions were made during project planning and are locked.

### 3.1 Free Movement on Continuous 2D Plane
No hex grid. No square grid. Models exist at x/y coordinates on a continuous plane. Distances measured in inches (floating-point). This is non-negotiable — hexes would create a variant game, not a port.

**Implication:** The geometry engine is the foundation layer. Everything — movement, LOS, range, coherency, template placement — depends on it.

### 3.2 TypeScript Monorepo
The entire project is TypeScript. Rationale:
- Shared type definitions across rules engine, data layer, and UI — a `UnitProfile` or `WeaponProfile` is defined once
- JSON data files are native
- Strong typing catches rules bugs (passing a weapon stat where a model stat belongs)
- Claude Code generates exceptionally consistent TypeScript due to type guardrails
- Web UI is JS/TS anyway — one language, one toolchain

**Package structure:**
- `packages/types` — shared type definitions (unit profiles, weapons, special rules, game state)
- `packages/engine` — pure logic rules engine (no UI dependencies)
- `packages/geometry` — measurement, LOS, templates, collision
- `packages/data` — JSON unit/weapon/wargear files + validators
- `packages/ui` — React web application
- `packages/army-builder` — force org validation, points calculation

### 3.3 Client-Server From Day One
Even for local hotseat play, the engine operates as a server processing commands and emitting state. The UI is a client that sends actions and renders state. This means:
- Network multiplayer is a later addition, not a rewrite
- Game state is authoritative and centralized
- UI can be swapped without touching game logic
- Replay / undo is state diff, not UI rollback

### 3.4 Web-First, PWA-Ready
React web application. Runs in any browser, any device. PWA wrapper for offline install.
- **Desktop:** Full battlefield view, sidebars, drag-and-drop
- **Tablet:** Near-full experience
- **Mobile:** Army builder / companion / async play (full battlefield impractical on 6")

### 3.5 Test-Driven from Day One
Every rules implementation ships with tests that encode specific tabletop scenarios:
> "A Bolter (S4 AP5 D1) firing at a Marine (T4 Sv3+) at 12" — BS4 hits on 3+, wounds on 4+, save on 3+ unmodified"

Tests lock in correctness so that adding new special rules or refactoring doesn't break existing resolution. This is how MegaMek stayed reliable over decades.

### 3.6 Development Roles
- **User** — architect, domain expert, rules authority, reviewer
- **Claude Code** — implementer, writes modules/tests/components
- **Claude (chat)** — design partner, breaks rules into implementable chunks, catches edge cases

---

## 4. Core Systems Architecture

### 4.1 Geometry Engine
**Source docs:** `HH_Principles.md` (LOS, measurement, terrain), `HH_Rules_Battle.md` (movement rules)

The geometry engine is pure math with no game-rule awareness. It answers spatial questions.

**Model representation:**
- Infantry/cavalry: circles (base diameter from datasheet, e.g. 32mm, 40mm, 60mm)
- Vehicles: rectangles (hull footprint) with defined facing arcs (front/side/rear)
- All positions are x/y float coordinates in inches

**Core operations:**
- `distance(modelA, modelB)` — closest base-edge to base-edge, not center-to-center (`HH_Principles.md`: "the distance between the two Models is measured between the two closest points on the two Models' Bases")
- `hasLOS(modelA, modelB, terrain[], vehicles[])` — ray-cast from base edge to base edge. Multiple rays (tangent lines between circles). LOS exists if ANY ray is unobstructed
- `coherencyCheck(unit)` — every model within 2" of at least one other model in the unit
- `movementRange(model, terrain[])` — legal movement envelope accounting for difficult/dangerous terrain, 1" enemy exclusion zone
- `blastOverlap(center, radius, models[])` — circle-circle intersection for blast weapons
- `templateOverlap(origin, templateShape, models[])` — polygon-circle intersection for template weapons
- `vehicleFacing(vehicle, attackOrigin)` — angle calculation to determine front/side/rear arc hit

**LOS simplifications from rules** (`HH_Principles.md`):
- Non-vehicle models do NOT block LOS (eliminates the hardest case)
- Vehicles DO block LOS
- Light Area Terrain: never blocks
- Medium Area Terrain: blocks only if ray passes through >3" of it (chord length calculation)
- Heavy Area Terrain: always blocks
- Terrain Pieces (solid objects): always block
- Models in base contact always have LOS to each other

**Terrain representation:**
- Polygons on the 2D plane with a type enum (Light/Medium/Heavy Area, Terrain Piece, Dangerous, Difficult, Impassable)
- Prototype: procedural geometric shapes (rectangles, circles)
- Future: terrain editor for custom placement

### 4.2 Data Layer
**Source docs:** `legiones_astartes_clean.md` (303 datasheets), `HH_Legiones_Astartes.md` (weapon tables, legion rules), `HH_Armoury.md` (special rules)

**Unit Profile schema** (JSON) encodes per datasheet:
- Stat line: M, WS, BS, S, T, W, I, A, LD, CL, WP, IN, SAV, INV
- Vehicle stat line: M, BS, Front Armour, Side Armour, Rear Armour, HP, Transport Capacity
- Unit composition (model types, counts)
- Base points cost + per-model cost for additional models
- Base size (diameter in mm)
- Unit type and sub-types (Infantry, Vehicle, Walker, Cavalry, etc. with Sergeant, Command, Heavy, Skirmish, etc.)
- Default wargear (references to weapon database)
- Wargear options (exchange/add rules with point costs)
- Special rules (references to rules dictionary)
- Traits (Faction, Allegiance, plus any special traits like Smokescreen)
- Battlefield role (Troops, Elites, Heavy Assault, Armour, etc.)
- Access Points (for transports)

**Weapon Profile schema** (JSON):
- Ranged: R, FP, RS, AP, D, Special Rules, Traits
- Melee: IM, AM, SM, AP, D, Special Rules, Traits
- Multi-profile weapons: array of profiles under one weapon entry
- Note: IM/AM/SM can be fixed numbers, `I`/`A`/`S` (use model's stat), or `+N`/`-N` (modifier)

**Special Rules dictionary:**
- Every special rule from `HH_Armoury.md` encoded as a behavior
- Each rule defines: name, parameter(s), description, and which resolution pipeline hook(s) it modifies
- Hook points: pre-hit, on-hit, pre-wound, on-wound, pre-save, on-save, pre-damage, on-damage, on-casualty

### 4.3 Rules Engine (Turn State Machine)
**Source docs:** `HH_Rules_Battle.md` (primary — the procedural turn breakdown), `HH_Principles.md` (supporting — how each mechanic works)

The engine is a state machine. Each phase/sub-phase is a discrete state with defined transitions.

```
Battle
 └── BattleTurn (usually 4)
      └── PlayerTurn (2 per BattleTurn — Active + Reactive)
           ├── StartPhase
           │    └── EffectsSubPhase
           ├── MovementPhase
           │    ├── ReservesSubPhase
           │    ├── MoveSubPhase
           │    └── RoutSubPhase
           ├── ShootingPhase
           │    ├── AttackSubPhase (per-unit shooting attacks)
           │    └── MoraleSubPhase
           ├── AssaultPhase
           │    ├── ChargeSubPhase
           │    ├── ChallengeSubPhase
           │    ├── FightSubPhase
           │    └── ResolutionSubPhase
           └── EndPhase
                ├── EffectsSubPhase
                ├── StatusesSubPhase
                └── VictorySubPhase
```

**Shooting Attack Pipeline** (`HH_Rules_Battle.md` Steps 1-11):
1. Select Target Unit
2. Check Target (LOS, facing for vehicles)
3. Declare Weapons (one per model unless rules allow more)
4. Set Fire Groups (group by weapon name, split by profile/BS)
5. Select Fire Group
6. Make Hit Tests → `HH_Tables.md` Ranged Hit Table
7. Make Wound Tests → `HH_Tables.md` Wound Table (or Armour Penetration vs vehicles)
8. Select Target Model (defender chooses; wounded models first)
9. Saving Throws + Damage Mitigation (one save per wound, then mitigation if failed)
10. Select Next Fire Group (loop to 5)
11. Remove Casualties + Vehicle Damage Table rolls for glancing hits

**Assault Pipeline** (`HH_Rules_Battle.md`):
- Charge Procedure (5 steps: Declare → Check Range → Set-up Move → Volley Attacks → Charge Move)
- Challenge Procedure (5 steps: Declare → Face-Off/Gambits → Focus Roll → Strike → Glory)
- Fight Sub-Phase: Initiative Steps, Strike Groups, Hit → Wound → Save → Damage
- Resolution: Combat Resolution Points → Leadership Check → Aftermath (Hold/Disengage/Fall Back/Pursue/Gun Down/Consolidate)

**Melee Hit Tests** use `HH_Tables.md` Melee Hit Table (attacker WS vs defender WS).

### 4.4 Reaction System
**Source docs:** `HH_Principles.md` (Reaction Allotments, Core Reactions), `HH_Legiones_Astartes.md` (Advanced Reactions per legion)

First-class system, not a bolt-on. The Reactive Player can interrupt the Active Player's turn.

**Reaction Allotment:** Base 1 + bonus from points limit table (`HH_Principles.md`):
- ≤1,500 pts: +0
- 1,501–3,500 pts: +1
- 3,501–5,000 pts: +2
- >5,000 pts: +3
- Additional points from legion/army rules

**Core Reactions:**
- Movement Phase → Reposition (move up to Initiative value)
- Shooting Phase → Return Fire (shoot back before casualties removed)
- Assault Phase → Overwatch (full BS shooting instead of snap shot volley)

**Constraints:**
- No unit may react more than once per Player Turn
- Stunned, Routed, or Locked in Combat units cannot react
- Unspent points don't carry over

**Engine design:** At each reaction trigger point in the state machine, the engine pauses, checks if the Reactive Player has allotment remaining and eligible units, and offers the reaction choice before continuing.

### 4.5 Status System
**Source docs:** `HH_Principles.md` (Pinned, Suppressed, Stunned, Routed — effects and removal)

Four tactical statuses tracked per-unit:

| Status | Key Effect | Applied By | Removed By |
|---|---|---|---|
| Pinned | Cannot move, rush, or charge | Pinning (X) rule, specific rules | Cool Check in End Phase |
| Suppressed | All shooting becomes Snap Shots | Suppressive (X) rule, Vehicle Damage Table | Cool Check in End Phase |
| Stunned | Cannot declare Reactions | Stun (X) rule, Vehicle Damage Table | Cool Check in End Phase |
| Routed | Must Fall Back, cannot hold objectives | 25% casualties from single attack, losing combat | Leadership Check in End Phase |

**Universal status effects** (apply to ALL statuses):
- Charges count as Disordered
- Combat Initiative forced to 1
- Cannot hold/claim/contest objectives
- Cannot benefit from being Stationary

**Vehicles** cannot be Routed; use Repair Tests (target 6+, or Auto-repair value) instead of Cool Checks.

### 4.6 Psychic System
**Source docs:** `HH_Armoury.md` (Disciplines: Biomancy, Pyromancy, Telepathy, Telekinesis), `HH_Principles.md` (Manifestation, Perils of the Warp)

- Models must have Psyker Trait to use Psychic Weapons or manifest Powers
- Manifestation Check: Willpower Check (2d6 ≥ WP)
- Blessings target friendly units; Curses target enemy units (Resistance Check: target's Willpower)
- Perils of the Warp: triggered on doubles during Manifestation or Resistance Checks
- Each discipline grants: Psychic Weapon(s) + Psychic Power(s) + a Trait

### 4.7 Army Builder
**Source docs:** `HH_Battle_AOD.md` (Force Org Charts, detachment rules, Battlefield Roles), `HH_Legiones_Astartes.md` (legion-specific detachments, Rites of War restrictions)

Separate module from battle engine. Validates:
- Detachment structure (Primary mandatory; Allied, Auxiliary, Apex optional)
- Force Org Slot matching (each unit's Battlefield Role must match an available slot)
- Points limit compliance
- Rite of War restrictions (some restrict which units/detachments are available)
- Allegiance consistency (all units in a detachment share Faction Trait)
- Warlord/Lord of War cap (≤25% of points limit combined)
- No Warlord units below 3,000 points

**14 Battlefield Roles** defined in `HH_Battle_AOD.md`: Warlord, High Command, Command, Retinue, Elites, War-Engine, Troops, Support, Lord of War, Transport, Heavy Assault, Heavy Transport, Armour, Recon, Fast Attack.

---

## 5. Development Phases

### Design Principle: Visual Feedback Early

Free movement on a continuous plane cannot be debugged headless. When a LOS ray clips 2.8" of Medium Area Terrain and returns the wrong boolean, you need to *see* the ray, the terrain polygon, and the intersection points — not stare at coordinate dumps. The same applies to movement envelopes, coherency in irregular formations, charge paths, pile-in positioning, and blast/template placement. Eyes are the best debugger for spatial code.

Therefore: **a debug visualizer ships with Phase 2 and is available for all subsequent phases.** It is not the game UI — it is a developer tool. But it becomes the seed from which the game UI grows in Phase 6. This means the rendering pipeline is established early and iterated throughout development, not built from scratch after the engine is "done."

Phases follow the game's own turn sequence: Data → Geometry → Movement → Shooting → Assault → full UI → faction rules → army builder → polish.

---

### Phase 1 — Data Foundation
**Testable headless: ✅ Yes**

**Goal:** Machine-readable, validated data for all Legiones Astartes units, weapons, and special rules.

**Deliverables:**
1. TypeScript type definitions for UnitProfile, WeaponProfile, SpecialRule, Trait
2. JSON schema with validation
3. Weapon database — all ranged and melee weapon profiles from `HH_Legiones_Astartes.md` weapon tables
4. Special Rules dictionary — every rule from `HH_Armoury.md` encoded with name, parameters, description, and pipeline hook points
5. Unit data files — all 303 datasheets from `legiones_astartes_clean.md` parsed into validated JSON
6. Lookup tables — BS Hit Table, WS Hit Table, Wound Table from `HH_Tables.md` as code

**Source documents consumed:**
- `legiones_astartes_clean.md` → unit JSON files
- `HH_Legiones_Astartes.md` → weapon profiles, legion wargear
- `HH_Armoury.md` → special rules dictionary
- `HH_Tables.md` → combat lookup tables
- `HH_Principles.md` → stat definitions, characteristic rules

**Test examples:**
- Schema validation passes for every unit file
- Tactical Squad: 100 pts base, 10 additional at +10 each, correct wargear list
- Lascannon profile: R48, FP1, RS9, AP2, D1, Heavy(D), Armourbane, Las trait
- Wound Table lookup: S4 vs T4 → 4+, S8 vs T4 → 2+, S3 vs T7 → impossible

**Exit criteria:** All 303 LA units parseable, all weapons resolved, all special rules catalogued.

---

### Phase 2 — Geometry Engine + Debug Visualizer
**Testable headless: ⚠️ Unit tests yes, but visual verification required for confidence**

**Goal:** The spatial math layer that everything else depends on, paired with a lightweight visual tool to verify it works.

**Deliverables — Geometry (pure math, no game rules):**
1. Model representation (circles for infantry, rectangles for vehicles, positions as x/y floats in inches)
2. Distance calculation — base-edge to base-edge
3. Line-of-sight raycasting — tangent-line approach between circles, with terrain polygon intersection
4. Area terrain chord calculation (Medium blocks if ray travels >3" through it)
5. Vehicle facing determination (front/side/rear arc from attack angle)
6. Coherency checker (every model within 2" of at least one friendly model in unit)
7. Movement envelope calculator (respecting terrain costs, 1" enemy exclusion zone)
8. Blast marker overlap (circle-on-circle intersection)
9. Template weapon overlap (polygon-on-circle intersection)
10. Scatter mechanic (random angle + distance offset)
11. Terrain system — polygons with type classification

**Deliverables — Debug Visualizer (developer tool, not game UI):**
12. HTML Canvas renderer — draws the 2D plane with inch-scale grid
13. Model rendering — circles (infantry bases) and rectangles (vehicle hulls) with facing arrows
14. Terrain rendering — polygons with type coloring (Light=green/transparent, Medium=yellow, Heavy=red, Piece=black)
15. LOS ray overlay — click two models, see all cast rays drawn, with hit/miss coloring and terrain intersection points marked
16. Distance readout — hover between models, see base-edge distance
17. Coherency overlay — highlight in-coherency (green) and out-of-coherency (red) models
18. Movement envelope overlay — select a model, see legal movement area shaded (accounting for terrain and 1" exclusion zones)
19. Blast/template preview — place a marker, see which model bases overlap
20. Vehicle facing arc overlay — select vehicle, see front/side/rear arc boundaries drawn
21. Terrain editor — click to place/resize/remove procedural terrain shapes (rectangles, circles)
22. Scenario loader — spawn models at specified positions for testing (e.g. "place 10 Marines in line 1.5" apart, one Rhino at 24", a Medium terrain block between them")

The visualizer is a single-page dev tool. No game logic, no turn sequence, no combat resolution. Just "put stuff on a plane and inspect the geometry." Every subsequent phase uses it to verify spatial correctness.

**Source documents consumed:**
- `HH_Principles.md` → LOS rules, measurement rules, terrain definitions, base-edge distance rules
- `HH_Rules_Battle.md` → movement procedure, terrain interaction during movement

**Test examples (automated):**
- Two 32mm-base models 10.00" apart center-to-center → distance is 10.00 - 0.63 - 0.63 = 9.74" edge-to-edge
- Model behind Heavy Area Terrain → no LOS
- Model behind <3" of Medium Area Terrain → LOS exists (cover granted, not blocked)
- Vehicle facing: attack from 10° off center front → Front Armour
- Coherency: 10-man squad in line, each 1.9" apart → passes; one model 2.1" from nearest → fails

**Test examples (visual verification via debug tool):**
- Place 20 models in a realistic deployment, visually confirm LOS rays make sense
- Place terrain, move a model through it, confirm movement envelope respects difficult terrain
- Place a blast marker on a cluster of bases, confirm overlap detection matches what the eye sees
- View vehicle facing arcs from multiple angles, confirm arc boundaries look correct

**Exit criteria:** All spatial queries return correct results in automated tests AND visual spot-checks via the debug visualizer produce no surprises.

---

### Phase 3 — Movement Phase
**Testable headless: ⚠️ Logic yes, spatial results need visualizer**

**Goal:** Complete Movement Phase implementation — the first game phase that changes board state.

**Deliverables:**
1. Turn state machine skeleton (all phases as stubs, transitions, active/reactive player tracking)
2. Move Sub-Phase — each model moves up to M value, terrain interaction (difficult halves, dangerous tests), 1" enemy exclusion, coherency maintained at end
3. Rush — double movement, restrictions (no shooting after, no charging)
4. Reserves Sub-Phase — reserves test (3+), entering play from battlefield edge
5. Rout Sub-Phase — Routed units make fall-back moves toward nearest board edge
6. Embark / Disembark (transport interaction, access points, disembark distance)
7. Reaction trigger point: Reposition — Reactive Player moves a unit up to Initiative when enemy ends move within 12" and LOS
8. Debug visualizer integration: movement shown as model position updates with ghost trail of previous positions

**Source documents consumed:**
- `HH_Rules_Battle.md` → Movement Phase (all sub-phases), Reserves, Rush
- `HH_Principles.md` → terrain rules, coherency, 1" exclusion, Reposition reaction
- `HH_Armoury.md` → movement-relevant special rules (Implacable Advance, Deep Strike, Outflank, Scout, Infiltrate, etc.)

**Test examples:**
- 10 Marines (M7) move 7" through open ground, maintain coherency → valid
- Model attempts to move within 1" of enemy model → blocked
- Unit enters difficult terrain → movement halved for portion in terrain
- Reserve unit passes 3+ test → enters from board edge, moves normally, ends in coherency
- Reposition reaction: enemy ends move within 12", reactive unit moves up to I4 = 4"
- Routed unit falls back 2d6" toward nearest board edge

**Exit criteria:** Units can be moved through a complete Movement Phase with all sub-phases. Positions verified visually via debug tool.

---

### Phase 4 — Shooting Pipeline
**Testable headless: ✅ Mostly — the dice math is pure logic. LOS/range checks use the already-verified geometry engine.**

**Goal:** Complete shooting attack resolution from target selection through casualty removal.

**Deliverables:**
1. Full 11-step Shooting Attack Pipeline
2. Fire Group formation and resolution ordering
3. Ranged Hit Tests with BS lookup + Snap Shot handling
4. Wound Tests with S vs T lookup
5. Armour Penetration Tests for vehicles (d6 + S vs Armour Value → glancing/penetrating/miss)
6. Saving Throws (Armour, Invulnerable, Cover) with AP modification
7. Damage Mitigation Tests (Shrouded, Feel No Pain equivalents)
8. Damage application and casualty removal
9. Vehicle Damage Table for glancing hits (Stunned/Pinned/Suppressed; duplicate status → lose 1 HP)
10. Morale Sub-Phase (25% casualty panic check, coherency check after casualties)
11. Special Rules integration hooks (Breaching, Rending, Armourbane, Precision, Poisoned, etc.)
12. Reaction trigger point: Return Fire — Reactive Player shoots back before attacker removes casualties
13. Debug visualizer integration: LOS rays from shooter to target, fire group annotations, casualty markers

**Source documents consumed:**
- `HH_Rules_Battle.md` → Shooting Phase procedure (Steps 1-11), Morale Sub-Phase
- `HH_Principles.md` → Hit Tests, Wound Tests, Saving Throws, Damage, Vehicle Damage Procedure, Return Fire reaction
- `HH_Tables.md` → all three lookup tables
- `HH_Armoury.md` → special rules that modify the shooting pipeline

**Test examples:**
- 10 Tactical Marines (BS4) fire bolters (24", FP1, S4, AP5) at 10 Marines (T4, Sv3+) at 12": hits on 3+, wounds on 4+, save on 3+ (AP5 doesn't modify 3+ save)
- Lascannon (S9 AP2 Armourbane) vs Rhino (Front 11): d6+9 vs 11; Armourbane means glancing → penetrating
- Heavy Bolter with Pinning(4+) → successful wound triggers Pinning status check
- 3 casualties from a 10-man squad (30%) → panic check required
- Return Fire reaction: target shoots back at full BS before attacker removes casualties in Step 11

**Exit criteria:** Any shooting attack between any two units resolves correctly, including all special rules. Verified with both automated tests and visual scenarios in debug tool.

---

### Phase 5 — Assault & Reactions
**Testable headless: ⚠️ Dice math yes, but charge paths, pile-in, and consolidation are spatial — need visualizer**

**Goal:** Complete assault phase resolution and the full reaction system.

**Deliverables:**
1. Charge Sub-Phase (5-step procedure: Declare → Check Range/LOS → Set-up Move → Volley Attacks → Charge Move)
2. Challenge Sub-Phase (full Declare → Face-Off with all 9 Gambits → Focus Roll → Strike → Glory)
3. Fight Sub-Phase (Initiative Steps, Strike Groups, melee hit/wound/save pipeline)
4. Resolution Sub-Phase (Combat Resolution Points, Leadership Check, Aftermath options: Hold/Disengage/Fall Back/Pursue/Gun Down/Consolidate)
5. Pile-in movement mechanics (move toward nearest enemy, respecting base contact rules)
6. Aftermath movement (Fall Back, Disengage, Pursue, Consolidate — each has spatial rules)
7. Reaction system: allotment tracking, trigger detection at each valid interruption point across ALL phases
8. Core Reactions fully wired: Reposition (Phase 3), Return Fire (Phase 4), Overwatch (this phase)
9. Overwatch — Reactive Player fires at full BS instead of snap shot volley during charge
10. Debug visualizer integration: charge range indicators, pile-in arrows, engagement range highlighting, aftermath movement trails

**Source documents consumed:**
- `HH_Rules_Battle.md` → Assault Phase (all sub-phases), Challenge procedure with all 9 Gambits
- `HH_Principles.md` → Reactions, Reaction Allotments, melee hit tests, statuses in assault
- `HH_Tables.md` → Melee Hit Table
- `HH_Armoury.md` → assault-relevant special rules (Reaping Blow, Brutal, Murderous Strike, etc.)

**Test examples:**
- 10 Assault Marines charge 10 Tactical Marines 8" away → set-up move, volley fire as snap shots, charge move
- WS4 vs WS4 → hits on 4+ (Melee Hit Table)
- Overwatch reaction: target fires at full BS instead of snap shot volley
- Challenge: WS6 Praetor vs WS5 Centurion with Seize the Initiative gambit → focus roll with extra die, discard lowest
- Combat Resolution: 5 wounds inflicted vs 2 → loser checks Ld at -3
- Pile-in: model not in base contact moves up to 3" toward nearest enemy
- Pursue: pursuer rolls d6, moves I + result toward nearest fleeing model; base contact = caught
- Visual verification: charge path through terrain, pile-in positioning around a multi-model combat

**Exit criteria:** Full assault sequence resolves correctly. Reactions interrupt the state machine at correct points across all phases. All spatial movement verified visually.

---

### Phase 6 — Game UI
**The debug visualizer graduates.**

**Goal:** Evolve the Phase 2 debug visualizer into a playable two-player hotseat interface. The rendering pipeline, model/terrain drawing, and spatial overlays already exist — this phase adds game flow, player interaction, and information display.

**Deliverables:**
1. Game flow integration — the UI drives the turn state machine (phase progression, player switching, action prompts)
2. Player interaction layer — click to select unit, drag to move, click to target, confirm actions
3. Terrain editor mode — place/remove terrain pieces during pre-game setup
4. Deployment mode — place units in deployment zones
5. Phase tracker panel (current phase, sub-phase, whose turn, reaction allotment remaining)
6. Unit card panel (selected unit stats, wargear, wounds remaining, statuses, current options)
7. Shooting attack flow (target selection highlight, fire group display, dice roll results, casualty animation)
8. Assault attack flow (charge declaration, pile-in animation, combat resolution display, aftermath options)
9. Reaction prompt (modal for Reactive Player when trigger conditions met — accept/decline, select reacting unit)
10. Dice log / combat log (scrolling record of all rolls and results)
11. Challenge UI (gambit selection, focus roll display, strike resolution)
12. End-of-game summary (victory points, casualties, objectives scored)

**Source documents consumed:**
- All project documents inform UI requirements
- `HH_Battle_AOD.md` → deployment zone layouts per mission

**What already exists from Phase 2:**
- Canvas renderer with inch-scale grid
- Model rendering (circles, rectangles, facing arrows)
- Terrain rendering with type coloring
- LOS ray overlay
- Distance readout
- Coherency overlay
- Movement envelope shading
- Blast/template preview
- Vehicle facing arcs

**What's new:**
- Game state binding (UI reflects engine state, not just static geometry)
- Player input handling (actions feed back into engine)
- Information panels and HUD elements
- Animation and visual feedback for dice rolls, casualties, status changes

**Exit criteria:** Two players can set up terrain, deploy armies, and play a complete battle through all phases using the web UI.

---

### Phase 7 — Legion-Specific Rules

**Goal:** All 18 Legion Tacticas, Rites of War, and unique units fully functional.

**Deliverables:**
1. Legion Tactica system — each legion's passive rules applied to all units with that Faction Trait
2. Rite of War system — army-wide modifications with restrictions
3. Advanced Reactions — per-legion reactions (beyond the 3 core reactions)
4. Legion-specific Gambits for challenges
5. Legion-specific wargear (unique weapons and equipment)
6. Legion-specific units (Primarchs, unique squads, named characters)
7. Allegiance system (Loyalist/Traitor with appropriate unit restrictions)

**Source documents consumed:**
- `HH_Legiones_Astartes.md` → all 18 legion sections
- `legiones_astartes_clean.md` → legion-specific unit datasheets

**All 18 Legions:**
Dark Angels, Emperor's Children, Iron Warriors, White Scars, Space Wolves, Imperial Fists, Night Lords, Blood Angels, Iron Hands, World Eaters, Ultramarines, Death Guard, Thousand Sons, Sons of Horus, Word Bearers, Salamanders, Raven Guard, Alpha Legion

**Exit criteria:** Any legion army plays with correct Tactica, Rite of War, Advanced Reactions, and unique units.

---

### Phase 8 — Army Builder & Missions

**Goal:** Pre-game experience — army construction with validation, and mission/deployment framework.

**Deliverables:**
1. Army builder UI — select faction, allegiance, Rite of War; fill detachment slots; choose wargear options; track points
2. Force Org Chart enforcement — Crusade Primary, Allied, Auxiliary, Apex detachments
3. Detachment validation (slot types, unit eligibility, mandatory choices)
4. Points calculation (base + per-model + wargear options)
5. Rite of War restriction enforcement
6. Army export/import (save/load army lists as JSON)
7. Core Mission implementation — deployment zones, objective placement, victory conditions from `HH_Battle_AOD.md`
8. Secondary Objectives (Slay the Warlord, Giant Killer, Last Man Standing, First Strike)
9. Mission Special Rules (Seize the Initiative, Counter Offensive, Reserves)

**Source documents consumed:**
- `HH_Battle_AOD.md` → everything in this file
- `HH_Legiones_Astartes.md` → legion-specific detachments, Rite of War restrictions

**Exit criteria:** Players can build legal armies, select a mission, deploy, and play to a scored victory condition.

---

### Phase 9 — Polish, Network, Expansion

**Goal:** Production readiness and multiplayer.

**Deliverables:**
1. Network multiplayer (WebSocket — state sync between two clients via server)
2. Game save/load (serialize full game state at any point)
3. Replay system (step through game from any save state)
4. Undo support (revert last action within active player's phase)
5. AI opponent (basic — random valid actions; stretch — tactical heuristics)
6. Additional factions (Mechanicum, Solar Auxilia, Custodes, Sisters of Silence, Daemons of the Ruinstorm) as data modules
7. PWA packaging (offline support, install prompts)
8. Performance optimization (large battles — 3,000+ point armies with 100+ models per side)

---

## 6. Risk Register

| Risk | Severity | Mitigation |
|---|---|---|
| Free-movement LOS edge cases | High | Extensive geometry tests; fallback to "closest tangent line clear = LOS" |
| Special Rules combinatorial explosion | High | Hook-based architecture; each rule self-contained; integration tests for known interactions |
| Datasheet parsing errors from web scrape | Medium | Schema validation on every unit; manual spot-checks against source |
| Challenge/Gambit complexity | Medium | Implement as isolated sub-state-machine; test each gambit independently |
| Performance with 100+ models on battlefield | Medium | Spatial indexing (quadtree) for LOS/distance queries; lazy evaluation |
| Scope creep into non-LA factions | Low | Phase 8 item — data-only addition once engine is proven |

---

## 7. Testing Strategy

Every phase produces tests at three levels:

1. **Unit tests** — individual functions (distance calculation, wound table lookup, single save roll)
2. **Integration tests** — multi-step pipelines (full shooting attack from declaration through casualties)
3. **Scenario tests** — named tabletop situations with known correct outcomes:
   - "10 Bolter Marines shoot 10 Marines at 12 inches"
   - "Lascannon vs Land Raider Front Armour 14"
   - "Praetor challenges Centurion with Seize the Initiative"
   - "25% casualties triggers panic — Ld7 check at -0"
   - "Return Fire reaction interrupts shooting, resolves before attacker removes casualties"

Tests reference specific rules documents and page sections so any dispute can be traced to source.

---

## 8. Document Maintenance

As rules are implemented, annotate which sections of each project document have been fully encoded:
- `[ ]` = not started
- `[~]` = partially implemented
- `[x]` = fully implemented and tested

This tracking ensures complete coverage and makes it obvious what remains.
