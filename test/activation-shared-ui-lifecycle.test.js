import * as stageExports from '../src/training-stages.js';
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

async function harness({ stage = null, host = true, cameraFailure = false, holdLeave = null, holdJoin = null, endFailures = 0, holdSwitch = null, holdCameraResume = null, devicesFailure = false, switchReturnsFalse = false, statusFailures = 0, joinFailures = 0 } = {}) {
  const cells = [], effects = [], requests = [], mediaCalls = [], rooms = [], intervals = [], deviceReads = [];
  const listeners = new Map();
  let cursor = 0, tree;
  let current = { ready: true, sessionId: null, revision: 0, role: host ? 'host' : 'coach', status: 'closed', hostPresent: false, coachPresent: false, busy: false, removed: false, mayGo: host, mayJoin: false, mayRemove: false, mayEnd: false, startAt: null, serverTime: '2026-11-15T13:30:00Z' };
  const react = {
    useState(initial) { const index = cursor++; if (!(index in cells)) cells[index] = typeof initial === 'function' ? initial() : initial; return [cells[index], value => { cells[index] = typeof value === 'function' ? value(cells[index]) : value; }]; },
    useRef(initial) { const index = cursor++; if (!(index in cells)) cells[index] = { current: initial }; return cells[index]; },
    useEffect(callback, dependencies) { const index = cursor++; const old = cells[index]; if (!old || dependencies.some((value, i) => value !== old.dependencies[i])) { cells[index] = { dependencies, cleanup: old?.cleanup }; effects.push({ index, callback }); } },
  };
  async function fetch(url, options = {}) {
    requests.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    if (url === '/api/training/config') return response({ bookingUrl: 'https://cal.com/patchapp/activation', bookingDurationMinutes: 30 });
    const endpoint = url.replace(stage?.apiPath || '/api/training/activation-room', '');
    if (endpoint === '/status') {
      if (statusFailures > 0) { statusFailures--; return { ok: false, status: 503, json: async () => ({ message: 'The video room is temporarily unavailable. Please try again shortly.' }) }; }
      return response(current);
    }
    if (endpoint === '/go' || endpoint === '/join') {
      if (joinFailures > 0) { joinFailures--; return { ok: false, status: 503, json: async () => ({ message: 'Provider unavailable' }) }; }
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
      if (holdLeave) await holdLeave.promise;
      if (endFailures > 0) { endFailures--; return { ok: false, status: 503, json: async () => ({ message: 'The room could not close. Please try Leave again.' }) }; }
      current = { ...current, revision: current.revision + 1, status: 'ended', mayEnd: false, mayGo: host, serverTime: '2026-11-15T13:30:05Z' };
      return response(current);
    }
    throw new Error(`Unexpected endpoint ${endpoint}`);
  }
  const deviceList = [
    { kind: 'audioinput', deviceId: 'mic-a', label: 'Built-in microphone' }, { kind: 'audioinput', deviceId: 'mic-b', label: 'Headset' },
    { kind: 'videoinput', deviceId: 'cam-a', label: 'Front camera' }, { kind: 'videoinput', deviceId: 'cam-b', label: 'Other camera' },
  ];
  const makeTrack = () => ({ live: true, stops: 0, attach(element) { element.localAttached = true; }, stop() { this.live = false; this.stops++; } });
  class Room {
    static async getLocalDevices(kind, requestPermissions) { deviceReads.push({ kind, requestPermissions }); if (devicesFailure) throw new Error('No device list'); return deviceList; }
    constructor(options) {
      this.options = options; this.events = new Map(); this.remoteParticipants = new Map(); this.canPlaybackAudio = true;
      this.cameraTrack = makeTrack(); this.microphoneTrack = makeTrack(); this.cameraEnables = 0;
      this.activeDevices = { audioinput: 'mic-a', videoinput: 'cam-a' };
      this.cameraPublication = { track: this.cameraTrack }; this.microphonePublication = { track: this.microphoneTrack };
      this.localParticipant = {
        identity: host ? 'host' : 'coach', isMicrophoneEnabled: false, isCameraEnabled: false,
        trackPublications: new Map([['camera', this.cameraPublication], ['microphone', this.microphonePublication]]),
        getTrackPublication: source => source === 'microphone' ? this.microphonePublication : this.cameraPublication,
        setMicrophoneEnabled: async value => { mediaCalls.push(['microphone', value]); this.localParticipant.isMicrophoneEnabled = value; this.microphoneTrack.live = value; return this.microphonePublication; },
        setCameraEnabled: async value => { mediaCalls.push(['camera', value]); if (cameraFailure) { const error = new Error('Denied'); error.name = 'NotAllowedError'; throw error; }
          if (value && ++this.cameraEnables > 1 && holdCameraResume) await holdCameraResume.promise;
          this.localParticipant.isCameraEnabled = value; this.cameraTrack.live = value; return this.cameraPublication;
        },
      };
      rooms.push(this);
    }
    on(event, callback) { this.events.set(event, callback); }
    getActiveDevice(kind) { return this.activeDevices[kind]; }
    async switchActiveDevice(kind, value, exact) {
      mediaCalls.push(['device', kind, value, exact]);
      const wasEnabled = kind === 'audioinput' ? this.localParticipant.isMicrophoneEnabled : this.localParticipant.isCameraEnabled;
      if (holdSwitch) await holdSwitch.promise;
      if (switchReturnsFalse) return false;
      this.activeDevices[kind] = value;
      if (wasEnabled) (kind === 'audioinput' ? this.microphoneTrack : this.cameraTrack).live = true;
      this.events.get('ActiveDeviceChanged')?.(kind, value); return true;
    }
    async connect(url, token) { this.connected = true; this.token = token; current = { ...current, hostPresent: true }; }
    async disconnect() {
      if (this.disconnected) return;
      this.connected = false; this.disconnected = true;
      for (const publication of this.localParticipant.trackPublications.values()) publication.track.stop();
      this.localParticipant.trackPublications.clear();
      this.events.get('Disconnected')?.();
    }
    async startAudio() {}
  }
  const sdk = { Room, Track: { Source: { Camera: 'camera', Microphone: 'microphone' }, Kind: { Video: 'video', Audio: 'audio' } }, RoomEvent: Object.fromEntries(['TrackSubscribed', 'TrackUnsubscribed', 'ParticipantConnected', 'ParticipantDisconnected', 'Reconnecting', 'Reconnected', 'AudioPlaybackStatusChanged', 'LocalTrackPublished', 'Disconnected', 'TrackMuted', 'TrackUnmuted', 'ActiveDeviceChanged', 'MediaDevicesChanged'].map(value => [value, value])) };
  const document = { title: 'Before', visibilityState: 'visible', addEventListener(type, fn) { const set = listeners.get(type) || new Set(); set.add(fn); listeners.set(type, set); }, removeEventListener(type, fn) { listeners.get(type)?.delete(fn); }, body: { style: {} } };
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
      if (name === '../training-stages.js') return stageExports;
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
    cursor = 0; tree = module.exports.default({ host, ...(stage ? { stage } : {}) });
    visit(tree, node => { if (node.props?.ref && !node.props.ref.current) node.props.ref.current = { srcObject: null, focus() { this.focused = true; }, contains(target) { return target === this; } }; });
    for (const { index, callback } of effects.splice(0)) { cells[index].cleanup?.(); cells[index].cleanup = callback(); }
    return tree;
  }
  function text(node) { if (node == null || typeof node === 'boolean') return ''; if (typeof node !== 'object') return String(node); if (Array.isArray(node)) return node.map(text).join(''); return text(node.props?.children); }
  function button(label) { render(); let found; visit(tree, node => { if (node.type === 'button' && (text(node) === label || node.props['aria-label'] === label)) found = node; }); assert.ok(found, `Missing button ${label}`); return found; }
  function select(label) { render(); let found; visit(tree, node => { if (node.type === 'select' && node.props['aria-label'] === label) found = node; }); assert.ok(found, `Missing select ${label}`); return found; }
  function hasButton(label) { render(); let found = false; visit(tree, node => { if (node.type === 'button' && (text(node) === label || node.props['aria-label'] === label)) found = true; }); return found; }
  render(); await flush(); render();
  return { render, button, hasButton, select, requests, rooms, mediaCalls, intervals, deviceReads, status(value) { current = { ...current, ...value }; }, async poll() { intervals.find(value => value.milliseconds === 3000).callback(); await flush(); render(); }, dispatch(type, event) { for (const listener of listeners.get(type) || []) listener({ type, ...event }); render(); }, unmount() { cells.forEach(cell => cell?.cleanup?.()); }, text: () => text(render()) };
}

