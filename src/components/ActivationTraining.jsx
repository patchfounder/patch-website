import { useEffect, useRef, useState } from 'react';
import { ACTIVATION_BOOKING_URL, MODULE_ONE_URL, safeBookingUrl } from './training-room-state.js';
import { acceptsSharedRoomUpdate, sharedRoomClock, sharedRoomMessage, sharedRoomNextStage } from './activation-shared-room-state.js';
import './ActivationTraining.css';

const VIDEO_URL = 'https://www.youtube-nocookie.com/embed/KLXFHB4zVMI?rel=0';
const VIDEO_PAGE_URL = 'https://www.youtube.com/watch?v=KLXFHB4zVMI';
const MANUAL_URL = 'https://www.patch.app/training/patch-call-process.pdf';
const API = '/api/training/activation-room';
const FALLBACK_CONFIG = { bookingUrl: ACTIVATION_BOOKING_URL, bookingDurationMinutes: 30 };

async function roomRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer',
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || 'Please try again in a moment.');
    error.code = body.code; error.status = response.status;
    throw error;
  }
  return body;
}

function messageForError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Please allow your camera and microphone, then try again.';
  if (error?.name === 'NotFoundError') return 'We couldn’t find a camera or microphone. Please check your device and try again.';
  if (error?.status === 503) return 'The video room is temporarily unavailable. Please try again shortly.';
  if (error?.status === 409) return error.message || 'The room is busy. Please wait a moment and try again.';
  return error?.message || 'We couldn’t connect just now. Please check your connection and try again.';
}

