import { useEffect, useRef, useState } from 'react';

const features = [
  {
    title: 'Design',
    subtext:
      'Choose a weekly plan designed to keep your speaking practice consistent. Pick a time that works, build a routine, and make adjustments when your schedule changes.',
  },
  {
    title: 'Intelligent',
    subtext:
      'Before each 15-minute session, watch a short video from leading content providers. This gives you and your coach a starting point for engaging conversations.',
  },
  {
    title: 'Voice',
    subtext:
      'Train over voice call, not video. No screen required, no fixed location. Just you and your coach, building the communication skills that work in the real world.',
  },
  {
    title: 'Track',
    subtext:
      'At the end of every session, your coach will post a performance score so that you can track progress and see how your speaking skills are improving.',
  },
];

const calendarDays = [
  [
    null,
    { date: 1, selected: true },
    { date: 2 },
    { date: 3, selected: true },
    { date: 4 },
  ],
  [
    { date: 7 },
    { date: 8, selected: true },
    { date: 9 },
    { date: 10, selected: true },
    { date: 11 },
  ],
  [
    { date: 14 },
    { date: 15, selected: true },
    { date: 16 },
    { date: 17, selected: true },
    { date: 18 },
  ],
  [
    { date: 21 },
    { date: 22, selected: true },
    { date: 23 },
    { date: 24, selected: true },
    { date: 25 },
  ],
  [
    { date: 28 },
    { date: 29, selected: true },
    { date: 30 },
    null,
    null,
  ],
];

const CHANNELS = [
  {
    key: 'ft',
    label: 'Financial Times',
    logo: 'FT',
    className: 'patch-channel-slide--ft',
  },
  {
    key: 'wsj',
    label: 'The Wall Street Journal',
    logo: 'WSJ',
    className: 'patch-channel-slide--wsj',
  },
  {
    key: 'school',
    label: 'The School of Life',
    logo: (
      <>
        THE
        <br />
        SCHOOL
        <br />
        OF LIFE
      </>
    ),
    className: 'patch-channel-slide--school',
  },
  {
    key: 'economist',
    label: 'The Economist',
    logo: (
      <>
        THE
        <br />
        ECONOMIST
      </>
    ),
    className: 'patch-channel-slide--economist',
  },
  {
    key: 'bloomberg',
    label: 'Bloomberg Law',
    logo: (
      <>
        Bloomberg
        <br />
        Law
      </>
    ),
    className: 'patch-channel-slide--bloomberg',
  },
];

const SCORE_HISTORY = [4.8, 6.6, 7.3, 8.1, 9.4];

function useMockupInView({
  desktopThreshold = 0.35,
  mobileThreshold = 0.65,
  mobileRootMargin = '0px 0px -8% 0px',
} = {}) {
  const ref = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element) {
      return undefined;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return undefined;
    }

    const isMobile = window.matchMedia('(max-width: 820px)').matches;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      isMobile
        ? { threshold: mobileThreshold, rootMargin: mobileRootMargin }
        : { threshold: desktopThreshold },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [desktopThreshold, mobileRootMargin, mobileThreshold]);

  return [ref, isVisible];
}

function ScoreRing({
  value,
  size,
  stroke,
  large = false,
  animate = false,
  duration = 20000,
}) {
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    if (!animate) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      setIsActive(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [animate]);

  const safeValue = Math.max(0, Math.min(10, value));
  const progress = safeValue / 10;

  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashArray = circumference;
  const dashOffset = isActive ? circumference * (1 - progress) : circumference;

  const label = large ? `${safeValue} out of 10` : `${safeValue}`;

  return (
    <div
      className={large ? 'patch-score-ring patch-score-ring--large' : 'patch-score-ring'}
      aria-label={label}
      style={large ? { width: 'min(66%, 190px)', aspectRatio: '1 / 1' } : undefined}
    >
      <svg
        className="patch-score-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
      >
        <circle
          className="patch-score-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
        />
        <circle
          className="patch-score-ring-progress"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={stroke}
          strokeDasharray={dashArray}
          strokeDashoffset={dashOffset}
          style={{
            transition: animate
              ? `stroke-dashoffset ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`
              : 'none',
          }}
        />
      </svg>

      <div className="patch-score-ring-content">
        {large ? (
          <>
            <div className="patch-score-value">9</div>
            <div className="patch-score-subvalue">out of 10</div>
          </>
        ) : (
          <div className="patch-score-history-value">{safeValue.toFixed(1)}</div>
        )}
      </div>
    </div>
  );
}

