import * as stageExports from '../src/training-stages.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformWithEsbuild } from 'vite';
import {
  ACTIVATION_BOOKING_URL, MODULE_ONE_URL, parseSessionFragment, readSessionAccess,
  sessionPhase, callClock, countdown, canJoinSession, nextModuleAvailable, formatAppointment,
  safeBookingUrl, acceptsSessionUpdate, manageExpandedRoomFocus,
} from '../src/components/training-room-state.js';

const scheduled = {
  sessionId: 'activation-test-001', role: 'coach', status: 'scheduled',
  startAt: '2026-11-15T13:30:00Z', endAt: '2026-11-15T13:35:00Z',
  joinOpensAt: '2026-11-15T13:30:00Z', joinClosesAt: '2026-11-15T13:45:00Z',
  mayJoin: true, nextStageAvailable: false, nextStageUrl: MODULE_ONE_URL,
};

test('a private invitation is scoped to its session and its secret leaves the address bar', () => {
  const storage = new Map();
  const sessionStorage = { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) };
  const replaced = [];
  const location = { pathname: '/training/activation', search: '', hash: '#session=activation-test-001&access=private-room-access&host=true' };
  const access = readSessionAccess(location, sessionStorage, { replaceState: (...args) => replaced.push(args) });
  assert.deepEqual(access, { sessionId: 'activation-test-001', accessToken: 'private-room-access' });
  assert.equal(storage.get('patch.training.activation.activation-test-001'), 'private-room-access');
  assert.equal(replaced[0][2], '/training/activation#session=activation-test-001');
  assert.equal('host' in access, false);
  assert.deepEqual(readSessionAccess({ ...location, hash: '#session=activation-test-001' }, sessionStorage), access);
  assert.equal(readSessionAccess({ ...location, hash: '#session=activation-other-002' }, sessionStorage).accessToken, null);
  const replacement = readSessionAccess({ ...location, hash: '#session=activation-test-001&access=new-invitation&role=host' }, sessionStorage);
  assert.equal(replacement.accessToken, 'new-invitation');
  assert.equal('role' in replacement, false);
  assert.equal(storage.get('patch.training.activation.activation-test-001'), 'new-invitation');
});

test('configured Cal.com booking routes are preserved while unsafe destinations fall back', () => {
  assert.equal(safeBookingUrl('https://cal.com/patchapp/activation-five?duration=5'), 'https://cal.com/patchapp/activation-five?duration=5');
  assert.equal(safeBookingUrl('https://www.cal.com/patchapp/activation'), 'https://www.cal.com/patchapp/activation');
  for (const value of ['http://cal.com/patchapp/activation', 'javascript:alert(1)', 'https://cal.com.evil.example/room', 'https://user:password@cal.com/room', '/room', undefined]) assert.equal(safeBookingUrl(value), ACTIVATION_BOOKING_URL);
});

test('late session responses cannot undo a finish or cross private session identities', () => {
  const current = { ...scheduled, serverTime: '2026-11-15T13:31:00Z' };
  assert.equal(acceptsSessionUpdate(current, { ...current, serverTime: '2026-11-15T13:30:00Z' }, scheduled.sessionId), false);
  assert.equal(acceptsSessionUpdate(current, { ...current, sessionId: 'other-session-002' }, scheduled.sessionId), false);
  assert.equal(acceptsSessionUpdate({ ...current, status: 'ending' }, { ...current, serverTime: '2026-11-15T13:32:00Z' }, scheduled.sessionId), false);
  assert.equal(acceptsSessionUpdate({ ...current, status: 'ended' }, { ...current, serverTime: '2026-11-15T13:32:00Z' }, scheduled.sessionId), false);
  assert.equal(acceptsSessionUpdate(current, { ...current, status: 'ending', serverTime: '2026-11-15T13:32:00Z' }, scheduled.sessionId), true);
  const ending = { ...current, status: 'ending', mayJoin: false, nextStageAvailable: false };
  assert.equal(sessionPhase(ending, Date.parse('2026-11-15T13:32:00Z')), 'ending');
  assert.equal(canJoinSession(ending, Date.parse('2026-11-15T13:32:00Z')), false);
  assert.equal(nextModuleAvailable(ending), false);
});

