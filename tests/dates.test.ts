import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, daysBetween, dueInfo, isOverdue, todayIso } from '../src/lib/dates.js';

test('addDays ay ve yıl sınırlarını doğru geçer', () => {
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
  assert.equal(addDays('2026-02-27', 2), '2026-03-01');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('daysBetween gün farkını verir', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(daysBetween('2026-03-01', '2026-02-28'), -1);
});

test('dueInfo gecikme ve yaklaşan teslim durumlarını ayırır', () => {
  const today = todayIso();
  assert.equal(dueInfo(addDays(today, -2)).tone, 'late');
  assert.equal(dueInfo(today).tone, 'soon');
  assert.equal(dueInfo(addDays(today, 1)).tone, 'soon');
  assert.equal(dueInfo(addDays(today, 10)).tone, 'ok');
});

test('isOverdue yalnızca geçmiş tarihler için true döner', () => {
  const today = todayIso();
  assert.equal(isOverdue(addDays(today, -1)), true);
  assert.equal(isOverdue(today), false);
  assert.equal(isOverdue(addDays(today, 1)), false);
});
