// @hh/data — JSON unit/weapon/wargear files + validators

export {
  SPECIAL_RULES,
  findSpecialRule,
  getSpecialRulesByHook,
  getSpecialRulesByCategory,
} from './special-rules';

export {
  BOLT_WEAPONS,
  COMBI_WEAPONS,
  CONVERSION_BEAM_WEAPONS,
  DISINTEGRATOR_WEAPONS,
  FLAME_WEAPONS,
  GRAVITON_WEAPONS,
  LAS_WEAPONS,
  MELTA_WEAPONS,
  MISSILE_WEAPONS,
  PLASMA_WEAPONS,
  VOLKITE_WEAPONS,
  AUTOCANNON_WEAPONS,
  BATTLECANNON_WEAPONS,
  GRENADE_WEAPONS,
  CHAIN_WEAPONS,
  FORCE_WEAPONS,
  POWER_WEAPONS,
  BASIC_MELEE,
  DREADNOUGHT_MELEE,
  RANGED_WEAPONS,
  MELEE_WEAPONS,
  ALL_WEAPONS,
  findWeapon,
  findWeaponByName,
  isRangedWeapon,
  isMeleeWeapon,
} from './weapons';

export {
  parseDatasheets,
  indexUnitsById,
  findUnitByName,
} from './units';

export type {
  ParsedUnit,
  ParsedComposition,
  ParsedModelStats,
  ParsedTypeEntry,
  ParsedDedicatedWeapon,
  ParsedWeaponProfile,
} from './units';

export {
  PSYCHIC_DISCIPLINES,
  PSYCHIC_WEAPON_PROFILES,
  getDisciplineIds,
  findDiscipline,
  findDisciplineByName,
  getPsychicWeaponProfile,
  isPsychicMeleeWeapon,
  isPsychicRangedWeapon,
} from './psychic-disciplines';

export {
  DARK_ANGELS_WEAPONS,
  EMPERORS_CHILDREN_WEAPONS,
  IRON_WARRIORS_WEAPONS,
  WHITE_SCARS_WEAPONS,
  SPACE_WOLVES_WEAPONS,
  IMPERIAL_FISTS_WEAPONS,
  NIGHT_LORDS_WEAPONS,
  BLOOD_ANGELS_WEAPONS,
  IRON_HANDS_WEAPONS,
  WORLD_EATERS_WEAPONS,
  ULTRAMARINES_WEAPONS,
  DEATH_GUARD_WEAPONS,
  THOUSAND_SONS_WEAPONS,
  SONS_OF_HORUS_WEAPONS,
  WORD_BEARERS_WEAPONS,
  SALAMANDERS_WEAPONS,
  RAVEN_GUARD_WEAPONS,
  ALPHA_LEGION_WEAPONS,
  ALL_LEGION_WEAPONS,
  findLegionWeapon,
  findLegionWeaponByName,
} from './legion-weapons';

export {
  LEGION_TACTICAS,
  LEGION_TACTICA_EFFECTS,
  findLegionTactica,
  getLegionTacticaEffects,
  getTacticaEffectsForLegion,
} from './legion-tacticas';

export {
  LEGION_ADVANCED_REACTIONS,
  findAdvancedReaction,
  getAdvancedReactionsForLegion,
} from './legion-advanced-reactions';

export {
  LEGION_GAMBITS,
  findLegionGambit,
  getLegionGambitsForLegion,
} from './legion-gambits';

export {
  RITES_OF_WAR,
  findRiteOfWar,
  getRitesForLegion,
} from './rites-of-war';

export {
  SEARCH_AND_DESTROY,
  HAMMER_AND_ANVIL,
  DAWN_OF_WAR,
  ALL_DEPLOYMENT_MAPS,
  findDeploymentMap,
  findDeploymentMapByType,
  HEART_OF_BATTLE,
  CRUCIBLE_OF_WAR,
  TAKE_AND_HOLD,
  ALL_MISSIONS,
  findMission,
  findMissionByName,
  STANDARD_BATTLEFIELD_WIDTH,
  STANDARD_BATTLEFIELD_HEIGHT,
  STANDARD_GAME_LENGTH,
  OBJECTIVE_CONTROL_RANGE,
  SUDDEN_DEATH_BONUS_VP,
  SEIZE_THE_INITIATIVE_TARGET,
  OBJECTIVE_EDGE_BUFFER,
  DEPLOYMENT_ENEMY_BUFFER,
} from './missions';

export type {
  DetachmentSlotTemplate,
  DetachmentTemplate,
} from './detachment-layouts';

export {
  CRUSADE_PRIMARY,
  WARLORD_DETACHMENT,
  LORD_OF_WAR_DETACHMENT,
  ALLIED_DETACHMENT,
  ARMOURED_FIST,
  TACTICAL_SUPPORT,
  ARMOURED_SUPPORT,
  HEAVY_SUPPORT,
  COMBAT_PIONEER,
  SHOCK_ASSAULT,
  FIRST_STRIKE,
  COMBAT_RETINUE,
  OFFICER_CADRE,
  ARMY_VANGUARD,
  ALL_DETACHMENT_TEMPLATES,
  AUXILIARY_TEMPLATES,
  APEX_TEMPLATES,
  findDetachmentTemplate,
  getAuxiliaryTemplates,
  getApexTemplates,
  buildRiteDetachmentTemplates,
} from './detachment-layouts';

export {
  convertParsedUnitToProfile,
  convertAllParsedUnits,
} from './profile-converter';

export {
  getAllProfiles,
  getProfileById,
  getProfilesByRole,
  getProfilesByFaction,
  getProfilesByFactionAndRole,
  searchProfiles,
  getProfileCount,
} from './profile-registry';

export {
  MVP_LEGIONS,
  getMvpLegions,
  isMvpLegion,
} from './mvp-scope';
