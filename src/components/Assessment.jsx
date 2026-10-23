import { useCallback, useEffect, useMemo, useState } from 'react';
import AssessmentQueue from './AssessmentQueue.jsx';
import AssessmentCohorts from './AssessmentCohorts.jsx';
import '../assessment.css';

const REVIEWER_API = '/api/recruitment/reviewer';
const ASSESSMENT_VIEWS = new Set(['inbox', 'pass', 'fail', 'rejected', 'invited']);

function currentAssessmentView() {
  const view = window.location.hash.slice(1);
  return ASSESSMENT_VIEWS.has(view) ? view : 'inbox';
}

class ReviewerRequestError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ReviewerRequestError';
    this.status = status;
    this.payload = payload;
  }
}

async function reviewerRequest(path, options = {}) {
  const { body, headers, ...requestOptions } = options;
  const response = await fetch(`${REVIEWER_API}${path}`, {
    ...requestOptions,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
  });

  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (!response.ok) {
    const message =
      payload?.message ||
      payload?.error ||
      (response.status === 401 || response.status === 403
        ? 'This assessment session is invalid or has expired.'
        : 'The reviewer service could not complete that request.');
    throw new ReviewerRequestError(message, response.status, payload);
  }

  return payload;
}

function normalizeReviewerState(payload) {
  const state = payload && typeof payload === 'object' ? payload : {};
  const queue = Array.isArray(state.queue)
    ? state.queue
    : Array.isArray(state.pendingApplications)
      ? state.pendingApplications
      : [];
  const currentCohort = state.currentCohort || state.current_cohort || null;
  const previousCohort = state.previousCohort || state.previous_cohort || null;

  const countFrom = (...values) => {
    for (const value of values) {
      if (value === undefined || value === null || value === '') continue;
      const count = Number(value);
      if (Number.isFinite(count) && count >= 0) return Math.floor(count);
    }
    return 0;
  };

  return {
    authenticated: state.authenticated === true,
    currentCohort,
    previousCohort,
    queue,
    history: Array.isArray(state.history)
      ? state.history
      : Array.isArray(state.processedApplications) ? state.processedApplications : [],
    current: state.current || state.currentApplication || queue[0] || null,
    pendingTotal: countFrom(state.pendingTotal, currentCohort?.pendingCount, queue.length),
  };
}

function applicationId(application) {
  return application?.id || application?.applicationId || application?.application_id || null;
}

function isClearedTeamDecision(application, expectedId) {
  return Boolean(
    application
    && String(applicationId(application)) === String(expectedId)
    && application.decision === 'pass'
    && application.teamDecision === ''
    && application.teamDecidedAt === '',
  );
}

