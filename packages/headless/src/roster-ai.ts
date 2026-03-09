import type {
  Allegiance,
  ArmyFaction,
  ArmyList,
  ArmyListDetachment,
  ArmyListUnit,
  BattlefieldRole as BattlefieldRoleType,
  GameState,
  UnitProfile,
} from '@hh/types';
import {
  BattlefieldRole,
} from '@hh/types';
import {
  DEFAULT_ROSTER_NNUE_MODEL_ID,
  evaluateRosterArmyList,
  extractRosterFeatures,
} from '@hh/ai';
import {
  calculateUnitPoints,
  createDetachment,
  validateArmyListWithDoctrine,
} from '@hh/army-builder';
import {
  canProfileEmbarkOnTransport,
  findDetachmentTemplate,
  getProfileById,
  getTransportProfileRules,
  getApexTemplates,
  getAuxiliaryTemplates,
  getProfilesByFactionAndRole,
  isProfileCompatibleWithArmyAllegiance,
} from '@hh/data';
import type { HeadlessArmyListGameSetupOptions } from './roster';
import { createHeadlessGameStateFromArmyLists } from './roster';

export type HeadlessRosterStrategyTier = 'heuristic' | 'model';

export interface HeadlessRosterGenerationConfig {
  playerName: string;
  faction: ArmyFaction;
  allegiance: Allegiance;
  pointsLimit: number;
  strategyTier?: HeadlessRosterStrategyTier;
  nnueModelId?: string;
  baseSeed?: number;
  candidateCount?: number;
  unitIdNamespace?: string;
}

export interface HeadlessRosterCandidateSummary {
  candidateIndex: number;
  score: number;
  totalPoints: number;
  detachmentCount: number;
  roleCounts: Partial<Record<BattlefieldRoleType, number>>;
}

export interface HeadlessRosterDiagnostics {
  strategyTier: HeadlessRosterStrategyTier;
  modelId: string | null;
  baseSeed: number;
  candidateCount: number;
  selectedScore: number;
  selectedFeatures: number[];
  topCandidates: HeadlessRosterCandidateSummary[];
}

export interface HeadlessGeneratedRosterValidation {
  isValid: boolean;
  errors: string[];
}

export interface HeadlessGeneratedArmyList {
  armyList: ArmyList;
  diagnostics: HeadlessRosterDiagnostics;
  validation: HeadlessGeneratedRosterValidation;
}

export interface HeadlessGeneratedArmyListGameSetupOptions
  extends Omit<HeadlessArmyListGameSetupOptions, 'armyLists'> {
  rosterConfigs: [HeadlessRosterGenerationConfig, HeadlessRosterGenerationConfig];
}

export interface HeadlessGeneratedArmyListGameSetupResult {
  state: GameState;
  generatedArmies: [HeadlessGeneratedArmyList, HeadlessGeneratedArmyList];
}

interface CandidateUnitOption {
  profile: UnitProfile;
  profileId: string;
  battlefieldRole: BattlefieldRole;
  modelCount: number;
  totalPoints: number;
}

const HEURISTIC_FEATURE_WEIGHTS = [24, 12, 4, 10, 11, 13, 8, 7, 5, 12];

class DeterministicRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) {
      this.state = 0x9e3779b9;
    }
  }

  next(): number {
    this.state = ((this.state * 1664525) + 1013904223) >>> 0;
    return this.state / 0x1_0000_0000;
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0;
    return Math.floor(this.next() * maxExclusive);
  }
}

function calculateArmyTotalPoints(detachments: ArmyListDetachment[]): number {
  return detachments.flatMap((detachment) => detachment.units).reduce(
    (sum, unit) => sum + unit.totalPoints,
    0,
  );
}

function countRoleUnits(units: ArmyListUnit[], role: BattlefieldRole): number {
  return units.filter((unit) => unit.battlefieldRole === role).length;
}

function buildModelCountOptions(profile: UnitProfile): number[] {
  const counts = new Set<number>([profile.minModels]);
  if (profile.maxModels > profile.minModels) {
    counts.add(Math.min(profile.maxModels, profile.minModels + Math.max(1, Math.floor((profile.maxModels - profile.minModels) / 2))));
    counts.add(Math.min(profile.maxModels, profile.minModels + 5));
    counts.add(Math.min(profile.maxModels, profile.minModels + 10));
    counts.add(profile.maxModels);
  }
  return [...counts].sort((left, right) => left - right);
}

