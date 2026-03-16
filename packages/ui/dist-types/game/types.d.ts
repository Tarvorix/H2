/**
 * Game UI State & Types
 *
 * These types wrap the engine's GameState with UI-specific presentation state.
 * The engine's GameState is the single source of truth for game logic;
 * GameUIState adds selection, flow tracking, animation, and display concerns.
 */
import type { AttackTargetRef, GameState, GameCommand, Position, TerrainPiece, PendingReaction, BlastPlacement, TemplatePlacement, ArmyList, ArmyValidationResult, ObjectiveMarker } from '@hh/types';
import { Phase, SubPhase, TacticalStatus, ChallengeGambit, AftermathOption, Allegiance, DeploymentMap, GameMode } from '@hh/types';
import type { ArmyDoctrine, ArmyFaction, LegionFaction } from '@hh/types';
import type { GameEvent, CommandResult, ValidationError } from '@hh/engine';
import type { CameraState, OverlayVisibility } from '../state/types';
import type { AIPlayerConfig, AIDiagnostics } from '@hh/ai';
/**
 * Top-level UI phase tracking the pre-game → playing → game-over flow.
 * This is separate from the engine's Phase/SubPhase which tracks the turn sequence.
 */
export declare enum GameUIPhase {
    /** Choose the battle ruleset */
    ModeSelect = "ModeSelect",
    /** Full army construction with detachments, validation, and wargear */
    ArmyBuilder = "ArmyBuilder",
    /** Selecting/loading armies for both players (legacy preset mode) */
    ArmyLoad = "ArmyLoad",
    /** Selecting the mission to play */
    MissionSelect = "MissionSelect",
    /** Placing terrain on the battlefield */
    TerrainSetup = "TerrainSetup",
    /** Placing objectives for alternating/symmetric missions */
    ObjectivePlacement = "ObjectivePlacement",
    /** Deploying units into deployment zones */
    Deployment = "Deployment",
    /** Active game — turn sequence running */
    Playing = "Playing",
    /** Game has ended — showing summary */
    GameOver = "GameOver"
}
/**
 * Tracks the deployment process — which player is deploying and progress.
 */
export interface DeploymentState {
    /** Which player is currently deploying (0 or 1) */
    deployingPlayerIndex: number;
    /** Deployment zone boundaries per player (y-range in inches from their edge) */
    deploymentZoneDepth: number;
    /** IDs of units that have been placed on the battlefield */
    deployedUnitIds: string[];
    /** ID of the unit currently being placed (selected from roster) */
    selectedRosterUnitId: string | null;
    /** Model positions being set for the current unit placement */
    pendingModelPositions: {
        modelId: string;
        position: Position;
    }[];
    /** Whether Player 1 has confirmed their deployment */
    player1Confirmed: boolean;
    /** Whether Player 2 has confirmed their deployment */
    player2Confirmed: boolean;
}
/**
 * State for the Army Builder screen (Phase 8).
 */
export interface ArmyBuilderUIState {
    /** Which player is currently editing (0 or 1) */
    editingPlayerIndex: number;
    /** Army lists for both players */
    armyLists: [ArmyList | null, ArmyList | null];
    /** Validation results for both players */
    validationResults: [ArmyValidationResult | null, ArmyValidationResult | null];
    /** Currently selected detachment index within the army list */
    activeDetachmentIndex: number | null;
    /** Currently selected slot ID within the active detachment */
    activeSlotId: string | null;
    /** Unit search filter text */
    unitSearchFilter: string;
    /** Selected Rite of War IDs per player */
    selectedRiteIds: [string | null, string | null];
}
/**
 * State for the Mission Select screen.
 */
export interface MissionSelectUIState {
    /** Selected mission definition */
    selectedMissionId: string | null;
    /** Selected deployment map type */
    selectedDeploymentMap: DeploymentMap | null;
    /** Whether the selection has been confirmed */
    confirmed: boolean;
}
/**
 * State for alternating/symmetric objective placement.
 */
export interface ObjectivePlacementUIState {
    /** Player who won the objective placement roll-off and places first */
    firstPlacingPlayerIndex: 0 | 1;
    /** Player currently placing an objective */
    placingPlayerIndex: number;
    /** Objectives placed so far */
    placedObjectives: ObjectiveMarker[];
    /** Total objectives to place */
    totalToPlace: number;
    /** Current pending position (before confirm) */
    pendingPosition: Position | null;
}
/**
 * A single entry in the combat log.
 */
