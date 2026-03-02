import type { GameState } from '@hh/types';
import { SubPhase } from '@hh/types';
import { getValidCommands } from './command-processor';
import {
  canUnitCharge,
  canUnitMove,
  canUnitRush,
  canUnitShoot,
  getActiveArmy,
  isUnitDestroyed,
} from './game-queries';

export type PhaseUxMode = 'auto' | 'decision' | 'conditional';
export type PhaseUxState = 'auto' | 'decision' | 'blocked';
export type PhaseUxBlocker = 'none' | 'gameOver' | 'reactionPending' | 'tacticalActions';

export interface PhaseUxStatus {
  mode: PhaseUxMode;
  state: PhaseUxState;
  blocker: PhaseUxBlocker;
  canAutoAdvance: boolean;
  isDecisionPoint: boolean;
  tacticalActions: string[];
  message: string;
}

const SUB_PHASE_MODES: Record<SubPhase, PhaseUxMode> = {
  [SubPhase.StartEffects]: 'auto',
  [SubPhase.Reserves]: 'conditional',
  [SubPhase.Move]: 'decision',
  [SubPhase.Rout]: 'auto',
  [SubPhase.Attack]: 'decision',
  [SubPhase.ShootingMorale]: 'auto',
  [SubPhase.Charge]: 'decision',
  [SubPhase.Challenge]: 'conditional',
  [SubPhase.Fight]: 'conditional',
  [SubPhase.Resolution]: 'conditional',
  [SubPhase.EndEffects]: 'auto',
  [SubPhase.Statuses]: 'auto',
  [SubPhase.Victory]: 'auto',
};

function filterValidCommands(valid: Set<string>, commands: string[]): string[] {
  return commands.filter(command => valid.has(command));
}

function getTacticalActionsForCurrentSubPhase(state: GameState): string[] {
  const valid = new Set(getValidCommands(state));
  const activeArmy = getActiveArmy(state);
  const aliveUnits = activeArmy.units.filter(unit => !isUnitDestroyed(unit));
  const hasUnresolvedCombat = state.activeCombats?.some(combat => !combat.resolved) ?? false;

  switch (state.currentSubPhase) {
    case SubPhase.Reserves: {
      const hasReserves = aliveUnits.some(unit => unit.isInReserves);
      if (!hasReserves) return [];
      return filterValidCommands(valid, ['reservesTest', 'deployUnit']);
    }

    case SubPhase.Move: {
      const actions = new Set<string>();
      if (aliveUnits.some(canUnitMove)) {
        actions.add('moveModel');
        actions.add('embark');
      }
      if (aliveUnits.some(canUnitRush)) {
        actions.add('rushUnit');
      }
      if (aliveUnits.some(unit => unit.embarkedOnId !== null)) {
        actions.add('disembark');
      }
      return filterValidCommands(valid, [...actions]);
    }

    case SubPhase.Attack: {
      if (state.shootingAttackState) {
        return filterValidCommands(valid, [
          'resolveShootingCasualties',
          'selectTargetModel',
          'placeBlastMarker',
        ]);
      }
      if (!aliveUnits.some(canUnitShoot)) return [];
      return filterValidCommands(valid, ['declareShooting']);
    }

    case SubPhase.Charge: {
      if (!aliveUnits.some(canUnitCharge)) return [];
      return filterValidCommands(valid, ['declareCharge']);
    }

    case SubPhase.Challenge:
      if (!hasUnresolvedCombat) return [];
      return filterValidCommands(valid, [
        'declareChallenge',
        'acceptChallenge',
        'declineChallenge',
        'selectGambit',
      ]);

    case SubPhase.Fight:
      if (!hasUnresolvedCombat) return [];
      return filterValidCommands(valid, ['resolveFight', 'declareWeapons']);

    case SubPhase.Resolution:
      if (!hasUnresolvedCombat) return [];
      return filterValidCommands(valid, ['selectAftermath']);

    default:
      return [];
  }
}

export function getPhaseUxStatus(state: GameState): PhaseUxStatus {
  const mode = SUB_PHASE_MODES[state.currentSubPhase];

  if (state.isGameOver) {
    return {
      mode,
      state: 'blocked',
      blocker: 'gameOver',
      canAutoAdvance: false,
      isDecisionPoint: false,
      tacticalActions: [],
      message: 'Game is over.',
    };
  }

  if (state.awaitingReaction) {
    return {
      mode,
      state: 'blocked',
      blocker: 'reactionPending',
      canAutoAdvance: false,
      isDecisionPoint: true,
      tacticalActions: ['selectReaction', 'declineReaction'],
      message: 'Reaction decision is pending.',
    };
  }

  const tacticalActions = getTacticalActionsForCurrentSubPhase(state);
  const isDecisionPoint = tacticalActions.length > 0;

  if (isDecisionPoint) {
    return {
      mode,
      state: 'decision',
      blocker: 'tacticalActions',
      canAutoAdvance: false,
      isDecisionPoint: true,
      tacticalActions,
      message: `${tacticalActions.length} tactical action${tacticalActions.length === 1 ? '' : 's'} available.`,
    };
  }

  return {
    mode,
    state: 'auto',
    blocker: 'none',
    canAutoAdvance: true,
    isDecisionPoint: false,
    tacticalActions: [],
    message: 'No tactical actions pending. Safe to advance.',
  };
}