test('expanded room contains keyboard focus and restores outside content and previous focus', () => {
  const listeners = new Map();
  const doc = { activeElement: null, addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type, fn) => { if (listeners.get(type) === fn) listeners.delete(type); } };
  const element = () => ({
    children: [], parentElement: null, attributes: new Map(), hidden: false,
    add(child) { this.children.push(child); child.parentElement = this; return child; },
    setAttribute(name, value) { this.attributes.set(name, value); },
    getAttribute(name) { return this.attributes.get(name) ?? null; },
    hasAttribute(name) { return this.attributes.has(name); },
    removeAttribute(name) { this.attributes.delete(name); },
    contains(target) { return target === this || this.children.some(child => child.contains(target)); },
    querySelectorAll() { return this.children; }, getClientRects() { return [{}]; },
    focus() { doc.activeElement = this; },
  });
  const root = element(), header = root.add(element()), main = root.add(element());
  const intro = main.add(element()), section = main.add(element()), next = main.add(element());
  const heading = section.add(element()), dialog = section.add(element());
  const collapse = dialog.add(element()), leave = dialog.add(element());
  header.setAttribute('aria-hidden', 'false'); heading.setAttribute('inert', '');
  doc.activeElement = collapse; doc.contains = target => root.contains(target);
  const release = manageExpandedRoomFocus(dialog, root, doc);
  assert.equal(header.hasAttribute('inert'), true); assert.equal(intro.getAttribute('aria-hidden'), 'true'); assert.equal(next.hasAttribute('inert'), true);
  let prevented = false;
  doc.activeElement = leave;
  listeners.get('keydown')({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(doc.activeElement, collapse);
  listeners.get('keydown')({ key: 'Tab', shiftKey: true, preventDefault() {} });
  assert.equal(doc.activeElement, leave);
  doc.activeElement = header; listeners.get('focusin')({ target: header });
  assert.equal(doc.activeElement, collapse);
  release();
  assert.equal(header.hasAttribute('inert'), false); assert.equal(header.getAttribute('aria-hidden'), 'false');
  assert.equal(intro.hasAttribute('aria-hidden'), false); assert.equal(heading.hasAttribute('inert'), true);
  assert.equal(doc.activeElement, collapse); assert.equal(listeners.size, 0);
});

test('invalid session IDs do not capture or save invitation secrets', () => {
  assert.equal(parseSessionFragment('#session=../../admin&access=secret'), null);
  assert.equal(parseSessionFragment('#access=secret'), null);
  assert.equal(parseSessionFragment('#session=tiny&access=secret'), null);
  const unavailableStorage = { setItem() { throw new Error('blocked'); } };
  const access = readSessionAccess({ pathname: '/training/activation', search: '', hash: '#session=activation-test-001&access=secret' }, unavailableStorage);
  assert.equal(access.accessToken, 'secret');
});

test('join gating uses the server-authorised window and cannot be bypassed by a countdown', () => {
  assert.equal(sessionPhase(scheduled, Date.parse('2026-11-15T13:29:59Z')), 'scheduled');
  assert.equal(canJoinSession(scheduled, Date.parse('2026-11-15T13:29:59Z')), false);
  assert.equal(canJoinSession(scheduled, Date.parse('2026-11-15T13:30:00Z')), true);
  assert.equal(canJoinSession({ ...scheduled, mayJoin: false }, Date.parse('2026-11-15T13:30:00Z')), false);
  assert.equal(canJoinSession(scheduled, Date.parse('2026-11-15T13:45:01Z')), false);
  assert.equal(sessionPhase({ ...scheduled, status: 'cancelled' }, Date.parse(scheduled.startAt)), 'cancelled');
});

test('five minutes elapsing or a participant leaving does not finish a session or unlock Module 1', () => {
  const afterFiveMinutes = Date.parse('2026-11-15T13:36:00Z');
  assert.equal(sessionPhase(scheduled, afterFiveMinutes), 'open');
  assert.equal(canJoinSession(scheduled, afterFiveMinutes), true);
  assert.equal(nextModuleAvailable(scheduled), false);
  assert.equal(nextModuleAvailable({ ...scheduled, connection: 'disconnected' }), false);
  assert.equal(nextModuleAvailable({ ...scheduled, nextStageAvailable: true }), false);
  assert.equal(nextModuleAvailable({ ...scheduled, status: 'ended', nextStageAvailable: true }), true);
  assert.equal(nextModuleAvailable({ ...scheduled, status: 'cancelled', nextStageAvailable: true }), false);
  assert.equal(nextModuleAvailable({ ...scheduled, status: 'ended', nextStageAvailable: true, nextStageUrl: 'https://example.com/' }), false);
});

test('countdowns and appointment labels represent real schedule times and selected local timezone', () => {
  assert.deepEqual(callClock(scheduled, Date.parse('2026-11-15T13:29:00Z')), { label: 'Starts in', value: '1:00' });
  assert.deepEqual(callClock(scheduled, Date.parse('2026-11-15T13:35:00Z')), { label: 'Since scheduled start', value: '5:00' });
  assert.equal(countdown(3661), '1:01:01');
  assert.equal(countdown(-1), '0:00');
  assert.match(formatAppointment(scheduled, 'Europe/London'), /13:30–13:35 GMT/);
  assert.match(formatAppointment(scheduled, 'Europe/Madrid'), /14:30–14:35 CET/);
  assert.equal(formatAppointment({ startAt: 'unknown', endAt: 'unknown' }), null);
});

const require = createRequire(import.meta.url);
const sourceUrl = new URL('../src/components/ActivationTraining.jsx', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const { code } = await transformWithEsbuild(source, sourceUrl.pathname, { loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}' });
const stateExports = await import('../src/components/training-room-state.js');
const sharedExports = await import('../src/components/activation-shared-room-state.js');
const module = { exports: {} };
vm.runInNewContext(code, {
  module, exports: module.exports,
  require(name) {
    if (name.endsWith('.css')) return {};
    if (name === './training-room-state.js') return stateExports;
    if (name === './activation-shared-room-state.js') return sharedExports;
      if (name === '../training-stages.js') return stageExports;
    assert.ok(['react', 'react/jsx-runtime'].includes(name), `Unexpected static dependency: ${name}`);
    return require(name);
  },
});
const html = renderToStaticMarkup(React.createElement(module.exports.default));

test('Activation page preserves the approved video and manual, with visible full URLs', () => {
  assert.match(html, /A confident first call\./);
  assert.match(html, /https:\/\/www\.youtube-nocookie\.com\/embed\/KLXFHB4zVMI\?rel=0/);
  assert.match(html, /title="How to Deliver a Patch Call in 7 Steps"/);
  assert.match(html, /href="https:\/\/www\.patch\.app\/training\/patch-call-process\.pdf" download="Patch Call Process\.pdf"/);
  assert.ok(html.includes('>https://www.patch.app/training/patch-call-process.pdf</a>'));
  assert.ok(html.includes('>https://www.youtube.com/watch?v=KLXFHB4zVMI</a>'));
  assert.equal(ACTIVATION_BOOKING_URL, 'https://cal.com/patchapp/activation');
});

test('initial page does not invent a booking, create a fake live call or expose Module 1', () => {
  assert.doesNotMatch(html, /Starts in|Since scheduled start|You’re booked in|Your room is ready/);
  assert.doesNotMatch(html, /participantToken|accessToken|LIVEKIT_API_SECRET|Book Module 1|Your next step · Module 1/);
  assert.match(html, /Activation room|Checking the room/);
  assert.doesNotMatch(html, /<video[^>]*src=/);
});

test('camera starts only on Enter and the minimal UI keeps one Leave action', () => {
  const effect = source.slice(source.indexOf('useEffect(() => {'), source.indexOf('}, [host, stage.code]);') + '}, [host, stage.code]);'.length);
  assert.doesNotMatch(effect, /getUserMedia|setCameraEnabled|setMicrophoneEnabled|participantToken/);
  const leave = source.slice(source.indexOf('async function leave()'), source.indexOf('async function roomAction('));
  assert.match(leave, /if \(host\)/);
  assert.match(leave, /roomAction\('\/end'\)/);
  assert.doesNotMatch(leave, /nextStageAvailable|status: .ended/);
  assert.match(source, /if \(!host \|\| actionPending.current \|\| joinPending.current\)/);
  assert.match(source, /playsInline muted aria-label="Your video preview"/);
  assert.match(source, /referrerPolicy: 'no-referrer'/);
  assert.doesNotMatch(source, /flipCamera|Refresh room|>Finish<|since room opened|Five-minute check-in|host \? 'Go'/);
  assert.match(source, /aria-label="Call settings"/);
  assert.match(source, /className="activation-training-timer"/);
});

test('each named stage renders its own step, copy, room and full booking URL with the approved template', () => {
  for (const stage of stageExports.TRAINING_STAGES) {
    const page = renderToStaticMarkup(React.createElement(module.exports.default, { stage }));
    assert.ok(page.includes(stage.headline), stage.code);
    assert.ok(page.includes(`Step ${stage.step} of 6`), stage.code);
    assert.ok(page.includes(`Patch Academy · ${stage.title}`), stage.code);
    assert.ok(page.includes(`aria-label="${stage.title} video call"`), stage.code);
    assert.ok(page.includes(`href="${stage.bookingUrl}"`), stage.code);
    assert.ok(page.includes(`>${stage.bookingUrl}</a>`), stage.code);
    assert.equal((page.match(/class="is-current"/g) || []).length, stage.step);
    assert.equal(page.includes('Placeholder tutorial · the module video will be added here.'), stage.placeholderVideo);
    assert.doesNotMatch(page, /Your next step · Module|Starts in|You’re booked in|You are certified/);
    if (stage.code !== 'activa') {
      assert.doesNotMatch(page, /Choose your Activation time|currently reserves 30 minutes|cal\.com\/patchapp\/activation/);
    }
    const hostPage = renderToStaticMarkup(React.createElement(module.exports.default, { stage, host: true }));
    assert.match(hostPage, />Enter<\/button>/);
    assert.doesNotMatch(hostPage, /Choose your .* time|password|>Remove<|>Leave</);
  }
});