function buildRoleOptions(
  faction: ArmyFaction,
  allegiance: Allegiance,
  role: BattlefieldRole,
): CandidateUnitOption[] {
  return getProfilesByFactionAndRole(faction, role)
    .filter((profile) => isProfileCompatibleWithArmyAllegiance(profile, allegiance))
    .flatMap((profile) =>
      buildModelCountOptions(profile).map((modelCount) => ({
        profile,
        profileId: profile.id,
        battlefieldRole: role,
        modelCount,
        totalPoints: calculateUnitPoints(profile, modelCount),
      })),
    )
    .sort((left, right) => {
      if (left.totalPoints !== right.totalPoints) {
        return left.totalPoints - right.totalPoints;
      }
      if (left.modelCount !== right.modelCount) {
        return left.modelCount - right.modelCount;
      }
      return left.profileId.localeCompare(right.profileId);
    });
}

function createRoleOptionsCache(
  faction: ArmyFaction,
  allegiance: Allegiance,
): Map<BattlefieldRole, CandidateUnitOption[]> {
  const cache = new Map<BattlefieldRole, CandidateUnitOption[]>();
  for (const role of Object.values(BattlefieldRole)) {
    cache.set(role, buildRoleOptions(faction, allegiance, role));
  }
  return cache;
}

function getCheapestUnitCost(
  optionsByRole: Map<BattlefieldRole, CandidateUnitOption[]>,
  role: BattlefieldRole,
): number {
  return optionsByRole.get(role)?.[0]?.totalPoints ?? Number.POSITIVE_INFINITY;
}

function roleSpendTarget(role: BattlefieldRole): number {
  switch (role) {
    case BattlefieldRole.HighCommand:
    case BattlefieldRole.Command:
    case BattlefieldRole.Warlord:
      return 0.28;
    case BattlefieldRole.Troops:
    case BattlefieldRole.Retinue:
    case BattlefieldRole.Elites:
    case BattlefieldRole.HeavyAssault:
      return 0.52;
    case BattlefieldRole.Transport:
    case BattlefieldRole.HeavyTransport:
      return 0.18;
    case BattlefieldRole.WarEngine:
    case BattlefieldRole.Armour:
      return 0.42;
    default:
      return 0.3;
  }
}

function normalizeIdNamespace(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'generated';
}

function resolveUnitIdNamespace(config: HeadlessRosterGenerationConfig): string {
  if (config.unitIdNamespace) {
    return normalizeIdNamespace(config.unitIdNamespace);
  }

  return normalizeIdNamespace(
    `${config.playerName}-${config.faction}-${config.allegiance}-${config.strategyTier ?? 'heuristic'}-${config.baseSeed ?? 7_331}`,
  );
}

function instantiateArmyUnit(
  option: CandidateUnitOption,
  unitIndex: number,
  unitIdNamespace: string,
): ArmyListUnit {
  return {
    id: `${unitIdNamespace}-unit-${unitIndex}`,
    profileId: option.profileId,
    modelCount: option.modelCount,
    selectedOptions: [],
    totalPoints: option.totalPoints,
    battlefieldRole: option.battlefieldRole,
  };
}

function buildRoleCounts(armyList: ArmyList): Partial<Record<BattlefieldRoleType, number>> {
  return armyList.detachments
    .flatMap((detachment) => detachment.units)
    .reduce<Partial<Record<BattlefieldRoleType, number>>>((counts, unit) => {
      counts[unit.battlefieldRole] = (counts[unit.battlefieldRole] ?? 0) + 1;
      return counts;
    }, {});
}

interface ArmyUnitContext {
  detachment: ArmyListDetachment;
  unit: ArmyListUnit;
  profile: UnitProfile;
}

function isDedicatedTransportRole(role: BattlefieldRole): boolean {
  return role === BattlefieldRole.Transport || role === BattlefieldRole.HeavyTransport;
}

function collectArmyUnitContexts(armyList: ArmyList): ArmyUnitContext[] {
  return armyList.detachments.flatMap((detachment) =>
    detachment.units.flatMap((unit) => {
      const profile = getProfileById(unit.profileId);
      return profile ? [{ detachment, unit, profile }] : [];
    }),
  );
}

