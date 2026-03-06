import type { Position } from '@hh/types';

export type DeploymentFormationPreset = 'line' | 'double-rank' | 'block' | 'column';
export interface DeploymentFormationAxes {
  lateral: Position;
  depth: Position;
}

const BASE_SPACING = 1.25;

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function splitAcrossRows(modelCount: number, rows: number): number[] {
  if (modelCount <= 0) return [];
  if (rows <= 1) return [modelCount];

  const baseCount = Math.floor(modelCount / rows);
  const remainder = modelCount % rows;
  const rowCounts: number[] = [];

  for (let i = 0; i < rows; i++) {
    const count = baseCount + (i < remainder ? 1 : 0);
    if (count > 0) rowCounts.push(count);
  }

  return rowCounts;
}

function getFormationRowCounts(
  modelCount: number,
  preset: DeploymentFormationPreset,
): number[] {
  if (modelCount <= 0) return [];

  switch (preset) {
    case 'line':
      return [modelCount];
    case 'double-rank':
      return splitAcrossRows(modelCount, 2);
    case 'column':
      return Array.from({ length: modelCount }, () => 1);
    case 'block':
    default: {
      const cols = Math.ceil(Math.sqrt(modelCount));
      const rows = Math.ceil(modelCount / cols);
      const rowCounts: number[] = [];
      let remaining = modelCount;

      for (let row = 0; row < rows; row++) {
        const count = Math.min(cols, remaining);
        if (count > 0) rowCounts.push(count);
        remaining -= count;
      }

      return rowCounts;
    }
  }
}

export function buildUnitDeploymentFormationWithAxes(
  modelCount: number,
  anchor: Position,
  preset: DeploymentFormationPreset,
  axes: DeploymentFormationAxes,
): Position[] {
  const rowCounts = getFormationRowCounts(modelCount, preset);
  if (rowCounts.length === 0) return [];

  const positions: Position[] = [];
  for (let rowIndex = 0; rowIndex < rowCounts.length; rowIndex++) {
    const modelsInRow = rowCounts[rowIndex];
    for (let colIndex = 0; colIndex < modelsInRow; colIndex++) {
      const lateralOffset = (colIndex - (modelsInRow - 1) / 2) * BASE_SPACING;
      const depthOffset = rowIndex * BASE_SPACING;
      const x = anchor.x + axes.lateral.x * lateralOffset + axes.depth.x * depthOffset;
      const y = anchor.y + axes.lateral.y * lateralOffset + axes.depth.y * depthOffset;

      positions.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      });
    }
  }

  return positions;
}

export function buildUnitDeploymentFormation(
  modelCount: number,
  anchor: Position,
  deployingPlayerIndex: number,
  battlefieldWidth: number,
  battlefieldHeight: number,
  zoneDepth: number,
  preset: DeploymentFormationPreset,
): Position[] {
  const rowCounts = getFormationRowCounts(modelCount, preset);
  if (rowCounts.length === 0) return [];

  const widestRow = Math.max(...rowCounts);
  const rowCount = rowCounts.length;

  const xSpacing = widestRow > 1
    ? Math.min(BASE_SPACING, (battlefieldWidth - 1) / (widestRow - 1))
    : BASE_SPACING;
  const ySpacing = rowCount > 1
    ? Math.min(BASE_SPACING, (zoneDepth - 0.5) / (rowCount - 1))
    : BASE_SPACING;

  const halfWidth = ((widestRow - 1) * xSpacing) / 2;
  const rowDepth = (rowCount - 1) * ySpacing;

  const minAnchorX = halfWidth;
  const maxAnchorX = battlefieldWidth - halfWidth;
  const clampedAnchorX = clamp(anchor.x, minAnchorX, maxAnchorX);

  const minAnchorY = deployingPlayerIndex === 0
    ? 0
    : battlefieldHeight - zoneDepth + rowDepth;
  const maxAnchorY = deployingPlayerIndex === 0
    ? zoneDepth - rowDepth
    : battlefieldHeight;
  const clampedAnchorY = clamp(
    anchor.y,
    Math.min(minAnchorY, maxAnchorY),
    Math.max(minAnchorY, maxAnchorY),
  );

  const positions: Position[] = [];
  for (let rowIndex = 0; rowIndex < rowCounts.length; rowIndex++) {
    const modelsInRow = rowCounts[rowIndex];
    for (let colIndex = 0; colIndex < modelsInRow; colIndex++) {
      const x = clampedAnchorX + (colIndex - (modelsInRow - 1) / 2) * xSpacing;
      const y = deployingPlayerIndex === 0
        ? clampedAnchorY + rowIndex * ySpacing
        : clampedAnchorY - rowIndex * ySpacing;

      positions.push({
        x: Math.round(x * 10) / 10,
        y: Math.round(y * 10) / 10,
      });
    }
  }

  return positions;
}
