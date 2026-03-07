/**
 * Runtime game state types.
 * These represent the live state of a battle in progress.
 */

import type {
  TacticalStatus,
  Phase,
  SubPhase,
  Allegiance,
  ArmyFaction,
  LegionFaction,
  TerrainType,
  CoreReaction,
} from './enums';
import { VehicleFacing } from './enums';
import type {
  AdvancedReactionUsage,
  LegionTacticaState,
} from './legion-rules';
import type { ArmyDoctrine } from './army-building';
import type { MissionState } from './mission-types';

// ─── Spatial Types ────────────────────────────────────────────────────────────

/**
 * A 2D position on the continuous battlefield plane.
 * Coordinates are in inches (floating-point).
 */
export interface Position {
  /** X coordinate in inches */
  x: number;
  /** Y coordinate in inches */
  y: number;
}

/**
 * Battlefield dimensions.
 * Standard is 72" x 48" (6' x 4').
 */
export interface BattlefieldDimensions {
  /** Width in inches (default 72) */
  width: number;
  /** Height/depth in inches (default 48) */
  height: number;
}

// ─── Terrain State ────────────────────────────────────────────────────────────

/**
 * A terrain piece placed on the battlefield.
 */
export interface TerrainPiece {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Terrain type (affects LOS, movement, cover) */
  type: TerrainType;
  /**
   * Shape of the terrain piece.
   * Polygons defined as arrays of vertices (Position points).
   * Circles defined by center + radius.
   */
  shape: TerrainShape;
  /** Whether this terrain also counts as Difficult */
  isDifficult: boolean;
  /** Whether this terrain also counts as Dangerous */
  isDangerous: boolean;
}

export type TerrainShape =
  | { kind: 'polygon'; vertices: Position[] }
  | { kind: 'circle'; center: Position; radius: number }
  | { kind: 'rectangle'; topLeft: Position; width: number; height: number };

// ─── Model State ──────────────────────────────────────────────────────────────

/**
 * Runtime state of a single model on the battlefield.
 * This tracks mutable state that changes during the game.
 */
export interface ModelState {
  /** Unique instance identifier (per-game, not per-profile) */
  id: string;
  /** Reference to the model definition within its UnitProfile */
  profileModelName: string;
  /** Reference to the parent unit's profile ID */
  unitProfileId: string;
  /** Current position on the battlefield */
  position: Position;
  /** Facing/orientation in radians for models measured by hull footprint */
  rotationRadians?: number;
  /** Current wounds remaining (or Hull Points for vehicles) */
  currentWounds: number;
  /** Whether this model has been removed as a casualty */
  isDestroyed: boolean;
  /**
   * Active characteristic modifiers currently applied to this model.
   * Tracked here for per-model effects (most modifiers are per-unit).
   */
  modifiers: CharacteristicModifier[];
  /** Current wargear (after any option selections) — weapon IDs */
  equippedWargear: string[];
  /** Whether this model is the unit's warlord */
  isWarlord: boolean;
}

/**
 * A temporary modifier to a characteristic.
 */
export interface CharacteristicModifier {
  /** Which characteristic is modified */
  characteristic: string;
  /** The operation */
  operation: 'add' | 'subtract' | 'multiply' | 'set';
  /** The value */
  value: number;
  /** Source of the modifier (rule name, weapon, etc.) */
  source: string;
  /** When this modifier expires */
  expiresAt: ModifierExpiry;
}

export type ModifierExpiry =
  | { type: 'endOfPhase'; phase: Phase }
  | { type: 'endOfSubPhase'; subPhase: SubPhase }
  | { type: 'endOfPlayerTurn' }
  | { type: 'endOfBattleTurn' }
  | { type: 'endOfBattle' }
  | { type: 'manual' };

// ─── Unit State ───────────────────────────────────────────────────────────────

/**
 * Runtime state of a unit on the battlefield.
 */
