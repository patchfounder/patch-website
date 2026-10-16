import { useEffect, useRef, useState } from 'react';
import { applicationWindowTitle } from '../recruitment-time.js';

function cohortValue(cohort, ...keys) {
  for (const key of keys) {
    if (cohort?.[key] !== undefined && cohort?.[key] !== null) return cohort[key];
  }
  return '';
}

export default function AssessmentCohorts({
  currentWindow,
  activeView = 'inbox',
  onViewChange,
  viewCounts = { inbox: 0, pass: 0, fail: 0, rejected: 0, invited: 0 },
  onChangePassword,
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const passwordTriggerRef = useRef(null);
  const passwordInputRef = useRef(null);
  const currentId = cohortValue(currentWindow, 'id', 'cohortId', 'cohort_id');
  const openedMonth = applicationWindowTitle(cohortValue(currentWindow, 'opensAt', 'opens_at'), 'Not set');

  const clearForm = () => {
    setFormOpen(false);
    setPassword('');
    setPasswordVisible(false);
    setFormError('');
  };

  useEffect(() => {
    clearForm();
  }, [currentId, activeView]);

  useEffect(() => {
    if (formOpen) passwordInputRef.current?.focus({ preventScroll: true });
  }, [formOpen]);

  const closeForm = () => {
    if (isSaving) return;
    clearForm();
    window.requestAnimationFrame(() => passwordTriggerRef.current?.focus());
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    if (isSaving || !currentId) return;
    if (!password) {
      setFormError('Enter a new application password.');
      passwordInputRef.current?.focus();
      return;
    }
    setFormError('');
    setIsSaving(true);
    try {
      await onChangePassword(password);
      clearForm();
      window.requestAnimationFrame(() => passwordTriggerRef.current?.focus());
    } catch (error) {
      setFormError(error?.message || 'The application password could not be updated.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="assessment-cohorts">
      <section className="assessment-current-cohort" aria-labelledby="assessment-opened-title">
        <header>
          <div>
            <span className="assessment-window-label">Application Opened</span>
            <h2 id="assessment-opened-title">{openedMonth}</h2>
          </div>
        </header>

        <nav className="assessment-outcome-nav" aria-label="Assessment views">
          {[
            ['inbox', 'Inbox'],
            ['pass', 'Pass'],
            ['fail', 'Fail'],
            ['rejected', 'Rejected'],
            ['invited', 'Invited'],
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

        {currentId && (
          <button
            className="assessment-button assessment-button-secondary assessment-change-password"
            type="button"
            ref={passwordTriggerRef}
            aria-expanded={formOpen}
            aria-controls={formOpen ? 'assessment-password-form' : undefined}
            disabled={isSaving}
            onClick={() => {
              if (formOpen) closeForm();
              else {
                setPassword('');
                setPasswordVisible(false);
                setFormError('');
                setFormOpen(true);
              }
            }}
          >
            Change Password
          </button>
        )}

        {formOpen && (
          <form
            className="assessment-password-form"
            id="assessment-password-form"
            aria-label="Change application password"
            aria-busy={isSaving}
            onSubmit={submitPassword}
            noValidate
          >
            <div className="assessment-field">
              <label htmlFor="assessment-new-password">New application password</label>
              <div className="assessment-password-control">
                <input
                  id="assessment-new-password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  value={password}
                  ref={passwordInputRef}
                  onChange={(event) => {
                    setPassword(event.target.value);
                    setFormError('');
                  }}
                  autoComplete="new-password"
                  spellCheck="false"
                  autoCapitalize="none"
                  disabled={isSaving}
                  aria-invalid={Boolean(formError)}
                  aria-describedby={formError ? 'assessment-password-error' : undefined}
                  required
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                  disabled={isSaving}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
                    <circle cx="12" cy="12" r="2.75" />
                    {passwordVisible && <path d="M4 4 20 20" />}
                  </svg>
                </button>
              </div>
            </div>
            <p className="assessment-password-help">
              Applications stay open. Changing the password keeps every applicant and recording.
            </p>
            {formError && (
              <p className="assessment-form-error" id="assessment-password-error" role="alert">
                {formError}
              </p>
            )}
            <div className="assessment-password-actions">
              <button
                className="assessment-button assessment-button-secondary"
                type="button"
                onClick={closeForm}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                className="assessment-button assessment-button-primary"
                type="submit"
                disabled={isSaving}
              >
                {isSaving ? 'Saving…' : 'Save Password'}
              </button>
            </div>
          </form>
        )}
        {!currentId && (
          <p className="assessment-password-help" role="status">
            Recruitment settings are unavailable. Reload the page to try again.
          </p>
        )}
      </section>
    </div>
  );
}