function reindexArmyListTotalPoints(armyList: ArmyList): ArmyList {
  const totalPoints = calculateArmyTotalPoints(armyList.detachments);
  return {
    ...armyList,
    totalPoints,
  };
}

function assignArmyListTransports(armyList: ArmyList): ArmyList {
  const unitContexts = collectArmyUnitContexts(armyList);
  const transportContexts = unitContexts.filter((context) => getTransportProfileRules(context.profile) !== null);
  const passengerContexts = unitContexts
    .filter((context) => getTransportProfileRules(context.profile) === null)
    .sort((left, right) => {
      const leftSize = left.unit.modelCount ?? 0;
      const rightSize = right.unit.modelCount ?? 0;
      return rightSize - leftSize;
    });
  const assignedTransportByUnitId = new Map<string, string>();
  const occupiedCapacityByTransportId = new Map<string, number>();
  const embarkedUnitIdsByTransportId = new Map<string, string[]>();

  for (const passenger of passengerContexts) {
    const compatibleTransports = transportContexts
      .map((transport) => {
        const compatibility = canProfileEmbarkOnTransport({
          passengerProfile: passenger.profile,
          passengerModelCount: passenger.unit.modelCount,
          passengerFaction: passenger.detachment.faction,
          transportProfile: transport.profile,
          transportFaction: transport.detachment.faction,
          occupiedCapacity: occupiedCapacityByTransportId.get(transport.unit.id) ?? 0,
          embarkedUnitCount: (embarkedUnitIdsByTransportId.get(transport.unit.id) ?? []).length,
        });
        return { transport, compatibility };
      })
      .filter((candidate) => candidate.compatibility.isCompatible)
      .sort((left, right) => {
        const leftCapacity = getTransportProfileRules(left.transport.profile)?.capacity ?? Number.POSITIVE_INFINITY;
        const rightCapacity = getTransportProfileRules(right.transport.profile)?.capacity ?? Number.POSITIVE_INFINITY;
        if (leftCapacity !== rightCapacity) {
          return leftCapacity - rightCapacity;
        }
        if (left.transport.unit.battlefieldRole !== right.transport.unit.battlefieldRole) {
          return left.transport.unit.battlefieldRole.localeCompare(right.transport.unit.battlefieldRole);
        }
        return left.transport.unit.id.localeCompare(right.transport.unit.id);
      });

    const selected = compatibleTransports[0];
    if (!selected) {
      continue;
    }

    assignedTransportByUnitId.set(passenger.unit.id, selected.transport.unit.id);
    const currentOccupancy = occupiedCapacityByTransportId.get(selected.transport.unit.id) ?? 0;
    occupiedCapacityByTransportId.set(
      selected.transport.unit.id,
      currentOccupancy + selected.compatibility.requiredCapacity,
    );
    const embarkedUnitIds = embarkedUnitIdsByTransportId.get(selected.transport.unit.id) ?? [];
    embarkedUnitIds.push(passenger.unit.id);
    embarkedUnitIdsByTransportId.set(selected.transport.unit.id, embarkedUnitIds);
  }

  const usedDedicatedTransportIds = new Set(
    transportContexts
      .filter((context) =>
        isDedicatedTransportRole(context.unit.battlefieldRole) &&
        (embarkedUnitIdsByTransportId.get(context.unit.id)?.length ?? 0) > 0,
      )
      .map((context) => context.unit.id),
  );

  const detachments = armyList.detachments
    .map((detachment) => ({
      ...detachment,
      units: detachment.units
        .filter((unit) => {
          if (!isDedicatedTransportRole(unit.battlefieldRole)) {
            return true;
          }
          return !transportContexts.some((context) =>
            context.unit.id === unit.id &&
            isDedicatedTransportRole(context.unit.battlefieldRole) &&
            !usedDedicatedTransportIds.has(unit.id),
          );
        })
        .map((unit) => ({
          ...unit,
          assignedTransportUnitId: assignedTransportByUnitId.get(unit.id),
        })),
    }))
    .filter((detachment) => detachment.units.length > 0);

  return reindexArmyListTotalPoints({
    ...armyList,
    detachments,
  });
}

