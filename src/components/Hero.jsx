const DownloadAction = ({ light = false, onDownloadClick }) => (
  <div className={`download-action ${light ? 'download-action-light' : ''}`}>
    {/* TODO: Replace with the approved live app download destination. */}
    <a className="button button-primary" href="#download" onClick={onDownloadClick}>
      Download the app
    </a>
    <span>Available on the App Store and Google Play</span>
  </div>
);

export { DownloadAction };

const HERO_VIDEO_SRC = '/hero-background.mp4';
// TODO: Add an approved local poster image when available.
const HERO_POSTER_SRC = '';

export default function Hero({ onDownloadClick }) {
  return (
    <section className="hero" id="top">
      <div
        className="hero-media"
        style={{
          '--hero-poster': HERO_POSTER_SRC ? `url("${HERO_POSTER_SRC}")` : 'none',
        }}
        aria-hidden="true"
      >
        <video
          className="hero-background-video"
          autoPlay
          muted
          loop
          playsInline
          poster={HERO_POSTER_SRC || undefined}
        >
          <source src={HERO_VIDEO_SRC} type="video/mp4" />
        </video>
        <div className="hero-video-poster" />
        <div className="hero-video-overlay" />
      </div>

      <div className="page-shell hero-layout">
        <div className="hero-composition" aria-label="Patch product journey preview">
          <div className="hero-visual-block">
            <div className="hero-visual-backdrop" aria-hidden="true" />

            <article className="patch-device">
              <div className="device-status">
                <img className="device-brand-logo" src="/patch-icon.png" alt="Patch" />
              </div>

              <div className="device-heading">
                <div>
                  <span className="interface-label">Your next session</span>
                  <h2>Ready to speak?</h2>
                </div>
                <span className="device-avatar" aria-hidden="true">
                  P
                </span>
              </div>

              <section className="device-session">
                <div className="session-meta">
                  <span className="session-day">Thu</span>
                  <span>
                    <strong>Coach session</strong>
                    <small>09:00 CET · 15 minutes</small>
                  </span>
                </div>
                <span className="session-topic">
                  Manage Your Time More Effectively: TED Talks
                </span>
                <button type="button">Start Call</button>
              </section>

              <section className="device-calendar">
                <header>
                  <span>
                    <strong>June</strong>
                    <small>Weekly consistency</small>
                  </span>
                  <span className="calendar-progress">2 per week</span>
                </header>
                <div className="device-week">
                  {['M', 'T', 'W', 'T', 'F'].map((day, index) => (
                    <span
                      className={index === 1 || index === 3 ? 'selected' : ''}
                      key={`${day}-${index}`}
                    >
                      <small>{day}</small>
                      {15 + index}
                    </span>
                  ))}
                </div>
              </section>

              <section className="device-progress">
                <div>
                  <span className="interface-label">Average score</span>
                  <strong>8/10</strong>
                </div>
                <div className="progress-chart" aria-label="Score improving over four sessions">
                  <span style={{ '--score-height': '35%' }} />
                  <span style={{ '--score-height': '48%' }} />
                  <span style={{ '--score-height': '62%' }} />
                  <span className="current" style={{ '--score-height': '78%' }} />
                </div>
                <span className="progress-change">+0.7</span>
              </section>

              <nav className="device-nav" aria-label="App preview navigation">
                <span className="active" />
                <span />
                <span />
                <span />
              </nav>
            </article>
          </div>
        </div>

        <div className="hero-copy">
          <h1>Legal speaking, without limits.</h1>
          <div className="hero-lede-row">
            <p className="hero-lede">
              Speak one-to-one with your coach, designed for high-performance lawyers.
            </p>
            {/* TODO: Replace with the approved live app download destination. */}
            <a className="nav-cta" href="#download" onClick={onDownloadClick}>
              <span>Download</span>
              <span className="nav-cta-arrow" aria-hidden="true">
                →
              </span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
