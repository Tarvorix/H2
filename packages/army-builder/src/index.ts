// @hh/army-builder — Force org validation, points calculation

// Points Calculation
export {
  calculateUnitPoints,
  calculateArmyTotalPoints,
  isOverPointsLimit,
  calculateLordOfWarCap,
  getLordOfWarAndWarlordPoints,
  isOverLordOfWarCap,
  getAlliedPointsCap,
  getAlliedPoints,
  isOverAlliedCap,
} from './points';

// Detachment Management
export {
  createDetachment,
  createSlotsFromTemplate,
  getUnlockedAuxiliaryCount,
  getUnlockedApexCount,
  getFilledSlotCount,
  canFillSlot,
  validateUnitAssignmentToSlot,
  addUnitToDetachment,
  removeUnitFromDetachment,
  areMandatorySlotsFilled,
  getOpenSlotCount,
  isWarlordDetachmentAllowed,
  getAvailableRoles,
} from './detachments';

// Army Validation
export {
  validateArmyList,
  validateArmyListWithDoctrine,
  validatePrimaryDetachment,
  validatePointsLimit,
  validateLordOfWarCap,
  validateWarlordPointsThreshold,
  validateAlliedDetachment,
  validateMandatorySlots,
  validateDetachmentCounts,
  validateUnitEligibility,
  validateWarlordDesignation,
  validatePlayableFactionScope,
  validateUnitProfilesExist,
  validateDoctrineConstraints,
} from './validation';

// Rite of War Enforcement
export {
  isRiteAvailable,
  validateRiteOfWarRestrictions,
  getRiteDetachmentTemplates,
  getRiteDetachmentTemplatesById,
  filterUnitsForRite,
} from './rite-enforcement';

// Serialization
export {
  exportArmyList,
  importArmyList,
  validateArmyListStructure,
  ARMY_LIST_SCHEMA_VERSION,
} from './serialization';