export interface CombatLogEntry {
    /** Unique identifier */
    id: string;
    /** Timestamp (Date.now()) */
    timestamp: number;
    /** Battle turn number when this occurred */
    battleTurn: number;
    /** Game phase when this occurred */
    phase: Phase;
    /** Sub-phase when this occurred */
    subPhase: SubPhase;
    /** Active player index when this occurred */
    activePlayerIndex: number;
    /** Category for filtering */
    category: CombatLogCategory;
    /** Human-readable description of what happened */
    message: string;
    /** Detailed dice roll information (if applicable) */
    diceRolls: DiceRollDisplay[];
    /** Source unit ID (if applicable) */
    sourceUnitId?: string;
    /** Target unit ID (if applicable) */
    targetUnitId?: string;
    /** Whether this is an important event (highlighted in the log) */
    isImportant: boolean;
}
export type CombatLogCategory = 'movement' | 'shooting' | 'assault' | 'morale' | 'reaction' | 'status' | 'phase' | 'system';
/**
 * Dice roll display information for the combat log and dice overlay.
 */
export interface DiceRollDisplay {
    /** The individual dice values rolled */
    values: number[];
    /** Target number needed to succeed */
    targetNumber: number;
    /** Which dice passed (indices into values array) */
    passedIndices: number[];
    /** Which dice failed (indices into values array) */
    failedIndices: number[];
    /** Descriptive label (e.g., "BS4 Hit Test", "S4 vs T4 Wound Test") */
    label: string;
    /** Result summary (e.g., "3 hits from 5 dice") */
    summary: string;
}
/**
 * Tracks the current step in multi-step UI flows.
 * The engine processes commands atomically, but the UI presents
 * multi-step interactions to the player (e.g., shooting requires
 * selecting attacker, target, weapons, then confirming).
 */
export type UIFlowState = {
    type: 'idle';
} | {
    type: 'movement';
    step: MovementFlowStep;
} | {
    type: 'shooting';
    step: ShootingFlowStep;
} | {
    type: 'assault';
    step: AssaultFlowStep;
} | {
    type: 'reaction';
    step: ReactionFlowStep;
} | {
    type: 'challenge';
    step: ChallengeFlowStep;
};
export type MovementFlowStep = {
    step: 'selectUnit';
} | {
    step: 'selectDestination';
    unitId: string;
    isRush: boolean;
} | {
    step: 'confirmMove';
    unitId: string;
    modelPositions: {
        modelId: string;
        position: Position;
    }[];
    isRush: boolean;
    measuredDistance: number;
};
export type ShootingFlowStep = {
    step: 'selectAttacker';
} | {
    step: 'selectTarget';
    attackerUnitId: string;
} | {
    step: 'selectWeapons';
    attackerUnitId: string;
    target: AttackTargetRef;
    weaponSelections: WeaponSelection[];
} | {
    step: 'placeSpecial';
    attackerUnitId: string;
    target: AttackTargetRef;
    weaponSelections: WeaponSelection[];
    requirements: SpecialShotRequirement[];
    currentIndex: number;
    blastPlacements: BlastPlacement[];
    templatePlacements: TemplatePlacement[];
} | {
    step: 'confirmAttack';
    attackerUnitId: string;
    target: AttackTargetRef;
    weaponSelections: WeaponSelection[];
} | {
    step: 'resolving';
    attackerUnitId: string;
    target: AttackTargetRef;
} | {
    step: 'showResults';
    attackerUnitId: string;
    target: AttackTargetRef;
    events: GameEvent[];
} | {
    step: 'resolveMorale';
    attackerUnitId: string;
    target: AttackTargetRef;
};
export interface WeaponSelection {
    modelId: string;
    weaponId: string;
    weaponName: string;
    profileName?: string;
}
export type SpecialShotRequirement = {
    kind: 'blast';
    label: string;
    weaponName: string;
    sizeInches: number;
    sourceModelIds: string[];
} | {
    kind: 'template';
    label: string;
    weaponName: string;
    sourceModelId: string;
};
export type AssaultFlowStep = {
    step: 'selectCharger';
} | {
    step: 'selectTarget';
    chargingUnitId: string;
} | {
    step: 'confirmCharge';
    chargingUnitId: string;
    target: AttackTargetRef;
    measuredDistance: number;
} | {
    step: 'resolving';
    chargingUnitId: string;
    target: AttackTargetRef;
} | {
    step: 'volleyAttacks';
    chargingUnitId: string;
    target: AttackTargetRef;
} | {
    step: 'chargeRoll';
    chargingUnitId: string;
    target: AttackTargetRef;
} | {
    step: 'chargeMove';
    chargingUnitId: string;
    target: AttackTargetRef;
} | {
    step: 'fightPhase';
    combatId: string;
} | {
    step: 'resolution';
    combatId: string;
} | {
    step: 'selectAftermath';
    combatId: string;
    unitId: string;
    availableOptions: AftermathOption[];
} | {
    step: 'showResults';
    events: GameEvent[];
};
export type ReactionFlowStep = {
    step: 'prompt';
    pendingReaction: PendingReaction;
} | {
    step: 'selectUnit';
    reactionType: string;
    eligibleUnitIds: string[];
} | {
    step: 'placeModels';
    reactionType: string;
    unitId: string;
    currentModelId: string;
    modelPositions: {
        modelId: string;
        position: Position;
    }[];
} | {
    step: 'confirmMove';
    reactionType: string;
    unitId: string;
    modelPositions: {
        modelId: string;
        position: Position;
    }[];
} | {
    step: 'selectDeathOrGloryAttack';
    reactionType: string;
    unitId: string;
} | {
    step: 'resolving';
};
export type ChallengeFlowStep = {
    step: 'declareChallenge';
    combatId: string;
    eligibleChallengers: string[];
    eligibleTargets: string[];
    canPass: boolean;
} | {
    step: 'respondToChallenge';
    challengerModelId: string;
    targetModelId: string;
} | {
    step: 'selectGambit';
    modelId: string;
    availableGambits: ChallengeGambit[];
} | {
    step: 'focusRoll';
} | {
    step: 'strike';
} | {
    step: 'glory';
};
/**
 * State for the dice roll animation overlay.
 */
