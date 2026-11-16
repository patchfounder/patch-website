import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptsSharedRoomUpdate, sharedRoomClock, sharedRoomMessage, sharedRoomNextStage } from '../src/components/activation-shared-room-state.js';
import { MODULE_ONE_URL } from '../src/components/training-room-state.js';

const open = { ready: true, sessionId: 'shared-001', revision: 3, role: 'coach', status: 'open', hostPresent: true, busy: false, mayJoin: true, startAt: '2026-11-15T13:30:00Z', serverTime: '2026-11-15T13:30:01Z' };

test('shared-room UI reflects actual presence and an occupied seat without inventing an appointment', () => {
  assert.match(sharedRoomMessage({ ...open, status: 'closed', sessionId: null }).copy, /Patrick will open/);
  assert.equal(sharedRoomClock(null), null);
  assert.equal(sharedRoomClock({ ...open, status: 'closed' }), null);
  assert.equal(sharedRoomClock(open, Date.parse('2026-11-15T13:29:59Z')), null);
  assert.equal(sharedRoomMessage(open).title, 'Patrick is waiting');
  assert.equal(sharedRoomMessage({ ...open, hostPresent: false, mayJoin: false }).title, 'Patrick will be here shortly');
  assert.equal(sharedRoomMessage({ ...open, busy: true, mayJoin: false }).title, 'Call in progress');
  assert.equal(sharedRoomMessage(open, { host: true, connection: 'connected' }).title, 'Waiting for your coach');
  assert.equal(sharedRoomClock(open, Date.parse('2026-11-15T13:35:01Z')), '5:01');
});

test('entry and not-ready states use concise titles without redundant joining instructions', () => {
  for (const [status, options] of [[null, {}], [{ ...open, ready: false }, {}], [open, {}], [open, { host: true }], [{ ...open, status: 'closed' }, { host: true }]]) {
    const message = sharedRoomMessage(status, options);
    assert.equal(message.copy, '');
    assert.doesNotMatch(message.title, /temporarily unavailable|Tap Enter/);
  }
  assert.equal(sharedRoomMessage({ ...open, ready: false }).title, 'Activation room');
});

test('late replies cannot reopen a finished room, replace a new room, or undo a newer seat revision', () => {
  assert.equal(acceptsSharedRoomUpdate(open, { ...open, revision: 2 }), false);
  assert.equal(acceptsSharedRoomUpdate(open, { ...open, serverTime: '2026-11-15T13:29:00Z' }), false);
  assert.equal(acceptsSharedRoomUpdate({ ...open, status: 'ending' }, { ...open, revision: 4 }), false);
  assert.equal(acceptsSharedRoomUpdate({ ...open, status: 'ended' }, { ...open, revision: 4 }), false);
  const next = { ...open, sessionId: 'shared-002', startAt: '2026-11-15T14:00:00Z', serverTime: '2026-11-15T14:00:01Z', revision: 1 };
  assert.equal(acceptsSharedRoomUpdate(open, next), true);
  assert.equal(acceptsSharedRoomUpdate(next, { ...open, serverTime: next.serverTime }), false);
  assert.equal(acceptsSharedRoomUpdate(open, { ...open, sessionId: null, status: 'closed' }), false);
});

test('only the admitted coach receives the next stage after authoritative Finish', () => {
  const finished = { ...open, status: 'ended', nextStageAvailable: true, nextStageUrl: MODULE_ONE_URL };
  assert.equal(sharedRoomNextStage(finished), true);
  for (const changed of [{ role: 'host' }, { removed: true }, { nextStageAvailable: false }, { nextStageUrl: 'https://example.com' }]) assert.equal(sharedRoomNextStage({ ...finished, ...changed }), false);
  assert.equal(sharedRoomNextStage({ ...finished, status: 'open', sessionId: 'shared-next-coach-room', hasSeat: false }), true);
  assert.match(sharedRoomMessage({ ...finished, status: 'open', sessionId: 'shared-next-coach-room', hasSeat: false }).copy, /Your Activation call has finished/);
  assert.match(sharedRoomMessage({ ...finished, removed: true }).title, /left this call/);
  assert.equal(sharedRoomNextStage({ ...finished, role: 'coach', nextStageAvailable: false }), false);
});

test('module messages and next-step validation stay scoped and Certification never invents a next module', () => {
  const next = 'https://www.patch.app/training/linkac';
  const finished = { ...open, status: 'ended', hasSeat: false, nextStageAvailable: true, nextStageUrl: next };
  assert.equal(sharedRoomNextStage(finished), false);
  assert.equal(sharedRoomNextStage(finished, next), true);
  assert.equal(sharedRoomNextStage(finished, null), false);
  assert.equal(sharedRoomMessage(null, { stageTitle: 'Certification', nextStageUrl: null }).title, 'Certification room');
  assert.doesNotMatch(sharedRoomMessage({ ...finished, status: 'ending' }, { stageTitle: 'Certification', nextStageUrl: null }).copy, /next step/);
  assert.doesNotMatch(sharedRoomMessage(finished, { stageTitle: 'Certification', nextStageUrl: null }).copy, /certified|next step/i);
});
