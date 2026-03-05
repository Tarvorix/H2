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

import type { GameState, GameCommand, Position } from '@hh/types';
import { CoreReaction } from '@hh/types';
import type { GameEvent, CommandResult } from '@hh/engine';
import { processCommand, RandomDiceProvider } from '@hh/engine';
import type {
  CombatLogEntry,
  CombatLogCategory,
  DiceRollDisplay,
  WeaponSelection,
  GhostTrailEntry,
} from './types';

// ─── Dice Provider ───────────────────────────────────────────────────────────

const diceProvider = new RandomDiceProvider();

// ─── Execute Engine Command ──────────────────────────────────────────────────

/**
 * Execute a GameCommand against the engine and return the result.
 */
export function executeCommand(
  state: GameState,
  command: GameCommand,
): CommandResult {
  return processCommand(state, command, diceProvider);
}

// ─── Build Commands from UI State ────────────────────────────────────────────

/**
 * Build a MoveModel command for a single model.
 */
export function buildMoveCommand(
  modelId: string,
  targetPosition: Position,
): GameCommand {
  return {
    type: 'moveModel',
    modelId,
    targetPosition,
  };
}

/**
 * Build a MoveUnit command (atomic full-unit movement).
 */
export function buildMoveUnitCommand(
  unitId: string,
  modelPositions: { modelId: string; position: Position }[],
  isRush: boolean = false,
): GameCommand {
  return {
    type: 'moveUnit',
    unitId,
    modelPositions,
    isRush,
  };
}

/**
 * Build a RushUnit command.
 */
export function buildRushCommand(unitId: string): GameCommand {
  return {
    type: 'rushUnit',
    unitId,
  };
}

/**
 * Build a DeclareShooting command from weapon selections.
 */
export function buildShootingCommand(
  attackingUnitId: string,
  targetUnitId: string,
  weaponSelections: WeaponSelection[],
  blastMarkerPosition?: Position,
): GameCommand {
  return {
    type: 'declareShooting',
    attackingUnitId,
    targetUnitId,
    weaponSelections: weaponSelections.map(ws => ({
      modelId: ws.modelId,
      weaponId: ws.weaponId,
      profileName: ws.profileName,
    })),
    blastMarkerPosition,
  };
}

/**
 * Build a DeclareCharge command.
 */
export function buildChargeCommand(
  chargingUnitId: string,
  targetUnitId: string,
): GameCommand {
  return {
    type: 'declareCharge',
    chargingUnitId,
    targetUnitId,
  };
}

/**
 * Build a SelectReaction command.
 */
export function buildReactionCommand(
  unitId: string,
  reactionType: CoreReaction,
): GameCommand {
  return {
    type: 'selectReaction',
    unitId,
    reactionType: reactionType as string,
  };
}

/**
 * Build a DeclineReaction command.
 */
export function buildDeclineReactionCommand(): GameCommand {
  return { type: 'declineReaction' };
}

/**
 * Build an EndPhase command.
 */
export function buildEndPhaseCommand(): GameCommand {
  return { type: 'endPhase' };
}

/**
 * Build an EndSubPhase command.
 */
export function buildEndSubPhaseCommand(): GameCommand {
  return { type: 'endSubPhase' };
}

/**
 * Build a DeclareChallenge command.
 */
export function buildDeclareChallengeCommand(
  challengerModelId: string,
  targetModelId: string,
): GameCommand {
  return {
    type: 'declareChallenge',
    challengerModelId,
    targetModelId,
  };
}

/**
 * Build a SelectGambit command.
 */
export function buildSelectGambitCommand(
  modelId: string,
  gambit: string,
): GameCommand {
  return {
    type: 'selectGambit',
    modelId,
    gambit,
  };
}

/**
 * Build a SelectAftermath command.
 */
export function buildSelectAftermathCommand(
  unitId: string,
  option: string,
): GameCommand {
  return {
    type: 'selectAftermath',
    unitId,
    option,
  };
}

