/**
 * Engine-internal types
 * These are types used within the engine package only,
 * not exported through @hh/types.
 */

import type {
  GameState,
  Position,
  ShootingFireGroup,
  ReserveEntryMethod,
} from '@hh/types';
import { Phase, SubPhase, TacticalStatus, VehicleFacing, SecondaryObjectiveType } from '@hh/types';

// ─── Dice Provider ───────────────────────────────────────────────────────────

/**
 * Interface for dice rolling — injectable for deterministic tests.
 */
export interface DiceProvider {
  /** Roll a single d6 (returns 1-6) */
  rollD6(): number;
  /** Roll multiple d6 and return the results */
  rollMultipleD6(count: number): number[];
  /** Roll 2d6, returning both values */
  roll2D6(): [number, number];
  /** Roll a d3 (returns 1-3) */
  rollD3(): number;
  /** Roll a scatter die and distance */
  rollScatter(): { direction: number; distance: number };
}

// ─── Validation Error ────────────────────────────────────────────────────────

/**
 * A validation error describing why a command was rejected.
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Optional context data */
  context?: Record<string, unknown>;
}

// ─── Game Events ─────────────────────────────────────────────────────────────

/**
 * Events emitted by the engine after processing a command.
 * Used by the UI for animation, logging, and state display.
 */
export type GameEvent =
  | ModelMovedEvent
  | UnitRushedEvent
  | ReservesTestEvent
  | ReservesEntryEvent
  | DangerousTerrainTestEvent
  | RoutMoveEvent
  | EmbarkEvent
  | DisembarkEvent
  | EmergencyDisembarkEvent
  | RepositionTriggeredEvent
  | RepositionExecutedEvent
  | PhaseAdvancedEvent
  | SubPhaseAdvancedEvent
  | PlayerTurnAdvancedEvent
  | BattleTurnAdvancedEvent
  | StatusAppliedEvent
  | StatusRemovedEvent
  | LeadershipCheckEvent
  | CoolCheckEvent
  | RepairTestEvent
  | UnitDestroyedEvent
  | GameOverEvent
  // Shooting Phase Events
  | ShootingAttackDeclaredEvent
  | FireGroupResolvedEvent
  | HitTestRollEvent
  | WoundTestRollEvent
  | ArmourPenetrationRollEvent
  | SavingThrowRollEvent
  | DamageMitigationRollEvent
  | DamageAppliedEvent
  | VehicleDamageRollEvent
  | CasualtyRemovedEvent
  | ReturnFireTriggeredEvent
  | BlastMarkerPlacedEvent
  | TemplatePlacedEvent
  | ScatterRollEvent
  | DeflagrateHitsEvent
  | GetsHotEvent
  | PanicCheckEvent
  | StatusCheckEvent
  // Assault Phase Events
  | ChargeDeclaredEvent
  | SetupMoveEvent
  | VolleyAttackEvent
  | ChargeRollEvent
  | ChargeFailedEvent
  | ChargeSucceededEvent
  | ChargeMoveEvent
  | ChallengeDeclaredEvent
  | ChallengeDeclinedEvent
  | DisgracedAppliedEvent
  | GambitSelectedEvent
  | FocusRollEvent
  | ChallengeStrikeEvent
  | ChallengeGloryEvent
  | CombatDeclaredEvent
  | InitiativeStepResolvedEvent
  | MeleeHitTestRollEvent
  | MeleeWoundTestRollEvent
  | PileInMoveEvent
  | CombatResolutionEvent
  | AftermathSelectedEvent
  | PursueRollEvent
  | ConsolidateMoveEvent
  | DisengageMoveEvent
  | GunDownEvent
  | AssaultFallBackEvent
  | OverwatchTriggeredEvent
  | OverwatchResolvedEvent
  // Advanced Reaction Events
  | AdvancedReactionDeclaredEvent
  | AdvancedReactionResolvedEvent
  // Mission / Victory Events
  | ObjectiveScoredEvent
  | SecondaryAchievedEvent
  | CounterOffensiveActivatedEvent
  | SeizeTheInitiativeEvent
  | WindowOfOpportunityEvent
  | SuddenDeathEvent
  // Command Events
  | TargetModelSelectedEvent
  | TerrainPlacedEvent
  | TerrainRemovedEvent
  | WargearOptionSelectedEvent
  | WeaponsDeclaredEvent;

