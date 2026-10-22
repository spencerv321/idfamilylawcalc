/**
 * Common parenting schedules expressed as overnights per year for the parent
 * with the alternating time. Counting follows the Rule 120(i)(3)(A) example:
 * a repeating two-week pattern times 26 ("2 overnights for 26 weeks ... 52
 * overnights"). Holidays are not modeled; adjust the number by hand for them.
 */

export interface SchedulePreset {
  id: string;
  label: string;
  /** Overnights per 14-day cycle with the parent this schedule describes. */
  perTwoWeeks: number;
}

export const SCHEDULE_PRESETS: SchedulePreset[] = [
  { id: 'eow', label: 'Every other weekend (Fri–Sun)', perTwoWeeks: 2 },
  { id: 'eow-mon', label: 'Every other weekend (Fri–Mon)', perTwoWeeks: 3 },
  { id: 'eow-midweek-alt', label: 'Every other weekend + alternate-week midweek overnight', perTwoWeeks: 3 },
  { id: 'eow-midweek', label: 'Every other weekend + weekly midweek overnight', perTwoWeeks: 4 },
  { id: 'eow-thu-mon', label: 'Every other weekend (Thu–Mon)', perTwoWeeks: 4 },
  { id: 'eow-mon-midweek', label: 'Every other weekend (Fri–Mon) + weekly midweek overnight', perTwoWeeks: 5 },
  { id: '5-2-2-5', label: '5-2-2-5 (equal time)', perTwoWeeks: 7 },
  { id: '2-2-3', label: '2-2-3 (equal time)', perTwoWeeks: 7 },
  { id: 'week-on-off', label: 'Alternating weeks (equal time)', perTwoWeeks: 7 },
];

/**
 * Overnights per year for a preset, plus `summerWeeks` full weeks in the
 * summer that replace the regular pattern for those weeks.
 */
export function presetOvernights(preset: SchedulePreset, summerWeeks = 0): number {
  const weeks = Math.max(0, Math.min(12, Math.floor(summerWeeks)));
  const regular = preset.perTwoWeeks * 26;
  // Each summer week gives 7 nights instead of the pattern's half-cycle share.
  const extra = weeks * (7 - preset.perTwoWeeks / 2);
  return Math.min(365, Math.round(regular + extra));
}