export interface DiceAnimationState {
    /** Whether the dice display is currently visible */
    isVisible: boolean;
    /** The dice roll to display */
    roll: DiceRollDisplay | null;
    /** When the animation started (for timing fade-out) */
    startTime: number;
    /** Duration in milliseconds before auto-hide */
    duration: number;
}
/**
 * Temporary notification messages displayed to the player.
 */
export interface NotificationState {
    /** The notification message */
    message: string;
    /** Notification type for styling */
    type: 'info' | 'success' | 'warning' | 'error';
    /** When the notification was created */
    timestamp: number;
    /** Duration in milliseconds before auto-dismiss */
    duration: number;
}
/**
 * Army configuration before it's turned into engine ArmyState.
 * Used during the Army Load screen.
 */
export interface ArmyConfig {
    /** Player index (0 or 1) */
    playerIndex: number;
    /** Player display name */
    playerName: string;
    /** Selected faction */
    faction: ArmyFaction;
    /** Selected allegiance */
    allegiance: Allegiance;
    /** Faction doctrine payload (if any) */
    doctrine?: ArmyDoctrine;
    /** Points limit for this army */
    pointsLimit: number;
    /** Unit selections (profile IDs with counts and wargear choices) */
    unitSelections: UnitSelection[];
}
export interface UnitSelection {
    /** Unit profile ID */
    profileId: string;
    /** Display name */
    name: string;
    /** Number of models */
    modelCount: number;
    /** Points cost */
    pointsCost: number;
    /** Equipped wargear option indices */
    wargearOptions: number[];
    /** Original legion lineage for doctrine-dependent rules. */
    originLegion?: LegionFaction;
}
/**
 * A preset army definition for quick game start (until Army Builder is Phase 8).
 */
export interface PresetArmy {
    /** Display name for the preset */
    name: string;
    /** Description */
    description: string;
    /** The army configuration */
    config: ArmyConfig;
}
/**
 * Complete UI state for a game session.
 * This wraps the engine's GameState with all presentation concerns.
 */
