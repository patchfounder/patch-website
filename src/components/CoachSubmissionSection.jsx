import { useEffect, useRef, useState } from 'react';
import PatchAudioPlayer from './PatchAudioPlayer.jsx';
import PatchVoiceRecorder from './PatchVoiceRecorder.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normaliseLinkedInUrl(value) {
  const trimmedValue = value.trim();
  const candidate = /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
  const url = new URL(candidate);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');

  if (url.protocol !== 'https:' || (hostname !== 'linkedin.com' && !hostname.endsWith('.linkedin.com'))) {
    throw new Error('invalid-linkedin');
  }

  if (!/^\/(in|pub)\//i.test(url.pathname)) {
    throw new Error('invalid-linkedin');
  }

  url.hash = '';
  return url.toString();
}

function validateApplication({ fullName, email, linkedin, recording }) {
  const errors = {};
  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  let normalisedLinkedIn = '';

  if (trimmedName.length < 2) {
    errors.fullName = 'Enter your full name.';
  } else if (trimmedName.length > 120) {
    errors.fullName = 'Your full name must be 120 characters or fewer.';
  }

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    errors.email = 'Enter a valid email address.';
  } else if (trimmedEmail.length > 254) {
    errors.email = 'Your email address is too long.';
  }

  try {
    normalisedLinkedIn = normaliseLinkedInUrl(linkedin);
  } catch {
    errors.linkedin = 'Enter a valid LinkedIn profile URL.';
  }

  if (!recording?.blob || recording.blob.size === 0) {
    errors.recording = 'Record a voice note before reviewing your application.';
  }

  return {
    errors,
    values: {
      fullName: trimmedName,
      email: trimmedEmail,
      linkedin: normalisedLinkedIn,
    },
  };
}

function responseMessage(status) {
  if (status === 409) return 'Application access changed before submission. Refresh the page and unlock the application again.';
  if (status === 413) return 'The voice note is too large. Record it again and retry.';
  if (status === 422) return 'Some application details could not be accepted. Go back and check them.';
  if (status === 429) return 'Too many attempts were made. Wait a moment, then try again.';
  if (status >= 500) return 'The application service is temporarily unavailable. Your details remain on this screen so you can retry.';
  return 'Your application could not be submitted. Check your connection and try again.';
}

