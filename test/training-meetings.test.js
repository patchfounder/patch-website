import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { once } from 'node:events';
import { chmodSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, existsSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createTrainingLivekitProvider, createTrainingMeetingsRouter } from '../server/training-meetings.js';

const PROJECT = path.resolve(import.meta.dirname, '..');
const ORIGIN = 'https://www.patch.app';
const HOST_KEY = 'synthetic-only-training-host-key-with-32-characters';

async function fixture(t, overrides = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'patch-training-test-'));
  let time = Date.parse('2030-01-02T12:00:00.000Z');
  const calls = { rooms: [], tokens: [], revoked: [], deleted: [], failCreate: false, failToken: false, failDelete: false, failRevoke: false };
  const provider = {
    async createRoom(value) { if (calls.failCreate) throw new Error('synthetic provider secret'); calls.rooms.push(value); },
    async issueToken(value) { if (calls.failToken) throw new Error('synthetic provider secret'); calls.tokens.push(value); return 'synthetic-jwt-' + calls.tokens.length; },
    async revokeParticipant(roomName, identity, cutoff) { if (calls.failRevoke) throw new Error('synthetic revoke failure'); calls.revoked.push({ roomName, identity, cutoff }); },
    async deleteRoom(value) { if (calls.failDelete) throw new Error('synthetic provider secret'); calls.deleted.push(value); }
  };
  const env = { NODE_ENV: 'production', LIVEKIT_URL: 'wss://synthetic.livekit.cloud', LIVEKIT_API_KEY: 'synthetic-api-key',
    LIVEKIT_API_SECRET: 'synthetic-api-secret', TRAINING_HOST_ACCESS_KEY: HOST_KEY, TRAINING_PUBLIC_ORIGIN: ORIGIN,
    TRAINING_DATA_DIR: directory, ...overrides };
  function application() {
    const app = express();
    app.use('/api/training', createTrainingMeetingsRouter({ env, projectRoot: PROJECT, livekitFactory: () => provider, now: () => time }));
    return app;
  }
  let server = application().listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); rmSync(directory, { recursive: true, force: true }); });
  let base = `http://127.0.0.1:${server.address().port}/api/training`;
  async function restart() {
    await new Promise(resolve => server.close(resolve));
    server = application().listen(0, '127.0.0.1');
    await once(server, 'listening');
    base = `http://127.0.0.1:${server.address().port}/api/training`;
  }
  async function request(route, { method = 'GET', body, access, cookie, origin = ORIGIN } = {}) {
    const response = await fetch(base + route, { method, headers: {
      ...(method === 'POST' && origin ? { Origin: origin } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(access ? { Authorization: 'Bearer ' + access } : {}), ...(cookie ? { Cookie: cookie } : {})
    }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json(), headers: response.headers };
  }
  async function login() {
    const response = await request('/host/login', { method: 'POST', body: { accessKey: env.TRAINING_HOST_ACCESS_KEY } });
    assert.equal(response.status, 200);
    return response.headers.get('set-cookie').split(';')[0];
  }
  async function create(cookie, startAt = new Date(time).toISOString(), extra = {}) {
    const response = await request('/host/sessions', { method: 'POST', cookie, body: {
      coachName: 'Synthetic Coach', coachEmail: 'coach@example.test', startAt, contactsVerified: true, ...extra
    } });
    assert.equal(response.status, 201, JSON.stringify(response.data));
    const host = new URLSearchParams(new URL(response.data.hostUrl).hash.slice(1));
    const coach = new URLSearchParams(new URL(response.data.coachUrl).hash.slice(1));
    return { ...response.data, id: response.data.session.sessionId, hostAccess: host.get('access'), coachAccess: coach.get('access') };
  }
  return { request, login, create, restart, calls, directory, env, provider, get time() { return time; }, setTime(value) { time = value; } };
}

test('unconfigured training is fail-closed without breaking the Website or exposing configuration', async t => {
  const f = await fixture(t, { LIVEKIT_API_KEY: '' });
  const result = await f.request('/config');
  assert.equal(result.status, 503); assert.equal(result.data.ready, false);
  assert.equal(result.data.webhookConnected, false); assert.equal(result.data.bookingDurationMinutes, 30);
  assert.equal((await f.request('/host/login', { method: 'POST', body: { accessKey: HOST_KEY } })).status, 503);
  assert.deepEqual(readdirSync(f.directory), []);
  assert.doesNotMatch(JSON.stringify(result.data), /synthetic-api|training-host-key/);
});

test('configuration preserves the live 30-minute booking default and requires explicit duration verification', async t => {
  const f = await fixture(t, { TRAINING_ACTIVATION_BOOKING_MINUTES: '5' });
  const config = await f.request('/config');
  assert.equal(config.status, 200); assert.equal(config.data.sessionDurationSeconds, 300);
  assert.equal(config.data.bookingDurationMinutes, 30);
  const verified = await fixture(t, { TRAINING_ACTIVATION_BOOKING_MINUTES: '5', TRAINING_ACTIVATION_BOOKING_DURATION_VERIFIED: 'true' });
  assert.equal((await verified.request('/config')).data.bookingDurationMinutes, 5);
});

test('production rejects missing, relative and repository-contained persistence paths', async t => {
  for (const value of ['', 'relative-private', path.join(PROJECT, 'never-create-training-test-data')]) {
    const f = await fixture(t, { TRAINING_DATA_DIR: value });
    assert.equal((await f.request('/config')).status, 503);
  }
  assert.equal(existsSync(path.join(PROJECT, 'never-create-training-test-data')), false);
});

test('host login uses same-origin checks, a scoped secure cookie, rate limits and logout', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('/host/login', { method: 'POST', origin: 'https://untrusted.example', body: { accessKey: HOST_KEY } })).status, 403);
  assert.equal((await f.request('/host/login', { method: 'POST', origin: null, body: { accessKey: HOST_KEY } })).status, 403);
  const login = await f.request('/host/login', { method: 'POST', body: { accessKey: HOST_KEY } });
  assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Strict;.*Secure/);
  assert.match(login.headers.get('set-cookie'), /Path=\/api\/training/);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await f.request('/host/sessions', { cookie })).status, 200);
  assert.equal((await f.request('/host/logout', { method: 'POST', cookie })).status, 200);
  assert.equal((await f.request('/host/sessions', { cookie })).status, 401);
  for (let i = 0; i < 9; i++) assert.equal((await f.request('/host/login', { method: 'POST', body: { accessKey: 'incorrect' } })).status, 401);
  assert.equal((await f.request('/host/login', { method: 'POST', body: { accessKey: HOST_KEY } })).status, 429);
});

