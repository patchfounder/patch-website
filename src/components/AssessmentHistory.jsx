function valueFrom(application, ...keys) {
  for (const key of keys) {
    if (application?.[key] !== undefined && application?.[key] !== null) {
      return application[key];
    }

    if (application?.applicant?.[key] !== undefined && application?.applicant?.[key] !== null) {
      return application.applicant[key];
    }
  }
  return '';
}

function safeExternalUrl(value) {
  if (!value || typeof value !== 'string') return '';
  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch {
    if (/^(www\.)?linkedin\.com\//i.test(trimmed)) return `https://${trimmed}`;
    return '';
  }
}

function formatDateTime(value) {
  if (!value) return 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';

  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Madrid',
  }).format(date);
}

function cohortLabel(cohort, fallback) {
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

function decisionFor(application) {
  const raw = valueFrom(application, 'decision', 'outcome', 'result', 'decisionStatus');
  if (typeof raw === 'object') return String(raw?.value || raw?.status || '').toLowerCase();
  return String(raw || '').toLowerCase();
}

function emailStatusFor(application) {
  const raw =
    valueFrom(
      application,
      'emailStatus',
      'email_status',
      'outcomeEmailStatus',
      'outcome_email_status',
    ) ||
    application?.emailDelivery?.status ||
    application?.email_delivery?.status ||
    application?.email?.status;
  const status = String(raw || 'unknown').toLowerCase();

  if (['delivered', 'sent', 'succeeded', 'success'].includes(status)) {
    return { label: 'Outcome email sent', tone: 'sent' };
  }
  if (['failed', 'error', 'bounced', 'rejected'].includes(status)) {
    return { label: 'Outcome email failed', tone: 'failed' };
  }
  if (status === 'attempting') {
    return { label: 'Outcome email attempt interrupted', tone: 'failed' };
  }
  if (['pending', 'queued', 'sending', 'processing'].includes(status)) {
    return { label: 'Outcome email pending', tone: 'pending' };
  }
  return { label: 'Email status unavailable', tone: 'unknown' };
}

function decisionTime(application) {
  return valueFrom(
    application,
    'decidedAt',
    'decisionAt',
    'decision_at',
    'reviewedAt',
    'reviewed_at',
    'processedAt',
    'processed_at',
    'updatedAt',
    'updated_at',
  );
}

function sortHistory(items) {
  return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
    const leftTime = Date.parse(decisionTime(left)) || 0;
    const rightTime = Date.parse(decisionTime(right)) || 0;
    return rightTime - leftTime;
  });
}

function HistoryGroup({ title, label, items, totalCount = items.length }) {
  const sortedItems = sortHistory(items);
  const processedCount = Math.max(sortedItems.length, Number(totalCount) || 0);
  const headingId = `assessment-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-history-title`;

  return (
    <section className="assessment-history-group" aria-labelledby={headingId}>
      <header className="assessment-history-heading">
        <div>
          <p className="assessment-eyebrow">{label}</p>
          <h2 id={headingId}>{title}</h2>
        </div>
        <span>{processedCount} processed</span>
      </header>

      {sortedItems.length === 0 ? (
        <div className="assessment-history-empty">
          <p>
            {processedCount > 0
              ? 'Processed applications exist outside the loaded history window.'
              : 'No processed applications in this cohort.'}
          </p>
        </div>
      ) : (
        <>
          {processedCount > sortedItems.length && (
            <p className="assessment-history-limit-note">
              Showing the latest {sortedItems.length} of {processedCount} processed applications.
            </p>
          )}
          <div className="assessment-history-list">
            {sortedItems.map((application, index) => {
              const id = valueFrom(application, 'id', 'applicationId', 'application_id') || index;
              const name = valueFrom(application, 'fullName', 'full_name', 'name') || 'Applicant';
              const email = valueFrom(application, 'email') || 'Email unavailable';
              const linkedInUrl = safeExternalUrl(
                valueFrom(
                  application,
                  'linkedinUrl',
                  'linkedInUrl',
                  'linkedin_url',
                  'linkedin',
                ),
              );
              const decision = decisionFor(application);
              const passed = decision === 'pass' || decision === 'passed';
              const failed = decision === 'fail' || decision === 'failed';
              const emailStatus = emailStatusFor(application);

              return (
                <article className="assessment-history-card" key={String(id)}>
                  <div className="assessment-history-person">
                    <div>
                      <h3>{name}</h3>
                      <p>{email}</p>
                    </div>
                    <span
                      className={`assessment-decision-badge ${
                        passed ? 'is-pass' : failed ? 'is-fail' : 'is-unknown'
                      }`}
                    >
                      {passed ? 'Pass' : failed ? 'Fail' : 'Processed'}
                    </span>
                  </div>

                  <dl className="assessment-history-meta">
                    <div>
                      <dt>Decision recorded</dt>
                      <dd>{formatDateTime(decisionTime(application))}</dd>
                    </div>
                    <div>
                      <dt>Email</dt>
                      <dd>
                        <span className={`assessment-email-status is-${emailStatus.tone}`}>
                          <span aria-hidden="true" />
                          {emailStatus.label}
                        </span>
                      </dd>
                    </div>
                  </dl>

                  {linkedInUrl && (
                    <a
                      className="assessment-history-link"
                      href={linkedInUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      LinkedIn profile <span aria-hidden="true">↗</span>
                    </a>
                  )}
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}

export default function AssessmentHistory({
  currentItems = [],
  previousItems = [],
  currentCohort,
  previousCohort,
}) {
  return (
    <div className="assessment-history">
      <div className="assessment-section-intro">
        <p className="assessment-eyebrow">Decision record</p>
        <h2>Processed applications</h2>
        <p>
          Decisions are permanent. Email delivery is shown for visibility; there are no resend
          controls in this workspace.
        </p>
      </div>

      <HistoryGroup
        title={cohortLabel(currentCohort, 'Current cohort')}
        label="Current cohort"
        items={currentItems}
        totalCount={currentCohort?.processedCount}
      />
      <HistoryGroup
        title={cohortLabel(previousCohort, 'Previous cohort')}
        label="Previous cohort"
        items={previousItems}
        totalCount={previousCohort?.processedCount}
      />
    </div>
  );
}
