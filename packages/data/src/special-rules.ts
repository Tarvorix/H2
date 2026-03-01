/**
 * Special Rules Dictionary
 * Reference: HH_Armoury.md (Core Special Rules), HH_Legiones_Astartes.md (LA-specific rules)
 *
 * Every special rule encoded with name, parameters, description, and pipeline hook points.
 */

import type { SpecialRuleDefinition, SpecialRuleCategory } from '@hh/types';
import { PipelineHook } from '@hh/types';

/**
 * Complete dictionary of all special rules.
 * Indexed by ID (kebab-case) for fast lookup.
 */
export const SPECIAL_RULES: Record<string, SpecialRuleDefinition> = {
  // ═══════════════════════════════════════════════════════════════════════════
  // CORE SPECIAL RULES — from HH_Armoury.md
  // ═══════════════════════════════════════════════════════════════════════════

  'armourbane': {
    id: 'armourbane',
    name: 'Armourbane',
    description: 'When making Armour Penetration Tests for an attack with this Special Rule, a result that is equal to, or greater than, the target Armour Value inflicts a Penetrating Hit. A Weapon with this Special Rule can never inflict a Glancing Hit, and any Rule that would force them to do so instead inflicts a Penetrating Hit.',
    isVariable: false,
    hooks: [PipelineHook.OnDamage],
    category: 'combat',
  },

  'assault-vehicle': {
    id: 'assault-vehicle',
    name: 'Assault Vehicle',
    description: 'A Unit that is Disembarked from another Model that has the Assault Vehicle Special Rule may have a Charge declared for it in the Charge Sub-Phase of the same Player Turn without being forced to make a Disordered Charge.',
    isVariable: false,
    hooks: [PipelineHook.OnCharge],
    category: 'transport',
  },

  'auto-repair': {
    id: 'auto-repair',
    name: 'Auto-repair',
    description: 'If the Active Player makes a Repair Test in the Statuses Sub-Phase of the End Phase for a Model with the Vehicle Type with this Special Rule, they ignore the usual Target Number of 6. Instead, the value of X attached to the variant of this Special Rule is used as the Target Number for that Repair Test.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.Passive],
    category: 'vehicle',
  },

  'barrage': {
    id: 'barrage',
    name: 'Barrage',
    description: 'If a Unit for which a Shooting Attack is made includes any Models with one or more Weapons with this Special Rule, then in Step 2 of the Shooting Attack process they may ignore the restriction on requiring Line of Sight to a Target Unit. When used with Blast weapons without LOS, an Indirect Scatter Roll is made using X dice to determine scatter distance.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'battlesmith': {
    id: 'battlesmith',
    name: 'Battlesmith',
    description: 'In the Controlling Player\'s Movement Phase, when a Model with the Battlesmith (X) Special Rule has been selected, the Controlling Player may activate this Special Rule to repair or restore a friendly Vehicle, Automata or Walker within 6". On passed Intelligence Check: Repair (restore X HP/Wounds) or Restore (remove X Statuses).',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.Passive],
    category: 'passive',
  },

  'blast': {
    id: 'blast',
    name: 'Blast',
    description: 'When making attacks with a Weapon that has the Blast (X) Special Rule, a Blast Marker of the specified size must first be placed. The Player must place the Blast Marker so that the hole in the middle is entirely over the Base of any one Model in the Target Unit. Each Model fully or partially under the marker suffers 1 Hit if the Hit Test succeeds. On a miss, Scatter Roll is made.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnHit],
    category: 'shooting',
  },

  'breaching': {
    id: 'breaching',
    name: 'Breaching',
    description: 'When any Wound Test is made for an attack with the Breaching (X) Special Rule, if the result of the Dice roll, before any modifiers are applied, is equal to or greater than the value of X, then the wound becomes a \'Breaching Wound\' — always treated as having an AP Characteristic of 2 regardless of the Weapon\'s AP.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.OnWound],
    category: 'combat',
  },

  'bulky': {
    id: 'bulky',
    name: 'Bulky',
    description: 'A Model with the Bulky (X) Special Rule does not use up 1 Point of Transport Capacity when it Embarks on a Model with the Transport Sub-Type. Instead it uses up a number of points of Transport Capacity equal to the value of X.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.Passive],
    category: 'transport',
  },

  'critical-hit': {
    id: 'critical-hit',
    name: 'Critical Hit',
    description: 'When any Hit Test is made for an attack with the Critical Hit (X) Special Rule, if the result of the Dice roll, before any modifiers are applied, is equal to or greater than the value of X, the Hit becomes a \'Critical Hit\'. A Critical Hit automatically inflicts a wound without any Dice being rolled (counting as roll of 6 for triggered rules), and increases the Damage by +1.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.OnHit],
    category: 'combat',
  },

  'deep-strike': {
    id: 'deep-strike',
    name: 'Deep Strike',
    description: 'A Unit that includes only Models with the Deep Strike Special Rule that enters play from Reserves may make a Deep Strike instead of deploying as described in the Reserves Rules. Place one Model anywhere on the Battlefield at least 1" from any enemy Model, Battlefield Edge or Impassable Terrain. Remaining models within coherency and 6" of first model. Cannot move or charge in same turn, but can shoot.',
    isVariable: false,
    hooks: [PipelineHook.Movement],
    category: 'deployment',
  },

  'deflagrate': {
    id: 'deflagrate',
    name: 'Deflagrate',
    description: 'At the end of Step 9 of the Shooting Attack process, create a new Fire Group with a number of Hits equal to the number of Unsaved Wounds caused. These Hits have Strength equal to the value of X, an AP of -, Damage of 1 and no Special Rules.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnWound],
    category: 'shooting',
  },

  'detonation': {
    id: 'detonation',
    name: 'Detonation',
    description: 'A Weapon with this Special Rule may only be selected during Step 2 of any Combat in the Fight Sub-Phase if the Unit making attacks is only Locked in Combat with enemy Units composed of Models with the Vehicle Type and Models with a Movement Characteristic of 0 or -.',
    isVariable: false,
    hooks: [PipelineHook.OnDamage],
    category: 'assault',
  },

  'duellists-edge': {
    id: 'duellists-edge',
    name: "Duellist's Edge",
    description: 'In Step 3 of the Challenge Sub-Phase (the Focus Step), if a Player has declared that the Model under their control will use a Weapon with the Duellist\'s Edge (X) Special Rule, that Player gains a bonus equal to the value of X on the Focus Roll.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnFocusRoll],
    category: 'assault',
  },

  'eternal-warrior': {
    id: 'eternal-warrior',
    name: 'Eternal Warrior',
    description: 'When a Model with the Eternal Warrior (X) Special Rule is allocated an Unsaved Wound, the Damage of the Unsaved Wound is reduced by the value of X. Cannot reduce Damage below 1.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnDamage],
    category: 'defensive',
  },

  'expendable': {
    id: 'expendable',
    name: 'Expendable',
    description: 'The number of Victory Points scored by the opponent when a Unit that includes only Models with this Special Rule is entirely Removed as Casualties is reduced by the value of X, to a minimum of 1.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnCasualty],
    category: 'army-building',
  },

  'explodes': {
    id: 'explodes',
    name: 'Explodes',
    description: 'Before a Model with the Explodes (X) Special Rule is Removed as a Casualty, the Controlling Player must roll a Dice. If the result equals or exceeds X, the Model explodes. Every Unit with one or more Models within 6" suffers a number of Hits equal to the Base Wounds/HP of the exploding Model. Each Hit is S8, AP -, D1.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.OnCasualty],
    category: 'vehicle',
  },

  'fast': {
    id: 'fast',
    name: 'Fast',
    description: 'When a Unit composed entirely of Models with the Fast (X) Special Rule elects to Rush, add the value of X to the distance the Unit can move. Likewise, when such a Unit is required to make a Charge Move, add X as a positive modifier to the Charge Roll.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.Movement, PipelineHook.OnCharge],
    category: 'movement',
  },

  'fear': {
    id: 'fear',
    name: 'Fear',
    description: 'When any Model from a Unit is within 12" of an enemy Model with the Fear (X) Special Rule, all Models in that Unit must reduce their Leadership, Willpower, Cool and Intelligence Characteristics by the value of X. Multiple instances use only the highest X.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnMorale],
    category: 'morale',
  },

  'feel-no-pain': {
    id: 'feel-no-pain',
    name: 'Feel No Pain',
    description: 'A Model with the Feel No Pain (X) Special Rule gains a Damage Mitigation Test that may be used in Step 9 of the Shooting Attack process or Step 8 of the Initiative Step. The Target Number is the value of X. May be made after and in addition to a Saving Throw.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.PreDamage],
    category: 'defensive',
  },

  'firing-protocols': {
    id: 'firing-protocols',
    name: 'Firing Protocols',
    description: 'A Model with the Firing Protocols (X) Special Rule that makes attacks as part of a Shooting Attack may make attacks with a number of Weapons equal to the value of X. The Model must have more than one Ranged Weapon and may not use the same Weapon more than once.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'force': {
    id: 'force',
    name: 'Force',
    description: 'When selected to be used, a Willpower Check may be made. If successful, the Characteristic listed as X is doubled (if AP, changed to AP 2). If a double is rolled on the Willpower Check, the Model suffers Perils of the Warp.',
    isVariable: true,
    parameterType: 'characteristic',
    hooks: [PipelineHook.PreHit],
    category: 'psychic',
  },

  'hatred': {
    id: 'hatred',
    name: 'Hatred',
    description: 'When Locked in Combat or Engaged in a Challenge with any enemy Models that have the Type or Trait that is the value of X, all Models with this variant gain a bonus of +1 to all Wound Tests made in that Combat.',
    isVariable: true,
    parameterType: 'trait',
    hooks: [PipelineHook.OnWound],
    category: 'assault',
  },

  'heavy': {
    id: 'heavy',
    name: 'Heavy',
    description: 'When making a Shooting Attack with a Weapon that has the Heavy (X) Special Rule, a modifier of +1 is added to the Characteristic named by X if the Model is part of a Unit that remained Stationary in the previous Movement Phase. If the Characteristic is AP, it improves by one step.',
    isVariable: true,
    parameterType: 'characteristic',
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'heedless': {
    id: 'heedless',
    name: 'Heedless',
    description: 'A Unit that includes any Models with this Special Rule cannot Control or Contest any Objective Marker — this overrides any other Rule or Special Rule.',
    isVariable: false,
    hooks: [PipelineHook.Passive],
    category: 'passive',
  },

  'impact': {
    id: 'impact',
    name: 'Impact',
    description: 'If a Unit that includes any Models with the Impact (X) Special Rule makes a successful Charge, then until the end of that Assault Phase, when making Melee Attacks for Models or Weapons with this Special Rule, each gains a modifier of +1 to the Characteristic named by X.',
    isVariable: true,
    parameterType: 'characteristic',
    hooks: [PipelineHook.OnCharge],
    category: 'assault',
  },

  'infiltrate': {
    id: 'infiltrate',
    name: 'Infiltrate',
    description: 'A Unit composed entirely of Models with this Special Rule may be deployed outside of the Controlling Player\'s Deployment Zone, but at least X inches from any enemy Model. Only affects initial deployment. Cannot charge in the First Battle Turn.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.Movement],
    category: 'deployment',
  },

  'light-transport': {
    id: 'light-transport',
    name: 'Light Transport',
    description: 'Models that have any variant of the Bulky (X) Special Rule may not Embark on a Model that has this Special Rule.',
    isVariable: false,
    hooks: [PipelineHook.Passive],
    category: 'transport',
  },

  'limited': {
    id: 'limited',
    name: 'Limited',
    description: 'A Weapon with the Limited (X) Special Rule may only be used to make attacks as part of a Shooting Attack or Combat a number of times equal to the value of X in a Battle.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'line': {
    id: 'line',
    name: 'Line',
    description: 'If a Unit that Controls an Objective includes a majority of Models with the Line (X) Special Rule, whenever the Controlling Player scores VP for Controlling that Objective, an additional X VP are scored. Also adds X to the Tactical Strength of a Model for objective control.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.Passive],
    category: 'army-building',
  },

  'move-through-cover': {
    id: 'move-through-cover',
    name: 'Move Through Cover',
    description: 'A Unit that includes at least one Model with the Move Through Cover Special Rule ignores the effects of Difficult Terrain and Dangerous Terrain. Automatically passes Dangerous Terrain Tests.',
    isVariable: false,
    hooks: [PipelineHook.Movement],
    category: 'movement',
  },

  'officer-of-the-line': {
    id: 'officer-of-the-line',
    name: 'Officer of the Line',
    description: 'If a Model with this Special Rule is selected to fill a Command Slot in any Detachment, the Controlling Player may select a number of additional Auxiliary Detachments equal to the value of X.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.ArmyBuilding],
    category: 'army-building',
  },

  'ordnance': {
    id: 'ordnance',
    name: 'Ordnance',
    description: 'When making a Shooting Attack with a Weapon that has the Ordnance (X) Special Rule, if the Model remained Stationary, a modifier of +1 is added to the Characteristic named by X. If the Model moved, all other weapons on that Model must fire Snap Shots.',
    isVariable: true,
    parameterType: 'characteristic',
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'outflank': {
    id: 'outflank',
    name: 'Outflank',
    description: 'A Unit composed entirely of Models with the Outflank Special Rule that enters play from Reserves may choose to enter from either short table edge instead of the owning player\'s table edge.',
    isVariable: false,
    hooks: [PipelineHook.Movement],
    category: 'deployment',
  },

  'panic': {
    id: 'panic',
    name: 'Panic',
    description: 'After resolving a Shooting Attack or Combat that included any Weapons with this Special Rule, if at least one unsaved wound was caused, the target Unit must make a Leadership Check with a negative modifier equal to X. If failed, the Unit gains the Pinned status.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnMorale],
    category: 'morale',
  },

  'phage': {
    id: 'phage',
    name: 'Phage',
    description: 'Each unsaved wound caused by an attack with this Special Rule reduces the wounded Model\'s Characteristic named by X by 1 for the duration of the Battle. Multiple instances stack.',
    isVariable: true,
    parameterType: 'characteristic',
    hooks: [PipelineHook.OnWound],
    category: 'combat',
  },

  'pinning': {
    id: 'pinning',
    name: 'Pinning',
    description: 'If at least one unsaved wound is caused by an attack with the Pinning (X) Special Rule, after the Shooting Attack is resolved, the target Unit must make a Cool Check. If failed, the Unit gains the Pinned status. X modifies the Cool Check as a negative modifier.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnWound, PipelineHook.OnMorale],
    category: 'status-inflicting',
  },

  'pistol': {
    id: 'pistol',
    name: 'Pistol',
    description: 'A Weapon with this Special Rule can be used to make Shooting Attacks even if the Model is Locked in Combat. It counts as an Assault weapon. In melee, a Model with a Pistol weapon gains +1 Attack.',
    isVariable: false,
    hooks: [PipelineHook.Passive],
    category: 'shooting',
  },

  'poisoned': {
    id: 'poisoned',
    name: 'Poisoned',
    description: 'When making Wound Tests for an attack with the Poisoned (X) Special Rule, the result required is always the value of X, regardless of the Strength and Toughness values. If the Weapon Strength is equal to or higher than the target Toughness, the attacker may re-roll failed wound rolls.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.PreWound],
    category: 'combat',
  },

  'precision': {
    id: 'precision',
    name: 'Precision',
    description: 'When making Hit Tests with a Weapon with the Precision (X) Special Rule, if the natural roll is equal to or greater than X, the Hit is a Precision Hit. For Precision Hits, the attacking Player may choose which Model in the target Unit the Hit is allocated to instead of the defending Player.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.OnHit],
    category: 'shooting',
  },

  'reaping-blow': {
    id: 'reaping-blow',
    name: 'Reaping Blow',
    description: 'A Model making attacks with a Weapon with the Reaping Blow (X) Special Rule gains a number of additional attacks equal to the value of X when in base contact with more than one enemy Model. These additional attacks must be made with the same Weapon.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.PreHit],
    category: 'assault',
  },

  'rending': {
    id: 'rending',
    name: 'Rending',
    description: 'When any Wound Test is made for an attack with the Rending (X) Special Rule, if the result of the Dice roll (before modifiers) is equal to or greater than X, the wound becomes a \'Rending Wound\' — treated as having AP 2 and its Damage Characteristic increased by 1.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.OnWound],
    category: 'combat',
  },

  'shock': {
    id: 'shock',
    name: 'Shock',
    description: 'If at least one unsaved wound or Hull Point of damage is caused by an attack with this Special Rule, the target Unit or Model gains the Status named by X (e.g., Pinned, Suppressed, Stunned). Vehicles gain the status directly without a check.',
    isVariable: true,
    parameterType: 'status',
    hooks: [PipelineHook.OnWound],
    category: 'status-inflicting',
  },

  'shred': {
    id: 'shred',
    name: 'Shred',
    description: 'When making Wound Tests for an attack with the Shred (X) Special Rule, the attacker may re-roll any Wound Test result that is less than X. Each die may only be re-rolled once.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.OnWound],
    category: 'combat',
  },

  'shrouded': {
    id: 'shrouded',
    name: 'Shrouded',
    description: 'A Model with the Shrouded (X) Special Rule gains a Cover Save equal to the value of X. This Cover Save may be used even if the Model is not in cover. If the Model already has a Cover Save, use the better value.',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.PreSave],
    category: 'defensive',
  },

  'skyfire': {
    id: 'skyfire',
    name: 'Skyfire',
    description: 'A Weapon with this Special Rule may target Models with the Flyer Sub-Type without penalty. Without Skyfire, attacks against Flyers must be made as Snap Shots.',
    isVariable: false,
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'stun': {
    id: 'stun',
    name: 'Stun',
    description: 'If at least one unsaved wound is caused by an attack with the Stun (X) Special Rule, the target Unit must make a Cool Check with a negative modifier equal to X. If failed, the Unit gains the Stunned status.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnWound],
    category: 'status-inflicting',
  },

  'support-unit': {
    id: 'support-unit',
    name: 'Support Unit',
    description: 'A Unit with this Special Rule does not fill Prime Slots and cannot benefit from Prime Slot bonuses. A Detachment may only include a number of Support Unit choices equal to the value of X per non-Support choice.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.ArmyBuilding],
    category: 'army-building',
  },

  'suppressive': {
    id: 'suppressive',
    name: 'Suppressive',
    description: 'If at least one unsaved wound is caused by an attack with the Suppressive (X) Special Rule, the target Unit must make a Cool Check with a negative modifier equal to X. If failed, the Unit gains the Suppressed status.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnWound],
    category: 'status-inflicting',
  },

  'template': {
    id: 'template',
    name: 'Template',
    description: 'A Weapon with this Special Rule uses a Template (teardrop-shaped marker) instead of making Hit Tests. The narrow end is placed touching the firing Model\'s base, pointed at the target Unit. Every Model from any Unit whose base is fully or partially under the Template is hit. No Hit Test is needed — hits are automatic.',
    isVariable: false,
    hooks: [PipelineHook.OnHit],
    category: 'shooting',
  },

  'vanguard': {
    id: 'vanguard',
    name: 'Vanguard',
    description: 'At the start of the first Battle Turn, before any Player Turn, a Unit composed entirely of Models with the Vanguard (X) Special Rule may make a free move of up to X inches. This move follows normal movement rules but is made before the game begins.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.Movement],
    category: 'deployment',
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // LEGIONES ASTARTES SPECIAL RULES — from HH_Legiones_Astartes.md
  // ═══════════════════════════════════════════════════════════════════════════

  'combi': {
    id: 'combi',
    name: 'Combi',
    description: 'Each time a Model makes a Shooting Attack with a Weapon Profile with this Special Rule, the Controlling Player can select another Profile from the same Weapon with this Special Rule and make attacks with it as part of the same Shooting Attack.',
    isVariable: false,
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'firestorm': {
    id: 'firestorm',
    name: 'Firestorm',
    description: 'When a Model with this Special Rule makes Volley Attacks, it is not required to fire Snap Shots. After making Volley Attacks in Step 4 of the Charge Procedure, a Unit containing any Models with this Special Rule is not required to make a Charge Roll in Step 5.',
    isVariable: false,
    hooks: [PipelineHook.PreHit, PipelineHook.OnCharge],
    category: 'assault',
  },

  'gun-emplacement': {
    id: 'gun-emplacement',
    name: 'Gun Emplacement',
    description: 'The hull of a Model with this Special Rule is only considered to be the central turret. The outriggers that form the gun carriage are ignored for all purposes.',
    isVariable: false,
    hooks: [PipelineHook.Passive],
    category: 'vehicle',
  },

  'impact-reactive-doors': {
    id: 'impact-reactive-doors',
    name: 'Impact Reactive Doors',
    description: 'When deployed, doors must be opened to full extent. Any Unit Embarked must Disembark in the Move Sub-Phase immediately following deployment. Models that cannot Disembark are Removed as Casualties. Once Disembarked, no Models may re-Embark for the duration of the Battle.',
    isVariable: false,
    hooks: [PipelineHook.Movement],
    category: 'transport',
  },

  'implacable-advance': {
    id: 'implacable-advance',
    name: 'Implacable Advance',
    description: 'The Controlling Player of a Model with this Special Rule treats all Ranged Weapons that do not have the Heavy (X) or Ordnance (X) Special Rule as having the Assault Trait.',
    isVariable: false,
    hooks: [PipelineHook.Passive],
    category: 'shooting',
  },

  'medic': {
    id: 'medic',
    name: 'Medic',
    description: 'Establishes the Target Number for Recovery Tests made due to Reactions or Special Rules. A Recovery Test rolls a Dice vs X — on success, a single Unsaved Wound allocated to the Model has its Damage reduced by 1 (minimum 0).',
    isVariable: true,
    parameterType: 'targetNumber',
    hooks: [PipelineHook.PreDamage],
    category: 'defensive',
  },

  'melta': {
    id: 'melta',
    name: 'Melta',
    description: 'If at least one Vehicle Model in the target Unit is within a range equal to or less than the value of X, the attack gains Armourbane and the Damage of Penetrating Hits is doubled.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnDamage],
    category: 'shooting',
  },

  'orbital-assault-vehicle': {
    id: 'orbital-assault-vehicle',
    name: 'Orbital Assault Vehicle',
    description: 'A Model with this Special Rule must be Deployed using the Deep Strike Special Rule. It may never be deployed without Deep Strike — if forced to do so, it is immediately reduced to 0 Hull Points.',
    isVariable: false,
    hooks: [PipelineHook.Movement],
    category: 'deployment',
  },

  'overload': {
    id: 'overload',
    name: 'Overload',
    description: 'When making Hit Tests with a Weapon with this Special Rule, any natural rolls equal to or less than X are Misfires. For Template weapons, roll FP dice separately — each result <= X is a Misfire. Each Misfire causes a Hit on the firing Unit using the same weapon profile.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.OnHit],
    category: 'shooting',
  },

  'rapid-tracking': {
    id: 'rapid-tracking',
    name: 'Rapid Tracking',
    description: 'Each time a Model makes a Shooting Attack as part of the Intercept Advanced Reaction, its Controlling Player can select a Weapon with this Special Rule even if it is not a Defensive Weapon.',
    isVariable: false,
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'shot-selector': {
    id: 'shot-selector',
    name: 'Shot Selector',
    description: 'When a Shooting Attack includes Weapons with this Special Rule, at Step 3 the attacking Player can select one of the following for all such Weapons: Panic (1), Breaching (4+), or Suppressive (2).',
    isVariable: false,
    hooks: [PipelineHook.PreHit],
    category: 'shooting',
  },

  'slow-and-purposeful': {
    id: 'slow-and-purposeful',
    name: 'Slow and Purposeful',
    description: 'In Step 4 of the Resolution Sub-Phase, a Player that has won Combat cannot choose for a Unit with this Special Rule to Pursue, and must select another eligible option.',
    isVariable: false,
    hooks: [PipelineHook.Passive],
    category: 'assault',
  },

  'void-shields': {
    id: 'void-shields',
    name: 'Void Shields',
    description: 'A Model with this Special Rule has X void shields. While active, each Penetrating Hit removes a void shield instead of dealing damage. Void shields can be restored.',
    isVariable: true,
    parameterType: 'numeric',
    hooks: [PipelineHook.PreDamage],
    category: 'vehicle',
  },
};

/**
 * Look up a special rule by its base name (case-insensitive, flexible matching).
 */
export function findSpecialRule(name: string): SpecialRuleDefinition | undefined {
  // Try direct ID lookup first
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (SPECIAL_RULES[id]) return SPECIAL_RULES[id];

  // Try matching by name
  return Object.values(SPECIAL_RULES).find(
    (rule) => rule.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Get all special rules that hook into a specific pipeline point.
 */
export function getSpecialRulesByHook(hook: PipelineHook): SpecialRuleDefinition[] {
  return Object.values(SPECIAL_RULES).filter((rule) => rule.hooks.includes(hook));
}

/**
 * Get all special rules in a specific category.
 */
export function getSpecialRulesByCategory(category: SpecialRuleCategory): SpecialRuleDefinition[] {
  return Object.values(SPECIAL_RULES).filter((rule) => rule.category === category);
}
