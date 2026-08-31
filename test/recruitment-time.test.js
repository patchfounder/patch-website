import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applicationInputValue,
  applicationWindowTitle,
  defaultApplicationWindow,
} from '../src/recruitment-time.js';

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