export interface ModelMovedEvent {
  type: 'modelMoved';
  modelId: string;
  unitId: string;
  fromPosition: Position;
  toPosition: Position;
  distanceMoved: number;
}

export interface UnitRushedEvent {
  type: 'unitRushed';
  unitId: string;
  rushDistance: number;
}

export interface ReservesTestEvent {
  type: 'reservesTest';
  unitId: string;
  roll: number;
  targetNumber: number;
  passed: boolean;
}

export interface ReservesEntryEvent {
  type: 'reservesEntry';
  unitId: string;
  entryMethod: ReserveEntryMethod;
  modelPositions: { modelId: string; position: Position }[];
}

export interface DangerousTerrainTestEvent {
  type: 'dangerousTerrainTest';
  modelId: string;
  unitId: string;
  roll: number;
  passed: boolean;
  woundsCaused: number;
}

export interface RoutMoveEvent {
  type: 'routMove';
  unitId: string;
  distanceRolled: number;
  modelMoves: { modelId: string; from: Position; to: Position }[];
  reachedEdge: boolean;
}

export interface EmbarkEvent {
  type: 'embark';
  unitId: string;
  transportId: string;
}

export interface DisembarkEvent {
  type: 'disembark';
  unitId: string;
  transportId: string;
  modelPositions: { modelId: string; position: Position }[];
}

export interface EmergencyDisembarkEvent {
  type: 'emergencyDisembark';
  unitId: string;
  transportId: string;
  coolCheckPassed: boolean;
}

export interface RepositionTriggeredEvent {
  type: 'repositionTriggered';
  triggerUnitId: string;
  eligibleUnitIds: string[];
}

export interface RepositionExecutedEvent {
  type: 'repositionExecuted';
  reactingUnitId: string;
  modelMoves: { modelId: string; from: Position; to: Position }[];
}

export interface PhaseAdvancedEvent {
  type: 'phaseAdvanced';
  fromPhase: Phase;
  toPhase: Phase;
}

export interface SubPhaseAdvancedEvent {
  type: 'subPhaseAdvanced';
  phase: Phase;
  fromSubPhase: SubPhase;
  toSubPhase: SubPhase;
}

export interface PlayerTurnAdvancedEvent {
  type: 'playerTurnAdvanced';
  newActivePlayerIndex: number;
}

export interface BattleTurnAdvancedEvent {
  type: 'battleTurnAdvanced';
  newBattleTurn: number;
}

export interface StatusAppliedEvent {
  type: 'statusApplied';
  unitId: string;
  status: TacticalStatus;
}

export interface StatusRemovedEvent {
  type: 'statusRemoved';
  unitId: string;
  status: TacticalStatus;
}

export interface LeadershipCheckEvent {
  type: 'leadershipCheck';
  unitId: string;
  roll: number;
  target: number;
  passed: boolean;
}

export interface CoolCheckEvent {
  type: 'coolCheck';
  unitId: string;
  roll: number;
  target: number;
  passed: boolean;
}

export interface RepairTestEvent {
  type: 'repairTest';
  unitId: string;
  roll: number;
  target: number;
  passed: boolean;
}

export interface UnitDestroyedEvent {
  type: 'unitDestroyed';
  unitId: string;
  reason: string;
}

export interface GameOverEvent {
  type: 'gameOver';
  winnerPlayerIndex: number | null;
  reason: string;
}

// ─── Shooting Phase Events ───────────────────────────────────────────────────

export interface ShootingAttackDeclaredEvent {
  type: 'shootingAttackDeclared';
  attackerUnitId: string;
  targetUnitId: string;
  fireGroupCount: number;
  fireGroups: ShootingFireGroup[];
}