export interface UnitState {
  /** Unique instance identifier */
  id: string;
  /** Reference to the UnitProfile this unit was built from */
  profileId: string;
  /** All models in this unit */
  models: ModelState[];
  /** Current tactical statuses applied to this unit */
  statuses: TacticalStatus[];
  /** Whether this unit has reacted during the current Player Turn */
  hasReactedThisTurn: boolean;
  /** Whether this unit has already made a normal Shooting Attack this Player Turn */
  hasShotThisTurn?: boolean;
  /** Movement state for current turn */
  movementState: UnitMovementState;
  /** Whether this unit is locked in combat */
  isLockedInCombat: boolean;
  /** ID of the transport this unit is embarked on (null if not embarked) */
  embarkedOnId: string | null;
  /** Whether this unit is in reserves */
  isInReserves: boolean;
  /** Whether this unit has been placed on the battlefield yet */
  isDeployed: boolean;
  /** IDs of enemy units this unit is currently locked in combat with */
  engagedWithUnitIds: string[];
  /** Unit-level characteristic modifiers */
  modifiers: CharacteristicModifier[];
  /** Original legion lineage for doctrine/legion-rule lookups. */
  originLegion?: LegionFaction;
}

export enum UnitMovementState {
  /** Has not moved this turn */
  Stationary = 'Stationary',
  /** Made a normal move */
  Moved = 'Moved',
  /** Made a Rush (double move) */
  Rushed = 'Rushed',
  /** Entered from reserves this turn */
  EnteredFromReserves = 'EnteredFromReserves',
  /** Fell back (routed) */
  FellBack = 'FellBack',
}

// ─── Army State ───────────────────────────────────────────────────────────────

/**
 * Runtime state of a player's army.
 */
export interface ArmyState {
  /** Unique identifier for this army */
  id: string;
  /** Player index (0 or 1) */
  playerIndex: number;
  /** Display name (e.g., "Player 1 — Sons of Horus") */
  playerName: string;
  /** Faction */
  faction: ArmyFaction;
  /** Allegiance */
  allegiance: Allegiance;
  /** Faction doctrine payload selected in army building (if any). */
  doctrine?: ArmyDoctrine;
  /** All units in this army */
  units: UnitState[];
  /** Total points value of this army */
  totalPoints: number;
  /** Points limit for this battle */
  pointsLimit: number;
  /** Reaction allotment remaining for current Player Turn */
  reactionAllotmentRemaining: number;
  /** Base reaction allotment per Player Turn */
  baseReactionAllotment: number;
  /** Victory points scored */
  victoryPoints: number;
  /** Rite of War in use (if any) */
  riteOfWar?: string;
}

// ─── Dice & Combat Log ────────────────────────────────────────────────────────

/**
 * A single dice roll result.
 */
export interface DiceRoll {
  /** The value rolled (1-6) */
  value: number;
  /** Whether this die was re-rolled */
  wasRerolled: boolean;
  /** The value before re-roll (if re-rolled) */
  originalValue?: number;
}

/**
 * A complete roll event for the combat log.
 */
export interface RollEvent {
  /** Unique identifier */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Type of roll */
  type: RollType;
  /** The dice results */
  dice: DiceRoll[];
  /** Target number needed to succeed */
  targetNumber: number;
  /** Number of successes */
  successes: number;
  /** Number of failures */
  failures: number;
  /** Descriptive context */
  description: string;
  /** Source unit ID */
  sourceUnitId?: string;
  /** Target unit ID */
  targetUnitId?: string;
}

export type RollType =
  | 'hitTest'
  | 'woundTest'
  | 'armourPenetration'
  | 'savingThrow'
  | 'invulnerableSave'
  | 'coverSave'
  | 'damageMitigation'
  | 'leadershipCheck'
  | 'coolCheck'
  | 'willpowerCheck'
  | 'intelligenceCheck'
  | 'dangerousTerrainTest'
  | 'reservesTest'
  | 'chargeRoll'
  | 'scatterRoll'
  | 'focusRoll'
  | 'vehicleDamageTable'
  | 'repairTest'
  | 'perilsOfTheWarp';

// ─── Game State ───────────────────────────────────────────────────────────────

/**
 * The complete game state — the single source of truth.
 *
 * This is what the engine maintains and the UI renders.
 * All state changes go through the engine as commands; the UI never mutates this directly.
 */
