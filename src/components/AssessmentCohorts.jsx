import { useEffect, useRef, useState } from 'react';
import {
  applicationWindowTitle,
  applicationWindowSubmission,
  defaultApplicationWindow,
  formatApplicationClosingDate,
  formatApplicationDate,
} from '../recruitment-time.js';

function windowValue(applicationWindow, ...keys) {
  for (const key of keys) {
    if (applicationWindow?.[key] !== undefined && applicationWindow?.[key] !== null) {
      return applicationWindow[key];
    }
  }
  return '';
}

function windowId(applicationWindow) {
  return windowValue(applicationWindow, 'id', 'cohortId', 'cohort_id');
}

export default function AssessmentCohorts({
  currentWindow,
  showCreateForm = false,
  activeView = 'inbox',
  onViewChange,
  viewCounts = { inbox: 0, pass: 0, fail: 0 },
  onCreate,
  onRemove,
}) {
  const [form, setForm] = useState(() => defaultApplicationWindow());
  const [formError, setFormError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeError, setRemoveError] = useState('');
  const [isRemoving, setIsRemoving] = useState(false);
  const createHeadingRef = useRef(null);
  const removeTriggerRef = useRef(null);
  const removeDialogRef = useRef(null);
  const removeCancelRef = useRef(null);
  const removeConfirmRef = useRef(null);
  const currentId = windowId(currentWindow);
  const opensAt = windowValue(currentWindow, 'opensAt', 'opens_at');
  const closesAt = windowValue(currentWindow, 'closesAt', 'closes_at');
  const title = applicationWindowTitle(opensAt);
  const outcomeNavigation = (
    <nav
      className={`assessment-outcome-nav${currentWindow ? '' : ' assessment-outcome-nav-standalone'}`}
      aria-label="Assessment views"
    >
      {[
        ['inbox', 'Inbox'],
        ['pass', 'Pass'],
        ['fail', 'Fail'],
      ].map(([view, label]) => (
        <button
          className="assessment-outcome-link"
          type="button"
          key={view}
          aria-current={activeView === view ? 'page' : undefined}
          onClick={() => onViewChange?.(view)}
        >
          <span>{label}</span>
          <strong>{viewCounts[view] ?? 0}</strong>
        </button>
      ))}
    </nav>
  );

  useEffect(() => {
    if (!showCreateForm) return;
    setForm(defaultApplicationWindow());
    setFormError('');
    setPasswordVisible(false);
    createHeadingRef.current?.focus({ preventScroll: true });
  }, [showCreateForm]);

  useEffect(() => {
    if (!removeOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    removeCancelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => removeTriggerRef.current?.focus());
    };
  }, [removeOpen]);

  useEffect(() => {
    if (!removeOpen) return;
    (isRemoving ? removeDialogRef : removeCancelRef).current?.focus();
  }, [removeOpen, isRemoving]);

  useEffect(() => {
    setRemoveOpen(false);
    setRemoveError('');
  }, [currentId]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setFormError('');
  };

  const submitWindow = async (event) => {
    event.preventDefault();
    if (isCreating) return;

    setFormError('');
    if (!form.password || !form.opensAt || !form.closesAt) {
      setFormError('Complete every field before opening the application window.');
      return;
    }

    setIsCreating(true);
    try {
      await onCreate(applicationWindowSubmission(form));
      setForm(defaultApplicationWindow());
      setPasswordVisible(false);
      window.requestAnimationFrame(() => document.querySelector('.assessment-add-window')?.focus());
    } catch (requestError) {
      setFormError(requestError?.message || 'The application window could not be opened.');
    } finally {
      setIsCreating(false);
    }
  };

  const removeWindow = async () => {
    if (!currentId || isRemoving) return;

    setRemoveError('');
    setIsRemoving(true);
    try {
      await onRemove(currentId);
      setRemoveOpen(false);
      window.requestAnimationFrame(() => document.querySelector('.assessment-add-window')?.focus());
    } catch (requestError) {
      setRemoveError(requestError?.message || 'The application window could not be removed.');
    } finally {
      setIsRemoving(false);
    }
  };

  const cancelRemove = () => {
    if (isRemoving) return;
    setRemoveOpen(false);
    setRemoveError('');
  };

  const handleRemoveDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelRemove();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = removeDialogRef.current;
    const focusableButtons = [removeCancelRef.current, removeConfirmRef.current].filter(
      (button) => button && !button.disabled,
    );
    if (!focusableButtons.length) {
      event.preventDefault();
      dialog?.focus();
      return;
    }

    const firstButton = focusableButtons[0];
    const lastButton = focusableButtons[focusableButtons.length - 1];
    const activeElement = document.activeElement;
    if (event.shiftKey && (activeElement === firstButton || !dialog?.contains(activeElement))) {
      event.preventDefault();
      lastButton.focus();
    } else if (!event.shiftKey && (activeElement === lastButton || !dialog?.contains(activeElement))) {
      event.preventDefault();
      firstButton.focus();
    }
  };

  return (
    <div className="assessment-cohorts">
      {currentWindow && !showCreateForm && (
        <section className="assessment-current-cohort" aria-labelledby="assessment-window-title">
          <header>
            <div>
              <span className="assessment-window-label">Application Window</span>
              <h2 id="assessment-window-title">{title}</h2>
            </div>
          </header>

          {currentId && (
            <button
              className="assessment-window-remove"
              type="button"
              ref={removeTriggerRef}
              aria-label={`Remove ${title} application window`}
              title="Remove application window"
              aria-haspopup="dialog"
              aria-expanded={removeOpen}
              aria-controls={removeOpen ? 'assessment-remove-window' : undefined}
              onClick={() => {
                setRemoveOpen(true);
                setRemoveError('');
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
          )}

          <dl className="assessment-cohort-dates">
            <div>
              <dt>Open</dt>
              <dd>{formatApplicationDate(opensAt)}</dd>
            </div>
            <div>
              <dt>Close</dt>
              <dd>{formatApplicationClosingDate(closesAt)}</dd>
            </div>
          </dl>

          {outcomeNavigation}
        </section>
      )}

      {!currentWindow && !showCreateForm && outcomeNavigation}

      {currentWindow && !showCreateForm && removeOpen && (
        <div
          className="assessment-cohort-delete-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) cancelRemove();
          }}
        >
          <div
            className="assessment-cohort-delete-dialog"
            id="assessment-remove-window"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-remove-window-title"
            aria-describedby="assessment-remove-window-message"
            aria-busy={isRemoving}
            ref={removeDialogRef}
            tabIndex="-1"
            onKeyDown={handleRemoveDialogKeyDown}
          >
            <h2 id="assessment-remove-window-title">Remove application window?</h2>
            <p id="assessment-remove-window-message">
              Remove the {title} window and permanently delete everything in Inbox, Pass and Fail,
              including earlier windows and all recordings? This cannot be undone.
            </p>
            {removeError && (
              <p className="assessment-confirmation-error" role="alert">
                {removeError}
              </p>
            )}
            <div className="assessment-cohort-delete-actions">
              <button
                className="assessment-button assessment-button-secondary"
                type="button"
                ref={removeCancelRef}
                onClick={cancelRemove}
                disabled={isRemoving}
              >
                Cancel
              </button>
              <button
                className="assessment-button assessment-button-danger"
                type="button"
                ref={removeConfirmRef}
                onClick={removeWindow}
                disabled={isRemoving}
              >
                {isRemoving ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <section
          className="assessment-cohort-create"
          id="assessment-window-create"
          aria-labelledby="assessment-window-create-title"
        >
          <h2 id="assessment-window-create-title" ref={createHeadingRef} tabIndex="-1">
            Open Application Window
          </h2>

          <form onSubmit={submitWindow} noValidate>
            <div className="assessment-field">
              <label htmlFor="assessment-shared-password">Shared applicant password</label>
              <div className="assessment-password-control">
                <input
                  id="assessment-shared-password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={form.password}
                  onChange={updateField}
                  autoComplete="new-password"
                  spellCheck="false"
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'assessment-window-form-error' : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="2.75" />
                    {passwordVisible && <path d="M4 4 20 20" />}
                  </svg>
                </button>
              </div>
            </div>

            <div className="assessment-field-row">
              <label className="assessment-field">
                <span>Open</span>
                <input
                  name="opensAt"
                  type="date"
                  value={form.opensAt}
                  onChange={updateField}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'assessment-window-form-error' : undefined}
                  required
                />
              </label>
              <label className="assessment-field">
                <span>Close</span>
                <input
                  name="closesAt"
                  type="date"
                  value={form.closesAt}
                  onChange={updateField}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'assessment-window-form-error' : undefined}
                  required
                />
              </label>
            </div>

            {formError && (
              <p className="assessment-form-error" id="assessment-window-form-error" role="alert">
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M12 3.5 21 20H3L12 3.5Z" />
                  <path d="M12 9v5" />
                  <path d="M12 17.25h.01" />
                </svg>
                <span>{formError}</span>
              </p>
            )}

            <button
              className="assessment-button assessment-button-primary"
              type="submit"
              disabled={isCreating}
            >
              {isCreating ? 'Opening…' : 'Open'}
            </button>
          </form>
        </section>
      )}

      {!currentWindow && !showCreateForm && activeView === 'inbox' && (
        <section className="assessment-cohort-empty" aria-labelledby="assessment-no-window-title">
          <span className="assessment-cohort-empty-icon" aria-hidden="true">
            +
          </span>
          <h2 id="assessment-no-window-title">No application window</h2>
          <p>Use the + button above to open one.</p>
        </section>
      )}
    </div>
  );
}
