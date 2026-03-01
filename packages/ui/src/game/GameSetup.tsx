/**
 * GameSetup — Pre-game setup orchestrator
 *
 * Manages the pre-game flow:
 * 1. Army Load — select/load armies for both players
 * 2. Terrain Setup — place terrain on the battlefield
 * 3. Deployment — place units in deployment zones
 *
 * Each screen transitions to the next via the GameUIPhase.
 */

import type { GameUIState, GameUIAction } from './types';
import { GameUIPhase } from './types';
import { ArmyBuilderScreen } from './screens/ArmyBuilderScreen';
import { ArmyLoadScreen } from './screens/ArmyLoadScreen';
import { MissionSelectScreen } from './screens/MissionSelectScreen';
import { TerrainSetupScreen } from './screens/TerrainSetupScreen';
import { ObjectivePlacementScreen } from './screens/ObjectivePlacementScreen';
import { DeploymentScreen } from './screens/DeploymentScreen';

interface GameSetupProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

export function GameSetup({ state, dispatch, onReturnToMenu }: GameSetupProps) {
  switch (state.uiPhase) {
    case GameUIPhase.ArmyBuilder:
      return (
        <ArmyBuilderScreen
          state={state}
          dispatch={dispatch}
          onReturnToMenu={onReturnToMenu}
        />
      );

    case GameUIPhase.ArmyLoad:
      return (
        <ArmyLoadScreen
          state={state}
          dispatch={dispatch}
          onReturnToMenu={onReturnToMenu}
        />
      );

    case GameUIPhase.MissionSelect:
      return (
        <MissionSelectScreen
          state={state}
          dispatch={dispatch}
          onReturnToMenu={onReturnToMenu}
        />
      );

    case GameUIPhase.TerrainSetup:
      return (
        <TerrainSetupScreen
          state={state}
          dispatch={dispatch}
          onReturnToMenu={onReturnToMenu}
        />
      );

    case GameUIPhase.ObjectivePlacement:
      return (
        <ObjectivePlacementScreen
          state={state}
          dispatch={dispatch}
          onReturnToMenu={onReturnToMenu}
        />
      );

    case GameUIPhase.Deployment:
      return (
        <DeploymentScreen
          state={state}
          dispatch={dispatch}
          onReturnToMenu={onReturnToMenu}
        />
      );

    default:
      return null;
  }
}
