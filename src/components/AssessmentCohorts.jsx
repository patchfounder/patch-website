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

function cohortSlug(cohort) {
  return cohortValue(cohort, 'slug', 'monthKey', 'month_key');
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

function sameCohort(left, right) {
  if (!left || !right) return false;
  const leftIds = [cohortId(left), cohortSlug(left)].filter(Boolean).map(String);
  const rightIds = [cohortId(right), cohortSlug(right)].filter(Boolean).map(String);
  return leftIds.some((value) => rightIds.includes(value));
}

function statusFor(cohort, currentCohort, previousCohort) {
  if (sameCohort(cohort, currentCohort) || cohort?.active === true) return 'Active';
  if (sameCohort(cohort, previousCohort)) return 'Previous';

  const slot = String(cohortValue(cohort, 'slot') || '').toLowerCase();
  if (slot === 'current') return 'Active';
  if (slot === 'previous') return 'Previous';
  if (slot === 'next') return 'Next';

  const declaredStatus = String(cohortValue(cohort, 'status', 'state') || '').toLowerCase();
  if (declaredStatus === 'previous' || declaredStatus === 'archived') return 'Previous';
  if (declaredStatus === 'next') return 'Next';
  if (declaredStatus === 'draft') return 'Draft';

  const closesAt = cohortValue(cohort, 'closesAt', 'closes_at');
  if (closesAt && Date.parse(closesAt) < Date.now()) return 'Closed';
  return 'Draft';
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

function mergeCohorts(cohorts, currentCohort, previousCohort) {
  const all = [...(Array.isArray(cohorts) ? cohorts : []), currentCohort, previousCohort]
    .filter(Boolean)
    .filter((cohort) => String(cohortValue(cohort, 'slot')).toLowerCase() !== 'next');
  const seen = new Set();

  return all
    .filter((cohort) => {
      const identity = String(cohortId(cohort) || cohortSlug(cohort) || cohortName(cohort));
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    })
    .sort((left, right) => {
      const leftDate = Date.parse(cohortValue(left, 'opensAt', 'opens_at')) || 0;
      const rightDate = Date.parse(cohortValue(right, 'opensAt', 'opens_at')) || 0;
      return rightDate - leftDate;
    });
}

export default function AssessmentCohorts({
  cohorts = [],
  currentCohort,
  previousCohort,
  isLoading = false,
  error = '',
  onReload,
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
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const deleteTriggerRef = useRef(null);
  const deleteCancelRef = useRef(null);

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
    if (deleteTarget) deleteCancelRef.current?.focus();
  }, [deleteTarget]);

  const visibleCohorts = useMemo(
    () => mergeCohorts(cohorts, currentCohort, previousCohort),
    [cohorts, currentCohort, previousCohort],
  );

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
    } catch (requestError) {
      setFormError(requestError?.message || 'The cohort and password could not be activated.');
    } finally {
      setIsCreating(false);
    }
  };

  const deleteActiveCohort = async () => {
    const id = cohortId(deleteTarget);
    if (!id || isDeleting) return;

    setDeleteError('');
    setIsDeleting(true);
    try {
      await onDeleteActive(id);
      setDeleteTarget(null);
      window.requestAnimationFrame(() => {
        document.querySelector('.assessment-navigation [aria-current="page"]')?.focus();
      });
    } catch (requestError) {
      setDeleteError(requestError?.message || 'The active cohort could not be deleted.');
    } finally {
      setIsDeleting(false);
    }
  };

  const cancelDelete = () => {
    setDeleteTarget(null);
    setDeleteError('');
    window.requestAnimationFrame(() => deleteTriggerRef.current?.focus());
  };

  return (
    <div className="assessment-cohorts">
      {error && (
        <div className="assessment-inline-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={onReload}>
            Reload cohorts
          </button>
        </div>
      )}

      <section className="assessment-cohort-list-section" aria-labelledby="assessment-cohort-list-title">
        <div className="assessment-cohort-list-heading">
          <h3 id="assessment-cohort-list-title">Monthly cohorts</h3>
          {isLoading && <span role="status">Updating…</span>}
        </div>

        {visibleCohorts.length === 0 && !isLoading ? (
          <div className="assessment-history-empty">
            <p>No cohorts have been created yet.</p>
          </div>
        ) : (
          <div className="assessment-cohort-list">
            {visibleCohorts.map((cohort) => {
              const id = cohortId(cohort);
              const status = statusFor(cohort, currentCohort, previousCohort);
              const canDelete = status === 'Active' && Boolean(id);
              const isDeleteTarget = sameCohort(cohort, deleteTarget);
              const deletePanelId = `assessment-delete-${String(id || 'cohort').replace(/[^A-Za-z0-9_-]/g, '-')}`;

              return (
                <article className="assessment-cohort-card" key={String(id || cohortSlug(cohort))}>
                  <header>
                    <div>
                      <span className={`assessment-cohort-status is-${status.toLowerCase()}`}>
                        {status}
                      </span>
                      <h4>{cohortName(cohort)}</h4>
                      <p>{cohortSlug(cohort) || 'Monthly cohort'}</p>
                    </div>
                    {canDelete && (
                      <button
                        className="assessment-button assessment-cohort-delete-trigger"
                        type="button"
                        aria-expanded={isDeleteTarget}
                        aria-controls={deletePanelId}
                        onClick={(event) => {
                          deleteTriggerRef.current = event.currentTarget;
                          setDeleteTarget(cohort);
                          setDeleteError('');
                        }}
                      >
                        Delete
                      </button>
                    )}
                  </header>

                  <dl className="assessment-cohort-dates">
                    <div>
                      <dt>Opens</dt>
                      <dd>{formatDateTime(cohortValue(cohort, 'opensAt', 'opens_at'))}</dd>
                    </div>
                    <div>
                      <dt>Closes</dt>
                      <dd>{formatDateTime(cohortValue(cohort, 'closesAt', 'closes_at'))}</dd>
                    </div>
                  </dl>

                  <dl className="assessment-cohort-counts">
                    <div>
                      <dt>Applications</dt>
                      <dd>{numericCount(cohort, 'applicationCount', 'applicationsCount', 'application_count')}</dd>
                    </div>
                    <div>
                      <dt>Waiting</dt>
                      <dd>{numericCount(cohort, 'pendingCount', 'waitingCount', 'pending_count')}</dd>
                    </div>
                    <div>
                      <dt>Processed</dt>
                      <dd>{processedCount(cohort)}</dd>
                    </div>
                  </dl>

                  {isDeleteTarget && (
                    <div
                      className="assessment-cohort-delete-confirmation"
                      id={deletePanelId}
                      role="group"
                      aria-labelledby={`${deletePanelId}-question`}
                    >
                      <p id={`${deletePanelId}-question`}>
                        Delete {cohortName(cohort)} and all its applications and recordings?
                      </p>
                      {deleteError && (
                        <p className="assessment-confirmation-error" role="alert">
                          {deleteError}
                        </p>
                      )}
                      <div>
                        <button
                          className="assessment-button assessment-button-secondary"
                          type="button"
                          ref={deleteCancelRef}
                          onClick={cancelDelete}
                          disabled={isDeleting}
                        >
                          Cancel
                        </button>
                        <button
                          className="assessment-button assessment-button-danger"
                          type="button"
                          onClick={deleteActiveCohort}
                          disabled={isDeleting}
                        >
                          {isDeleting ? 'Deleting…' : 'Delete cohort'}
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="assessment-cohort-create" aria-labelledby="assessment-cohort-create-title">
        <h3 id="assessment-cohort-create-title">Activate cohort and password</h3>

        <form onSubmit={submitCohort} noValidate>
          <div className="assessment-field-row">
            <label className="assessment-field">
              <span>Cohort month</span>
              <select
                name="slug"
                value={form.slug}
                onChange={updateField}
                required
              >
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
            <p className="assessment-form-error" role="alert">
              {formError}
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
    </div>
  );
}
