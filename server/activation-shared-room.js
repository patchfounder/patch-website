import express from 'express';
import { createHash, randomBytes } from 'node:crypto';
import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getTrainingStage } from '../src/training-stages.js';

const ROOM_MS = 2 * 60 * 60_000;
const SEAT_GRACE_MS = 20_000;
const TOKEN_SECONDS = 120;
const queues = new Map();
const digest = value => createHash('sha256').update(value || '').digest('hex');
const random = () => randomBytes(32).toString('base64url');
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const cookie = (req, name) => String(req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(name + '='))?.slice(name.length + 1) || '';
class RoomError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const fail = (status, code, message) => { throw new RoomError(status, code, message); };

export async function createActivationSharedLivekitProvider(config, { loadSdk = () => import('livekit-server-sdk') } = {}) {
  const sdk = await loadSdk();
  const client = new sdk.RoomServiceClient(config.url, config.apiKey, config.apiSecret);
  return {
    async createRoom({ roomName }) {
      try { await client.createRoom({ name: roomName, maxParticipants: 2, emptyTimeout: 300, departureTimeout: 60 }); }
      catch (error) { if (![6, 409].includes(Number(error?.status || error?.statusCode || error?.code)) && error?.code !== 'already_exists') throw error; }
    },
    async listParticipants(roomName) {
      try { return await client.listParticipants(roomName); }
      catch (error) { if ([5, 404].includes(Number(error?.status || error?.statusCode || error?.code)) || error?.code === 'not_found') return []; throw error; }
    },
    async issueToken({ roomName, identity, name, ttlSeconds }) {
      const token = new sdk.AccessToken(config.apiKey, config.apiSecret, { identity, name, ttl: ttlSeconds });
      token.addGrant({ room: roomName, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false,
        canPublishSources: [sdk.TrackSource.CAMERA, sdk.TrackSource.MICROPHONE], canUpdateOwnMetadata: false });
      return token.toJwt();
    },
    async revokeParticipant(roomName, identity, cutoff) { await client.removeParticipant(roomName, identity, { revokeTokenTs: BigInt(cutoff) }); },
    async deleteRoom(roomName) {
      try { await client.deleteRoom(roomName); }
      catch (error) { if (![5, 404].includes(Number(error?.status || error?.statusCode || error?.code)) && error?.code !== 'not_found') throw error; }
    }
  };
}

