export function computePUCTScore(
  prior: number,
  parentVisits: number,
  edgeVisits: number,
  meanValue: number,
  exploration: number,
): number {
  const safePrior = Math.max(1e-6, prior);
  const safeParentVisits = Math.max(1, parentVisits);
  const explorationBonus = exploration * safePrior * (Math.sqrt(safeParentVisits) / (1 + edgeVisits));
  return meanValue + explorationBonus;
}