/**
 * Build a ResolveFight command.
 */
export function buildResolveFightCommand(combatId: string): GameCommand {
  return {
    type: 'resolveFight',
    combatId,
  };
}

/**
 * Build a DeployUnit command.
 */
export function buildDeployUnitCommand(
  unitId: string,
  modelPositions: { modelId: string; position: Position }[],
): GameCommand {
  return {
    type: 'deployUnit',
    unitId,
    modelPositions,
  };
}

/**
 * Build an AcceptChallenge command.
 */
export function buildAcceptChallengeCommand(
  challengedModelId: string,
): GameCommand {
  return {
    type: 'acceptChallenge',
    challengedModelId,
  };
}

/**
 * Build a DeclineChallenge command.
 */
export function buildDeclineChallengeCommand(): GameCommand {
  return {
    type: 'declineChallenge',
  };
}

/**
 * Build a ResolveShootingCasualties command.
 */
export function buildResolveShootingCasualtiesCommand(): GameCommand {
  return {
    type: 'resolveShootingCasualties',
  };
}

// ─── Convert Events to Combat Log ────────────────────────────────────────────

let logEntryIdCounter = 0;

function nextLogId(): string {
  return `log-${++logEntryIdCounter}`;
}

/**
 * Convert an array of GameEvents from the engine into CombatLogEntry items.
 */
export function eventsToLogEntries(
  events: GameEvent[],
  gameState: GameState,
): CombatLogEntry[] {
  const entries: CombatLogEntry[] = [];
  const now = Date.now();

  for (const event of events) {
    const entry = eventToLogEntry(event, gameState, now);
    if (entry) {
      entries.push(entry);
    }
  }

  return entries;
}

function createLogEntry(
  message: string,
  category: CombatLogCategory,
  gameState: GameState,
  timestamp: number,
  options: {
    diceRolls?: DiceRollDisplay[];
    sourceUnitId?: string;
    targetUnitId?: string;
    isImportant?: boolean;
  } = {},
): CombatLogEntry {
  return {
    id: nextLogId(),
    timestamp,
    battleTurn: gameState.currentBattleTurn,
    phase: gameState.currentPhase,
    subPhase: gameState.currentSubPhase,
    activePlayerIndex: gameState.activePlayerIndex,
    category,
    message,
    diceRolls: options.diceRolls ?? [],
    sourceUnitId: options.sourceUnitId,
    targetUnitId: options.targetUnitId,
    isImportant: options.isImportant ?? false,
  };
}