export default function CoachSubmissionSection({ onSuccess, onAccessExpired }) {
  const [formValues, setFormValues] = useState({
    fullName: '',
    email: '',
    linkedin: '',
  });
  const [recording, setRecording] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [step, setStep] = useState('compose');
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [submitError, setSubmitError] = useState('');
  const requestRef = useRef(null);
  const reviewHeadingRef = useRef(null);
  const errorSummaryRef = useRef(null);

  useEffect(() => () => {
    requestRef.current?.abort();
  }, []);

  useEffect(() => {
    if (step === 'review') {
      reviewHeadingRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (submitError) {
      errorSummaryRef.current?.focus();
    }
  }, [submitError]);

  useEffect(() => {
    if (!isSubmitting) {
      return undefined;
    }

    const warnBeforeLeaving = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [isSubmitting]);

  const updateField = (field) => (event) => {
    setFormValues((current) => ({ ...current, [field]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [field]: '' }));
    setSubmitError('');
  };

  const reviewApplication = (event) => {
    event.preventDefault();
    const validation = validateApplication({ ...formValues, recording });

    if (Object.keys(validation.errors).length > 0) {
      setFieldErrors(validation.errors);
      setSubmitError('Check the highlighted items before continuing.');
      window.requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }

    setFormValues(validation.values);
    setFieldErrors({});
    setSubmitError('');
    setIsConfirmed(false);
    setStep('review');
  };

  const returnToApplication = () => {
    setSubmitError('');
    setIsConfirmed(false);
    setStep('compose');
    window.requestAnimationFrame(() => {
      document.getElementById('coach-full-name')?.focus();
    });
  };

  const submitApplication = () => {
    if (isSubmitting || !isConfirmed || !recording?.blob) {
      return;
    }

    setSubmitError('');
    setIsSubmitting(true);
    setUploadProgress(0);

    const body = new FormData();
    body.append('fullName', formValues.fullName);
    body.append('email', formValues.email);
    body.append('linkedin', formValues.linkedin);
    body.append('audio', recording.blob, recording.fileName);
    body.append('audioDurationMs', String(Math.round(recording.durationMs)));

    const request = new XMLHttpRequest();
    requestRef.current = request;
    request.open('POST', '/api/recruitment/applications');
    request.withCredentials = true;
    request.timeout = 120_000;
    request.setRequestHeader('Accept', 'application/json');

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        setUploadProgress(Math.min(Math.round((event.loaded / event.total) * 100), 99));
      }
    });

    request.addEventListener('load', () => {
      requestRef.current = null;

      if (request.status >= 200 && request.status < 300) {
        setUploadProgress(100);
        let response = {};

        try {
          response = request.responseText ? JSON.parse(request.responseText) : {};
        } catch {
          response = {};
        }

        onSuccess?.({
          firstName: formValues.fullName.split(/\s+/)[0],
          email: formValues.email,
          applicationId:
            response.application?.applicationId || response.applicationId || response.id || '',
        });
        return;
      }

      setIsSubmitting(false);

      if (request.status === 401 || request.status === 403) {
        setSubmitError('Your application access expired before submission. Nothing was submitted.');
        onAccessExpired?.();
        return;
      }

      setSubmitError(responseMessage(request.status));
    });

    request.addEventListener('error', () => {
      requestRef.current = null;
      setIsSubmitting(false);
      setSubmitError('The upload was interrupted. Your recording remains on this screen, so you can try again.');
    });

    request.addEventListener('timeout', () => {
      requestRef.current = null;
      setIsSubmitting(false);
      setSubmitError('The upload took too long. Your recording remains on this screen, so you can try again.');
    });

    request.addEventListener('abort', () => {
      requestRef.current = null;
    });

    request.send(body);
  };

  return (
    <section className="application-section coach-submission-section" id="submit-voice-note">
      <div className="page-shell">
        <div className="coach-submission-heading">
          <span className="application-section-label">Your application</span>
          <h2>Submit Your Voice Note</h2>
          <p>
            Add your details and record a message of up to 60 seconds. Nothing is uploaded until you
            review everything and press Submit application.
          </p>
        </div>

        {step === 'compose' ? (
          <form className="coach-application-form" onSubmit={reviewApplication} noValidate>
            <div className="coach-form-card">
              <div className="coach-form-card-heading">
                <span>01</span>
                <div>
                  <h3>Your details</h3>
                  <p>All three fields are required.</p>
                </div>
              </div>

              {submitError && (
                <p className="coach-error-summary" ref={errorSummaryRef} tabIndex="-1" role="alert">
                  {submitError}
                </p>
              )}

              <div className="coach-fields-grid">
                <label className="coach-field" htmlFor="coach-full-name">
                  <span>Full name</span>
                  <input
                    className="coach-field-input"
                    id="coach-full-name"
                    name="fullName"
                    type="text"
                    value={formValues.fullName}
                    onChange={updateField('fullName')}
                    autoComplete="name"
                    maxLength="120"
                    required
                    aria-invalid={Boolean(fieldErrors.fullName)}
                    aria-describedby={fieldErrors.fullName ? 'coach-full-name-error' : undefined}
                  />
                  {fieldErrors.fullName && (
                    <small id="coach-full-name-error" className="coach-field-error">
                      {fieldErrors.fullName}
                    </small>
                  )}
                </label>

                <label className="coach-field" htmlFor="coach-email">
                  <span>Email address</span>
                  <input
                    className="coach-field-input"
                    id="coach-email"
                    name="email"
                    type="email"
                    value={formValues.email}
                    onChange={updateField('email')}
                    autoComplete="email"
                    inputMode="email"
                    maxLength="254"
                    required
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? 'coach-email-error' : undefined}
                  />
                  {fieldErrors.email && (
                    <small id="coach-email-error" className="coach-field-error">
                      {fieldErrors.email}
                    </small>
                  )}
                </label>

                <label className="coach-field coach-field-wide" htmlFor="coach-linkedin">
                  <span>LinkedIn profile URL</span>
                  <input
                    className="coach-field-input"
                    id="coach-linkedin"
                    name="linkedin"
                    type="url"
                    value={formValues.linkedin}
                    onChange={updateField('linkedin')}
                    inputMode="url"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck="false"
                    placeholder="linkedin.com/in/your-name"
                    required
                    aria-invalid={Boolean(fieldErrors.linkedin)}
                    aria-describedby={fieldErrors.linkedin ? 'coach-linkedin-error' : undefined}
                  />
                  {fieldErrors.linkedin && (
                    <small id="coach-linkedin-error" className="coach-field-error">
                      {fieldErrors.linkedin}
                    </small>
                  )}
                </label>
              </div>
            </div>

            <div className="coach-form-card">
              <div className="coach-form-card-heading">
                <span>02</span>
                <div>
                  <h3>Your voice note</h3>
                  <p>There is no minimum length. The recording stops automatically at 60 seconds.</p>
                </div>
              </div>

              <PatchVoiceRecorder
                onRecordingChange={(nextRecording) => {
                  setRecording(nextRecording);
                  setFieldErrors((current) => ({ ...current, recording: '' }));
                  setSubmitError('');
                }}
              />

              {fieldErrors.recording && (
                <p className="coach-field-error coach-recording-field-error" role="alert">
                  {fieldErrors.recording}
                </p>
              )}
            </div>

            <div className="coach-form-actions">
              <p>Your details and recording remain only on this screen until final submission.</p>
              <button className="coach-control coach-primary-button coach-review-button" type="submit">
                Review application
                <span aria-hidden="true">→</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="coach-review-card" aria-busy={isSubmitting}>
            <div className="coach-review-heading">
              <span>Final review</span>
              <h3 ref={reviewHeadingRef} tabIndex="-1">Check your application</h3>
              <p>Nothing has been submitted yet. Check each detail and listen to your voice note.</p>
            </div>

            <dl className="coach-review-details">
              <div>
                <dt>Full name</dt>
                <dd>{formValues.fullName}</dd>
              </div>
              <div>
                <dt>Email address</dt>
                <dd>{formValues.email}</dd>
              </div>
              <div>
                <dt>LinkedIn</dt>
                <dd>
                  <a href={formValues.linkedin} target="_blank" rel="noreferrer">
                    View profile
                  </a>
                </dd>
              </div>
            </dl>

            <div className="coach-review-audio">
              <span>Voice note</span>
              <PatchAudioPlayer
                src={recording?.url}
                durationMs={recording?.durationMs}
                label="Final voice note review"
              />
            </div>

            <label className="coach-confirmation">
              <input
                type="checkbox"
                checked={isConfirmed}
                onChange={(event) => setIsConfirmed(event.target.checked)}
                disabled={isSubmitting}
              />
              <span>
                I confirm these details and this voice note are final. I understand that I cannot edit
                this application after it is submitted.
              </span>
            </label>

            {submitError && (
              <p className="coach-error-summary" ref={errorSummaryRef} tabIndex="-1" role="alert">
                {submitError}
              </p>
            )}

            {isSubmitting && (
              <div className="coach-upload-status" role="status" aria-live="polite">
                <div>
                  <span>Submitting application</span>
                  <strong>{uploadProgress}%</strong>
                </div>
                <progress max="100" value={uploadProgress}>{uploadProgress}%</progress>
                <p>Keep this page open until submission is complete.</p>
              </div>
            )}

            <div className="coach-review-actions">
              <button
                className="coach-control coach-secondary-button"
                type="button"
                onClick={returnToApplication}
                disabled={isSubmitting}
              >
                Go back
              </button>
              <button
                className="coach-control coach-primary-button"
                type="button"
                onClick={submitApplication}
                disabled={!isConfirmed || isSubmitting}
              >
                {isSubmitting ? 'Submitting…' : 'Submit application'}
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
