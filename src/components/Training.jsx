import { useEffect } from 'react';
import './Training.css';

const CALL_MANUAL_URL = '/training/patch-call-process.pdf';

function ExternalLinkIcon() {
  return (
    <svg className="coach-training-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h6v6m0-6L9 15M10 4H4v16h16v-6" />
    </svg>
  );
}

export default function Training() {
  useEffect(() => {
    const previousTitle = document.title;
    const robotsMeta = document.querySelector('meta[name="robots"]');
    const previousRobotsContent = robotsMeta?.getAttribute('content');
    const routeRobotsMeta = robotsMeta || document.createElement('meta');

    routeRobotsMeta.setAttribute('name', 'robots');
    routeRobotsMeta.setAttribute('content', 'noindex, nofollow');

    if (!robotsMeta) {
      document.head.appendChild(routeRobotsMeta);
    }

    document.title = 'Patch Coach Training | Patch';

    return () => {
      document.title = previousTitle;

      if (!robotsMeta) {
        routeRobotsMeta.remove();
      } else if (previousRobotsContent !== null) {
        robotsMeta.setAttribute('content', previousRobotsContent);
      } else {
        robotsMeta.removeAttribute('content');
      }
    };
  }, []);

  return (
    <div className="coach-training-page">
      <header className="coach-training-header">
        <div className="coach-training-header-inner">
          <a href="#top" className="coach-training-brand" aria-label="Patch, top of training page">
            <img src="/patch-logo-2.png" alt="Patch" width="116" height="50" />
          </a>
          <span className="coach-training-header-caption">Coach training</span>
        </div>
      </header>

      <main className="coach-training-shell" id="top">
        <div className="coach-training-intro">
          <p className="coach-training-eyebrow">Patch coaching</p>
          <h1>Your coach training.</h1>
          <p className="coach-training-intro-copy">
            Welcome to Patch. Before your first call, watch the training video and download your call script.
          </p>
        </div>

        <section className="coach-training-card" aria-labelledby="video-title">
          <div className="coach-training-section-heading">
            <span className="coach-training-section-number" aria-hidden="true">01</span>
            <h2 id="video-title">Watch the training video</h2>
          </div>
          <div className="coach-training-video-frame">
            <iframe
              src="https://www.youtube-nocookie.com/embed/KLXFHB4zVMI?rel=0"
              title="How to Deliver a Patch Call in 7 Steps"
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
          </div>
          <div className="coach-training-video-caption">
            <p>How to Deliver a Patch Call in 7 Steps</p>
            <a
              className="coach-training-text-link"
              href="https://www.youtube.com/watch?v=KLXFHB4zVMI"
              target="_blank"
              rel="noopener noreferrer"
            >
              Watch on YouTube <ExternalLinkIcon />
            </a>
          </div>
        </section>

        <section className="coach-training-card" aria-labelledby="script-title">
          <div className="coach-training-section-heading">
            <span className="coach-training-section-number" aria-hidden="true">02</span>
            <h2 id="script-title">Download your call script</h2>
          </div>
          <div className="coach-training-script-content">
            <a
              href={CALL_MANUAL_URL}
              className="coach-training-manual-preview"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open the Patch Call Process PDF in a new tab"
            >
              <img
                src="/training/manual-first-page.png"
                alt="Preview of the Patch Call Process script"
                width="248"
                height="351"
                loading="lazy"
              />
              <span>Patch Call Process</span>
            </a>
            <div className="coach-training-script-details">
              <p className="coach-training-eyebrow">Your call manual</p>
              <h3>Patch Call Process</h3>
              <p className="coach-training-file-meta">PDF · 1 page · 303 KB</p>
              <p className="coach-training-script-description">
                The step-by-step script for delivering a Patch Call, including the Patch audio recording.
              </p>
              <div className="coach-training-script-actions">
                <a className="coach-training-download" href={CALL_MANUAL_URL} download="Patch Call Process.pdf">
                  <svg className="coach-training-icon" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
                  </svg>
                  Download call script
                </a>
                <a className="coach-training-text-link" href={CALL_MANUAL_URL} target="_blank" rel="noopener noreferrer">
                  Open PDF <ExternalLinkIcon />
                </a>
              </div>
            </div>
          </div>
        </section>

        <p className="coach-training-keep-handy">
          Keep this page handy. You can return to the video and script whenever you need them.
        </p>
        <footer className="coach-training-footer">PATCH · COACH TRAINING</footer>
      </main>
    </div>
  );
}
