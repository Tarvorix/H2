import type {
  BlastPlacement,
  DeclareShootingCommand,
  GameState,
  ModelState,
  TemplatePlacement,
  UnitState,
} from '@hh/types';
import type { CommandResult, DiceProvider, GameEvent } from '../types';
import {
  findUnit,
  getAliveModels,
  getClosestModelDistance,
  getModelsWithLOSToUnit,
} from '../game-queries';
import { lookupModelDefinition, lookupUnitProfile } from '../profile-lookup';
import { handleShootingAttack } from '../phases/shooting-phase';
import type { ShootingAttackExecutionOptions } from '../phases/shooting-phase';
import { resolveWeaponAssignment } from './weapon-declaration';
import { formFireGroups } from './fire-groups';
import { getBlastSizeInches } from './special-shot-resolution';
import { isDefensiveWeapon } from './return-fire-handler';
import type {
  ResolvedWeaponProfile,
  WeaponAssignment,
} from './shooting-types';

export interface OutOfPhaseWeaponFilterContext {
  attackerUnit: UnitState;
  targetUnit: UnitState;
  attackerModel: ModelState;
  targetDistance: number;
  weaponProfile: ResolvedWeaponProfile;
}

export interface OutOfPhaseShootingOptions extends ShootingAttackExecutionOptions {
  defensiveWeaponsOnly?: boolean;
  weaponFilter?: (context: OutOfPhaseWeaponFilterContext) => boolean;
}

export interface OutOfPhaseShootingResult {
  state: GameState;
  events: GameEvent[];
  accepted: boolean;
  fired: boolean;
  casualtiesInflicted: number;
}

function getModelWeaponIds(model: ModelState, unit: UnitState): string[] {
  if (model.equippedWargear.length > 0) {
    return [...new Set(model.equippedWargear)];
  }

  const profile = lookupUnitProfile(unit.profileId);
  const modelDefinition = lookupModelDefinition(unit.profileId, model.profileModelName);
  const fallback = [
    ...(profile?.defaultWargear ?? []),
    ...(modelDefinition?.defaultWargear ?? []),
  ];

  return [...new Set(fallback)];
}

function scoreWeaponProfile(weaponProfile: ResolvedWeaponProfile): number {
  const apScore = weaponProfile.ap === null ? 0 : Math.max(0, 7 - weaponProfile.ap) * 3;
  const blastScore = getBlastSizeInches(weaponProfile.specialRules) ?? 0;
  const templateScore = weaponProfile.hasTemplate ? 8 : 0;
  const limitedPenalty = weaponProfile.specialRules.some(
    (rule) => rule.name.toLowerCase() === 'limited',
  ) ? 4 : 0;

  return (
    weaponProfile.firepower * 4 +
    weaponProfile.rangedStrength * 2 +
    weaponProfile.damage * 5 +
    apScore +
    blastScore * 2 +
    templateScore -
    limitedPenalty
  );
}

function getNearestTargetPosition(targetUnit: UnitState, from: { x: number; y: number }): { x: number; y: number } | null {
  const targetModels = getAliveModels(targetUnit);
  if (targetModels.length === 0) {
    return null;
  }

  let nearest = targetModels[0].position;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const targetModel of targetModels) {
    const dx = targetModel.position.x - from.x;
    const dy = targetModel.position.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < nearestDistance) {
      nearest = targetModel.position;
      nearestDistance = distance;
    }
  }

  return nearest;
}

