import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applicationInputValue,
  applicationWindowTitle,
  defaultApplicationWindow,
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
    opensAt: '2026-03-27T12:34',
    closesAt: '2026-04-01T23:59',
  });
  assert.deepEqual(defaultApplicationWindow(new Date('2026-10-23T11:34:00.000Z')), {
    password: '',
    opensAt: '2026-10-23T12:34',
    closesAt: '2026-10-28T23:59',
  });
});
