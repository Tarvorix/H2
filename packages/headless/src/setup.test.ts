import type { GameState, Position } from '@hh/types';
import { Allegiance, LegionFaction } from '@hh/types';
import { FixedDiceProvider, processCommand } from '@hh/engine';
import { getProfileById } from '@hh/data';
import { createHeadlessGameState } from './setup';

function moveFirstModelTo(
  state: GameState,
  playerIndex: number,
  unitIndex: number,
  position: Position,
): GameState {
  return {
    ...state,
    armies: state.armies.map((army, idx) => {
      if (idx !== playerIndex) return army;

      return {
        ...army,
        units: army.units.map((unit, uIdx) => {
          if (uIdx !== unitIndex) return unit;
          if (unit.models.length === 0) return unit;

          return {
            ...unit,
            models: unit.models.map((model, mIdx) =>
              mIdx === 0 ? { ...model, position } : model,
            ),
          };
        }),
      };
    }) as GameState['armies'],
  };
}

function advanceToGameOver(initialState: GameState, maxSteps: number = 200): GameState {
  let state = initialState;
  const dice = new FixedDiceProvider(Array.from({ length: maxSteps * 6 }, () => 3));

  for (let i = 0; i < maxSteps; i++) {
    if (state.isGameOver) return state;
    const result = processCommand(state, { type: 'endSubPhase' }, dice);
    if (!result.accepted) {
      throw new Error(
        `Command rejected at step ${i + 1}: ${result.errors.map((e) => e.message).join('; ')}`,
      );
    }
    state = result.state;
  }

  throw new Error(`Game did not end within ${maxSteps} endSubPhase steps.`);
}

describe('headless mission setup integration', () => {
  const missionCases: Array<{ missionId: string; objectivePosition: Position }> = [
    { missionId: 'heart-of-battle', objectivePosition: { x: 36, y: 24 } },
    { missionId: 'crucible-of-war', objectivePosition: { x: 18, y: 16 } },
    { missionId: 'take-and-hold', objectivePosition: { x: 27, y: 24 } },
  ];

  it.each(missionCases)(
    'runs full mission flow through end-state scoring for $missionId',
    ({ missionId, objectivePosition }) => {
      let state = createHeadlessGameState({
        missionId,
        armies: [
          {
            playerName: 'Player 1',
            faction: LegionFaction.WorldEaters,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
          },
          {
            playerName: 'Player 2',
            faction: LegionFaction.AlphaLegion,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
          },
        ],
      });

      state = moveFirstModelTo(state, 0, 0, objectivePosition);
      state = moveFirstModelTo(state, 1, 0, { x: 70, y: 47 });

      const finalState = advanceToGameOver(state);

      expect(finalState.isGameOver).toBe(true);
      expect(finalState.winnerPlayerIndex).toBe(0);
      expect(finalState.currentBattleTurn).toBe(4);
      expect(finalState.armies[0].victoryPoints).toBeGreaterThan(finalState.armies[1].victoryPoints);
      expect(finalState.missionState?.scoringHistory.length ?? 0).toBeGreaterThan(0);
      expect(finalState.missionState?.objectives.length ?? 0).toBeGreaterThan(0);
    },
  );

  it('supports primarch and super-heavy unit scenarios through mission end scoring', () => {
    let state = createHeadlessGameState({
      missionId: 'heart-of-battle',
      armies: [
        {
          playerName: 'World Eaters',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [
            { profileId: 'angron', modelCount: 1, isWarlord: true },
            { profileId: 'typhon-heavy-siege-tank', modelCount: 1 },
          ],
        },
        {
          playerName: 'Alpha Legion',
          faction: LegionFaction.AlphaLegion,
          allegiance: Allegiance.Traitor,
          units: [
            { profileId: 'alpharius', modelCount: 1, isWarlord: true },
            { profileId: 'falchion-super-heavy-tank-destroyer', modelCount: 1 },
          ],
        },
      ],
    });

    state = moveFirstModelTo(state, 0, 0, { x: 36, y: 24 });
    state = moveFirstModelTo(state, 1, 0, { x: 70, y: 47 });

    const typhonProfile = getProfileById('typhon-heavy-siege-tank');
    const falchionProfile = getProfileById('falchion-super-heavy-tank-destroyer');
    expect(typhonProfile?.unitSubTypes ?? []).toContain('SuperHeavy');
    expect(falchionProfile?.unitSubTypes ?? []).toContain('SuperHeavy');

    const finalState = advanceToGameOver(state);

    expect(finalState.isGameOver).toBe(true);
    expect(finalState.winnerPlayerIndex).toBe(0);
    expect(finalState.armies[0].units.some((u) => u.profileId === 'angron')).toBe(true);
    expect(
      finalState.armies[0].units.some((u) => u.profileId === 'typhon-heavy-siege-tank'),
    ).toBe(true);
    expect(finalState.armies[1].units.some((u) => u.profileId === 'alpharius')).toBe(true);
    expect(
      finalState.armies[1].units.some((u) => u.profileId === 'falchion-super-heavy-tank-destroyer'),
    ).toBe(true);
  });

  it('rejects phase-illegal commands in mission-initialized headless state', () => {
    const state = createHeadlessGameState({
      missionId: 'heart-of-battle',
      armies: [
        {
          playerName: 'Player 1',
          faction: LegionFaction.DarkAngels,
          allegiance: Allegiance.Loyalist,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
        {
          playerName: 'Player 2',
          faction: LegionFaction.WorldEaters,
          allegiance: Allegiance.Traitor,
          units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true }],
        },
      ],
    });

    const attackerUnitId = state.armies[0].units[0].id;
    const targetUnitId = state.armies[1].units[0].id;

    const result = processCommand(
      state,
      {
        type: 'declareShooting',
        attackingUnitId: attackerUnitId,
        targetUnitId,
        weaponSelections: [],
      },
      new FixedDiceProvider([3, 3, 3, 3]),
    );

    expect(result.accepted).toBe(false);
    expect(result.errors[0]?.code).toBe('WRONG_PHASE');
    expect(result.state.currentPhase).toBe(state.currentPhase);
    expect(result.state.currentSubPhase).toBe(state.currentSubPhase);
  });

  it('rejects duplicate explicit unit IDs in raw headless setup', () => {
    expect(() =>
      createHeadlessGameState({
        missionId: 'heart-of-battle',
        armies: [
          {
            playerName: 'Player 1',
            faction: LegionFaction.WorldEaters,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true, unitId: 'shared-unit' }],
          },
          {
            playerName: 'Player 2',
            faction: LegionFaction.AlphaLegion,
            allegiance: Allegiance.Traitor,
            units: [{ profileId: 'techmarine', modelCount: 1, isWarlord: true, unitId: 'shared-unit' }],
          },
        ],
      }),
    ).toThrow('Duplicate unit ID "shared-unit"');
  });
});
