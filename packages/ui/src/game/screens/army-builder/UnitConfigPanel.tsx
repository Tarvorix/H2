/**
 * UnitConfigPanel
 *
 * Right panel for configuring a selected unit:
 * model count, wargear options, points preview.
 */

import { useCallback, useState, useEffect } from 'react';
import type { UnitProfile } from '@hh/types';

interface UnitConfigPanelProps {
  /** The unit profile being configured */
  profile: UnitProfile | null;
  /** Callback when unit configuration is confirmed */
  onConfirm: (config: UnitConfigResult) => void;
  /** Callback to cancel selection */
  onCancel: () => void;
}

export interface UnitConfigResult {
  profileId: string;
  modelCount: number;
  selectedWargearIndices: number[];
  totalPoints: number;
}

export function UnitConfigPanel({
  profile,
  onConfirm,
  onCancel,
}: UnitConfigPanelProps) {
  const [modelCount, setModelCount] = useState<number>(profile?.minModels ?? 1);
  const [selectedWargear, setSelectedWargear] = useState<number[]>([]);

  // Reset local state when the selected profile changes
  useEffect(() => {
    setModelCount(profile?.minModels ?? 1);
    setSelectedWargear([]);
  }, [profile?.id]);

  const handleModelCountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = Number(e.target.value);
      if (profile) {
        setModelCount(Math.max(profile.minModels, Math.min(profile.maxModels, val)));
      }
    },
    [profile],
  );

  const handleToggleWargear = useCallback(
    (index: number) => {
      setSelectedWargear((prev) =>
        prev.includes(index)
          ? prev.filter((i) => i !== index)
          : [...prev, index],
      );
    },
    [],
  );

  const normalizedWargearOptions = (profile?.wargearOptions ?? []).map((opt, idx) => {
    const pointsCost =
      typeof opt?.pointsCost === 'number' && Number.isFinite(opt.pointsCost)
        ? opt.pointsCost
        : 0;
    const description =
      typeof opt?.description === 'string' && opt.description.trim().length > 0
        ? opt.description
        : `Wargear option ${idx + 1}`;

    return {
      index: idx,
      description,
      pointsCost,
    };
  });

  // Calculate points
  const additionalModels = profile ? Math.max(0, modelCount - profile.minModels) : 0;
  const wargearCost = selectedWargear.reduce((sum, idx) => {
    const opt = normalizedWargearOptions.find((option) => option.index === idx);
    return sum + (opt?.pointsCost ?? 0);
  }, 0);
  const totalPoints = profile
    ? profile.basePoints + additionalModels * profile.pointsPerAdditionalModel + wargearCost
    : 0;

  const handleConfirm = useCallback(() => {
    if (!profile) return;
    onConfirm({
      profileId: profile.id,
      modelCount,
      selectedWargearIndices: selectedWargear,
      totalPoints,
    });
  }, [profile, modelCount, selectedWargear, totalPoints, onConfirm]);

  if (!profile) {
    return (
      <div className="unit-config-panel">
        <div className="panel-title">Unit Configuration</div>
        <div className="unit-config-empty">
          Select a unit from the browser to configure it.
        </div>
      </div>
    );
  }

  return (
    <div className="unit-config-panel">
      <div className="panel-title">Unit Configuration</div>

      <div className="unit-config-name">{profile.name}</div>
      <div className="unit-config-type">{profile.unitType}</div>

      <div className="unit-config-section">
        <label className="unit-config-label">Model Count</label>
        <div className="unit-config-model-count">
          <input
            type="range"
            min={profile.minModels}
            max={profile.maxModels}
            value={modelCount}
            onChange={handleModelCountChange}
            className="unit-config-slider"
          />
          <span className="unit-config-count-value">{modelCount}</span>
          <span className="unit-config-count-range">
            ({profile.minModels}-{profile.maxModels})
          </span>
        </div>
      </div>

      {normalizedWargearOptions.length > 0 && (
        <div className="unit-config-section">
          <label className="unit-config-label">Wargear Options</label>
          <div className="unit-config-wargear-list">
            {normalizedWargearOptions.map((opt) => (
              <div
                key={opt.index}
                className={`unit-config-wargear-item ${selectedWargear.includes(opt.index) ? 'selected' : ''}`}
                onClick={() => handleToggleWargear(opt.index)}
                role="button"
                tabIndex={0}
              >
                <span className="wargear-name">{opt.description}</span>
                <span className="wargear-cost">+{opt.pointsCost}pts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="unit-config-section">
        <div className="unit-config-points-breakdown">
          <div className="points-line">
            <span>Base ({profile.minModels} models)</span>
            <span>{profile.basePoints}pts</span>
          </div>
          {additionalModels > 0 && (
            <div className="points-line">
              <span>+{additionalModels} additional models</span>
              <span>+{additionalModels * profile.pointsPerAdditionalModel}pts</span>
            </div>
          )}
          {wargearCost > 0 && (
            <div className="points-line">
              <span>Wargear options</span>
              <span>+{wargearCost}pts</span>
            </div>
          )}
          <div className="points-line points-total">
            <span>Total</span>
            <span>{totalPoints}pts</span>
          </div>
        </div>
      </div>

      <div className="unit-config-actions">
        <button className="toolbar-btn" onClick={onCancel}>Cancel</button>
        <button className="setup-confirm-btn" onClick={handleConfirm}>
          Add to Detachment
        </button>
      </div>
    </div>
  );
}