function selectUnitOption(
  role: BattlefieldRole,
  remainingBudget: number,
  optionsByRole: Map<BattlefieldRole, CandidateUnitOption[]>,
  rng: DeterministicRng,
  usedProfileIds: Set<string>,
  allowDuplicateProfile: boolean,
): CandidateUnitOption | null {
  const affordable = (optionsByRole.get(role) ?? []).filter((option) => option.totalPoints <= remainingBudget);
  if (affordable.length === 0) {
    return null;
  }

  const spendTarget = roleSpendTarget(role);
  let bestOption: CandidateUnitOption | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const option of affordable) {
    const spendRatio = option.totalPoints / Math.max(1, remainingBudget);
    const proximity = 1 - Math.abs(spendRatio - spendTarget);
    const duplicatePenalty = !allowDuplicateProfile && usedProfileIds.has(option.profileId) ? 0.3 : 0;
    const score = proximity - duplicatePenalty + (rng.next() * 0.2);

    if (score > bestScore) {
      bestScore = score;
      bestOption = option;
    }
  }

  return bestOption;
}

function appendUnit(
  detachment: ArmyListDetachment,
  role: BattlefieldRole,
  remainingBudget: number,
  optionsByRole: Map<BattlefieldRole, CandidateUnitOption[]>,
  rng: DeterministicRng,
  usedProfileIds: Set<string>,
  unitIndexRef: { current: number },
  unitIdNamespace: string,
  allowDuplicateProfile: boolean = true,
): CandidateUnitOption | null {
  const option = selectUnitOption(
    role,
    remainingBudget,
    optionsByRole,
    rng,
    usedProfileIds,
    allowDuplicateProfile,
  );
  if (!option) {
    return null;
  }

  detachment.units.push(instantiateArmyUnit(option, unitIndexRef.current, unitIdNamespace));
  unitIndexRef.current += 1;
  usedProfileIds.add(option.profileId);
  return option;
}

function fillPrimaryDetachment(
  detachment: ArmyListDetachment,
  pointsLimit: number,
  remainingBudgetRef: { current: number },
  optionsByRole: Map<BattlefieldRole, CandidateUnitOption[]>,
  rng: DeterministicRng,
  usedProfileIds: Set<string>,
  unitIndexRef: { current: number },
  unitIdNamespace: string,
): void {
  const highCommandTarget = rng.next() < 0.85 ? 1 : 0;
  const commandTarget = 1 + (rng.next() < 0.65 ? 1 : 0) + (rng.next() < 0.3 ? 1 : 0);
  const troopsTarget = 2 + (rng.next() < 0.8 ? 1 : 0) + (rng.next() < 0.45 ? 1 : 0);
  const transportTarget = Math.min(4, Math.floor(troopsTarget / 2) + (rng.next() < 0.35 ? 1 : 0));

  const roleTargets: Array<{ role: BattlefieldRole; count: number; allowDuplicateProfile?: boolean }> = [
    { role: BattlefieldRole.HighCommand, count: highCommandTarget, allowDuplicateProfile: false },
    { role: BattlefieldRole.Command, count: commandTarget, allowDuplicateProfile: false },
    { role: BattlefieldRole.Troops, count: troopsTarget },
    { role: BattlefieldRole.Transport, count: transportTarget },
  ];

  for (const target of roleTargets) {
    for (let index = 0; index < target.count; index++) {
      const option = appendUnit(
        detachment,
        target.role,
        remainingBudgetRef.current,
        optionsByRole,
        rng,
        usedProfileIds,
        unitIndexRef,
        unitIdNamespace,
        target.allowDuplicateProfile ?? true,
      );
      if (!option) break;
      remainingBudgetRef.current -= option.totalPoints;
    }
  }

  while (
    countRoleUnits(detachment.units, BattlefieldRole.Troops) < 4 &&
    remainingBudgetRef.current >= getCheapestUnitCost(optionsByRole, BattlefieldRole.Troops) &&
    rng.next() < 0.55
  ) {
    const option = appendUnit(
      detachment,
      BattlefieldRole.Troops,
      remainingBudgetRef.current,
      optionsByRole,
      rng,
      usedProfileIds,
      unitIndexRef,
      unitIdNamespace,
    );
    if (!option) break;
    remainingBudgetRef.current -= option.totalPoints;
  }

  while (
    countRoleUnits(detachment.units, BattlefieldRole.Command) < 3 &&
    remainingBudgetRef.current >= getCheapestUnitCost(optionsByRole, BattlefieldRole.Command) &&
    remainingBudgetRef.current > pointsLimit * 0.08 &&
    rng.next() < 0.25
  ) {
    const option = appendUnit(
      detachment,
      BattlefieldRole.Command,
      remainingBudgetRef.current,
      optionsByRole,
      rng,
      usedProfileIds,
      unitIndexRef,
      unitIdNamespace,
      false,
    );
    if (!option) break;
    remainingBudgetRef.current -= option.totalPoints;
  }
}

