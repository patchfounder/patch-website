import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createActivationSharedRoomRouter } from '../server/activation-shared-room.js';
import { TRAINING_STAGES, getTrainingStage } from '../src/training-stages.js';

const ORIGIN = 'https://www.patch.app';
const PROJECT = path.resolve(import.meta.dirname, '..');
async function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'patch-training-stages-test-'));
  const tokens = [], revoked = [], deleted = [], participants = new Map();
  const env = { NODE_ENV: 'production', LIVEKIT_URL: 'wss://synthetic.livekit.cloud', LIVEKIT_API_KEY: 'synthetic-key', LIVEKIT_API_SECRET: 'synthetic-secret', TRAINING_PUBLIC_ORIGIN: ORIGIN, TRAINING_DATA_DIR: directory };
  const provider = {
    async createRoom({ roomName }) { if (!participants.has(roomName)) participants.set(roomName, new Map()); },
    async listParticipants(roomName) { return [...(participants.get(roomName) || new Map()).values()]; },
    async issueToken(value) { const token = `synthetic-${tokens.length}`; tokens.push({ ...value, token }); return token; },
    async revokeParticipant(roomName, identity) { revoked.push({ roomName, identity }); participants.get(roomName)?.delete(identity); },
    async deleteRoom(roomName) { deleted.push(roomName); participants.delete(roomName); },
  };
  const application = () => {
    const app = express();
    for (const stage of TRAINING_STAGES) app.use(stage.apiPath, createActivationSharedRoomRouter({ env, projectRoot: PROJECT, ...(stage.code === 'activa' ? {} : { stageCode: stage.code }), livekitFactory: () => provider }));
    return app;
  };
  let server = application().listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }); });
  const browser = () => {
    const cookies = new Map();
    return { cookies, async request(code, route, { method = 'GET', body, origin = ORIGIN } = {}) {
      const stage = getTrainingStage(code);
      const response = await fetch(`http://127.0.0.1:${server.address().port}${stage.apiPath}${route}`, { method,
        headers: { ...(method === 'POST' && origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      for (const raw of response.headers.getSetCookie()) { const [name, ...parts] = raw.split(';')[0].split('='); cookies.set(name, parts.join('=')); }
      return { status: response.status, data: await response.json(), headers: response.headers };
    } };
  };
  function connect(result) {
    const token = tokens.find(item => item.token === result.participantToken); assert.ok(token);
    participants.get(token.roomName).set(token.identity, { identity: token.identity });
  }
  const post = (client, code, route, body = {}) => client.request(code, route, { method: 'POST', body });
  async function open(client, code) { const response = await post(client, code, '/go'); assert.equal(response.status, 200, JSON.stringify(response.data)); connect(response.data); return response; }
  return { browser, post, open, connect, directory, tokens, revoked, deleted, participants,
    async restart() { await new Promise(resolve => server.close(resolve)); server = application().listen(0, '127.0.0.1'); await once(server, 'listening'); },
  };
}

test('only the six configured training stages can select a room namespace', () => {
  assert.deepEqual(TRAINING_STAGES.map(stage => stage.code), ['activa', 'premas', 'linkmc', 'linkac', 'knowyc', 'certif']);
  for (const stageCode of ['activation', '../activa', 'unknown', '__proto__', '', null]) assert.throws(() => createActivationSharedRoomRouter({ stageCode }), /Unknown training stage/);
});

test('the default router reopens an existing Activation record and owner cookie without migration', async t => {
  const f = await fixture(t), host = f.browser(), sessionId = 'A'.repeat(43), ownerKey = 'legacy-owner-key';
  const file = path.join(f.directory, 'activation-shared-room.json');
  const record = { schema: 'patch-activation-shared-v1', revision: 8, currentId: sessionId, rooms: [{
    id: sessionId, roomName: `training-shared-activation-${sessionId}`, status: 'open', ownerHash: createHash('sha256').update(ownerKey).digest('hex'),
    hostIdentity: sessionId + ':host', startAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    coach: null, hostWasPresent: false, removedHashes: [], admittedHashes: [], completedHashes: [],
  }] };
  const saved = JSON.stringify(record) + '\n'; writeFileSync(file, saved, { mode: 0o600 });
  host.cookies.set('patch_activation_owner', ownerKey);
  const status = await host.request('activa', '/status'); assert.equal(status.status, 200); assert.equal(status.data.role, 'host'); assert.equal(status.data.sessionId, sessionId);
  const entered = await f.post(host, 'activa', '/go'); assert.equal(entered.status, 200); assert.equal(entered.data.session.sessionId, sessionId);
  assert.equal(f.tokens[0].roomName, record.rooms[0].roomName); assert.equal(readFileSync(file, 'utf8'), saved);
  assert.deepEqual(readdirSync(f.directory), ['activation-shared-room.json']);
});

test('all six stages share the proven provider but have separate cookies, rooms and private records', async t => {
  const f = await fixture(t), host = f.browser();
  for (const stage of TRAINING_STAGES) {
    const status = await host.request(stage.code, '/status'); assert.equal(status.status, 200); assert.equal(status.data.status, 'closed');
    const response = await f.open(host, stage.code);
    assert.match(response.headers.get('set-cookie'), new RegExp(`patch_${stage.id}_owner=.*Path=${stage.apiPath}; HttpOnly; SameSite=Strict;.*Secure`));
    const token = f.tokens.find(item => item.token === response.data.participantToken);
    assert.equal(token.roomName, `training-shared-${stage.id}-${response.data.session.sessionId}`);
    assert.equal(token.ttlSeconds, 120);
    const file = path.join(f.directory, `${stage.id}-shared-room.json`), record = JSON.parse(readFileSync(file, 'utf8'));
    assert.equal(record.schema, `patch-${stage.id}-shared-v1`); assert.equal(record.rooms.length, 1);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(record.rooms[0].roomName, token.roomName);
  }
  assert.equal(new Set(f.tokens.map(item => item.roomName)).size, 6);
  assert.equal(new Set([...host.cookies.keys()]).size, 6);
  assert.equal(readdirSync(f.directory).length, 6);
  assert.ok(readdirSync(f.directory).includes('activation-shared-room.json'));
  assert.ok(host.cookies.has('patch_activation_owner'));
});

test('a host cookie or session ID from another stage cannot control a different room', async t => {
  const f = await fixture(t), activationHost = f.browser(), preHost = f.browser();
  const activation = await f.open(activationHost, 'activa'), pre = await f.open(preHost, 'premas');
  const preId = pre.data.session.sessionId, activationId = activation.data.session.sessionId;
  assert.equal((await activationHost.request('premas', '/status')).data.role, 'coach');
  assert.equal((await f.post(activationHost, 'premas', '/go')).status, 409);
  assert.equal((await f.post(activationHost, 'premas', '/end', { sessionId: preId })).status, 403);
  assert.equal((await f.post(activationHost, 'premas', '/remove', { sessionId: preId })).status, 403);
  assert.equal((await f.post(preHost, 'premas', '/end', { sessionId: activationId })).status, 409);
  assert.equal((await f.post(preHost, 'premas', '/join', { sessionId: activationId })).status, 409);
  assert.equal((await activationHost.request('activa', '/status')).data.hostPresent, true);
  assert.equal((await preHost.request('premas', '/status')).data.hostPresent, true);
});

test('the same coach browser can join two stages and ending one preserves the other live seat', async t => {
  const f = await fixture(t), host = f.browser(), coach = f.browser(), outsider = f.browser();
  const a = await f.open(host, 'premas'), b = await f.open(host, 'linkmc');
  const aId = a.data.session.sessionId, bId = b.data.session.sessionId;
  const entries = await Promise.all([f.post(coach, 'premas', '/join', { sessionId: aId }), f.post(coach, 'linkmc', '/join', { sessionId: bId })]);
  for (const entry of entries) { assert.equal(entry.status, 200); f.connect(entry.data); }
  assert.ok(coach.cookies.has('patch_premas_coach')); assert.ok(coach.cookies.has('patch_linkmc_coach'));
  assert.notEqual(coach.cookies.get('patch_premas_coach'), coach.cookies.get('patch_linkmc_coach'));
  assert.equal((await outsider.request('premas', '/status')).data.busy, true);
  assert.equal((await outsider.request('linkmc', '/status')).data.busy, true);
  assert.equal((await f.post(host, 'premas', '/end', { sessionId: aId })).status, 200);
  const aStatus = (await coach.request('premas', '/status')).data, bStatus = (await coach.request('linkmc', '/status')).data;
  assert.equal(aStatus.nextStageAvailable, true); assert.equal(aStatus.nextStageUrl, getTrainingStage('premas').handoffUrl);
  assert.equal(bStatus.status, 'open'); assert.equal(bStatus.hasSeat, true); assert.equal(bStatus.hostPresent, true); assert.equal(bStatus.coachPresent, true); assert.equal(bStatus.nextStageAvailable, false);
  assert.equal((await outsider.request('premas', '/status')).data.nextStageAvailable, false);
  assert.equal(f.deleted.length, 1); assert.match(f.deleted[0], /training-shared-premas-/);
  assert.ok(f.revoked.every(item => item.roomName.includes('training-shared-premas-')));
});

test('a copied coach cookie from another stage cannot occupy or complete its admitted seat', async t => {
  const f = await fixture(t), host = f.browser(), aCoach = f.browser(), bCoach = f.browser();
  const a = await f.open(host, 'activa'), b = await f.open(host, 'premas');
  const aId = a.data.session.sessionId, bId = b.data.session.sessionId;
  const joinedA = await f.post(aCoach, 'activa', '/join', { sessionId: aId }), joinedB = await f.post(bCoach, 'premas', '/join', { sessionId: bId });
  f.connect(joinedA.data); f.connect(joinedB.data);
  aCoach.cookies.set('patch_premas_coach', aCoach.cookies.get('patch_activation_coach'));
  const otherStatus = (await aCoach.request('premas', '/status')).data;
  assert.equal(otherStatus.hasSeat, false); assert.equal(otherStatus.busy, true); assert.equal(otherStatus.nextStageAvailable, false);
  assert.equal((await f.post(aCoach, 'premas', '/join', { sessionId: bId })).status, 409);
  await f.post(aCoach, 'premas', '/leave', { sessionId: bId });
  assert.equal((await bCoach.request('premas', '/status')).data.hasSeat, true);
  await f.post(host, 'premas', '/end', { sessionId: bId });
  assert.equal((await aCoach.request('premas', '/status')).data.nextStageAvailable, false);
  assert.equal((await bCoach.request('premas', '/status')).data.nextStageAvailable, true);
});

test('only the completed stage grants its configured handoff and Certification grants no automatic next stage', async t => {
  const f = await fixture(t), host = f.browser(), coach = f.browser();
  for (const stage of TRAINING_STAGES) {
    const opened = await f.open(host, stage.code), sessionId = opened.data.session.sessionId;
    const joined = await f.post(coach, stage.code, '/join', { sessionId }); assert.equal(joined.status, 200); f.connect(joined.data);
    assert.equal((await f.post(host, stage.code, '/end', { sessionId })).status, 200);
    const result = (await coach.request(stage.code, '/status')).data;
    assert.equal(result.status, 'ended'); assert.equal(result.nextStageAvailable, Boolean(stage.handoffUrl)); assert.equal(result.nextStageUrl, stage.handoffUrl || null);
    assert.equal((await f.browser().request(stage.code, '/status')).data.nextStageAvailable, false);
  }
  assert.equal(getTrainingStage('activa').handoffUrl, 'https://www.patch.app/pre/');
  assert.equal(getTrainingStage('certif').handoffUrl, null);
});

test('stage-specific ownership and completed history survive a Website process restart', async t => {
  const f = await fixture(t), host = f.browser(), coach = f.browser();
  const opened = await f.open(host, 'linkac'), sessionId = opened.data.session.sessionId;
  const joined = await f.post(coach, 'linkac', '/join', { sessionId }); f.connect(joined.data);
  await f.post(host, 'linkac', '/end', { sessionId });
  const other = await f.open(host, 'knowyc');
  await f.restart();
  assert.equal((await coach.request('linkac', '/status')).data.nextStageAvailable, true);
  assert.equal((await coach.request('knowyc', '/status')).data.nextStageAvailable, false);
  const restored = (await host.request('knowyc', '/status')).data;
  assert.equal(restored.role, 'host'); assert.equal(restored.sessionId, other.data.session.sessionId);
  assert.equal((await f.browser().request('knowyc', '/status')).data.role, 'coach');
});