function eventToLogEntry(
  event: GameEvent,
  gameState: GameState,
  timestamp: number,
): CombatLogEntry | null {
  switch (event.type) {
    // ── Movement Events ─────────────────────────────────────────────────────
    case 'modelMoved':
      return createLogEntry(
        `Model moved ${event.distanceMoved.toFixed(1)}"`,
        'movement',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId },
      );

    case 'unitRushed':
      return createLogEntry(
        `Unit rushed (${event.rushDistance.toFixed(1)}" max)`,
        'movement',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId, isImportant: true },
      );

    case 'reservesTest':
      return createLogEntry(
        `Reserves test: rolled ${event.roll} (need ${event.targetNumber}+) — ${event.passed ? 'PASSED' : 'FAILED'}`,
        'movement',
        gameState,
        timestamp,
        {
          sourceUnitId: event.unitId,
          diceRolls: [{
            values: [event.roll],
            targetNumber: event.targetNumber,
            passedIndices: event.passed ? [0] : [],
            failedIndices: event.passed ? [] : [0],
            label: 'Reserves Test',
            summary: event.passed ? 'Passed' : 'Failed',
          }],
        },
      );

    case 'dangerousTerrainTest':
      return createLogEntry(
        `Dangerous terrain test: rolled ${event.roll} — ${event.passed ? 'SAFE' : `${event.woundsCaused} wound(s)!`}`,
        'movement',
        gameState,
        timestamp,
        {
          sourceUnitId: event.unitId,
          diceRolls: [{
            values: [event.roll],
            targetNumber: 2,
            passedIndices: event.passed ? [0] : [],
            failedIndices: event.passed ? [] : [0],
            label: 'Dangerous Terrain',
            summary: event.passed ? 'Safe' : `${event.woundsCaused} wound(s)`,
          }],
        },
      );

    case 'routMove':
      return createLogEntry(
        `Routed unit falls back ${event.distanceRolled.toFixed(1)}"${event.reachedEdge ? ' — reached board edge!' : ''}`,
        'movement',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId, isImportant: true },
      );

    case 'embark':
      return createLogEntry(
        'Unit embarked on transport',
        'movement',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId },
      );

    case 'disembark':
      return createLogEntry(
        'Unit disembarked from transport',
        'movement',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId },
      );

    // ── Phase Events ────────────────────────────────────────────────────────
    case 'phaseAdvanced':
      return createLogEntry(
        `Phase: ${event.fromPhase} → ${event.toPhase}`,
        'phase',
        gameState,
        timestamp,
        { isImportant: true },
      );

    case 'subPhaseAdvanced':
      return createLogEntry(
        `Sub-phase: ${event.fromSubPhase} → ${event.toSubPhase}`,
        'phase',
        gameState,
        timestamp,
      );

    case 'playerTurnAdvanced':
      return createLogEntry(
        `Player Turn: Player ${event.newActivePlayerIndex + 1}'s turn`,
        'phase',
        gameState,
        timestamp,
        { isImportant: true },
      );

    case 'battleTurnAdvanced':
      return createLogEntry(
        `Battle Turn ${event.newBattleTurn}`,
        'phase',
        gameState,
        timestamp,
        { isImportant: true },
      );

    // ── Shooting Events ─────────────────────────────────────────────────────
    case 'shootingAttackDeclared':
      return createLogEntry(
        `Shooting attack declared: ${event.fireGroupCount} fire group(s)`,
        'shooting',
        gameState,
        timestamp,
        {
          sourceUnitId: event.attackerUnitId,
          targetUnitId: event.targetUnitId,
          isImportant: true,
        },
      );

    case 'hitTestRoll': {
      const diceRoll: DiceRollDisplay = {
        values: event.rolls,
        targetNumber: event.targetNumber,
        passedIndices: event.rolls.map((r, i) => r >= event.targetNumber ? i : -1).filter(i => i >= 0),
        failedIndices: event.rolls.map((r, i) => r < event.targetNumber ? i : -1).filter(i => i >= 0),
        label: event.isSnapShot ? `Snap Shot Hit Test (${event.targetNumber}+)` : `Hit Test (${event.targetNumber}+)`,
        summary: `${event.hits} hit(s), ${event.misses} miss(es)${event.criticals > 0 ? `, ${event.criticals} critical(s)` : ''}`,
      };
      return createLogEntry(
        `Hit test: ${event.hits}/${event.rolls.length} hits (need ${event.targetNumber}+)${event.isSnapShot ? ' [Snap Shot]' : ''}`,
        'shooting',
        gameState,
        timestamp,
        { diceRolls: [diceRoll] },
      );
    }

    case 'woundTestRoll': {
      const diceRoll: DiceRollDisplay = {
        values: event.rolls,
        targetNumber: event.targetNumber,
        passedIndices: event.rolls.map((r, i) => r >= event.targetNumber ? i : -1).filter(i => i >= 0),
        failedIndices: event.rolls.map((r, i) => r < event.targetNumber ? i : -1).filter(i => i >= 0),
        label: `Wound Test S${event.strength} vs T${event.toughness} (${event.targetNumber}+)`,
        summary: `${event.wounds} wound(s), ${event.failures} fail(s)`,
      };
      return createLogEntry(
        `Wound test: ${event.wounds}/${event.rolls.length} wounds (S${event.strength} vs T${event.toughness}, need ${event.targetNumber}+)`,
        'shooting',
        gameState,
        timestamp,
        { diceRolls: [diceRoll] },
      );
    }

    case 'armourPenetrationRoll': {
      const diceRoll: DiceRollDisplay = {
        values: event.rolls,
        targetNumber: event.armourValue - event.strength + 1,
        passedIndices: event.rolls.map((r, i) => (r + event.strength) >= event.armourValue ? i : -1).filter(i => i >= 0),
        failedIndices: event.rolls.map((r, i) => (r + event.strength) < event.armourValue ? i : -1).filter(i => i >= 0),
        label: `Armour Penetration S${event.strength} vs AV${event.armourValue} (${event.facing})`,
        summary: `${event.penetrating} penetrating, ${event.glancing} glancing, ${event.misses} miss`,
      };
      return createLogEntry(
        `AP test: S${event.strength} vs AV${event.armourValue} (${event.facing}) — ${event.penetrating} pen, ${event.glancing} glance`,
        'shooting',
        gameState,
        timestamp,
        { diceRolls: [diceRoll] },
      );
    }

    case 'savingThrowRoll':
      return createLogEntry(
        `${event.saveType} save: rolled ${event.roll} (need ${event.targetNumber}+) — ${event.passed ? 'SAVED' : 'FAILED'}`,
        'shooting',
        gameState,
        timestamp,
        {
          diceRolls: [{
            values: [event.roll],
            targetNumber: event.targetNumber,
            passedIndices: event.passed ? [0] : [],
            failedIndices: event.passed ? [] : [0],
            label: `${event.saveType.charAt(0).toUpperCase() + event.saveType.slice(1)} Save (${event.targetNumber}+)`,
            summary: event.passed ? 'Saved' : 'Failed',
          }],
        },
      );

    case 'damageApplied':
      return createLogEntry(
        `${event.woundsLost} wound(s) applied${event.destroyed ? ' — MODEL DESTROYED' : ` (${event.remainingWounds} remaining)`}`,
        'shooting',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId, isImportant: event.destroyed },
      );

    case 'casualtyRemoved':
      return createLogEntry(
        'Casualty removed',
        'shooting',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId },
      );

    case 'vehicleDamageRoll':
      return createLogEntry(
        `Vehicle damage: rolled ${event.roll} — ${event.result}${event.hullPointLost ? ' (HP lost — duplicate status)' : ''}`,
        'shooting',
        gameState,
        timestamp,
        {
          sourceUnitId: event.unitId,
          diceRolls: [{
            values: [event.roll],
            targetNumber: 1,
            passedIndices: [0],
            failedIndices: [],
            label: 'Vehicle Damage Table',
            summary: event.result,
          }],
        },
      );

    case 'returnFireTriggered':
      return createLogEntry(
        'Return Fire reaction available!',
        'reaction',
        gameState,
        timestamp,
        { targetUnitId: event.targetUnitId, isImportant: true },
      );

    // ── Morale Events ───────────────────────────────────────────────────────
    case 'panicCheck':
      return createLogEntry(
        `Panic check: rolled ${event.roll} vs LD ${event.target}${event.modifier !== 0 ? ` (modifier ${event.modifier > 0 ? '+' : ''}${event.modifier})` : ''} — ${event.passed ? 'PASSED' : 'FAILED (Routed!)'}`,
        'morale',
        gameState,
        timestamp,
        {
          sourceUnitId: event.unitId,
          isImportant: !event.passed,
          diceRolls: [{
            values: [event.roll],
            targetNumber: event.target,
            passedIndices: event.passed ? [0] : [],
            failedIndices: event.passed ? [] : [0],
            label: `Panic Check (LD ${event.target})`,
            summary: event.passed ? 'Passed' : 'Routed!',
          }],
        },
      );

    case 'statusCheck':
      return createLogEntry(
        `${event.checkType} check: rolled ${event.roll} vs ${event.target} — ${event.passed ? 'PASSED' : `FAILED${event.statusApplied ? ` (${event.statusApplied})` : ''}`}`,
        'morale',
        gameState,
        timestamp,
        {
          sourceUnitId: event.unitId,
          diceRolls: [{
            values: [event.roll],
            targetNumber: event.target,
            passedIndices: event.passed ? [0] : [],
            failedIndices: event.passed ? [] : [0],
            label: `${event.checkType.charAt(0).toUpperCase() + event.checkType.slice(1)} Check`,
            summary: event.passed ? 'Passed' : (event.statusApplied ?? 'Failed'),
          }],
        },
      );

    // ── Status Events ───────────────────────────────────────────────────────
    case 'statusApplied':
      return createLogEntry(
        `Status applied: ${event.status}`,
        'status',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId, isImportant: true },
      );

    case 'statusRemoved':
      return createLogEntry(
        `Status removed: ${event.status}`,
        'status',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId },
      );

    // ── Assault Events ──────────────────────────────────────────────────────
    case 'chargeDeclared':
      return createLogEntry(
        `Charge declared!${event.isDisordered ? ' (Disordered)' : ''}`,
        'assault',
        gameState,
        timestamp,
        {
          sourceUnitId: event.chargingUnitId,
          targetUnitId: event.targetUnitId,
          isImportant: true,
        },
      );

    case 'chargeRoll': {
      const diceRoll: DiceRollDisplay = {
        values: event.diceValues,
        targetNumber: Math.ceil(event.distanceNeeded),
        passedIndices: [event.diceValues.indexOf(event.chargeRoll)],
        failedIndices: [event.diceValues.indexOf(event.discardedDie)],
        label: `Charge Roll (need ${event.distanceNeeded.toFixed(1)}")`,
        summary: `${event.chargeRoll}" (discarded ${event.discardedDie})`,
      };
      return createLogEntry(
        `Charge roll: ${event.diceValues[0]}+${event.diceValues[1]}, keep ${event.chargeRoll} (need ${event.distanceNeeded.toFixed(1)}")`,
        'assault',
        gameState,
        timestamp,
        {
          sourceUnitId: event.chargingUnitId,
          targetUnitId: event.targetUnitId,
          diceRolls: [diceRoll],
        },
      );
    }

    case 'chargeSucceeded':
      return createLogEntry(
        `Charge succeeded! (rolled ${event.chargeRoll}, needed ${event.distanceNeeded.toFixed(1)}")`,
        'assault',
        gameState,
        timestamp,
        {
          sourceUnitId: event.chargingUnitId,
          targetUnitId: event.targetUnitId,
          isImportant: true,
        },
      );

    case 'chargeFailed':
      return createLogEntry(
        `Charge failed. (rolled ${event.chargeRoll}, needed ${event.distanceNeeded.toFixed(1)}")`,
        'assault',
        gameState,
        timestamp,
        {
          sourceUnitId: event.chargingUnitId,
          targetUnitId: event.targetUnitId,
          isImportant: true,
        },
      );

    case 'challengeDeclared':
      return createLogEntry(
        'Challenge declared!',
        'assault',
        gameState,
        timestamp,
        {
          sourceUnitId: event.challengerUnitId,
          targetUnitId: event.targetUnitId,
          isImportant: true,
        },
      );

    case 'gambitSelected':
      return createLogEntry(
        `Gambit selected: ${event.gambit}`,
        'assault',
        gameState,
        timestamp,
      );

    case 'focusRoll':
      return createLogEntry(
        `Focus roll: Challenger ${event.challengerRoll} vs Challenged ${event.challengedRoll}${event.isTie ? ' — TIE' : ` — Player ${(event.advantagePlayerIndex ?? 0) + 1} has advantage`}`,
        'assault',
        gameState,
        timestamp,
        {
          diceRolls: [{
            values: [event.challengerRoll, event.challengedRoll],
            targetNumber: 0,
            passedIndices: event.advantagePlayerIndex === 0 ? [0] : event.advantagePlayerIndex === 1 ? [1] : [],
            failedIndices: [],
            label: 'Focus Roll',
            summary: event.isTie ? 'Tie' : `Player ${(event.advantagePlayerIndex ?? 0) + 1} advantage`,
          }],
          isImportant: true,
        },
      );

    case 'challengeStrike':
      return createLogEntry(
        `Challenge strike: Challenger dealt ${event.challengerWoundsInflicted} wound(s), Challenged dealt ${event.challengedWoundsInflicted} wound(s)${event.modelSlain ? ' — MODEL SLAIN!' : ''}`,
        'assault',
        gameState,
        timestamp,
        { isImportant: event.modelSlain },
      );

    case 'combatResolution':
      return createLogEntry(
        `Combat resolution: Active ${event.activePlayerCRP} CRP vs Reactive ${event.reactivePlayerCRP} CRP${event.winnerPlayerIndex !== null ? ` — Player ${event.winnerPlayerIndex + 1} wins by ${event.crpDifference}` : ' — DRAW'}`,
        'assault',
        gameState,
        timestamp,
        { isImportant: true },
      );

    case 'aftermathSelected':
      return createLogEntry(
        `Aftermath: ${event.option}`,
        'assault',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId },
      );

    case 'meleeHitTestRoll': {
      const diceRoll: DiceRollDisplay = {
        values: event.rolls,
        targetNumber: event.targetNumber,
        passedIndices: event.rolls.map((r, i) => r >= event.targetNumber ? i : -1).filter(i => i >= 0),
        failedIndices: event.rolls.map((r, i) => r < event.targetNumber ? i : -1).filter(i => i >= 0),
        label: `Melee Hit Test WS${event.attackerWS} vs WS${event.defenderWS} (${event.targetNumber}+)`,
        summary: `${event.hits} hit(s), ${event.misses} miss(es)`,
      };
      return createLogEntry(
        `Melee hits: ${event.hits}/${event.rolls.length} (WS${event.attackerWS} vs WS${event.defenderWS}, need ${event.targetNumber}+)`,
        'assault',
        gameState,
        timestamp,
        { diceRolls: [diceRoll] },
      );
    }

    case 'meleeWoundTestRoll': {
      const diceRoll: DiceRollDisplay = {
        values: event.rolls,
        targetNumber: event.targetNumber,
        passedIndices: event.rolls.map((r, i) => r >= event.targetNumber ? i : -1).filter(i => i >= 0),
        failedIndices: event.rolls.map((r, i) => r < event.targetNumber ? i : -1).filter(i => i >= 0),
        label: `Melee Wound Test S${event.strength} vs T${event.toughness} (${event.targetNumber}+)`,
        summary: `${event.wounds} wound(s), ${event.failures} fail(s)`,
      };
      return createLogEntry(
        `Melee wounds: ${event.wounds}/${event.rolls.length} (S${event.strength} vs T${event.toughness}, need ${event.targetNumber}+)`,
        'assault',
        gameState,
        timestamp,
        { diceRolls: [diceRoll] },
      );
    }

    // ── Reaction Events ─────────────────────────────────────────────────────
    case 'repositionTriggered':
      return createLogEntry(
        'Reposition reaction available!',
        'reaction',
        gameState,
        timestamp,
        { sourceUnitId: event.triggerUnitId, isImportant: true },
      );

    case 'repositionExecuted':
      return createLogEntry(
        'Reposition reaction executed',
        'reaction',
        gameState,
        timestamp,
        { sourceUnitId: event.reactingUnitId },
      );

    case 'overwatchTriggered':
      return createLogEntry(
        'Overwatch reaction available!',
        'reaction',
        gameState,
        timestamp,
        { targetUnitId: event.chargingUnitId, isImportant: true },
      );

    case 'overwatchResolved':
      return createLogEntry(
        event.accepted ? 'Overwatch accepted — firing at full BS!' : 'Overwatch declined',
        'reaction',
        gameState,
        timestamp,
        { sourceUnitId: event.reactingUnitId, isImportant: event.accepted },
      );

    // ── Unit/Game Events ────────────────────────────────────────────────────
    case 'unitDestroyed':
      return createLogEntry(
        `Unit destroyed! (${event.reason})`,
        'system',
        gameState,
        timestamp,
        { sourceUnitId: event.unitId, isImportant: true },
      );

    case 'leadershipCheck':
      return createLogEntry(
        `Leadership check: rolled ${event.roll} vs LD ${event.target} — ${event.passed ? 'PASSED' : 'FAILED'}`,
        'morale',
        gameState,
        timestamp,
        {
          sourceUnitId: event.unitId,
          diceRolls: [{
            values: [event.roll],
            targetNumber: event.target,
            passedIndices: event.passed ? [0] : [],
            failedIndices: event.passed ? [] : [0],
            label: `Leadership Check (LD ${event.target})`,
            summary: event.passed ? 'Passed' : 'Failed',
          }],
        },
      );

    case 'coolCheck':
      return createLogEntry(
        `Cool check: rolled ${event.roll} vs CL ${event.target} — ${event.passed ? 'PASSED (status removed)' : 'FAILED (status remains)'}`,
        'morale',
        gameState,
        timestamp,
        {
          sourceUnitId: event.unitId,
          diceRolls: [{
            values: [event.roll],
            targetNumber: event.target,
            passedIndices: event.passed ? [0] : [],
            failedIndices: event.passed ? [] : [0],
            label: `Cool Check (CL ${event.target})`,
            summary: event.passed ? 'Status removed' : 'Status remains',
          }],
        },
      );

    case 'gameOver':
      return createLogEntry(
        `GAME OVER — ${event.winnerPlayerIndex !== null ? `Player ${event.winnerPlayerIndex + 1} wins!` : 'DRAW'} (${event.reason})`,
        'system',
        gameState,
        timestamp,
        { isImportant: true },
      );

    // ── Mission / Victory Events ─────────────────────────────────────────
    case 'objectiveScored':
      return createLogEntry(
        `Player ${event.playerIndex + 1} scored ${event.vpScored}VP from ${event.objectiveLabel}`,
        'system',
        gameState,
        timestamp,
        { isImportant: true },
      );

    case 'secondaryAchieved':
      return createLogEntry(
        `Player ${event.playerIndex + 1} achieved ${event.secondaryType} — ${event.vpScored}VP`,
        'system',
        gameState,
        timestamp,
        { isImportant: true },
      );

    case 'counterOffensiveActivated':
      return createLogEntry(
        `Counter Offensive! Player ${event.playerIndex + 1}'s VP doubled: ${event.originalVP} → ${event.doubledVP}`,
        'system',
        gameState,
        timestamp,
        { isImportant: true },
      );

    case 'seizeTheInitiative': {
      const diceRoll: DiceRollDisplay = {
        values: [event.roll],
        targetNumber: event.target,
        passedIndices: event.success ? [0] : [],
        failedIndices: event.success ? [] : [0],
        label: `Seize the Initiative (${event.target}+)`,
        summary: event.success ? 'Seized!' : 'Failed',
      };
      return createLogEntry(
        `Seize the Initiative: Player ${event.playerIndex + 1} rolled ${event.roll} (need ${event.target}+) — ${event.success ? 'SEIZED!' : 'Failed'}`,
        'system',
        gameState,
        timestamp,
        { diceRolls: [diceRoll], isImportant: event.success },
      );
    }

    case 'windowOfOpportunity':
      return createLogEntry(
        `Window of Opportunity: Objective VP reduced ${event.previousValue} → ${event.newValue}${event.removed ? ' (REMOVED)' : ''}`,
        'system',
        gameState,
        timestamp,
        { isImportant: event.removed },
      );

    case 'suddenDeath':
      return createLogEntry(
        `SUDDEN DEATH! Player ${event.survivingPlayerIndex + 1} survives (+${event.bonusVP}VP bonus)`,
        'system',
        gameState,
        timestamp,
        { isImportant: true },
      );

    // Events that don't need combat log entries
    case 'reservesEntry':
    case 'emergencyDisembark':
    case 'fireGroupResolved':
    case 'damageMitigationRoll':
    case 'blastMarkerPlaced':
    case 'templatePlaced':
    case 'scatterRoll':
    case 'deflagrateHits':
    case 'getsHot':
    case 'setupMove':
    case 'volleyAttack':
    case 'chargeMove':
    case 'challengeDeclined':
    case 'disgracedApplied':
    case 'challengeGlory':
    case 'combatDeclared':
    case 'initiativeStepResolved':
    case 'pileInMove':
    case 'pursueRoll':
    case 'consolidateMove':
    case 'disengageMove':
    case 'gunDown':
    case 'assaultFallBack':
      return null;

    default:
      return null;
  }
}