export interface FireGroupResolvedEvent {
  type: 'fireGroupResolved';
  fireGroupIndex: number;
  weaponName: string;
  totalHits: number;
  totalWounds: number;
  totalPenetrating: number;
  totalGlancing: number;
}

export interface HitTestRollEvent {
  type: 'hitTestRoll';
  fireGroupIndex: number;
  rolls: number[];
  targetNumber: number;
  isSnapShot: boolean;
  hits: number;
  misses: number;
  criticals: number;
  precisionHits: number;
  rendingHits: number;
}

export interface WoundTestRollEvent {
  type: 'woundTestRoll';
  fireGroupIndex: number;
  rolls: number[];
  targetNumber: number;
  strength: number;
  toughness: number;
  wounds: number;
  failures: number;
  breachingWounds: number;
  shredWounds: number;
}

export interface ArmourPenetrationRollEvent {
  type: 'armourPenetrationRoll';
  fireGroupIndex: number;
  rolls: number[];
  strength: number;
  armourValue: number;
  facing: VehicleFacing;
  penetrating: number;
  glancing: number;
  misses: number;
}

export interface SavingThrowRollEvent {
  type: 'savingThrowRoll';
  modelId: string;
  saveType: 'armour' | 'invulnerable' | 'cover';
  roll: number;
  targetNumber: number;
  passed: boolean;
  weaponAP: number | null;
}

export interface DamageMitigationRollEvent {
  type: 'damageMitigationRoll';
  modelId: string;
  mitigationType: string;
  roll: number;
  targetNumber: number;
  passed: boolean;
}

export interface DamageAppliedEvent {
  type: 'damageApplied';
  modelId: string;
  unitId: string;
  woundsLost: number;
  remainingWounds: number;
  destroyed: boolean;
  damageSource: string;
}

export interface VehicleDamageRollEvent {
  type: 'vehicleDamageRoll';
  modelId: string;
  unitId: string;
  roll: number;
  result: 'stunned' | 'pinned' | 'suppressed';
  statusApplied: boolean;
  hullPointLost: boolean;
}

export interface CasualtyRemovedEvent {
  type: 'casualtyRemoved';
  modelId: string;
  unitId: string;
}

export interface ReturnFireTriggeredEvent {
  type: 'returnFireTriggered';
  targetUnitId: string;
  eligibleUnitIds: string[];
}

export interface BlastMarkerPlacedEvent {
  type: 'blastMarkerPlaced';
  center: Position;
  radius: number;
  modelsHit: string[];
  scattered: boolean;
  scatterDistance?: number;
  scatterAngle?: number;
}

export interface TemplatePlacedEvent {
  type: 'templatePlaced';
  origin: Position;
  modelsHit: string[];
}

export interface ScatterRollEvent {
  type: 'scatterRoll';
  diceRoll: number;
  angle: number;
  distance: number;
  isHit: boolean;
  originalPosition: Position;
  finalPosition: Position;
}

export interface DeflagrateHitsEvent {
  type: 'deflagrateHits';
  sourceFireGroupIndex: number;
  additionalHits: number;
  strength: number;
}

export interface GetsHotEvent {
  type: 'getsHot';
  modelId: string;
  unitId: string;
  woundsCaused: number;
}

export interface PanicCheckEvent {
  type: 'panicCheck';
  unitId: string;
  roll: number;
  target: number;
  modifier: number;
  passed: boolean;
  casualtiesCount: number;
  unitSizeAtStart: number;
}

export interface StatusCheckEvent {
  type: 'statusCheck';
  unitId: string;
  checkType: 'pinning' | 'suppressive' | 'stun' | 'panicRule';
  roll: number;
  target: number;
  modifier: number;
  passed: boolean;
  statusApplied?: TacticalStatus;
}

// ─── Assault Phase Events ────────────────────────────────────────────────

export interface ChargeDeclaredEvent {
  type: 'chargeDeclared';
  chargingUnitId: string;
  targetUnitId: string;
  isDisordered: boolean;
}

export interface SetupMoveEvent {
  type: 'setupMove';
  chargingUnitId: string;
  targetUnitId: string;
  modelId: string;
  from: Position;
  to: Position;
  distance: number;
}

