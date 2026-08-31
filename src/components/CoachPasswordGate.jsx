import { useEffect, useRef, useState } from 'react';

function payloadState(payload = {}) {
  const state = String(payload.status || payload.state || payload.code || '').toLowerCase();

  if (payload.unlocked === true || payload.authenticated === true || state === 'unlocked') {
    return 'unlocked';
  }

  if (state === 'not_open' || state === 'not-open' || state === 'notopen') {
    return 'not_open';
  }

  if (
    state === 'unavailable' ||
    state === 'disabled' ||
    payload.available === false ||
    payload.enabled === false
  ) {
    return 'unavailable';
  }

  if (state === 'closed' || payload.open === false || payload.recruitmentOpen === false) {
    return 'closed';
  }

  return 'locked';
}

async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

export default function CoachPasswordGate({ onUnlocked }) {
  const [gateState, setGateState] = useState('checking');
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [isUnlocking, setIsUnlocking] = useState(false);
  const requestRef = useRef(null);

  const checkStatus = async () => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setGateState('checking');
    setPasswordError('');

    try {
      const response = await fetch('/api/recruitment/status', {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await readJson(response);

      if (response.status === 503) {
        setGateState('error');
        return;
      }

      if (!response.ok && response.status !== 401 && response.status !== 403) {
        setGateState('error');
        return;
      }

      const nextState = payloadState(payload);
      if (nextState === 'unlocked') {
        // Opening the applicant route from the back office must always show the
        // password screen, even if this browser still has an older valid cookie.
        setGateState('locked');
        return;
      }

      setGateState(nextState);
    } catch (error) {
      if (error.name !== 'AbortError') {
        setGateState('error');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
    }
  };

  useEffect(() => {
    checkStatus();
    return () => requestRef.current?.abort();
  }, []);

  const unlock = async (event) => {
    event.preventDefault();

    const cleanPassword = password.trim();
    if (!cleanPassword) {
      setPasswordError('Enter your application password.');
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setIsUnlocking(true);
    setPasswordError('');

    try {
      const response = await fetch('/api/recruitment/unlock', {
        method: 'POST',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password: cleanPassword }),
        signal: controller.signal,
      });
      const payload = await readJson(response);
      const nextState = payloadState(payload);

      if (payload.code === 'cohort_not_open') {
        await checkStatus();
        return;
      }

      if (response.ok && !['not_open', 'closed', 'unavailable'].includes(nextState)) {
        setPassword('');
        onUnlocked?.();
        return;
      }

      if (nextState === 'closed') {
        setGateState('closed');
        return;
      }

      if (nextState === 'not_open') {
        setGateState('not_open');
        return;
      }

      if (response.status === 503) {
        setGateState('error');
        return;
      }

      if (nextState === 'unavailable') {
        setGateState('unavailable');
        return;
      }

      if (response.status === 401 || response.status === 403) {
        setPasswordError('That password was not recognised. Check the invitation and try again.');
        return;
      }

      setPasswordError('Application access could not be unlocked. Please try again.');
    } catch (error) {
      if (error.name !== 'AbortError') {
        setPasswordError('We could not reach the application service. Check your connection and try again.');
      }
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
      }
      setIsUnlocking(false);
    }
  };

  const showsLogin = ['locked', 'not_open', 'closed', 'unavailable'].includes(gateState);
  const canUnlock = gateState === 'locked';
  const accessMessage =
    gateState === 'unavailable'
      ? {
          title: 'Applications are not currently open',
          copy: 'No application password is active. Use the timing and password in your LinkedIn invitation, then check again.',
        }
      : gateState === 'not_open'
        ? {
            title: 'This cohort has not opened yet',
            copy: 'A cohort password exists, but it will only work when the application window opens.',
          }
        : gateState === 'closed'
          ? {
              title: 'This cohort has closed',
              copy: 'This application password is no longer active. Follow the timing in your LinkedIn invitation.',
            }
          : null;

  return (
    <main className="coach-recruitment-ui coach-gate-shell">
      <div className="coach-gate-brand-panel" aria-hidden="true">
        <div className="coach-gate-brand-word">PATCH</div>
        <div className="coach-gate-orbit coach-gate-orbit-one" />
        <div className="coach-gate-orbit coach-gate-orbit-two" />
        <div className="coach-gate-signal">
          {Array.from({ length: 18 }, (_, index) => <i key={index} />)}
        </div>
        <p>Find your voice.<br />Shape your future.</p>
      </div>

      <section className="coach-gate-form-panel" aria-labelledby="coach-gate-title">
        <a className="coach-gate-mobile-brand" href="/" aria-label="Patch homepage">PATCH</a>

        {gateState === 'checking' && (
          <div className="coach-gate-state coach-gate-loading" role="status" aria-live="polite">
            <span className="coach-loading-mark" aria-hidden="true" />
            <h1 id="coach-gate-title">Checking application access</h1>
            <p>This will only take a moment.</p>
          </div>
        )}

        {showsLogin && (
          <form className="coach-gate-form" onSubmit={unlock} noValidate>
            <span className="coach-gate-kicker">Legal Speaking Coach</span>
            <h1 id="coach-gate-title">Application login</h1>
            <p>
              Enter the application password from the invitation sent to you through LinkedIn.
            </p>

            {accessMessage && (
              <div className="coach-gate-access-note" role="status">
                <strong>{accessMessage.title}</strong>
                <span>{accessMessage.copy}</span>
              </div>
            )}

            <label className="coach-field coach-gate-password" htmlFor="coach-application-password">
              <span>Application password</span>
              <input
                className="coach-field-input"
                id="coach-application-password"
                name="password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setPasswordError('');
                }}
                autoComplete="current-password"
                maxLength="200"
                disabled={!canUnlock || isUnlocking}
                required
                aria-invalid={Boolean(passwordError)}
                aria-describedby={passwordError ? 'coach-password-error' : 'coach-password-note'}
              />
              <small id="coach-password-note">Passwords are case-sensitive.</small>
              {passwordError && (
                <small className="coach-field-error" id="coach-password-error" role="alert">
                  {passwordError}
                </small>
              )}
            </label>

            <button
              className="coach-control coach-primary-button coach-gate-submit"
              type="submit"
              disabled={!canUnlock || isUnlocking}
            >
              {isUnlocking
                ? 'Unlocking…'
                : gateState === 'unavailable'
                  ? 'No active password'
                  : gateState === 'not_open'
                    ? 'Applications not open'
                    : gateState === 'closed'
                      ? 'Applications closed'
                      : 'Continue'}
              {canUnlock && !isUnlocking && <span aria-hidden="true">→</span>}
            </button>

            {!canUnlock && (
              <button
                className="coach-control coach-secondary-button coach-gate-refresh"
                type="button"
                onClick={checkStatus}
              >
                Check again
              </button>
            )}

            <p className="coach-gate-help">
              The application includes a voice note of up to 60 seconds. Use Safari or Chrome and
              allow microphone access when prompted.
            </p>
          </form>
        )}

        {gateState === 'error' && (
          <div className="coach-gate-state" role="status">
            <span className="coach-gate-state-mark" aria-hidden="true">!</span>
            <span className="coach-gate-kicker">Legal Speaking Coach</span>
            <h1 id="coach-gate-title">We could not check application access</h1>
            <p>No application details have been submitted. Check your connection and try again shortly.</p>
            <button className="coach-control coach-secondary-button" type="button" onClick={checkStatus}>
              Try again
            </button>
            <a className="coach-gate-home-link" href="/">Return to Patch</a>
          </div>
        )}
      </section>
    </main>
  );
}
