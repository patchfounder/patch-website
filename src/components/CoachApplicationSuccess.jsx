import { useEffect, useRef, useState } from 'react';

const REDIRECT_SECONDS = 15;

export default function CoachApplicationSuccess({ firstName = '', email = '' }) {
  const [secondsRemaining, setSecondsRemaining] = useState(REDIRECT_SECONDS);
  const headingRef = useRef(null);

  const returnHome = () => {
    window.location.replace('/');
  };

  useEffect(() => {
    headingRef.current?.focus();

    const interval = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(interval);
          window.location.replace('/');
          return 0;
        }

        return current - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <main className="coach-recruitment-ui coach-success-screen">
      <div className="coach-success-decoration" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <section className="coach-success-card" aria-labelledby="coach-success-title">
        <p className="coach-visually-hidden" role="status">Application submitted successfully.</p>
        <div className="coach-success-mark" aria-hidden="true">✓</div>
        <span className="coach-success-kicker">Application submitted</span>
        <h1 id="coach-success-title" ref={headingRef} tabIndex="-1">Your voice note has been submitted.</h1>
        <p>
          Thanks{firstName ? `, ${firstName}` : ''}. We have your application and will email the
          outcome{email ? ` to ${email}` : ''}.
        </p>
        <p className="coach-success-final-note">
          Your application is final and cannot be edited after submission.
        </p>

        <button className="coach-control coach-primary-button coach-success-action" type="button" onClick={returnHome}>
          Return to Patch
          <span aria-hidden="true">→</span>
        </button>

        <p className="coach-success-redirect">
          Returning to the Patch homepage in {secondsRemaining} {secondsRemaining === 1 ? 'second' : 'seconds'}.
        </p>
      </section>
    </main>
  );
}
