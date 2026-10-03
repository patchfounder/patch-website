import { useEffect, useState } from 'react';
import '../administration.css';

function retryMessage(value) {
  const seconds = Number(value);
  const wait = value && Number.isFinite(seconds)
    ? Math.ceil(seconds)
    : Math.ceil((Date.parse(value) - Date.now()) / 1000);
  return Number.isFinite(wait) && wait > 0
    ? `Too many attempts. Try again in ${wait} seconds.`
    : 'Too many attempts. Please wait a moment before trying again.';
}

export default function Administration() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const previousTitle = document.title;
    const metadata = [
      { name: 'robots', content: 'noindex, nofollow, noarchive' },
      { name: 'referrer', content: 'no-referrer' },
    ].map(({ name, content }) => {
      const existing = document.head.querySelector(`meta[name="${name}"]`);
      const element = existing || document.createElement('meta');
      const previousContent = existing?.getAttribute('content');
      if (!existing) {
        element.setAttribute('name', name);
        document.head.appendChild(element);
      }
      element.setAttribute('content', content);
      return { element, created: !existing, previousContent };
    });
    document.title = 'Administration | Patch';
    return () => {
      document.title = previousTitle;
      metadata.forEach(({ element, created, previousContent }) => {
        if (created) element.remove();
        else if (previousContent == null) element.removeAttribute('content');
        else element.setAttribute('content', previousContent);
      });
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;
    if (!password) {
      setError('Enter your master password.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/recruitment/reviewer/login', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (response.status === 401) {
        setError('Incorrect password. Please try again.');
        return;
      }
      if (response.status === 429) {
        setError(retryMessage(response.headers.get('Retry-After')));
        return;
      }
      if (response.status === 503) {
        setError('Sign-in is temporarily unavailable. Please try again shortly.');
        return;
      }
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.ok !== true) {
        setError('Unable to sign in. Please try again.');
        return;
      }
      setPassword('');
      window.location.replace('/assessment');
    } catch {
      setError('Unable to connect. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="administration-page">
      <header className="administration-header">
        <a className="administration-brand" href="/" aria-label="Patch home">
          <img src="/patch-logo-2.png" alt="Patch" />
        </a>
      </header>
      <div className="administration-shell">
        <section className="administration-card" aria-labelledby="administration-title">
          <p className="administration-eyebrow">Private access</p>
          <h1 className="administration-title" id="administration-title">Administration</h1>
          <p className="administration-intro">Sign in to the application back office.</p>
          <form className="administration-form" onSubmit={handleSubmit} aria-busy={pending}>
            <label className="administration-label" htmlFor="administration-password">Master password</label>
            <div className="administration-password-wrap">
              <input
                className="administration-password"
                id="administration-password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                autoCapitalize="none"
                spellCheck={false}
                value={password}
                onChange={(event) => { setPassword(event.target.value); setError(''); }}
                disabled={pending}
                required
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'administration-error' : undefined}
              />
              <button
                className="administration-password-toggle"
                type="button"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                aria-controls="administration-password"
                onClick={() => setShowPassword((visible) => !visible)}
                disabled={pending}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                  {showPassword && <path d="m3 3 18 18" />}
                </svg>
              </button>
            </div>
            {error && (
              <p className="administration-error" id="administration-error" role="alert">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v6m0 4h.01" />
                </svg>
                <span>{error}</span>
              </p>
            )}
            <button className="administration-submit" type="submit" disabled={pending}>
              {pending ? 'Signing in…' : 'Sign in'}
              {!pending && <span aria-hidden="true">→</span>}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