function ScoreTrackingMockup() {
  const [scoreRef, isScoreVisible] = useMockupInView({
    mobileThreshold: 0.62,
    mobileRootMargin: '0px 0px -10% 0px',
  });

  return (
    <div
      className="product-grid-media patch-score-card"
      ref={scoreRef}
      aria-label="Session score tracking"
    >
      <div className="patch-score-main">
        <div className="patch-score-kicker">Last call</div>

        <ScoreRing value={9} size={210} stroke={5} large={true} animate={isScoreVisible} />

        <div className="patch-score-divider" />

        <div className="patch-score-section-title">Score history</div>

        <div className="patch-score-history-row">
          {SCORE_HISTORY.map((score) => (
            <div className="patch-score-history-item" key={score}>
              <ScoreRing value={score} size={62} stroke={3} animate={isScoreVisible} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ChannelsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % CHANNELS.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      className="product-grid-media patch-channels-card"
      aria-label="Intelligent conversations content channels carousel"
    >
      <div className="patch-channels-stage">
        {CHANNELS.map((channel, index) => (
          <div
            className={[
              'patch-channel-slide',
              channel.className,
              index === activeIndex ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={channel.key}
            aria-hidden={index !== activeIndex}
          >
            <div className="patch-channel-logo">
              <span>{channel.logo}</span>
            </div>

            <span className="patch-channel-label">{channel.label}</span>
          </div>
        ))}
      </div>

      <div className="patch-channels-dots" aria-hidden="true">
        {CHANNELS.map((channel, index) => (
          <span
            className={[
              'patch-channels-dot',
              index === activeIndex ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            key={channel.key}
          />
        ))}
      </div>
    </div>
  );
}

function VoiceCallMockup() {
  const [voiceRef, isVoiceVisible] = useMockupInView({
    mobileThreshold: 0.62,
    mobileRootMargin: '0px 0px -10% 0px',
  });
  const [seconds, setSeconds] = useState(14 * 60 + 32);

  useEffect(() => {
    if (!isVoiceVisible) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current >= 14 * 60 + 59) {
          window.clearInterval(timer);
          return 15 * 60;
        }

        return current + 1;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isVoiceVisible]);

  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const secs = String(seconds % 60).padStart(2, '0');
  const callDuration = `${minutes}:${secs}`;

  return (
    <div
      className="product-grid-media patch-voice-card"
      ref={voiceRef}
      aria-label="Voice call with your coach"
    >
      <div className="patch-voice-speaker" aria-hidden="true" />

      <div className="patch-voice-main">
        <span className="patch-voice-kicker">Patch call</span>

        <div className="patch-voice-avatar" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="8" r="4" />
            <path d="M4.5 20c0.8-4.1 3.8-6.5 7.5-6.5s6.7 2.4 7.5 6.5" />
          </svg>
        </div>

        <div className="patch-voice-person">
          <span className="patch-voice-name">Your coach</span>
        </div>

        <div className="patch-voice-timer" aria-label={`Call duration ${callDuration}`}>
          {callDuration}
        </div>

        <div className="patch-voice-controls" aria-hidden="true">
          <div className="patch-voice-control patch-voice-control--secondary">
            <svg viewBox="0 0 24 24">
              <path d="M12 3a3 3 0 0 0-3 3v4a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
              <path d="M5 10a7 7 0 0 0 14 0" />
              <path d="M12 17v3" />
              <path d="M8.5 20h7" />
            </svg>
          </div>

          <div className="patch-voice-control patch-voice-control--end">
            <svg viewBox="0 0 24 24">
              <path d="M6.2 14.8c3.8-3.1 7.8-3.1 11.6 0" />
              <path d="M8.1 13.6l-1.7 2.1" />
              <path d="M15.9 13.6l1.7 2.1" />
            </svg>
          </div>

          <div className="patch-voice-control patch-voice-control--secondary">
            <svg viewBox="0 0 24 24">
              <path d="M5 10v4h4l5 4V6L9 10H5z" />
              <path d="M17 9.5a4 4 0 0 1 0 5" />
              <path d="M19.5 7a7.5 7.5 0 0 1 0 10" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

function CalendarMockup() {
  const calendarRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);
  let selectedIndex = 0;

  useEffect(() => {
    const calendar = calendarRef.current;

    if (!calendar) {
      return undefined;
    }

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      setIsVisible(true);
      return undefined;
    }

    const isMobile = window.matchMedia('(max-width: 820px)').matches;
    const observer = new IntersectionObserver(
      ([entry]) => setIsVisible(entry.isIntersecting),
      isMobile ? { threshold: 0.72, rootMargin: '0px 0px -8% 0px' } : { threshold: 0.35 },
    );

    observer.observe(calendar);

    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={`product-grid-media product-calendar-mockup${isVisible ? ' is-visible' : ''}`}
      ref={calendarRef}
      aria-label="Weekly session plan"
    >
      <div className="product-calendar-grid">
        {['M', 'T', 'W', 'T', 'F'].map((weekday, index) => (
          <span className="product-calendar-weekday" key={`${weekday}-${index}`}>
            {weekday}
          </span>
        ))}

        {calendarDays.flat().map((day, index) => {
          const sequence = day?.selected ? selectedIndex++ : null;

          return (
            <span className="product-calendar-day" key={`calendar-day-${index}`}>
              {day && (
                <span
                  className={
                    day.selected ? 'product-calendar-date selected' : 'product-calendar-date'
                  }
                  style={day.selected ? { '--calendar-sequence': sequence } : undefined}
                >
                  {day.date}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

export default function ProductShowcase() {
  return (
    <section className="section product-section" id="product">
      <div className="page-shell">
        <div className="section-heading product-heading">
          <h2 id="product-grid-title">Flexibility built-in</h2>
          <p>
            Fifteen-minute speaking sessions anytime, anywhere. Built around the way lawyers
            actually work, because we understand the pace, pressure and precision your legal
            practice demands.
          </p>
        </div>

        <div className="product-grid" aria-labelledby="product-grid-title">
          {features.map((feature, index) => (
            <article className="product-grid-card" key={feature.title}>
              {index === 0 ? (
                <CalendarMockup />
              ) : index === 1 ? (
                <ChannelsCarousel />
              ) : index === 2 ? (
                <VoiceCallMockup />
              ) : index === 3 ? (
                <ScoreTrackingMockup />
              ) : (
                <div
                  className="product-grid-media product-grid-image-placeholder"
                  aria-hidden="true"
                />
              )}
              <h3>{feature.title}</h3>
              <p>{feature.subtext}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