function fillTemplateDetachment(
  detachmentTemplateId: string,
  faction: ArmyFaction,
  remainingBudget: number,
  parentDetachmentId: string,
  optionsByRole: Map<BattlefieldRole, CandidateUnitOption[]>,
  rng: DeterministicRng,
  usedProfileIds: Set<string>,
  detachmentIndex: number,
  unitIndexRef: { current: number },
  unitIdNamespace: string,
): { detachment: ArmyListDetachment; spentPoints: number } | null {
  const template = findDetachmentTemplate(detachmentTemplateId);
  if (!template) {
    return null;
  }

  const detachment = createDetachment(template, faction, `auto-det-${detachmentIndex}`);
  detachment.parentDetachmentId = parentDetachmentId;

  let spentPoints = 0;
  for (const slot of template.slots) {
    if (spentPoints >= remainingBudget) break;

    const roleCountInDetachment = countRoleUnits(detachment.units, slot.role);
    const roleSlots = template.slots.filter((candidate) => candidate.role === slot.role).length;
    if (roleCountInDetachment >= roleSlots) {
      continue;
    }

    const mustAttempt = detachment.units.length === 0;
    if (!mustAttempt && rng.next() < 0.22) {
      continue;
    }

    const option = appendUnit(
      detachment,
      slot.role,
      remainingBudget - spentPoints,
      optionsByRole,
      rng,
      usedProfileIds,
      unitIndexRef,
      unitIdNamespace,
      slot.role !== BattlefieldRole.HighCommand && slot.role !== BattlefieldRole.Command,
    );
    if (!option) {
      continue;
    }

    spentPoints += option.totalPoints;
  }

  return detachment.units.length > 0 ? { detachment, spentPoints } : null;
}

function calculateUnlocks(primaryDetachment: ArmyListDetachment): {
  auxiliary: number;
  apex: number;
} {
  const commandUnits = countRoleUnits(primaryDetachment.units, BattlefieldRole.Command);
  const hasHighCommand = countRoleUnits(primaryDetachment.units, BattlefieldRole.HighCommand) > 0;
  return {
    auxiliary: commandUnits + (hasHighCommand ? 1 : 0),
    apex: hasHighCommand ? 1 : 0,
  };
}

function buildFallbackArmyList(config: HeadlessRosterGenerationConfig): ArmyList {
  const primaryTemplate = findDetachmentTemplate('crusade-primary');
  if (!primaryTemplate) {
    throw new Error('Missing detachment template "crusade-primary" for fallback roster generation.');
  }

  const optionsByRole = createRoleOptionsCache(config.faction, config.allegiance);
  const primary = createDetachment(primaryTemplate, config.faction, 'auto-det-0');
  const unitIndexRef = { current: 0 };
  const unitIdNamespace = resolveUnitIdNamespace(config);
  const requiredRoles: BattlefieldRole[] = [
    BattlefieldRole.HighCommand,
    BattlefieldRole.Command,
    BattlefieldRole.Troops,
    BattlefieldRole.Troops,
  ];

  for (const role of requiredRoles) {
    const option = optionsByRole.get(role)?.[0];
    if (!option) {
      if (role === BattlefieldRole.HighCommand) continue;
      throw new Error(`Unable to generate fallback roster for ${config.faction}; no ${role} profiles are available.`);
    }
    primary.units.push(instantiateArmyUnit(option, unitIndexRef.current, unitIdNamespace));
    unitIndexRef.current += 1;
  }

  const totalPoints = calculateArmyTotalPoints([primary]);
  const warlordUnitId = primary.units.find((unit) => unit.battlefieldRole === BattlefieldRole.HighCommand)?.id
    ?? primary.units.find((unit) => unit.battlefieldRole === BattlefieldRole.Command)?.id
    ?? primary.units[0]?.id;

  return {
    playerName: config.playerName,
    faction: config.faction,
    allegiance: config.allegiance,
    pointsLimit: config.pointsLimit,
    totalPoints,
    detachments: [primary],
    ...(warlordUnitId ? { warlordUnitId } : {}),
  };
}

