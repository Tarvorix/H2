// Movement Phase barrel export

export {
  validateModelMove,
  validateCoherencyAfterMove,
  computeTerrainPenalty,
  isInDangerousTerrain,
  pathCrossesImpassable,
  pathEntersExclusionZone,
  getEffectiveMovement,
  DIFFICULT_TERRAIN_PENALTY,
} from './movement-validator';

export {
  handleMoveModel,
  handleMoveUnit,
  handleRushUnit,
  handleDangerousTerrainTest,
  DEFAULT_MOVEMENT,
  DEFAULT_INITIATIVE as MOVE_DEFAULT_INITIATIVE,
} from './move-handler';

export {
  handleReservesTest,
  handleReservesEntry,
  RESERVES_TARGET_NUMBER,
  EDGE_BUFFER,
  DEEP_STRIKE_ENEMY_EXCLUSION,
  DEEP_STRIKE_EDGE_BUFFER,
} from './reserves-handler';

export {
  handleRoutSubPhase,
  computeFallBackDirection,
  computeFallBackDistance,
} from './rout-handler';

export {
  handleEmbark,
  handleDisembark,
  handleEmergencyDisembark,
  ACCESS_POINT_RANGE,
  DEFAULT_COOL as EMBARK_DEFAULT_COOL,
} from './embark-disembark-handler';

export {
  getTransportAccessDistanceAtPosition,
  getEmergencyDisembarkAnchorShape,
} from './transport-access';

export {
  checkRepositionTrigger,
  handleRepositionReaction,
  REPOSITION_TRIGGER_RANGE,
  REPOSITION_DEFAULT_INITIATIVE,
} from './reposition-handler';
