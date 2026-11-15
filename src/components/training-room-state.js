export const ACTIVATION_BOOKING_URL = 'https://cal.com/patchapp/activation';
export const MODULE_ONE_URL = 'https://www.patch.app/pre/';

const SESSION_ID = /^[a-zA-Z0-9_-]{8,128}$/;

export function safeBookingUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && ['cal.com', 'www.cal.com'].includes(url.hostname) && !url.username && !url.password && url.pathname.length > 1) return url.toString();
  } catch { /* A missing or unsafe configured URL uses the canonical booking page. */ }
  return ACTIVATION_BOOKING_URL;
}

export function acceptsSessionUpdate(current, incoming, sessionId) {
  if (!incoming || incoming.sessionId !== sessionId) return false;
  if (!current || current.sessionId !== incoming.sessionId) return true;
  if (['ended', 'cancelled'].includes(current.status) && incoming.status !== current.status) return false;
  if (current.status === 'ending' && incoming.status === 'scheduled') return false;
  const previous = Date.parse(current.serverTime);
  const next = Date.parse(incoming.serverTime);
  return !(Number.isFinite(previous) && Number.isFinite(next) && next < previous);
}

export function manageExpandedRoomFocus(dialog, root, document) {
  if (!dialog || !root) return () => {};
  const previousFocus = document.activeElement;
  const hidden = [];
  let branch = dialog;
  while (branch && branch !== root) {
    const parent = branch.parentElement;
    if (!parent) break;
    for (const sibling of parent.children) {
      if (sibling === branch) continue;
      hidden.push({ element: sibling, inert: sibling.hasAttribute('inert'), ariaHidden: sibling.getAttribute('aria-hidden') });
      sibling.setAttribute('inert', '');
      sibling.setAttribute('aria-hidden', 'true');
    }
    branch = parent;
  }
  const focusable = () => [...dialog.querySelectorAll('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].filter(element => !element.hidden && element.getClientRects().length > 0);
  const focusFirst = () => focusable()[0]?.focus();
  const keydown = event => {
    if (event.key !== 'Tab') return;
    const items = focusable();
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first.focus();
    }
  };
  const focusin = event => { if (!dialog.contains(event.target)) focusFirst(); };
  document.addEventListener('keydown', keydown);
  document.addEventListener('focusin', focusin);
  focusFirst();
  return () => {
    document.removeEventListener('keydown', keydown);
    document.removeEventListener('focusin', focusin);
    for (const { element, inert, ariaHidden } of hidden) {
      if (!inert) element.removeAttribute('inert');
      if (ariaHidden === null) element.removeAttribute('aria-hidden');
      else element.setAttribute('aria-hidden', ariaHidden);
    }
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  };
}

export function parseSessionFragment(fragment = '') {
  const values = new URLSearchParams(fragment.replace(/^#/, ''));
  const sessionId = values.get('session');
  if (!sessionId || !SESSION_ID.test(sessionId)) return null;
  return { sessionId, accessToken: values.get('access') || null };
}

export function readSessionAccess(location, storage, history) {
  const access = parseSessionFragment(location.hash);
  if (!access) return null;
  const key = `patch.training.activation.${access.sessionId}`;
  if (access.accessToken) {
    try { storage?.setItem(key, access.accessToken); } catch { /* Keep access in memory when storage is unavailable. */ }
    history?.replaceState(null, '', `${location.pathname}${location.search}#session=${encodeURIComponent(access.sessionId)}`);
  } else {
    try { access.accessToken = storage?.getItem(key) || null; } catch { /* A host cookie may still authorise this session. */ }
  }
  return access;
}

export function sessionPhase(session, nowMs = Date.now()) {
  if (!session) return 'unbooked';
  if (session.status === 'ended') return 'ended';
  if (session.status === 'ending') return 'ending';
  if (session.status === 'cancelled') return 'cancelled';
  const opens = Date.parse(session.joinOpensAt || session.startAt);
  const closes = Date.parse(session.joinClosesAt || session.endAt);
  if (!Number.isFinite(opens) || !Number.isFinite(closes)) return 'unavailable';
  if (nowMs < opens) return 'scheduled';
  if (nowMs > closes) return 'expired';
  return 'open';
}

export function countdown(seconds) {
  const total = Math.max(0, Math.ceil(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function callClock(session, nowMs = Date.now()) {
  if (!session) return null;
  const start = Date.parse(session.startAt);
  if (!Number.isFinite(start)) return null;
  if (nowMs < start) return { label: 'Starts in', value: countdown((start - nowMs) / 1000) };
  return { label: 'Since scheduled start', value: countdown((nowMs - start) / 1000) };
}

export function nextModuleAvailable(session) {
  return Boolean(session?.status === 'ended' && session?.nextStageAvailable === true && session?.nextStageUrl === MODULE_ONE_URL);
}

export function canJoinSession(session, nowMs) {
  return sessionPhase(session, nowMs) === 'open' && session?.mayJoin === true;
}

export function formatAppointment(session, timeZone) {
  if (!session?.startAt || !session?.endAt) return null;
  const start = new Date(session.startAt);
  const end = new Date(session.endAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return null;
  const date = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'long', timeZone }).format(start);
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone });
  const zone = new Intl.DateTimeFormat('en-GB', { timeZoneName: 'short', timeZone }).formatToParts(start).find(p => p.type === 'timeZoneName')?.value || timeZone;
  return `${date} · ${time.format(start)}–${time.format(end)} ${zone}`;
}