// ─── Extract Ghost Trails ────────────────────────────────────────────────────

/**
 * Extract ghost trail entries from movement events.
 */
export function extractGhostTrails(events: GameEvent[]): GhostTrailEntry[] {
  const trails: GhostTrailEntry[] = [];

  for (const event of events) {
    if (event.type === 'modelMoved') {
      trails.push({
        modelId: event.modelId,
        fromPosition: event.fromPosition,
        toPosition: event.toPosition,
        baseRadiusInches: 0.63, // default 32mm base radius in inches
      });
    }
    if (event.type === 'chargeMove' || event.type === 'setupMove') {
      trails.push({
        modelId: event.modelId,
        fromPosition: event.from,
        toPosition: event.to,
        baseRadiusInches: 0.63,
      });
    }
    if (event.type === 'pileInMove') {
      trails.push({
        modelId: event.modelId,
        fromPosition: event.from,
        toPosition: event.to,
        baseRadiusInches: 0.63,
      });
    }
  }

  return trails;
}

/**
 * Extract the latest dice roll display from events (for the dice overlay).
 */
export function extractLatestDiceRoll(events: GameEvent[]): DiceRollDisplay | null {
  // Find the last event that contains dice rolls
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i];
    if (event.type === 'hitTestRoll' || event.type === 'meleeHitTestRoll') {
      const e = event as { rolls: number[]; targetNumber: number; hits: number; misses: number };
      return {
        values: e.rolls,
        targetNumber: e.targetNumber,
        passedIndices: e.rolls.map((r: number, idx: number) => r >= e.targetNumber ? idx : -1).filter((i: number) => i >= 0),
        failedIndices: e.rolls.map((r: number, idx: number) => r < e.targetNumber ? idx : -1).filter((i: number) => i >= 0),
        label: event.type === 'hitTestRoll' ? 'Hit Test' : 'Melee Hit Test',
        summary: `${e.hits} hit(s)`,
      };
    }
    if (event.type === 'woundTestRoll' || event.type === 'meleeWoundTestRoll') {
      const e = event as { rolls: number[]; targetNumber: number; wounds: number; failures: number };
      return {
        values: e.rolls,
        targetNumber: e.targetNumber,
        passedIndices: e.rolls.map((r: number, idx: number) => r >= e.targetNumber ? idx : -1).filter((i: number) => i >= 0),
        failedIndices: e.rolls.map((r: number, idx: number) => r < e.targetNumber ? idx : -1).filter((i: number) => i >= 0),
        label: event.type === 'woundTestRoll' ? 'Wound Test' : 'Melee Wound Test',
        summary: `${e.wounds} wound(s)`,
      };
    }
    if (event.type === 'chargeRoll') {
      return {
        values: event.diceValues,
        targetNumber: Math.ceil(event.distanceNeeded),
        passedIndices: [0, 1],
        failedIndices: [],
        label: 'Charge Roll',
        summary: `${event.chargeRoll}" charged`,
      };
    }
  }
  return null;
}
