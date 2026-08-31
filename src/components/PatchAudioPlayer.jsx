import { useEffect, useRef, useState } from 'react';

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '0:00';
  }

  const wholeSeconds = Math.floor(seconds);
  const minutes = Math.floor(wholeSeconds / 60);
  const remainingSeconds = wholeSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`;
}

export default function PatchAudioPlayer({
  src,
  durationMs = 0,
  label = 'Voice note playback',
  errorMessage = 'This recording could not be played. Record it again before submitting.',
}) {
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationMs / 1000);
  const [playbackError, setPlaybackError] = useState('');

  useEffect(() => {
    const audio = audioRef.current;

    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(durationMs / 1000);
    setPlaybackError('');
  }, [durationMs, src]);

  useEffect(() => () => {
    audioRef.current?.pause();
  }, []);

  const togglePlayback = async () => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    setPlaybackError('');

    if (!audio.paused) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch {
      setPlaybackError('Playback could not start. Please try again.');
      setIsPlaying(false);
    }
  };

  const seek = (event) => {
    const audio = audioRef.current;
    const nextTime = Number(event.target.value);

    if (!audio || !Number.isFinite(nextTime)) {
      return;
    }

    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
  };

  const resolvedDuration = duration > 0 ? duration : Math.max(durationMs / 1000, 0);
  const seekMaximum = resolvedDuration > 0 ? resolvedDuration : 1;

  return (
    <div className="coach-audio-player" aria-label={label}>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onLoadedMetadata={(event) => {
          const metadataDuration = event.currentTarget.duration;
          if (Number.isFinite(metadataDuration)) {
            setDuration(metadataDuration);
          }
        }}
        onDurationChange={(event) => {
          const nextDuration = event.currentTarget.duration;
          if (Number.isFinite(nextDuration)) {
            setDuration(nextDuration);
          }
        }}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (audioRef.current) {
            audioRef.current.currentTime = 0;
          }
        }}
        onError={() => {
          setIsPlaying(false);
          setPlaybackError(errorMessage);
        }}
      />

      <button
        className="coach-control coach-player-toggle"
        type="button"
        onClick={togglePlayback}
        aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
      >
        <span className={isPlaying ? 'coach-player-pause-icon' : 'coach-player-play-icon'} aria-hidden="true" />
      </button>

      <div className="coach-player-timeline">
        <input
          className="coach-player-seek"
          type="range"
          min="0"
          max={seekMaximum}
          step="0.01"
          value={Math.min(currentTime, seekMaximum)}
          onChange={seek}
          aria-label="Voice note playback position"
          style={{
            '--coach-player-progress': `${Math.min((currentTime / seekMaximum) * 100, 100)}%`,
          }}
        />
        <div className="coach-player-times" aria-hidden="true">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(resolvedDuration)}</span>
        </div>
      </div>

      {playbackError && (
        <p className="coach-inline-error" role="alert">
          {playbackError}
        </p>
      )}
    </div>
  );
}