/** One explicitly open module room. No account, calendar, registration or message data is read. */
export function createActivationSharedRoomRouter({ env = {}, projectRoot, livekitFactory = createActivationSharedLivekitProvider, now = Date.now, stageCode = 'activa' } = {}) {
  const stage = getTrainingStage(stageCode);
  if (!stage) throw new TypeError('Unknown training stage.');
  const HOST_COOKIE = `patch_${stage.id}_owner`;
  const COACH_COOKIE = `patch_${stage.id}_coach`;
  const COOKIE_PATH = stage.apiPath;
  const schema = `patch-${stage.id}-shared-v1`;
  const roomPrefix = `training-shared-${stage.id}-`;
  const router = express.Router();
  const production = env.NODE_ENV === 'production';
  const root = path.resolve(projectRoot || path.join(import.meta.dirname, '..'));
  const config = { url: String(env.LIVEKIT_URL || '').trim(), apiKey: String(env.LIVEKIT_API_KEY || '').trim(), apiSecret: String(env.LIVEKIT_API_SECRET || '').trim() };
  let origin, directory, ready = false;
  try {
    const publicUrl = new URL(env.TRAINING_PUBLIC_ORIGIN || 'https://www.patch.app');
    const providerUrl = new URL(config.url);
    if (publicUrl.username || publicUrl.password || !['https:', ...(production ? [] : ['http:'])].includes(publicUrl.protocol)
      || !['wss:', 'https:'].includes(providerUrl.protocol) || providerUrl.username || providerUrl.password
      || !['.livekit.cloud', '.livekit.run'].some(suffix => providerUrl.hostname.endsWith(suffix)) || !config.apiKey || !config.apiSecret) throw new Error('configuration');
    const proposed = env.TRAINING_DATA_DIR || (!production && path.join(os.tmpdir(), 'patch-training-' + digest(root).slice(0, 12)));
    if (!proposed || !path.isAbsolute(proposed) || within(path.resolve(proposed), root)) throw new Error('private path');
    let ancestor = path.resolve(proposed); const missing = [];
    while (!existsSync(ancestor)) { missing.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
    if (existsSync(proposed) && lstatSync(proposed).isSymbolicLink()) throw new Error('private path');
    directory = path.join(realpathSync(ancestor), ...missing);
    if (within(directory, realpathSync(root))) throw new Error('private path');
    origin = publicUrl.origin; ready = true;
  } catch { /* Unconfigured room does not break the rest of Website. */ }
  const file = directory && path.join(directory, `${stage.id}-shared-room.json`);
  let providerPromise;
  const provider = () => providerPromise ||= Promise.resolve(livekitFactory(config));
  const ensureReady = () => {
    if (ready) {
      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        if (lstatSync(directory).isSymbolicLink() || (lstatSync(directory).mode & 0o777) !== 0o700) throw new Error('private directory');
      } catch { ready = false; }
    }
    if (!ready) fail(503, 'training_unavailable', 'The video room is temporarily unavailable. Please try again shortly.');
  };
  const read = () => {
    if (!existsSync(file)) return { schema, revision: 0, currentId: null, rooms: [] };
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > 8 * 1024 * 1024) throw new Error('private record unavailable');
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (value.schema !== schema || !Number.isSafeInteger(value.revision) || !Array.isArray(value.rooms)
      || value.rooms.some(room => !/^[A-Za-z0-9_-]{43}$/.test(room.id) || room.roomName !== roomPrefix + room.id
        || !['opening', 'open', 'ending', 'ended', 'expired'].includes(room.status) || !/^[a-f0-9]{64}$/.test(room.ownerHash)
        || !Array.isArray(room.removedHashes) || !Array.isArray(room.completedHashes) || !Array.isArray(room.admittedHashes)
        || typeof room.hostIdentity !== 'string' || !room.hostIdentity.startsWith(room.id + ':host') || !Number.isFinite(Date.parse(room.startAt)))) throw new Error('private record invalid');
    return value;
  };
  const save = state => {
    if (read().revision !== state.revision) fail(409, 'room_changed', 'The room changed. Please refresh it.');
    state.revision++;
    const temporary = path.join(directory, '.shared-room-' + random());
    writeFileSync(temporary, JSON.stringify(state) + '\n', { mode: 0o600, flag: 'wx' });
    try { renameSync(temporary, file); chmodSync(file, 0o600); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
  };
  async function locked(work) {
    const before = queues.get(file) || Promise.resolve(); let release;
    const current = new Promise(resolve => { release = resolve; }); queues.set(file, current);
    await before;
    try { return await work(); } finally { release(); if (queues.get(file) === current) queues.delete(file); }
  }
  function setCookie(res, name, value) {
    res.append('Set-Cookie', `${name}=${value}; Path=${COOKIE_PATH}; HttpOnly; SameSite=Strict; Max-Age=2592000${production ? '; Secure' : ''}`);
  }
  const sameOrigin = req => { if (req.get('Origin') !== origin) fail(403, 'origin_required', 'Open this request from the Patch training page.'); };
  function requestCookie(req, name, value) {
    const other = String(req.headers.cookie || '').split(';').map(part => part.trim()).filter(part => part && !part.startsWith(name + '='));
    req.headers.cookie = [...other, `${name}=${value}`].join('; ');
  }
  const currentRoom = state => state.rooms.find(room => room.id === state.currentId) || null;
  const isOwner = (req, room) => Boolean(room && cookie(req, HOST_COOKIE) && digest(cookie(req, HOST_COOKIE)) === room.ownerHash);
  function target(req, state, owner = false) {
    const room = currentRoom(state);
    if (!room || req.body?.sessionId !== room.id) fail(409, 'room_changed', 'The room changed. Please refresh it.');
    if (owner && !isOwner(req, room)) fail(403, 'host_required', 'Only the host who opened this room can do that.');
    return room;
  }
  const revoke = async (service, room, identity) => service.revokeParticipant(room.roomName, identity, Math.ceil(now() / 1000) + 1);
  async function presence(state, room, { releaseSeat = true } = {}) {
    if (!room || !['opening', 'open', 'ending'].includes(room.status)) return { host: false, coach: false };
    const service = await provider();
    const participants = await service.listParticipants(room.roomName);
    if (!Array.isArray(participants)) throw new Error('presence unavailable');
    const host = participants.some(person => person.identity === room.hostIdentity);
    const coach = Boolean(room.coach && participants.some(person => person.identity === room.coach.identity));
    let changed = false;
    if (host && !room.hostWasPresent) { room.hostWasPresent = true; changed = true; }
    if (room.coach) {
      if (coach) {
        if (!room.coach.wasPresent || room.coach.lastSeenAt !== now()) { room.coach.wasPresent = true; room.coach.lastSeenAt = now();
          if (!room.admittedHashes.includes(room.coach.hash)) room.admittedHashes.push(room.coach.hash);
          changed = true; }
      } else if (releaseSeat && room.status === 'open' && now() - (room.coach.lastSeenAt || room.coach.reservedAt) > SEAT_GRACE_MS) {
        // Revoke the old identity before making its place available. A cached JWT cannot occupy the replacement seat.
        await revoke(service, room, room.coach.identity);
        room.coach = null; changed = true;
      }
    }
    if (changed) save(state);
    return { host, coach };
  }
  function snapshot(req, state, room, seen = { host: false, coach: false }) {
    const owner = isOwner(req, room), guestKey = cookie(req, COACH_COOKIE), guestHash = guestKey ? digest(guestKey) : '';
    const hasSeat = Boolean(room?.coach && guestHash === room.coach.hash);
    const removed = Boolean(room && guestHash && room.removedHashes.includes(guestHash));
    const status = room?.status === 'opening' ? 'open' : room?.status === 'expired' ? 'closed' : room?.status || 'closed';
    const open = room?.status === 'open' && now() < Date.parse(room.expiresAt);
    const nextStageAvailable = Boolean(stage.handoffUrl && !removed && guestHash && state.rooms.some(previous => previous.status === 'ended' && previous.completedHashes.includes(guestHash)));
    return { ready, revision: state.revision, sessionId: room?.id || null, role: owner ? 'host' : 'coach', status,
      hostPresent: seen.host, coachPresent: seen.coach, coachId: owner ? room?.coach?.identity || null : null, busy: Boolean(open && room.coach && !hasSeat && !owner), removed,
      hasSeat, mayJoin: Boolean(open && seen.host && !owner && !removed && (!room.coach || hasSeat)),
      mayGo: Boolean(!room || ['ended', 'expired'].includes(room.status) || (owner && ['opening', 'open'].includes(room.status))),
      mayRemove: Boolean(owner && room.coach && ['open', 'ending'].includes(room.status)),
      mayEnd: Boolean(owner && ['opening', 'open', 'ending'].includes(room.status)),
      startAt: room?.startAt || null, endAt: room ? new Date(Date.parse(room.startAt) + 300_000).toISOString() : null,
      expiresAt: room?.expiresAt || null, serverTime: new Date(now()).toISOString(),
      nextStageAvailable, nextStageUrl: nextStageAvailable ? stage.handoffUrl : null };
  }
  async function close(state, room, complete) {
    if (['ended', 'expired'].includes(room.status)) return;
    if (room.status !== 'ending') { room.status = 'ending'; save(state); }
    const service = await provider();
    // Confirm both participant revocations before closing. Partial failure leaves an explicitly recoverable ending state.
    await revoke(service, room, room.hostIdentity);
    if (room.coach) await revoke(service, room, room.coach.identity);
    await service.deleteRoom(room.roomName);
    if (complete && room.hostWasPresent) room.completedHashes = room.admittedHashes.filter(value => !room.removedHashes.includes(value));
    room.status = complete ? 'ended' : 'expired'; room.endedAt = new Date(now()).toISOString(); save(state);
  }
  async function expire(state, room) {
    if (room && ['opening', 'open', 'ending'].includes(room.status) && now() >= Date.parse(room.expiresAt)) await close(state, room, false);
  }
  async function token(service, room, role) {
    const identity = role === 'host' ? room.hostIdentity : room.coach.identity;
    const participantToken = await service.issueToken({ roomName: room.roomName, identity, name: role === 'host' ? 'Patrick' : 'Coach', ttlSeconds: TOKEN_SECONDS });
    if (typeof participantToken !== 'string' || !participantToken) throw new Error('token unavailable');
    return { serverUrl: config.url, participantToken, identity, role };
  }
  const route = work => async (req, res, next) => { try { ensureReady(); await locked(() => work(req, res)); } catch (error) { next(error); } };
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  router.use(express.json({ limit: '4kb' }));
  router.get('/status', route(async (req, res) => {
    const state = read(), room = currentRoom(state); await expire(state, room);
    const seen = await presence(state, room);
    res.json(snapshot(req, state, room, seen));
  }));
  router.post('/go', route(async (req, res) => {
    sameOrigin(req);
    const state = read(); let room = currentRoom(state); await expire(state, room);
    if (room && ['opening', 'open', 'ending'].includes(room.status) && !isOwner(req, room)) fail(409, 'host_already_open', `The ${stage.title} room is already open in another host browser.`);
    if (room?.status === 'ending') fail(409, 'room_ending', 'Finish closing this room before opening the next one.');
    const service = await provider();
    if (!room || ['ended', 'expired'].includes(room.status)) {
      const ownerKey = random();
      room = { id: random(), status: 'opening', ownerHash: digest(ownerKey), startAt: new Date(now()).toISOString(),
        expiresAt: new Date(now() + ROOM_MS).toISOString(), coach: null, hostWasPresent: false, removedHashes: [], admittedHashes: [], completedHashes: [] };
      room.roomName = roomPrefix + room.id;
      room.hostIdentity = room.id + ':host';
      state.rooms.push(room); state.currentId = room.id; save(state);
      setCookie(res, HOST_COOKIE, ownerKey);
      // Use the new owner for the status in this response, before the browser receives its cookie.
      requestCookie(req, HOST_COOKIE, ownerKey);
    }
    await service.createRoom({ roomName: room.roomName, maxParticipants: 2 });
    const credentials = await token(service, room, 'host');
    if (room.status !== 'open') { room.status = 'open'; save(state); }
    res.json({ ...credentials, session: snapshot(req, state, room, await presence(state, room)) });
  }));
  router.post('/join', route(async (req, res) => {
    sameOrigin(req); const state = read(), room = target(req, state); await expire(state, room);
    const seen = await presence(state, room);
    if (room.status !== 'open' || !seen.host) fail(409, 'host_not_ready', 'Patrick has not opened the call yet. Please wait here.');
    if (isOwner(req, room)) fail(409, 'host_uses_go', 'Use Go to join as Patrick.');
    let key = cookie(req, COACH_COOKIE); const keyHash = key ? digest(key) : '';
    if (keyHash && room.removedHashes.includes(keyHash)) fail(403, 'removed', 'Patrick has removed you from this call. Please wait for your next session.');
    if (room.coach && room.coach.hash !== keyHash) fail(409, 'room_busy', 'Call in progress—please wait.');
    if (!room.coach) {
      key ||= random();
      room.coach = { hash: digest(key), identity: room.id + ':coach:' + random().slice(0, 16), reservedAt: now(), lastSeenAt: null, wasPresent: false };
      save(state); setCookie(res, COACH_COOKIE, key);
      requestCookie(req, COACH_COOKIE, key);
    }
    const credentials = await token(await provider(), room, 'coach');
    res.json({ ...credentials, session: snapshot(req, state, room, seen) });
  }));
  router.post('/remove', route(async (req, res) => {
    sameOrigin(req); const state = read(), room = target(req, state, true);
    if (!['open', 'ending'].includes(room.status)) fail(409, 'room_closed', 'This room has already closed.');
    if (room.coach) {
      if (req.body?.coachId !== room.coach.identity) fail(409, 'coach_changed', 'The coach in this room changed. Please refresh before using Remove.');
      await revoke(await provider(), room, room.coach.identity);
      room.removedHashes.push(room.coach.hash); room.coach = null; save(state);
    }
    res.json(snapshot(req, state, room, await presence(state, room)));
  }));
  router.post('/leave', route(async (req, res) => {
    sameOrigin(req); const state = read(), room = target(req, state);
    if (['open', 'opening'].includes(room.status)) {
      const service = await provider();
      if (isOwner(req, room)) {
        await revoke(service, room, room.hostIdentity);
        room.hostIdentity = room.id + ':host:' + random().slice(0, 16); save(state);
      }
      else if (room.coach && cookie(req, COACH_COOKIE) && digest(cookie(req, COACH_COOKIE)) === room.coach.hash) {
        await revoke(service, room, room.coach.identity); room.coach = null; save(state);
      }
    }
    res.json(snapshot(req, state, room, await presence(state, room)));
  }));
  router.post('/end', route(async (req, res) => {
    sameOrigin(req); const state = read(), room = target(req, state, true);
    if (room.status !== 'ended') { await presence(state, room, { releaseSeat: false }); await close(state, room, true); }
    res.json(snapshot(req, state, room));
  }));
  router.use((error, _req, res, _next) => {
    const status = error instanceof RoomError ? error.status : error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 503;
    res.status(status).json({ ready: false, code: error instanceof RoomError ? error.code : 'meeting_unavailable',
      message: error instanceof RoomError ? error.message : 'The video room could not be updated. Please try again.' });
  });
  return router;
}