function buildCandidateArmyList(
  config: HeadlessRosterGenerationConfig,
  candidateIndex: number,
): ArmyList {
  const primaryTemplate = findDetachmentTemplate('crusade-primary');
  if (!primaryTemplate) {
    throw new Error('Missing detachment template "crusade-primary" for roster generation.');
  }

  const rng = new DeterministicRng((config.baseSeed ?? 7_331) + (candidateIndex * 977));
  const optionsByRole = createRoleOptionsCache(config.faction, config.allegiance);
  const primary = createDetachment(primaryTemplate, config.faction, 'auto-det-0');
  const detachments: ArmyListDetachment[] = [primary];
  const usedProfileIds = new Set<string>();
  const remainingBudgetRef = { current: config.pointsLimit };
  const unitIndexRef = { current: 0 };
  const unitIdNamespace = resolveUnitIdNamespace(config);

  fillPrimaryDetachment(
    primary,
    config.pointsLimit,
    remainingBudgetRef,
    optionsByRole,
    rng,
    usedProfileIds,
    unitIndexRef,
    unitIdNamespace,
  );

  const unlocks = calculateUnlocks(primary);
  const useApex = unlocks.apex > 0 &&
    remainingBudgetRef.current > config.pointsLimit * 0.12 &&
    rng.next() < 0.4;
  const maxAuxiliary = Math.max(0, unlocks.auxiliary - (useApex ? 1 : 0));
  const auxiliaryTarget = maxAuxiliary > 0 && remainingBudgetRef.current > config.pointsLimit * 0.1
    ? Math.min(maxAuxiliary, 1 + rng.nextInt(Math.min(2, maxAuxiliary)))
    : 0;

  for (let detachmentIndex = 0; detachmentIndex < auxiliaryTarget; detachmentIndex++) {
    const auxiliaryTemplates = getAuxiliaryTemplates()
      .filter((template) => template.slots.some((slot) =>
        getCheapestUnitCost(optionsByRole, slot.role) <= remainingBudgetRef.current,
      ));
    if (auxiliaryTemplates.length === 0) break;

    const template = auxiliaryTemplates[rng.nextInt(auxiliaryTemplates.length)];
    const result = fillTemplateDetachment(
      template.id,
      config.faction,
      remainingBudgetRef.current,
      primary.id,
      optionsByRole,
      rng,
      usedProfileIds,
      detachments.length,
      unitIndexRef,
      unitIdNamespace,
    );
    if (!result) continue;

    detachments.push(result.detachment);
    remainingBudgetRef.current -= result.spentPoints;
  }

  if (useApex) {
    const apexTemplates = getApexTemplates()
      .filter((template) => template.slots.some((slot) =>
        getCheapestUnitCost(optionsByRole, slot.role) <= remainingBudgetRef.current,
      ));
    if (apexTemplates.length > 0) {
      const template = apexTemplates[rng.nextInt(apexTemplates.length)];
      const result = fillTemplateDetachment(
        template.id,
        config.faction,
        remainingBudgetRef.current,
        primary.id,
        optionsByRole,
        rng,
        usedProfileIds,
        detachments.length,
        unitIndexRef,
        unitIdNamespace,
      );
      if (result) {
        detachments.push(result.detachment);
        remainingBudgetRef.current -= result.spentPoints;
      }
    }
  }

  const assignedArmyList = assignArmyListTransports({
    playerName: config.playerName,
    faction: config.faction,
    allegiance: config.allegiance,
    pointsLimit: config.pointsLimit,
    totalPoints: calculateArmyTotalPoints(detachments),
    detachments,
  });
  const warlordUnitId = primary.units.find((unit) => unit.battlefieldRole === BattlefieldRole.HighCommand)?.id
    ?? primary.units.find((unit) => unit.battlefieldRole === BattlefieldRole.Command)?.id
    ?? primary.units[0]?.id;

  return {
    ...assignedArmyList,
    ...(warlordUnitId ? { warlordUnitId } : {}),
  };
}

function scoreRosterHeuristically(armyList: ArmyList): number {
  const features = extractRosterFeatures(armyList);
  return features.reduce(
    (sum, feature, index) => sum + (feature * (HEURISTIC_FEATURE_WEIGHTS[index] ?? 0)),
    0,
  );
}

