import type { DiceProvider } from '@hh/engine';
import { RandomDiceProvider } from '@hh/engine';

/**
 * Step 7 deploy-armies roll-off:
 * the player who loses the roll-off deploys first and therefore takes turn 1.
 * Ties are re-rolled until there is a loser.
 */
export function rollDeploymentFirstPlayerIndex(dice: DiceProvider = new RandomDiceProvider()): 0 | 1 {
  for (;;) {
    const player0Roll = dice.rollD6();
    const player1Roll = dice.rollD6();

    if (player0Roll === player1Roll) {
      continue;
    }

    return player0Roll < player1Roll ? 0 : 1;
  }
}
