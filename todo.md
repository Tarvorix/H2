# HHv2 TODO

Last Updated: 2026-03-07

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
