import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrainingSummary } from './trainingSummary.js';

const log = (completedOn: string, isPr = false) => ({ completedOn, isPr, amrapReps: 8, topSetWeight: 135 });

test('empty history returns a complete zero-filled chart', () => {
  const result = buildTrainingSummary([], '2026-09-11');
  assert.equal(result.streak, 0);
  assert.equal(result.weekSessions, 0);
  assert.equal(result.weeks.length, 12);
  assert.ok(result.weeks.every(w => w.count === 0));
  assert.equal(result.days.find(d => d.today)?.label, 'F');
});

test('streak counts active weeks, not sessions, and ignores future logs', () => {
  const result = buildTrainingSummary([
    log('2026-09-07', true), log('2026-09-09'), log('2026-09-06'), log('2026-08-24'), log('2026-09-14', true),
  ], '2026-09-11');
  assert.equal(result.streak, 3);
  assert.equal(result.weekSessions, 2);
  assert.equal(result.weekReps, 16);
  assert.equal(result.weekPrs, 1);
  assert.equal(result.totalPrs, 1);
  assert.equal(result.weeks.at(-1)?.count, 2);
});

test('last week keeps the streak alive until the current week ends', () => {
  const logs = [log('2026-09-02'), log('2026-08-26')];
  assert.equal(buildTrainingSummary(logs, '2026-09-13').streak, 2);
  assert.equal(buildTrainingSummary(logs, '2026-09-14').streak, 0);
});

test('week arithmetic crosses a year boundary', () => {
  const result = buildTrainingSummary([log('2025-12-29'), log('2026-01-01'), log('2025-12-22')], '2026-01-02');
  assert.equal(result.streak, 2);
  assert.equal(result.weekSessions, 2);
  assert.equal(result.days[0].date, '2025-12-29');
  assert.equal(result.days[6].date, '2026-01-04');
});