function applicationTimestamp(application) {
  const raw =
    application?.receivedAt ||
    application?.submittedAt ||
    application?.submitted_at ||
    application?.createdAt ||
    application?.created_at;
  const time = raw ? Date.parse(raw) : Number.NaN;
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

function buildQueue(current, queue) {
  const candidates = [current, ...(Array.isArray(queue) ? queue : [])].filter(Boolean);
  const seen = new Set();

  return candidates
    .filter((application) => {
      const id = applicationId(application);
      if (!id) return true;
      if (seen.has(String(id))) return false;
      seen.add(String(id));
      return true;
    })
    .sort((left, right) => applicationTimestamp(left) - applicationTimestamp(right));
}

function LoadingScreen() {
  return (
    <main className="assessment-access assessment-access-loading" aria-busy="true">
      <div className="assessment-access-card">
        <span className="assessment-loading-mark" aria-hidden="true" />
        <p>Opening the assessment queue…</p>
      </div>
    </main>
  );
}

function InvalidSession() {
  return (
    <main className="assessment-access">
      <section className="assessment-access-card" aria-labelledby="assessment-access-title">
        <p className="assessment-eyebrow">Private reviewer access</p>
        <h1 id="assessment-access-title">
          Sign in to the application back office.
        </h1>
        <p>
          Your session is unavailable or has expired. Enter your master password on the application login page to continue.
        </p>
        <a className="assessment-button assessment-button-primary" href="/application">
          Sign in
        </a>
      </section>
    </main>
  );
}

export default function Assessment() {
  const [reviewerState, setReviewerState] = useState({
    authenticated: null,
    currentCohort: null,
    previousCohort: null,
    queue: [],
    history: [],
    current: null,
    pendingTotal: 0,
  });
  const [activeView, setActiveView] = useState(currentAssessmentView);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const invalidateReviewerSession = useCallback(() => {
    setReviewerState(normalizeReviewerState({ authenticated: false }));
    setNotice('');
    setPageError('');
  }, []);

  useEffect(() => {
    const restoreView = () => {
      setActiveView(currentAssessmentView());
    };
    window.addEventListener('hashchange', restoreView);
    return () => window.removeEventListener('hashchange', restoreView);
  }, []);

  const selectView = (view) => {
    if (!ASSESSMENT_VIEWS.has(view)) return;
    setActiveView(view);
    setNotice('');
    if (window.location.hash !== `#${view}`) window.location.hash = view;
  };

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

    document.title = 'Recruitment Assessment | Patch';

    return () => {
      document.title = previousTitle;
      metadata.forEach(({ element, created, previousContent }) => {
        if (created) {
          element.remove();
        } else if (previousContent === null || previousContent === undefined) {
          element.removeAttribute('content');
        } else {
          element.setAttribute('content', previousContent);
        }
      });
    };
  }, []);

  const loadReviewerState = useCallback(async ({ signal, quiet = false } = {}) => {
    if (!quiet) setIsLoading(true);
    setPageError('');

    try {
      const payload = await reviewerRequest('/state', { signal });
      const normalized = normalizeReviewerState(payload);
      setReviewerState(normalized);
      return normalized;
    } catch (error) {
      if (error?.name === 'AbortError') return null;

      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
        return normalizeReviewerState({ authenticated: false });
      }

      setPageError(error?.message || 'The assessment queue could not be loaded.');
      return null;
    } finally {
      if (!quiet && !signal?.aborted) setIsLoading(false);
    }
  }, [invalidateReviewerSession]);

  useEffect(() => {
    const controller = new AbortController();
    loadReviewerState({ signal: controller.signal });
    return () => controller.abort();
  }, [loadReviewerState]);

  const queue = useMemo(
    () => buildQueue(reviewerState.current, reviewerState.queue),
    [reviewerState.current, reviewerState.queue],
  );

  const outcomeLists = useMemo(() => ({
    pass: reviewerState.history.filter((application) => application.decision === 'pass' && !application.teamDecision),
    fail: reviewerState.history.filter((application) => application.decision === 'fail'),
    rejected: reviewerState.history.filter((application) => application.teamDecision === 'rejected'),
    invited: reviewerState.history.filter((application) => application.teamDecision === 'invited'),
  }), [reviewerState.history]);

  const handleDecision = async (application, decision) => {
    const id = applicationId(application);
    if (!id || isDeciding || activeView !== 'inbox'
      || application.decision === 'pass' || application.decision === 'fail') return;

    setIsDeciding(true);
    setNotice('');
    setPageError('');

    try {
      const result = await reviewerRequest(
        `/applications/${encodeURIComponent(String(id))}/decision`,
        {
          method: 'POST',
          body: { decision },
        },
      );
      // The POST is authoritative and irreversible. Remove the decided applicant
      // before refreshing so a failed refresh can never offer the same action twice.
      setReviewerState((state) => {
        const nextQueue = buildQueue(state.current, state.queue).filter(
          (candidate) => String(applicationId(candidate)) !== String(id),
        );
        const pendingTotal = Math.max(0, Number(state.pendingTotal || nextQueue.length + 1) - 1);
        const currentPending = Math.max(
          0,
          Number(state.currentCohort?.pendingCount || nextQueue.length + 1) - 1,
        );

        return {
          ...state,
          current: nextQueue[0] || null,
          queue: nextQueue,
          history: [
            { ...application, ...result?.application, decision },
            ...state.history.filter((candidate) => String(applicationId(candidate)) !== String(id)),
          ],
          pendingTotal,
          currentCohort: state.currentCohort
            ? {
                ...state.currentCohort,
                pendingCount: currentPending,
                processedCount: Number(state.currentCohort.processedCount || 0) + 1,
              }
            : state.currentCohort,
        };
      });

      const refreshed = await loadReviewerState({ quiet: true });
      setNotice(
        refreshed
          ? decision === 'pass'
            ? 'Pass recorded. The next applicant is ready.'
            : 'Fail recorded. The next applicant is ready.'
          : 'Decision recorded. Reload the queue before continuing.',
      );
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
        return;
      }

      // The decision commits before email delivery and before the response reaches
      // the browser. Reconcile an ambiguous network/409 result before enabling retry.
      const refreshed = await loadReviewerState({ quiet: true });
      const refreshedQueue = refreshed
        ? buildQueue(refreshed.current, refreshed.queue)
        : [];
      const stillWaiting = refreshedQueue.some(
        (candidate) => String(applicationId(candidate)) === String(id),
      );
      if (refreshed?.authenticated && !stillWaiting) {
        setNotice('Decision recorded. The queue was refreshed before continuing.');
        return;
      }
      throw error;
    } finally {
      setIsDeciding(false);
    }
  };

  const handleTeamDecision = async (application, decision) => {
    const id = applicationId(application);
    if (!id || isDeciding || activeView !== 'pass' || application.decision !== 'pass'
      || application.teamDecision || !['rejected', 'invited'].includes(decision)) return;

    setIsDeciding(true);
    setNotice('');
    setPageError('');

    try {
      const result = await reviewerRequest(
        `/applications/${encodeURIComponent(String(id))}/team-decision`,
        { method: 'POST', body: { decision, confirmSent: true } },
      );
      if (String(applicationId(result?.application)) !== String(id)
        || result.application.teamDecision !== decision) {
        throw new Error('The saved outcome could not be confirmed. Reload the page before trying again.');
      }
      setReviewerState((state) => ({
        ...state,
        history: state.history.map((candidate) => (
          String(applicationId(candidate)) === String(id)
            ? { ...candidate, ...result.application }
            : candidate
        )),
      }));
      const refreshed = await loadReviewerState({ quiet: true });
      setNotice(`${decision === 'invited' ? 'Invitation' : 'Rejection'} recorded. The card is now in ${decision === 'invited' ? 'Invited' : 'Rejected'}.${refreshed ? '' : ' Reload the page to refresh its latest counts.'}`);
      window.requestAnimationFrame(() => document.querySelector('.assessment-outcome-link[aria-current="page"]')?.focus());
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
        return;
      }
      // Opening a draft never writes. After Confirm Sent, reconcile uncertain
      // responses only against this exact applicant's persisted team outcome.
      const refreshed = await loadReviewerState({ quiet: true });
      const saved = refreshed?.history.find((candidate) => String(applicationId(candidate)) === String(id));
      if (refreshed?.authenticated && saved?.teamDecision === decision) {
        setNotice(`${decision === 'invited' ? 'Invitation' : 'Rejection'} recorded. The assessment was refreshed before continuing.`);
        window.requestAnimationFrame(() => document.querySelector('.assessment-outcome-link[aria-current="page"]')?.focus());
        return;
      }
      throw error;
    } finally {
      setIsDeciding(false);
    }
  };

  const handleTeamDecisionReset = async (application) => {
    const id = applicationId(application);
    const expectedDecision = application?.teamDecision;
    const expectedDecidedAt = application?.teamDecidedAt;
    if (!id || isDeciding || application?.decision !== 'pass'
      || !['rejected', 'invited'].includes(expectedDecision)
      || activeView !== expectedDecision) return;
    if (typeof expectedDecidedAt !== 'string' || !expectedDecidedAt.trim()) {
      throw new Error('The saved outcome timestamp is unavailable. Reload the page before trying again.');
    }

    setIsDeciding(true);
    setNotice('');
    setPageError('');
    let responseConfirmed = false;

    try {
      const result = await reviewerRequest(
        `/applications/${encodeURIComponent(String(id))}/team-decision`,
        {
          method: 'DELETE',
          body: { expectedDecision, expectedDecidedAt, confirmReset: true },
        },
      );
      if (!isClearedTeamDecision(result?.application, id)) {
        throw new Error('The cleared outcome could not be confirmed. The assessment will be refreshed before you try again.');
      }
      responseConfirmed = true;
      setReviewerState((state) => ({
        ...state,
        history: state.history.map((candidate) => (
          String(applicationId(candidate)) === String(id)
            ? { ...candidate, ...result.application }
            : candidate
        )),
      }));

      const refreshed = await loadReviewerState({ quiet: true });
      if (refreshed) {
        const saved = refreshed.history.find(
          (candidate) => String(applicationId(candidate)) === String(id),
        );
        if (!isClearedTeamDecision(saved, id)) {
          const message = 'The outcome changed elsewhere. The assessment has been refreshed; review the latest status before trying again.';
          setPageError(message);
          window.requestAnimationFrame(() => document.querySelector('.assessment-outcome-link[aria-current="page"]')?.focus());
          throw new Error(message);
        }
      }
      setNotice(`Outcome cleared. ${application.fullName || 'The applicant'} is back in Pass. No email was sent or recalled.${refreshed ? '' : ' Reload the page to refresh its latest counts.'}`);
      window.requestAnimationFrame(() => document.querySelector('.assessment-outcome-link[aria-current="page"]')?.focus());
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
        return;
      }
      if (responseConfirmed) throw error;

      // A lost response can follow a committed reset. Only accept reconciliation
      // when this exact applicant is still a Stage One pass with both team fields cleared.
      const refreshed = await loadReviewerState({ quiet: true });
      const saved = refreshed?.history.find(
        (candidate) => String(applicationId(candidate)) === String(id),
      );
      if (refreshed?.authenticated && isClearedTeamDecision(saved, id)) {
        setNotice(`Outcome cleared. ${application.fullName || 'The applicant'} is back in Pass. No email was sent or recalled.`);
        window.requestAnimationFrame(() => document.querySelector('.assessment-outcome-link[aria-current="page"]')?.focus());
        return;
      }
      if (refreshed?.authenticated && (!saved || saved.teamDecision !== expectedDecision)) {
        const message = 'The outcome changed elsewhere. The assessment has been refreshed; review the latest status before trying again.';
        setPageError(message);
        window.requestAnimationFrame(() => document.querySelector('.assessment-outcome-link[aria-current="page"]')?.focus());
        throw new Error(message);
      }
      throw error;
    } finally {
      setIsDeciding(false);
    }
  };

  const handleChangePassword = async (password) => {
    const currentCohort = reviewerState.currentCohort;
    const cohortId = currentCohort?.id || currentCohort?.cohortId || currentCohort?.cohort_id;
    if (!cohortId) throw new Error('Reload recruitment settings before changing the password.');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setNotice('');
    try {
      const result = await reviewerRequest('/password', {
        method: 'PUT',
        signal: controller.signal,
        body: { cohortId, expectedRevision: currentCohort.passwordRevision ?? 0, password },
      });
      const updated = result?.currentCohort;
      const updatedId = updated?.id || updated?.cohortId || updated?.cohort_id;
      if (String(updatedId) !== String(cohortId)
        || !Number.isSafeInteger(updated?.passwordRevision)
        || updated.passwordRevision <= (currentCohort.passwordRevision ?? 0)) {
        throw new Error('The password update could not be confirmed. Reload the page before trying again.');
      }
      // Password rotation changes only recruitment settings, never applicant
      // queues, recordings, counts, history, or the selected assessment view.
      setReviewerState((state) => ({
        ...state,
        currentCohort: {
          ...state.currentCohort,
          alwaysOpen: updated.alwaysOpen,
          passwordRevision: updated.passwordRevision,
        },
      }));
      setNotice('Application password updated.');
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
      } else if (error?.status === 409) {
        const refreshed = await loadReviewerState({ quiet: true, signal: controller.signal });
        throw new Error(refreshed?.authenticated
          ? 'The password was changed elsewhere. Settings have been refreshed; review and save again.'
          : 'The password was changed elsewhere. Reload the page before trying again.');
      } else if (error?.name === 'AbortError') {
        throw new Error('The request timed out. Reload the page before trying again; the password may have been updated.');
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setPageError('');

    try {
      await reviewerRequest('/logout', { method: 'POST' });
    } catch (error) {
      if (error?.status !== 401) {
        setPageError(error?.message || 'You could not be signed out. Please try again.');
        setIsLoggingOut(false);
        return;
      }
    }

    window.location.replace('/application');
  };

  if (isLoading && reviewerState.authenticated === null) return <LoadingScreen />;
  if (reviewerState.authenticated === false) return <InvalidSession />;

  if (pageError && reviewerState.authenticated === null) {
    return (
      <main className="assessment-access">
        <section className="assessment-access-card" role="alert">
          <p className="assessment-eyebrow">Private reviewer access</p>
          <h1>The assessment queue is temporarily unavailable.</h1>
          <p>{pageError}</p>
          <button
            className="assessment-button assessment-button-primary"
            type="button"
            onClick={() => loadReviewerState()}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }

  const waitingTotal = Math.max(0, Number(reviewerState.pendingTotal || 0));

  return (
    <div className="assessment-page">
      <header className="assessment-header">
        <div className="assessment-header-inner">
          <a className="assessment-brand" href="/" aria-label="Patch home">
            <img src="/patch-logo-2.png" alt="Patch" />
          </a>
          <button
            className="nav-cta assessment-logout"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            <span>{isLoggingOut ? 'Signing out…' : 'Sign Out'}</span>
            <span className="nav-cta-arrow" aria-hidden="true">→</span>
          </button>
        </div>
      </header>

      <main className="assessment-shell">
        <section className="assessment-intro" aria-labelledby="assessment-title">
          <div>
            <p className="assessment-eyebrow">Recruitment</p>
            <h1 id="assessment-title">Voice note assessment</h1>
          </div>
        </section>

        <div className="assessment-live-region" role="status" aria-live="polite">
          {notice}
        </div>

        {pageError && reviewerState.authenticated && (
          <div className="assessment-inline-error" role="alert">
            <p>{pageError}</p>
            <button type="button" onClick={() => loadReviewerState()}>
              Reload queue
            </button>
          </div>
        )}

        <AssessmentCohorts
          currentWindow={reviewerState.currentCohort}
          activeView={activeView}
          onViewChange={selectView}
          viewCounts={{
            inbox: waitingTotal,
            pass: outcomeLists.pass.length,
            fail: outcomeLists.fail.length,
            rejected: outcomeLists.rejected.length,
            invited: outcomeLists.invited.length,
          }}
          onChangePassword={handleChangePassword}
        />

        {reviewerState.currentCohort && activeView === 'inbox' && (
          <section className="assessment-outcome-list" aria-label="Inbox voice notes">
            {queue.length ? queue.map((application, index) => (
              <AssessmentQueue
                key={`inbox-${applicationId(application)}`}
                application={application}
                onDecision={handleDecision}
                isDeciding={isDeciding}
                focusOnLoad={index === 0}
              />
            )) : (
              <AssessmentQueue application={null} />
            )}
          </section>
        )}

        {activeView !== 'inbox' && (
          <section
            className="assessment-outcome-list"
            aria-label={{ pass: 'Passed voice notes', fail: 'Failed voice notes', rejected: 'Rejected voice notes', invited: 'Invited voice notes' }[activeView]}
          >
            {outcomeLists[activeView].length ? outcomeLists[activeView].map((application) => (
              <AssessmentQueue
                key={`${activeView}-${applicationId(application)}`}
                application={application}
                readOnly={activeView !== 'pass'}
                allowTeamDecision={activeView === 'pass'}
                onTeamDecision={activeView === 'pass' ? handleTeamDecision : undefined}
                allowTeamDecisionReset={activeView === 'rejected' || activeView === 'invited'}
                onTeamDecisionReset={activeView === 'rejected' || activeView === 'invited'
                  ? handleTeamDecisionReset
                  : undefined}
                isDeciding={isDeciding}
              />
            )) : (
              <div className="assessment-outcome-empty" role="status">
                <p>{{ pass: 'No passed recordings awaiting a team decision.', fail: 'No failed recordings yet.', rejected: 'No rejected applicants yet.', invited: 'No invited applicants yet.' }[activeView]}</p>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
