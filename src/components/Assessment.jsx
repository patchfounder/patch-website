import { useCallback, useEffect, useMemo, useState } from 'react';
import AssessmentQueue from './AssessmentQueue.jsx';
import AssessmentCohorts from './AssessmentCohorts.jsx';
import { applicationInputValue, applicationWindowTitle } from '../recruitment-time.js';
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
  const [isWindowFormOpen, setIsWindowFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const invalidateReviewerSession = useCallback(({ afterLogout = false } = {}) => {
    setSignedOut(afterLogout);
    setReviewerState(normalizeReviewerState({ authenticated: false }));
    setIsWindowFormOpen(false);
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

  const handleCreateWindow = async (applicationWindow) => {
    const previousWindowId = String(
      reviewerState.currentCohort?.id || reviewerState.currentCohort?.cohortId || '',
    );
    try {
      const result = await reviewerRequest('/cohorts', {
        method: 'POST',
        body: applicationWindow,
      });
      const activatedWindow = result?.current || result?.cohort || null;
      setReviewerState((state) => ({
        ...state,
        currentCohort: activatedWindow || state.currentCohort,
        previousCohort:
          result && Object.hasOwn(result, 'previous') ? result.previous : state.previousCohort,
        queue: [],
        current: null,
        pendingTotal: 0,
      }));
      const refreshed = await loadReviewerState({ quiet: true });
      setIsWindowFormOpen(false);
      const title = applicationWindowTitle(
        refreshed?.currentCohort?.opensAt || activatedWindow?.opensAt,
      );
      setNotice(
        refreshed
          ? `${title} application window created.`
          : `${title} application window created. Reload the page to refresh its latest counts.`,
      );
      return activatedWindow;
    } catch (error) {
      if (error?.status === 401 || error?.status === 403) {
        invalidateReviewerSession();
        throw error;
      }
      if (error?.status) throw error;
      const refreshed = await loadReviewerState({ quiet: true });
      const refreshedWindow = refreshed?.currentCohort;
      const refreshedWindowId = String(refreshedWindow?.id || refreshedWindow?.cohortId || '');
      const matchesRequestedWindow =
        applicationInputValue(refreshedWindow?.opensAt) === applicationWindow.opensAt
        && applicationInputValue(refreshedWindow?.closesAt) === applicationWindow.closesAt;
      if (refreshedWindowId && refreshedWindowId !== previousWindowId && matchesRequestedWindow) {
        setIsWindowFormOpen(false);
        setNotice(`${applicationWindowTitle(refreshedWindow.opensAt)} application window created.`);
        return refreshedWindow;
      }
      throw error;
    }
  };

  const handleRemoveWindow = async (id) => {
    try {
      await reviewerRequest(`/cohorts/${encodeURIComponent(String(id))}`, {
        method: 'DELETE',
        body: { confirm: true },
      });
      setIsWindowFormOpen(false);
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
          ? 'The application window was removed. Applicant access is closed.'
          : 'The application window was removed. Applicant access is closed. Reload to confirm the latest state.',
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
        setIsWindowFormOpen(false);
        setNotice('The application window was removed. Applicant access is closed.');
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

  const currentWindowLabel = applicationWindowTitle(
    reviewerState.currentCohort?.opensAt,
    'No application window',
  );
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
            <span>{currentWindowLabel}</span>
          </p>
        </section>

        <div className="assessment-page-actions" role="group" aria-label="Assessment actions">
          <button
            type="button"
            className="assessment-icon-action assessment-add-window"
            aria-label={isWindowFormOpen ? 'Close application window form' : 'Add application window'}
            title={isWindowFormOpen ? 'Close application window form' : 'Add application window'}
            aria-expanded={isWindowFormOpen}
            aria-controls={isWindowFormOpen ? 'assessment-window-create' : undefined}
            onClick={() => {
              setNotice('');
              setIsWindowFormOpen((isOpen) => !isOpen);
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
          currentWindow={reviewerState.currentCohort}
          showCreateForm={isWindowFormOpen}
          onCreate={handleCreateWindow}
          onRemove={handleRemoveWindow}
        />

        {reviewerState.currentCohort && !isWindowFormOpen && (
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