test('opening only reads status; explicit Enter connects HD video with minimal controls', async () => {
  const ui = await harness();
  assert.equal(ui.rooms.length, 0); assert.equal(ui.mediaCalls.length, 0);
  assert.ok(ui.requests.every(request => !request.options.method));
  assert.equal(ui.button('Enter').props.disabled, false);
  await ui.button('Enter').props.onClick();
  assert.equal(ui.rooms.length, 1); assert.equal(ui.rooms[0].connected, true);
  assert.equal(JSON.stringify(ui.rooms[0].options.videoCaptureDefaults.resolution), JSON.stringify({ width: 1280, height: 720, frameRate: 24 }));
  assert.deepEqual(ui.mediaCalls, [['microphone', true], ['camera', true]]);
  assert.ok(ui.text().includes('Waiting for your coach'));
  assert.doesNotMatch(ui.text(), /Mic on|Camera on|Flip camera|Refresh room|Finish|Expand/);
  const room = ui.rooms[0];
  room.remoteParticipants.set('coach', { identity: 'coach' });
  let attached = false;
  room.events.get('TrackSubscribed')({ kind: 'video', attach() { attached = true; } }, {}, { identity: 'coach' });
  assert.equal(attached, true);
  assert.doesNotMatch(ui.text(), /Waiting for your coach/);
  room.events.get('Reconnecting')(); room.remoteParticipants.clear(); room.events.get('Reconnected')();
  assert.match(ui.text(), /Waiting for your coach/);
  ui.unmount(); assert.equal(ui.rooms[0].disconnected, true);
});

