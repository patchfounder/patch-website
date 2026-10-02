import { useEffect, useRef, useState } from 'react';
import PatchAudioPlayer from './PatchAudioPlayer.jsx';

const MAX_RECORDING_MS = 60_000;
// Stop just before the hard server boundary so normal timer/container rounding
// does not turn a valid browser recording into a fractionally overlong upload.
const AUTO_STOP_MS = 59_750;
const MIME_CANDIDATES = [
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
];

function chooseMimeType() {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  return MIME_CANDIDATES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType)) || '';
}

function extensionForMimeType(mimeType) {
  if (mimeType.includes('mp4')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  return 'webm';
}

function formatTimer(milliseconds) {
  const safeMilliseconds = Math.max(0, Math.min(MAX_RECORDING_MS, milliseconds));
  const totalSeconds = Math.floor(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((safeMilliseconds % 1000) / 100);
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

function recorderErrorMessage(error) {
  if (error?.name === 'NotAllowedError' || error?.name === 'SecurityError') {
    return 'Microphone access was blocked. Allow microphone access in your browser settings, then try again.';
  }

  if (error?.name === 'NotFoundError') {
    return 'No microphone was found. Connect a microphone or continue on another device.';
  }

  if (error?.name === 'NotReadableError' || error?.name === 'AbortError') {
    return 'Your microphone is unavailable. Close other apps using it, then try again.';
  }

  return 'The microphone could not start. Check your browser permissions and try again.';
}

export default function PatchVoiceRecorder({ onRecordingChange }) {
  const [recorderState, setRecorderState] = useState('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [recording, setRecording] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const objectUrlRef = useRef('');
  const startedAtRef = useRef(0);
  const stoppedAtRef = useRef(0);
  const frameRef = useRef(null);
  const stopTimeoutRef = useRef(null);
  const recordingFailedRef = useRef(false);
  const mountedRef = useRef(true);
  const onRecordingChangeRef = useRef(onRecordingChange);

  onRecordingChangeRef.current = onRecordingChange;

  const recordingSupported =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== 'undefined';

  const cancelTimers = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    if (stopTimeoutRef.current !== null) {
      window.clearTimeout(stopTimeoutRef.current);
      stopTimeoutRef.current = null;
    }
  };

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const releaseCurrentRecording = (notify = true) => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = '';
    }

    setRecording(null);
    if (notify) {
      onRecordingChangeRef.current?.(null);
    }
  };

  const updateTimer = () => {
    const nextElapsed = Math.min(performance.now() - startedAtRef.current, MAX_RECORDING_MS);

    if (mountedRef.current) {
      setElapsedMs(nextElapsed);
    }

    if (nextElapsed < MAX_RECORDING_MS) {
      frameRef.current = window.requestAnimationFrame(updateTimer);
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;

    if (recorder?.state === 'recording') {
      setRecorderState('stopping');
      cancelTimers();
      stoppedAtRef.current = performance.now();
      recorder.stop();
      stopTracks();
    }
  };

  const startRecording = async () => {
    if (!recordingSupported || recorderState === 'requesting' || recorderState === 'recording') {
      return;
    }

    setErrorMessage('');
    setRecorderState('requesting');
    setElapsedMs(0);
    releaseCurrentRecording();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
        video: false,
      });

      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      // Own the stream immediately so every constructor/error path can release it.
      streamRef.current = stream;

      const preferredMimeType = chooseMimeType();
      let recorder;

      try {
        recorder = preferredMimeType
          ? new MediaRecorder(stream, { mimeType: preferredMimeType })
          : new MediaRecorder(stream);
      } catch {
        recorder = new MediaRecorder(stream);
      }

      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recordingFailedRef.current = false;
      stoppedAtRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (event.data?.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onerror = (event) => {
        recordingFailedRef.current = true;
        cancelTimers();
        stopTracks();

        if (mountedRef.current) {
          setRecorderState('idle');
          setErrorMessage(recorderErrorMessage(event.error));
        }
      };

      recorder.onstop = () => {
        cancelTimers();
        stopTracks();

        const stoppedAt = stoppedAtRef.current || performance.now();
        const durationMs = Math.max(stoppedAt - startedAtRef.current, 0);
        const mimeType = recorder.mimeType || chunksRef.current[0]?.type || preferredMimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const recordingFailed = recordingFailedRef.current;

        mediaRecorderRef.current = null;
        chunksRef.current = [];
        recordingFailedRef.current = false;
        stoppedAtRef.current = 0;

        if (!mountedRef.current) {
          return;
        }

        if (recordingFailed) {
          setRecorderState('idle');
          setElapsedMs(0);
          onRecordingChangeRef.current?.(null);
          return;
        }

        if (durationMs > MAX_RECORDING_MS) {
          setRecorderState('idle');
          setElapsedMs(0);
          setErrorMessage('This recording ran past 60 seconds. Record again and keep this page open until it stops.');
          onRecordingChangeRef.current?.(null);
          return;
        }

        if (blob.size === 0) {
          setRecorderState('idle');
          setElapsedMs(0);
          setErrorMessage('No audio was captured. Check your microphone and record again.');
          onRecordingChangeRef.current?.(null);
          return;
        }

        const url = URL.createObjectURL(blob);
        const nextRecording = {
          blob,
          url,
          durationMs,
          mimeType,
          fileName: `voice-note.${extensionForMimeType(mimeType)}`,
        };

        objectUrlRef.current = url;
        setElapsedMs(durationMs);
        setRecording(nextRecording);
        setRecorderState('review');
        onRecordingChangeRef.current?.(nextRecording);
      };

      recorder.start(250);
      startedAtRef.current = performance.now();
      setRecorderState('recording');
      frameRef.current = window.requestAnimationFrame(updateTimer);
      stopTimeoutRef.current = window.setTimeout(stopRecording, AUTO_STOP_MS);
    } catch (error) {
      cancelTimers();
      stopTracks();

      if (mountedRef.current) {
        setRecorderState('idle');
        setErrorMessage(recorderErrorMessage(error));
      }
    }
  };

  const recordAgain = () => {
    setErrorMessage('');
    setElapsedMs(0);
    setRecorderState('idle');
    releaseCurrentRecording();
  };

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      cancelTimers();

      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onerror = null;
        recorder.onstop = null;
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }

      stopTracks();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = '';
      }
    };
  }, []);

  useEffect(() => {
    if (recorderState !== 'recording' && recorderState !== 'stopping') {
      return undefined;
    }

    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [recorderState]);

  return (
    <div className={`coach-recorder coach-recorder-${recorderState}`}>
      <div className="coach-recorder-heading">
        <div>
          <span className="coach-recorder-kicker">Voice note</span>
          <h3>Record your message</h3>
        </div>
        <span className="coach-recorder-limit">Maximum 1:00</span>
      </div>

      {!recordingSupported ? (
        <div className="coach-recorder-unavailable" role="alert">
          <strong>Recording is not available in this browser.</strong>
          <p>Open this page in the latest version of Safari or Chrome on a device with a microphone.</p>
        </div>
      ) : (
        <>
          {(recorderState === 'idle' || recorderState === 'requesting') && (
            <div className="coach-recorder-start-state">
              <div className="coach-recorder-mark" aria-hidden="true">
                <span />
              </div>
              <p>
                You may record again as many times as you need before submitting. Audio stays in this
                browser until you submit the final application.
              </p>
              <button
                className="coach-control coach-primary-button coach-record-button"
                type="button"
                onClick={startRecording}
                disabled={recorderState === 'requesting'}
              >
                <span className="coach-record-dot" aria-hidden="true" />
                {recorderState === 'requesting' ? 'Starting microphone…' : 'Start recording'}
              </button>
            </div>
          )}

          {(recorderState === 'recording' || recorderState === 'stopping') && (
            <div className="coach-recorder-live-state">
              <span className="coach-visually-hidden" role="status">
                Recording started. It will stop automatically after 60 seconds.
              </span>
              <div className="coach-recorder-live-status">
                <span><i aria-hidden="true" />Recording</span>
                <strong role="timer" aria-label={`${Math.floor(elapsedMs / 1000)} seconds recorded`}>
                  {formatTimer(elapsedMs)}
                </strong>
              </div>
              <div className="coach-recorder-wave" aria-hidden="true">
                {Array.from({ length: 32 }, (_, index) => (
                  <i key={index} style={{ '--coach-wave-index': index }} />
                ))}
              </div>
              <button
                className="coach-control coach-stop-button"
                type="button"
                onClick={stopRecording}
                disabled={recorderState === 'stopping'}
              >
                <span aria-hidden="true" />
                {recorderState === 'stopping' ? 'Finishing…' : 'Finish recording'}
              </button>
            </div>
          )}

          {recorderState === 'review' && recording && (
            <div className="coach-recorder-review-state">
              <div className="coach-recorder-ready-line">
                <span><i aria-hidden="true" />Recording ready</span>
                <span>{formatTimer(recording.durationMs).replace(/\.\d$/, '')}</span>
              </div>
              <PatchAudioPlayer
                src={recording.url}
                durationMs={recording.durationMs}
                label="Review your recorded voice note"
              />
              <button className="coach-control coach-secondary-button" type="button" onClick={recordAgain}>
                Record again
              </button>
            </div>
          )}
        </>
      )}

      {errorMessage && (
        <p className="coach-message coach-message-error" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
