import { useEffect, useState } from 'react';
import './ActivationHost.css';

async function hostRequest(path, options = {}) {
  const response = await fetch(`/api/training${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || result.error?.message || 'Please try again in a moment.');
    error.status = response.status;
    throw error;
  }
  return result;
}

export function formatHostAppointment(value, timeZone) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZone,
  }).format(date);
}

export default function ActivationHost() {
  const [signedIn, setSignedIn] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [accessKey, setAccessKey] = useState('');
  const [coachName, setCoachName] = useState('');
  const [coachEmail, setCoachEmail] = useState('');
  const [startAt, setStartAt] = useState('');
  const [bookingReference, setBookingReference] = useState('');
  const [contactsVerified, setContactsVerified] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lastCreated, setLastCreated] = useState(null);
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function refresh() {
    const result = await hostRequest('/host/sessions');
    setSessions(result.sessions || []);
    setSignedIn(true);
  }

  useEffect(() => {
    document.title = 'Host Activation | Patch Academy';
    refresh().catch((failure) => {
      if (failure.status !== 401) setError('Host access is not available yet. Please try again once setup is complete.');
    });
  }, []);

  async function signIn(event) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      await hostRequest('/host/login', { method: 'POST', body: JSON.stringify({ accessKey }) });
      setAccessKey('');
      await refresh();
    } catch (failure) {
      setError(failure.status === 401 ? 'That host access key was not recognised.' : failure.message);
    } finally { setBusy(false); }
  }

  async function addSession(event) {
    event.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const date = new Date(startAt);
      if (!Number.isFinite(date.getTime())) throw new Error('Choose an appointment time.');
      const result = await hostRequest('/host/sessions', {
        method: 'POST',
        body: JSON.stringify({ coachName: coachName.trim(), coachEmail: coachEmail.trim(), startAt: date.toISOString(), bookingReference: bookingReference.trim(), contactsVerified }),
      });
      setLastCreated(result);
      setMessage('Your five-minute room is ready. Share the coach invitation below.');
      setCoachName(''); setCoachEmail(''); setStartAt(''); setBookingReference(''); setContactsVerified(false);
      await refresh();
    } catch (failure) {
      if (failure.status === 401) setSignedIn(false);
      setError(failure.message);
    } finally { setBusy(false); }
  }

  async function copyLink(value) {
    try { await navigator.clipboard.writeText(value); setMessage('Invitation copied.'); }
    catch { setMessage('Select and copy the full invitation address below.'); }
  }

  async function signOut() {
    setBusy(true); setError('');
    try {
      await hostRequest('/host/logout', { method: 'POST', body: '{}' });
      setSignedIn(false); setSessions([]); setLastCreated(null); setMessage('Signed out.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  const invitations = lastCreated?.coachUrl ? [lastCreated] : [];
  return (
    <div className="activation-host">
      <header className="activation-host-header">
        <img src="/patch-logo-2.png" alt="Patch" width="116" height="50" />
        <span>Academy · Host</span>
      </header>
      <main>
        <p className="activation-host-eyebrow">Activation</p>
        <h1>Your five-minute check-ins.</h1>
        <p className="activation-host-intro">Open your room at the booked time. Your coach joins the same room using their own invitation.</p>
        {error && <p className="activation-host-error" role="alert">{error}</p>}
        <p className="activation-host-feedback" role="status">{message}</p>
        {!signedIn ? (
          <form onSubmit={signIn} className="activation-host-panel">
            <h2>Host sign in</h2>
            <label htmlFor="activation-host-key">Your private host access key</label>
            <input id="activation-host-key" type="password" autoComplete="current-password" required value={accessKey} onChange={(event) => setAccessKey(event.target.value)} />
            <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
          </form>
        ) : (
          <>
            <section className="activation-host-panel">
              <div className="activation-host-section-title"><h2>Your sessions</h2><button type="button" className="activation-host-secondary" onClick={signOut} disabled={busy}>Sign out</button></div>
              <p className="activation-host-small">Times shown in {timeZone}.</p>
              {sessions.length === 0 && <p>No Activation rooms yet.</p>}
              <ul className="activation-host-sessions">
                {sessions.map((session) => {
                  const id = session.sessionId || session.id;
                  const hostUrl = session.hostUrl || `${window.location.origin}/training/activation#session=${encodeURIComponent(id)}`;
                  return <li key={id}>
                    <div className="activation-host-session-heading"><strong>{session.coachName}</strong><span>{session.status}</span></div>
                    <p>{formatHostAppointment(session.startAt, timeZone)} · 5 minutes</p>
                    <p className="activation-host-small">Open your room</p>
                    <a href={hostUrl}>{hostUrl}</a>
                    {session.coachUrl && <div className="activation-host-invitation"><p className="activation-host-small">Coach invitation</p><a href={session.coachUrl}>{session.coachUrl}</a><button type="button" className="activation-host-secondary" onClick={() => copyLink(session.coachUrl)}>Copy invitation</button></div>}
                  </li>;
                })}
              </ul>
            </section>
            <form onSubmit={addSession} className="activation-host-panel">
              <h2>Add a booked session</h2>
              <p className="activation-host-small">Use the agreed appointment time. Adding a room does not change your calendar or send invitations.</p>
              <label htmlFor="activation-coach-name">Coach’s name</label>
              <input id="activation-coach-name" autoComplete="off" maxLength="100" required value={coachName} onChange={(event) => setCoachName(event.target.value)} />
              <label htmlFor="activation-coach-email">Coach’s email</label>
              <input id="activation-coach-email" type="email" autoComplete="off" maxLength="254" required value={coachEmail} onChange={(event) => setCoachEmail(event.target.value)} />
              <label htmlFor="activation-start">Appointment time · {timeZone}</label>
              <input id="activation-start" type="datetime-local" required value={startAt} onChange={(event) => setStartAt(event.target.value)} />
              <label htmlFor="activation-booking-reference">Booking reference <span className="activation-host-small">(optional)</span></label>
              <input id="activation-booking-reference" maxLength="200" value={bookingReference} onChange={(event) => setBookingReference(event.target.value)} />
              <label className="activation-host-check"><input type="checkbox" required checked={contactsVerified} onChange={(event) => setContactsVerified(event.target.checked)} /><span>I have verified this coach is saved in my Apple Contacts.</span></label>
              <button type="submit" disabled={busy}>{busy ? 'Creating room…' : 'Create five-minute room'}</button>
            </form>
            {invitations.map((invitation) => <section className="activation-host-panel" key={invitation.coachUrl}>
              <h2>Coach invitation</h2><p className="activation-host-small">Share this private address with the coach for this appointment.</p>
              <a href={invitation.coachUrl}>{invitation.coachUrl}</a>
              <button type="button" onClick={() => copyLink(invitation.coachUrl)}>Copy invitation</button>
            </section>)}
          </>
        )}
      </main>
    </div>
  );
}
