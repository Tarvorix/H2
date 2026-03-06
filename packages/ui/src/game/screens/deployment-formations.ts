export {
  buildUnitDeploymentFormation,
  type DeploymentFormationPreset,
} from '@hh/geometry';

import type { DeploymentFormationPreset } from '@hh/geometry';
import type { AIDeploymentFormation } from '@hh/ai';

export const DEPLOYMENT_FORMATION_LABELS: Record<DeploymentFormationPreset, string> = {
  line: 'Line',
  'double-rank': 'Double Rank',
  block: 'Block',
  column: 'Column',
};

export const AI_DEPLOYMENT_FORMATION_LABELS: Record<AIDeploymentFormation, string> = {
  auto: 'Auto',
  ...DEPLOYMENT_FORMATION_LABELS,
};
