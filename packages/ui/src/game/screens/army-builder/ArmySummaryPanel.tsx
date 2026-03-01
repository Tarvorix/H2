/**
 * ArmySummaryPanel
 *
 * Bottom bar showing running total points, validation status,
 * import/export buttons, and confirm button.
 */

import type { ArmyList, ArmyValidationResult } from '@hh/types';
import { calculateArmyTotalPoints } from '@hh/army-builder';

interface ArmySummaryPanelProps {
  armyList: ArmyList | null;
  validationResult: ArmyValidationResult | null;
  onValidate: () => void;
  onExport: () => void;
  onImport: () => void;
  onConfirm: () => void;
}

export function ArmySummaryPanel({
  armyList,
  validationResult,
  onValidate,
  onExport,
  onImport,
  onConfirm,
}: ArmySummaryPanelProps) {
  const allUnits = armyList ? armyList.detachments.flatMap((d) => d.units) : [];
  const totalPoints = armyList ? calculateArmyTotalPoints(allUnits) : 0;
  const pointsLimit = armyList?.pointsLimit ?? 0;
  const isOverLimit = totalPoints > pointsLimit;
  const isValid = validationResult?.isValid ?? false;
  const errorCount = validationResult?.errors.length ?? 0;

  return (
    <div className="army-summary-panel">
      <div className="army-summary-points">
        <span className={`army-summary-total ${isOverLimit ? 'over-limit' : ''}`}>
          {totalPoints}
        </span>
        <span className="army-summary-separator">/</span>
        <span className="army-summary-limit">{pointsLimit} pts</span>
      </div>

      <div className="army-summary-status">
        {validationResult && (
          <span className={`army-summary-validation ${isValid ? 'valid' : 'invalid'}`}>
            {isValid ? 'Valid' : `${errorCount} error(s)`}
          </span>
        )}
      </div>

      {validationResult && !isValid && (
        <div className="army-summary-errors">
          {validationResult.errors.slice(0, 3).map((err, i) => (
            <div key={i} className="army-summary-error">
              {err.message}
            </div>
          ))}
          {errorCount > 3 && (
            <div className="army-summary-error">
              ...and {errorCount - 3} more
            </div>
          )}
        </div>
      )}

      <div className="army-summary-actions">
        <button className="toolbar-btn" onClick={onValidate}>
          Validate
        </button>
        <button className="toolbar-btn" onClick={onExport}>
          Export
        </button>
        <button className="toolbar-btn" onClick={onImport}>
          Import
        </button>
        <button
          className={`setup-confirm-btn ${!armyList ? 'disabled' : ''}`}
          disabled={!armyList}
          onClick={onConfirm}
        >
          Confirm Army
        </button>
      </div>
    </div>
  );
}