export interface GameState {
  /** Unique game identifier */
  gameId: string;
  /** Battlefield dimensions */
  battlefield: BattlefieldDimensions;
  /** Terrain pieces on the battlefield */
  terrain: TerrainPiece[];
  /** The two armies */
  armies: [ArmyState, ArmyState];
  /** Current battle turn number (1-based, usually 1-4) */
  currentBattleTurn: number;
  /** Maximum number of battle turns */
  maxBattleTurns: number;
  /** Index of the player whose Player Turn it is (0 or 1) */
  activePlayerIndex: number;
  /** Index of the player who goes first each Battle Turn */
  firstPlayerIndex: number;
  /** Current phase */
  currentPhase: Phase;
  /** Current sub-phase */
  currentSubPhase: SubPhase;
  /** Whether the game is waiting for the reactive player to decide on a reaction */
  awaitingReaction: boolean;
  /** If awaiting a reaction, what type is being offered */
  pendingReaction?: PendingReaction;
  /** Whether the game has ended */
  isGameOver: boolean;
  /** Winner player index (null if draw or game not over) */
  winnerPlayerIndex: number | null;
  /** Full combat/dice log */
  log: RollEvent[];
  /** Game phase history for undo support */
  turnHistory: TurnHistoryEntry[];
  /** Active shooting attack state (present during shooting resolution) */
  shootingAttackState?: ShootingAttackState;
  /** Active assault attack state (present during charge resolution) */
  assaultAttackState?: AssaultAttackState;
  /** Active combats in the Fight/Resolution sub-phases */
  activeCombats?: AssaultCombatState[];
  /** Advanced reactions used this battle (once-per-battle tracking) */
  advancedReactionsUsed: AdvancedReactionUsage[];
  /** Legion tactica state — per-army, per-turn tracking (index matches armies[]) */
  legionTacticaState: [LegionTacticaState, LegionTacticaState];
  /** Mission state — objectives, scoring, special rules (null if no mission selected) */
  missionState: MissionState | null;
}

// ─── Assault Attack State ────────────────────────────────────────────────────

/**
 * State of an in-progress charge in the Assault Phase.
 * Stored in GameState.assaultAttackState during the Charge Sub-Phase.
 * Reference: HH_Rules_Battle.md — Charge Sub-Phase Steps 1-5
 */
export interface AssaultAttackState {
  /** ID of the charging unit */
  chargingUnitId: string;
  /** ID of the target unit */
  targetUnitId: string;
  /** Player index of the charger (active player) */
  chargerPlayerIndex: number;
  /** Current step in the charge procedure */
  chargeStep: AssaultChargeStep;
  /** Set-up move distance (from I+M table) */
  setupMoveDistance: number;
  /** Charge roll result (2d6, discard lowest) */
  chargeRoll: number;
  /** Whether this is a Disordered Charge */
  isDisordered: boolean;
  /** Whether the charge completed via set-up move base contact */
  chargeCompleteViaSetup: boolean;
  /** Whether Overwatch has been offered/resolved */
  overwatchResolved: boolean;
  /** Distance between closest models (for charge roll comparison) */
  closestDistance: number;
  /** IDs of models with LOS to target */
  modelsWithLOS: string[];
}

/**
 * Charge step tracking.
 */
export type AssaultChargeStep =
  | 'DECLARING'
  | 'CHECKING_RANGE'
  | 'SETUP_MOVE'
  | 'VOLLEY_ATTACKS'
  | 'AWAITING_OVERWATCH'
  | 'CHARGE_ROLL'
  | 'CHARGE_MOVE'
  | 'COMPLETE'
  | 'FAILED';

/**
 * State of an active combat during Fight/Resolution sub-phases.
 */
export interface AssaultCombatState {
  /** Unique combat identifier */
  combatId: string;
  /** Unit IDs on the active player's side */
  activePlayerUnitIds: string[];
  /** Unit IDs on the reactive player's side */
  reactivePlayerUnitIds: string[];
  /** Combat Resolution Points for active player's side */
  activePlayerCRP: number;
  /** Combat Resolution Points for reactive player's side */
  reactivePlayerCRP: number;
  /** Model IDs of casualties on the active player's side */
  activePlayerCasualties: string[];
  /** Model IDs of casualties on the reactive player's side */
  reactivePlayerCasualties: string[];
  /** Whether this combat has been fully resolved */
  resolved: boolean;
  /** Whether one side was completely wiped (massacre) */
  isMassacre: boolean;
  /** Challenge state if a challenge is active */
  challengeState: AssaultChallengeState | null;
  /** Melee weapon declarations per model for the fight step */
  weaponDeclarations?: { modelId: string; weaponId: string }[];
}