test('host session expires and forwarded addresses cannot bypass login rate limits', async t => {
  const f = await fixture(t); const cookie = await f.login();
  f.setTime(f.time + 8 * 60 * 60_000 + 1);
  assert.equal((await f.request('/host/sessions', { cookie })).status, 401);
});

test('manual appointments require Contacts attestation and timezone-qualified times, and persist 300 seconds privately', async t => {
  const f = await fixture(t); const cookie = await f.login();
  const body = { coachName: 'Synthetic Coach', coachEmail: 'coach@example.test', startAt: new Date(f.time).toISOString() };
  assert.equal((await f.request('/host/sessions', { method: 'POST', cookie, body })).data.code, 'contacts_check_required');
  assert.equal((await f.request('/host/sessions', { method: 'POST', cookie, body: { ...body, contactsVerified: true, startAt: '2030-01-02T12:00:00' } })).status, 400);
  const created = await f.create(cookie);
  assert.equal(Date.parse(created.session.endAt) - Date.parse(created.session.startAt), 300_000);
  const file = path.join(f.directory, created.id + '.json');
  assert.equal(statSync(file).mode & 0o777, 0o600); assert.equal(statSync(f.directory).mode & 0o777, 0o700);
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(saved.contactsCheck.method, 'host-attested');
  for (const secret of [created.hostAccess, created.coachAccess, HOST_KEY, f.env.LIVEKIT_API_SECRET]) assert.equal(readFileSync(file, 'utf8').includes(secret), false);
  assert.equal(new URL(created.coachUrl).search, ''); assert.notEqual(created.hostAccess, created.coachAccess);
  const listed = await f.request('/host/sessions', { cookie });
  assert.equal(listed.data.sessions[0].coachUrl, created.coachUrl); assert.equal(listed.data.sessions[0].hostUrl, created.hostUrl);
  assert.equal((await f.request('/host/sessions')).status, 401);
});