export interface GameUIState {
    /** Current UI phase (army builder → mission → terrain → deployment → playing → game over) */
    uiPhase: GameUIPhase;
    /** Which battle ruleset is being configured */
    gameMode: GameMode | null;
    /** Army configurations for both players (set during Army Load or Army Builder) */
    armyConfigs: [ArmyConfig | null, ArmyConfig | null];
    /** Deployment tracking state */
    deployment: DeploymentState;
    /** Army builder state (Phase 8) */
    armyBuilder: ArmyBuilderUIState;
    /** Mission selection state */
    missionSelect: MissionSelectUIState;
    /** Objective placement state */
    objectivePlacement: ObjectivePlacementUIState;
    /** The authoritative game state from the engine (null before game starts) */
    gameState: GameState | null;
    /** Battlefield dimensions in inches */
    battlefieldWidth: number;
    battlefieldHeight: number;
    /** Camera state (pan/zoom) */
    camera: CameraState;
    /** Terrain pieces (also stored in gameState, but needed before game starts) */
    terrain: TerrainPiece[];
    /** Overlay visibility toggles */
    overlayVisibility: OverlayVisibility;
    /** Currently selected unit ID */
    selectedUnitId: string | null;
    /** Currently hovered unit ID */
    hoveredUnitId: string | null;
    /** Currently hovered model ID */
    hoveredModelId: string | null;
    /** Mouse position in world coordinates */
    mouseWorldPos: Position | null;
    /** Whether the camera is being panned */
    isPanning: boolean;
    /** Pan start position (screen coordinates) */
    panStart: {
        x: number;
        y: number;
    } | null;
    /** Current multi-step flow state */
    flowState: UIFlowState;
    /** All combat log entries */
    combatLog: CombatLogEntry[];
    /** Active filter for combat log */
    combatLogFilter: CombatLogCategory | 'all';
    /** Current dice animation state */
    diceAnimation: DiceAnimationState;
    /** Active notifications */
    notifications: NotificationState[];
    /** Previous positions of moved models for trail rendering */
    ghostTrails: GhostTrailEntry[];
    /** Last command result from the engine (for error display) */
    lastCommandResult: CommandResult | null;
    /** Last validation errors (displayed to user) */
    lastErrors: ValidationError[];
    /** AI player configuration (null if no AI opponent) */
    aiConfig: AIPlayerConfig | null;
    /** Whether the AI is currently processing a turn */
    aiThinking: boolean;
    /** Latest AI diagnostics snapshot, if enabled. */
    aiDiagnostics: AIDiagnostics | null;
    /** Latest AI error surfaced by the selected AI tier. */
    aiError: string | null;
}
export interface GhostTrailEntry {
    modelId: string;
    fromPosition: Position;
    toPosition: Position;
    shape: {
        kind: 'circle';
        radiusInches: number;
    } | {
        kind: 'rect';
        lengthInches: number;
        widthInches: number;
        rotationRadians: number;
    };
}
/**
 * All actions the game UI reducer can handle.
 */
