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

function nextMonthDefaults(currentCohort) {
  const anchor = monthFromCohort(currentCohort) || currentMadridMonth();
  const monthStart = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1, 12, 0, 0, 0);
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
  const displayName = new Intl.DateTimeFormat('en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(monthStart);

  return {
    slug,
    displayName,
    password: '',
    opensAt: toLocalInputValue(first),
    closesAt: toLocalInputValue(last),
  };
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
  const all = [...(Array.isArray(cohorts) ? cohorts : []), currentCohort, previousCohort].filter(Boolean);
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
  onCreate,
  onActivate,
}) {
  const defaults = useMemo(() => nextMonthDefaults(currentCohort), [currentCohort]);
  const [form, setForm] = useState(defaults);
  const [formTouched, setFormTouched] = useState(false);
  const [formError, setFormError] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [activationTarget, setActivationTarget] = useState(null);
  const [activationConfirmed, setActivationConfirmed] = useState(false);
  const [activationError, setActivationError] = useState('');
  const [isActivating, setIsActivating] = useState(false);
  const activationHeadingRef = useRef(null);
  const activationTriggerRef = useRef(null);

  useEffect(() => {
    if (!formTouched) setForm(defaults);
  }, [defaults, formTouched]);

  useEffect(() => {
    if (activationTarget) activationHeadingRef.current?.focus();
  }, [activationTarget]);

  const visibleCohorts = useMemo(
    () => mergeCohorts(cohorts, currentCohort, previousCohort),
    [cohorts, currentCohort, previousCohort],
  );

  const updateField = (event) => {
    const { name, value } = event.target;
    setFormTouched(true);
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
      setFormError('Complete every cohort field before creating it.');
      return;
    }
    if (form.closesAt <= form.opensAt) {
      setFormError('The closing time must be after the opening time.');
      return;
    }

    setIsCreating(true);
    try {
      await onCreate({
        slug,
        monthKey: slug,
        displayName,
        password,
        opensAt: form.opensAt,
        closesAt: form.closesAt,
      });
      setForm((current) => ({ ...current, password: '' }));
      setFormTouched(false);
    } catch (requestError) {
      setFormError(requestError?.message || 'The cohort could not be created.');
      setForm((current) => ({ ...current, password: '' }));
    } finally {
      setIsCreating(false);
    }
  };

  const activateCohort = async () => {
    const id = cohortId(activationTarget);
    if (!id || !activationConfirmed || isActivating) return;

    setActivationError('');
    setIsActivating(true);
    try {
      await onActivate(id);
      setActivationTarget(null);
      setActivationConfirmed(false);
      window.requestAnimationFrame(() => {
        document.querySelector('.assessment-navigation [aria-current="page"]')?.focus();
      });
    } catch (requestError) {
      setActivationError(requestError?.message || 'The cohort could not be activated.');
    } finally {
      setIsActivating(false);
    }
  };

  const cancelActivation = () => {
    setActivationTarget(null);
    setActivationConfirmed(false);
    setActivationError('');
    window.requestAnimationFrame(() => activationTriggerRef.current?.focus());
  };

  return (
    <div className="assessment-cohorts">
      <div className="assessment-section-intro">
        <p className="assessment-eyebrow">Monthly application access</p>
        <h2>Create the password applicants will use</h2>
        <p>
          Each month, choose one shared password, set the Sunday-to-Friday application window and
          activate it. Everyone you invite that month uses the same password.
        </p>
      </div>

      <div className="assessment-password-workflow" aria-label="Monthly password workflow">
        <div>
          <strong>1</strong>
          <span>Choose the shared password</span>
        </div>
        <div>
          <strong>2</strong>
          <span>Set the opening and deadline</span>
        </div>
        <div>
          <strong>3</strong>
          <span>Activate and send it out</span>
        </div>
        <a href="#assessment-cohort-create-title">Create next month’s password ↓</a>
      </div>

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
              const canActivate = (status === 'Draft' || status === 'Next') && Boolean(id);

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
                    {canActivate && (
                      <button
                        className="assessment-button assessment-button-secondary"
                        type="button"
                        onClick={(event) => {
                          activationTriggerRef.current = event.currentTarget;
                          setActivationTarget(cohort);
                          setActivationConfirmed(false);
                          setActivationError('');
                        }}
                      >
                        Activate
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
                </article>
              );
            })}
          </div>
        )}
      </section>

      {activationTarget && (
        <section
          className="assessment-activation-warning"
          role="alertdialog"
          aria-labelledby="assessment-activation-title"
          aria-describedby="assessment-activation-copy"
        >
          <p className="assessment-eyebrow">Permanent deletion warning</p>
          <h3 id="assessment-activation-title" ref={activationHeadingRef} tabIndex="-1">
            Activate {cohortName(activationTarget)}?
          </h3>
          <p id="assessment-activation-copy">
            {!currentCohort ? (
              <>This makes {cohortName(activationTarget)} the current cohort. There is no existing cohort data to delete.</>
            ) : previousCohort ? (
              <>
                Activating this cohort retains <strong>{cohortName(currentCohort)}</strong> as the
                previous cohort. It permanently deletes applications and recordings from{' '}
                <strong>{cohortName(previousCohort)}</strong> and anything older. This cannot be undone.
              </>
            ) : (
              <>
                Activating this cohort retains <strong>{cohortName(currentCohort)}</strong> as the
                previous cohort. There is no older retained cohort to delete.
              </>
            )}
          </p>
          <label className="assessment-confirm-checkbox">
            <input
              type="checkbox"
              checked={activationConfirmed}
              onChange={(event) => setActivationConfirmed(event.target.checked)}
            />
            <span>
              {!currentCohort
                ? 'I understand that this cohort will become current.'
                : previousCohort
                  ? 'I understand that the current cohort will be retained, while the old previous cohort and anything older will be deleted.'
                  : 'I understand that the current cohort will move to previous and this cohort will become current.'}
            </span>
          </label>
          {activationError && (
            <p className="assessment-confirmation-error" role="alert">
              {activationError}
            </p>
          )}
          <div className="assessment-confirmation-actions">
            <button
              className="assessment-button assessment-button-secondary"
              type="button"
              onClick={cancelActivation}
              disabled={isActivating}
            >
              Cancel
            </button>
            <button
              className="assessment-button assessment-button-danger"
              type="button"
              onClick={activateCohort}
              disabled={!activationConfirmed || isActivating}
            >
              {isActivating
                ? 'Activating…'
                : previousCohort
                  ? 'Delete older data and activate'
                  : 'Activate cohort'}
            </button>
          </div>
        </section>
      )}

      <section className="assessment-cohort-create" aria-labelledby="assessment-cohort-create-title">
        <div>
          <p className="assessment-eyebrow">Next month’s applicant access</p>
          <h3 id="assessment-cohort-create-title">Create a cohort and password</h3>
          <p>
            Enter the password you will send to every invited applicant. It remains reusable for
            the whole application window and is not displayed again after creation.
          </p>
        </div>

        <form onSubmit={submitCohort} noValidate>
          <div className="assessment-field-row">
            <label className="assessment-field">
              <span>Cohort month</span>
              <input
                name="slug"
                type="text"
                inputMode="numeric"
                value={form.slug}
                onChange={updateField}
                placeholder="2026-10"
                pattern="\d{4}-(0[1-9]|1[0-2])"
                required
              />
              <small>Use YYYY-MM.</small>
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

          <label className="assessment-field">
            <span>Shared applicant password</span>
            <input
              name="password"
              type="password"
              value={form.password}
              onChange={updateField}
              autoComplete="new-password"
              spellCheck="false"
              required
            />
            <small>
              Write this down before continuing. Everyone invited this month will use it.
            </small>
          </label>

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
            {isCreating ? 'Creating cohort and password…' : 'Create cohort and password'}
          </button>
        </form>
      </section>
    </div>
  );
}