test('camera denial disconnects and releases the admitted seat with a clear permission message', async () => {
  const ui = await harness({ cameraFailure: true });
  await ui.button('Enter').props.onClick();
  assert.equal(ui.rooms[0].disconnected, true);
  assert.equal(ui.requests.filter(request => request.url.endsWith('/leave')).length, 1);
  assert.equal(ui.requests.find(request => request.url.endsWith('/leave')).body.sessionId, 'shared-test-001');
  assert.match(ui.text(), /Please allow your camera and microphone/);
  ui.unmount();
});

test('a pending host Leave cannot race another Leave or a new Enter', async () => {
  const holdLeave = deferred();
  const ui = await harness({ holdLeave });
  await ui.button('Enter').props.onClick();
  const leaving = ui.button('Leave').props.onClick();
  assert.equal(ui.button('Leaving…').props.disabled, true);
  await ui.button('Leaving…').props.onClick();
  assert.equal(ui.requests.filter(request => request.url.endsWith('/end')).length, 1);
  assert.equal(ui.requests.filter(request => request.url.endsWith('/go')).length, 1);
  holdLeave.resolve(); await leaving;
  assert.equal(ui.button('Enter').props.disabled, false);
  ui.unmount();
});

test('the host has no Remove control and the single Leave still closes the room', async () => {
  const ui = await harness();
  await ui.button('Enter').props.onClick();
  ui.status({ coachId: 'coach-seat-a', coachPresent: true, busy: true, mayRemove: true, revision: 2, serverTime: '2026-11-15T13:30:02Z' });
  await ui.poll();
  assert.equal(ui.hasButton('Remove'), false);
  assert.equal(ui.requests.filter(request => request.url.endsWith('/remove')).length, 0);
  assert.equal(ui.rooms[0].connected, true);
  await ui.button('Leave').props.onClick();
  assert.equal(ui.rooms[0].disconnected, true);
  assert.equal(ui.requests.find(request => request.url.endsWith('/end')).body.sessionId, 'shared-test-001');
  assert.equal(ui.requests.filter(request => request.url.endsWith('/leave')).length, 0);
  assert.doesNotMatch(ui.text(), /Finish|Refresh room|since room opened|Five-minute check-in/);
  assert.doesNotMatch(ui.text(), /Your next step · Module 1/);
  ui.unmount();
});