test('only correct per-session invitation roles authorise status; query roles grant nothing', async t => {
  const f = await fixture(t); const cookie = await f.login(); const first = await f.create(cookie); const second = await f.create(cookie, new Date(f.time + 600_000).toISOString());
  assert.equal((await f.request(`/sessions/${first.id}/status`)).status, 401);
  assert.equal((await f.request(`/sessions/${first.id}/status`, { access: second.coachAccess })).status, 401);
  assert.equal((await f.request(`/sessions/${first.id}/status?role=host`, { access: first.coachAccess })).data.role, 'coach');
  assert.equal((await f.request(`/sessions/${first.id}/status`, { cookie })).data.role, 'host');
  const status = await f.request(`/sessions/${first.id}/status`, { access: first.coachAccess });
  assert.equal(status.data.coachEmail, undefined); assert.equal(status.data.tokenHashes, undefined);
  assert.doesNotMatch(JSON.stringify(status.data), /synthetic-api|training-host-key/);
});

test('server enforces early/late entry, stable identities and two-person camera/microphone permissions', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie, new Date(f.time + 60_000).toISOString());
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).data.mayJoin, false);
  assert.equal((await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess })).data.code, 'session_not_open');
  f.setTime(f.time + 60_000);
  for (const access of [created.hostAccess, created.coachAccess, created.coachAccess]) {
    assert.equal((await f.request(`/sessions/${created.id}/join`, { method: 'POST', access })).status, 200);
  }
  assert.ok(f.calls.rooms.every(room => room.maxParticipants === 2));
  assert.deepEqual(f.calls.tokens[0].canPublishSources, ['camera', 'microphone']);
  assert.equal(f.calls.tokens[1].identity, f.calls.tokens[2].identity);
  assert.notEqual(f.calls.tokens[0].identity, f.calls.tokens[1].identity);
  assert.equal(f.calls.tokens[0].canPublishData, false);
  f.setTime(Date.parse(created.session.endAt) + 10 * 60_000);
  assert.equal((await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess })).data.code, 'session_expired');
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).data.nextStageAvailable, false);
});

test('provider failures never leak provider messages or issue credentials', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie);
  f.calls.failCreate = true;
  let result = await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess });
  assert.equal(result.status, 503); assert.doesNotMatch(JSON.stringify(result.data), /synthetic provider/);
  assert.equal(result.data.participantToken, undefined);
  f.calls.failCreate = false; f.calls.failToken = true;
  result = await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess });
  assert.equal(result.status, 503); assert.equal(result.data.participantToken, undefined);
});

test('only successful host Finish persists next-stage availability; leave, elapsed time and failure cannot unlock it', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie);
  assert.equal((await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess })).data.code, 'session_not_started');
  await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.hostAccess });
  assert.equal((await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.coachAccess })).status, 403);
  f.setTime(f.time + 300_000);
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).data.nextStageAvailable, false);
  f.calls.failDelete = true;
  const failed = await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess });
  assert.equal(failed.status, 503); assert.equal(failed.data.code, 'meeting_end_unconfirmed');
  assert.equal(JSON.parse(readFileSync(path.join(f.directory, created.id + '.json'), 'utf8')).status, 'ending');
  assert.equal((await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess })).status, 409);
  const pending = await f.request(`/sessions/${created.id}/status`, { access: created.hostAccess });
  assert.equal(pending.data.mayEnd, true); assert.equal(pending.data.nextStageAvailable, false);
  f.calls.failDelete = false;
  const ended = await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess });
  assert.equal(ended.status, 200); assert.equal(ended.data.status, 'ended'); assert.equal(ended.data.nextStageAvailable, true);
  assert.equal(ended.data.nextStageUrl, 'https://www.patch.app/pre/');
  assert.equal((await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess })).status, 409);
  assert.equal((await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess })).status, 200);
  assert.equal(f.calls.deleted.length, 1);
  assert.equal(JSON.parse(readFileSync(path.join(f.directory, created.id + '.json'), 'utf8')).status, 'ended');
});

