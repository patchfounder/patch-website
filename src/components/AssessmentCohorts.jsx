import { useEffect, useMemo, useRef, useState } from 'react';

function cohortValue(cohort, ...keys) {
  for (const key of keys) {
    if (cohort?.[key] !== undefined && cohort?.[key] !== null) return cohort[key];
  }
  return '';
}

function cohortId(cohort) {
  return cohortValue(cohort, 'id', 'cohortId', 'cohort_id');
}

function cohortSlug(cohort) {
  return cohortValue(cohort, 'slug', 'monthKey', 'month_key');
}

function cohortName(cohort, fallback = 'Cohort') {
  const explicitName = cohortValue(cohort, 'displayName', 'display_name', 'name');
  if (explicitName) return explicitName;

  const monthKey = cohortSlug(cohort);
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (match) {
    return new Intl.DateTimeFormat('en-GB', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
  }

  return monthKey || fallback;
}

function formatDateTime(value) {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toLocalInputValue(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function monthFromCohort(cohort) {
  const slug = cohortSlug(cohort);
  const match = /^(\d{4})-(\d{2})$/.exec(slug);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1, 12, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function currentMadridMonth() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      year: 'numeric',
      month: '2-digit',
      timeZone: 'Europe/Madrid',
    })
      .formatToParts(new Date())
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return new Date(Number(parts.year), Number(parts.month) - 1, 1, 12, 0, 0, 0);
}

function monthIndex(date) {
  return date.getFullYear() * 12 + date.getMonth();
}

function dateFromMonthIndex(value) {
  return new Date(Math.floor(value / 12), value % 12, 1, 12, 0, 0, 0);
}

function monthLabel(monthStart) {
  return new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(monthStart.getFullYear(), monthStart.getMonth(), 1)));
}

function defaultsForMonth(monthStart) {
  const daysUntilSunday = (7 - monthStart.getDay()) % 7;
  const first = new Date(
    monthStart.getFullYear(),
    monthStart.getMonth(),
    monthStart.getDate() + daysUntilSunday,
    0,
    0,
    0,
    0,
  );
  const last = new Date(
    first.getFullYear(),
    first.getMonth(),
    first.getDate() + 5,
    23,
    59,
    0,
    0,
  );
  const slug = `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`;

  return {
    slug,
    displayName: monthLabel(monthStart),
    password: '',
    opensAt: toLocalInputValue(first),
    closesAt: toLocalInputValue(last),
  };
}

function availableMonthOptions(currentCohort, previousCohort) {
  const retainedMonths = [currentCohort, previousCohort]
    .map(monthFromCohort)
    .filter(Boolean)
    .map(monthIndex);
  const anchor = Math.max(monthIndex(currentMadridMonth()), ...retainedMonths);
  return Array.from({ length: 12 }, (_, index) => {
    const monthStart = dateFromMonthIndex(anchor + index + 1);
    const defaults = defaultsForMonth(monthStart);
    return { value: defaults.slug, label: defaults.displayName, defaults };
  });
}

function numericCount(cohort, ...keys) {
  const value = cohortValue(cohort, ...keys);
  const number = Number(value);
  return value !== '' && Number.isFinite(number) ? number : '—';
}

function processedCount(cohort) {
  const explicit = numericCount(cohort, 'processedCount', 'decisionCount', 'processed_count');
  if (explicit !== '—') return explicit;

  const applications = numericCount(
    cohort,
    'applicationCount',
    'applicationsCount',
    'application_count',
  );
  const pending = numericCount(cohort, 'pendingCount', 'waitingCount', 'pending_count');
  return applications === '—' || pending === '—' ? '—' : Math.max(0, applications - pending);
}