test('a temporary passive outage stays quiet and Enter recovers only after a successful status', async () => {
  const ui = await harness({ statusFailures: 1 });
  assert.equal(ui.rooms.length, 0); assert.equal(ui.button('Enter').props.disabled, true);
  assert.doesNotMatch(ui.text(), /temporarily unavailable|Please try again shortly|Couldn’t connect|Tap Enter|Allow your camera and microphone when asked/);
  await ui.poll();
  assert.equal(ui.button('Enter').props.disabled, false);
  assert.doesNotMatch(ui.text(), /temporarily unavailable|Tap Enter/);
  ui.unmount();
});

test('an explicit failed Enter remains retryable without claiming a connection or requesting media', async () => {
  const ui = await harness({ joinFailures: 1 });
  await ui.button('Enter').props.onClick();
  assert.equal(ui.rooms.length, 0); assert.equal(ui.mediaCalls.length, 0);
  assert.equal(ui.button('Enter').props.disabled, false);
  assert.match(ui.text(), /Couldn’t connect/);
  assert.doesNotMatch(ui.text(), /temporarily unavailable|Tap Enter/);
  await ui.button('Enter').props.onClick();
  assert.equal(ui.rooms[0].connected, true);
  assert.doesNotMatch(ui.text(), /Couldn’t connect/);
  ui.unmount();
});