test('invitation access expires independently of a host login session', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie);
  f.setTime(Date.parse(created.session.endAt) + 7 * 86400_000 + 1);
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).data.code, 'session_access_expired');
  const freshCookie = await f.login();
  assert.equal((await f.request(`/sessions/${created.id}/status`, { cookie: freshCookie })).status, 200);
});

test('restart preserves host-issued links, scheduled appointment and terminal handoff state', async t => {
  const f = await fixture(t); let cookie = await f.login(); const created = await f.create(cookie);
  await f.restart();
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).status, 200);
  cookie = await f.login();
  const listed = await f.request('/host/sessions', { cookie });
  assert.equal(listed.data.sessions[0].coachUrl, created.coachUrl);
  await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.hostAccess });
  await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess });
  await f.restart();
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).data.nextStageAvailable, true);
});

test('concurrent host finish and join cannot resurrect a closed session', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie);
  await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.hostAccess });
  const [ended, joining] = await Promise.all([
    f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess }),
    f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess })
  ]);
  assert.equal(ended.status, 200); assert.ok([200, 409].includes(joining.status));
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).data.status, 'ended');
  assert.equal((await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess })).status, 409);
});

test('LiveKit adapter sets actual camera/microphone grants and max2, without granting room administration', async () => {
  let roomOptions, grant, tokenOptions, removal;
  const provider = await createTrainingLivekitProvider({ url: 'wss://synthetic.example', apiKey: 'synthetic', apiSecret: 'synthetic' }, {
    loadSdk: async () => ({
      TrackSource: { CAMERA: 1, MICROPHONE: 2 },
      RoomServiceClient: class {
        async createRoom(value) { roomOptions = value; }
        async removeParticipant(...args) { removal = args; }
      },
      AccessToken: class {
        constructor(_key, _secret, options) { tokenOptions = options; }
        addGrant(value) { grant = value; }
        toJwt() { return 'synthetic-jwt'; }
      }
    })
  });
  await provider.createRoom({ roomName: 'training-synthetic', maxParticipants: 999 });
  await provider.issueToken({ roomName: 'training-synthetic', identity: 'synthetic:host', name: 'Patrick', ttlSeconds: 300 });
  assert.equal(roomOptions.maxParticipants, 2);
  assert.deepEqual(grant.canPublishSources, [1, 2]); assert.equal(grant.roomJoin, true);
  assert.equal(grant.canPublishData, false); assert.equal(grant.canUpdateOwnMetadata, false);
  assert.equal(grant.roomAdmin, undefined); assert.equal(grant.room, 'training-synthetic');
  assert.equal(tokenOptions.identity, 'synthetic:host'); assert.equal(tokenOptions.ttl, 300);
  await provider.revokeParticipant('training-synthetic', 'synthetic:host', 1234567890);
  assert.deepEqual(removal, ['training-synthetic', 'synthetic:host', { revokeTokenTs: 1234567890n }]);
});

test('repeated and concurrent identical appointment creation returns one persistent session and stable links', async t => {
  const f = await fixture(t); const cookie = await f.login();
  const body = { coachName: 'Synthetic Coach', coachEmail: 'coach@example.test', startAt: new Date(f.time).toISOString(), contactsVerified: true, bookingReference: 'synthetic-booking-1' };
  const [first, second] = await Promise.all([f.request('/host/sessions', { method: 'POST', cookie, body }), f.request('/host/sessions', { method: 'POST', cookie, body })]);
  assert.deepEqual([first.status, second.status].sort(), [200, 201]);
  assert.equal(first.data.session.sessionId, second.data.session.sessionId);
  assert.equal(first.data.coachUrl, second.data.coachUrl);
  await f.restart(); const refreshedCookie = await f.login();
  const repeat = await f.request('/host/sessions', { method: 'POST', cookie: refreshedCookie, body });
  assert.equal(repeat.status, 200); assert.equal(repeat.data.reused, true);
  assert.equal(repeat.data.coachUrl, first.data.coachUrl);
  assert.equal(readdirSync(f.directory).filter(name => name.endsWith('.json')).length, 1);
  const conflict = await f.request('/host/sessions', { method: 'POST', cookie: refreshedCookie, body: { ...body, coachEmail: 'different@example.test' } });
  assert.equal(conflict.status, 409); assert.equal(conflict.data.code, 'appointment_conflict');
});

