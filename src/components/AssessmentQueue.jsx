import { useEffect, useId, useRef, useState } from 'react';
import PatchAudioPlayer from './PatchAudioPlayer.jsx';
import { formatApplicationDateTime } from '../recruitment-time.js';

function applicationValue(application, ...keys) {
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

function getApplicationId(application) {
  return applicationValue(application, 'id', 'applicationId', 'application_id');
}

function safeLinkedInUrl(value) {
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

export default function AssessmentQueue({
  application,
  onDecision,
  isDeciding = false,
  readOnly = false,
}) {
  const [pendingDecision, setPendingDecision] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const applicantHeadingRef = useRef(null);
  const confirmationHeadingRef = useRef(null);
  const decisionTriggerRef = useRef('');
  const failButtonRef = useRef(null);
  const passButtonRef = useRef(null);
  const id = getApplicationId(application);
  const cardId = useId();
  const applicantHeadingId = `${cardId}-applicant`;
  const recordingHeadingId = `${cardId}-recording`;
  const confirmationHeadingId = `${cardId}-confirmation`;
  const confirmationCopyId = `${cardId}-confirmation-copy`;
  const emptyHeadingId = `${cardId}-empty`;
  const decision = applicationValue(application, 'decision');
  const hasDecision = decision === 'pass' || decision === 'fail';
  const canDecide = !readOnly && !hasDecision;

  useEffect(() => {
    setPendingDecision('');
    setDecisionError('');
    if (application && canDecide) applicantHeadingRef.current?.focus({ preventScroll: true });
  }, [id, canDecide]);

  useEffect(() => {
    if (pendingDecision && canDecide) confirmationHeadingRef.current?.focus();
  }, [pendingDecision, canDecide]);

  if (!application) {
    return (
      <section className="assessment-empty" aria-labelledby={emptyHeadingId}>
        <span className="assessment-empty-check" aria-hidden="true">
          ✓
        </span>
        <p className="assessment-eyebrow">Queue complete</p>
        <h2 id={emptyHeadingId}>You’re all caught up.</h2>
      </section>
    );
  }

  const name = applicationValue(application, 'fullName', 'full_name', 'name') || 'Applicant';
  const email = applicationValue(application, 'email') || 'Email unavailable';
  const linkedInValue = applicationValue(
    application,
    'linkedinUrl',
    'linkedInUrl',
    'linkedin_url',
    'linkedin',
  );
  const linkedInUrl = safeLinkedInUrl(linkedInValue);
  const receivedAt = applicationValue(
    application,
    'receivedAt',
    'submittedAt',
    'submitted_at',
    'createdAt',
    'created_at',
  );
  const audioSource = id
    ? `/api/recruitment/reviewer/applications/${encodeURIComponent(String(id))}/audio`
    : '';
  const explicitDurationMs = Number(
    applicationValue(application, 'audioDurationMs', 'durationMs', 'audio_duration_ms'),
  );
  const durationSeconds = Number(
    applicationValue(
      application,
      'audioDurationSeconds',
      'audio_duration_seconds',
      'audioDuration',
      'duration',
      'audio_duration',
    ),
  );
  const durationMs = Number.isFinite(explicitDurationMs) && explicitDurationMs > 0
    ? explicitDurationMs
    : Number.isFinite(durationSeconds) && durationSeconds > 0
      ? durationSeconds * 1000
      : 0;

  const confirmDecision = async () => {
    if (!canDecide || !id || !pendingDecision || isDeciding || typeof onDecision !== 'function') return;
    setDecisionError('');

    try {
      await onDecision(application, pendingDecision);
    } catch (error) {
      setDecisionError(error?.message || 'The decision could not be saved. Nothing was changed.');
    }
  };

  const openConfirmation = (decision) => {
    if (!canDecide || !id || isDeciding) return;
    decisionTriggerRef.current = decision;
    setDecisionError('');
    setPendingDecision(decision);
  };

  const closeConfirmation = () => {
    setPendingDecision('');
    setDecisionError('');
    window.requestAnimationFrame(() => {
      (decisionTriggerRef.current === 'pass' ? passButtonRef.current : failButtonRef.current)?.focus();
    });
  };

  return (
    <section className="assessment-review" aria-labelledby={applicantHeadingId}>
      <article className="assessment-applicant-card">
        <header className="assessment-applicant-header">
          <div>
            <p className="assessment-eyebrow">
              Received {formatApplicationDateTime(receivedAt, 'time unavailable')}
            </p>
            <h2 id={applicantHeadingId} ref={applicantHeadingRef} tabIndex="-1">
              {name}
            </h2>
          </div>
          {hasDecision && (
            <span className={`assessment-outcome-badge assessment-outcome-${decision}`}>
              {decision === 'pass' ? 'Passed' : 'Failed'}
            </span>
          )}
        </header>

        <dl className="assessment-applicant-details">
          <div>
            <dt>Email</dt>
            <dd>
              {email !== 'Email unavailable' ? <a href={`mailto:${email}`}>{email}</a> : email}
            </dd>
          </div>
          <div>
            <dt>LinkedIn</dt>
            <dd>
              {linkedInUrl ? (
                <a href={linkedInUrl} target="_blank" rel="noreferrer">
                  View profile <span aria-hidden="true">↗</span>
                </a>
              ) : (
                'Profile unavailable'
              )}
            </dd>
          </div>
        </dl>

        <section className="assessment-recording" aria-labelledby={recordingHeadingId}>
          <div>
            <p className="assessment-eyebrow">Voice note</p>
            <h3 id={recordingHeadingId}>Stage One application</h3>
          </div>
          {audioSource ? (
            <div className="assessment-audio">
              <PatchAudioPlayer
                key={String(id)}
                src={audioSource}
                durationMs={durationMs}
                label={`${name}'s voice note`}
                errorMessage="This stored recording could not be played. Check the audio file before deciding."
              />
            </div>
          ) : (
            <p className="assessment-audio-error" role="alert">
              This application is missing its playback identifier.
            </p>
          )}
        </section>

        {canDecide && (!pendingDecision ? (
          <div className="assessment-decision-actions" aria-label={`Decision for ${name}`}>
            <div>
              <button
                className="assessment-button assessment-button-fail"
                ref={failButtonRef}
                type="button"
                onClick={() => openConfirmation('fail')}
                disabled={isDeciding || !id}
              >
                Fail
              </button>
              <button
                className="assessment-button assessment-button-pass"
                ref={passButtonRef}
                type="button"
                onClick={() => openConfirmation('pass')}
                disabled={isDeciding || !id}
              >
                Pass
              </button>
            </div>
          </div>
        ) : (
          <section
            className={`assessment-confirmation assessment-confirmation-${pendingDecision}`}
            role="alertdialog"
            aria-labelledby={confirmationHeadingId}
            aria-describedby={confirmationCopyId}
          >
            <p className="assessment-eyebrow">Final confirmation</p>
            <h3 id={confirmationHeadingId} ref={confirmationHeadingRef} tabIndex="-1">
              {pendingDecision === 'pass' ? `Pass ${name}?` : `Fail ${name}?`}
            </h3>
            <p id={confirmationCopyId}>
              {pendingDecision === 'pass'
                ? 'This irreversible decision will be recorded immediately and the Stage Two invitation will be sent.'
                : 'This irreversible decision will be recorded immediately and the application outcome will be sent.'}
            </p>
            {decisionError && (
              <p className="assessment-confirmation-error" role="alert">
                {decisionError}
              </p>
            )}
            <div className="assessment-confirmation-actions">
              <button
                className="assessment-button assessment-button-secondary"
                type="button"
                onClick={closeConfirmation}
                disabled={isDeciding}
              >
                Go back
              </button>
              <button
                className={`assessment-button assessment-button-${pendingDecision}`}
                type="button"
                onClick={confirmDecision}
                disabled={isDeciding}
              >
                {isDeciding
                  ? 'Saving decision…'
                  : `Confirm ${pendingDecision === 'pass' ? 'Pass' : 'Fail'}`}
              </button>
            </div>
          </section>
        ))}
      </article>
    </section>
  );
}