export interface VolleyAttackEvent {
  type: 'volleyAttack';
  attackerUnitId: string;
  targetUnitId: string;
  isSnapShot: boolean;
  attackerModelCount: number;
  targetModelCount: number;
}

export interface ChargeRollEvent {
  type: 'chargeRoll';
  chargingUnitId: string;
  targetUnitId: string;
  diceValues: [number, number];
  chargeRoll: number;
  discardedDie: number;
  distanceNeeded: number;
}

export interface ChargeFailedEvent {
  type: 'chargeFailed';
  chargingUnitId: string;
  targetUnitId: string;
  chargeRoll: number;
  distanceNeeded: number;
}

export interface ChargeSucceededEvent {
  type: 'chargeSucceeded';
  chargingUnitId: string;
  targetUnitId: string;
  chargeRoll: number;
  distanceNeeded: number;
}

export interface ChargeMoveEvent {
  type: 'chargeMove';
  chargingUnitId: string;
  targetUnitId: string;
  modelId: string;
  from: Position;
  to: Position;
}

export interface ChallengeDeclaredEvent {
  type: 'challengeDeclared';
  challengerModelId: string;
  challengerUnitId: string;
  targetModelId: string;
  targetUnitId: string;
  challengerPlayerIndex: number;
}

export interface ChallengeDeclinedEvent {
  type: 'challengeDeclined';
  challengerModelId: string;
  decliningUnitId: string;
  disgracedModelId: string | null;
}

export interface DisgracedAppliedEvent {
  type: 'disgracedApplied';
  modelId: string;
  unitId: string;
}

export interface GambitSelectedEvent {
  type: 'gambitSelected';
  modelId: string;
  gambit: string;
}

export interface FocusRollEvent {
  type: 'focusRoll';
  challengerRoll: number;
  challengedRoll: number;
  advantagePlayerIndex: number | null;
  isTie: boolean;
}

export interface ChallengeStrikeEvent {
  type: 'challengeStrike';
  challengerModelId: string;
  challengedModelId: string;
  challengerWoundsInflicted: number;
  challengedWoundsInflicted: number;
  modelSlain: boolean;
  slainModelId: string | null;
}

export interface ChallengeGloryEvent {
  type: 'challengeGlory';
  challengerCRP: number;
  challengedCRP: number;
  winnerPlayerIndex: number | null;
}

export interface CombatDeclaredEvent {
  type: 'combatDeclared';
  combatId: string;
  activePlayerUnitIds: string[];
  reactivePlayerUnitIds: string[];
}

export interface InitiativeStepResolvedEvent {
  type: 'initiativeStepResolved';
  combatId: string;
  initiativeValue: number;
  activePlayerCasualties: number;
  reactivePlayerCasualties: number;
}

export interface MeleeHitTestRollEvent {
  type: 'meleeHitTestRoll';
  strikeGroupIndex: number;
  rolls: number[];
  targetNumber: number;
  attackerWS: number;
  defenderWS: number;
  hits: number;
  misses: number;
}

export interface MeleeWoundTestRollEvent {
  type: 'meleeWoundTestRoll';
  strikeGroupIndex: number;
  rolls: number[];
  targetNumber: number;
  strength: number;
  toughness: number;
  wounds: number;
  failures: number;
}

export interface PileInMoveEvent {
  type: 'pileInMove';
  modelId: string;
  unitId: string;
  from: Position;
  to: Position;
  distance: number;
}

export interface CombatResolutionEvent {
  type: 'combatResolution';
  combatId: string;
  activePlayerCRP: number;
  reactivePlayerCRP: number;
  winnerPlayerIndex: number | null;
  crpDifference: number;
}

export interface AftermathSelectedEvent {
  type: 'aftermathSelected';
  unitId: string;
  option: string;
}

export interface PursueRollEvent {
  type: 'pursueRoll';
  unitId: string;
  roll: number;
  pursueDistance: number;
  caughtEnemy: boolean;
}

