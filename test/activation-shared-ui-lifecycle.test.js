import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import vm from 'node:vm';
import { transformWithEsbuild } from 'vite';
import * as stateExports from '../src/components/training-room-state.js';
import * as sharedExports from '../src/components/activation-shared-room-state.js';

const require = createRequire(import.meta.url);
const file = new URL('../src/components/ActivationTraining.jsx', import.meta.url);
const built = await transformWithEsbuild(readFileSync(file, 'utf8'), file.pathname, { loader: 'jsx', format: 'cjs', jsx: 'automatic', sourcemap: false, tsconfigRaw: '{}' });
const code = built.code.replace(/import\(["']livekit-client["']\)/g, 'Promise.resolve(__livekitSdk)');
const response = data => ({ ok: true, json: async () => JSON.parse(JSON.stringify(data)) });
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

async function harness({ host = true, cameraFailure = false, holdLeave = null, holdJoin = null } = {}) {
  const cells = [], effects = [], requests = [], mediaCalls = [], rooms = [], intervals = [];
  let cursor = 0, tree;
  let current = { ready: true, sessionId: null, revision: 0, role: host ? 'host' : 'coach', status: 'closed', hostPresent: false, coachPresent: false, busy: false, removed: false, mayGo: host, mayJoin: false, mayRemove: false, mayEnd: false, startAt: null, serverTime: '2026-11-15T13:30:00Z' };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in cells)) cells[index] = { current: initial }; return cells[index]; },
    useEffect(callback, dependencies) { const index = cursor++; if (!cells[index]) { cells[index] = { dependencies }; effects.push(callback); } },
  };
  async function fetch(url, options = {}) {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url === '/api/training/config') return response({ bookingUrl: 'https://cal.com/patchapp/activation', bookingDurationMinutes: 30 });
    const endpoint = url.replace('/api/training/activation-room', '');
    if (endpoint === '/status') return response(current);
    if (endpoint === '/go' || endpoint === '/join') {
      if (holdJoin) await holdJoin.promise;
      current = { ...current, sessionId: 'shared-test-001', revision: 1, role: host ? 'host' : 'coach', status: 'open', hostPresent: !host, mayGo: host, mayJoin: !host, mayEnd: host, startAt: '2026-11-15T13:30:00Z', serverTime: '2026-11-15T13:30:01Z' };
      return response({ serverUrl: 'wss://fixture.livekit.cloud', participantToken: 'synthetic-token', identity: host ? 'host' : 'coach', role: current.role, session: current });
    }
    if (endpoint === '/leave') {
      if (holdLeave) await holdLeave.promise;
      current = { ...current, revision: current.revision + 1, coachPresent: false, busy: false, serverTime: '2026-11-15T13:30:03Z' };
      return response(current);
    }
    if (endpoint === '/remove') {
      current = { ...current, revision: current.revision + 1, coachId: null, coachPresent: false, busy: false, mayRemove: false, serverTime: '2026-11-15T13:30:04Z' };
      return response(current);
    }
    if (endpoint === '/end') {
      current = { ...current, revision: current.revision + 1, status: 'ended', mayEnd: false, serverTime: '2026-11-15T13:30:05Z' };
      return response(current);
    }
    throw new Error(`Unexpected endpoint ${endpoint}`);
  }
  class Room {
    constructor(options) {
      this.options = options; this.events = new Map(); this.remoteParticipants = new Map(); this.canPlaybackAudio = true;
      this.localParticipant = {
        identity: host ? 'host' : 'coach',
        getTrackPublication: () => ({ track: { attach: element => { element.localAttached = true; }, restartTrack: async () => {} } }),
        setMicrophoneEnabled: async value => { mediaCalls.push(['microphone', value]); },
        setCameraEnabled: async value => { mediaCalls.push(['camera', value]); if (cameraFailure) { const error = new Error('Denied'); error.name = 'NotAllowedError'; throw error; } },
      };
      rooms.push(this);
    }
    on(event, callback) { this.events.set(event, callback); }
    async connect(url, token) { this.connected = true; this.token = token; current = { ...current, hostPresent: true }; }
    async disconnect() { this.connected = false; this.disconnected = true; this.events.get('Disconnected')?.(); }
    async startAudio() {}
  }
  const sdk = { Room, Track: { Source: { Camera: 'camera' }, Kind: { Video: 'video', Audio: 'audio' } }, RoomEvent: Object.fromEntries(['TrackSubscribed', 'TrackUnsubscribed', 'ParticipantConnected', 'ParticipantDisconnected', 'Reconnecting', 'Reconnected', 'AudioPlaybackStatusChanged', 'LocalTrackPublished', 'Disconnected'].map(value => [value, value])) };
  const document = { title: 'Before', visibilityState: 'visible', addEventListener() {}, removeEventListener() {}, body: { style: {} } };
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, fetch, document,
    window: { setInterval(callback, milliseconds) { intervals.push({ callback, milliseconds }); return intervals.length; }, clearInterval() {} },
    __livekitSdk: sdk,
    require(name) {
      if (name.endsWith('.css')) return {};
      if (name === 'react') return react;
      if (name === './training-room-state.js') return stateExports;
      if (name === './activation-shared-room-state.js') return sharedExports;
      if (name === 'react/jsx-runtime') return require(name);
      throw new Error(name);
    },
  });
  function visit(node, callback) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(child => visit(child, callback)); return; }
    callback(node); visit(node.props?.children, callback);
  }
  function render() {
    cursor = 0; tree = module.exports.default({ host });
    visit(tree, node => { if (node.props?.ref && !node.props.ref.current) node.props.ref.current = { srcObject: null }; });
    return tree;
  }
  function text(node) { if (node == null || typeof node === 'boolean') return ''; if (typeof node !== 'object') return String(node); if (Array.isArray(node)) return node.map(text).join(''); return text(node.props?.children); }
  function button(label) { render(); let found; visit(tree, node => { if (node.type === 'button' && text(node) === label) found = node; }); assert.ok(found, `Missing button ${label}`); return found; }
  const cleanups = [];
  render(); effects.splice(0).forEach(effect => cleanups.push(effect())); await flush(); render();
  return { render, button, requests, rooms, mediaCalls, intervals, status(value) { current = { ...current, ...value }; }, async poll() { intervals.find(value => value.milliseconds === 3000).callback(); await flush(); render(); }, unmount() { cleanups.forEach(cleanup => cleanup?.()); }, text: () => text(render()) };
}

