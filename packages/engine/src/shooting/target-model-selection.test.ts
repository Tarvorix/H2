/**
 * Target Model Selection Tests
 * Reference: HH_Rules_Battle.md — Step 8: Defender Selects Target Model
 */

import { describe, it, expect } from 'vitest';
import { ModelType, ModelSubType } from '@hh/types';
import type { ModelState } from '@hh/types';
import { autoSelectTargetModel, getValidTargetModels } from './target-model-selection';
import type { TargetModelInfo } from './target-model-selection';

// ─── Helper: Create model info ──────────────────────────────────────────────

function makeModelInfo(overrides: {
  id?: string;
  currentWounds?: number;
  maxWounds?: number;
  isDestroyed?: boolean;
  modelType?: ModelType;
  modelSubTypes?: ModelSubType[];
  isVehicle?: boolean;
} = {}): TargetModelInfo {
  const id = overrides.id ?? 'model-1';
  const maxWounds = overrides.maxWounds ?? 1;
  const currentWounds = overrides.currentWounds ?? maxWounds;
  const isDestroyed = overrides.isDestroyed ?? false;
  const modelType = overrides.modelType ?? ModelType.Infantry;
  const modelSubTypes = overrides.modelSubTypes ?? [];
  const isVehicle = overrides.isVehicle ?? (modelType === ModelType.Vehicle);

  const model: ModelState = {
    id,
    profileModelName: 'Test Model',
    unitProfileId: 'test-unit',
    position: { x: 0, y: 0 },
    currentWounds,
    isDestroyed,
    modifiers: [],
    equippedWargear: [],
    isWarlord: false,
  };

  return {
    model,
    modelType,
    modelSubTypes,
    maxWounds,
    isVehicle,
  };
}

// ─── autoSelectTargetModel ──────────────────────────────────────────────────

describe('autoSelectTargetModel', () => {
  it('all models at full wounds: selects first alive model', () => {
    const models = [
      makeModelInfo({ id: 'a', maxWounds: 1, currentWounds: 1 }),
      makeModelInfo({ id: 'b', maxWounds: 1, currentWounds: 1 }),
      makeModelInfo({ id: 'c', maxWounds: 1, currentWounds: 1 }),
    ];

    const selected = autoSelectTargetModel(models, 'wound');
    expect(selected).toBe('a');
  });

  it('one model has lost wounds: must select that one first', () => {
    const models = [
      makeModelInfo({ id: 'a', maxWounds: 2, currentWounds: 2 }),
      makeModelInfo({ id: 'b', maxWounds: 2, currentWounds: 1 }), // Lost 1 wound
      makeModelInfo({ id: 'c', maxWounds: 2, currentWounds: 2 }),
    ];

    const selected = autoSelectTargetModel(models, 'wound');
    expect(selected).toBe('b');
  });

  it('no valid targets (all destroyed): returns null', () => {
    const models = [
      makeModelInfo({ id: 'a', isDestroyed: true, currentWounds: 0 }),
      makeModelInfo({ id: 'b', isDestroyed: true, currentWounds: 0 }),
    ];

    const selected = autoSelectTargetModel(models, 'wound');
    expect(selected).toBeNull();
  });

  it('Paragon model with lost wounds is exempt from wounded-first rule', () => {
    const models = [
      makeModelInfo({ id: 'a', maxWounds: 1, currentWounds: 1 }),
      makeModelInfo({
        id: 'paragon',
        maxWounds: 5,
        currentWounds: 3, // Lost 2 wounds
        modelType: ModelType.Paragon,
      }),
      makeModelInfo({ id: 'c', maxWounds: 1, currentWounds: 1 }),
    ];

    // Paragon is exempt, so wounded-first doesn't apply to it
    // Should select first non-exempt model (first alive = 'a')
    const selected = autoSelectTargetModel(models, 'wound');
    expect(selected).toBe('a');
  });

  it('Command sub-type model with lost wounds is exempt from wounded-first rule', () => {
    const models = [
      makeModelInfo({ id: 'a', maxWounds: 1, currentWounds: 1 }),
      makeModelInfo({
        id: 'commander',
        maxWounds: 3,
        currentWounds: 1, // Lost 2 wounds
        modelSubTypes: [ModelSubType.Command],
      }),
      makeModelInfo({ id: 'c', maxWounds: 1, currentWounds: 1 }),
    ];

    // Command is exempt, so wounded-first doesn't apply
    // Should select first alive non-exempt model = 'a'
    const selected = autoSelectTargetModel(models, 'wound');
    expect(selected).toBe('a');
  });

  it('wound type only targets non-vehicle models', () => {
    const models = [
      makeModelInfo({ id: 'vehicle', modelType: ModelType.Vehicle, isVehicle: true }),
      makeModelInfo({ id: 'infantry', modelType: ModelType.Infantry }),
    ];

    const selected = autoSelectTargetModel(models, 'wound');
    expect(selected).toBe('infantry');
  });

  it('penetrating type only targets vehicle models', () => {
    const models = [
      makeModelInfo({ id: 'infantry', modelType: ModelType.Infantry }),
      makeModelInfo({ id: 'vehicle', modelType: ModelType.Vehicle, isVehicle: true }),
    ];

    const selected = autoSelectTargetModel(models, 'penetrating');
    expect(selected).toBe('vehicle');
  });
});

// ─── getValidTargetModels ───────────────────────────────────────────────────

describe('getValidTargetModels', () => {
  it('returns only alive non-vehicle models for wound type', () => {
    const models = [
      makeModelInfo({ id: 'a', isDestroyed: false }),
      makeModelInfo({ id: 'b', isDestroyed: true, currentWounds: 0 }),
      makeModelInfo({ id: 'c', isDestroyed: false }),
      makeModelInfo({ id: 'd', modelType: ModelType.Vehicle, isVehicle: true }),
    ];

    const validIds = getValidTargetModels(models, 'wound');
    expect(validIds).toEqual(['a', 'c']);
  });

  it('returns only alive vehicle models for penetrating type', () => {
    const models = [
      makeModelInfo({ id: 'infantry', modelType: ModelType.Infantry }),
      makeModelInfo({ id: 'vehicle-alive', modelType: ModelType.Vehicle, isVehicle: true }),
      makeModelInfo({ id: 'vehicle-dead', modelType: ModelType.Vehicle, isVehicle: true, isDestroyed: true, currentWounds: 0 }),
    ];

    const validIds = getValidTargetModels(models, 'penetrating');
    expect(validIds).toEqual(['vehicle-alive']);
  });

  it('returns empty array when no valid targets exist', () => {
    const models = [
      makeModelInfo({ id: 'a', isDestroyed: true, currentWounds: 0 }),
    ];

    const validIds = getValidTargetModels(models, 'wound');
    expect(validIds).toEqual([]);
  });
});