export function buildOutOfPhaseShootingCommand(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  options: OutOfPhaseShootingOptions = {},
): DeclareShootingCommand | null {
  const attackerUnit = findUnit(state, attackerUnitId);
  const targetUnit = findUnit(state, targetUnitId);
  if (!attackerUnit || !targetUnit) {
    return null;
  }

  const targetDistance = getClosestModelDistance(state, attackerUnitId, targetUnitId);
  if (!Number.isFinite(targetDistance)) {
    return null;
  }

  const modelsWithLOS = new Set(
    getModelsWithLOSToUnit(state, attackerUnitId, targetUnitId).map((model) => model.id),
  );

  const weaponSelections: WeaponAssignment[] = [];

  for (const model of getAliveModels(attackerUnit)) {
    if (!modelsWithLOS.has(model.id)) {
      continue;
    }

    const candidateWeapons = getModelWeaponIds(model, attackerUnit)
      .map((weaponId) => {
        const baseProfile = resolveWeaponAssignment({ modelId: model.id, weaponId }, attackerUnit);
        if (!baseProfile) {
          return null;
        }

        const weaponProfile = options.weaponProfileModifier
          ? options.weaponProfileModifier(baseProfile, { modelId: model.id, weaponId })
          : baseProfile;

        if (
          options.defensiveWeaponsOnly &&
          !isDefensiveWeapon(weaponProfile.rangedStrength, weaponProfile.traits)
        ) {
          return null;
        }

        if (!weaponProfile.hasTemplate && targetDistance > weaponProfile.range) {
          return null;
        }

        if (
          options.weaponFilter &&
          !options.weaponFilter({
            attackerUnit,
            targetUnit,
            attackerModel: model,
            targetDistance,
            weaponProfile,
          })
        ) {
          return null;
        }

        return {
          weaponId,
          weaponProfile,
        };
      })
      .filter((candidate): candidate is { weaponId: string; weaponProfile: ResolvedWeaponProfile } =>
        candidate !== null,
      );

    if (candidateWeapons.length === 0) {
      continue;
    }

    candidateWeapons.sort(
      (left, right) => scoreWeaponProfile(right.weaponProfile) - scoreWeaponProfile(left.weaponProfile),
    );

    weaponSelections.push({
      modelId: model.id,
      weaponId: candidateWeapons[0].weaponId,
    });
  }

  if (weaponSelections.length === 0) {
    return null;
  }

  const fireGroups = formFireGroups(
    weaponSelections,
    attackerUnit,
    [...modelsWithLOS],
    targetDistance,
    options.countsAsStationary === true,
    options.forceNoSnapShots === true,
    options.forceSnapShots === true,
    options.weaponProfileModifier,
    state,
  );

  const blastPlacements: BlastPlacement[] = [];
  const templatePlacements: TemplatePlacement[] = [];

  for (const fireGroup of fireGroups) {
    if (fireGroup.weaponProfile.hasTemplate) {
      const sourceModelId = fireGroup.attacks[0]?.modelId;
      if (!sourceModelId) {
        continue;
      }

      const sourceModel = attackerUnit.models.find((model) => model.id === sourceModelId);
      if (!sourceModel) {
        continue;
      }

      const targetPosition = getNearestTargetPosition(targetUnit, sourceModel.position);
      const directionRadians = targetPosition
        ? Math.atan2(
            targetPosition.y - sourceModel.position.y,
            targetPosition.x - sourceModel.position.x,
          )
        : 0;

      templatePlacements.push({
        sourceModelId,
        directionRadians,
      });
      continue;
    }

    if (getBlastSizeInches(fireGroup.specialRules) === null) {
      continue;
    }

    const sourceModel = attackerUnit.models.find((model) => model.id === fireGroup.attacks[0]?.modelId);
    const targetPosition = getNearestTargetPosition(targetUnit, sourceModel?.position ?? targetUnit.models[0]?.position ?? { x: 0, y: 0 });
    if (!targetPosition) {
      continue;
    }

    blastPlacements.push({
      sourceModelIds: fireGroup.attacks.map((attack) => attack.modelId),
      position: targetPosition,
    });
  }

  return {
    type: 'declareShooting',
    attackingUnitId: attackerUnitId,
    targetUnitId,
    weaponSelections,
    blastPlacements,
    templatePlacements,
  };
}

export function executeOutOfPhaseShootingAttack(
  state: GameState,
  attackerUnitId: string,
  targetUnitId: string,
  dice: DiceProvider,
  options: OutOfPhaseShootingOptions = {},
): OutOfPhaseShootingResult {
  const priorShootingAttackState = state.shootingAttackState;
  const targetBefore = findUnit(state, targetUnitId);
  const aliveBefore = targetBefore ? getAliveModels(targetBefore).length : 0;

  const command = buildOutOfPhaseShootingCommand(
    state,
    attackerUnitId,
    targetUnitId,
    options,
  );

  if (!command) {
    return {
      state,
      events: [],
      accepted: true,
      fired: false,
      casualtiesInflicted: 0,
    };
  }

  const result: CommandResult = handleShootingAttack(state, command, dice, {
    allowOutOfPhaseAttack: true,
    allowNonActiveAttacker: true,
    ignoreRushedRestriction: true,
    ignoreHasShotRestriction: true,
    allowReturnFireTrigger: false,
    persistShootingAttackState: false,
    consumeShootingAction: false,
    ...options,
  });

  if (!result.accepted) {
    return {
      state: {
        ...result.state,
        shootingAttackState: priorShootingAttackState,
      },
      events: result.events,
      accepted: false,
      fired: true,
      casualtiesInflicted: 0,
    };
  }

  const restoredState = {
    ...result.state,
    shootingAttackState: priorShootingAttackState,
  };
  const targetAfter = findUnit(restoredState, targetUnitId);
  const aliveAfter = targetAfter ? getAliveModels(targetAfter).length : 0;

  return {
    state: restoredState,
    events: result.events,
    accepted: true,
    fired: true,
    casualtiesInflicted: Math.max(0, aliveBefore - aliveAfter),
  };
}
