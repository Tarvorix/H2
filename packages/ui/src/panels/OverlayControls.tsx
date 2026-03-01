/**
 * OverlayControls
 * Checkboxes to toggle each overlay layer on/off.
 */

import type { OverlayVisibility, DebugVisualizerAction } from '../state/types';

interface OverlayControlsProps {
  visibility: OverlayVisibility;
  dispatch: React.Dispatch<DebugVisualizerAction>;
}

const OVERLAY_LABELS: { key: keyof OverlayVisibility; label: string }[] = [
  { key: 'grid', label: 'Grid' },
  { key: 'coherency', label: 'Coherency' },
  { key: 'los', label: 'Line of Sight' },
  { key: 'distance', label: 'Distance' },
  { key: 'movement', label: 'Movement Envelope' },
  { key: 'blast', label: 'Blast Marker' },
  { key: 'template', label: 'Template' },
  { key: 'vehicleFacing', label: 'Vehicle Facing' },
];

export function OverlayControls({ visibility, dispatch }: OverlayControlsProps) {
  return (
    <div className="panel-section">
      <div className="panel-title">Overlays</div>
      {OVERLAY_LABELS.map(({ key, label }) => (
        <label key={key} className="overlay-checkbox">
          <input
            type="checkbox"
            checked={visibility[key]}
            onChange={() => dispatch({ type: 'TOGGLE_OVERLAY', overlay: key })}
          />
          {label}
        </label>
      ))}
    </div>
  );
}
