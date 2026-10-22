import { describe, expect, it } from 'vitest';
import { calculate, stepDownSchedule } from '../../engine';
import { toEngineInput } from './case';
import { defaultStartDate, orderText } from './orderText';
import { primaryExample, sharedExample } from './samples';
import { presetOvernights, SCHEDULE_PRESETS } from './schedules';
import { importJson } from './storage';

const preset = (id: string) => SCHEDULE_PRESETS.find((p) => p.id === id)!;

describe('schedule presets', () => {
  it('every other weekend is 52 overnights, as in the 120(i)(3)(A) example', () => {
    expect(presetOvernights(preset('eow'))).toBe(52);
  });

  it('equal-time schedules are 182 of 365', () => {
    expect(presetOvernights(preset('2-2-3'))).toBe(182);
    expect(presetOvernights(preset('week-on-off'))).toBe(182);
  });

  it('summer weeks replace the regular pattern for those weeks', () => {
    // 52 + 4 weeks x (7 - 1) = 76
    expect(presetOvernights(preset('eow'), 4)).toBe(76);
    // Equal time gains half a week per summer week: 182 + 4 x 3.5 = 196
    expect(presetOvernights(preset('week-on-off'), 4)).toBe(196);
  });

  it('crossing 25%: EOW + weekly midweek (104) is shared; EOW Fri-Mon (78) is not', () => {
    expect(presetOvernights(preset('eow-midweek'))).toBeGreaterThan(91);
    expect(presetOvernights(preset('eow-mon'))).toBeLessThanOrEqual(91);
  });
});

describe('order language', () => {
  it('states support, due date, step-down, health care split and Form 8332', () => {
    const c = primaryExample();
    const input = toEngineInput(c, c.options);
    const r = calculate(input);
    const text = orderText(c, r, stepDownSchedule(input), { startDate: defaultStartDate(c.calculationDate), dueDay: 1 });

    expect(text).toContain('Commencing November 1, 2026, Petitioner, Alex Rivera, shall pay to Respondent, Blair Rivera, child support of $560.00 per month');
    expect(text).toContain('Casey Rivera and Drew Rivera, due on the 1st day of each month');
    expect(text).toContain('base support of $506.00, a credit of $51.00 for health insurance premiums, and $105.00 for the tax benefit');
    // Step-downs at each 18th birthday, recomputed from the schedule.
    expect(text).toMatch(/Upon Casey Rivera's eighteenth birthday on April 12, 2034, Petitioner shall pay Respondent \$[\d,]+\.00 per month for the remaining child, Drew Rivera\./);
    expect(text).toContain('Child support shall terminate on September 30, 2037');
    expect(text).toContain('paid 71.43% by Petitioner and 28.57% by Respondent');
    // Alex (non-custodial) claims, so the custodial parent must sign Form 8332.
    expect(text).toContain('Respondent shall sign and deliver to Petitioner IRS Form 8332');
  });

  it('mentions high school graduation when it extends support', () => {
    const c = sharedExample();
    const input = toEngineInput(c, c.options);
    const text = orderText(c, calculate(input), stepDownSchedule(input), { startDate: '2026-11-01', dueDay: 15 });
    expect(text).toContain("Riley Lee's graduation from high school");
    expect(text).toContain('due on the 15th day');
  });

  it('first of next month, across a year end', () => {
    expect(defaultStartDate('2026-12-15')).toBe('2027-01-01');
    expect(defaultStartDate('2026-10-22')).toBe('2026-11-01');
  });
});

describe('import', () => {
  const file = (obj: unknown) => new File([JSON.stringify(obj)], 'x.json');

  it('reads a single case and a full backup', async () => {
    const one = primaryExample();
    expect(await importJson(file(one))).toHaveLength(1);
    const backup = { schema: 'idaho-child-support-backup', version: 1, exportedAt: '', cases: [one, sharedExample()] };
    expect(await importJson(file(backup))).toHaveLength(2);
  });

  it('older case files without a jurisdiction load as Idaho', async () => {
    const { jurisdiction: _, ...old } = primaryExample();
    const [c] = await importJson(file(old));
    expect(c!.jurisdiction).toBe('ID');
  });

  it('rejects other JSON', async () => {
    await expect(importJson(file({ hello: 1 }))).rejects.toThrow();
  });
});