/**
 * State of a challenge within a combat.
 */
export interface AssaultChallengeState {
  /** Model ID of the challenger */
  challengerId: string;
  /** Model ID of the challenged */
  challengedId: string;
  /** Unit ID of the challenger's unit */
  challengerUnitId: string;
  /** Unit ID of the challenged's unit */
  challengedUnitId: string;
  /** Current step */
  currentStep: 'DECLARE' | 'FACE_OFF' | 'FOCUS' | 'STRIKE' | 'GLORY';
  /** Gambit selected by the challenger */
  challengerGambit: string | null;
  /** Gambit selected by the challenged */
  challengedGambit: string | null;
  /** Player index with Challenge Advantage */
  challengeAdvantagePlayerIndex: number | null;
  /** Wounds inflicted by each side */
  challengerWoundsInflicted: number;
  challengedWoundsInflicted: number;
  /** CRP earned */
  challengerCRP: number;
  challengedCRP: number;
  /** Current round (1-based) */
  round: number;
}

// ─── Shooting Attack State (imported into GameState) ─────────────────────────

/**
 * Complete state of an in-progress shooting attack.
 * Stored in GameState.shootingAttackState during resolution.
 * Reference: HH_Rules_Battle.md — Shooting Phase Steps 1-11
 */
export interface ShootingAttackState {
  /** ID of the attacking unit */
  attackerUnitId: string;
  /** ID of the target unit */
  targetUnitId: string;
  /** Player index of the attacker */
  attackerPlayerIndex: number;
  /** Vehicle facing being targeted (null for non-vehicles) */
  targetFacing: VehicleFacing | null;
  /** Weapon assignments from the declaration */
  weaponAssignments: ShootingWeaponAssignment[];
  /** All fire groups formed from the weapon assignments */
  fireGroups: ShootingFireGroup[];
  /** Index of the fire group currently being resolved */
  currentFireGroupIndex: number;
  /** Current step in the pipeline */
  currentStep: ShootingStepType;

  /** Accumulated glancing hits across all fire groups (for Step 11) */
  accumulatedGlancingHits: ShootingGlancingHit[];
  /** Model IDs of casualties set aside for removal in Step 11 */
  accumulatedCasualties: string[];
  /** Unit sizes at start of attack (for 25% panic threshold) */
  unitSizesAtStart: Record<string, number>;

  /** Pending morale checks to resolve after attack */
  pendingMoraleChecks: ShootingMoraleCheck[];

  /** Whether Return Fire has been offered/resolved */
  returnFireResolved: boolean;
  /** Whether this is a Return Fire reaction attack (applies restrictions) */
  isReturnFire: boolean;

  /** IDs of models with LOS to target (filtered in Step 2) */
  modelsWithLOS: string[];

  /** Pre-selected blast placements carried through paused shooting declarations. */
  blastPlacements?: BlastPlacement[];
  /** Pre-selected template placements carried through paused shooting declarations. */
  templatePlacements?: TemplatePlacement[];

  /** Blast marker position (for Blast weapons) */
  blastMarkerPosition?: Position;
  /** Whether blast scattered */
  blastScattered?: boolean;
  /** Models hit by blast/template */
  blastTemplateModelIds?: string[];
  /** Blast marker details (position, size, hit models) */
  blastMarker?: { position: Position; size: number; hitModelIds: string[] };
  /** Selected target model ID for directed hit allocation */
  selectedTargetModelId?: string;
}

/**
 * Shooting step types for tracking pipeline progress.
 */
export type ShootingStepType =
  | 'DECLARING'
  | 'RESOLVING_HITS'
  | 'RESOLVING_WOUNDS'
  | 'AWAITING_TARGET_SELECTION'
  | 'RESOLVING_SAVES'
  | 'NEXT_FIRE_GROUP'
  | 'AWAITING_RETURN_FIRE'
  | 'REMOVING_CASUALTIES'
  | 'COMPLETE';

/**
 * A weapon assignment in a shooting attack.
 */
export interface ShootingWeaponAssignment {
  modelId: string;
  weaponId: string;
  profileName?: string;
}