export type GameUIAction = {
    type: 'SET_UI_PHASE';
    phase: GameUIPhase;
} | {
    type: 'SELECT_GAME_MODE';
    gameMode: GameMode;
} | {
    type: 'SET_ARMY_CONFIG';
    playerIndex: number;
    config: ArmyConfig;
} | {
    type: 'LOAD_PRESET_ARMY';
    playerIndex: number;
    preset: PresetArmy;
} | {
    type: 'CONFIRM_ARMIES';
} | {
    type: 'SET_ARMY_BUILDER_PLAYER';
    playerIndex: number;
} | {
    type: 'SET_ARMY_LIST';
    playerIndex: number;
    armyList: ArmyList;
} | {
    type: 'SET_ARMY_VALIDATION';
    playerIndex: number;
    result: ArmyValidationResult;
} | {
    type: 'SET_ACTIVE_DETACHMENT';
    index: number | null;
} | {
    type: 'SET_ACTIVE_SLOT';
    slotId: string | null;
} | {
    type: 'SET_UNIT_SEARCH_FILTER';
    filter: string;
} | {
    type: 'SET_RITE_OF_WAR';
    playerIndex: number;
    riteId: string | null;
} | {
    type: 'CONFIRM_ARMY_BUILDER';
} | {
    type: 'ADD_UNIT_TO_DETACHMENT';
    playerIndex: number;
    detachmentIndex: number;
    unit: import('@hh/types').ArmyListUnit;
} | {
    type: 'REMOVE_UNIT_FROM_DETACHMENT';
    playerIndex: number;
    detachmentIndex: number;
    unitId: string;
} | {
    type: 'SELECT_MISSION';
    missionId: string;
} | {
    type: 'SELECT_DEPLOYMENT_MAP';
    deploymentMap: DeploymentMap;
} | {
    type: 'CONFIRM_MISSION';
} | {
    type: 'SET_OBJECTIVE_POSITION';
    position: Position;
} | {
    type: 'CONFIRM_OBJECTIVE_PLACEMENT';
} | {
    type: 'UNDO_OBJECTIVE_PLACEMENT';
} | {
    type: 'CONFIRM_ALL_OBJECTIVES';
} | {
    type: 'ADD_TERRAIN';
    terrain: TerrainPiece;
} | {
    type: 'REMOVE_TERRAIN';
    terrainId: string;
} | {
    type: 'CONFIRM_TERRAIN';
} | {
    type: 'SELECT_ROSTER_UNIT';
    unitId: string;
} | {
    type: 'PLACE_DEPLOYMENT_MODEL';
    modelId: string;
    position: Position;
} | {
    type: 'CONFIRM_UNIT_PLACEMENT';
} | {
    type: 'UNDO_UNIT_PLACEMENT';
} | {
    type: 'CONFIRM_DEPLOYMENT';
} | {
    type: 'INIT_GAME_STATE';
    gameState: GameState;
} | {
    type: 'SET_CAMERA';
    camera: Partial<CameraState>;
} | {
    type: 'ZOOM_AT';
    screenX: number;
    screenY: number;
    delta: number;
} | {
    type: 'PAN_START';
    screenX: number;
    screenY: number;
} | {
    type: 'PAN_MOVE';
    screenX: number;
    screenY: number;
} | {
    type: 'PAN_END';
} | {
    type: 'MOUSE_MOVE';
    screenX: number;
    screenY: number;
} | {
    type: 'MOUSE_DOWN';
    screenX: number;
    screenY: number;
    button: number;
} | {
    type: 'MOUSE_UP';
    screenX: number;
    screenY: number;
    button: number;
} | {
    type: 'SELECT_UNIT';
    unitId: string | null;
} | {
    type: 'HOVER_UNIT';
    unitId: string | null;
} | {
    type: 'HOVER_MODEL';
    modelId: string | null;
} | {
    type: 'START_MOVE_FLOW';
} | {
    type: 'START_RUSH_FLOW';
} | {
    type: 'SET_MOVE_DESTINATION';
    position: Position;
} | {
    type: 'CONFIRM_MOVE';
} | {
    type: 'CANCEL_MOVE';
} | {
    type: 'START_SHOOTING_FLOW';
} | {
    type: 'SELECT_SHOOTING_TARGET';
    target: AttackTargetRef;
} | {
    type: 'SET_WEAPON_SELECTION';
    selection: WeaponSelection;
} | {
    type: 'CLEAR_WEAPON_SELECTION';
    modelId: string;
} | {
    type: 'CONFIRM_SHOOTING';
} | {
    type: 'PLACE_SPECIAL_SHOT';
    position: Position;
} | {
    type: 'CANCEL_SHOOTING';
} | {
    type: 'RESOLVE_SHOOTING_CASUALTIES';
} | {
    type: 'START_CHARGE_FLOW';
} | {
    type: 'START_CHALLENGE_FLOW';
} | {
    type: 'SELECT_CHARGE_TARGET';
    target: AttackTargetRef;
} | {
    type: 'CONFIRM_CHARGE';
} | {
    type: 'CANCEL_CHARGE';
} | {
    type: 'RESOLVE_FIGHT';
    combatId: string;
} | {
    type: 'SELECT_AFTERMATH';
    unitId: string;
    option: AftermathOption;
} | {
    type: 'SELECT_REACTION_UNIT';
    unitId: string;
    reactionType: string;
} | {
    type: 'PLACE_REACTION_MODEL';
    position: Position;
} | {
    type: 'RESET_REACTION_MOVE';
} | {
    type: 'CONFIRM_REACTION_MOVE';
} | {
    type: 'CONFIRM_DEATH_OR_GLORY_ATTACK';
    unitId: string;
    reactingModelId: string;
    weaponId: string;
    profileName?: string;
} | {
    type: 'DECLINE_REACTION';
} | {
    type: 'PASS_CHALLENGE_COMBAT';
    combatId: string;
} | {
    type: 'DECLARE_CHALLENGE';
    challengerModelId: string;
    targetModelId: string;
} | {
    type: 'ACCEPT_CHALLENGE';
    modelId: string;
} | {
    type: 'DECLINE_CHALLENGE';
} | {
    type: 'SELECT_GAMBIT';
    modelId: string;
    gambit: ChallengeGambit;
} | {
    type: 'END_PHASE';
} | {
    type: 'END_SUB_PHASE';
} | {
    type: 'DISPATCH_ENGINE_COMMAND';
    command: GameCommand;
} | {
    type: 'SET_FLOW_STATE';
    flowState: UIFlowState;
} | {
    type: 'ADD_COMBAT_LOG_ENTRY';
    entry: CombatLogEntry;
} | {
    type: 'SET_COMBAT_LOG_FILTER';
    filter: CombatLogCategory | 'all';
} | {
    type: 'SHOW_DICE_ANIMATION';
    roll: DiceRollDisplay;
} | {
    type: 'HIDE_DICE_ANIMATION';
} | {
    type: 'ADD_NOTIFICATION';
    notification: Omit<NotificationState, 'timestamp'>;
} | {
    type: 'DISMISS_NOTIFICATION';
    timestamp: number;
} | {
    type: 'CLEAR_GHOST_TRAILS';
} | {
    type: 'TOGGLE_OVERLAY';
    overlay: keyof OverlayVisibility;
} | {
    type: 'SET_AI_CONFIG';
    config: AIPlayerConfig | null;
} | {
    type: 'AI_TURN_START';
} | {
    type: 'AI_TURN_END';
} | {
    type: 'SET_AI_DIAGNOSTICS';
    diagnostics: AIDiagnostics | null;
} | {
    type: 'SET_AI_ERROR';
    error: string | null;
} | {
    type: 'NEW_GAME';
} | {
    type: 'RETURN_TO_MENU';
};
/**
 * Top-level application mode — debug visualizer or game session.
 */