test('opening the page only reads status; explicit Go connects HD video and media controls', async () => {
  const ui = await harness();
  assert.equal(ui.rooms.length, 0); assert.equal(ui.mediaCalls.length, 0);
  assert.ok(ui.requests.every(request => !request.options.method));
  assert.equal(ui.button('Go').props.disabled, false);
  await ui.button('Go').props.onClick();
  assert.equal(ui.rooms.length, 1); assert.equal(ui.rooms[0].connected, true);
  assert.equal(JSON.stringify(ui.rooms[0].options.videoCaptureDefaults.resolution), JSON.stringify({ width: 1280, height: 720, frameRate: 24 }));
  assert.deepEqual(ui.mediaCalls, [['microphone', true], ['camera', true]]);
  assert.ok(ui.text().includes('Waiting for your coach'));
  await ui.button('Mic on').props.onClick();
  assert.deepEqual(ui.mediaCalls.at(-1), ['microphone', false]);
  const room = ui.rooms[0];
  room.remoteParticipants.set('coach', { identity: 'coach' });
  let attached = false;
  room.events.get('TrackSubscribed')({ kind: 'video', attach() { attached = true; } }, {}, { identity: 'coach' });
  assert.equal(attached, true);
  assert.match(ui.text(), /With your coach/);
  room.events.get('Reconnecting')(); room.remoteParticipants.clear(); room.events.get('Reconnected')();
  assert.match(ui.text(), /Waiting for your coach/);
  ui.unmount(); assert.equal(ui.rooms[0].disconnected, true);
});