export interface BlastPlacement {
  /** Model IDs contributing to the blast fire group that uses this marker. */
  sourceModelIds: string[];
  /** Center position of the blast marker. */
  position: Position;
}

export interface TemplatePlacement {
  /** Model ID making the template attack. */
  sourceModelId: string;
  /** Direction the template points in radians. */
  directionRadians: number;
}

/**
 * A fire group in a shooting attack.
 */
export interface ShootingFireGroup {
  index: number;
  targetUnitId?: string;
  weaponName: string;
  profileName?: string;
  ballisticSkill: number;
  isSnapShot: boolean;
  totalFirepower: number;
  specialRules: { name: string; value?: string }[];
  traits: string[];
  weaponStrength: number;
  weaponAP: number | null;
  weaponDamage: number;
  weaponRange: number;
  hasTemplate: boolean;
  attacks: { modelId: string; firepower: number; ballisticSkill: number; isSnapShot: boolean }[];
  hits: ShootingHitResult[];
  wounds: ShootingWoundResult[];
  penetratingHits: ShootingPenetratingHit[];
  glancingHits: ShootingGlancingHit[];
  resolved: boolean;
  isPrecisionGroup: boolean;
  isDeflagrateGroup: boolean;
}

/**
 * Hit test result in a shooting attack.
 */
export interface ShootingHitResult {
  diceRoll: number;
  targetNumber: number;
  isHit: boolean;
  isCritical: boolean;
  isPrecision: boolean;
  isRending: boolean;
  isAutoHit: boolean;
  sourceModelId: string;
  weaponStrength: number;
  weaponAP: number | null;
  weaponDamage: number;
  specialRules: { name: string; value?: string }[];
}

/**
 * Wound test result in a shooting attack.
 */
export interface ShootingWoundResult {
  diceRoll: number;
  targetNumber: number;
  isWound: boolean;
  strength: number;
  ap: number | null;
  damage: number;
  isBreaching: boolean;
  isShred: boolean;
  isPoisoned: boolean;
  isCriticalWound: boolean;
  isRendingWound: boolean;
  isPrecision: boolean;
  specialRules: { name: string; value?: string }[];
  assignedToModelId?: string;
}

/**
 * Penetrating hit result against a vehicle.
 */
export interface ShootingPenetratingHit {
  diceRoll: number;
  strength: number;
  total: number;
  armourValue: number;
  facing: VehicleFacing;
  isPenetrating: boolean;
  damage: number;
  specialRules: { name: string; value?: string }[];
  assignedToModelId?: string;
}

/**
 * Glancing hit against a vehicle (set aside for Vehicle Damage Table).
 */
export interface ShootingGlancingHit {
  facing: VehicleFacing;
  vehicleModelId: string;
  vehicleUnitId: string;
}

/**
 * A pending morale check from shooting.
 */
export interface ShootingMoraleCheck {
  unitId: string;
  checkType: 'panic' | 'pinning' | 'suppressive' | 'stun' | 'panicRule' | 'coherency';
  modifier: number;
  source: string;
}

/**
 * Information about a pending reaction offer to the reactive player.
 */
export interface PendingReaction {
  /** Which reaction is available — core reaction or advanced reaction ID */
  reactionType: CoreReaction | string;
  /** Whether this is a legion-specific advanced reaction */
  isAdvancedReaction: boolean;
  /** Legion required for this reaction (for advanced reactions) */
  requiredLegion?: LegionFaction;
  /** Which units are eligible to react */
  eligibleUnitIds: string[];
  /** What triggered this reaction opportunity */
  triggerDescription: string;
  /** The unit/action that triggered the reaction */
  triggerSourceUnitId: string;
}

/**
 * A snapshot of state at the end of a phase/action for undo support.
 */
export interface TurnHistoryEntry {
  /** Battle turn number */
  battleTurn: number;
  /** Player turn (0 or 1) */
  playerTurn: number;
  /** Phase */
  phase: Phase;
  /** Sub-phase */
  subPhase: SubPhase;
  /** Description of the action */
  description: string;
  /** Serialized game state at this point */
  stateSnapshot: string;
}

// ─── Engine Commands ──────────────────────────────────────────────────────────

/**
 * Commands sent from the UI to the engine.
 * The engine validates and processes these, then returns an updated GameState.
 */
