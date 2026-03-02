/**
 * Detachment Management Tests.
 */

import { describe, it, expect } from 'vitest';
import { BattlefieldRole, DetachmentType, LegionFaction } from '@hh/types';
import type { ArmyListDetachment, ArmyListUnit } from '@hh/types';
import {
  CRUSADE_PRIMARY,
  WARLORD_DETACHMENT,
  ARMOURED_FIST,
  COMBAT_RETINUE,
} from '@hh/data';
import type { DetachmentTemplate } from '@hh/data';
import {
  createDetachment,
  createSlotsFromTemplate,
  getUnlockedAuxiliaryCount,
  getUnlockedApexCount,
  getFilledSlotCount,
  canFillSlot,
  validateUnitAssignmentToSlot,
  addUnitToDetachment,
  removeUnitFromDetachment,
  areMandatorySlotsFilled,
  getOpenSlotCount,
  isWarlordDetachmentAllowed,
  getAvailableRoles,
} from './detachments';

// ─── Test Fixtures ───────────────────────────────────────────────────────────

function makeUnit(overrides: Partial<ArmyListUnit> = {}): ArmyListUnit {
  return {
    id: 'unit-1',
    profileId: 'test-profile',
    modelCount: 5,
    selectedOptions: [],
    totalPoints: 100,
    battlefieldRole: BattlefieldRole.Troops,
    ...overrides,
  };
}

function makeDetachment(overrides: Partial<ArmyListDetachment> = {}): ArmyListDetachment {
  return {
    id: 'det-1',
    detachmentTemplateId: 'crusade-primary',
    type: DetachmentType.Primary,
    faction: LegionFaction.SonsOfHorus,
    units: [],
    ...overrides,
  };
}

// ─── createDetachment ────────────────────────────────────────────────────────

describe('createDetachment', () => {
  it('creates a detachment from a template', () => {
    const det = createDetachment(CRUSADE_PRIMARY, LegionFaction.DarkAngels, 'det-1');
    expect(det.id).toBe('det-1');
    expect(det.detachmentTemplateId).toBe('crusade-primary');
    expect(det.type).toBe(DetachmentType.Primary);
    expect(det.faction).toBe(LegionFaction.DarkAngels);
    expect(det.units).toEqual([]);
  });

  it('creates an Auxiliary detachment', () => {
    const det = createDetachment(ARMOURED_FIST, LegionFaction.IronHands, 'det-2');
    expect(det.type).toBe(DetachmentType.Auxiliary);
    expect(det.detachmentTemplateId).toBe('armoured-fist');
  });
});

// ─── createSlotsFromTemplate ─────────────────────────────────────────────────

describe('createSlotsFromTemplate', () => {
  it('creates ForceOrgSlots from template slots', () => {
    const slots = createSlotsFromTemplate(CRUSADE_PRIMARY.slots);
    expect(slots).toHaveLength(12);
    expect(slots.every((s) => s.filledByUnitId === null)).toBe(true);
  });

  it('preserves role and isPrime from template', () => {
    const slots = createSlotsFromTemplate(CRUSADE_PRIMARY.slots);
    const commandSlots = slots.filter((s) => s.role === BattlefieldRole.Command);
    expect(commandSlots.every((s) => s.isPrime)).toBe(true);
  });
});

// ─── getFilledSlotCount ──────────────────────────────────────────────────────

describe('getFilledSlotCount', () => {
  it('returns 0 for empty detachment', () => {
    const det = makeDetachment();
    expect(getFilledSlotCount(det, CRUSADE_PRIMARY, BattlefieldRole.Command)).toBe(0);
  });

  it('counts filled Command slots', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command }),
        makeUnit({ id: 'cmd-2', battlefieldRole: BattlefieldRole.Command }),
      ],
    });
    expect(getFilledSlotCount(det, CRUSADE_PRIMARY, BattlefieldRole.Command)).toBe(2);
  });

  it('caps at template slot count', () => {
    // CRUSADE_PRIMARY has 3 Command slots, so 5 units caps at 3
    const det = makeDetachment({
      units: Array.from({ length: 5 }, (_, i) =>
        makeUnit({ id: `cmd-${i}`, battlefieldRole: BattlefieldRole.Command }),
      ),
    });
    expect(getFilledSlotCount(det, CRUSADE_PRIMARY, BattlefieldRole.Command)).toBe(3);
  });
});

// ─── Detachment Unlocking ────────────────────────────────────────────────────