export interface ConsolidateMoveEvent {
  type: 'consolidateMove';
  unitId: string;
  modelMoves: { modelId: string; from: Position; to: Position }[];
}

export interface DisengageMoveEvent {
  type: 'disengageMove';
  unitId: string;
  modelMoves: { modelId: string; from: Position; to: Position }[];
}

export interface GunDownEvent {
  type: 'gunDown';
  firingUnitId: string;
  targetUnitId: string;
  hits: number;
  wounds: number;
  casualties: string[];
}

export interface AssaultFallBackEvent {
  type: 'assaultFallBack';
  unitId: string;
  distance: number;
  modelMoves: { modelId: string; from: Position; to: Position }[];
}

export interface OverwatchTriggeredEvent {
  type: 'overwatchTriggered';
  targetUnitId: string;
  chargingUnitId: string;
  eligibleUnitIds: string[];
}

export interface OverwatchResolvedEvent {
  type: 'overwatchResolved';
  reactingUnitId: string;
  chargingUnitId: string;
  accepted: boolean;
}

// ─── Advanced Reaction Events ───────────────────────────────────────────

export interface AdvancedReactionDeclaredEvent {
  type: 'advancedReactionDeclared';
  reactionId: string;
  reactionName: string;
  reactingUnitId: string;
  triggerSourceUnitId: string;
  playerIndex: number;
}

export interface AdvancedReactionResolvedEvent {
  type: 'advancedReactionResolved';
  reactionId: string;
  reactionName: string;
  reactingUnitId: string;
  triggerSourceUnitId: string;
  success: boolean;
  effectsSummary: string[];
}

// ─── Mission / Victory Events ────────────────────────────────────────────────

export interface ObjectiveScoredEvent {
  type: 'objectiveScored';
  objectiveId: string;
  playerIndex: number;
  vpScored: number;
  objectiveLabel: string;
}

export interface SecondaryAchievedEvent {
  type: 'secondaryAchieved';
  secondaryType: SecondaryObjectiveType;
  playerIndex: number;
  vpScored: number;
}

export interface CounterOffensiveActivatedEvent {
  type: 'counterOffensiveActivated';
  playerIndex: number;
  originalVP: number;
  doubledVP: number;
}

export interface SeizeTheInitiativeEvent {
  type: 'seizeTheInitiative';
  playerIndex: number;
  roll: number;
  target: number;
  success: boolean;
}

export interface WindowOfOpportunityEvent {
  type: 'windowOfOpportunity';
  objectiveId: string;
  previousValue: number;
  newValue: number;
  removed: boolean;
}

export interface SuddenDeathEvent {
  type: 'suddenDeath';
  survivingPlayerIndex: number;
  bonusVP: number;
}

// ─── Command Result ──────────────────────────────────────────────────────────

/**
 * Result of processing a game command through the engine.
 */
export interface CommandResult {
  /** The new game state after processing the command */
  state: GameState;
  /** Events emitted during processing (for UI animation/logging) */
  events: GameEvent[];
  /** Validation errors if the command was rejected */
  errors: ValidationError[];
  /** Whether the command was accepted and applied */
  accepted: boolean;
}

// ─── Phase State ─────────────────────────────────────────────────────────────

/**
 * Combined phase + sub-phase for the state machine transition table.
 */
export interface PhaseState {
  phase: Phase;
  subPhase: SubPhase;
}

// ─── Command Events ──────────────────────────────────────────────────────────

export interface TargetModelSelectedEvent {
  type: 'targetModelSelected';
  modelId: string;
  unitId: string;
}

export interface TerrainPlacedEvent {
  type: 'terrainPlaced';
  terrainId: string;
  terrainName: string;
  terrainType: string;
}

export interface TerrainRemovedEvent {
  type: 'terrainRemoved';
  terrainId: string;
  terrainName: string;
}

export interface WargearOptionSelectedEvent {
  type: 'wargearOptionSelected';
  unitId: string;
  modelId: string;
  optionIndex: number;
}

export interface WeaponsDeclaredEvent {
  type: 'weaponsDeclared';
  selections: { modelId: string; weaponId: string }[];
}