export type GameCommand =
  | MoveModelCommand
  | MoveUnitCommand
  | DeclareShootingCommand
  | ResolveShootingCasualtiesCommand
  | DeclareChargeCommand
  | DeclareChallengeCommand
  | AcceptChallengeCommand
  | DeclineChallengeCommand
  | SelectGambitCommand
  | SelectReactionCommand
  | DeclineReactionCommand
  | EndPhaseCommand
  | EndSubPhaseCommand
  | SelectTargetModelCommand
  | PlaceBlastMarkerCommand
  | PlaceTerrainCommand
  | RemoveTerrainCommand
  | DeployUnitCommand
  | ReservesTestCommand
  | RushUnitCommand
  | EmbarkCommand
  | DisembarkCommand
  | SelectWargearOptionCommand
  | DeclareWeaponsCommand
  | SelectAftermathCommand
  | ResolveFightCommand;

export interface MoveModelCommand {
  type: 'moveModel';
  modelId: string;
  targetPosition: Position;
}

export interface MoveUnitCommand {
  type: 'moveUnit';
  unitId: string;
  modelPositions: { modelId: string; position: Position }[];
  /** Whether this move is a Rush (M+I) movement. */
  isRush?: boolean;
}

export interface DeclareShootingCommand {
  type: 'declareShooting';
  attackingUnitId: string;
  targetUnitId: string;
  /** Weapon selections per model — which weapon each model will fire */
  weaponSelections: { modelId: string; weaponId: string; profileName?: string }[];
  /** Blast marker placements keyed by the contributing fire-group source models. */
  blastPlacements?: BlastPlacement[];
  /** Template placements keyed by the source model making each template attack. */
  templatePlacements?: TemplatePlacement[];
}

export interface ResolveShootingCasualtiesCommand {
  type: 'resolveShootingCasualties';
}

export interface DeclareChargeCommand {
  type: 'declareCharge';
  chargingUnitId: string;
  targetUnitId: string;
}

export interface DeclareChallengeCommand {
  type: 'declareChallenge';
  challengerModelId: string;
  targetModelId: string;
}

export interface SelectGambitCommand {
  type: 'selectGambit';
  modelId: string;
  gambit: string;
}

export interface SelectReactionCommand {
  type: 'selectReaction';
  unitId: string;
  reactionType: string;
}

export interface DeclineReactionCommand {
  type: 'declineReaction';
}

export interface EndPhaseCommand {
  type: 'endPhase';
}

export interface EndSubPhaseCommand {
  type: 'endSubPhase';
}

export interface SelectTargetModelCommand {
  type: 'selectTargetModel';
  modelId: string;
}

export interface PlaceBlastMarkerCommand {
  type: 'placeBlastMarker';
  position: Position;
  size: number;
}

export interface PlaceTerrainCommand {
  type: 'placeTerrain';
  terrain: TerrainPiece;
}

export interface RemoveTerrainCommand {
  type: 'removeTerrain';
  terrainId: string;
}

export interface DeployUnitCommand {
  type: 'deployUnit';
  unitId: string;
  modelPositions: { modelId: string; position: Position }[];
}

export interface ReservesTestCommand {
  type: 'reservesTest';
  unitId: string;
}

export interface RushUnitCommand {
  type: 'rushUnit';
  unitId: string;
}

export interface EmbarkCommand {
  type: 'embark';
  unitId: string;
  transportId: string;
}

export interface DisembarkCommand {
  type: 'disembark';
  unitId: string;
  modelPositions: { modelId: string; position: Position }[];
}

export interface SelectWargearOptionCommand {
  type: 'selectWargearOption';
  unitId: string;
  modelId: string;
  optionIndex: number;
}

export interface AcceptChallengeCommand {
  type: 'acceptChallenge';
  challengedModelId: string;
}

export interface DeclineChallengeCommand {
  type: 'declineChallenge';
}

export interface DeclareWeaponsCommand {
  type: 'declareWeapons';
  /** Melee weapon selections per model */
  weaponSelections: { modelId: string; weaponId: string }[];
}

export interface SelectAftermathCommand {
  type: 'selectAftermath';
  unitId: string;
  option: string;
}

export interface ResolveFightCommand {
  type: 'resolveFight';
  combatId: string;
}
