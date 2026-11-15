import { useEffect, useRef, useState } from 'react';
import {
  ACTIVATION_BOOKING_URL, MODULE_ONE_URL, readSessionAccess, sessionPhase,
  callClock, canJoinSession, nextModuleAvailable, formatAppointment, safeBookingUrl,
  acceptsSessionUpdate, manageExpandedRoomFocus,
} from './training-room-state.js';
import './ActivationTraining.css';

const VIDEO_URL = 'https://www.youtube-nocookie.com/embed/KLXFHB4zVMI?rel=0';
const VIDEO_PAGE_URL = 'https://www.youtube.com/watch?v=KLXFHB4zVMI';
const MANUAL_URL = 'https://www.patch.app/training/patch-call-process.pdf';
const FALLBACK_CONFIG = { ready: false, bookingUrl: ACTIVATION_BOOKING_URL, bookingDurationMinutes: 30, sessionDurationSeconds: 300 };

async function readResponse(response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || 'Please try again in a moment.');
    error.code = body.code;
    error.status = response.status;
    throw error;
  }
  return body;
}

function messageForError(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError') return 'Please allow your camera and microphone, then tap Join again.';
  if (error?.name === 'NotFoundError') return 'We couldn’t find a camera or microphone. Please check your device and try again.';
  if (error?.status === 401) return 'This invitation could not be verified. Please reopen the private link from your email.';
  if (error?.status === 503) return 'Your video room is temporarily unavailable. Please try again shortly.';
  if (error?.status === 403) return 'The room is not open for you yet. Please check your session time and try again.';
  if (error?.status === 409) return 'This session is no longer open. Please refresh its details below.';
  return 'We couldn’t connect just now. Please check your connection and try again.';
}

