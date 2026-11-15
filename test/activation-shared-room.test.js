import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { createActivationSharedRoomRouter, createActivationSharedLivekitProvider } from '../server/activation-shared-room.js';

const ORIGIN = 'https://www.patch.app';
const PROJECT = path.resolve(import.meta.dirname, '..');
async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'patch-activation-shared-test-'));
  let time = Date.parse('2030-01-01T12:00:00Z');
  const calls = { rooms: [], tokens: [], revoked: [], deleted: [], failCreate: false, failList: false, failToken: false, failRevoke: false, failDelete: false };
  const connected = new Map();
  const provider = {
    async createRoom(value) { if (calls.failCreate) throw new Error('private provider create details'); calls.rooms.push(value); },
    async listParticipants(room) { if (calls.failList) throw new Error('private provider list details'); return [...(connected.get(room) || new Map()).values()]; },
    async issueToken(value) { if (calls.failToken) throw new Error('private provider token details'); const token = 'synthetic-token-' + calls.tokens.length; calls.tokens.push({ ...value, token }); return token; },
    async revokeParticipant(room, identity, cutoff) { if (calls.failRevoke) throw new Error('private provider revoke details'); calls.revoked.push({ room, identity, cutoff }); connected.get(room)?.delete(identity); },
    async deleteRoom(room) { if (calls.failDelete) throw new Error('private provider delete details'); calls.deleted.push(room); connected.delete(room); }
  };
  const env = { NODE_ENV: 'production', LIVEKIT_URL: 'wss://synthetic.livekit.cloud', LIVEKIT_API_KEY: 'private-api-key', LIVEKIT_API_SECRET: 'private-api-secret',
    TRAINING_PUBLIC_ORIGIN: ORIGIN, TRAINING_DATA_DIR: directory, ...overrides };
  function application() { const app = express(); app.use('/api/training/activation-room', createActivationSharedRoomRouter({ env, projectRoot: PROJECT, now: () => time, livekitFactory: () => provider })); return app; }
  let server = application().listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }); });
  const browser = () => {
    const cookies = new Map();
    return { cookies, async request(route, { method = 'GET', body, origin = ORIGIN } = {}) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/training/activation-room` + route, { method,
        headers: { ...(method === 'POST' && origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), Cookie: [...cookies].map(([k, v]) => k + '=' + v).join('; ') },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      for (const raw of response.headers.getSetCookie()) { const [name, ...values] = raw.split(';')[0].split('='); cookies.set(name, values.join('=')); }
      return { status: response.status, data: await response.json(), headers: response.headers };
    } };
  };
  function connect(result) { const item = calls.tokens.find(value => value.token === result.participantToken); assert.ok(item); if (!connected.has(item.roomName)) connected.set(item.roomName, new Map()); connected.get(item.roomName).set(item.identity, { identity: item.identity, name: item.name }); }
  async function open(host) { const result = await host.request('/go', { method: 'POST', body: {} }); assert.equal(result.status, 200, JSON.stringify(result.data)); connect(result.data); return result.data.session.sessionId; }
  return { browser, open, connect, calls, connected, directory, env, get time() { return time; }, advance(ms) { time += ms; },
    async restart() { await new Promise(resolve => server.close(resolve)); server = application().listen(0, '127.0.0.1'); await once(server, 'listening'); } };
}
const post = (client, route, body) => client.request(route, { method: 'POST', body });

test('shared room needs no host password; readiness and private storage stay scoped', async t => {
  const f = await fixture(t); const host = f.browser();
  const status = await host.request('/status');
  assert.equal(status.status, 200); assert.equal(status.data.ready, true); assert.equal(status.data.status, 'closed'); assert.equal(status.data.mayGo, true);
  const opened = await post(host, '/go', {});
  assert.equal(opened.status, 200); assert.equal(opened.data.role, 'host'); assert.equal(opened.data.session.role, 'host');
  assert.equal(opened.data.session.hostPresent, false); assert.equal(opened.data.session.mayJoin, false);
  assert.match(opened.headers.get('set-cookie'), /Path=\/api\/training\/activation-room; HttpOnly; SameSite=Strict;.*Secure/);
  assert.equal(f.calls.rooms[0].maxParticipants, 2); assert.equal(f.calls.tokens[0].ttlSeconds, 120);
  assert.doesNotMatch(JSON.stringify(opened.data), /private-api|ownerHash|coachEmail|password/);
  const file = path.join(f.directory, 'activation-shared-room.json');
  assert.equal(statSync(file).mode & 0o777, 0o600); assert.equal(statSync(f.directory).mode & 0o777, 0o700);
  assert.equal(readFileSync(file, 'utf8').includes(host.cookies.get('patch_activation_owner')), false);
  assert.equal((await post(f.browser(), '/go', {})).data.code, 'host_already_open');
  assert.equal((await post(host, '/go', {})).data.session.sessionId, opened.data.session.sessionId);
  await f.restart(); assert.equal((await host.request('/status')).data.role, 'host');
});

test('unconfigured service is unavailable without exposing keys or requiring legacy host key', async t => {
  for (const overrides of [{ LIVEKIT_API_KEY: '' }, { LIVEKIT_URL: 'wss://self-hosted.example.test' }, { TRAINING_DATA_DIR: '' }, { TRAINING_DATA_DIR: PROJECT }]) {
    const f = await fixture(t, overrides), client = f.browser();
    const response = await client.request('/status'); assert.equal(response.status, 503); assert.equal(response.data.ready, false);
    assert.doesNotMatch(JSON.stringify(response.data), /private-api|self-hosted/); assert.deepEqual(readdirSync(f.directory), []);
  }
});

test('every mutation requires same origin and current room; query roles grant no host authority', async t => {
  const f = await fixture(t), host = f.browser(), outsider = f.browser();
  assert.equal((await host.request('/go', { method: 'POST', body: {}, origin: null })).status, 403);
  assert.equal((await host.request('/go', { method: 'POST', body: {}, origin: 'https://other.example' })).status, 403);
  const sessionId = await f.open(host);
  assert.equal((await post(outsider, '/end?role=host', { sessionId })).status, 403);
  assert.equal((await post(host, '/end', { sessionId: 'old-room' })).status, 409);
  assert.equal((await post(host, '/remove', { sessionId: 'old-room' })).status, 409);
  assert.equal((await post(outsider, '/join', {})).status, 409);
});

test('real host presence opens Enter; concurrent coach entry reserves exactly one place', async t => {
  const f = await fixture(t), host = f.browser(), first = f.browser(), second = f.browser();
  const go = await post(host, '/go', {}); const sessionId = go.data.session.sessionId;
  assert.equal((await post(first, '/join', { sessionId })).data.code, 'host_not_ready');
  f.connect(go.data);
  assert.equal((await first.request('/status')).data.mayJoin, true);
  const results = await Promise.all([post(first, '/join', { sessionId }), post(second, '/join', { sessionId })]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results[0].status === 200 ? first : second, loser = winner === first ? second : first;
  const admitted = results.find(result => result.status === 200); f.connect(admitted.data);
  assert.equal((await loser.request('/status')).data.busy, true); assert.equal((await loser.request('/status')).data.mayJoin, false);
  assert.equal((await winner.request('/status')).data.hasSeat, true);
  assert.equal((await post(winner, '/join', { sessionId })).data.identity, admitted.data.identity);
});

test('Remove ejects exact coach, invalidates their token, blocks re-entry and protects replacement', async t => {
  const f = await fixture(t), host = f.browser(), first = f.browser(), second = f.browser();
  const sessionId = await f.open(host); const entered = await post(first, '/join', { sessionId }); f.connect(entered.data);
  const hostStatus = (await host.request('/status')).data; assert.equal(hostStatus.coachId, entered.data.identity);
  const removed = await post(host, '/remove', { sessionId, coachId: hostStatus.coachId });
  assert.equal(removed.status, 200); assert.equal(removed.data.coachPresent, false); assert.equal(removed.data.coachId, null);
  assert.ok(f.calls.revoked.some(value => value.identity === entered.data.identity && value.cutoff > f.time / 1000));
  assert.equal((await first.request('/status')).data.removed, true); assert.equal((await post(first, '/join', { sessionId })).status, 403);
  const next = await post(second, '/join', { sessionId }); assert.equal(next.status, 200); assert.notEqual(next.data.identity, entered.data.identity); f.connect(next.data);
  const staleRemove = await post(host, '/remove', { sessionId, coachId: entered.data.identity });
  assert.equal(staleRemove.status, 409); assert.equal(staleRemove.data.code, 'coach_changed');
  assert.equal((await host.request('/status')).data.coachId, next.data.identity);
  assert.equal((await first.request('/status')).data.nextStageAvailable, false);
});

test('Leave is idempotent and allows coach re-entry with a new unrevoked identity', async t => {
  const f = await fixture(t), host = f.browser(), coach = f.browser();
  const sessionId = await f.open(host), entered = await post(coach, '/join', { sessionId }); f.connect(entered.data);
  assert.equal((await post(coach, '/leave', { sessionId })).status, 200);
  assert.equal((await post(coach, '/leave', { sessionId })).status, 200);
  assert.equal((await coach.request('/status')).data.removed, false);
  const rejoined = await post(coach, '/join', { sessionId }); assert.equal(rejoined.status, 200); assert.notEqual(rejoined.data.identity, entered.data.identity);
  const before = f.calls.tokens.find(value => value.name === 'Patrick').identity;
  assert.equal((await post(host, '/leave', { sessionId })).status, 200);
  assert.equal((await coach.request('/status')).data.hostPresent, false);
  const hostRejoin = await post(host, '/go', {}); assert.equal(hostRejoin.status, 200); assert.notEqual(hostRejoin.data.identity, before);
});

test('failed camera/connect reservations expire safely; connected coach gets reconnect grace', async t => {
  const f = await fixture(t), host = f.browser(), first = f.browser(), second = f.browser();
  const sessionId = await f.open(host), entered = await post(first, '/join', { sessionId });
  f.advance(20_001);
  assert.equal((await second.request('/status')).data.busy, false);
  assert.ok(f.calls.revoked.some(value => value.identity === entered.data.identity));
  const admitted = await post(second, '/join', { sessionId }); f.connect(admitted.data);
  assert.equal((await host.request('/status')).data.coachPresent, true);
  for (const participants of f.connected.values()) participants.delete(admitted.data.identity);
  f.advance(19_999); assert.equal((await first.request('/status')).data.busy, true);
  f.advance(2); assert.equal((await first.request('/status')).data.busy, false);
  assert.ok(f.calls.revoked.some(value => value.identity === admitted.data.identity));
});

test('Finish unlocks next stage only for a genuinely connected nonremoved coach, preserving closed history', async t => {
  const f = await fixture(t), host = f.browser(), coach = f.browser(), other = f.browser();
  const sessionId = await f.open(host); const entered = await post(coach, '/join', { sessionId }); f.connect(entered.data);
  const end = await post(host, '/end', { sessionId }); assert.equal(end.status, 200); assert.equal(end.data.status, 'ended');
  assert.equal(end.data.nextStageAvailable, false);
  const finished = (await coach.request('/status')).data;
  assert.equal(finished.nextStageAvailable, true); assert.equal(finished.nextStageUrl, 'https://www.patch.app/pre/');
  assert.equal((await other.request('/status')).data.nextStageAvailable, false);
  assert.equal((await post(coach, '/join', { sessionId })).status, 409);
  assert.equal((await post(host, '/end', { sessionId })).status, 200);
  const reopened = await post(host, '/go', {}); assert.equal(reopened.data.session.role, 'host'); assert.notEqual(reopened.data.session.sessionId, sessionId);
  assert.equal((await post(host, '/end', { sessionId })).status, 409);
  assert.equal((await coach.request('/status')).data.nextStageAvailable, true);
  assert.equal((await other.request('/status')).data.nextStageAvailable, false);
  const record = JSON.parse(readFileSync(path.join(f.directory, 'activation-shared-room.json'), 'utf8'));
  assert.equal(record.rooms.length, 2); assert.equal(record.rooms[0].status, 'ended');
});

test('Finish does not reward never-connected or removed guests; failure remains recoverable ending', async t => {
  const f = await fixture(t), host = f.browser(), guest = f.browser();
  const sessionId = await f.open(host); await post(guest, '/join', { sessionId });
  f.calls.failRevoke = true;
  assert.equal((await post(host, '/end', { sessionId })).status, 503);
  assert.equal((await guest.request('/status')).data.status, 'ending'); assert.equal((await guest.request('/status')).data.nextStageAvailable, false);
  assert.equal((await post(guest, '/join', { sessionId })).status, 409);
  f.calls.failRevoke = false; f.calls.failDelete = true;
  assert.equal((await post(host, '/end', { sessionId })).status, 503);
  f.calls.failDelete = false; assert.equal((await post(host, '/end', { sessionId })).status, 200);
  assert.equal((await guest.request('/status')).data.nextStageAvailable, false);
  const nextId = await f.open(host), next = await post(guest, '/join', { sessionId: nextId }); f.connect(next.data);
  const status = (await host.request('/status')).data;
  await post(host, '/remove', { sessionId: nextId, coachId: status.coachId });
  await post(host, '/end', { sessionId: nextId });
  assert.equal((await guest.request('/status')).data.nextStageAvailable, false);
});

test('two-hour expiration closes provider room without progressing anyone; new Go creates a fresh room', async t => {
  const f = await fixture(t), host = f.browser(), coach = f.browser();
  const sessionId = await f.open(host), entered = await post(coach, '/join', { sessionId }); f.connect(entered.data);
  await host.request('/status'); f.advance(2 * 60 * 60_000 + 1);
  const result = await coach.request('/status'); assert.equal(result.data.status, 'closed'); assert.equal(result.data.nextStageAvailable, false);
  assert.equal(f.calls.deleted.length, 1);
  const fresh = await post(host, '/go', {}); assert.notEqual(fresh.data.session.sessionId, sessionId);
});

test('provider failures are truthful and do not expose secrets or free an unrevoked seat', async t => {
  const f = await fixture(t), host = f.browser(), coach = f.browser();
  const sessionId = await f.open(host), entered = await post(coach, '/join', { sessionId }); f.connect(entered.data);
  const status = (await host.request('/status')).data;
  f.calls.failRevoke = true;
  const failed = await post(host, '/remove', { sessionId, coachId: status.coachId }); assert.equal(failed.status, 503); assert.doesNotMatch(JSON.stringify(failed.data), /private provider/);
  f.calls.failRevoke = false;
  assert.equal((await host.request('/status')).data.coachId, entered.data.identity);
  f.calls.failList = true; assert.equal((await coach.request('/status')).status, 503);
});

test('default SDK provider grants only scoped camera/microphone and uses Cloud revocation cutoff', async () => {
  const calls = {};
  class Client {
    async createRoom(value) { calls.created = value; }
    async listParticipants(room) { calls.listed = room; return [{ identity: 'example' }]; }
    async removeParticipant(...values) { calls.removed = values; }
    async deleteRoom(room) { calls.deleted = room; }
  }
  const provider = await createActivationSharedLivekitProvider({ url: 'wss://synthetic.livekit.cloud', apiKey: 'synthetic-key', apiSecret: 'synthetic-secret' }, { loadSdk: async () => ({ RoomServiceClient: Client, AccessToken, TrackSource }) });
  await provider.createRoom({ roomName: 'synthetic-room' }); assert.equal(calls.created.maxParticipants, 2);
  const jwt = await provider.issueToken({ roomName: 'synthetic-room', identity: 'coach-generation-1', name: 'Coach', ttlSeconds: 120 });
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
  assert.equal(payload.sub, 'coach-generation-1'); assert.equal(payload.video.room, 'synthetic-room'); assert.equal(payload.video.canPublishData, false);
  assert.deepEqual(payload.video.canPublishSources.sort(), ['camera', 'microphone']);
  assert.equal(payload.exp - payload.nbf, 120); assert.equal(payload.video.roomAdmin, undefined);
  await provider.revokeParticipant('synthetic-room', 'coach-generation-1', 1893499201); assert.equal(calls.removed[2].revokeTokenTs, 1893499201n);
});