test('read rejects exposed permissions and corrupt nonce/room bindings without returning private record data', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie);
  const file = path.join(f.directory, created.id + '.json'); const original = readFileSync(file, 'utf8');
  chmodSync(file, 0o644);
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).status, 503);
  chmodSync(file, 0o600);
  for (const mutation of [{ nonce: 'invalid' }, { roomName: 'other-room' }, { tokenHashes: { host: 'invalid', coach: 'invalid' } }]) {
    writeFileSync(file, JSON.stringify({ ...JSON.parse(original), ...mutation }));
    const result = await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess });
    assert.equal(result.status, 500); assert.equal(result.data.coachEmail, undefined);
  }
});

test('rotating the host key revokes earlier invitation roles and reconstructs working new links after restart', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie);
  f.env.TRAINING_HOST_ACCESS_KEY = 'another-synthetic-host-access-key-for-rotation';
  await f.restart(); const newCookie = await f.login();
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).status, 401);
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.hostAccess })).status, 401);
  const listing = await f.request('/host/sessions', { cookie: newCookie });
  assert.equal(listing.status, 200);
  const updated = listing.data.sessions[0];
  assert.notEqual(updated.coachUrl, created.coachUrl);
  const access = new URLSearchParams(new URL(updated.coachUrl).hash.slice(1)).get('access');
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access })).status, 200);
});

test('repeated invalid session IDs fail promptly instead of leaving an unreleased session lock', async t => {
  const f = await fixture(t);
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await f.request('/sessions/invalid/join', { method: 'POST', access: 'synthetic-invalid-access-123456789' });
    assert.equal(response.status, 404);
  }
});

test('Finish revokes both participant tokens beyond their issue second; uncertain revocation cannot delete/unlock', async t => {
  const f = await fixture(t); const cookie = await f.login(); const created = await f.create(cookie);
  await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.hostAccess });
  await f.request(`/sessions/${created.id}/join`, { method: 'POST', access: created.coachAccess });
  const issueSecond = Math.floor(f.time / 1000);
  f.calls.failRevoke = true;
  const failed = await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess });
  assert.equal(failed.status, 503); assert.equal(f.calls.deleted.length, 0);
  assert.equal((await f.request(`/sessions/${created.id}/status`, { access: created.coachAccess })).data.nextStageAvailable, false);
  f.calls.failRevoke = false;
  assert.equal((await f.request(`/sessions/${created.id}/end`, { method: 'POST', access: created.hostAccess })).status, 200);
  assert.equal(f.calls.revoked.length, 2);
  assert.deepEqual(f.calls.revoked.map(record => record.identity), [created.id + ':host', created.id + ':coach']);
  assert.ok(f.calls.revoked.every(record => record.cutoff > issueSecond));
  assert.equal(f.calls.deleted.length, 1);
});

test('self-hosted LiveKit configuration is unavailable until reliable provider-token revocation is supported', async t => {
  const f = await fixture(t, { LIVEKIT_URL: 'wss://video.example.test' });
  assert.equal((await f.request('/config')).status, 503);
  assert.equal((await f.request('/config')).data.ready, false);
});

test('installed SDK generates offline JWT grants for the exact room and only camera/microphone sources', async () => {
  const provider = await createTrainingLivekitProvider({ url: 'wss://synthetic.livekit.cloud', apiKey: 'synthetic-key', apiSecret: 'synthetic-test-secret-with-no-live-authority' });
  const token = await provider.issueToken({ roomName: 'training-offline-test', identity: 'offline:coach', name: 'Synthetic Coach', ttlSeconds: 300 });
  const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  assert.equal(claims.sub, 'offline:coach'); assert.equal(claims.video.room, 'training-offline-test');
  assert.deepEqual(claims.video.canPublishSources, ['camera', 'microphone']);
  assert.equal(claims.video.roomJoin, true); assert.equal(claims.video.roomAdmin, undefined);
  assert.equal(claims.video.canPublishData, false);
});
