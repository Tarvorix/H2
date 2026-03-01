/**
 * ArmyBuilderScreen
 *
 * Multi-panel layout for building armies:
 * - Top bar: Player tabs, Faction/Allegiance/Rite dropdowns, Points Limit
 * - Left panel: Detachment list with slots (filled/empty)
 * - Center panel: Unit browser (filtered by slot role, searchable)
 * - Right panel: Unit config (model count, wargear options, points preview)
 * - Bottom bar: Running total, Validate, Import/Export, Confirm
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ArmyList, ArmyListUnit, UnitProfile, BattlefieldRole } from '@hh/types';
import { LegionFaction, Allegiance, DetachmentType } from '@hh/types';
import {
  validateArmyListForMvp,
  exportArmyList,
  importArmyList,
  createDetachment,
  getUnlockedAuxiliaryCount,
  getUnlockedApexCount,
  validateUnitAssignmentToSlot,
} from '@hh/army-builder';
import {
  getProfileById,
  CRUSADE_PRIMARY,
  ALLIED_DETACHMENT,
  LORD_OF_WAR_DETACHMENT,
  WARLORD_DETACHMENT,
  findDetachmentTemplate,
  getAuxiliaryTemplates,
  getApexTemplates,
  isMvpLegion,
  getMvpLegions,
} from '@hh/data';
import { AIStrategyTier } from '@hh/ai';
import type { GameUIState, GameUIAction } from '../types';
import { FactionSelector } from './army-builder/FactionSelector';
import { DetachmentPanel } from './army-builder/DetachmentPanel';
import { UnitBrowser } from './army-builder/UnitBrowser';
import { UnitConfigPanel } from './army-builder/UnitConfigPanel';
import type { UnitConfigResult } from './army-builder/UnitConfigPanel';
import { ArmySummaryPanel } from './army-builder/ArmySummaryPanel';

interface ArmyBuilderScreenProps {
  state: GameUIState;
  dispatch: React.Dispatch<GameUIAction>;
  onReturnToMenu: () => void;
}

interface DetachmentAddOption {
  templateId: string;
  label: string;
  disabled: boolean;
  disabledReason?: string;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getDefaultAlliedFaction(primaryFaction: LegionFaction): LegionFaction {
  const candidates = getMvpLegions().filter((f) => f !== primaryFaction);
  return candidates[0] ?? primaryFaction;
}

export function ArmyBuilderScreen({ state, dispatch, onReturnToMenu }: ArmyBuilderScreenProps) {
  const { armyBuilder } = state;
  const { editingPlayerIndex } = armyBuilder;
  const currentArmyList = armyBuilder.armyLists[editingPlayerIndex];
  const currentValidation = armyBuilder.validationResults[editingPlayerIndex];
  const [selectedProfile, setSelectedProfile] = useState<UnitProfile | null>(null);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTier, setAiTier] = useState<AIStrategyTier>(AIStrategyTier.Tactical);
  const [selectedDetachmentTemplateId, setSelectedDetachmentTemplateId] = useState<string>('');

  const detachmentAddOptions = useMemo<DetachmentAddOption[]>(() => {
    if (!currentArmyList) return [];

    const detachments = currentArmyList.detachments;
    const primaryDetachment = detachments.find((d) => {
      if (d.type !== DetachmentType.Primary) return false;
      return findDetachmentTemplate(d.detachmentTemplateId)?.category === 'primary';
    });

    if (!primaryDetachment) {
      return [
        {
          templateId: CRUSADE_PRIMARY.id,
          label: CRUSADE_PRIMARY.name,
          disabled: false,
        },
      ];
    }

    const primaryTemplate =
      findDetachmentTemplate(primaryDetachment.detachmentTemplateId) ?? CRUSADE_PRIMARY;

    const alliedCount = detachments.filter((d) => d.type === DetachmentType.Allied).length;
    const auxCount = detachments.filter((d) => d.type === DetachmentType.Auxiliary).length;
    const apexCount = detachments.filter((d) => d.type === DetachmentType.Apex).length;
    const hasWarlordDetachment = detachments.some(
      (d) => findDetachmentTemplate(d.detachmentTemplateId)?.category === 'warlord',
    );
    const hasLordOfWarDetachment = detachments.some(
      (d) => findDetachmentTemplate(d.detachmentTemplateId)?.category === 'lordOfWar',
    );

    const hcUsedForApex = apexCount > 0;
    const maxAux = getUnlockedAuxiliaryCount(primaryDetachment, primaryTemplate, hcUsedForApex);
    const maxApex = getUnlockedApexCount(primaryDetachment, primaryTemplate, hcUsedForApex);

    const options: DetachmentAddOption[] = [
      {
        templateId: ALLIED_DETACHMENT.id,
        label: `Allied: ${ALLIED_DETACHMENT.name}`,
        disabled: alliedCount >= 1,
        disabledReason: alliedCount >= 1 ? 'Only one allied detachment is supported in MVP.' : undefined,
      },
      {
        templateId: WARLORD_DETACHMENT.id,
        label: WARLORD_DETACHMENT.name,
        disabled: hasWarlordDetachment || currentArmyList.pointsLimit < 3000,
        disabledReason: hasWarlordDetachment
          ? 'Warlord detachment already added.'
          : 'Requires 3000+ point limit.',
      },
      {
        templateId: LORD_OF_WAR_DETACHMENT.id,
        label: LORD_OF_WAR_DETACHMENT.name,
        disabled: hasLordOfWarDetachment,
        disabledReason: hasLordOfWarDetachment ? 'Lord of War detachment already added.' : undefined,
      },
    ];

    for (const template of getAuxiliaryTemplates()) {
      options.push({
        templateId: template.id,
        label: `Auxiliary: ${template.name}`,
        disabled: auxCount >= maxAux,
        disabledReason: auxCount >= maxAux
          ? `No auxiliary unlocks remaining (${auxCount}/${maxAux}).`
          : undefined,
      });
    }

    for (const template of getApexTemplates()) {
      options.push({
        templateId: template.id,
        label: `Apex: ${template.name}`,
        disabled: apexCount >= maxApex,
        disabledReason: apexCount >= maxApex
          ? `No apex unlocks remaining (${apexCount}/${maxApex}).`
          : undefined,
      });
    }

    return options;
  }, [currentArmyList]);

  useEffect(() => {
    if (!detachmentAddOptions.length) {
      if (selectedDetachmentTemplateId) {
        setSelectedDetachmentTemplateId('');
      }
      return;
    }

    const hasSelected = detachmentAddOptions.some((o) => o.templateId === selectedDetachmentTemplateId);
    if (!hasSelected) {
      const firstEnabled = detachmentAddOptions.find((o) => !o.disabled);
      setSelectedDetachmentTemplateId(firstEnabled?.templateId ?? '');
    }
  }, [detachmentAddOptions, selectedDetachmentTemplateId]);

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSwitchPlayer = useCallback(
    (playerIndex: number) => {
      dispatch({ type: 'SET_ARMY_BUILDER_PLAYER', playerIndex });
      setSelectedProfile(null);
    },
    [dispatch],
  );

  const handleFactionChange = useCallback(
    (faction: LegionFaction) => {
      if (!isMvpLegion(faction)) {
        window.alert(`Faction "${faction}" is outside HHv2 MVP scope.`);
        return;
      }

      // Auto-create a Primary Crusade detachment if none exists
      const existingDetachments = currentArmyList?.detachments ?? [];
      const detachments = existingDetachments.length > 0
        ? existingDetachments.map((d) => {
            const template = findDetachmentTemplate(d.detachmentTemplateId);
            if (template?.type === DetachmentType.Allied) {
              const nextFaction = d.faction === faction ? getDefaultAlliedFaction(faction) : d.faction;
              return { ...d, faction: nextFaction };
            }
            return { ...d, faction };
          })
        : [createDetachment(CRUSADE_PRIMARY, faction, generateId('det-primary'))];

      const armyList: ArmyList = {
        playerName: currentArmyList?.playerName ?? `Player ${editingPlayerIndex + 1}`,
        faction,
        allegiance: currentArmyList?.allegiance ?? Allegiance.Traitor,
        pointsLimit: currentArmyList?.pointsLimit ?? 2000,
        totalPoints: currentArmyList?.totalPoints ?? 0,
        detachments,
        riteOfWar: currentArmyList?.riteOfWar,
      };
      dispatch({ type: 'SET_ARMY_LIST', playerIndex: editingPlayerIndex, armyList });
    },
    [dispatch, editingPlayerIndex, currentArmyList],
  );

  const handleAllegianceChange = useCallback(
    (allegiance: Allegiance) => {
      if (!currentArmyList) return;
      dispatch({
        type: 'SET_ARMY_LIST',
        playerIndex: editingPlayerIndex,
        armyList: { ...currentArmyList, allegiance },
      });
    },
    [dispatch, editingPlayerIndex, currentArmyList],
  );

  const handlePointsLimitChange = useCallback(
    (limit: number) => {
      if (!currentArmyList) return;
      dispatch({
        type: 'SET_ARMY_LIST',
        playerIndex: editingPlayerIndex,
        armyList: { ...currentArmyList, pointsLimit: limit },
      });
    },
    [dispatch, editingPlayerIndex, currentArmyList],
  );

  const handleRiteChange = useCallback(
    (riteId: string | null) => {
      dispatch({ type: 'SET_RITE_OF_WAR', playerIndex: editingPlayerIndex, riteId });
    },
    [dispatch, editingPlayerIndex],
  );

  const handleSelectDetachment = useCallback(
    (index: number | null) => {
      dispatch({ type: 'SET_ACTIVE_DETACHMENT', index });
      dispatch({ type: 'SET_ACTIVE_SLOT', slotId: null });
      setSelectedProfile(null);
    },
    [dispatch],
  );

  const handleSelectSlot = useCallback(
    (slotId: string | null) => {
      dispatch({ type: 'SET_ACTIVE_SLOT', slotId });
      setSelectedProfile(null);
    },
    [dispatch],
  );

  const handleSelectUnit = useCallback(
    (profileId: string) => {
      const profile = getProfileById(profileId);
      if (profile) {
        setSelectedProfile(profile);
      }
    },
    [],
  );

  const handleSearchChange = useCallback(
    (filter: string) => {
      dispatch({ type: 'SET_UNIT_SEARCH_FILTER', filter });
    },
    [dispatch],
  );

  const handleUnitConfirm = useCallback(
    (config: UnitConfigResult) => {
      if (!currentArmyList || armyBuilder.activeDetachmentIndex === null || !selectedProfile) return;
      if (!armyBuilder.activeSlotId) {
        window.alert('Select a detachment slot before adding a unit.');
        return;
      }

      const detachment = currentArmyList.detachments[armyBuilder.activeDetachmentIndex];
      if (!detachment) return;
      const template = findDetachmentTemplate(detachment.detachmentTemplateId);
      if (!template) return;

      const slotValidation = validateUnitAssignmentToSlot(
        detachment,
        template,
        armyBuilder.activeSlotId,
        selectedProfile.battlefieldRole,
      );
      if (!slotValidation.isValid) {
        window.alert(slotValidation.reason ?? 'Selected unit cannot be added to the selected slot.');
        return;
      }

      const newUnit: ArmyListUnit = {
        id: `unit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        profileId: config.profileId,
        modelCount: config.modelCount,
        selectedOptions: config.selectedWargearIndices.map((idx) => ({
          optionIndex: idx,
          count: 1,
        })),
        totalPoints: config.totalPoints,
        battlefieldRole: selectedProfile.battlefieldRole,
      };

      const updatedDetachment = {
        ...detachment,
        units: [...detachment.units, newUnit],
      };
      const updatedDetachments = [...currentArmyList.detachments];
      updatedDetachments[armyBuilder.activeDetachmentIndex] = updatedDetachment;

      const newTotalPoints = updatedDetachments.reduce(
        (sum, d) => sum + d.units.reduce((s, u) => s + u.totalPoints, 0),
        0,
      );

      const updatedArmyList: ArmyList = {
        ...currentArmyList,
        detachments: updatedDetachments,
        totalPoints: newTotalPoints,
      };

      dispatch({ type: 'SET_ARMY_LIST', playerIndex: editingPlayerIndex, armyList: updatedArmyList });
      setSelectedProfile(null);
    },
    [
      dispatch,
      editingPlayerIndex,
      currentArmyList,
      armyBuilder.activeDetachmentIndex,
      armyBuilder.activeSlotId,
      selectedProfile,
    ],
  );

  const handleAddDetachment = useCallback(() => {
    if (!currentArmyList || !selectedDetachmentTemplateId) return;

    const addOption = detachmentAddOptions.find((o) => o.templateId === selectedDetachmentTemplateId);
    if (!addOption) return;
    if (addOption.disabled) {
      window.alert(addOption.disabledReason ?? 'Selected detachment cannot be added right now.');
      return;
    }

    const template = findDetachmentTemplate(selectedDetachmentTemplateId);
    if (!template) {
      window.alert(`Unknown detachment template "${selectedDetachmentTemplateId}".`);
      return;
    }

    const faction =
      template.type === DetachmentType.Allied
        ? getDefaultAlliedFaction(currentArmyList.faction)
        : currentArmyList.faction;

    const newDetachment = createDetachment(template, faction, generateId(`det-${template.id}`));
    const updatedArmyList: ArmyList = {
      ...currentArmyList,
      detachments: [...currentArmyList.detachments, newDetachment],
    };

    dispatch({ type: 'SET_ARMY_LIST', playerIndex: editingPlayerIndex, armyList: updatedArmyList });
    dispatch({ type: 'SET_ACTIVE_DETACHMENT', index: updatedArmyList.detachments.length - 1 });
    dispatch({ type: 'SET_ACTIVE_SLOT', slotId: null });
    setSelectedProfile(null);
  }, [
    currentArmyList,
    selectedDetachmentTemplateId,
    detachmentAddOptions,
    dispatch,
    editingPlayerIndex,
  ]);

  const handleRemoveDetachment = useCallback(
    (detachmentIndex: number) => {
      if (!currentArmyList) return;
      const target = currentArmyList.detachments[detachmentIndex];
      if (!target) return;

      const template = findDetachmentTemplate(target.detachmentTemplateId);
      if (template?.category === 'primary') {
        window.alert('Primary detachment cannot be removed.');
        return;
      }

      const updatedDetachments = currentArmyList.detachments.filter((_, index) => index !== detachmentIndex);
      const newTotalPoints = updatedDetachments.reduce(
        (sum, d) => sum + d.units.reduce((s, u) => s + u.totalPoints, 0),
        0,
      );
      const updatedArmyList: ArmyList = {
        ...currentArmyList,
        detachments: updatedDetachments,
        totalPoints: newTotalPoints,
      };

      dispatch({ type: 'SET_ARMY_LIST', playerIndex: editingPlayerIndex, armyList: updatedArmyList });

      if (armyBuilder.activeDetachmentIndex === detachmentIndex) {
        dispatch({ type: 'SET_ACTIVE_DETACHMENT', index: null });
        dispatch({ type: 'SET_ACTIVE_SLOT', slotId: null });
      } else if (
        armyBuilder.activeDetachmentIndex !== null &&
        armyBuilder.activeDetachmentIndex > detachmentIndex
      ) {
        dispatch({ type: 'SET_ACTIVE_DETACHMENT', index: armyBuilder.activeDetachmentIndex - 1 });
      }
      setSelectedProfile(null);
    },
    [currentArmyList, dispatch, editingPlayerIndex, armyBuilder.activeDetachmentIndex],
  );

  const handleRemoveUnitFromSlot = useCallback(
    (detachmentIndex: number, unitId: string) => {
      if (!currentArmyList) return;
      const detachment = currentArmyList.detachments[detachmentIndex];
      if (!detachment) return;

      const updatedDetachment = {
        ...detachment,
        units: detachment.units.filter((u) => u.id !== unitId),
      };
      const updatedDetachments = [...currentArmyList.detachments];
      updatedDetachments[detachmentIndex] = updatedDetachment;

      const newTotalPoints = updatedDetachments.reduce(
        (sum, d) => sum + d.units.reduce((s, u) => s + u.totalPoints, 0),
        0,
      );

      const updatedArmyList: ArmyList = {
        ...currentArmyList,
        detachments: updatedDetachments,
        totalPoints: newTotalPoints,
      };

      dispatch({ type: 'SET_ARMY_LIST', playerIndex: editingPlayerIndex, armyList: updatedArmyList });
      setSelectedProfile(null);
    },
    [currentArmyList, dispatch, editingPlayerIndex],
  );

  const handleUnitCancel = useCallback(() => {
    setSelectedProfile(null);
  }, []);

  const handleValidate = useCallback(() => {
    if (!currentArmyList) return;
    const result = validateArmyListForMvp(currentArmyList);
    dispatch({ type: 'SET_ARMY_VALIDATION', playerIndex: editingPlayerIndex, result });
  }, [dispatch, editingPlayerIndex, currentArmyList]);

  const handleExport = useCallback(() => {
    if (!currentArmyList) return;
    const json = exportArmyList(currentArmyList);
    // Copy to clipboard
    navigator.clipboard?.writeText(json).catch(() => {
      // Fallback: show in alert
      window.alert(json);
    });
  }, [currentArmyList]);

  const handleImport = useCallback(() => {
    const json = window.prompt('Paste army list JSON:');
    if (!json) return;
    const result = importArmyList(json);
    if (result.armyList) {
      const validation = validateArmyListForMvp(result.armyList);
      dispatch({ type: 'SET_ARMY_LIST', playerIndex: editingPlayerIndex, armyList: result.armyList });
      dispatch({ type: 'SET_ARMY_VALIDATION', playerIndex: editingPlayerIndex, result: validation });
      if (!validation.isValid) {
        window.alert('Imported army has validation errors:\n' + validation.errors.map(e => e.message).join('\n'));
      }
    }
    if (result.errors.length > 0) {
      window.alert('Import errors:\n' + result.errors.join('\n'));
    }
  }, [dispatch, editingPlayerIndex]);

  const handleConfirm = useCallback(() => {
    const player0 = state.armyBuilder.armyLists[0];
    const player1 = state.armyBuilder.armyLists[1];
    if (!player0 || !player1) {
      window.alert('Both players must complete army lists before continuing.');
      return;
    }

    const validation0 = validateArmyListForMvp(player0);
    const validation1 = validateArmyListForMvp(player1);

    dispatch({ type: 'SET_ARMY_VALIDATION', playerIndex: 0, result: validation0 });
    dispatch({ type: 'SET_ARMY_VALIDATION', playerIndex: 1, result: validation1 });

    if (!validation0.isValid || !validation1.isValid) {
      window.alert('Cannot continue until both army lists are valid within HHv2 MVP scope.');
      return;
    }

    if (aiEnabled) {
      dispatch({
        type: 'SET_AI_CONFIG',
        config: {
          playerIndex: 1,
          strategyTier: aiTier,
          commandDelayMs: 600,
          enabled: true,
        },
      });
    } else {
      dispatch({ type: 'SET_AI_CONFIG', config: null });
    }
    dispatch({ type: 'CONFIRM_ARMY_BUILDER' });
  }, [dispatch, aiEnabled, aiTier, state.armyBuilder.armyLists]);

  // Get the filter role from the active slot (template slot ID maps to a role)
  const filterRole: BattlefieldRole | null = (() => {
    if (!armyBuilder.activeSlotId || armyBuilder.activeDetachmentIndex === null || !currentArmyList) return null;
    const detachment = currentArmyList.detachments[armyBuilder.activeDetachmentIndex];
    if (!detachment) return null;
    const template = findDetachmentTemplate(detachment.detachmentTemplateId);
    if (!template) return null;
    const slot = template.slots.find(s => s.id === armyBuilder.activeSlotId);
    return slot?.role ?? null;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="setup-screen army-builder-screen">
      <div className="setup-header">
        <h1 className="setup-title">Army Builder</h1>
        <div className="army-builder-player-tabs">
          <button
            className={`army-builder-tab ${editingPlayerIndex === 0 ? 'active' : ''}`}
            onClick={() => handleSwitchPlayer(0)}
          >
            Player 1
          </button>
          <button
            className={`army-builder-tab ${editingPlayerIndex === 1 ? 'active' : ''}`}
            onClick={() => handleSwitchPlayer(1)}
          >
            Player 2{aiEnabled ? ' (AI)' : ''}
          </button>
        </div>
        <div className="ai-toggle-group">
          <label className="ai-toggle-label">
            <input
              type="checkbox"
              className="ai-toggle-checkbox"
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            <span>AI Opponent</span>
          </label>
          {aiEnabled && (
            <select
              className="ai-tier-select"
              value={aiTier}
              onChange={(e) => setAiTier(e.target.value as AIStrategyTier)}
            >
              <option value={AIStrategyTier.Basic}>Basic</option>
              <option value={AIStrategyTier.Tactical}>Tactical</option>
            </select>
          )}
        </div>
        <button className="toolbar-btn" onClick={onReturnToMenu}>
          Back to Menu
        </button>
      </div>

      <div className="army-builder-faction-bar">
        <FactionSelector
          armyList={currentArmyList}
          playerIndex={editingPlayerIndex}
          selectedRiteId={armyBuilder.selectedRiteIds[editingPlayerIndex]}
          onFactionChange={handleFactionChange}
          onAllegianceChange={handleAllegianceChange}
          onPointsLimitChange={handlePointsLimitChange}
          onRiteChange={handleRiteChange}
        />
      </div>

      <div className="army-builder-content">
        <DetachmentPanel
          armyList={currentArmyList}
          activeDetachmentIndex={armyBuilder.activeDetachmentIndex}
          activeSlotId={armyBuilder.activeSlotId}
          addOptions={detachmentAddOptions}
          selectedAddTemplateId={selectedDetachmentTemplateId}
          onSetSelectedAddTemplateId={setSelectedDetachmentTemplateId}
          onAddDetachment={handleAddDetachment}
          onRemoveDetachment={handleRemoveDetachment}
          onRemoveUnit={handleRemoveUnitFromSlot}
          onSelectDetachment={handleSelectDetachment}
          onSelectSlot={handleSelectSlot}
        />

        <UnitBrowser
          filterRole={filterRole}
          searchFilter={armyBuilder.unitSearchFilter}
          faction={currentArmyList?.faction ?? null}
          onSelectUnit={handleSelectUnit}
          onSearchChange={handleSearchChange}
        />

        <UnitConfigPanel
          profile={selectedProfile}
          onConfirm={handleUnitConfirm}
          onCancel={handleUnitCancel}
        />
      </div>

      <ArmySummaryPanel
        armyList={currentArmyList}
        validationResult={currentValidation}
        onValidate={handleValidate}
        onExport={handleExport}
        onImport={handleImport}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