export type AppMode = 'debugVisualizer' | 'gameSession';
/**
 * Information about a unit displayed in the action bar / UI.
 */
export interface UnitDisplayInfo {
    unitId: string;
    unitName: string;
    modelCount: number;
    aliveModelCount: number;
    playerIndex: number;
    playerName: string;
    statuses: TacticalStatus[];
    isLockedInCombat: boolean;
    isInReserves: boolean;
    isDeployed: boolean;
    canMove: boolean;
    canShoot: boolean;
    canCharge: boolean;
    canReact: boolean;
}
/**
 * Stat line displayed on unit cards.
 */
export interface StatLineDisplay {
    M: number | string;
    WS: number;
    BS: number;
    S: number;
    T: number;
    W: number;
    I: number;
    A: number;
    LD: number;
    Sv: string;
    InvSv?: string;
}
/**
 * Vehicle stat line for unit cards.
 */
export interface VehicleStatLineDisplay {
    M: number | string;
    BS: number;
    Front: number;
    Side: number;
    Rear: number;
    HP: number;
    Transport?: number;
}
/**
 * Weapon profile displayed on unit cards and weapon selection panels.
 */
export interface WeaponDisplayInfo {
    weaponId: string;
    name: string;
    profileName?: string;
    isRanged: boolean;
    isMelee: boolean;
    /** Ranged stats */
    range?: number;
    firepower?: number;
    /** Strength (ranged or melee) */
    strength: number | string;
    ap: number | string;
    damage: number;
    specialRules: string[];
    traits: string[];
}
/**
 * Available action for the action bar.
 */
export interface AvailableAction {
    /** Action identifier */
    id: string;
    /** Display label */
    label: string;
    /** Whether the action is currently available */
    enabled: boolean;
    /** Reason the action is disabled (shown as tooltip) */
    disabledReason?: string;
    /** Action to dispatch when clicked */
    action: GameUIAction;
    /** Keyboard shortcut hint */
    shortcut?: string;
}
/**
 * Default deployment state.
 */
export declare function createDefaultDeploymentState(deployingPlayerIndex?: 0 | 1): DeploymentState;
/**
 * Default dice animation state.
 */
export declare function createDefaultDiceAnimationState(): DiceAnimationState;
/**
 * Default camera state for game mode.
 */
export declare function createDefaultGameCamera(): CameraState;
/**
 * Default overlay visibility for game mode.
 */
export declare function createDefaultGameOverlays(): OverlayVisibility;
/**
 * Default army builder state.
 */
export declare function createDefaultArmyBuilderState(): ArmyBuilderUIState;
/**
 * Default mission selection state.
 */
export declare function createDefaultMissionSelectState(): MissionSelectUIState;
/**
 * Default objective placement state.
 */
export declare function createDefaultObjectivePlacementState(): ObjectivePlacementUIState;
/**
 * Create the initial GameUIState.
 */
export declare function createInitialGameUIState(): GameUIState;
//# sourceMappingURL=types.d.ts.map