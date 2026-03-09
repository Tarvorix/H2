import type { ArmyList, ArmyListDetachment, ArmyListUnit } from '@hh/types';
import { BattlefieldRole, DetachmentType } from '@hh/types';
import { findDetachmentTemplate } from '@hh/data';

export const ROSTER_FEATURE_VERSION = 1;
export const ROSTER_FEATURE_DIMENSION = 10;

function clampFeature(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function collectUnits(armyList: ArmyList): ArmyListUnit[] {
  return armyList.detachments.flatMap((detachment) => detachment.units);
}

function countSlots(
  detachments: ArmyListDetachment[],
  predicate: (slot: NonNullable<ReturnType<typeof findDetachmentTemplate>>['slots'][number]) => boolean,
): number {
  return detachments.reduce((sum, detachment) => {
    const template = findDetachmentTemplate(detachment.detachmentTemplateId);
    if (!template) return sum;
    return sum + template.slots.filter(predicate).length;
  }, 0);
}

function countFilledSlots(
  detachments: ArmyListDetachment[],
  predicate: (slot: NonNullable<ReturnType<typeof findDetachmentTemplate>>['slots'][number]) => boolean,
): number {
  return detachments.reduce((sum, detachment) => {
    const template = findDetachmentTemplate(detachment.detachmentTemplateId);
    if (!template) return sum;

    const roleFillCounts = new Map<BattlefieldRole, number>();
    for (const unit of detachment.units) {
      roleFillCounts.set(
        unit.battlefieldRole,
        (roleFillCounts.get(unit.battlefieldRole) ?? 0) + 1,
      );
    }

    let detachmentFilled = 0;
    for (const slot of template.slots.filter(predicate)) {
      const remaining = roleFillCounts.get(slot.role) ?? 0;
      if (remaining > 0) {
        detachmentFilled += 1;
        roleFillCounts.set(slot.role, remaining - 1);
      }
    }
    return sum + detachmentFilled;
  }, 0);
}

function countRoleUnits(units: ArmyListUnit[], role: BattlefieldRole): number {
  return units.filter((unit) => unit.battlefieldRole === role).length;
}

function countDistinctRoles(units: ArmyListUnit[]): number {
  return new Set(units.map((unit) => unit.battlefieldRole)).size;
}

function calculateTotalPoints(armyList: ArmyList): number {
  return collectUnits(armyList).reduce((sum, unit) => sum + unit.totalPoints, 0);
}

function getPrimaryDetachment(armyList: ArmyList): ArmyListDetachment | null {
  return armyList.detachments.find((detachment) => {
    const template = findDetachmentTemplate(detachment.detachmentTemplateId);
    return template?.category === 'primary' || detachment.type === DetachmentType.Primary;
  }) ?? null;
}

function countPrimaryUnlocks(primaryDetachment: ArmyListDetachment | null): {
  auxiliary: number;
  apex: number;
} {
  if (!primaryDetachment) {
    return { auxiliary: 0, apex: 0 };
  }

  const commandUnits = countRoleUnits(primaryDetachment.units, BattlefieldRole.Command);
  const hasHighCommand = countRoleUnits(primaryDetachment.units, BattlefieldRole.HighCommand) > 0;

  return {
    auxiliary: commandUnits + (hasHighCommand ? 1 : 0),
    apex: hasHighCommand ? 1 : 0,
  };
}

export function extractRosterFeatures(armyList: ArmyList): Float32Array {
  const units = collectUnits(armyList);
  const totalPoints = calculateTotalPoints(armyList);
  const pointsLimit = Math.max(1, armyList.pointsLimit);
  const totalUnits = Math.max(1, units.length);
  const detachments = armyList.detachments;
  const primaryDetachment = getPrimaryDetachment(armyList);
  const unlocks = countPrimaryUnlocks(primaryDetachment);
  const auxiliaryCount = detachments.filter((detachment) => detachment.type === DetachmentType.Auxiliary).length;
  const apexCount = detachments.filter((detachment) => detachment.type === DetachmentType.Apex).length;
  const totalUnlocks = unlocks.auxiliary + unlocks.apex;

  const totalMandatorySlots = countSlots(detachments, (slot) => slot.isMandatory);
  const filledMandatorySlots = countFilledSlots(detachments, (slot) => slot.isMandatory);
  const totalPrimeSlots = countSlots(detachments, (slot) => slot.isPrime);
  const filledPrimeSlots = countFilledSlots(detachments, (slot) => slot.isPrime);
  const totalSlots = countSlots(detachments, () => true);
  const filledSlots = countFilledSlots(detachments, () => true);

  const highCommandUnits = countRoleUnits(units, BattlefieldRole.HighCommand);
  const commandUnits = countRoleUnits(units, BattlefieldRole.Command);
  const warlordUnits = countRoleUnits(units, BattlefieldRole.Warlord);
  const troopsUnits = countRoleUnits(units, BattlefieldRole.Troops);
  const transportUnits =
    countRoleUnits(units, BattlefieldRole.Transport) +
    countRoleUnits(units, BattlefieldRole.HeavyTransport);
  const heavyUnits =
    countRoleUnits(units, BattlefieldRole.WarEngine) +
    countRoleUnits(units, BattlefieldRole.Armour) +
    countRoleUnits(units, BattlefieldRole.HeavyAssault);
  const frontlineUnits =
    troopsUnits +
    commandUnits +
    highCommandUnits +
    countRoleUnits(units, BattlefieldRole.Retinue);
  const supportUnits = Math.max(0, totalUnits - frontlineUnits);
  const frontlineShare = frontlineUnits / totalUnits;
  const transportCoverage = transportUnits / Math.max(1, frontlineUnits);
  const unlockUtilization = totalUnlocks > 0
    ? (Math.min(auxiliaryCount, unlocks.auxiliary) + Math.min(apexCount, unlocks.apex)) / totalUnlocks
    : 0;
  const combinedArmsBalance = 1 - Math.abs(frontlineShare - 0.55) / 0.55;

  return new Float32Array([
    clampFeature(1 - (((pointsLimit - totalPoints) / pointsLimit) * 4)),
    clampFeature(((filledSlots / Math.max(1, totalSlots)) * 2) - 1),
    clampFeature(totalMandatorySlots > 0 ? ((filledMandatorySlots / totalMandatorySlots) * 2) - 1 : 0),
    clampFeature(totalPrimeSlots > 0 ? ((filledPrimeSlots / totalPrimeSlots) * 2) - 1 : 0),
    clampFeature((Math.min(2, highCommandUnits + commandUnits + warlordUnits) / 2) * 2 - 1),
    clampFeature((Math.min(3, troopsUnits) / 3) * 2 - 1),
    clampFeature(((countDistinctRoles(units) / 12) * 2) - 1),
    clampFeature((unlockUtilization * 2) - 1),
    clampFeature((Math.min(1, transportCoverage) * 2) - 1),
    clampFeature((combinedArmsBalance * 0.75) + ((heavyUnits / totalUnits) * 0.25) + ((supportUnits / totalUnits) * 0.15) - 0.35),
  ]);
}