describe('getUnlockedAuxiliaryCount', () => {
  it('returns 0 for empty Primary', () => {
    const det = makeDetachment();
    expect(getUnlockedAuxiliaryCount(det, CRUSADE_PRIMARY)).toBe(0);
  });

  it('each filled Command slot unlocks 1 Auxiliary', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command }),
        makeUnit({ id: 'cmd-2', battlefieldRole: BattlefieldRole.Command }),
      ],
    });
    expect(getUnlockedAuxiliaryCount(det, CRUSADE_PRIMARY)).toBe(2);
  });

  it('filled HC slot adds 1 Auxiliary if not used for Apex', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'hc-1', battlefieldRole: BattlefieldRole.HighCommand }),
        makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command }),
      ],
    });
    expect(getUnlockedAuxiliaryCount(det, CRUSADE_PRIMARY, false)).toBe(2); // 1 cmd + 1 HC
  });

  it('filled HC slot does NOT add Auxiliary if used for Apex', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'hc-1', battlefieldRole: BattlefieldRole.HighCommand }),
        makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command }),
      ],
    });
    expect(getUnlockedAuxiliaryCount(det, CRUSADE_PRIMARY, true)).toBe(1); // 1 cmd only
  });
});

describe('getUnlockedApexCount', () => {
  it('returns 0 if hcUsedForApex is false', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'hc-1', battlefieldRole: BattlefieldRole.HighCommand }),
      ],
    });
    expect(getUnlockedApexCount(det, CRUSADE_PRIMARY, false)).toBe(0);
  });

  it('returns 1 if HC is filled and hcUsedForApex is true', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'hc-1', battlefieldRole: BattlefieldRole.HighCommand }),
      ],
    });
    expect(getUnlockedApexCount(det, CRUSADE_PRIMARY, true)).toBe(1);
  });

  it('returns 0 if HC is not filled even with hcUsedForApex true', () => {
    const det = makeDetachment();
    expect(getUnlockedApexCount(det, CRUSADE_PRIMARY, true)).toBe(0);
  });
});

// ─── Slot Management ─────────────────────────────────────────────────────────

describe('canFillSlot', () => {
  it('returns true when roles match', () => {
    const slot = CRUSADE_PRIMARY.slots.find(
      (s) => s.role === BattlefieldRole.Troops,
    )!;
    expect(canFillSlot(slot, BattlefieldRole.Troops)).toBe(true);
  });

  it('returns false when roles do not match', () => {
    const slot = CRUSADE_PRIMARY.slots.find(
      (s) => s.role === BattlefieldRole.Troops,
    )!;
    expect(canFillSlot(slot, BattlefieldRole.Command)).toBe(false);
  });
});

describe('validateUnitAssignmentToSlot', () => {
  it('returns invalid for unknown slot ID', () => {
    const det = makeDetachment();
    const result = validateUnitAssignmentToSlot(
      det,
      CRUSADE_PRIMARY,
      'missing-slot',
      BattlefieldRole.Troops,
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('does not exist');
  });

  it('returns invalid when role does not match selected slot', () => {
    const det = makeDetachment();
    const hcSlot = CRUSADE_PRIMARY.slots.find((s) => s.role === BattlefieldRole.HighCommand)!;
    const result = validateUnitAssignmentToSlot(
      det,
      CRUSADE_PRIMARY,
      hcSlot.id,
      BattlefieldRole.Troops,
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('only accepts');
  });

  it('returns invalid when selected slot is already filled', () => {
    const commandSlots = CRUSADE_PRIMARY.slots.filter((s) => s.role === BattlefieldRole.Command);
    const det = makeDetachment({
      units: [makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command })],
    });
    const result = validateUnitAssignmentToSlot(
      det,
      CRUSADE_PRIMARY,
      commandSlots[0].id,
      BattlefieldRole.Command,
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('already filled');
  });

  it('returns invalid when attempting to skip earlier same-role slots', () => {
    const commandSlots = CRUSADE_PRIMARY.slots.filter((s) => s.role === BattlefieldRole.Command);
    const det = makeDetachment();
    const result = validateUnitAssignmentToSlot(
      det,
      CRUSADE_PRIMARY,
      commandSlots[1].id,
      BattlefieldRole.Command,
    );
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('Fill earlier');
  });

  it('returns valid for the next available slot of the same role', () => {
    const commandSlots = CRUSADE_PRIMARY.slots.filter((s) => s.role === BattlefieldRole.Command);
    const det = makeDetachment({
      units: [makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command })],
    });
    const result = validateUnitAssignmentToSlot(
      det,
      CRUSADE_PRIMARY,
      commandSlots[1].id,
      BattlefieldRole.Command,
    );
    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });
});

describe('addUnitToDetachment', () => {
  it('returns new detachment with unit added', () => {
    const det = makeDetachment();
    const unit = makeUnit({ id: 'new-unit' });
    const result = addUnitToDetachment(det, unit);

    expect(result.units).toHaveLength(1);
    expect(result.units[0].id).toBe('new-unit');
    // Original unchanged
    expect(det.units).toHaveLength(0);
  });

  it('preserves existing units', () => {
    const det = makeDetachment({
      units: [makeUnit({ id: 'existing' })],
    });
    const unit = makeUnit({ id: 'new-unit' });
    const result = addUnitToDetachment(det, unit);
    expect(result.units).toHaveLength(2);
  });
});

