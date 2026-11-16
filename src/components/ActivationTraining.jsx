import { useEffect, useRef, useState } from 'react';
import { ACTIVATION_BOOKING_URL, MODULE_ONE_URL, safeBookingUrl } from './training-room-state.js';
import { acceptsSharedRoomUpdate, sharedRoomClock, sharedRoomMessage, sharedRoomNextStage } from './activation-shared-room-state.js';
import { DEFAULT_TRAINING_STAGE } from '../training-stages.js';
import './ActivationTraining.css';

const MANUAL_URL = 'https://www.patch.app/training/patch-call-process.pdf';
const FALLBACK_CONFIG = { bookingUrl: ACTIVATION_BOOKING_URL, bookingDurationMinutes: 30 };

async function requestRoom(apiPath, path, options = {}) {
  const response = await fetch(`${apiPath}${path}`, {
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
  if (error?.status === 503) return 'Couldn’t connect.';
  if (error?.status === 409) return error.message || 'The room is busy. Please wait a moment and try again.';
  return error?.message || 'We couldn’t connect just now. Please check your connection and try again.';
}

export default function ActivationTraining({ host = false, stage: suppliedStage }) {
  const stage = suppliedStage || DEFAULT_TRAINING_STAGE;
  const activation = stage.id === 'activation';
  const [config, setConfig] = useState(() => activation ? FALLBACK_CONFIG : { bookingUrl: stage.bookingUrl });
  const [session, setSession] = useState(null);
  const [connection, setConnection] = useState('idle');
  const [remotePresent, setRemotePresent] = useState(false);
  const [needsAudio, setNeedsAudio] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [settingsError, setSettingsError] = useState('');
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [devices, setDevices] = useState([]);
  const [microphoneDevice, setMicrophoneDevice] = useState('');
  const [cameraDevice, setCameraDevice] = useState('');
  const [closureFailed, setClosureFailed] = useState(false);
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
  const sdkRef = useRef(null);
  const settingsOpenRef = useRef(false);
  const settingsPanelRef = useRef(null);
  const settingsButtonRef = useRef(null);
  const firstSettingRef = useRef(null);
  const deviceRequest = useRef(0);
  const mediaAction = useRef(0);
  const mediaPending = useRef(false);

  function roomRequest(path, options) {
    return requestRoom(stage.apiPath, path, options);
  }

  function disconnectMedia(nextConnection = 'idle') {
    joinGeneration.current += 1;
    joinPending.current = false;
    intentionalLeave.current = true;
    settingsOpenRef.current = false;
    deviceRequest.current += 1;
    mediaAction.current += 1;
    mediaPending.current = false;
    const room = roomRef.current;
    roomRef.current = null;
    room?.disconnect();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (mounted.current) {
      setConnection(nextConnection); setRemotePresent(false); setNeedsAudio(false);
      setSettingsOpen(false); setSettingsBusy(false); setSettingsError('');
    }
  }

  function applySession(value) {
    if (!mounted.current || !acceptsSharedRoomUpdate(sessionRef.current, value)) return false;
    const previous = sessionRef.current;
    if (value.serverTime && Number.isFinite(Date.parse(value.serverTime))) setOffset(Date.parse(value.serverTime) - Date.now());
    sessionRef.current = value;
    setSession(value);
    if (value.status === 'ended' || value.status === 'closed') setClosureFailed(false);
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
      if (mounted.current && cause?.status !== 503 && (showError || !sessionRef.current)) setError(messageForError(cause));
    } finally { pollPending.current = false; }
  }

  useEffect(() => {
    mounted.current = true;
    const previousTitle = document.title;
    document.title = `${host ? 'Host ' : ''}${stage.title} | Patch Academy`;
    refreshSession({ showError: true });
    if (activation) fetch('/api/training/config', { credentials: 'same-origin', cache: 'no-store' })
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
  }, [host, stage.code]);

  useEffect(() => {
    if (!settingsOpen) return undefined;
    firstSettingRef.current?.focus?.();
    const dismiss = event => {
      if (event.type === 'keydown') {
        if (event.key !== 'Escape') return;
        event.preventDefault(); closeSettings(true);
      } else if (!settingsPanelRef.current?.contains?.(event.target) && !settingsButtonRef.current?.contains?.(event.target)) {
        closeSettings();
      }
    };
    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [settingsOpen]);

  function closeSettings(restoreFocus = false) {
    settingsOpenRef.current = false;
    deviceRequest.current += 1;
    setSettingsOpen(false);
    if (restoreFocus) settingsButtonRef.current?.focus?.();
  }

  function syncLocalSettings(room) {
    if (!mounted.current || roomRef.current !== room) return;
    setMicrophoneEnabled(room.localParticipant.isMicrophoneEnabled !== false);
    setCameraEnabled(room.localParticipant.isCameraEnabled !== false);
    setMicrophoneDevice(room.getActiveDevice?.('audioinput') || '');
    setCameraDevice(room.getActiveDevice?.('videoinput') || '');
  }

  async function refreshDevices(room, sdk) {
    const request = ++deviceRequest.current;
    try {
      const available = await sdk.Room.getLocalDevices(undefined, false);
      if (!mounted.current || roomRef.current !== room || !settingsOpenRef.current || request !== deviceRequest.current) return;
      setDevices(available.filter(device => ['audioinput', 'videoinput'].includes(device.kind)));
      syncLocalSettings(room);
    } catch {
      if (mounted.current && roomRef.current === room && settingsOpenRef.current && request === deviceRequest.current) setSettingsError('Device choices are unavailable. You can still mute or turn video off.');
    }
  }

  function toggleSettings() {
    if (settingsOpenRef.current) { closeSettings(); return; }
    const room = roomRef.current, sdk = sdkRef.current;
    if (!room || !sdk || connection !== 'connected' || actionPending.current) return;
    settingsOpenRef.current = true;
    setSettingsOpen(true); setSettingsError(''); syncLocalSettings(room);
    refreshDevices(room, sdk);
  }

  async function stopStaleMedia(room, capturedTracks = [], changedPublication) {
    // A device/capture promise may settle after Leave. Stop only that old room.
    try { await room.disconnect(); } catch { /* Continue stopping any late tracks. */ }
    const tracks = new Set([...capturedTracks, changedPublication?.track, ...[...(room.localParticipant.trackPublications?.values?.() || [])].map(publication => publication.track)]);
    for (const track of tracks) { try { track?.stop?.(); } catch { /* Stop the remaining old tracks as well. */ } }
  }

  async function changeMedia(kind, value) {
    const room = roomRef.current;
    if (!room || connection !== 'connected' || mediaPending.current || actionPending.current) return;
    const generation = joinGeneration.current, operation = ++mediaAction.current;
    const current = () => mounted.current && roomRef.current === room && generation === joinGeneration.current;
    const capturedTracks = [...(room.localParticipant.trackPublications?.values?.() || [])].map(publication => publication.track);
    const source = kind === 'microphone' || kind === 'audioinput' ? sdkRef.current?.Track.Source.Microphone : sdkRef.current?.Track.Source.Camera;
    const affectedTrack = room.localParticipant.getTrackPublication(source)?.track;
    if (affectedTrack) capturedTracks.push(affectedTrack);
    let changedPublication;
    mediaPending.current = true; setSettingsBusy(true); setSettingsError('');
    try {
      if (kind === 'microphone') changedPublication = await room.localParticipant.setMicrophoneEnabled(value);
      else if (kind === 'camera') changedPublication = await room.localParticipant.setCameraEnabled(value);
      else if (await room.switchActiveDevice(kind, value, true) === false) throw new Error('That device could not be selected.');
      if (!current()) { await stopStaleMedia(room, capturedTracks, changedPublication); return; }
      syncLocalSettings(room);
      if (kind === 'camera' || kind === 'videoinput') attachLocal(room, sdkRef.current);
    } catch (cause) {
      if (!current()) { await stopStaleMedia(room, capturedTracks, changedPublication); return; }
      syncLocalSettings(room);
      setSettingsError(messageForError(cause));
    } finally {
      if (current() && operation === mediaAction.current) { mediaPending.current = false; setSettingsBusy(false); }
    }
  }

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
    setError(''); setClosureFailed(false); setConnection('joining'); intentionalLeave.current = false;
    let room;
    let admitted = false;
    try {
      const joined = await roomRequest(host ? '/go' : '/join', { method: 'POST', body: JSON.stringify(host ? {} : { sessionId: sessionRef.current.sessionId }) });
      if (!mounted.current || generation !== joinGeneration.current) return;
      if (joined.role !== (host ? 'host' : 'coach') || joined.session?.role !== joined.role
        || !joined.session?.sessionId || typeof joined.serverUrl !== 'string' || typeof joined.participantToken !== 'string') throw new Error('The room could not be opened. Please try again.');
      joinedSessionId = joined.session.sessionId;
      admitted = true;
      // A new Enter replaces the last finished room without cancelling this explicit join.
      sessionRef.current = null;
      applySession(joined.session);
      if (!stillCurrent()) return;
      const sdk = await import('livekit-client');
      if (!stillCurrent()) return;
      sdkRef.current = sdk;
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
      room.on(sdk.RoomEvent.LocalTrackPublished, () => { if (stillCurrent() && roomRef.current === room) { attachLocal(room, sdk); syncLocalSettings(room); } });
      const localTrackChanged = (_publication, participant) => { if (participant === room.localParticipant && stillCurrent()) syncLocalSettings(room); };
      room.on(sdk.RoomEvent.TrackMuted, localTrackChanged);
      room.on(sdk.RoomEvent.TrackUnmuted, localTrackChanged);
      room.on(sdk.RoomEvent.ActiveDeviceChanged, () => { if (stillCurrent()) syncLocalSettings(room); });
      room.on(sdk.RoomEvent.MediaDevicesChanged, () => { if (stillCurrent() && settingsOpenRef.current) refreshDevices(room, sdk); });
      room.on(sdk.RoomEvent.Disconnected, () => {
        if (!mounted.current || roomRef.current !== room) return;
        disconnectMedia(intentionalLeave.current ? 'left' : 'disconnected');
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
      attachLocal(room, sdk); syncRemote(); syncLocalSettings(room);
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
    closeSettings();
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
    } catch (cause) {
      if (mounted.current) {
        if (path === '/end') setClosureFailed(true);
        setError(path === '/end' ? 'We couldn’t confirm that the call closed. Please retry.' : messageForError(cause));
      }
    }
    finally { actionPending.current = false; if (mounted.current) setBusyAction(null); }
  }

  const connected = connection === 'connected' || connection === 'reconnecting';
  const joining = connection === 'joining';
  const clock = sharedRoomClock(session, now + offset);
  const { title: roomTitle, copy: roomCopy } = sharedRoomMessage(session, { host, connection, remotePresent, stageTitle: stage.title, nextStageUrl: stage.handoffUrl });
  const otherName = host ? 'your coach' : 'Patrick';
  const showNext = sharedRoomNextStage(session, stage.handoffUrl);
  const nextStageUrl = suppliedStage ? stage.nextStageUrl : MODULE_ONE_URL;
  const bookingUrl = activation ? safeBookingUrl(config.bookingUrl) : stage.bookingUrl;
  const mayEnter = session?.ready && (host ? session.mayGo : session.mayJoin && !showNext);
  const retryClosing = host && !connected && session?.mayEnd && (session.status === 'ending' || closureFailed);
  const microphones = devices.filter(device => device.kind === 'audioinput');
  const cameras = devices.filter(device => device.kind === 'videoinput');

  return (
    <div className="activation-training-page">
      <header className="activation-training-header">
        <div className="activation-training-brand"><img src="/patch-logo-2.png" width="96" height="42" alt="Patch" /><span className="activation-training-brand-caption">Academy</span></div>
        <span className="activation-training-stage">Step {stage.step} of 6</span>
      </header>
      <main className="activation-training-shell">
        <header className="activation-training-intro">
          <p className="activation-training-eyebrow">Patch Academy · {stage.title}</p>
          <h1>{stage.headline}</h1>
          <p>{stage.intro}</p>
          <div className="activation-training-progress" aria-label={`${stage.title} · stage ${stage.step} of 6`}>{Array.from({ length: 6 }, (_, index) => <span key={index} className={index < stage.step ? 'is-current' : undefined} />)}</div>
        </header>

        <section className="activation-training-section" aria-labelledby="activation-watch-title">
          <div className="activation-training-section-heading"><span>01</span><div><p className="activation-training-eyebrow">Before we meet</p><h2 id="activation-watch-title">{activation ? 'Watch the seven steps' : 'Watch the tutorial'}</h2></div></div>
          <div className="activation-training-video"><iframe src={stage.videoUrl} title={stage.videoTitle} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div>
          <a className="activation-training-resource" href={stage.videoPageUrl} target="_blank" rel="noopener noreferrer">{stage.videoPageUrl}</a>
          {stage.placeholderVideo && <p className="activation-training-small">Placeholder tutorial · the module video will be added here.</p>}
        </section>

        <section className="activation-training-section activation-training-manual" aria-labelledby="activation-script-title">
          <div className="activation-training-section-heading"><span>02</span><div><p className="activation-training-eyebrow">Keep it handy</p><h2 id="activation-script-title">{stage.resourceTitle}</h2></div></div>
          <p>{stage.resourceCopy}</p>
          <a className="activation-training-resource activation-training-download" href={MANUAL_URL} download="Patch Call Process.pdf">{MANUAL_URL}</a>
          <p className="activation-training-small">PDF · 1 page · You can download it to your phone.</p>
        </section>

        <section className="activation-training-section" aria-labelledby="activation-call-title">
          <div className="activation-training-section-heading"><span>03</span><div><p className="activation-training-eyebrow">Meet Patrick</p><h2 id="activation-call-title">A little conversation. A clear next step.</h2></div></div>
          <p>{stage.callCopy}</p>
          <div className="activation-training-room" aria-label={`${stage.title} video call`}>
            <div className={`activation-training-stage-video${connected ? ' is-connected' : ''}`}>
              {clock && <span className="activation-training-timer" aria-label={`Call duration ${clock}`}>{clock}</span>}
              {connected && <button ref={settingsButtonRef} type="button" className="activation-training-settings-toggle" aria-label="Call settings" aria-expanded={settingsOpen} aria-controls="activation-call-settings" onClick={toggleSettings} disabled={Boolean(busyAction) || connection === 'reconnecting'}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="m9.5 3-.7 2.1-2 .9-2.1-.5-2 3.4 1.5 1.6v2.3l-1.5 1.6 2 3.4 2.1-.5 2 .9.7 2.1h4l.7-2.1 2-.9 2.1.5 2-3.4-1.5-1.6v-2.3l1.5-1.6-2-3.4-2.1.5-2-.9-.7-2.1z"/><circle cx="11.5" cy="11.7" r="3"/></svg></button>}
              {settingsOpen && connected && <div id="activation-call-settings" ref={settingsPanelRef} className="activation-training-settings" role="dialog" aria-label="Call settings" aria-busy={settingsBusy}>
                <div className="activation-training-device-choices">
                  <label>Microphone<select ref={firstSettingRef} aria-label="Microphone" value={microphoneDevice} disabled={settingsBusy || !microphones.length} onChange={event => changeMedia('audioinput', event.target.value)}>{!microphones.some(device => device.deviceId === microphoneDevice) && <option value={microphoneDevice}>Current microphone</option>}{microphones.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}</select></label>
                  <label>Camera<select aria-label="Camera" value={cameraDevice} disabled={settingsBusy || !cameras.length} onChange={event => changeMedia('videoinput', event.target.value)}>{!cameras.some(device => device.deviceId === cameraDevice) && <option value={cameraDevice}>Current camera</option>}{cameras.map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Camera ${index + 1}`}</option>)}</select></label>
                </div>
                <div className="activation-training-media-actions">
                  <button type="button" aria-pressed={!microphoneEnabled} disabled={settingsBusy || Boolean(busyAction)} onClick={() => changeMedia('microphone', !microphoneEnabled)}>{microphoneEnabled ? 'Mute' : 'Unmute'}</button>
                  <button type="button" aria-pressed={!cameraEnabled} disabled={settingsBusy || Boolean(busyAction)} onClick={() => changeMedia('camera', !cameraEnabled)}>{cameraEnabled ? 'Video off' : 'Video on'}</button>
                </div>
                {settingsError && <p role="alert">{settingsError}</p>}
              </div>}
              <video ref={remoteVideoRef} className="activation-training-remote-video" autoPlay playsInline aria-label={`${otherName}’s video`} />
              {(!connected || !remotePresent) && <div className="activation-training-room-placeholder">
                <span className="activation-training-monogram" aria-hidden="true">P</span>
                <h3>{roomTitle}</h3>
                {roomCopy && <p>{roomCopy}</p>}
              </div>}
              <div className={`activation-training-self${connected ? ' is-visible' : ''}`}><video ref={localVideoRef} autoPlay playsInline muted aria-label="Your video preview" />{!cameraEnabled && <span>Video off</span>}</div>
            </div>
            <audio ref={remoteAudioRef} autoPlay />
            <div className="activation-training-room-bottom">
              {error && <p className="activation-training-error" role="alert">{error}</p>}
              {(connected || host || mayEnter) && <div className="activation-training-controls">
                {!connected && !retryClosing && (host || mayEnter) && <button type="button" className="activation-training-join" onClick={join} disabled={!mayEnter || joining || Boolean(busyAction)}>{joining ? 'Connecting…' : 'Enter'}</button>}
                {connected && <button type="button" className="activation-training-leave" onClick={leave} disabled={Boolean(busyAction) || joining}>{['/leave', '/end'].includes(busyAction) ? 'Leaving…' : 'Leave'}</button>}
              </div>}
              {!connected && !host && !mayEnter && (showNext || session?.removed || session?.busy) && <p className="activation-training-wait" role="status">{showNext ? 'Your next step is ready below.' : session?.removed ? 'Please wait for Patrick to open your next session.' : 'Call in progress — please wait'}</p>}
              {retryClosing && <button type="button" className="activation-training-retry-close" onClick={() => roomAction('/end')} disabled={Boolean(busyAction)}>{busyAction === '/end' ? 'Closing…' : 'Retry closing'}</button>}
              {needsAudio && connected && <button type="button" className="activation-training-enable-audio" onClick={() => roomRef.current?.startAudio().then(() => setNeedsAudio(false)).catch(() => setError('Please tap again to enable call audio.'))}>Enable audio</button>}
            </div>
          </div>
          {!host && !connected && !showNext && <div className="activation-training-booking"><h3>Choose your {stage.title} time</h3><p>{!activation ? 'Book a short review with Patrick at a time that suits you.' : config.bookingDurationMinutes === 5 ? 'Choose a five-minute appointment that works for you.' : `The booking calendar currently reserves ${Number(config.bookingDurationMinutes) || 30} minutes. Our conversation aims to take five.`}</p><a className="activation-training-resource activation-training-book-link" href={bookingUrl} target="_blank" rel="noopener noreferrer">{bookingUrl}</a></div>}
        </section>

        {showNext && nextStageUrl && <section className="activation-training-next" aria-labelledby="activation-next-title"><p className="activation-training-eyebrow">Your next step · Module {stage.nextStageModule}</p><h2 id="activation-next-title">{suppliedStage ? stage.nextStageTitle : 'Let’s build your professional profile.'}</h2><p>{suppliedStage ? stage.nextStageCopy : 'Start with a strong LinkedIn photograph. Send Patrick your finished photo, then book your Pre-Masterclass review.'}</p><a className="activation-training-resource activation-training-book-link" href={nextStageUrl}>{nextStageUrl}</a><p className="activation-training-small">This opens your next step. Your training outcome is recorded separately.</p></section>}
        <footer className="activation-training-footer"><span>PATCH ACADEMY</span><span>One step forward, together.</span></footer>
      </main>
    </div>
  );
}