export default function ActivationTraining({ host = false }) {
  const [config, setConfig] = useState(FALLBACK_CONFIG);
  const [session, setSession] = useState(null);
  const [connection, setConnection] = useState('idle');
  const [remotePresent, setRemotePresent] = useState(false);
  const [needsAudio, setNeedsAudio] = useState(false);
  const [error, setError] = useState('');
  const [busyAction, setBusyAction] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const roomRef = useRef(null);
  const sessionRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const intentionalLeave = useRef(false);
  const mounted = useRef(true);
  const joinGeneration = useRef(0);
  const joinPending = useRef(false);
  const pollPending = useRef(false);
  const actionPending = useRef(false);

  function disconnectMedia(nextConnection = 'idle') {
    joinGeneration.current += 1;
    joinPending.current = false;
    intentionalLeave.current = true;
    const room = roomRef.current;
    roomRef.current = null;
    room?.disconnect();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (mounted.current) {
      setConnection(nextConnection); setRemotePresent(false); setNeedsAudio(false);
    }
  }

  function applySession(value) {
    if (!mounted.current || !acceptsSharedRoomUpdate(sessionRef.current, value)) return false;
    const previous = sessionRef.current;
    if (value.serverTime && Number.isFinite(Date.parse(value.serverTime))) setOffset(Date.parse(value.serverTime) - Date.now());
    sessionRef.current = value;
    setSession(value);
    if (value.removed || ['ending', 'ended', 'closed'].includes(value.status)
      || (previous?.sessionId && previous.sessionId !== value.sessionId)) disconnectMedia();
    return true;
  }

  async function refreshSession({ showError = false } = {}) {
    if (pollPending.current || joinPending.current || actionPending.current) return;
    pollPending.current = true;
    try {
      const value = await roomRequest('/status');
      applySession(value);
      if (showError && mounted.current) setError('');
    } catch (cause) {
      if (mounted.current && (showError || !sessionRef.current)) setError(messageForError(cause));
    } finally { pollPending.current = false; }
  }

  useEffect(() => {
    mounted.current = true;
    const previousTitle = document.title;
    document.title = host ? 'Host Activation | Patch Academy' : 'Activation | Patch Academy';
    refreshSession({ showError: true });
    fetch('/api/training/config', { credentials: 'same-origin', cache: 'no-store' })
      .then(response => response.ok ? response.json() : null)
      .then(value => { if (value && mounted.current) setConfig({ ...FALLBACK_CONFIG, ...value }); })
      .catch(() => {});
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const statusTick = window.setInterval(() => { if (document.visibilityState !== 'hidden') refreshSession(); }, 3000);
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSession(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      disconnectMedia();
      window.clearInterval(tick); window.clearInterval(statusTick);
      document.removeEventListener('visibilitychange', onVisible);
      document.title = previousTitle;
    };
  }, [host]);

  function attachLocal(room, sdk) {
    const publication = room.localParticipant.getTrackPublication(sdk.Track.Source.Camera);
    if (publication?.track && localVideoRef.current) publication.track.attach(localVideoRef.current);
  }

  async function join() {
    if (joinPending.current || actionPending.current || ['joining', 'connected', 'reconnecting'].includes(connection)) return;
    if (!sessionRef.current?.ready || !(host ? sessionRef.current.mayGo : sessionRef.current.mayJoin)) return;
    joinPending.current = true;
    const generation = ++joinGeneration.current;
    let joinedSessionId = null;
    const stillCurrent = () => mounted.current && generation === joinGeneration.current
      && (!joinedSessionId || joinedSessionId === sessionRef.current?.sessionId)
      && !sessionRef.current?.removed && !['ending', 'ended'].includes(sessionRef.current?.status);
    setError(''); setConnection('joining'); intentionalLeave.current = false;
    let room;
    let admitted = false;
    try {
      const joined = await roomRequest(host ? '/go' : '/join', { method: 'POST', body: JSON.stringify(host ? {} : { sessionId: sessionRef.current.sessionId }) });
      if (!mounted.current || generation !== joinGeneration.current) return;
      if (joined.role !== (host ? 'host' : 'coach') || joined.session?.role !== joined.role
        || !joined.session?.sessionId || typeof joined.serverUrl !== 'string' || typeof joined.participantToken !== 'string') throw new Error('The room could not be opened. Please try again.');
      joinedSessionId = joined.session.sessionId;
      admitted = true;
      // A new Go replaces the last finished room without cancelling this explicit join.
      sessionRef.current = null;
      applySession(joined.session);
      if (!stillCurrent()) return;
      const sdk = await import('livekit-client');
      if (!stillCurrent()) return;
      room = new sdk.Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { facingMode: 'user', resolution: { width: 1280, height: 720, frameRate: 24 } } });
      roomRef.current?.disconnect(); roomRef.current = room;
      const syncRemote = () => { if (stillCurrent() && roomRef.current === room) setRemotePresent(room.remoteParticipants.size > 0); };
      room.on(sdk.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (!stillCurrent() || roomRef.current !== room || room.remoteParticipants.size > 1 || participant.identity === room.localParticipant.identity) return;
        if (track.kind === sdk.Track.Kind.Video && remoteVideoRef.current) track.attach(remoteVideoRef.current);
        if (track.kind === sdk.Track.Kind.Audio && remoteAudioRef.current) track.attach(remoteAudioRef.current);
        syncRemote();
      });
      room.on(sdk.RoomEvent.TrackUnsubscribed, track => track.detach());
      room.on(sdk.RoomEvent.ParticipantConnected, syncRemote);
      room.on(sdk.RoomEvent.ParticipantDisconnected, syncRemote);
      room.on(sdk.RoomEvent.Reconnecting, () => { if (stillCurrent() && roomRef.current === room) setConnection('reconnecting'); });
      room.on(sdk.RoomEvent.Reconnected, () => { if (stillCurrent() && roomRef.current === room) { setConnection('connected'); syncRemote(); } });
      room.on(sdk.RoomEvent.AudioPlaybackStatusChanged, () => { if (stillCurrent() && roomRef.current === room) setNeedsAudio(!room.canPlaybackAudio); });
      room.on(sdk.RoomEvent.LocalTrackPublished, () => { if (stillCurrent() && roomRef.current === room) attachLocal(room, sdk); });
      room.on(sdk.RoomEvent.Disconnected, () => {
        if (!mounted.current || roomRef.current !== room) return;
        setConnection(intentionalLeave.current ? 'left' : 'disconnected'); setRemotePresent(false); setNeedsAudio(false);
        refreshSession();
      });
      await room.connect(joined.serverUrl, joined.participantToken);
      if (!stillCurrent()) { await room.disconnect(); return; }
      await room.startAudio().catch(() => { if (stillCurrent() && roomRef.current === room) setNeedsAudio(true); });
      if (!stillCurrent()) { await room.disconnect(); return; }
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!stillCurrent()) { await room.disconnect(); return; }
      await room.localParticipant.setCameraEnabled(true);
      if (!stillCurrent()) { await room.disconnect(); return; }
      attachLocal(room, sdk); syncRemote();
      setConnection('connected');
      refreshSession();
    } catch (cause) {
      intentionalLeave.current = true;
      if (roomRef.current === room) roomRef.current = null;
      await room?.disconnect();
      if (admitted && mounted.current && generation === joinGeneration.current) {
        setConnection('idle'); setError(messageForError(cause));
        await roomRequest('/leave', { method: 'POST', body: JSON.stringify({ sessionId: joinedSessionId }) }).then(applySession).catch(() => {});
      }
      if (mounted.current && generation === joinGeneration.current) { setConnection('idle'); setError(messageForError(cause)); }
    } finally {
      if (generation === joinGeneration.current) joinPending.current = false;
    }
  }

  async function leave() {
    if (host) {
      if (sessionRef.current?.mayEnd) await roomAction('/end');
      return;
    }
    if (actionPending.current || joinPending.current) return;
    const sessionId = sessionRef.current?.sessionId;
    actionPending.current = true;
    setBusyAction('/leave'); setError('');
    disconnectMedia('left');
    try {
      if (sessionId) applySession(await roomRequest('/leave', { method: 'POST', body: JSON.stringify({ sessionId }) }));
    }
    catch (cause) { if (mounted.current) setError(messageForError(cause)); }
    finally { actionPending.current = false; if (mounted.current) setBusyAction(null); }
  }

  async function roomAction(path) {
    if (!host || actionPending.current || joinPending.current) return;
    actionPending.current = true; setBusyAction(path); setError('');
    try {
      const value = await roomRequest(path, { method: 'POST', body: JSON.stringify({ sessionId: sessionRef.current?.sessionId, ...(path === '/remove' ? { coachId: sessionRef.current?.coachId } : {}) }) });
      applySession(value);
      if (path === '/remove') setRemotePresent(false);
    } catch (cause) { if (mounted.current) setError(path === '/end' ? 'We couldn’t confirm that the call closed. Please try Leave again.' : messageForError(cause)); }
    finally { actionPending.current = false; if (mounted.current) setBusyAction(null); }
  }

  const connected = connection === 'connected' || connection === 'reconnecting';
  const joining = connection === 'joining';
  const clock = sharedRoomClock(session, now + offset);
  const { title: roomTitle, copy: roomCopy } = sharedRoomMessage(session, { host, connection, remotePresent });
  const otherName = host ? 'your coach' : 'Patrick';
  const showNext = sharedRoomNextStage(session);
  const bookingUrl = safeBookingUrl(config.bookingUrl);
  const mayEnter = session?.ready && (host ? session.mayGo : session.mayJoin && !showNext);

  return (
    <div className="activation-training-page">
      <header className="activation-training-header">
        <div className="activation-training-brand"><img src="/patch-logo-2.png" width="96" height="42" alt="Patch" /><span className="activation-training-brand-caption">Academy</span></div>
        <span className="activation-training-stage">Step 1 of 6</span>
      </header>
      <main className="activation-training-shell">
        <header className="activation-training-intro">
          <p className="activation-training-eyebrow">Patch Academy · Activation</p>
          <h1>A confident first call.</h1>
          <p>Get to know the Patch Call in 7 Steps, then meet Patrick for a short one-to-one check-in. Bring your questions. We’re here to help you get started.</p>
          <div className="activation-training-progress" aria-label="Activation is the first of six training stages"><span /><span /><span /><span /><span /><span /></div>
        </header>

        <section className="activation-training-section" aria-labelledby="activation-watch-title">
          <div className="activation-training-section-heading"><span>01</span><div><p className="activation-training-eyebrow">Before we meet</p><h2 id="activation-watch-title">Watch the seven steps</h2></div></div>
          <div className="activation-training-video"><iframe src={VIDEO_URL} title="How to Deliver a Patch Call in 7 Steps" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
          <a className="activation-training-resource" href={VIDEO_PAGE_URL} target="_blank" rel="noopener noreferrer">{VIDEO_PAGE_URL}</a>
        </section>

        <section className="activation-training-section activation-training-manual" aria-labelledby="activation-script-title">
          <div className="activation-training-section-heading"><span>02</span><div><p className="activation-training-eyebrow">Keep it handy</p><h2 id="activation-script-title">Your call script</h2></div></div>
          <p>The step-by-step Patch Call Process is here whenever you need it. Read it alongside the video, and note anything you’d like to ask Patrick.</p>
          <a className="activation-training-resource activation-training-download" href={MANUAL_URL} download="Patch Call Process.pdf">{MANUAL_URL}</a>
          <p className="activation-training-small">PDF · 1 page · You can download it to your phone.</p>
        </section>

        <section className="activation-training-section" aria-labelledby="activation-call-title">
          <div className="activation-training-section-heading"><span>03</span><div><p className="activation-training-eyebrow">Meet Patrick</p><h2 id="activation-call-title">A little conversation. A clear next step.</h2></div></div>
          <p>We’ll answer your questions and make sure you feel ready to deliver your first Patch Call.</p>
          <div className="activation-training-room" aria-label="Activation video call">
            <div className={`activation-training-stage-video${connected ? ' is-connected' : ''}`}>
              {clock && <span className="activation-training-timer" aria-label={`Call duration ${clock}`}>{clock}</span>}
              <video ref={remoteVideoRef} className="activation-training-remote-video" autoPlay playsInline aria-label={`${otherName}’s video`} />
              {(!connected || !remotePresent) && <div className="activation-training-room-placeholder">
                <span className="activation-training-monogram" aria-hidden="true">P</span>
                <h3>{roomTitle}</h3>
                <p>{roomCopy}</p>
              </div>}
              <div className={`activation-training-self${connected ? ' is-visible' : ''}`}><video ref={localVideoRef} autoPlay playsInline muted aria-label="Your video preview" /></div>
            </div>
            <audio ref={remoteAudioRef} autoPlay />
            <div className="activation-training-room-bottom">
              {error && <p className="activation-training-error" role="alert">{error}</p>}
              {(connected || host || mayEnter) && <div className="activation-training-controls">
                {!connected && (host || mayEnter) && <button type="button" className="activation-training-join" onClick={join} disabled={!mayEnter || joining || Boolean(busyAction)}>{joining ? 'Connecting…' : host ? 'Go' : 'Enter'}</button>}
                {host && session?.mayRemove && <button type="button" className="activation-training-remove" onClick={() => roomAction('/remove')} disabled={Boolean(busyAction) || joining}>{busyAction === '/remove' ? 'Removing…' : 'Remove'}</button>}
                {(connected || (host && session?.mayEnd)) && <button type="button" className="activation-training-leave" onClick={leave} disabled={Boolean(busyAction) || joining}>{['/leave', '/end'].includes(busyAction) ? 'Leaving…' : 'Leave'}</button>}
              </div>}
              {!connected && !host && !mayEnter && <p className="activation-training-wait" role="status">{showNext ? 'Your next step is ready below.' : session?.removed ? 'Please wait for Patrick to open your next session.' : session?.busy ? 'Call in progress — please wait' : 'Your Enter button appears when the room is ready.'}</p>}
              {needsAudio && connected && <button type="button" className="activation-training-enable-audio" onClick={() => roomRef.current?.startAudio().then(() => setNeedsAudio(false)).catch(() => setError('Please tap again to enable call audio.'))}>Enable audio</button>}
            </div>
          </div>
          {!host && !connected && !showNext && <div className="activation-training-booking"><h3>Choose your Activation time</h3><p>{config.bookingDurationMinutes === 5 ? 'Choose a five-minute appointment that works for you.' : `The booking calendar currently reserves ${Number(config.bookingDurationMinutes) || 30} minutes. Our conversation aims to take five.`}</p><a className="activation-training-resource activation-training-book-link" href={bookingUrl} target="_blank" rel="noopener noreferrer">{bookingUrl}</a></div>}
        </section>

        {showNext && <section className="activation-training-next" aria-labelledby="activation-next-title"><p className="activation-training-eyebrow">Your next step · Module 1</p><h2 id="activation-next-title">Let’s build your professional profile.</h2><p>Start with a strong LinkedIn photograph. Send Patrick your finished photo, then book your Pre-Masterclass review.</p><a className="activation-training-resource activation-training-book-link" href={MODULE_ONE_URL}>{MODULE_ONE_URL}</a><p className="activation-training-small">This opens your next step. Your training outcome is recorded separately.</p></section>}
        <footer className="activation-training-footer"><span>PATCH ACADEMY</span><span>One step forward, together.</span></footer>
      </main>
    </div>
  );
}
