// Special Rules barrel export

export {
  registerMovementRule,
  getMovementRule,
  hasMovementRule,
  getRegisteredRuleNames,
  clearRegistry,
  applyMovementRules,
} from './rule-registry';
export type { MovementRuleContext, MovementRuleResult, MovementRuleHandler } from './rule-registry';

export { registerAllMovementRules } from './movement-rules';

export {
  registerShootingRule,
  getShootingRule,
  hasShootingRule,
  getRegisteredShootingRuleNames,
  clearShootingRegistry,
  applyShootingRules,
  registerAllShootingRules,
} from './shooting-rules';
export type { ShootingRuleContext, ShootingRuleResult, ShootingRuleHandler } from './shooting-rules';
