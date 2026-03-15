import { describe, expect, it } from 'vitest';
import { DEFAULT_GAMEPLAY_NNUE_MODEL_ID } from '../../../../tools/nnue/common.mjs';
import { buildGameplayGateSummary } from '../../../../tools/nnue/gate-gameplay-model.mjs';

describe('buildGameplayGateSummary', () => {
  it('requires both Tactical and previous-version benchmarks to pass', () => {
    const summary = buildGameplayGateSummary({
      candidateModelId: 'gameplay-default-v1-candidate-123',
      threshold: 0.55,
      previousThreshold: 0.5,
      timeBudgetMs: 1000,
      maxDepthSoft: undefined,
      rolloutCount: undefined,
      tacticalSummary: {
        engineWins: 15,
        tacticalWins: 5,
        draws: 0,
        aborted: 0,
        timeouts: 0,
        winRate: 0.75,
        results: [],
      },
      previousVersionSummary: {
        candidateWins: 11,
        opponentWins: 9,
        draws: 0,
        aborted: 0,
        timeouts: 0,
        winRate: 0.55,
        results: [],
      },
    });

    expect(summary.tacticalPassed).toBe(true);
    expect(summary.previousVersion?.opponentModelId).toBe(DEFAULT_GAMEPLAY_NNUE_MODEL_ID);
    expect(summary.previousVersion?.passed).toBe(true);
    expect(summary.passed).toBe(true);
  });

  it('fails the overall gate when the candidate does not beat the previous version', () => {
    const summary = buildGameplayGateSummary({
      candidateModelId: 'gameplay-default-v1-candidate-456',
      threshold: 0.55,
      previousThreshold: 0.5,
      timeBudgetMs: 1000,
      maxDepthSoft: 4,
      rolloutCount: 1,
      tacticalSummary: {
        engineWins: 12,
        tacticalWins: 8,
        draws: 0,
        aborted: 0,
        timeouts: 0,
        winRate: 0.6,
        results: [],
      },
      previousVersionSummary: {
        candidateWins: 10,
        opponentWins: 10,
        draws: 0,
        aborted: 0,
        timeouts: 0,
        winRate: 0.5,
        results: [],
      },
    });

    expect(summary.tacticalPassed).toBe(true);
    expect(summary.previousVersion?.passed).toBe(false);
    expect(summary.passed).toBe(false);
  });

  it('falls back to Tactical-only pass/fail when there is no distinct previous version benchmark', () => {
    const summary = buildGameplayGateSummary({
      candidateModelId: DEFAULT_GAMEPLAY_NNUE_MODEL_ID,
      threshold: 0.55,
      previousThreshold: 0.5,
      timeBudgetMs: 1000,
      maxDepthSoft: null,
      rolloutCount: null,
      tacticalSummary: {
        engineWins: 11,
        tacticalWins: 9,
        draws: 0,
        aborted: 0,
        timeouts: 0,
        winRate: 0.55,
        results: [],
      },
      previousVersionSummary: null,
    });

    expect(summary.previousVersion).toBeNull();
    expect(summary.tacticalPassed).toBe(false);
    expect(summary.passed).toBe(false);
  });
});