export default function ActivationTraining() {
  const [config, setConfig] = useState(FALLBACK_CONFIG);
  const [access, setAccess] = useState(null);
  const [session, setSession] = useState(null);
  const [checked, setChecked] = useState(false);
  const [connection, setConnection] = useState('idle');
  const [remotePresent, setRemotePresent] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [microphoneOn, setMicrophoneOn] = useState(true);
  const [needsAudio, setNeedsAudio] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [offset, setOffset] = useState(0);
  const roomRef = useRef(null);
  const sessionRef = useRef(null);
  const pageRef = useRef(null);
  const dialogRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const accessRef = useRef(null);
  const intentionalLeave = useRef(false);
  const mounted = useRef(true);
  const cameraFacing = useRef('user');
  const joinGeneration = useRef(0);
  const joinPending = useRef(false);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/London';

  function authorisedFetch(path, options = {}) {
    const current = accessRef.current;
    const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers };
    if (current?.accessToken) headers.Authorization = `Bearer ${current.accessToken}`;
    return fetch(path, { ...options, headers, credentials: 'same-origin', cache: 'no-store', referrerPolicy: 'no-referrer' }).then(readResponse);
  }

  async function refreshConfiguration() {
    try {
      const response = await fetch('/api/training/config', { credentials: 'same-origin', cache: 'no-store' });
      const value = await response.json();
      if (mounted.current) setConfig({ ...FALLBACK_CONFIG, ...value, ready: response.ok && value.ready === true });
    } catch { if (mounted.current) setConfig(FALLBACK_CONFIG); }
  }

  function applySession(value) {
    if (!mounted.current || !acceptsSessionUpdate(sessionRef.current, value, accessRef.current?.sessionId)) return false;
    if (value?.serverTime) {
      const server = Date.parse(value.serverTime);
      if (Number.isFinite(server)) setOffset(server - Date.now());
    }
    setSession(value);
    sessionRef.current = value;
    setChecked(true);
    if (['ending', 'ended', 'cancelled'].includes(value?.status)) {
      joinGeneration.current += 1;
      joinPending.current = false;
      intentionalLeave.current = true;
      const room = roomRef.current;
      roomRef.current = null;
      room?.disconnect();
      setConnection('idle');
      setRemotePresent(false);
      setExpanded(false);
    }
    return true;
  }

  async function refreshSession({ showError = false } = {}) {
    const current = accessRef.current;
    if (!current) return;
    try {
      const value = await authorisedFetch(`/api/training/sessions/${encodeURIComponent(current.sessionId)}/status`);
      if (current !== accessRef.current) return;
      applySession(value);
      if (showError) setError('');
    } catch (cause) {
      if (mounted.current && current === accessRef.current) {
        setChecked(true);
        if (showError || !sessionRef.current) setError(messageForError(cause));
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    const previousTitle = document.title;
    document.title = 'Activation | Patch Academy';
    const loadAccess = () => {
      let storage;
      try { storage = window.sessionStorage; } catch { /* The invitation can still be used in memory. */ }
      const accessValue = readSessionAccess(window.location, storage, window.history);
      if (accessRef.current?.sessionId === accessValue?.sessionId && accessRef.current?.accessToken === accessValue?.accessToken) return;
      joinGeneration.current += 1;
      joinPending.current = false;
      intentionalLeave.current = true;
      const previousRoom = roomRef.current;
      roomRef.current = null;
      previousRoom?.disconnect();
      accessRef.current = accessValue;
      sessionRef.current = null;
      setAccess(accessValue);
      setSession(null);
      setChecked(!accessValue);
      setConnection('idle');
      setRemotePresent(false);
      setExpanded(false);
      setError('');
      setFinishing(false);
      if (accessValue) refreshSession({ showError: true });
    };
    loadAccess();
    if (!accessRef.current) setChecked(true);
    window.addEventListener('hashchange', loadAccess);
    refreshConfiguration();
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const statusTick = window.setInterval(() => {
      if (document.visibilityState !== 'hidden' && !['ended', 'cancelled'].includes(sessionRef.current?.status)) refreshSession();
    }, 10000);
    const onVisible = () => { if (document.visibilityState === 'visible' && !['ended', 'cancelled'].includes(sessionRef.current?.status)) refreshSession(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      joinGeneration.current += 1;
      joinPending.current = false;
      window.clearInterval(tick);
      window.clearInterval(statusTick);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('hashchange', loadAccess);
      intentionalLeave.current = true;
      roomRef.current?.disconnect();
      roomRef.current = null;
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!expanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const releaseFocus = manageExpandedRoomFocus(dialogRef.current, pageRef.current, document);
    const escape = event => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('keydown', escape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', escape);
      releaseFocus();
    };
  }, [expanded]);

  function attachLocal(room, sdk) {
    const publication = room.localParticipant.getTrackPublication(sdk.Track.Source.Camera);
    if (publication?.track && localVideoRef.current) publication.track.attach(localVideoRef.current);
  }

  async function join() {
    if (!accessRef.current || joinPending.current || connection === 'joining' || connection === 'connected' || connection === 'reconnecting') return;
    joinPending.current = true;
    const generation = ++joinGeneration.current;
    const current = accessRef.current;
    const stillCurrent = () => mounted.current && generation === joinGeneration.current && current.sessionId === accessRef.current?.sessionId && !['ending', 'ended', 'cancelled'].includes(sessionRef.current?.status);
    setError('');
    setConnection('joining');
    intentionalLeave.current = false;
    let room;
    try {
      const joined = await authorisedFetch(`/api/training/sessions/${encodeURIComponent(current.sessionId)}/join`, { method: 'POST', body: '{}' });
      if (!stillCurrent()) return;
      if (!['host', 'coach'].includes(joined.role) || joined.role !== joined.session?.role || joined.session?.sessionId !== current.sessionId || typeof joined.serverUrl !== 'string' || typeof joined.participantToken !== 'string') throw new Error('Invalid session response');
      applySession(joined.session);
      if (!stillCurrent()) return;
      const sdk = await import('livekit-client');
      if (!stillCurrent()) return;
      room = new sdk.Room({ adaptiveStream: true, dynacast: true, videoCaptureDefaults: { facingMode: 'user', resolution: { width: 1280, height: 720, frameRate: 24 } } });
      roomRef.current?.disconnect();
      roomRef.current = room;
      const syncRemote = () => {
        if (stillCurrent() && roomRef.current === room) setRemotePresent(room.remoteParticipants.size > 0);
      };
      room.on(sdk.RoomEvent.TrackSubscribed, (track, _publication, participant) => {
        if (!stillCurrent() || roomRef.current !== room) return;
        if (room.remoteParticipants.size > 1 || participant.identity === room.localParticipant.identity) return;
        if (track.kind === sdk.Track.Kind.Video && remoteVideoRef.current) track.attach(remoteVideoRef.current);
        if (track.kind === sdk.Track.Kind.Audio && remoteAudioRef.current) track.attach(remoteAudioRef.current);
        syncRemote();
      });
      room.on(sdk.RoomEvent.TrackUnsubscribed, track => track.detach());
      room.on(sdk.RoomEvent.ParticipantConnected, syncRemote);
      room.on(sdk.RoomEvent.ParticipantDisconnected, syncRemote);
      room.on(sdk.RoomEvent.Reconnecting, () => { if (stillCurrent() && roomRef.current === room) setConnection('reconnecting'); });
      room.on(sdk.RoomEvent.Reconnected, () => { if (stillCurrent() && roomRef.current === room) setConnection('connected'); });
      room.on(sdk.RoomEvent.AudioPlaybackStatusChanged, () => { if (stillCurrent() && roomRef.current === room) setNeedsAudio(!room.canPlaybackAudio); });
      room.on(sdk.RoomEvent.LocalTrackPublished, () => { if (stillCurrent() && roomRef.current === room) attachLocal(room, sdk); });
      room.on(sdk.RoomEvent.Disconnected, () => {
        if (!mounted.current || roomRef.current !== room) return;
        setConnection(intentionalLeave.current ? 'left' : 'disconnected');
        setRemotePresent(false);
        setNeedsAudio(false);
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
      attachLocal(room, sdk);
      syncRemote();
      setCameraOn(true);
      setMicrophoneOn(true);
      cameraFacing.current = 'user';
      setConnection('connected');
    } catch (cause) {
      if (!stillCurrent()) { await room?.disconnect(); return; }
      intentionalLeave.current = true;
      if (roomRef.current === room) roomRef.current = null;
      await room?.disconnect();
      if (mounted.current) {
        setConnection('idle');
        setError(messageForError(cause));
      }
    } finally {
      if (generation === joinGeneration.current) joinPending.current = false;
    }
  }

  async function toggleMicrophone() {
    const room = roomRef.current;
    if (!room) return;
    try { await room.localParticipant.setMicrophoneEnabled(!microphoneOn); if (mounted.current && roomRef.current === room) setMicrophoneOn(!microphoneOn); }
    catch (cause) { if (mounted.current && roomRef.current === room) setError(messageForError(cause)); }
  }

  async function toggleCamera() {
    const room = roomRef.current;
    if (!room) return;
    try { await room.localParticipant.setCameraEnabled(!cameraOn); if (mounted.current && roomRef.current === room) setCameraOn(!cameraOn); }
    catch (cause) { if (mounted.current && roomRef.current === room) setError(messageForError(cause)); }
  }

  async function flipCamera() {
    const room = roomRef.current;
    if (!room) return;
    try {
      const sdk = await import('livekit-client');
      if (!mounted.current || roomRef.current !== room) return;
      const track = room.localParticipant.getTrackPublication(sdk.Track.Source.Camera)?.track;
      if (!track) return;
      const next = cameraFacing.current === 'user' ? 'environment' : 'user';
      await track.restartTrack({ facingMode: next });
      if (mounted.current && roomRef.current === room) cameraFacing.current = next;
    } catch (cause) { if (mounted.current && roomRef.current === room) setError(messageForError(cause)); }
  }

  function leave() {
    joinGeneration.current += 1;
    joinPending.current = false;
    intentionalLeave.current = true;
    const room = roomRef.current;
    roomRef.current = null;
    room?.disconnect();
    setConnection('left');
    setRemotePresent(false);
    setExpanded(false);
  }

  async function finish() {
    if (session?.role !== 'host' || !session.mayEnd || finishing) return;
    const current = accessRef.current;
    if (!current) return;
    setFinishing(true);
    setError('');
    try {
      const value = await authorisedFetch(`/api/training/sessions/${encodeURIComponent(current.sessionId)}/end`, { method: 'POST', body: '{}' });
      if (current === accessRef.current) applySession(value);
    } catch (cause) { if (current === accessRef.current && mounted.current) setError(messageForError(cause)); }
    finally { if (mounted.current) setFinishing(false); }
  }

  const serverNow = now + offset;
  const phase = sessionPhase(session, serverNow);
  const clock = callClock(session, serverNow);
  const appointment = formatAppointment(session, timeZone);
  const connected = connection === 'connected' || connection === 'reconnecting';
  const joining = connection === 'joining';
  const canJoin = config.ready && canJoinSession(session, serverNow);
  const showNext = nextModuleAvailable(session);
  const otherName = session?.role === 'host' ? session.coachName || 'Your coach' : session?.hostName || 'Patrick';
  const bookingUrl = safeBookingUrl(config.bookingUrl);
  let roomTitle = 'Your five-minute check-in';
  let roomCopy = 'Once you’ve watched the video, book a short one-to-one conversation with Patrick.';
  if (access && !checked) { roomTitle = 'Finding your session'; roomCopy = 'Your private invitation is being checked.'; }
  else if (phase === 'scheduled') { roomTitle = 'You’re booked in'; roomCopy = 'Your room opens at the scheduled time. Watch the video and keep your questions handy.'; }
  else if (phase === 'open') { roomTitle = session?.role === 'host' ? 'Your coach’s room is ready' : 'Your room is ready'; roomCopy = 'Tap Join when you’re ready. Your camera and microphone start only when you join.'; }
  else if (phase === 'ended') { roomTitle = 'Thanks for joining'; roomCopy = 'Your session has been finished by Patrick. Your next step is below.'; }
  else if (phase === 'ending') { roomTitle = 'Finishing your session'; roomCopy = session?.role === 'host' ? 'The room is closing. If this takes a moment, try Finish session again below.' : 'Patrick is finishing the session. Your next step will appear when the room has closed.'; }
  else if (phase === 'cancelled') { roomTitle = 'This session was cancelled'; roomCopy = 'Please book another time or reply to your invitation for help.'; }
  else if (phase === 'expired') { roomTitle = 'This session’s joining window has closed'; roomCopy = 'Please contact Patrick if you still need your Activation Call.'; }
  if (connection === 'left' && phase === 'open') { roomTitle = 'You’ve left the room'; roomCopy = 'You can rejoin while your session is still open. Leaving does not finish the session.'; }
  if (connection === 'disconnected') { roomTitle = 'Your connection was interrupted'; roomCopy = 'Your session hasn’t been marked complete. Tap Rejoin to return.'; }
  if (session && !config.ready && !['ending', 'ended', 'cancelled'].includes(phase)) { roomTitle = 'Your session is booked'; roomCopy = 'Your video room is not available yet. Please return shortly or contact Patrick if your session is due to start.'; }

  return (
    <div className="activation-training-page" ref={pageRef}>
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
          <p>We’ll answer your questions, talk about being part of Patch and make sure you feel ready. Aim for a five-minute check-in; the call stays open until you leave or Patrick finishes it.</p>
          <div className={`activation-training-room${expanded ? ' is-expanded' : ''}`} ref={dialogRef} role={expanded ? 'dialog' : undefined} aria-modal={expanded ? true : undefined} aria-label={expanded ? 'Activation video call' : undefined}>
            <div className="activation-training-room-top"><span className="activation-training-room-label">{session?.role === 'host' ? 'Your host room' : 'Your private room'}</span><button type="button" className="activation-training-expand" onClick={() => setExpanded(!expanded)} aria-label={expanded ? 'Collapse video call' : 'Expand video call'}>{expanded ? 'Collapse' : 'Expand'}</button></div>
            {appointment && <p className="activation-training-appointment">{appointment}<span>Your local time · {timeZone}</span></p>}
            <div className={`activation-training-stage-video${connected ? ' is-connected' : ''}`}>
              <video ref={remoteVideoRef} className="activation-training-remote-video" autoPlay playsInline aria-label={`${otherName}’s video`} />
              {(!connected || !remotePresent) && <div className="activation-training-room-placeholder">
                <span className="activation-training-monogram" aria-hidden="true">P</span>
                <h3>{connected ? `Waiting for ${otherName}` : roomTitle}</h3>
                <p>{connection === 'reconnecting' ? 'Reconnecting your call…' : connected ? 'You’re in the room. Your camera and microphone controls are below.' : roomCopy}</p>
                {!connected && clock && !['ending', 'ended', 'cancelled'].includes(phase) && <div className="activation-training-clock"><span>{clock.label}</span><strong>{clock.value}</strong></div>}
              </div>}
              <div className={`activation-training-self${connected ? ' is-visible' : ''}`}><video ref={localVideoRef} autoPlay playsInline muted aria-label="Your video preview" />{!cameraOn && <span>Camera off</span>}<small>You</small></div>
              {connected && <div className="activation-training-connection"><span />{connection === 'reconnecting' ? 'Reconnecting' : `With ${otherName}`}</div>}
            </div>
            <audio ref={remoteAudioRef} autoPlay />
            <div className="activation-training-room-bottom">
              {error && <p className="activation-training-error" role="alert">{error}</p>}
              {connected && clock && <p className="activation-training-live-clock"><span>{clock.value}</span> since scheduled start · Five-minute check-in</p>}
              {connected ? <div className="activation-training-controls">
                <button type="button" aria-pressed={microphoneOn} onClick={toggleMicrophone}>{microphoneOn ? 'Mic on' : 'Mic off'}</button>
                <button type="button" aria-pressed={cameraOn} onClick={toggleCamera}>{cameraOn ? 'Camera on' : 'Camera off'}</button>
                <button type="button" onClick={flipCamera} disabled={!cameraOn}>Flip camera</button>
                <button type="button" className="activation-training-leave" onClick={leave}>Leave</button>
              </div> : canJoin ? <button type="button" className="activation-training-join" onClick={join} disabled={joining}>{joining ? 'Joining…' : ['left', 'disconnected'].includes(connection) ? 'Rejoin call' : session?.role === 'host' ? 'Join as Patrick' : 'Join Patrick'}</button> : phase === 'scheduled' ? <button type="button" className="activation-training-join" disabled>Room opens at your session time</button> : !session ? <div className="activation-training-room-guidance"><p>{config.ready ? 'Already booked? Open the private session link from your invitation email.' : 'The video room is being prepared. You can watch the training and book your check-in now.'}</p></div> : null}
              {needsAudio && connected && <button type="button" className="activation-training-enable-audio" onClick={() => roomRef.current?.startAudio().then(() => setNeedsAudio(false)).catch(() => setError('Please tap again to enable call audio.'))}>Tap to hear the call</button>}
              {session?.role === 'host' && session.mayEnd && phase !== 'ended' && <button type="button" className="activation-training-finish" onClick={finish} disabled={finishing}>{finishing ? 'Finishing session…' : phase === 'ending' ? 'Try finishing the session again' : 'Finish session and show Module 1'}</button>}
              {access && !connected && <button type="button" className="activation-training-refresh" onClick={() => Promise.all([refreshConfiguration(), refreshSession({ showError: true })])}>Refresh session details</button>}
            </div>
          </div>
          {!session && checked && <div className="activation-training-booking"><h3>Choose your Activation time</h3><p>{config.bookingDurationMinutes === 5 ? 'Choose a five-minute appointment that works for you.' : `The booking calendar currently reserves ${Number(config.bookingDurationMinutes) || 30} minutes. Our conversation aims to take five.`}</p><a className="activation-training-resource activation-training-book-link" href={bookingUrl} target="_blank" rel="noopener noreferrer">{bookingUrl}</a></div>}
        </section>

        {showNext && <section className="activation-training-next" aria-labelledby="activation-next-title"><p className="activation-training-eyebrow">Your next step · Module 1</p><h2 id="activation-next-title">Let’s build your professional profile.</h2><p>Start with a strong LinkedIn photograph. Send Patrick your finished photo, then book your Pre-Masterclass review.</p><a className="activation-training-resource activation-training-book-link" href={MODULE_ONE_URL}>{MODULE_ONE_URL}</a><p className="activation-training-small">This opens your next step. Your training outcome is recorded separately.</p></section>}
        <footer className="activation-training-footer"><span>PATCH ACADEMY</span><span>One step forward, together.</span></footer>
      </main>
    </div>
  );
}