test('camera denial disconnects and releases the admitted seat with a clear permission message', async () => {
  const ui = await harness({ cameraFailure: true });
  await ui.button('Go').props.onClick();
  assert.equal(ui.rooms[0].disconnected, true);
  assert.equal(ui.requests.filter(request => request.url.endsWith('/leave')).length, 1);
  assert.equal(ui.requests.find(request => request.url.endsWith('/leave')).body.sessionId, 'shared-test-001');
  assert.match(ui.text(), /Please allow your camera and microphone/);
  ui.unmount();
});

test('a pending Leave cannot race a new Go and revoke its fresh connection', async () => {
  const holdLeave = deferred();
  const ui = await harness({ holdLeave });
  await ui.button('Go').props.onClick();
  const leaving = ui.button('Leave').props.onClick();
  assert.equal(ui.button('Go').props.disabled, true);
  await ui.button('Go').props.onClick();
  assert.equal(ui.requests.filter(request => request.url.endsWith('/go')).length, 1);
  holdLeave.resolve(); await leaving;
  assert.equal(ui.button('Go').props.disabled, false);
  ui.unmount();
});

test('Remove targets the displayed coach and keeps the host connected; Finish is separate', async () => {
  const ui = await harness();
  await ui.button('Go').props.onClick();
  ui.status({ coachId: 'coach-seat-a', coachPresent: true, busy: true, mayRemove: true, revision: 2, serverTime: '2026-11-15T13:30:02Z' });
  await ui.poll();
  await ui.button('Remove').props.onClick();
  assert.deepEqual(ui.requests.find(request => request.url.endsWith('/remove')).body, { sessionId: 'shared-test-001', coachId: 'coach-seat-a' });
  assert.equal(ui.rooms[0].connected, true);
  await ui.button('Finish').props.onClick();
  assert.equal(ui.rooms[0].disconnected, true);
  assert.equal(ui.requests.find(request => request.url.endsWith('/end')).body.sessionId, 'shared-test-001');
  assert.doesNotMatch(ui.text(), /Your next step · Module 1/);
  ui.unmount();
});

test('an unmounted Go response never starts a camera or leaves a live SDK connection', async () => {
  const holdJoin = deferred(); const ui = await harness({ holdJoin });
  const joining = ui.button('Go').props.onClick();
  ui.unmount(); holdJoin.resolve(); await joining;
  assert.equal(ui.rooms.length, 0); assert.equal(ui.mediaCalls.length, 0);
});

test('coach Enter follows actual host presence, sends the current room ID and disconnects on Remove', async () => {
  const ui = await harness({ host: false });
  assert.doesNotMatch(ui.text(), />Enter</);
  ui.status({ sessionId: 'shared-test-001', status: 'open', revision: 1, hostPresent: true, mayJoin: false, busy: true, startAt: '2026-11-15T13:30:00Z', serverTime: '2026-11-15T13:30:01Z' });
  await ui.poll();
  assert.match(ui.text(), /Call in progress/);
  ui.status({ mayJoin: true, busy: false, revision: 2 }); await ui.poll();
  await ui.button('Enter').props.onClick();
  assert.deepEqual(ui.requests.find(request => request.url.endsWith('/join')).body, { sessionId: 'shared-test-001' });
  assert.equal(ui.rooms[0].connected, true);
  ui.status({ removed: true, mayJoin: false, revision: 3, serverTime: '2026-11-15T13:30:03Z' }); await ui.poll();
  assert.equal(ui.rooms[0].disconnected, true);
  assert.match(ui.text(), /You’ve left this call/);
  assert.match(ui.text(), /Please wait for Patrick to open your next session\./);
  assert.doesNotMatch(ui.text(), /Your Enter button appears when the room is ready/);
  assert.doesNotMatch(ui.text(), /Your next step · Module 1/);
  ui.unmount();
});