function summarizeCandidate(armyList: ArmyList, candidateIndex: number, score: number): HeadlessRosterCandidateSummary {
  return {
    candidateIndex,
    score,
    totalPoints: armyList.totalPoints,
    detachmentCount: armyList.detachments.length,
    roleCounts: buildRoleCounts(armyList),
  };
}

function summarizeRosterValidation(armyList: ArmyList): HeadlessGeneratedRosterValidation {
  const validation = validateArmyListWithDoctrine(armyList);
  return {
    isValid: validation.isValid,
    errors: validation.errors.map((error) => error.message),
  };
}

export function generateHeadlessArmyList(
  config: HeadlessRosterGenerationConfig,
): HeadlessGeneratedArmyList {
  if (!Number.isFinite(config.pointsLimit) || config.pointsLimit <= 0) {
    throw new Error('Roster generation requires a positive pointsLimit.');
  }

  const strategyTier = config.strategyTier ?? 'heuristic';
  const candidateCount = Math.max(1, config.candidateCount ?? (strategyTier === 'model' ? 24 : 16));
  const modelId = strategyTier === 'model'
    ? (config.nnueModelId ?? DEFAULT_ROSTER_NNUE_MODEL_ID)
    : null;

  let bestArmyList: ArmyList | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const candidateSummaries: HeadlessRosterCandidateSummary[] = [];

  for (let candidateIndex = 0; candidateIndex < candidateCount; candidateIndex++) {
    const armyList = buildCandidateArmyList(config, candidateIndex);
    const validation = validateArmyListWithDoctrine(armyList);
    if (!validation.isValid) {
      continue;
    }

    const heuristicScore = scoreRosterHeuristically(armyList);
    const score = strategyTier === 'model'
      ? evaluateRosterArmyList(armyList, modelId ?? DEFAULT_ROSTER_NNUE_MODEL_ID) + (heuristicScore * 0.15)
      : heuristicScore;

    candidateSummaries.push(summarizeCandidate(armyList, candidateIndex, score));

    if (score > bestScore) {
      bestScore = score;
      bestArmyList = armyList;
    }
  }

  if (!bestArmyList) {
    bestArmyList = buildFallbackArmyList(config);
    const validation = validateArmyListWithDoctrine(bestArmyList);
    if (!validation.isValid) {
      throw new Error(`Fallback roster generation failed for ${config.faction}: ${validation.errors.map((error) => error.message).join('; ')}`);
    }
    bestScore = strategyTier === 'model'
      ? evaluateRosterArmyList(bestArmyList, modelId ?? DEFAULT_ROSTER_NNUE_MODEL_ID)
      : scoreRosterHeuristically(bestArmyList);
    candidateSummaries.push(summarizeCandidate(bestArmyList, -1, bestScore));
  }

  return {
    armyList: bestArmyList,
    diagnostics: {
      strategyTier,
      modelId,
      baseSeed: config.baseSeed ?? 7_331,
      candidateCount,
      selectedScore: bestScore,
      selectedFeatures: Array.from(extractRosterFeatures(bestArmyList)),
      topCandidates: candidateSummaries
        .sort((left, right) => right.score - left.score)
        .slice(0, 3),
    },
    validation: summarizeRosterValidation(bestArmyList),
  };
}

export function generateHeadlessArmyLists(
  rosterConfigs: [HeadlessRosterGenerationConfig, HeadlessRosterGenerationConfig],
): [HeadlessGeneratedArmyList, HeadlessGeneratedArmyList] {
  return [
    generateHeadlessArmyList({
      ...rosterConfigs[0],
      unitIdNamespace: rosterConfigs[0].unitIdNamespace ?? 'p0',
    }),
    generateHeadlessArmyList({
      ...rosterConfigs[1],
      unitIdNamespace: rosterConfigs[1].unitIdNamespace ?? 'p1',
    }),
  ];
}

export function createHeadlessGameStateFromGeneratedArmyLists(
  options: HeadlessGeneratedArmyListGameSetupOptions,
): HeadlessGeneratedArmyListGameSetupResult {
  const generatedArmies = generateHeadlessArmyLists(options.rosterConfigs);
  return {
    state: createHeadlessGameStateFromArmyLists({
      ...options,
      armyLists: [generatedArmies[0].armyList, generatedArmies[1].armyList],
    }),
    generatedArmies,
  };
}
