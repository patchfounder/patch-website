import express from 'express';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync, chmodSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const COOKIE = 'patch_training_host';
const HOST_SESSION_MS = 8 * 60 * 60_000;
const JOIN_GRACE_MS = 10 * 60_000;
const SESSION_SECONDS = 300;
const ID = /^[A-Za-z0-9_-]{24,64}$/;
const hash = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => timingSafeEqual(Buffer.from(hash(a), 'hex'), Buffer.from(hash(b), 'hex'));
const within = (child, parent) => child === parent || child.startsWith(parent + path.sep);

class MeetingError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
function failure(status, code, message) { throw new MeetingError(status, code, message); }
function webUrl(value, production, fallback) {
  try {
    const url = new URL(String(value || fallback));
    if (url.username || url.password || !['https:', ...(production ? [] : ['http:'])].includes(url.protocol)) return null;
    return url;
  } catch { return null; }
}
function cookieValue(req) {
  const pair = String(req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='));
  return pair?.slice(COOKIE.length + 1) || '';
}

export async function createTrainingLivekitProvider(config, { loadSdk = () => import('livekit-server-sdk') } = {}) {
  const library = await loadSdk();
  const client = new library.RoomServiceClient(config.url, config.apiKey, config.apiSecret);
  return {
    async createRoom({ roomName }) {
      try { await client.createRoom({ name: roomName, maxParticipants: 2, emptyTimeout: 300, departureTimeout: 60 }); }
      catch (error) {
        if (![6, 409].includes(Number(error?.status || error?.statusCode || error?.code)) && error?.code !== 'already_exists') throw error;
      }
    },
    async issueToken({ roomName, identity, name, ttlSeconds }) {
      const token = new library.AccessToken(config.apiKey, config.apiSecret, { identity, name, ttl: ttlSeconds });
      token.addGrant({ room: roomName, roomJoin: true, canPublish: true,
        canPublishSources: [library.TrackSource.CAMERA, library.TrackSource.MICROPHONE],
        canSubscribe: true, canPublishData: false, canUpdateOwnMetadata: false });
      return token.toJwt();
    },
    async deleteRoom(roomName) {
      try { await client.deleteRoom(roomName); }
      catch (error) {
        if (![5, 404].includes(Number(error?.status || error?.statusCode || error?.code)) && error?.code !== 'not_found') throw error;
      }
    },
    async revokeParticipant(roomName, identity, revokeTokenTs) {
      // With an explicit cutoff, LiveKit Cloud confirms revocation even after departure.
      // A failure is uncertain; do not swallow not_found or mark the session ended.
      await client.removeParticipant(roomName, identity, { revokeTokenTs: BigInt(revokeTokenTs) });
    }
  };
}

/** Separate training-room authority; never reads Patch accounts, Recruitment records or calendar files. */
export function createTrainingMeetingsRouter({ env = {}, projectRoot, livekitFactory = createTrainingLivekitProvider, now = Date.now } = {}) {
  const router = express.Router();
  const production = env.NODE_ENV === 'production';
  const root = path.resolve(projectRoot || path.join(import.meta.dirname, '..'));
  const publicUrl = webUrl(env.TRAINING_PUBLIC_ORIGIN, production, 'https://www.patch.app');
  const booking = webUrl(env.TRAINING_ACTIVATION_BOOKING_URL, true, 'https://cal.com/patchapp/activation');
  const lkUrl = webUrl(String(env.LIVEKIT_URL || '').replace(/^wss:/, 'https:').replace(/^ws:/, 'http:'), production, '');
  const hostKey = typeof env.TRAINING_HOST_ACCESS_KEY === 'string' ? env.TRAINING_HOST_ACCESS_KEY : '';
  const config = { url: String(env.LIVEKIT_URL || '').trim(), apiKey: String(env.LIVEKIT_API_KEY || '').trim(), apiSecret: String(env.LIVEKIT_API_SECRET || '').trim() };
  const cloudRevocation = Boolean(lkUrl && (lkUrl.hostname.endsWith('.livekit.cloud') || lkUrl.hostname.endsWith('.livekit.run')));
  let ready = Boolean(publicUrl && booking && lkUrl && ['wss:', 'https:', ...(production ? [] : ['ws:', 'http:'])].includes(new URL(config.url).protocol)
    && cloudRevocation && config.apiKey && config.apiSecret && hostKey.length >= 24 && hostKey.length <= 512);
  let directory = '';
  let storeInitialised = false;
  if (ready) {
    try {
      if (production && !env.TRAINING_DATA_DIR) throw new Error('private path required');
      const proposed = env.TRAINING_DATA_DIR || path.join(os.tmpdir(), 'patch-training-' + hash(root).slice(0, 12));
      if (!path.isAbsolute(proposed) || within(path.resolve(proposed), root)) throw new Error('private path required');
      if (existsSync(proposed) && lstatSync(proposed).isSymbolicLink()) throw new Error('private path required');
      let ancestor = path.resolve(proposed);
      const segments = [];
      while (!existsSync(ancestor)) { segments.unshift(path.basename(ancestor)); ancestor = path.dirname(ancestor); }
      directory = path.join(realpathSync(ancestor), ...segments);
      if (within(directory, realpathSync(root))) throw new Error('private path required');
    } catch { ready = false; directory = ''; }
  }
  const origin = publicUrl?.origin;
  const hostSessions = new Map();
  const attempts = new Map();
  const locks = new Map();
  let providerPromise;
  const provider = () => providerPromise ||= Promise.resolve(livekitFactory(config));
  const initialiseStore = () => {
    if (ready && !storeInitialised) {
      try {
        mkdirSync(directory, { recursive: true, mode: 0o700 });
        if (lstatSync(directory).isSymbolicLink() || (lstatSync(directory).mode & 0o777) !== 0o700) throw new Error('private directory required');
        const probe = path.join(directory, '.write-check-' + randomBytes(8).toString('hex'));
        writeFileSync(probe, '', { flag: 'wx', mode: 0o600 }); unlinkSync(probe);
        storeInitialised = true;
      } catch { ready = false; }
    }
  };
  const requireReady = () => { initialiseStore(); if (!ready) failure(503, 'training_unavailable', 'The live room is not available yet. Please contact Patrick.'); };
  const sameOrigin = req => { if (!origin || req.get('Origin') !== origin) failure(403, 'origin_required', 'Open this request from the Patch training page.'); };
  const requireHost = req => {
    const key = hash(cookieValue(req));
    const expiration = hostSessions.get(key);
    if (!expiration || expiration <= now()) { hostSessions.delete(key); failure(401, 'host_login_required', 'Please sign in as the host.'); }
    return 'host';
  };
  const filename = id => { if (!ID.test(id)) failure(404, 'session_not_found', 'This session could not be found.'); return path.join(directory, id + '.json'); };
  const read = id => {
    const file = filename(id);
    if (!existsSync(file)) failure(404, 'session_not_found', 'This session could not be found.');
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.size > 64 * 1024) failure(503, 'session_unavailable', 'This session is temporarily unavailable.');
    const session = JSON.parse(readFileSync(file, 'utf8'));
    if (session.schema !== 'patch-training-session-v1' || session.id !== id || !Number.isInteger(session.revision) || session.revision < 1
      || !/^[A-Za-z0-9_-]{43}$/.test(session.nonce) || session.roomName !== 'training-activation-' + id
      || !['scheduled', 'ending', 'ended', 'cancelled'].includes(session.status)
      || !['host', 'coach'].every(role => /^[a-f0-9]{64}$/.test(session.tokenHashes?.[role]))
      || !Number.isFinite(Date.parse(session.startAt)) || !Number.isFinite(Date.parse(session.endAt))
      || Date.parse(session.endAt) - Date.parse(session.startAt) !== SESSION_SECONDS * 1000
      || Date.parse(session.accessExpiresAt) !== Date.parse(session.endAt) + 7 * 86400_000) throw new Error('invalid private record');
    return session;
  };
  const write = (session, previousRevision) => {
    const file = filename(session.id);
    if (previousRevision === null ? existsSync(file) : read(session.id).revision !== previousRevision) failure(409, 'session_changed', 'The session changed. Please refresh it.');
    const temporary = path.join(directory, '.session-' + randomBytes(16).toString('hex'));
    writeFileSync(temporary, JSON.stringify(session) + '\n', { mode: 0o600, flag: 'wx' });
    try { renameSync(temporary, file); } finally { if (existsSync(temporary)) unlinkSync(temporary); }
    chmodSync(file, 0o600);
  };
  async function locked(id, work) {
    const lockPath = filename(id) + '.lock';
    const prior = locks.get(id) || Promise.resolve();
    let release;
    const current = new Promise(resolve => { release = resolve; });
    locks.set(id, current);
    await prior;
    let fd;
    try {
      try { fd = openSync(lockPath, 'wx', 0o600); }
      catch { failure(409, 'session_busy', 'The session is updating. Please try again.'); }
      return await work();
    } finally {
      if (fd !== undefined) { closeSync(fd); unlinkSync(lockPath); }
      release();
      if (locks.get(id) === current) locks.delete(id);
    }
  }
  const roleSecret = (session, role) => createHmac('sha256', hostKey).update(['patch-training-link-v1', session.id, session.nonce, role].join('\0')).digest('base64url');
  const links = session => Object.fromEntries(['host', 'coach'].map(role => {
    const link = new URL('/training/activation', origin);
    link.hash = new URLSearchParams({ session: session.id, access: roleSecret(session, role) }).toString();
    return [role + 'Url', link.toString()];
  }));
  const roleFor = (req, session) => {
    const authorization = String(req.get('Authorization') || '');
    if (authorization) {
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (token.length < 24 || token.length > 200) failure(401, 'invalid_session_access', 'Use your personal session invitation.');
      if (Date.parse(session.accessExpiresAt) <= now()) failure(401, 'session_access_expired', 'This invitation has expired. Please contact Patrick.');
      const digest = hash(token);
      // Re-derive under the current server key so rotating it revokes old links.
      for (const role of ['host', 'coach']) if (equal(digest, hash(roleSecret(session, role)))) return role;
      failure(401, 'invalid_session_access', 'Use your personal session invitation.');
    }
    return requireHost(req);
  };
  const status = (session, role) => {
    const currentTime = Number(now());
    const opens = Date.parse(session.startAt), closes = Date.parse(session.endAt) + JOIN_GRACE_MS;
    const terminal = session.status !== 'scheduled';
    return { sessionId: session.id, stage: 'activation', status: session.status, serverTime: new Date(currentTime).toISOString(),
      startAt: session.startAt, endAt: session.endAt, joinOpensAt: session.startAt, joinClosesAt: new Date(closes).toISOString(),
      role, coachName: session.coachName, hostName: 'Patrick', sessionDurationSeconds: SESSION_SECONDS,
      mayJoin: !terminal && currentTime >= opens && currentTime < closes,
      mayEnd: role === 'host' && ['scheduled', 'ending'].includes(session.status) && Boolean(session.roomCreatedAt),
      expired: !terminal && currentTime >= closes,
      nextStageAvailable: session.status === 'ended', nextStageUrl: 'https://www.patch.app/pre/' };
  };
  const route = work => (req, res, next) => Promise.resolve().then(() => { requireReady(); return work(req, res); }).catch(next);
  router.use((req, res, next) => {
    res.set({ 'Cache-Control': 'private, no-store', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    next();
  });
  router.use(express.json({ limit: '8kb' }));
  router.get('/config', (_req, res) => {
    initialiseStore();
    const proposed = Number(env.TRAINING_ACTIVATION_BOOKING_MINUTES || 30);
    const verified = env.TRAINING_ACTIVATION_BOOKING_DURATION_VERIFIED === 'true';
    const bookingDurationMinutes = verified && Number.isInteger(proposed) && proposed >= 1 && proposed <= 120 ? proposed : 30;
    res.status(ready ? 200 : 503).json({ ready, bookingUrl: booking?.toString() || 'https://cal.com/patchapp/activation',
      bookingDurationMinutes, sessionDurationSeconds: SESSION_SECONDS, webhookConnected: false,
      ...(!ready ? { message: 'The live room is not available yet. Please contact Patrick.' } : {}) });
  });
  router.post('/host/login', route((req, res) => {
    sameOrigin(req);
    const currentTime = Number(now());
    for (const [key, values] of attempts) {
      const recent = values.filter(time => time > currentTime - 15 * 60_000);
      if (recent.length) attempts.set(key, recent); else attempts.delete(key);
    }
    const address = String(req.socket.remoteAddress || 'unknown');
    const recent = attempts.get(address) || [];
    const total = [...attempts.values()].reduce((sum, values) => sum + values.length, 0);
    if (recent.length >= 10 || total >= 100) { res.set('Retry-After', '900'); failure(429, 'host_login_rate_limited', 'Too many attempts. Please try again later.'); }
    attempts.set(address, [...recent, currentTime]);
    const supplied = req.body?.accessKey;
    if (typeof supplied !== 'string' || supplied.length > 512 || !equal(supplied, hostKey)) failure(401, 'invalid_host_access', 'Incorrect host access key.');
    for (const [key, expiration] of hostSessions) if (expiration <= currentTime) hostSessions.delete(key);
    const token = randomBytes(32).toString('base64url');
    hostSessions.set(hash(token), currentTime + HOST_SESSION_MS);
    res.set('Set-Cookie', `${COOKIE}=${token}; Path=/api/training; HttpOnly; SameSite=Strict; Max-Age=${HOST_SESSION_MS / 1000}${production ? '; Secure' : ''}`);
    res.json({ ok: true, hostName: 'Patrick', expiresAt: new Date(currentTime + HOST_SESSION_MS).toISOString() });
  }));
  router.post('/host/logout', route((req, res) => {
    sameOrigin(req); hostSessions.delete(hash(cookieValue(req)));
    res.set('Set-Cookie', `${COOKIE}=; Path=/api/training; HttpOnly; SameSite=Strict; Max-Age=0${production ? '; Secure' : ''}`);
    res.json({ ok: true });
  }));
  router.get('/host/sessions', route((req, res) => {
    requireHost(req);
    const sessions = readdirSync(directory).filter(name => ID.test(name.replace(/\.json$/, '')) && name.endsWith('.json')).map(name => read(name.slice(0, -5)))
      .sort((a, b) => b.startAt.localeCompare(a.startAt))
      .map(session => ({ ...status(session, 'host'), coachEmail: session.coachEmail, bookingReference: session.bookingReference, ...links(session) }));
    res.json({ sessions });
  }));
  router.post('/host/sessions', route(async (req, res) => {
    sameOrigin(req); requireHost(req);
    const coachName = typeof req.body?.coachName === 'string' ? req.body.coachName.trim() : '';
    const coachEmail = typeof req.body?.coachEmail === 'string' ? req.body.coachEmail.trim().toLowerCase() : '';
    const rawStart = req.body?.startAt;
    const start = typeof rawStart === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(rawStart) ? Date.parse(rawStart) : NaN;
    const bookingReference = typeof req.body?.bookingReference === 'string' ? req.body.bookingReference.trim() : '';
    if (req.body?.contactsVerified !== true) failure(400, 'contacts_check_required', 'Check that this coach is saved in your contacts before arranging Activation.');
    if (!coachName || coachName.length > 100 || /[\r\n\u0000-\u001f]/.test(coachName) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(coachEmail)
      || coachEmail.length > 254 || !Number.isFinite(start) || bookingReference.length > 200) {
      failure(400, 'invalid_appointment', 'Enter the coach’s name, full email and a valid appointment time with its time zone.');
    }
    // Creating a private room record does not book Cal.com, email an invitation or verify Apple Contacts.
    return locked('training-session-create-global-lock', async () => {
    const startAt = new Date(start).toISOString();
    const existing = readdirSync(directory).filter(name => name.endsWith('.json') && ID.test(name.slice(0, -5))).map(name => read(name.slice(0, -5)))
      .find(session => (session.coachEmail === coachEmail && session.startAt === startAt) || (bookingReference && session.bookingReference === bookingReference));
    if (existing) {
      if (existing.coachEmail !== coachEmail || existing.coachName !== coachName || existing.startAt !== startAt || existing.bookingReference !== bookingReference) {
        failure(409, 'appointment_conflict', 'This appointment already exists with different details. Open the saved session instead.');
      }
      return res.json({ session: status(existing, 'host'), ...links(existing), reused: true });
    }
    if (start < now() - 5 * 60_000 || start > now() + 366 * 86400_000) failure(400, 'invalid_appointment', 'Choose a current or future appointment within the next year.');
    const session = { schema: 'patch-training-session-v1', revision: 1, id: randomBytes(24).toString('base64url'),
      nonce: randomBytes(32).toString('base64url'), stage: 'activation', status: 'scheduled', coachName, coachEmail,
      startAt: new Date(start).toISOString(), endAt: new Date(start + SESSION_SECONDS * 1000).toISOString(),
      accessExpiresAt: new Date(start + SESSION_SECONDS * 1000 + 7 * 86400_000).toISOString(),
      bookingReference, source: 'manual-host-entry', createdAt: new Date(now()).toISOString(), roomCreatedAt: null, endedAt: null };
    session.contactsCheck = { method: 'host-attested', at: new Date(now()).toISOString() };
    session.roomName = 'training-activation-' + session.id;
    session.tokenHashes = Object.fromEntries(['host', 'coach'].map(role => [role, hash(roleSecret(session, role))]));
    await locked(session.id, () => write(session, null));
    res.status(201).json({ session: status(session, 'host'), ...links(session) });
    });
  }));
  router.get('/sessions/:id/status', route((req, res) => {
    const session = read(req.params.id);
    res.json(status(session, roleFor(req, session)));
  }));
  router.post('/sessions/:id/join', route(async (req, res) => {
    sameOrigin(req);
    await locked(req.params.id, async () => {
      const session = read(req.params.id), role = roleFor(req, session), snapshot = status(session, role);
      if (session.status !== 'scheduled') failure(409, 'session_ended', 'This session has ended.');
      if (now() < Date.parse(session.startAt)) failure(403, 'session_not_open', 'Your session opens at its booked start time.');
      if (!snapshot.mayJoin) failure(409, 'session_expired', 'This session’s joining window has ended. Please contact Patrick.');
      let participantToken;
      try {
        const service = await provider();
        await service.createRoom({ roomName: session.roomName, maxParticipants: 2 });
        if (now() >= Date.parse(snapshot.joinClosesAt)) failure(409, 'session_expired', 'This session’s joining window has ended. Please contact Patrick.');
        participantToken = await service.issueToken({ roomName: session.roomName, identity: session.id + ':' + role,
          name: role === 'host' ? 'Patrick' : session.coachName,
          ttlSeconds: Math.max(1, Math.min(600, Math.ceil((Date.parse(snapshot.joinClosesAt) - now()) / 1000))),
          canPublishSources: ['camera', 'microphone'], canPublishData: false });
        if (typeof participantToken !== 'string' || !participantToken) throw new Error('missing token');
      } catch (error) {
        if (error instanceof MeetingError) throw error;
        failure(503, 'meeting_connection_unavailable', 'We could not connect the live room. Please try again.');
      }
      if (!session.roomCreatedAt) {
        const revision = session.revision; session.revision++; session.roomCreatedAt = new Date(now()).toISOString(); write(session, revision);
      }
      res.json({ serverUrl: config.url, participantToken, role, session: status(session, role) });
    });
  }));
  router.post('/sessions/:id/end', route(async (req, res) => {
    sameOrigin(req);
    await locked(req.params.id, async () => {
      const session = read(req.params.id), role = roleFor(req, session);
      if (role !== 'host') failure(403, 'host_required', 'Only Patrick can finish this session.');
      if (session.status === 'ended') return res.json(status(session, role));
      if (!session.roomCreatedAt || !['scheduled', 'ending'].includes(session.status)) failure(409, 'session_not_started', 'Join the session before finishing it.');
      if (session.status !== 'ending') {
        const revision = session.revision; session.revision++; session.status = 'ending'; write(session, revision);
      }
      try {
        const service = await provider();
        const cutoff = Math.ceil(now() / 1000) + 1;
        await service.revokeParticipant(session.roomName, session.id + ':host', cutoff);
        await service.revokeParticipant(session.roomName, session.id + ':coach', cutoff);
        await service.deleteRoom(session.roomName);
      }
      catch { failure(503, 'meeting_end_unconfirmed', 'We could not confirm the session has ended. Please retry Finish.'); }
      const revision = session.revision;
      session.revision++; session.status = 'ended'; session.endedAt = new Date(now()).toISOString();
      write(session, revision);
      res.json(status(session, role));
    });
  }));
  router.use((error, _req, res, _next) => {
    const statusCode = error instanceof MeetingError ? error.status : error?.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(statusCode).json({ ok: false, code: error instanceof MeetingError ? error.code : 'training_request_failed',
      message: error instanceof MeetingError ? error.message : 'The training request could not be completed. Please try again.' });
  });
  return router;
}
