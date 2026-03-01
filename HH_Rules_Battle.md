# Horus Heresy 3.0 Rules Index: Rules of Battle

Source: [Wahapedia - The Rules of Battle](https://wahapedia.ru/heresy3/the-rules/the-rules-of-battle/)  
Compiled: 2026-02-23  
Scope: Comprehensive, structured reference for the full `Rules of Battle` page and its in-page sections.

## Table of Contents

1. [Turn Sequence](#turn-sequence)
2. [Start Phase](#start-phase)
3. [Movement Phase](#movement-phase)
4. [Shooting Phase](#shooting-phase)
5. [Assault Phase](#assault-phase)
6. [End Phase](#end-phase)
7. [Key Terms](#key-terms)

## Turn Sequence

- Battles are played in **Battle Turns** (usually four).
- Each Battle Turn contains **two Player Turns** (one per player as Active Player).
- The Mission determines who takes the first Player Turn.
- Phases in order:
  1. Start Phase
  2. Movement Phase
  3. Shooting Phase
  4. Assault Phase
  5. End Phase
- Active player = player currently taking their Player Turn.
- Reactive/Opposing player = non-active player.
- If a rule says "Player" without qualifier, it refers to the Active Player.

### Full Player Turn Sub-Phase Order

- Start Phase
  - Effects Sub-Phase
- Movement Phase
  - Reserves Sub-Phase
  - Move Sub-Phase
  - Rout Sub-Phase
- Shooting Phase
  - Attack Sub-Phase
  - Morale Sub-Phase
- Assault Phase
  - Charge Sub-Phase
  - Challenge Sub-Phase
  - Fight Sub-Phase
  - Resolution Sub-Phase
- End Phase
  - Effects Sub-Phase
  - Statuses Sub-Phase
  - Victory Sub-Phase

## Start Phase

- First phase of every Player Turn.
- Used to apply/remove effects that begin or end at turn start.

### Effects Sub-Phase

- Resolve all rules that trigger at start of the Active Player's Player Turn.
- If tests/checks are required to apply/remove these effects, resolve them here.
- Active player chooses order for those tests/checks.
- After Start Phase sub-phases are complete, proceed to Movement Phase.

## Movement Phase

- Active player moves units, handles reserves, and resolves mandatory fallback-type movement.
- Some movement (for example charges) occurs in other phases.

### Reserves Sub-Phase

- Active player makes a **Reserves Test** for each unit in Reserves or Aerial Reserves.
- Test: roll 1 die, target number **3+** (modifiers may apply).
- On success: unit may stay in reserves or enter play immediately.
- On failure: unit stays in reserves.
- If transport + embarked unit are together, make one shared reserves test.
- Continue until all eligible reserve units have been tested.

### Entering Play from Reserves

1. Select valid battlefield-edge point (normally in your deployment zone, unless a rule says otherwise).
2. Place one model at that edge point.
3. Move that model using normal Move Sub-Phase movement rules.
4. Place/move each remaining model in chosen order.
5. Remaining models must end in coherency; if a model cannot end in coherency, remove it as a casualty.
6. Unit counts as having moved.

Additional notes:

- A unit entering this way cannot also move in the same turn's Move Sub-Phase.
- It can still act in Shooting and Assault in that Player Turn.
- It may Rush while entering from reserves; if any model Rushes, treat entire unit as having Rushed.

### Move Sub-Phase

Active player may select units to move unless prevented by rules. Common restrictions:

- Entered from reserves this Player Turn.
- Has Pinned status.
- Has Routed status (moves in Rout Sub-Phase instead).
- Locked in Combat.
- Any model in unit has Movement 0 or "-".

General process:

1. Select unit not already selected this Move Sub-Phase.
2. Move it (or leave stationary).
3. Select another unit.
4. Repeat until all eligible units are resolved.

Stationary rule:

- Units that do not change position (other than pivoting) are Stationary.

### Moved vs Stationary

- A unit counts as moved only if at least one model ends phase in a different location than where it started.
- You cannot "move" and end in same place to count as moved.
- For rules needing moved distance, use start-of-phase to end-of-phase position.
- If direct line crosses impassable area/forbidden obstruction, use actual legal path distance around it.

### Moving Units

- Each model can move up to its Movement characteristic.
- Unit must end in coherency if possible.
- If unit cannot end in coherency, it gains Suppressed status.
- Models cannot end movement:
  - in impassable terrain,
  - within 1" of enemy models,
  - within 1" of friendly models locked in combat,
  - outside battlefield bounds,
  - on top of other models.
- Mixed movement values are allowed; slower/coherency constraints may limit how far individuals move.

### Line of Movement

- Opponent may ask to verify a model's movement path.
- Path may be curved but cannot cross:
  - impassable terrain,
  - terrain-piece structure/base (except area-terrain bases as allowed),
  - vehicle hulls,
  - within 1" of enemy models,
  - within 1" of models locked in combat,
  - outside battlefield.
- Crossing difficult/dangerous terrain is allowed, but if any part crosses it, model's Movement is reduced by 2 for that move (dangerous tests still apply).
- If straight-line reposition would illegally cross obstacles, path-based movement must be used.

### Rush

- Declared when selected to move in Move Sub-Phase or while entering from reserves.
- Rush distance = Movement + Initiative.
- Unit that Rushed:
  - cannot make Shooting Attacks that turn,
  - cannot declare/make a Charge that turn.
- Rush cannot be declared during Reactions.

### Wobbly Model Syndrome

- If terrain makes exact placement unstable, players may agree on a stable proxy position and track actual intended location.

### Rout Sub-Phase

- Resolve mandatory fall back and similar forced movement.
- Active player does not voluntarily pick units to move here; rules compel movement.

#### Falling Back

- Routed units do not move in Move Sub-Phase; they fall back in Rout Sub-Phase.
- Fall Back distance for each model = model's current Initiative + one shared unit die roll.
- Direction: toward nearest battlefield edge point in your deployment zone (or nearest edge if mission has no zone).
- Terrain reduces movement as normal.
- Must choose legal path that maximizes progress to target edge.
- Must maintain coherency if possible, but full-distance movement takes priority.
- Routed units ending out of coherency do **not** gain Suppressed for that reason.
- Cannot end fallback within 1" of enemy models.
- If only illegal path would violate 1", stop early at furthest legal point.
- If any model reaches contact with proper battlefield edge, it stops there.
- After movement, if one or more models touched that edge:
  - make Leadership Check for unit,
  - fail: remove all models in unit as casualties,
  - pass: lose Routed, gain Suppressed.

## Shooting Phase

- Active player may make one Shooting Attack per eligible unit.
- Status checks from shooting outcomes are resolved after attacks in Morale Sub-Phase.

### Attack Sub-Phase

Common ineligibility:

- Unit Rushed this turn.
- Unit is Locked in Combat.
- Unit is Embarked.

Process:

1. Select each of your battlefield units.
2. For each eligible unit, choose to shoot or not shoot.
3. After all are resolved, move to Morale Sub-Phase.

### Shooting Attack Procedure

1. Select Target Unit.
2. Check Target.
3. Declare Weapons.
4. Set Fire Groups.
5. Select Fire Group to Resolve.
6. Make Hit Tests.
7. Make Wound Tests (or Armour Penetration Tests vs vehicles).
8. Select Target Model.
9. Make Saving Throws and Damage Mitigation Tests.
10. Select Next Fire Group.
11. Remove Casualties.

#### 1. Select Target Unit

- Must be one enemy unit.
- Cannot target:
  - embarked unit,
  - unit in reserves,
  - removed unit,
  - unit in combat.

#### 2. Check Target

- At least one attacker must have LOS to at least one target model.
- Only attacker models with LOS may shoot.
- If no valid LOS, either choose a new target (if allowed) or end attack.
- Against vehicles, determine targeted facing here:
  - facing seen by majority of attackers is targeted,
  - if multiple facings qualify, target unit controller chooses.

#### 3. Declare Weapons

- Each attacking model uses one eligible weapon (unless a rule allows more).
- Multi-profile weapons: choose one profile per weapon in this attack.
- Weapon must be in range and LOS to at least one target model.
- If no models can shoot target, choose new target or end attack.

#### 4. Set Fire Groups

- Group attacks by weapon name.
- Split further when needed by:
  - different weapon profiles,
  - different Ballistic Skill values among shooters.
- Fire Groups are resolved one at a time in attacker-chosen order.

#### 5. Select Fire Group

- Pick one fire group and resolve it fully before another.

#### 6. Make Hit Tests

- Number of tests = sum of Firepower values in selected group.
- Keep successes as Hits in that same group.
- If group yields no hits, discard it and pick another.

Fast rolling note:

- Batch rolling is explicitly permitted where target numbers/results match.

#### Splitting Fire Groups

- If a special rule modifies only some hits/wounds/unsaved wounds, split them into separate groups (modified vs unmodified).
- Resolve unmodified first, then return to set-aside modified group when required.
- Set-aside groups take priority when choosing next group.

#### 7. Make Wound Tests

- Number of tests = hits in selected group.
- Use majority Toughness of target unit (ties use highest tied value).
- Against vehicles:
  - use Armour Penetration Tests instead,
  - use facing determined in Step 2.
- Penetrating hits are kept for Step 8.
- Glancing hits are set aside for Step 11.
- If no successful wound/penetration results, discard group.

#### 8. Select Target Model

- Defender chooses any model in target unit as target model.
- If an eligible model already has lost wounds/hull points, that model must be selected first unless it has Paragon type or Command subtype.
- Wound-only pool cannot be assigned to vehicle models.
- Penetrating-only pool must be assigned to vehicle models.
- Mixed pool requires separate target models by damage type.

#### 9. Saving Throws and Damage Mitigation

- Apply wounds/penetrating hits one at a time.
- Per applied wound/hit:
  - attempt one saving throw (if available),
  - if failed, attempt damage mitigation (if available).
- If not discarded, it becomes an unsaved wound/hit and deals weapon Damage to wounds/hull points.
- If target reaches 0, set aside as casualty and choose new target model.

Fast rolling note:

- Batch save rolling is allowed when defensive profiles are identical.

#### 10. Select Next Fire Group

- If groups remain and target still has models, pick another and continue at hit tests.

#### 11. Remove Casualties

- Remove all set-aside casualties from play.
- Mark/check units that may need panic or other morale checks.
- For vehicles, roll Vehicle Damage Table once per glancing hit in this step.

### Morale Sub-Phase

- Resolve status-related checks caused by shooting (both players as required).

Most common triggers:

- Out of Coherency after casualties:
  - Cool Check; fail => Suppressed.
- Panic threshold:
  - if casualties from a shooting attack are at least 25% of unit size at start of that attack, Leadership Check; fail => Routed.

General rules:

- A unit cannot take more than one check for the same status in this sub-phase.
- If multiple rules would apply same status, Active player chooses one check to make.
- If a unit must check for multiple different statuses:
  1. resolve Routed checks first,
  2. if Routed is failed, ignore other checks.
- Status effects apply at end of Morale Sub-Phase (not retroactively during attacks).

## Assault Phase

- Active player declares charges and both players resolve ongoing combats.
- Sub-phases in order:
  1. Charge
  2. Challenge
  3. Fight
  4. Resolution

### Assault Terminology

- Assault: full process from declaring a charge through combat resolution.
- Combat: two or more units with base-to-base engagement.
- Locked in Combat: units still in base contact after assault sequence and not forced out.
- Charge: special multi-step move; models may end in base contact with enemy.

### Charge Sub-Phase

Common ineligibility:

- Unit Rushed this turn.
- Unit is Locked in Combat.
- Unit is Embarked.
- Unit includes Pinned or Routed models.

For each eligible unit, choose to charge or skip.

#### Charge Procedure

1. Declare Target.
2. Check LOS and Maximum Charge Range.
3. Make Set-up Move.
4. Make Volley Attacks.
5. Make Charge Move.

### Charges and Statuses

- Units with statuses can be charge targets.
- Units with Pinned or Routed cannot have charge declared for them.
- Target units with Stunned or Suppressed can be charged.
- Charges involving certain tactical statuses can become Disordered.

#### 1. Declare Target

- Choose one enemy unit as target.

#### 2. Check LOS and Maximum Charge Range

- Need at least one charging model with LOS to target.
- Check closest LOS-visible charging model to closest LOS-visible target model:
  - if 12" or less, continue,
  - if over 12", charge cannot continue.

#### 3. Make Set-up Move

- Optional if charge is legal.
- Set-up Move distance is determined from `Initiative + Movement` table.
- Model must move maximum possible distance unless it reaches base contact with target.

Set-up Move Distance Table:

| I + M Total | Move |
|---|---|
| 1-6 | 1" |
| 7-9 | 2" |
| 10-11 | 3" |
| 12-13 | 4" |
| 14-19 | 5" |
| 20+ | 6" |

Set-up Move details:

- Initial mover is closest model by shortest legal route.
- Set-up Move ignores difficult terrain penalties (dangerous tests still apply).
- Model may move within any distance of enemy and may end in base contact with target unit.
- Cannot contact non-target enemy during set-up.
- Remaining models move in chosen order, as close as possible to target, preserving coherency if possible.
- If any charging model is in base contact with target after set-up:
  - charge is complete immediately,
  - skip volley attacks and charge move,
  - target does not make Overwatch.

#### Disordered Charge

Effects:

- Charging unit cannot make Set-up Move.
- Charging unit cannot make Volley Attack (target may still volley).
- Cannot claim bonuses that require successful charge.
- Charging models cannot manifest Blessings or Curses.

Common causes:

- Unit disembarked in same turn it charges.
- Charging unit includes Stunned or Suppressed models.

#### 4. Make Volley Attacks

- After set-up (or skipping set-up), charging unit and/or target unit may make volley attacks.
- If target unit is already locked in combat with others, neither side may make volley attacks or Overwatch.
- Units with tactical statuses may still volley.
- Units with Routed or Stunned tactical statuses cannot declare Overwatch.
- Volley attack uses shooting attack rules, with limits:
  - assault-trait weapons only,
  - all attacks are snap shots.
- Charging unit resolves first, then target unit.
- Either side may choose not to volley.
- Volley attacks here cannot inflict statuses.
- If one side is wiped during this step, charge sequence ends.

Overwatch note:

- Overwatch here is an upgraded volley:
  - can use any weapon,
  - shoots at full BS instead of snap shots.

#### 5. Make Charge Move

- Roll 2 dice, discard lowest; remaining die = charge roll.
- If charge roll is less than current closest legal LOS-to-LOS distance, charge fails:
  - no move,
  - make Cool Check,
  - if failed, charging unit gains Stunned.
- If successful, charge move is mandatory.

Charge move details:

- Initial charger is closest model by shortest legal path.
- Move initial charger up to charge roll distance toward nearest target model.
- Charge move ignores difficult terrain penalties (dangerous tests still apply).
- Models can move within any distance of enemy and end in base contact.
- Contact with non-target units is only allowed if unavoidable for legal contact/coherency.
- Remaining models move similarly, preserving coherency if possible.
- End state:
  - if at least one charging model contacts target unit, units are Locked in Combat,
  - otherwise charge fails; make Cool Check, fail => Stunned.

### Challenge Sub-Phase

- Active player may issue challenges in eligible combats.

Model eligibility:

- Has Paragon type, Command/Champion subtype, or rule allowing challenge participation.
- Is locked in combat with an enemy unit that also has at least one eligible model.
- Is not Routed.

Notes:

- Active player selects eligible combats one by one.
- For each selected combat: issue challenge and resolve, or pass.
- Reactive player can still force challenge via Heroic Intervention reaction when applicable.

#### Challenge Procedure

1. Declare Challenge.
2. Face-Off.
3. Focus.
4. Strike.
5. Glory.

#### 1. Declare Challenge

- Select an eligible combat.
- Choose to issue challenge or pass.
- If issued:
  - select Challenger,
  - opponent may select Challenged.
- If opponent declines/cannot accept:
  - issuer applies Disgraced to one eligible enemy model,
  - move to next eligible combat.
- If accepted:
  - Challenger and Challenged are removed from main combat and placed in base contact aside.
  - They are treated as out of play until Resolution Sub-Phase return.
- If removing them leaves no other base contact, non-challenge models make pile-in moves (active player first).

#### Disgraced Status

- Affected model has Weapon Skill and Leadership halved for that Assault Phase.
- Unit-level effects of statuses also apply (including Combat Initiative becoming 1).
- Automatically removed in the End Phase of the same Player Turn (unless removed earlier by another rule).
- Can coexist with Routed in same unit.

#### 2. Face-Off

- Each player chooses one gambit for their model.
- First challenge round: challenger's controller chooses first gambit.
- Later rounds: player with Challenge Advantage chooses first gambit.
- Contradictory effects: gambit chosen by player with Challenge Advantage takes precedence (or Active player if no advantage).
- Same gambit cannot be chosen by multiple models in the same Face-Off step.

Core Gambits:

- Seize the Initiative: roll extra focus die, discard lowest.
- Flurry of Blows: +D3 attacks; hits from those bonus attacks have fixed damage 1, not modifiable.
- Test the Foe: no immediate combat boost; if model survives, gain automatic Challenge Advantage at start of next Face-Off.
- Guard Up: +1 WS, but only one attack; each enemy miss grants +1 to next focus roll if challenge continues.
- Taunt and Bait: your WS and A become enemy's values (or one lower if already equal); each selection adds +1 Combat Resolution Point if you win that challenge.
- Grandstand: roll extra focus die and discard highest; no outside-support focus bonus; outside-support value is added to attacks in Strike instead.
- Feint and Riposte: only available to player choosing first gambit; name a gambit opponent cannot choose this Face-Off.
- Withdraw: only one attack; if model survives, may end challenge in Glory with no Combat Resolution Points awarded.
- Finishing Blow: roll extra focus die and discard highest; +1 Strength and +1 Damage on hits in Strike.

#### 3. Focus

- Each player picks one weapon for challenge attacks (Reactive player picks first).
- Each model then rolls Focus:
  - roll one die,
  - add Combat Initiative score,
  - apply modifiers.

Focus modifiers:

- Heavy subtype: -1.
- Per wound currently missing from base value: -1 each.
- Duellist's Edge (X): +X.
- Light subtype: +1.
- Outside Support bonus as applicable.

Combat Initiative calculation:

- Start with current Initiative.
- Apply weapon initiative modifier:
  - `+/-/x` style modifies the current value,
  - fixed number replaces current value,
  - `1` means no change.

Focus result:

- Higher total gains Challenge Advantage:
  - attacks first in Strike,
  - gains +1 attacks for that Strike step only.
- Ties are rerolled until one side wins.

Outside Support:

- Standard: +1 focus for each 5 friendly engaged models in same combat.
- Exclusions: Vehicle/Automata not counted; Walker counts as 5.
- Pinned/Stunned/Routed/Suppressed models are normally not counted.
- One-sided support case (only one challenger has additional friendly models):
  - supporting side gets +2 per five models (or fraction) not in challenge,
  - those models do not need to be engaged,
  - statuses do not prevent counting in this special case,
  - Vehicle/Automata still excluded.

#### 4. Strike

- Challenge Advantage determines attack order; normal initiative does not.
- Each model's attacks form strike groups as needed.

Per attacking model:

1. Make Hit Tests (using opposing model WS).
2. Make Wound Tests (using opposing model Toughness; against armour values use armour penetration).
3. Opponent makes saves and damage mitigation.
4. Apply unsaved damage to wounds/hull points.

Challenge result during/after Strike:

- If one model is removed, other is challenge winner; move to Glory.
- If both survive, challenge is a draw for now:
  - player with Challenge Advantage chooses to continue (repeat Face-Off/Focus/Strike) or proceed to Glory.
- Repeats are unlimited.

#### 5. Glory

- If a model was slain:
  - winner gains Combat Resolution Points equal to slain model's base wounds,
  - +1 additional point if slain model had Paragon type or Command subtype.
- If both models live:
  - model that inflicted more wounds wins,
  - gains points equal to wounds inflicted.
- Draw cases (no wounds, equal wounds, both slain): no points.
- Then return to Declare Challenge for another eligible combat, or end Challenge Sub-Phase if none remain.

#### Returning Challenge Participants

- Surviving challenge models stay aside until Resolution Sub-Phase step that returns them.
- Returned model placement:
  - must be in coherency with original unit,
  - must be engaged with enemy if possible.
- If original unit was wiped in Fight Sub-Phase:
  - place model in base contact with enemy unit it was locked with at challenge start.
- Challenge participants do not attack and cannot be allocated wounds during intervening Fight Sub-Phase.
- Their challenge-generated Combat Resolution effects still apply in resolution.

### Fight Sub-Phase

- Active player selects each combat once, in chosen order.
- Resolve one combat round per selected combat.
- Only units locked in combat at start of Fight Sub-Phase can attack this sub-phase.

Fight sub-phase procedure:

1. Determine Combat Units.
2. Declare Weapons and Set Initiative Steps.
3. Resolve First Initiative Step.
4. Continue Resolving Initiative Steps.
5. Make Final Pile-in Moves.

#### Fight Terminology

- Combat Round: one full pass through initiative steps for a combat.
- Initiative Step: attack window for models with that combat initiative value, resolved high to low.
- Combat Initiative Score: model initiative adjusted by weapon initiative modifier.

#### 1. Determine Combat Units

- Units in base contact are locked and part of a combat.
- A unit touching multiple enemy units merges them into one combat.
- Multiple friendly units touching one enemy unit are also one combat.
- A unit can only make attacks in one combat per Assault Phase.

#### 2. Declare Weapons and Set Initiative Steps

- Reactive player declares first, then Active player.
- Each model picks one melee weapon for this combat.
- If a model has no melee weapon, it uses basic close combat profile.
- Initiative steps are created from all distinct combat initiative scores present.
- Resolve steps from highest to lowest.
- Models removed before their step do not attack.

Basic close combat profile (fallback weapon):

- Initiative Modifier: 1
- Attack Modifier: A
- Strength Modifier: S-1
- AP: none
- Damage: none
- Weapon type: melee

#### 3. Resolve First Initiative Step

- Resolve highest initiative step first using full initiative-step process.

#### 4. Continue Initiative Steps

- Resolve remaining steps in descending order, each fully before next.

#### 5. Make Final Pile-in Moves

- Models in the combat not in base contact with eligible enemy must pile in.

Pile-in summary:

- Move distance = model's current Initiative.
- Must try to reach base contact with eligible target.
- If impossible, move as close as possible.
- Eligible targets include:
  - enemy in same combat if model is locked,
  - enemy from unit this model's unit charged,
  - enemy from unit that charged this model's unit.
- If no eligible targets, no pile-in.
- Pile-in ignores difficult-terrain movement penalties; dangerous tests still apply.

### Resolving an Initiative Step

Process:

1. Declare Combatants.
2. Make Pile-in Moves for Combatants.
3. Declare Engaged Models.
4. Set Strike Groups.
5. Make Hit Tests.
6. Make Wound Tests.
7. Select Strike Group and Target Model.
8. Make Saving Throws and Damage Mitigation Rolls.
9. Select Next Strike Group.
10. Remove Casualties.

Status timing rule:

- Any model with any status attacks at Initiative Step 1, regardless of modifiers or special rules.

#### 1. Declare Combatants

- Starting with Active player, each side identifies models eligible to attack in this initiative step.

#### 2. Pile-in for Combatants

- Combatants not in base contact make pile-in (Active side first, then Reactive).

#### 3. Declare Engaged Models

- Only engaged combatants can attack.
- Engaged means:
  - in base contact with enemy in same combat, or
  - within 2" of friendly model in same unit that is in base contact.
- If a model could attack more than one enemy unit, controller chooses which enemy unit it targets.

#### 4. Set Strike Groups

- Group attacks by weapon name.
- Split by profile/WS differences and by different target units.
- Active player chooses strike-group resolution order.

#### 5. Make Hit Tests

- For selected group, total attacks and roll hit tests.
- Use majority WS of target unit (ties use highest tied WS).
- Keep successes in group; discard failed groups with no hits.
- Batch rolling is supported.

Strike-group splitting:

- If some results become modified by special rules, split into modified and unmodified groups and resolve accordingly.

#### 6. Make Wound Tests

- Roll wound tests for hits in each group.
- Use majority Toughness of target unit (ties use highest tied toughness).
- Against vehicle targets in Fight Sub-Phase:
  - use armour penetration tests,
  - always target rear armour regardless of model positions.
- Penetrating hits continue to target-model allocation.
- Glancing hits are set aside for casualty removal step.

#### 7. Select Strike Group and Target Model

- Remaining groups are divided by defending side.
- Active player selects from claimed groups first; if none, opposing player selects theirs.
- Defender picks target model in target unit.
- Already-damaged model must be selected first unless it has Command subtype.
- Wound-only pools cannot target vehicles; penetration-only pools must target vehicles.
- If no legal target model exists, remaining results are discarded.

#### 8. Saves and Damage Mitigation

- Resolve each wound/penetrating hit one at a time:
  - saving throw (one max per wound/hit),
  - then mitigation if save fails.
- Undiscarded damage becomes unsaved and reduces wounds/hull points.
- At 0 or less, model is set aside as casualty and new target model is selected.
- Batch save rolling allowed where appropriate.

#### 9. Select Next Strike Group

- If groups remain, return to target-model selection.

#### 10. Remove Casualties

- Remove all set-aside casualties from play.
- Vehicles roll Vehicle Damage Table once per glancing hit from this step.
- Track casualty counts for Resolution Sub-Phase.
- If only one side remains in combat after removals:
  - combat is a Total Victory,
  - units are no longer locked,
  - see massacre handling.

### Resolution Sub-Phase

- Return challenge participants first.
- Active player selects each combat that fought a combat round this Assault Phase.
- Resolve combat resolution process for each.

Combat resolution process:

1. Total Combat Resolution Points.
2. Declare Winner.
3. Make Panic Checks.
4. Aftermath.

#### Massacres

- If one side was fully removed in a combat round, surviving units skip normal point comparison and go straight to Aftermath step where they must Consolidate.
- If challenge participants return to a unit that was wiped during Fight Sub-Phase, it is not treated as a massacre and normal resolution still occurs.

#### 1. Total Combat Resolution Points

Point sources include:

- +1 per enemy model removed in Fight Sub-Phase.
- +1 for player currently controlling most models in the combat.
- Challenge outcomes/gambits can award points.
- Wargear/special rules may add points.

If a player has multiple units in the combat, use one pooled total for that player.

#### 2. Declare Winner

- Highest total wins, opponent loses.
- Tie: no winner/loser.
- If winner exists, proceed to panic checks.
- If tie, proceed directly to aftermath.

#### 3. Make Panic Checks

- Losing player makes one Leadership Check.
- Use majority Leadership of one chosen losing-side unit in that combat (if multiple units, choose one).
- If any losing-side unit includes Command or Sergeant subtype, that model's leadership may be used.
- Apply negative modifier equal to difference in combat resolution points.
- Failed check: all losing-side models in combat gain Routed.
- Passed check: no additional effect.
- If all losing-side models were already Routed, no check is made.

#### 4. Aftermath

- Each unit in combat chooses an allowed aftermath option.
- Losing player declares all their choices first.
- If combat was draw, Active player chooses who selects first.

Availability:

- Unit with Routed models: must Fall Back.
- Unit without Routed models: may Hold, Disengage, or Fall Back.
- Disengage is only available to units that lost (not winner/draw units).
- If all enemy units are Falling Back or Disengaging, winner may choose Pursue, Gun Down, or Consolidate.

Aftermath options:

- Hold:
  - immediate pile-in for all models,
  - if any model remains in base contact, unit stays locked.
- Disengage:
  - immediate move up to each model's Movement away from enemies in that combat,
  - if a model cannot move without getting closer, unit cannot disengage and must Hold,
  - must end in coherency and not in base contact,
  - if end out of coherency or in base contact, unit gains Routed,
  - may move through enemy models from same combat despite normal 1" restrictions,
  - if would end within 2" of enemy still in that combat, extend move minimally so end is more than 2" away.
- Fall Back:
  - gain Routed if not already,
  - make immediate fall back move.
- Consolidate:
  - move up to Initiative in any direction,
  - must end in coherency and at least 2" from enemies,
  - terrain does not reduce this distance (dangerous tests still apply).
- Gun Down:
  - make volley-style shooting attack at one enemy unit that fell back from this combat,
  - assault-trait weapons only.
- Pursue:
  - roll one die per pursuing unit,
  - each model moves Initiative + die result directly toward nearest enemy model from a unit that fell back,
  - if any pursuer reaches base contact, it counts as a successful charge and becomes locked.

## End Phase

- Last phase of Player Turn.
- Ends Player Turn; if it was second Player Turn of Battle Turn, also ends that Battle Turn.
- Players continue until mission-defined number of Battle Turns is reached.

### Effects Sub-Phase

- Resolve rules that begin/end at turn end.
- Resolve any tests/checks those effects require.
- Active player chooses check order.
- Reactive player's unspent Reaction Points are discarded and do not carry over.

### Statuses Sub-Phase

- Active player resolves checks/repair tests to remove statuses from their units.
- Resolve unit by unit until all eligible status-removal checks are completed.

### Victory Sub-Phase

- Mission-specific rules may award Victory Points here.
- Conditions and points are determined by mission rules.

## Key Terms

- Turn:
  - battle-level progression unit; battle ends after final turn is fully resolved.
- Phases:
  - each Player Turn resolves Start, Movement, Shooting, Assault, End in order.
- Battle Turn:
  - all players completing one Player Turn as Active player (usually two Player Turns total).
- Player Turn:
  - one full phase cycle with the same Active player.
- Player:
  - person controlling units/models and making rolls; rules distinguish Active, Reactive, and Controlling player contexts.

## Notes

- This file is a structured compilation/index for rapid rules lookup.
- For disputes, always use the latest official wording and errata on the source page.
