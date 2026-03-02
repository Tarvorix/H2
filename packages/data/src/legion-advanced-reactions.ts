/**
 * Legion Advanced Reaction data definitions for all 18 Legiones Astartes + 2 Hereticus reactions.
 *
 * Each reaction has:
 *  - id: unique identifier
 *  - name: display name
 *  - legion: which legion provides it
 *  - triggerPhase / triggerSubPhase / triggerCondition: when it can be used
 *  - cost: reaction point cost (always 1)
 *  - oncePerBattle: whether it can only be used once per battle
 *  - description: rules text summary
 *  - conditions: eligibility conditions
 *  - effects: what happens when declared
 *
 * Reference: HH_Legiones_Astartes.md — all legion sections, "Advanced Reaction" subsections
 */

import { LegionFaction, Phase, SubPhase, Allegiance } from '@hh/types';
import type { ArmyFaction } from '@hh/types';
import type { AdvancedReactionDefinition, AdvancedReactionTrigger } from '@hh/types';

// ═══════════════════════════════════════════════════════════════════════════════
// I — DARK ANGELS: Vengeance of the First Legion
// ═══════════════════════════════════════════════════════════════════════════════

const daVengeance: AdvancedReactionDefinition = {
  id: 'da-vengeance',
  name: 'Vengeance of the First Legion',
  legion: LegionFaction.DarkAngels,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Fight,
  triggerCondition: { type: 'afterLastInitiativeStep' } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'After the last Initiative Step of a Combat that includes a Unit under the Reactive Player\'s ' +
    'control composed only of Dark Angels models, instead of proceeding to the Make Final Pile-in ' +
    'Moves Step, the Players return to Step 1 of that Combat and resolve it a second time. Combat ' +
    'Resolution Points from the first round are discarded (but CRP from Challenges are kept). ' +
    'Models in the Reacting Unit gain Shred (6+) on any weapons with the Sword of the Order trait.',
  conditions: [
    'Can only be declared after the last Initiative Step of a Combat',
    'Reacting Unit must only include models with the Dark Angels trait',
    'Must be declared before the Make Final Pile-in Moves Step',
  ],
  effects: [
    'Return to Step 1 of the Combat and resolve it a second time',
    'Discard Combat Resolution Points from the first round (keep CRP from Challenges)',
    'Models in the Reacting Unit gain Shred (6+) on weapons with the Sword of the Order trait',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// III — EMPEROR'S CHILDREN: Perfect Counter
// ═══════════════════════════════════════════════════════════════════════════════

const ecPerfectCounter: AdvancedReactionDefinition = {
  id: 'ec-perfect-counter',
  name: 'Perfect Counter',
  legion: LegionFaction.EmperorsChildren,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Charge,
  triggerCondition: { type: 'duringChargeStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'At the end of Step 3 of a Charge targeting a unit composed only of Emperor\'s Children, ' +
    'the Reactive Player makes a Charge Roll for the Reacting Unit. If successful, the Reacting ' +
    'Unit makes a counter-charge: the charging unit loses all charge bonuses, while the Reacting ' +
    'Unit gains charge bonuses. If the Charge Roll fails, proceed to Step 4 normally.',
  conditions: [
    'Declared at the end of Step 3 of the Charge process',
    'The Charge must target a unit composed only of Emperor\'s Children models',
    'Reacting Unit is the target of the Charge',
  ],
  effects: [
    'Reactive Player makes a Charge Roll for the Reacting Unit',
    'If successful: Reacting Unit makes a Charge Move and units are Locked in Combat',
    'No model in the Target (charging) Unit may claim bonuses from Special Rules requiring a successful Charge',
    'Models in the Reacting Unit gain bonuses as if they made a successful Charge',
    'If the Charge Roll fails, no Charge Move is made and proceed to Step 4',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// IV — IRON WARRIORS: Bitter Fury
// ═══════════════════════════════════════════════════════════════════════════════

const iwBitterFury: AdvancedReactionDefinition = {
  id: 'iw-bitter-fury',
  name: 'Bitter Fury',
  legion: LegionFaction.IronWarriors,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 3 of a Shooting Attack targeting a unit composed only of Iron Warriors, the ' +
    'Reactive Player declares this reaction. The Active Player resolves all remaining Steps up to ' +
    'Step 11. Before resolving Step 11, the Reactive Player makes a Shooting Attack with the ' +
    'Reacting Unit (including models reduced to 0 Wounds). Weapons have +1 Firepower and gain ' +
    'Overload (1) (or improve existing Overload X by +1). Then Step 11 is resolved.',
  conditions: [
    'Declared during Step 3 of a Shooting Attack',
    'Target must be a unit composed only of Iron Warriors models',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'Active Player resolves all remaining Steps of the Shooting Attack up to Step 11',
    'Before Step 11, Reactive Player makes a Shooting Attack with the Reacting Unit (including 0-wound models)',
    'Weapons selected for the return fire have Firepower modified by +1',
    'Weapons gain Overload (1), or improve existing Overload (X) by +1',
    'After resolving the return fire Shooting Attack, resolve Step 11 of the original attack',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// V — WHITE SCARS: Chasing the Wind
// ═══════════════════════════════════════════════════════════════════════════════

const wsChasingWind: AdvancedReactionDefinition = {
  id: 'ws-chasing-wind',
  name: 'Chasing the Wind',
  legion: LegionFaction.WhiteScars,
  triggerPhase: Phase.Movement,
  triggerSubPhase: SubPhase.Move,
  triggerCondition: { type: 'afterEnemyMoveWithinRange', range: 12, requiresLOS: true } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'In Step 2 of the Move Sub-Phase, if an enemy Unit ends a move within 12" and in Line of ' +
    'Sight of a White Scars Unit, the Reactive Player may declare this reaction. The Reacting ' +
    'Unit makes a normal Move (applying Difficult/Dangerous Terrain rules) but may not Rush. ' +
    'After completing the move, the Active Player proceeds with their Movement Phase.',
  conditions: [
    'Declared in Step 2 of the Move Sub-Phase',
    'An enemy Unit must end a move within 12" and in Line of Sight of a White Scars unit',
    'Reacting Unit must only include models with the White Scars trait',
    'Reacting Unit must be within 12" and have Line of Sight to the Target Unit',
  ],
  effects: [
    'The Reacting Unit makes a normal Move following standard movement rules',
    'Difficult Terrain modifiers and Dangerous Terrain tests apply',
    'The Reacting Unit may not Rush',
    'After the Reacting Unit completes its move, the Active Player continues their Movement Phase',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// VI — SPACE WOLVES: Bestial Savagery
// ═══════════════════════════════════════════════════════════════════════════════

const swBestialSavagery: AdvancedReactionDefinition = {
  id: 'sw-bestial-savagery',
  name: 'Bestial Savagery',
  legion: LegionFaction.SpaceWolves,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 3 of a Shooting Attack targeting a unit composed only of Space Wolves, the ' +
    'Active Player resolves all remaining Steps normally. Models in the Reacting Unit gain Feel ' +
    'No Pain (5+) for the duration of the Shooting Phase. After Step 11, the Reacting Unit makes ' +
    'a Set-up Move toward the attacking unit. If any models reach base contact, the Reacting Unit ' +
    'counts as having charged in the following Assault Phase and auto-passes all Morale Checks.',
  conditions: [
    'Declared during Step 3 of a Shooting Attack',
    'Target must be a unit composed only of Space Wolves models',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'Models in the Reacting Unit gain Feel No Pain (5+) for the duration of the Shooting Phase',
    'After Step 11, the Reacting Unit makes a Set-up Move toward the attacker (as if charging)',
    'If any models reach base contact, the Reacting Unit counts as having made a Successful Charge in the following Assault Phase',
    'The Reacting Unit auto-passes all Checks in the following Morale Sub-Phase (treated as rolling double 1s)',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// VII — IMPERIAL FISTS: Bastion of Fire
// ═══════════════════════════════════════════════════════════════════════════════

const ifBastionOfFire: AdvancedReactionDefinition = {
  id: 'if-bastion-of-fire',
  name: 'Bastion of Fire',
  legion: LegionFaction.ImperialFists,
  triggerPhase: Phase.Movement,
  triggerSubPhase: SubPhase.Move,
  triggerCondition: { type: 'afterEnemyMoveWithinRange', range: 10, requiresLOS: true } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'In Step 2 of the Move Sub-Phase, if an enemy Unit ends a move within 10" and in Line of ' +
    'Sight of a unit under the Reactive Player\'s control capable of making a Shooting Attack, ' +
    'the Reactive Player may declare this reaction. The Reacting Unit must be composed only of ' +
    'Imperial Fists (non-Vehicle). The Reactive Player makes a Shooting Attack targeting the enemy ' +
    'unit. After resolving the Shooting Attack (including removing casualties), the Active Player ' +
    'proceeds with their Movement Phase.',
  conditions: [
    'Declared in Step 2 of the Move Sub-Phase',
    'An enemy Unit must end a move within 10" and in Line of Sight of the Reacting Unit',
    'Reacting Unit must only include models with the Imperial Fists trait (non-Vehicle)',
    'Reacting Unit must be capable of making a Shooting Attack at the enemy Unit',
  ],
  effects: [
    'The Reactive Player makes a Shooting Attack with the Reacting Unit targeting the enemy unit',
    'After resolving the Shooting Attack (including removing casualties), the Active Player continues their Movement Phase',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// VIII — NIGHT LORDS: Better Part of Valour
// ═══════════════════════════════════════════════════════════════════════════════

const nlBetterPart: AdvancedReactionDefinition = {
  id: 'nl-better-part',
  name: 'Better Part of Valour',
  legion: LegionFaction.NightLords,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Charge,
  triggerCondition: { type: 'duringChargeStep', step: 4 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: false,
  description:
    'During Step 4 of the Charge process targeting a unit composed only of Night Lords, the ' +
    'Reactive Player may declare this reaction. The Reacting Unit immediately makes a Fall Back ' +
    'Move as if affected by the Routed Tactical Status. After the Fall Back Move, the Reacting ' +
    'Unit does NOT gain the Routed status.',
  conditions: [
    'Declared during Step 4 of the Charge process',
    'The Charge must target a unit composed only of Night Lords models',
    'Reacting Unit is the target of the Charge',
  ],
  effects: [
    'The Reacting Unit immediately makes a Fall Back Move as if it was Routed',
    'The Reacting Unit does NOT gain the Routed Tactical Status after completing the Fall Back Move',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// IX — BLOOD ANGELS: Wrath of Angels
// ═══════════════════════════════════════════════════════════════════════════════

const baWrathOfAngels: AdvancedReactionDefinition = {
  id: 'ba-wrath-of-angels',
  name: 'Wrath of Angels',
  legion: LegionFaction.BloodAngels,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 4 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 4 of a Shooting Attack targeting a unit composed only of Blood Angels, the ' +
    'Active Player resolves all remaining Steps up to Step 11. After Step 11, each model in the ' +
    'Reacting Unit moves toward the nearest model in the Target Unit using normal Move rules. If ' +
    'any model ends within 6" of the Target Unit, the Target Unit\'s Controlling Player must make ' +
    'a Cool Check in the Morale Sub-Phase; failure gives the Target Unit the Pinned status.',
  conditions: [
    'Declared during Step 4 of a Shooting Attack',
    'Target must be a unit composed only of Blood Angels models',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'Active Player resolves remaining Steps of the Shooting Attack up to Step 11',
    'After Step 11, each model in the Reacting Unit moves toward the nearest model in the Target Unit (maximum distance, at least 1" from enemies)',
    'If any model from the Reacting Unit is within 6" of the Target Unit, the Target Unit must make a Cool Check in the Morale Sub-Phase',
    'If the Cool Check fails, all models in the Target Unit gain the Pinned status',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// X — IRON HANDS: Spite of the Gorgon
// ═══════════════════════════════════════════════════════════════════════════════

const ihSpiteOfGorgon: AdvancedReactionDefinition = {
  id: 'ih-spite-of-gorgon',
  name: 'Spite of the Gorgon',
  legion: LegionFaction.IronHands,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Charge,
  triggerCondition: { type: 'duringChargeStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'At the start of Step 3 of a Charge targeting a unit composed only of Iron Hands, the ' +
    'Reactive Player makes a Shooting Attack at full Ballistic Skill (not Snap Shots) with any ' +
    'Ranged Weapons. Weapons selected have +1 Firepower and gain Overload (1) (or improve ' +
    'existing Overload X by +1). After this Shooting Attack, the Active Player proceeds with ' +
    'Step 3 of the Charge. The Reactive Player may NOT make Volley Attacks in Step 4.',
  conditions: [
    'Declared at the start of Step 3 of the Charge process',
    'The Charge must target a unit composed only of Iron Hands models',
    'Reacting Unit is the target of the Charge',
  ],
  effects: [
    'Reactive Player makes a Shooting Attack at full Ballistic Skill (not Snap Shots) targeting the charging unit',
    'Weapons selected have Firepower modified by +1',
    'Weapons gain Overload (1), or improve existing Overload (X) by +1',
    'After the Shooting Attack, the Active Player proceeds with Step 3 of the Charge normally',
    'The Reactive Player may NOT make Volley Attacks during Step 4 of the Charge',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XII — WORLD EATERS: Brutal Tide
// ═══════════════════════════════════════════════════════════════════════════════

const weBrutalTide: AdvancedReactionDefinition = {
  id: 'we-brutal-tide',
  name: 'Brutal Tide',
  legion: LegionFaction.WorldEaters,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 4 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 4 of a Shooting Attack targeting a unit composed only of World Eaters (non-Vehicle), ' +
    'all models in the Reacting Unit gain Eternal Warrior (1) for the duration of the Shooting Phase. ' +
    'After Step 11 is resolved, the Reactive Player makes a Charge Roll. If successful, the Reacting ' +
    'Unit makes a Charge Move and gains all charge bonuses. If the roll fails, no Charge Move is made.',
  conditions: [
    'Declared during Step 4 of a Shooting Attack',
    'Target must be a unit composed only of World Eaters models (non-Vehicle)',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'All models in the Reacting Unit gain Eternal Warrior (1) for the duration of the Shooting Phase',
    'After Step 11, the Reactive Player makes a Charge Roll',
    'If the Charge Roll is sufficient, a Charge Move is made and units are Locked in Combat',
    'Models in the Reacting Unit gain all charge bonuses from applicable Special Rules',
    'If the Charge Roll fails, no Charge Move is made',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIII — ULTRAMARINES: Retribution Strike
// ═══════════════════════════════════════════════════════════════════════════════

const umRetributionStrike: AdvancedReactionDefinition = {
  id: 'um-retribution-strike',
  name: 'Retribution Strike',
  legion: LegionFaction.Ultramarines,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 3 of a Shooting Attack targeting a unit composed only of Ultramarines, the ' +
    'Reactive Player selects a DIFFERENT unit (not the target) to be the Reacting Unit. The Active ' +
    'Player resolves remaining Steps up to Step 11. Before Step 11, the Reacting Unit makes a ' +
    'Shooting Attack at the attacker. After that resolves (including casualties), Step 11 of the ' +
    'original attack is completed.',
  conditions: [
    'Declared during Step 3 of a Shooting Attack',
    'Target must be a unit composed only of Ultramarines models',
    'Reacting Unit must NOT be the target of the triggering Shooting Attack',
    'Reacting Unit must have at least one model with Line of Sight to the attacker',
    'Reacting Unit must be eligible to make a Reaction and a Shooting Attack',
    'Reacting Unit must be entirely composed of models with the Ultramarines trait',
  ],
  effects: [
    'Active Player resolves remaining Steps of the Shooting Attack up to Step 11',
    'Before resolving Step 11, the Reacting Unit makes a Shooting Attack targeting the attacking unit',
    'After the Reacting Unit\'s Shooting Attack resolves (including casualties), Step 11 of the original attack is completed',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIV — DEATH GUARD: Barbaran Endurance
// ═══════════════════════════════════════════════════════════════════════════════

const dgBarbaranEndurance: AdvancedReactionDefinition = {
  id: 'dg-barbaran-endurance',
  name: 'Barbaran Endurance',
  legion: LegionFaction.DeathGuard,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 4 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 4 of a Shooting Attack targeting a unit composed only of Death Guard (non-Vehicle), ' +
    'all models in the Reacting Unit immediately recover from all Tactical Statuses. For the duration ' +
    'of the Shooting Phase, all models gain Feel No Pain (5+) and the Reactive Player automatically ' +
    'passes all Cool Checks and Leadership Checks made for the Reacting Unit.',
  conditions: [
    'Declared during Step 4 of a Shooting Attack',
    'Target must be a unit composed only of Death Guard models (non-Vehicle)',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'All models in the Reacting Unit immediately recover from all Tactical Statuses',
    'For the duration of the Shooting Phase, all models gain Feel No Pain (5+)',
    'For the duration of the Shooting Phase, the Reacting Unit auto-passes all Cool Checks and Leadership Checks',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XV — THOUSAND SONS: Fortress of the Mind
// ═══════════════════════════════════════════════════════════════════════════════

const tsFortressOfMind: AdvancedReactionDefinition = {
  id: 'ts-fortress-of-mind',
  name: 'Fortress of the Mind',
  legion: LegionFaction.ThousandSons,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 4 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 4 of a Shooting Attack targeting a unit composed only of Thousand Sons (non-Vehicle), ' +
    'the Reactive Player makes a Willpower Check. If passed, the Reacting Unit gains a 3+ Invulnerable ' +
    'Save against all wounds from this Shooting Attack. If failed, the Reacting Unit gains a 5+ ' +
    'Invulnerable Save, but both the Reacting Unit and the Target Unit suffer Warp Rupture (resolved ' +
    'after Step 11).',
  conditions: [
    'Declared during Step 4 of a Shooting Attack',
    'Target must be a unit composed only of Thousand Sons models (non-Vehicle)',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'Reactive Player makes a Willpower Check for the Reacting Unit',
    'If the Willpower Check is passed: the Reacting Unit gains a 3+ Invulnerable Save against all wounds from this Shooting Attack',
    'If the Willpower Check is failed: the Reacting Unit gains a 5+ Invulnerable Save against all wounds from this Shooting Attack',
    'On failure, both the Reacting Unit and the Target (attacking) Unit suffer Warp Rupture from the Perils of the Warp table (resolved after Step 11)',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVI — SONS OF HORUS: Warrior Pride
// ═══════════════════════════════════════════════════════════════════════════════

const sohWarriorPride: AdvancedReactionDefinition = {
  id: 'soh-warrior-pride',
  name: 'Warrior Pride',
  legion: LegionFaction.SonsOfHorus,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Challenge,
  triggerCondition: { type: 'onChallengeDeclaration' } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: false,
  description:
    'When a unit containing Sons of Horus models is in Combat with an enemy unit and the Active ' +
    'Player selects a Challenger, the Reactive Player may declare this reaction. If the Challenger\'s ' +
    'base WS is lower than the base WS of ALL eligible models in the Reacting Unit, the Reactive ' +
    'Player may decline the Challenge without the model gaining the Disgraced status.',
  conditions: [
    'Declared when the Active Player selects a model as Challenger',
    'A unit with Sons of Horus models must be in Combat with the enemy unit',
    'Reacting Unit includes models with the Sons of Horus trait that could be selected as the Challenged',
  ],
  effects: [
    'If the Challenger\'s base Weapon Skill is lower than the base WS of ALL eligible models in the Reacting Unit, the Reactive Player may decline the Challenge',
    'If declined, the Challenge Sub-Phase ends immediately',
    'The declining model does NOT gain the Disgraced Tactical Status',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVII — WORD BEARERS: Glorious Martyrdom
// ═══════════════════════════════════════════════════════════════════════════════

const wbGloriousMartyrdom: AdvancedReactionDefinition = {
  id: 'wb-glorious-martyrdom',
  name: 'Glorious Martyrdom',
  legion: LegionFaction.WordBearers,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 5 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'During Step 5 of a Shooting Attack targeting a unit composed only of Word Bearers, the ' +
    'Reactive Player selects one model from the Reacting Unit. Until the current Fire Group (and ' +
    'any split Fire Groups) has been resolved, only the selected model can be chosen as the Target ' +
    'Model. If that model is Removed as a Casualty, the remainder of the Fire Group and any split ' +
    'Fire Groups are discarded and the Active Player moves to Step 10.',
  conditions: [
    'Declared during Step 5 of a Shooting Attack',
    'Target must be a unit composed only of Word Bearers models',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'Reactive Player selects one model from the Reacting Unit',
    'Until the current Fire Group and any split Fire Groups resolve, only the selected model can be the Target Model',
    'If the selected model is Removed as a Casualty, the rest of the Fire Group and split Fire Groups are discarded',
    'The Active Player then moves to Step 10 of the Shooting Attack',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XVIII — SALAMANDERS: Selfless Burden
// ═══════════════════════════════════════════════════════════════════════════════

const salSelflessBurden: AdvancedReactionDefinition = {
  id: 'sal-selfless-burden',
  name: 'Selfless Burden',
  legion: LegionFaction.Salamanders,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Charge,
  triggerCondition: { type: 'duringChargeStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'At the start of Step 3 of a Charge targeting a unit composed only of Salamanders (non-Vehicle), ' +
    'all models in the Reacting Unit gain +1 to WS, Strength, and Attacks until the end of the ' +
    'Assault Phase. In the following Statuses Sub-Phase, the Reactive Player rolls D6 for each ' +
    'model in the Reacting Unit; on a 1, the unit suffers 1 automatic wound (D1, AP -, saves allowed).',
  conditions: [
    'Declared at the start of Step 3 of a Charge',
    'The Charge must target a unit composed only of Salamanders models (non-Vehicle)',
    'Reacting Unit is the target of the Charge',
  ],
  effects: [
    'All models in the Reacting Unit have WS, Strength, and Attacks modified by +1 until the end of the Assault Phase',
    'In the following Statuses Sub-Phase, roll D6 for each model in the Reacting Unit',
    'On a roll of 1, the Reacting Unit suffers 1 automatic wound with Damage 1, AP -, against which Saving Throws and Damage Mitigation Rolls may be taken',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XIX — RAVEN GUARD: Shadow Veil
// ═══════════════════════════════════════════════════════════════════════════════

const rgShadowVeil: AdvancedReactionDefinition = {
  id: 'rg-shadow-veil',
  name: 'Shadow Veil',
  legion: LegionFaction.RavenGuard,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: true,
  description:
    'When a unit composed only of Raven Guard (non-Vehicle) is targeted by a Shooting Attack, ' +
    'all models in the Reacting Unit may move a distance equal to their Initiative characteristic ' +
    'using normal movement rules (no Rush). If no models in the Reacting Unit are within LOS/Range ' +
    'of the attacker after the move, the attacker may not select a new target. All models in the ' +
    'Reacting Unit gain Shrouded (5+) for the rest of the Shooting Phase.',
  conditions: [
    'Declared when a unit composed only of Raven Guard (non-Vehicle) is targeted by a Shooting Attack',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'All models in the Reacting Unit may move a distance equal to their Initiative characteristic (no Rush)',
    'If no model in the Reacting Unit is within LOS/Range of the attacker after the move, the attacker may not select a new target this Shooting Phase',
    'All models in the Reacting Unit gain Shrouded (5+) for the remainder of the Shooting Phase',
    'The Active Player then proceeds to Step 2 of the Shooting Attack sequence',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XX — ALPHA LEGION: Smoke and Mirrors
// ═══════════════════════════════════════════════════════════════════════════════

const alSmokeAndMirrors: AdvancedReactionDefinition = {
  id: 'al-smoke-and-mirrors',
  name: 'Smoke and Mirrors',
  legion: LegionFaction.AlphaLegion,
  triggerPhase: Phase.Shooting,
  triggerSubPhase: SubPhase.Attack,
  triggerCondition: { type: 'duringShootingAttackStep', step: 3 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: false,
  description:
    'During Step 3 of a Shooting Attack targeting a unit composed only of Alpha Legion, until ' +
    'the Shooting Attack is resolved, the Precision (X) Special Rule can only inflict precision ' +
    'hits on a result of 6+, regardless of the normal value of X.',
  conditions: [
    'Declared during Step 3 of a Shooting Attack',
    'Target must be a unit composed only of Alpha Legion models',
    'Reacting Unit is the target of the Shooting Attack',
  ],
  effects: [
    'Until the Shooting Attack is resolved, Precision (X) can only trigger on a Hit Test result of 6+',
    'This overrides the normal value of X on the Precision Special Rule',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// III-H — EMPEROR'S CHILDREN HERETICUS: Twisted Desire
// ═══════════════════════════════════════════════════════════════════════════════

const ecHTwistedDesire: AdvancedReactionDefinition = {
  id: 'ec-h-twisted-desire',
  name: 'Twisted Desire',
  legion: LegionFaction.EmperorsChildren,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Charge,
  triggerCondition: { type: 'duringChargeStep', step: 2 } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: false,
  requiredAllegiance: Allegiance.Traitor,
  isHereticus: true,
  description:
    'At the end of Step 2 of a Charge targeting a unit composed only of Emperor\'s Children ' +
    '(Traitor Allegiance), the Reacting Unit becomes Stupefied and gains Feel No Pain (5+) for ' +
    'the duration of the Assault Phase.',
  conditions: [
    'Declared at the end of Step 2 of a Charge',
    'The Charge must target a unit composed only of Emperor\'s Children models',
    'Requires Traitor Allegiance (Legiones Hereticus rite)',
    'Reacting Unit is the target of the Charge',
  ],
  effects: [
    'The Reacting Unit becomes Stupefied',
    'For the duration of the Assault Phase, models in the Reacting Unit gain Feel No Pain (5+)',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// XII-H — WORLD EATERS HERETICUS: Furious Charge
// ═══════════════════════════════════════════════════════════════════════════════

const weHFuriousCharge: AdvancedReactionDefinition = {
  id: 'we-h-furious-charge',
  name: 'Furious Charge',
  legion: LegionFaction.WorldEaters,
  triggerPhase: Phase.Assault,
  triggerSubPhase: SubPhase.Charge,
  triggerCondition: { type: 'afterVolleyAttacks' } as AdvancedReactionTrigger,
  cost: 1,
  oncePerBattle: false,
  requiredAllegiance: Allegiance.Traitor,
  isHereticus: true,
  description:
    'At the end of Step 4 of a Charge targeting a unit composed only of World Eaters (Traitor ' +
    'Allegiance), if any models were removed as casualties from Volley Attacks, the Reacting Unit ' +
    'becomes Lost to the Nails. The Reactive Player then makes a Charge Roll; if successful, a ' +
    'counter-charge is made with full charge bonuses. If the roll fails, proceed to Step 5.',
  conditions: [
    'Declared at the end of Step 4 of a Charge',
    'The Charge must target a unit composed only of World Eaters models',
    'Requires Traitor Allegiance (Legiones Hereticus rite)',
    'Any models in the Target Unit (charging unit) must have been Removed as Casualties from Volley Attacks',
    'Reacting Unit is the target of the Charge',
  ],
  effects: [
    'The Target Unit (being charged) becomes Lost to the Nails',
    'The Reactive Player makes a Charge Roll for the Reacting Unit',
    'If the Charge Roll is sufficient, a Charge Move is made and units are Locked in Combat',
    'Models in the Reacting Unit gain all charge bonuses from applicable Special Rules',
    'If the Charge Roll fails, no Charge Move is made and proceed to Step 5',
  ],
};

// ═══════════════════════════════════════════════════════════════════════════════
// CONSOLIDATED ARRAY + UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All 20 legion advanced reaction definitions.
 * 18 standard (one per legion) + 2 Hereticus (EC-H, WE-H).
 */
export const LEGION_ADVANCED_REACTIONS: AdvancedReactionDefinition[] = [
  daVengeance,
  ecPerfectCounter,
  iwBitterFury,
  wsChasingWind,
  swBestialSavagery,
  ifBastionOfFire,
  nlBetterPart,
  baWrathOfAngels,
  ihSpiteOfGorgon,
  weBrutalTide,
  umRetributionStrike,
  dgBarbaranEndurance,
  tsFortressOfMind,
  sohWarriorPride,
  wbGloriousMartyrdom,
  salSelflessBurden,
  rgShadowVeil,
  alSmokeAndMirrors,
  ecHTwistedDesire,
  weHFuriousCharge,
];

/** Index by id for fast lookup */
const REACTIONS_BY_ID: Record<string, AdvancedReactionDefinition> = {};
for (const reaction of LEGION_ADVANCED_REACTIONS) {
  REACTIONS_BY_ID[reaction.id] = reaction;
}

/**
 * Look up an advanced reaction by its unique ID.
 */
export function findAdvancedReaction(id: string): AdvancedReactionDefinition | undefined {
  return REACTIONS_BY_ID[id];
}

/**
 * Get all advanced reactions available to a specific legion.
 * This includes the legion's standard reaction plus any Hereticus reactions
 * for legions that have them.
 */
export function getAdvancedReactionsForLegion(legion: ArmyFaction): AdvancedReactionDefinition[] {
  return LEGION_ADVANCED_REACTIONS.filter(r => r.legion === legion);
}
