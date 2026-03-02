import { useMemo } from 'react';
import type { ArmyList } from '@hh/types';
import { DetachmentType, LegionFaction, SpecialFaction } from '@hh/types';
import {
  getAllLegions,
  getBlackshieldsOathLimit,
  getBlackshieldsOaths,
} from '@hh/data';

interface DoctrineSelectorProps {
  armyList: ArmyList;
  onArmyListChange: (next: ArmyList) => void;
}

function replaceDetachment(
  armyList: ArmyList,
  detachmentId: string,
  updater: (detachment: ArmyList['detachments'][number]) => ArmyList['detachments'][number],
): ArmyList {
  return {
    ...armyList,
    detachments: armyList.detachments.map((detachment) =>
      detachment.id === detachmentId ? updater(detachment) : detachment,
    ),
  };
}

export function DoctrineSelector({
  armyList,
  onArmyListChange,
}: DoctrineSelectorProps) {
  const allLegions = useMemo(() => getAllLegions(), []);
  const blackshieldsOaths = useMemo(() => getBlackshieldsOaths(), []);

  if (armyList.faction === SpecialFaction.Blackshields) {
    const parentCandidates = armyList.detachments.filter(
      (detachment) =>
        detachment.type === DetachmentType.Primary ||
        detachment.type === DetachmentType.Allied,
    );

    return (
      <div className="doctrine-selector">
        <div className="panel-title">Blackshields Doctrine</div>
        {armyList.detachments.map((detachment) => {
          const oathLimit = getBlackshieldsOathLimit(detachment.type);
          const doctrine =
            detachment.doctrine?.kind === 'blackshields'
              ? detachment.doctrine
              : { kind: 'blackshields' as const, oathIds: [] as string[] };
          const oathIds = [...(doctrine.oathIds ?? [])];

          return (
            <div key={detachment.id} className="faction-selector-row">
              <label className="faction-label">
                {detachment.id} ({detachment.type})
              </label>
              <div className="faction-value">
                {oathLimit > 0 ? (
                  <div>
                    {Array.from({ length: oathLimit }).map((_, idx) => (
                      <select
                        key={`${detachment.id}-oath-${idx}`}
                        className="faction-select"
                        value={oathIds[idx] ?? ''}
                        onChange={(e) => {
                          const nextOaths = [...oathIds];
                          nextOaths[idx] = e.target.value;
                          onArmyListChange(
                            replaceDetachment(armyList, detachment.id, (current) => ({
                              ...current,
                              doctrine: {
                                kind: 'blackshields',
                                oathIds: nextOaths.filter(Boolean),
                                selectedLegionForArmoury: doctrine.selectedLegionForArmoury,
                              },
                            })),
                          );
                        }}
                      >
                        <option value="">Select Oath...</option>
                        {blackshieldsOaths.map((oath) => (
                          <option key={oath.id} value={oath.id}>
                            {oath.name}
                          </option>
                        ))}
                      </select>
                    ))}
                    <select
                      className="faction-select"
                      value={doctrine.selectedLegionForArmoury ?? ''}
                      onChange={(e) => {
                        onArmyListChange(
                          replaceDetachment(armyList, detachment.id, (current) => ({
                            ...current,
                            doctrine: {
                              kind: 'blackshields',
                              oathIds: oathIds.filter(Boolean),
                              selectedLegionForArmoury:
                                e.target.value === ''
                                  ? undefined
                                  : (e.target.value as LegionFaction),
                            },
                          })),
                        );
                      }}
                    >
                      <option value="">Armoury Legion (optional)</option>
                      {allLegions.map((legion) => (
                        <option key={legion} value={legion}>
                          {legion}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    {detachment.type === DetachmentType.Auxiliary ||
                    detachment.type === DetachmentType.Apex ? (
                      <select
                        className="faction-select"
                        value={detachment.parentDetachmentId ?? ''}
                        onChange={(e) => {
                          const nextParent = e.target.value || undefined;
                          onArmyListChange(
                            replaceDetachment(armyList, detachment.id, (current) => ({
                              ...current,
                              parentDetachmentId: nextParent,
                            })),
                          );
                        }}
                      >
                        <option value="">Select Parent Detachment...</option>
                        {parentCandidates.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.id} ({candidate.type})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span>Doctrine inherited from parent context.</span>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (armyList.faction === SpecialFaction.ShatteredLegions) {
    const doctrine =
      armyList.doctrine?.kind === 'shatteredLegions'
        ? armyList.doctrine
        : {
            kind: 'shatteredLegions' as const,
            selectedLegions: [LegionFaction.DarkAngels, LegionFaction.IronHands],
          };
    const selected = new Set(doctrine.selectedLegions);

    return (
      <div className="doctrine-selector">
        <div className="panel-title">Shattered Legions Doctrine</div>
        <div className="faction-selector-row">
          <label className="faction-label">Mutable Tactics Legions</label>
          <div className="faction-value">
            {allLegions.map((legion) => {
              const checked = selected.has(legion);
              return (
                <label key={legion} style={{ display: 'block' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) {
                        next.add(legion);
                      } else {
                        next.delete(legion);
                      }
                      onArmyListChange({
                        ...armyList,
                        doctrine: {
                          kind: 'shatteredLegions',
                          selectedLegions: Array.from(next),
                          exemplarLegionByPrimeUnitId: doctrine.exemplarLegionByPrimeUnitId,
                        },
                      });
                    }}
                  />
                  <span>{legion}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return null;
}