export default function AssessmentCohorts({
  currentCohort,
  previousCohort,
  showCreateForm = false,
  onCreateAndActivate,
  onDeleteActive,
}) {
  const monthOptions = useMemo(
    () => availableMonthOptions(currentCohort, previousCohort),
    [currentCohort, previousCohort],
  );
  const defaults = useMemo(() => monthOptions[0].defaults, [monthOptions]);
  const [form, setForm] = useState(defaults);
  const [formTouched, setFormTouched] = useState(false);
  const [formError, setFormError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const createHeadingRef = useRef(null);
  const deleteTriggerRef = useRef(null);
  const deleteDialogRef = useRef(null);
  const deleteCancelRef = useRef(null);
  const deleteConfirmRef = useRef(null);
  const currentId = cohortId(currentCohort);

  useEffect(() => {
    if (!formTouched) {
      setForm(defaults);
      return;
    }
    if (!monthOptions.some((option) => option.value === form.slug)) {
      setForm({ ...defaults, password: form.password });
    }
  }, [defaults, form.password, form.slug, formTouched, monthOptions]);

  useEffect(() => {
    if (showCreateForm) createHeadingRef.current?.focus();
  }, [showCreateForm]);

  useEffect(() => {
    if (!deleteOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    deleteCancelRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
    };
  }, [deleteOpen]);

  useEffect(() => {
    if (!deleteOpen) return;

    if (isDeleting) {
      deleteDialogRef.current?.focus();
    } else {
      deleteCancelRef.current?.focus();
    }
  }, [deleteOpen, isDeleting]);

  useEffect(() => {
    setDeleteOpen(false);
    setDeleteError('');
  }, [currentId]);

  const updateField = (event) => {
    const { name, value } = event.target;
    setFormTouched(true);
    if (name === 'slug') {
      const selected = monthOptions.find((option) => option.value === value)?.defaults;
      if (selected) {
        setForm((current) => ({ ...selected, password: current.password }));
        return;
      }
    }
    setForm((current) => ({ ...current, [name]: value }));
  };

  const submitCohort = async (event) => {
    event.preventDefault();
    if (isCreating) return;

    setFormError('');
    const slug = form.slug.trim();
    const displayName = form.displayName.trim();
    const password = form.password;

    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(slug)) {
      setFormError('Use the monthly cohort format YYYY-MM.');
      return;
    }
    if (!displayName || !password || !form.opensAt || !form.closesAt) {
      setFormError('Complete every cohort field before activating it.');
      return;
    }
    if (form.closesAt <= form.opensAt) {
      setFormError('The closing time must be after the opening time.');
      return;
    }

    setIsCreating(true);
    try {
      await onCreateAndActivate({
        slug,
        monthKey: slug,
        displayName,
        password,
        opensAt: form.opensAt,
        closesAt: form.closesAt,
      });
      setForm((current) => ({ ...current, password: '' }));
      setPasswordVisible(false);
      setFormTouched(false);
      window.requestAnimationFrame(() => document.querySelector('.assessment-add-cohort')?.focus());
    } catch (requestError) {
      setFormError(requestError?.message || 'The cohort and password could not be activated.');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteActiveCohort = async () => {
    if (!currentId || isDeleting) return;

    setDeleteError('');
    setIsDeleting(true);
    try {
      await onDeleteActive(currentId);
      setDeleteOpen(false);
      window.requestAnimationFrame(() => document.querySelector('.assessment-add-cohort')?.focus());
    } catch (requestError) {
      setDeleteError(requestError?.message || 'The active cohort could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    if (isDeleting) return;
    setDeleteOpen(false);
    setDeleteError('');
  };

  const handleDeleteDialogKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancelDelete();
      return;
    }

    if (event.key !== 'Tab') return;

    const dialog = deleteDialogRef.current;
    const focusableButtons = [deleteCancelRef.current, deleteConfirmRef.current].filter(
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
      {currentCohort && (
        <section className="assessment-current-cohort" aria-labelledby="assessment-current-cohort-title">
          <header>
            <div>
              <span className="assessment-cohort-status is-active">Active</span>
              <h2 id="assessment-current-cohort-title">{cohortName(currentCohort)}</h2>
              <p>{cohortSlug(currentCohort) || 'Monthly cohort'}</p>
            </div>
            {currentId && (
              <button
                className="assessment-button assessment-cohort-delete-trigger"
                type="button"
                ref={deleteTriggerRef}
                aria-haspopup="dialog"
                aria-expanded={deleteOpen}
                aria-controls={deleteOpen ? 'assessment-delete-current-cohort' : undefined}
                onClick={() => {
                  setDeleteOpen(true);
                  setDeleteError('');
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                  <path d="M4 7h16" />
                  <path d="M9 7V4h6v3" />
                  <path d="m6.5 7 .75 13h9.5l.75-13" />
                  <path d="M10 11v5M14 11v5" />
                </svg>
                <span>Delete</span>
              </button>
            )}
          </header>

          <dl className="assessment-cohort-dates">
            <div>
              <dt>Opens</dt>
              <dd>{formatDateTime(cohortValue(currentCohort, 'opensAt', 'opens_at'))}</dd>
            </div>
            <div>
              <dt>Closes</dt>
              <dd>{formatDateTime(cohortValue(currentCohort, 'closesAt', 'closes_at'))}</dd>
            </div>
          </dl>

          <dl className="assessment-cohort-counts">
            <div>
              <dt>Applications</dt>
              <dd>
                {numericCount(
                  currentCohort,
                  'applicationCount',
                  'applicationsCount',
                  'application_count',
                )}
              </dd>
            </div>
            <div>
              <dt>Waiting</dt>
              <dd>{numericCount(currentCohort, 'pendingCount', 'waitingCount', 'pending_count')}</dd>
            </div>
            <div>
              <dt>Processed</dt>
              <dd>{processedCount(currentCohort)}</dd>
            </div>
          </dl>
        </section>
      )}

      {currentCohort && deleteOpen && (
        <div
          className="assessment-cohort-delete-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) cancelDelete();
          }}
        >
          <div
            className="assessment-cohort-delete-dialog"
            id="assessment-delete-current-cohort"
            role="dialog"
            aria-modal="true"
            aria-labelledby="assessment-delete-current-cohort-title"
            aria-describedby="assessment-delete-current-cohort-message"
            aria-busy={isDeleting}
            ref={deleteDialogRef}
            tabIndex="-1"
            onKeyDown={handleDeleteDialogKeyDown}
          >
            <h2 id="assessment-delete-current-cohort-title">Delete cohort?</h2>
            <p id="assessment-delete-current-cohort-message">
              Are you sure you want to delete {cohortName(currentCohort)}?
            </p>
            {deleteError && (
              <p className="assessment-confirmation-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="assessment-cohort-delete-actions">
              <button
                className="assessment-button assessment-button-secondary"
                type="button"
                ref={deleteCancelRef}
                onClick={cancelDelete}
                disabled={isDeleting}
              >
                No
              </button>
              <button
                className="assessment-button assessment-button-danger"
                type="button"
                ref={deleteConfirmRef}
                onClick={deleteActiveCohort}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCreateForm && (
        <section
          className="assessment-cohort-create"
          id="assessment-cohort-create"
          aria-labelledby="assessment-cohort-create-title"
        >
          <h2 id="assessment-cohort-create-title" ref={createHeadingRef} tabIndex="-1">
            Activate cohort and password
          </h2>

          <form onSubmit={submitCohort} noValidate>
            <div className="assessment-field-row">
              <label className="assessment-field">
                <span>Cohort month</span>
                <select name="slug" value={form.slug} onChange={updateField} required>
                  {monthOptions.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="assessment-field">
                <span>Display name</span>
                <input
                  name="displayName"
                  type="text"
                  value={form.displayName}
                  onChange={updateField}
                  placeholder="October 2026"
                  required
                />
              </label>
            </div>

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
                <span>Application opens · Madrid time</span>
                <input
                  name="opensAt"
                  type="datetime-local"
                  value={form.opensAt}
                  onChange={updateField}
                  required
                />
              </label>
              <label className="assessment-field">
                <span>Application deadline · Madrid time</span>
                <input
                  name="closesAt"
                  type="datetime-local"
                  value={form.closesAt}
                  onChange={updateField}
                  required
                />
              </label>
            </div>

            {formError && (
              <p className="assessment-form-error" id="assessment-cohort-form-error" role="alert">
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
              {isCreating ? 'Activating cohort and password…' : 'Activate cohort and password'}
            </button>
          </form>
        </section>
      )}

      {!currentCohort && !showCreateForm && (
        <section className="assessment-cohort-empty" aria-labelledby="assessment-no-cohort-title">
          <span className="assessment-cohort-empty-icon" aria-hidden="true">
            +
          </span>
          <h2 id="assessment-no-cohort-title">No active cohort</h2>
          <p>Use the + Add cohort button above.</p>
        </section>
      )}
    </div>
  );
}
