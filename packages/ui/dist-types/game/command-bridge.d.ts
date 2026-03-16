/**
 * Command Bridge
 *
 * Translates UI interactions into engine GameCommand objects.
 * Also converts engine GameEvents into CombatLogEntry items.
 *
 * The bridge sits between the UI reducer and the engine's processCommand().
 * It handles:
 * 1. Building properly-typed GameCommand objects from UI flow state
 * 2. Converting GameEvent arrays into human-readable combat log entries
 * 3. Extracting dice roll displays from events for the dice overlay
 */
import type { AttackTargetRef, BlastPlacement, FlyerCombatAssignment, GameState, GameCommand, Position, TemplatePlacement } from '@hh/types';
import type { GameEvent, CommandResult } from '@hh/engine';
import type { CombatLogEntry, DiceRollDisplay, WeaponSelection, GhostTrailEntry } from './types';
/**
 * Execute a GameCommand against the engine and return the result.
 */
export declare function executeCommand(state: GameState, command: GameCommand): CommandResult;
/**
 * Build a MoveModel command for a single model.
 */
export declare function buildMoveCommand(modelId: string, targetPosition: Position): GameCommand;
/**
 * Build a MoveUnit command (atomic full-unit movement).
 */
export declare function buildMoveUnitCommand(unitId: string, modelPositions: {
    modelId: string;
    position: Position;
}[], isRush?: boolean, measuredDistance?: number): GameCommand;
/**
 * Build a RushUnit command.
 */
export declare function buildRushCommand(unitId: string): GameCommand;
/**
 * Build a DeclareShooting command from weapon selections.
 */
export declare function buildShootingCommand(attackingUnitId: string, target: AttackTargetRef, weaponSelections: WeaponSelection[], blastPlacements?: BlastPlacement[], templatePlacements?: TemplatePlacement[]): GameCommand;
/**
 * Build a DeclareCharge command.
 */
export declare function buildChargeCommand(chargingUnitId: string, target: AttackTargetRef, measuredDistance?: number): GameCommand;
/**
 * Build a SelectReaction command.
 */
export declare function buildReactionCommand(unitId: string, reactionType: string, options?: {
    modelPositions?: {
        modelId: string;
        position: Position;
    }[];
    reactingModelId?: string;
    weaponId?: string;
    profileName?: string;
}): GameCommand;
/**
 * Build a DeclineReaction command.
 */
export declare function buildDeclineReactionCommand(): GameCommand;
/**
 * Build an EndPhase command.
 */
export declare function buildEndPhaseCommand(): GameCommand;
/**
 * Build an EndSubPhase command.
 */
export declare function buildEndSubPhaseCommand(): GameCommand;
/**
 * Build a PassChallenge command.
 */
export declare function buildPassChallengeCommand(combatId: string): GameCommand;
/**
 * Build a DeclareChallenge command.
 */
export declare function buildDeclareChallengeCommand(challengerModelId: string, targetModelId: string): GameCommand;
/**
 * Build a SelectGambit command.
 */
export declare function buildSelectGambitCommand(modelId: string, gambit: string): GameCommand;
/**
 * Build a SelectAftermath command.
 */
export declare function buildSelectAftermathCommand(unitId: string, option: string): GameCommand;
/**
 * Build a ResolveFight command.
 */
export declare function buildResolveFightCommand(combatId: string): GameCommand;
/**
 * Build a DeployUnit command.
 */
export declare function buildDeployUnitCommand(unitId: string, modelPositions: {
    modelId: string;
    position: Position;
}[], combatAssignment?: FlyerCombatAssignment): GameCommand;
/**
 * Build an AcceptChallenge command.
 */
export declare function buildAcceptChallengeCommand(challengedModelId: string): GameCommand;
/**
 * Build a DeclineChallenge command.
 */
export declare function buildDeclineChallengeCommand(): GameCommand;
/**
 * Build a ResolveShootingCasualties command.
 */
export declare function buildResolveShootingCasualtiesCommand(): GameCommand;
/**
 * Convert an array of GameEvents from the engine into CombatLogEntry items.
 */
export declare function eventsToLogEntries(events: GameEvent[], gameState: GameState): CombatLogEntry[];
/**
 * Extract ghost trail entries from movement events.
 */
export declare function extractGhostTrails(events: GameEvent[], gameState: GameState): GhostTrailEntry[];
/**
 * Extract the latest dice roll display from events (for the dice overlay).
 */
export declare function extractLatestDiceRoll(events: GameEvent[]): DiceRollDisplay | null;
//# sourceMappingURL=command-bridge.d.ts.map