import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applicationInputValue,
  applicationWindowTitle,
  applicationWindowSubmission,
  defaultApplicationWindow,
  formatApplicationClosingDate,
  formatApplicationDate,
} from '../src/recruitment-time.js';

test('window summaries show UK calendar dates without a time or timezone label', () => {
  assert.equal(formatApplicationDate('2026-09-30T23:00:00.000Z'), '1 Oct 2026');
  assert.equal(formatApplicationDate('2026-10-08T22:59:00.000Z'), '8 Oct 2026');
  assert.equal(formatApplicationDate('2026-12-08T23:59:00.000Z'), '8 Dec 2026');
  assert.equal(formatApplicationDate('invalid'), 'Not set');
});

test('reviewer application-window helpers use UK calendar dates at month boundaries', () => {
  const boundary = '2026-09-30T23:00:00.000Z';
  assert.equal(applicationWindowTitle(boundary), 'October 2026');
  assert.equal(applicationInputValue(boundary), '2026-10-01T00:00');
});

test('the default deadline is five UK calendar days after opening across clock changes', () => {
  assert.deepEqual(defaultApplicationWindow(new Date('2026-03-27T12:34:00.000Z')), {
    password: '',
    opensAt: '2026-03-27',
    closesAt: '2026-04-01',
  });
  assert.deepEqual(defaultApplicationWindow(new Date('2026-10-23T11:34:00.000Z')), {
    password: '',
    opensAt: '2026-10-23',
    closesAt: '2026-10-28',
  });
});

test('date-only windows include the whole Close day, including same-day windows', () => {
  for (const [open, close, boundary] of [
    ['2026-10-03', '2026-10-08', '2026-10-09'],
    ['2026-03-29', '2026-03-29', '2026-03-30'],
    ['2026-10-25', '2026-10-25', '2026-10-26'],
    ['2026-12-31', '2026-12-31', '2027-01-01'],
    ['2028-02-29', '2028-02-29', '2028-03-01'],
  ]) {
    assert.deepEqual(applicationWindowSubmission({ password: 'synthetic', opensAt: open, closesAt: close }), {
      password: 'synthetic', opensAt: `${open}T00:00`, closesAt: `${boundary}T00:00`,
    });
  }
});

test('date-only windows reject invalid dates and a Close date before Open', () => {
  for (const invalid of ['', '2026-02-30', '2026-03-29T10:00', 'bad-date']) {
    assert.throws(() => applicationWindowSubmission({ opensAt: invalid, closesAt: '2026-04-01' }), /valid Open and Close dates/);
    assert.throws(() => applicationWindowSubmission({ opensAt: '2026-03-29', closesAt: invalid }), /valid Open and Close dates/);
  }
  assert.throws(() => applicationWindowSubmission({ opensAt: '2026-04-02', closesAt: '2026-04-01' }), /on or after/);
});

test('Close summaries show the selected date, not the following exclusive midnight', () => {
  assert.equal(formatApplicationClosingDate('2026-10-08T23:00:00.000Z'), '8 Oct 2026');
  assert.equal(formatApplicationClosingDate('2026-03-29T23:00:00.000Z'), '29 Mar 2026');
  assert.equal(formatApplicationClosingDate('2026-10-26T00:00:00.000Z'), '25 Oct 2026');
  assert.equal(formatApplicationClosingDate('2027-01-01T00:00:00.000Z'), '31 Dec 2026');
  assert.equal(formatApplicationClosingDate('2026-10-08T22:59:00.000Z'), '8 Oct 2026');
  assert.equal(formatApplicationClosingDate('invalid'), 'Not set');
});
