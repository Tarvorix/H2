/**
 * DiceDisplay
 *
 * Animated overlay showing recent dice roll results.
 * Displays d6 faces with pass/fail coloring.
 * Appears briefly over the battlefield when rolls happen, then fades.
 */

import { useEffect, useState } from 'react';
import type { DiceAnimationState } from '../types';

interface DiceDisplayProps {
  animation: DiceAnimationState;
  onDismiss: () => void;
}

export function DiceDisplay({ animation, onDismiss }: DiceDisplayProps) {
  const [opacity, setOpacity] = useState(1);

  // Fade out near the end of the duration
  useEffect(() => {
    if (!animation.isVisible || !animation.roll) return;

    const fadeStartTime = animation.duration * 0.85;
    const elapsed = Date.now() - animation.startTime;

    if (elapsed >= fadeStartTime) {
      setOpacity(0);
      return;
    }

    const timer = setTimeout(() => {
      setOpacity(0);
    }, fadeStartTime - elapsed);

    return () => clearTimeout(timer);
  }, [animation.isVisible, animation.startTime, animation.duration, animation.roll]);

  if (!animation.isVisible || !animation.roll) return null;

  const roll = animation.roll;

  return (
    <div
      className="game-dice-overlay"
      style={{
        opacity,
        transition: 'opacity 0.5s ease-out',
        pointerEvents: 'none',
      }}
      onClick={onDismiss}
    >
      {/* Roll Label */}
      <div className="dice-roll-label">{roll.label}</div>

      {/* Target Number */}
      <div style={{ fontSize: 11, color: '#6b7fa0', marginBottom: 8 }}>
        Target: {roll.targetNumber}+
      </div>

      {/* Dice Values */}
      <div className="dice-roll-values">
        {roll.values.map((value, i) => {
          const isPassed = roll.passedIndices.includes(i);
          const isFailed = roll.failedIndices.includes(i);

          return (
            <span
              key={i}
              className={`dice-value ${isPassed ? 'dice-pass' : isFailed ? 'dice-fail' : ''}`}
              title={`Rolled ${value} — ${isPassed ? 'Pass' : 'Fail'}`}
            >
              {value}
            </span>
          );
        })}
      </div>

      {/* Summary */}
      <div className="dice-roll-summary">{roll.summary}</div>
    </div>
  );
}

/**
 * Compact inline dice display for use in panels (combat log, etc.)
 */
export function InlineDiceRoll({ values, passedIndices, failedIndices }: {
  values: number[];
  passedIndices: number[];
  failedIndices: number[];
}) {
  return (
    <span className="combat-log-dice-values">
      {values.map((v, i) => (
        <span
          key={i}
          className={`combat-log-die ${
            passedIndices.includes(i)
              ? 'die-pass'
              : failedIndices.includes(i)
                ? 'die-fail'
                : ''
          }`}
        >
          {v}
        </span>
      ))}
    </span>
  );
}
