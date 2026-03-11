import type { ModelState } from '@hh/types';

export interface ChallengeRuleOverride {
  mandatoryChallengerPriority?: number;
  mandatoryAcceptorPriority?: number;
  targetSelectionOverride?: boolean;
  optionalParticipation?: boolean;
  eligibleWhenEnemyProfiles?: string[];
  mustBeChallengedWhenEnemyChallengerProfiles?: string[];
}

const CHALLENGE_RULE_OVERRIDES: Record<string, ChallengeRuleOverride> = {
  'legion-champion': {
    mandatoryChallengerPriority: 10,
    mandatoryAcceptorPriority: 10,
  },
  'legion-champion-in-terminator-armour': {
    mandatoryChallengerPriority: 10,
    mandatoryAcceptorPriority: 10,
  },
  'legion-champion-with-jump-pack': {
    mandatoryChallengerPriority: 10,
    mandatoryAcceptorPriority: 10,
  },
  'mounted-legion-champion': {
    mandatoryChallengerPriority: 10,
    mandatoryAcceptorPriority: 10,
  },
  'sigismund': {
    mandatoryChallengerPriority: 100,
    targetSelectionOverride: true,
  },
  'fulgrim-transfigured': {
    mandatoryChallengerPriority: 90,
  },
  'maloghurst-the-twisted': {
    optionalParticipation: true,
  },
  'rylanor-the-unyielding': {
    eligibleWhenEnemyProfiles: ['fulgrim', 'fulgrim-transfigured'],
    mustBeChallengedWhenEnemyChallengerProfiles: ['fulgrim', 'fulgrim-transfigured'],
  },
};

export function getChallengeRuleOverride(
  profileId: string,
): ChallengeRuleOverride | undefined {
  return CHALLENGE_RULE_OVERRIDES[profileId];
}

export function getMandatoryChallengerPriority(
  model: ModelState,
): number | null {
  return getChallengeRuleOverride(model.unitProfileId)?.mandatoryChallengerPriority ?? null;
}

export function getMandatoryAcceptorPriority(
  model: ModelState,
  challengerProfileId: string,
): number | null {
  const override = getChallengeRuleOverride(model.unitProfileId);
  if (!override) return null;

  let priority = override.mandatoryAcceptorPriority ?? null;
  if (override.mustBeChallengedWhenEnemyChallengerProfiles?.includes(challengerProfileId)) {
    priority = Math.max(priority ?? 0, 100);
  }

  return priority;
}

export function modelHasTargetSelectionOverride(model: ModelState): boolean {
  return getChallengeRuleOverride(model.unitProfileId)?.targetSelectionOverride === true;
}

export function modelHasExplicitChallengeEligibility(
  model: ModelState,
  enemyProfileIds: Set<string>,
): boolean {
  const override = getChallengeRuleOverride(model.unitProfileId);
  if (!override?.eligibleWhenEnemyProfiles) {
    return false;
  }

  return override.eligibleWhenEnemyProfiles.some((profileId) =>
    enemyProfileIds.has(profileId),
  );
}