test('an unmounted Enter response never starts a camera or leaves a live SDK connection', async () => {
  const holdJoin = deferred(); const ui = await harness({ holdJoin });
  const joining = ui.button('Enter').props.onClick();
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


test('failed host Leave keeps the call connected and the same Leave action retries closure', async () => {
  const ui = await harness({ endFailures: 1 });
  await ui.button('Enter').props.onClick();
  await ui.button('Leave').props.onClick();
  assert.equal(ui.rooms[0].connected, true);
  assert.equal(ui.button('Leave').props.disabled, false);
  assert.match(ui.text(), /Please retry/);
  await ui.button('Leave').props.onClick();
  assert.equal(ui.rooms[0].disconnected, true);
  assert.equal(ui.requests.filter(request => request.url.endsWith('/end')).length, 2);
  assert.equal(ui.button('Enter').props.disabled, false);
  ui.unmount();
});

test('coach Leave disconnects and releases only their seat without closing the module room', async () => {
  const ui = await harness({ host: false });
  ui.status({ sessionId: 'shared-test-001', status: 'open', revision: 1, hostPresent: true, mayJoin: true, busy: false, startAt: '2026-11-15T13:30:00Z', serverTime: '2026-11-15T13:30:01Z' });
  await ui.poll();
  await ui.button('Enter').props.onClick();
  await ui.button('Leave').props.onClick();
  assert.equal(ui.rooms[0].disconnected, true);
  assert.equal(ui.requests.filter(request => request.url.endsWith('/leave')).length, 1);
  assert.equal(ui.requests.filter(request => request.url.endsWith('/end')).length, 0);
  assert.equal(ui.button('Enter').props.disabled, false);
  assert.doesNotMatch(ui.text(), /Your next step · Module 1|Finish|Refresh room/);
  ui.unmount();
});


test('an open room reload shows Enter only, while uncertain closing has a contextual retry', async () => {
  const ui = await harness();
  ui.status({ sessionId: 'shared-test-001', status: 'open', revision: 2, mayEnd: true, mayGo: true, startAt: '2026-11-15T13:30:00Z', serverTime: '2026-11-15T13:30:02Z' });
  await ui.poll();
  assert.equal(ui.rooms.length, 0); assert.equal(ui.hasButton('Leave'), false); assert.equal(ui.hasButton('Remove'), false); assert.equal(ui.hasButton('Call settings'), false);
  assert.equal(ui.button('Enter').props.disabled, false);
  ui.status({ status: 'ending', revision: 3, mayGo: false }); await ui.poll();
  assert.equal(ui.hasButton('Enter'), false); assert.equal(ui.hasButton('Leave'), false);
  await ui.button('Retry closing').props.onClick();
  assert.equal(ui.requests.filter(request => request.url.endsWith('/end')).length, 1);
  assert.equal(ui.button('Enter').props.disabled, false); ui.unmount();
});

test('Enter shows Connecting until its response and never shows a pre-entry Leave', async () => {
  const holdJoin = deferred(), ui = await harness({ holdJoin });
  assert.equal(ui.hasButton('Leave'), false); assert.equal(ui.hasButton('Call settings'), false);
  const joining = ui.button('Enter').props.onClick();
  assert.equal(ui.button('Connecting…').props.disabled, true); assert.equal(ui.hasButton('Leave'), false);
  holdJoin.resolve(); await joining;
  assert.equal(ui.hasButton('Enter'), false); assert.equal(ui.hasButton('Leave'), true); ui.unmount();
});

test('settings enumerate only after opening the connected cog, and switch devices without unmuting', async () => {
  const ui = await harness();
  assert.equal(ui.deviceReads.length, 0); await ui.button('Enter').props.onClick();
  assert.equal(ui.deviceReads.length, 0); assert.doesNotMatch(ui.text(), /Call settingsMicrophone/);
  ui.button('Call settings').props.onClick(); await flush();
  assert.deepEqual(ui.deviceReads, [{ kind: undefined, requestPermissions: false }]);
  assert.equal(ui.select('Microphone').props.value, 'mic-a'); assert.equal(ui.select('Camera').props.value, 'cam-a');
  await ui.button('Mute').props.onClick(); assert.equal(ui.rooms[0].localParticipant.isMicrophoneEnabled, false); assert.equal(ui.hasButton('Unmute'), true);
  await ui.select('Microphone').props.onChange({ target: { value: 'mic-b' } }); assert.equal(ui.select('Microphone').props.value, 'mic-b');
  assert.equal(ui.rooms[0].localParticipant.isMicrophoneEnabled, false);
  await ui.button('Video off').props.onClick(); assert.equal(ui.rooms[0].localParticipant.isCameraEnabled, false);
  await ui.select('Camera').props.onChange({ target: { value: 'cam-b' } }); assert.equal(ui.select('Camera').props.value, 'cam-b');
  assert.equal(ui.rooms[0].localParticipant.isCameraEnabled, false);
  ui.dispatch('keydown', { key: 'Escape', preventDefault() {} }); assert.equal(ui.button('Call settings').props['aria-expanded'], false);
  assert.equal(ui.button('Call settings').props.ref.current.focused, true);
  assert.equal(ui.hasButton('Mute'), false); assert.equal(ui.hasButton('Video on'), false); ui.unmount();
});

test('a late device restart after Leave stops its captured track even when publication maps were cleared', async () => {
  const holdSwitch = deferred(), ui = await harness({ holdSwitch });
  await ui.button('Enter').props.onClick(); ui.button('Call settings').props.onClick(); await flush();
  const room = ui.rooms[0], changing = ui.select('Camera').props.onChange({ target: { value: 'cam-b' } });
  assert.equal(ui.button('Leave').props.disabled, false);
  await ui.button('Leave').props.onClick(); assert.equal(room.localParticipant.trackPublications.size, 0);
  const stopsBefore = room.cameraTrack.stops;
  holdSwitch.resolve(); await changing;
  assert.equal(room.cameraTrack.live, false); assert.ok(room.cameraTrack.stops > stopsBefore);
  assert.equal(ui.hasButton('Call settings'), false); assert.equal(ui.hasButton('Leave'), false); ui.unmount();
});

test('a late camera-on result after unmount is stopped without reopening the settings or media', async () => {
  const holdCameraResume = deferred(), ui = await harness({ holdCameraResume });
  await ui.button('Enter').props.onClick(); ui.button('Call settings').props.onClick(); await flush();
  await ui.button('Video off').props.onClick();
  const enabling = ui.button('Video on').props.onClick(), room = ui.rooms[0];
  ui.unmount(); holdCameraResume.resolve(); await enabling;
  assert.equal(room.cameraTrack.live, false); assert.ok(room.cameraTrack.stops >= 2);
});

test('unavailable devices and a rejected selection leave mute/Leave usable without claiming a changed device', async () => {
  const missing = await harness({ devicesFailure: true }); await missing.button('Enter').props.onClick(); missing.button('Call settings').props.onClick(); await flush();
  assert.match(missing.text(), /Device choices are unavailable/); await missing.button('Mute').props.onClick(); assert.equal(missing.hasButton('Unmute'), true); missing.unmount();
  const rejected = await harness({ switchReturnsFalse: true }); await rejected.button('Enter').props.onClick(); rejected.button('Call settings').props.onClick(); await flush();
  await rejected.select('Camera').props.onChange({ target: { value: 'cam-b' } });
  assert.equal(rejected.select('Camera').props.value, 'cam-a'); assert.match(rejected.text(), /could not be selected/);
  assert.equal(rejected.button('Leave').props.disabled, false); rejected.unmount();
});


test('unexpected disconnect invalidates a pending device switch and stops its late capture', async () => {
  const holdSwitch = deferred(), ui = await harness({ holdSwitch });
  await ui.button('Enter').props.onClick(); ui.button('Call settings').props.onClick(); await flush();
  const room = ui.rooms[0], changing = ui.select('Camera').props.onChange({ target: { value: 'cam-b' } });
  await room.disconnect(); assert.equal(ui.hasButton('Leave'), false); assert.equal(ui.hasButton('Call settings'), false);
  holdSwitch.resolve(); await changing;
  assert.equal(room.cameraTrack.live, false); assert.ok(room.cameraTrack.stops >= 2); ui.unmount();
});

test('all six stages send only to their own API and non-Activation pages never load Activation booking configuration', async () => {
  for (const stage of stageExports.TRAINING_STAGES) {
    const ui = await harness({ stage });
    assert.ok(ui.requests.some(request => request.url === `${stage.apiPath}/status`), stage.code);
    assert.equal(ui.requests.some(request => request.url === '/api/training/config'), stage.code === 'activa', stage.code);
    assert.equal(ui.rooms.length, 0);
    await ui.button('Enter').props.onClick();
    assert.ok(ui.requests.some(request => request.url === `${stage.apiPath}/go`), stage.code);
    assert.equal(ui.rooms[0].connected, true);
    await ui.button('Leave').props.onClick();
    assert.equal(ui.rooms[0].disconnected, true);
    assert.ok(ui.requests.some(request => request.url === `${stage.apiPath}/end`), stage.code);
    assert.ok(ui.requests.every(request => request.url === '/api/training/config' || request.url.startsWith(stage.apiPath + '/')), stage.code);
    ui.unmount();
  }
});

test('each stage rejects a different stage handoff and only an eligible coach sees its configured next page', async () => {
  for (const stage of stageExports.TRAINING_STAGES) {
    const ui = await harness({ host: false, stage });
    ui.status({ role: 'coach', status: 'ended', sessionId: 'finished-call', revision: 2, nextStageAvailable: true, hasSeat: false, nextStageUrl: 'https://www.patch.app/training/wrongx', serverTime: '2026-11-15T13:40:00Z' });
    await ui.poll();
    assert.doesNotMatch(ui.text(), /Your next step · Module/, stage.code);
    ui.status({ nextStageUrl: stage.handoffUrl, revision: 3 });
    await ui.poll();
    if (stage.nextStageUrl) {
      assert.ok(ui.text().includes(`Your next step · Module ${stage.nextStageModule}`), stage.code);
      assert.ok(ui.text().includes(stage.nextStageUrl), stage.code);
      ui.status({ removed: true, revision: 4 }); await ui.poll();
      assert.doesNotMatch(ui.text(), /Your next step · Module/, stage.code);
    } else {
      assert.doesNotMatch(ui.text(), /Your next step · Module|You are certified|Your certificate is ready/, stage.code);
    }
    ui.unmount();
  }
});

test('a module Enter failure remains retryable on that module without requesting media', async () => {
  const stage = stageExports.getTrainingStage('linkmc'), ui = await harness({ stage, joinFailures: 1 });
  await ui.button('Enter').props.onClick();
  assert.equal(ui.rooms.length, 0); assert.equal(ui.mediaCalls.length, 0);
  assert.equal(ui.button('Enter').props.disabled, false); assert.match(ui.text(), /Couldn’t connect/);
  await ui.button('Enter').props.onClick();
  assert.equal(ui.rooms[0].connected, true);
  assert.equal(ui.requests.filter(request => request.url === `${stage.apiPath}/go`).length, 2);
  assert.ok(ui.requests.every(request => !request.url.includes('activation-room')));
  ui.unmount();
});
