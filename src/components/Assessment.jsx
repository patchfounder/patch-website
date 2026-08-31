import { useCallback, useEffect, useMemo, useState } from 'react';
import AssessmentQueue from './AssessmentQueue.jsx';
import AssessmentCohorts from './AssessmentCohorts.jsx';
import '../assessment.css';

const REVIEWER_API = '/api/recruitment/reviewer';

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
    current: state.current || state.currentApplication || queue[0] || null,
    pendingTotal: countFrom(state.pendingTotal, currentCohort?.pendingCount, queue.length),
  };
}

function applicationId(application) {
  return application?.id || application?.applicationId || application?.application_id || null;
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

function cohortIdentity(cohort) {
  if (!cohort) return [];
  return [cohort.id, cohort.cohortId, cohort.slug, cohort.monthKey, cohort.month_key]
    .filter((value) => value !== undefined && value !== null)
    .map(String);
}

function cohortName(cohort, fallback) {
  const monthKey = cohort?.monthKey || cohort?.month_key || cohort?.slug;
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  const monthLabel = match
    ? new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
        new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)),
      )
    : '';

  return (
    cohort?.displayName ||
    cohort?.display_name ||
    cohort?.name ||
    monthLabel ||
    monthKey ||
    fallback
  );
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

function InvalidSession({ signedOut = false }) {
  return (
    <main className="assessment-access">
      <section className="assessment-access-card" aria-labelledby="assessment-access-title">
        <p className="assessment-eyebrow">Private reviewer access</p>
        <h1 id="assessment-access-title">
          {signedOut ? 'You have been signed out.' : 'This assessment link is invalid or has expired.'}
        </h1>
        <p>
          {signedOut
            ? 'Use your private assessment link when you are ready to return.'
            : 'Open the latest private assessment link issued to you. For security, there is no password entry or recovery form on this page.'}
        </p>
        <a className="assessment-button assessment-button-primary" href="/">
          Return to Patch
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
    current: null,
    pendingTotal: 0,
  });
  const [isCohortFormOpen, setIsCohortFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const invalidateReviewerSession = useCallback(({ afterLogout = false } = {}) => {
    setSignedOut(afterLogout);
    setReviewerState(normalizeReviewerState({ authenticated: false }));
    setIsCohortFormOpen(false);
    setNotice('');
    setPageError('');
  }, []);

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
      setSignedOut(false);
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

  const handleDecision = async (application, decision) => {
    const id = applicationId(application);
    if (!id || isDeciding) return;

    setIsDeciding(true);
    setNotice('');
    setPageError('');

    try {
      await reviewerRequest(
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

  const handleCreateAndActivateCohort = async (cohort) => {
    try {
      const result = await reviewerRequest('/cohorts', { method: 'POST', body: cohort });
      const activatedCohort = result?.current || result?.cohort || null;
      setReviewerState((state) => ({
        ...state,
        currentCohort: activatedCohort || state.currentCohort,
        previousCohort:
          result && Object.hasOwn(result, 'previous') ? result.previous : state.previousCohort,
        queue: [],
        current: null,
        pendingTotal: 0,
      }));
      const refreshed = await loadReviewerState({ quiet: true });
      setIsCohortFormOpen(false);
      setNotice(
        refreshed
          ? `${cohort.displayName} is active.`
          : `${cohort.displayName} is active. Reload the page to refresh its latest counts.`,
      );
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
        throw error;
      }
      if (error?.status) throw error;
      const refreshed = await loadReviewerState({ quiet: true });
      const requestedMonth = String(cohort.slug || cohort.monthKey || '');
      if (cohortIdentity(refreshed?.currentCohort).includes(requestedMonth)) {
        setIsCohortFormOpen(false);
        setNotice(`${cohort.displayName} is active.`);
        return;
      }
      throw error;
    }
  };

  const handleDeleteActiveCohort = async (id) => {
    try {
      await reviewerRequest(`/cohorts/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        body: { confirm: true },
      });
      setReviewerState((state) => ({
        ...state,
        currentCohort: null,
        queue: [],
        current: null,
        pendingTotal: 0,
      }));
      const refreshed = await loadReviewerState({ quiet: true });
      setNotice(
        refreshed
          ? 'The active cohort was deleted. Applicant access is closed.'
          : 'The active cohort was deleted. Applicant access is closed. Reload to confirm the latest state.',
      );
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
        throw error;
      }
      if (error?.status) throw error;
      const refreshed = await loadReviewerState({ quiet: true });
      if (
        refreshed?.authenticated
        && !refreshed.currentCohort
      ) {
        setNotice('The active cohort was deleted. Applicant access is closed.');
        return;
      }
      throw error;
    }
  };

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setPageError('');

    try {
      await reviewerRequest('/logout', { method: 'POST' });
      invalidateReviewerSession({ afterLogout: true });
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession({ afterLogout: true });
      } else {
        setPageError(error?.message || 'You could not be signed out. Please try again.');
      }
    } finally {
      setIsLoggingOut(false);
    }
  };

  if (isLoading && reviewerState.authenticated === null) return <LoadingScreen />;
  if (reviewerState.authenticated === false) return <InvalidSession signedOut={signedOut} />;

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

  const currentCohortLabel = cohortName(reviewerState.currentCohort, 'No active cohort');
  const waitingTotal = Math.max(0, Number(reviewerState.pendingTotal || 0));

  return (
    <div className="assessment-page">
      <header className="assessment-header">
        <div className="assessment-header-inner">
          <a className="assessment-brand" href="/" aria-label="Patch home">
            <img src="/patch-logo-2.png" alt="Patch" />
          </a>
          <button
            className="assessment-logout"
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
          >
            {isLoggingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="assessment-shell">
        <section className="assessment-intro" aria-labelledby="assessment-title">
          <div>
            <p className="assessment-eyebrow">Recruitment</p>
            <h1 id="assessment-title">Voice note assessment</h1>
          </div>
          <p className="assessment-intro-status">
            <strong>{waitingTotal}</strong> waiting
            <span aria-hidden="true">·</span>
            <span>{currentCohortLabel}</span>
          </p>
        </section>

        <div className="assessment-page-actions" role="group" aria-label="Assessment actions">
          <button
            type="button"
            className="assessment-icon-action assessment-add-cohort"
            aria-label={isCohortFormOpen ? 'Close cohort form' : 'Add cohort'}
            title={isCohortFormOpen ? 'Close cohort form' : 'Add cohort'}
            aria-expanded={isCohortFormOpen}
            aria-controls={isCohortFormOpen ? 'assessment-cohort-create' : undefined}
            onClick={() => {
              setNotice('');
              setIsCohortFormOpen((isOpen) => !isOpen);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <a
            className="assessment-icon-action assessment-view-application"
            href="/coach-application/"
            target="_blank"
            rel="noreferrer"
            aria-label="View the applicant-facing application page in a new tab"
            title="View applicant page"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M7 17 17 7M9 7h8v8" />
            </svg>
          </a>
        </div>

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
          currentCohort={reviewerState.currentCohort}
          previousCohort={reviewerState.previousCohort}
          showCreateForm={isCohortFormOpen}
          onCreateAndActivate={handleCreateAndActivateCohort}
          onDeleteActive={handleDeleteActiveCohort}
        />

        {reviewerState.currentCohort && (
          <AssessmentQueue
            application={queue[0] || null}
            waitingCount={waitingTotal}
            onDecision={handleDecision}
            isDeciding={isDeciding}
          />
        )}
      </main>
    </div>
  );
}