describe('removeUnitFromDetachment', () => {
  it('returns new detachment without the removed unit', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'keep' }),
        makeUnit({ id: 'remove' }),
      ],
    });
    const result = removeUnitFromDetachment(det, 'remove');

    expect(result.units).toHaveLength(1);
    expect(result.units[0].id).toBe('keep');
    // Original unchanged
    expect(det.units).toHaveLength(2);
  });

  it('returns unchanged detachment if unit ID not found', () => {
    const det = makeDetachment({
      units: [makeUnit({ id: 'existing' })],
    });
    const result = removeUnitFromDetachment(det, 'nonexistent');
    expect(result.units).toHaveLength(1);
  });
});

// ─── Mandatory Slots ─────────────────────────────────────────────────────────

describe('areMandatorySlotsFilled', () => {
  it('returns true for empty Crusade Primary (HC is optional)', () => {
    const det = makeDetachment();
    expect(areMandatorySlotsFilled(det, CRUSADE_PRIMARY)).toBe(true);
  });

  it('returns true when HC slot is filled', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'hc-1', battlefieldRole: BattlefieldRole.HighCommand }),
      ],
    });
    expect(areMandatorySlotsFilled(det, CRUSADE_PRIMARY)).toBe(true);
  });

  it('Warlord Detachment requires Warlord slot', () => {
    const det = makeDetachment({
      detachmentTemplateId: 'warlord-detachment',
      units: [],
    });
    expect(areMandatorySlotsFilled(det, WARLORD_DETACHMENT)).toBe(false);

    const filled = makeDetachment({
      detachmentTemplateId: 'warlord-detachment',
      units: [
        makeUnit({ id: 'wl-1', battlefieldRole: BattlefieldRole.Warlord }),
      ],
    });
    expect(areMandatorySlotsFilled(filled, WARLORD_DETACHMENT)).toBe(true);
  });

  it('detachment with no mandatory slots always returns true', () => {
    const det = makeDetachment({
      detachmentTemplateId: 'armoured-fist',
      units: [],
    });
    expect(areMandatorySlotsFilled(det, ARMOURED_FIST)).toBe(true);
  });
});

// ─── getOpenSlotCount ────────────────────────────────────────────────────────

describe('getOpenSlotCount', () => {
  it('returns total slots for empty detachment', () => {
    const det = makeDetachment();
    expect(getOpenSlotCount(det, CRUSADE_PRIMARY, BattlefieldRole.Command)).toBe(3);
    expect(getOpenSlotCount(det, CRUSADE_PRIMARY, BattlefieldRole.Troops)).toBe(4);
  });

  it('returns reduced count when slots are partially filled', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command }),
      ],
    });
    expect(getOpenSlotCount(det, CRUSADE_PRIMARY, BattlefieldRole.Command)).toBe(2);
  });

  it('returns 0 when all slots of a role are filled', () => {
    const det = makeDetachment({
      units: [
        makeUnit({ id: 'cmd-1', battlefieldRole: BattlefieldRole.Command }),
        makeUnit({ id: 'cmd-2', battlefieldRole: BattlefieldRole.Command }),
        makeUnit({ id: 'cmd-3', battlefieldRole: BattlefieldRole.Command }),
      ],
    });
    expect(getOpenSlotCount(det, CRUSADE_PRIMARY, BattlefieldRole.Command)).toBe(0);
  });
});

// ─── Warlord Detachment Threshold ────────────────────────────────────────────

describe('isWarlordDetachmentAllowed', () => {
  it('returns false below 3000 points', () => {
    expect(isWarlordDetachmentAllowed(2999)).toBe(false);
    expect(isWarlordDetachmentAllowed(2000)).toBe(false);
  });

  it('returns true at 3000 points', () => {
    expect(isWarlordDetachmentAllowed(3000)).toBe(true);
  });

  it('returns true above 3000 points', () => {
    expect(isWarlordDetachmentAllowed(5000)).toBe(true);
  });
});

// ─── getAvailableRoles ───────────────────────────────────────────────────────

describe('getAvailableRoles', () => {
  it('returns unique roles from Crusade Primary', () => {
    const roles = getAvailableRoles(CRUSADE_PRIMARY);
    expect(roles).toContain(BattlefieldRole.HighCommand);
    expect(roles).toContain(BattlefieldRole.Command);
    expect(roles).toContain(BattlefieldRole.Troops);
    expect(roles).toContain(BattlefieldRole.Transport);
    expect(roles).toHaveLength(4);
  });

  it('returns roles from Apex template', () => {
    const roles = getAvailableRoles(COMBAT_RETINUE);
    expect(roles).toContain(BattlefieldRole.Command);
    expect(roles).toContain(BattlefieldRole.Retinue);
    expect(roles).toHaveLength(2);
  });
});
