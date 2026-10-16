(() => {
  'use strict';

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const availability = days.map(() => []);
  const form = document.querySelector('#registration-form');
  const dayContainer = document.querySelector('#availability-days');
  const fieldNames = ['firstName', 'surname', 'email', 'phone', 'linkedin'];
  const values = () => Object.fromEntries(fieldNames.map((name) => [name, form.elements[name].value.trim()]));
  let portraitUrl = '';
  let photoName = '';
  let photoBlob = null;
  let photoVersion = 0;
  let photoLoading = false;
  let serviceReady = false;
  let submitting = false;
  let lockedForRetry = false;
  let recovery = false;
  let submissionPayload = null;
  const sessionKey = 'patch-coach-registration-request-v1';
  const receiptKey = 'patch-coach-registration-complete-v1';
  const reviewButton = document.querySelector('.review-button');
  const createButton = document.querySelector('#create-account');
  const editButton = document.querySelector('#edit-registration');
  const submissionMessage = document.querySelector('#submission-message');
  let request = readRequest();

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#${name}" /></svg>`;
  const clearError = () => { document.querySelector('#availability-error').hidden = true; };

  function readRequest() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey));
      return saved && /^[a-f0-9-]{36}$/i.test(saved.id) && /^[a-f0-9]{64}$/.test(saved.fingerprint)
        ? { id: saved.id, fingerprint: saved.fingerprint, accountCreated: saved.accountCreated === true }
        : null;
    } catch { return null; }
  }

  function saveRequest() {
    // Only an opaque retry ID and digest are kept: no contact details or photo.
    try { sessionStorage.setItem(sessionKey, JSON.stringify(request)); } catch { /* In-memory retries remain safe. */ }
  }

  function updateButtons() {
    reviewButton.disabled = !serviceReady || photoLoading || submitting;
    createButton.disabled = !serviceReady || photoLoading || submitting;
    editButton.disabled = submitting || lockedForRetry;
    createButton.innerHTML = submitting ? 'Creating account…' : `${lockedForRetry || recovery ? 'Retry registration' : 'Create account'} ${icon('arrow-right')}`;
    form.querySelectorAll('input, button').forEach((element) => { element.disabled = submitting || lockedForRetry; });
  }

  function showSubmissionMessage(message, isError = false) {
    submissionMessage.textContent = message;
    submissionMessage.classList.toggle('is-error', isError);
    submissionMessage.hidden = false;
  }

  async function checkService() {
    const notice = document.querySelector('#service-notice');
    const message = document.querySelector('#service-message');
    const retry = document.querySelector('#check-service');
    retry.hidden = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch('/api/coach-registration/status', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      const status = await response.json();
      serviceReady = response.ok && status.ready === true;
      notice.hidden = serviceReady && !recovery;
      message.textContent = serviceReady
        ? 'A registration may already be pending in this tab. Re-enter the same details, availability and photo to retry safely. Please do not start another registration.'
        : (status.message || 'Registration is temporarily unavailable. Your details have not been submitted. Please check again shortly.');
      retry.hidden = serviceReady;
    } catch {
      serviceReady = false;
      notice.hidden = false;
      message.textContent = 'We could not check registration availability. Your details have not been submitted. Please check your connection and try again.';
      retry.hidden = false;
    } finally {
      clearTimeout(timeout);
    }
    updateButtons();
  }

  document.querySelector('#check-service').addEventListener('click', checkService);

  function renderAvailability(focusTarget) {
    dayContainer.replaceChildren();
    days.forEach((day, index) => {
      const slots = availability[index];
      const row = document.createElement('div');
      row.className = `day-row${slots.length ? '' : ' is-off'}`;
      row.dataset.day = index;
      row.innerHTML = `<div class="day-heading"><button type="button" role="switch" aria-checked="${slots.length > 0}" aria-label="${day} availability" class="day-toggle" data-action="toggle" data-day="${index}"><span class="toggle-track"></span></button><span class="day-name">${day}</span></div>`;
      if (!slots.length) {
        const off = document.createElement('span');
        off.className = 'day-off';
        off.textContent = 'Unavailable';
        row.append(off);
      } else {
        const ranges = document.createElement('div');
        ranges.className = 'day-ranges';
        slots.forEach((slot, slotIndex) => {
          const range = document.createElement('div');
          range.className = 'time-range';
          range.innerHTML = `<label class="sr-only" for="day-${index}-${slotIndex}-start">${day} start time ${slotIndex + 1}</label><input id="day-${index}-${slotIndex}-start" type="time" min="06:00" max="22:00" step="900" value="${slot.start}" aria-label="${day} start time ${slotIndex + 1}" data-day="${index}" data-slot="${slotIndex}" data-part="start" /><span aria-hidden="true">–</span><label class="sr-only" for="day-${index}-${slotIndex}-end">${day} end time ${slotIndex + 1}</label><input id="day-${index}-${slotIndex}-end" type="time" min="06:00" max="22:00" step="900" value="${slot.end}" aria-label="${day} end time ${slotIndex + 1}" data-day="${index}" data-slot="${slotIndex}" data-part="end" /><button class="remove-range" type="button" data-action="remove" data-day="${index}" data-slot="${slotIndex}" aria-label="Remove ${day} time range ${slotIndex + 1}">${icon('close')}</button>`;
          ranges.append(range);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'add-range';
        add.dataset.action = 'add';
        add.dataset.day = index;
        add.setAttribute('aria-label', `Add another time on ${day}`);
        add.innerHTML = `${icon('plus')} Add another time`;
        if (slots.length < 3 && minutes(slots.at(-1).end || '09:00') < 21 * 60 + 45) ranges.append(add);
        row.append(ranges);
      }
      dayContainer.append(row);
    });
    updateHours();
    if (focusTarget) dayContainer.querySelector(focusTarget)?.focus({ preventScroll: true });
  }

  function minutes(time) {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute;
  }

  function updateHours() {
    const count = availability.filter((slots) => slots.length).length;
    const total = availability.flat().reduce((sum, slot) => sum + Math.max(0, minutes(slot.end) - minutes(slot.start) || 0), 0);
    const hours = Number((total / 60).toFixed(2));
    document.querySelector('#hours-summary').textContent = count ? `${count} ${count === 1 ? 'day' : 'days'} · ${hours} ${hours === 1 ? 'hour' : 'hours'} / week` : 'No times added';
  }

  dayContainer.addEventListener('click', (event) => {
    if (lockedForRetry || submitting) return;
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const day = Number(button.dataset.day);
    const action = button.dataset.action;
    let focusTarget;
    if (action === 'toggle') {
      availability[day] = availability[day].length ? [] : [{ start: '09:00', end: '17:00' }];
      focusTarget = `[data-action="toggle"][data-day="${day}"]`;
    } else if (action === 'add') {
      if (availability[day].length >= 3) return;
      const previousEnd = availability[day].at(-1)?.end || '09:00';
      const startMinutes = minutes(previousEnd) + 15;
      if (startMinutes > 21 * 60 + 45) return;
      const format = (value) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
      availability[day].push({ start: format(startMinutes), end: format(Math.min(startMinutes + 60, 22 * 60)) });
      focusTarget = `#day-${day}-${availability[day].length - 1}-start`;
    } else if (action === 'remove') {
      availability[day].splice(Number(button.dataset.slot), 1);
      focusTarget = availability[day].length ? `[data-action="add"][data-day="${day}"]` : `[data-action="toggle"][data-day="${day}"]`;
    }
    clearError();
    renderAvailability(focusTarget);
  });

  dayContainer.addEventListener('input', (event) => {
    if (lockedForRetry || submitting) return;
    const input = event.target;
    if (!input.matches('input[data-part]')) return;
    availability[Number(input.dataset.day)][Number(input.dataset.slot)][input.dataset.part] = input.value;
    clearError();
    updateHours();
  });

  function portraitContents(target, fallback) {
    target.replaceChildren();
    if (portraitUrl) {
      const image = document.createElement('img');
      image.src = portraitUrl;
      image.alt = 'Contact card photo preview';
      target.append(image);
    } else if (fallback) {
      target.textContent = fallback;
    } else {
      target.innerHTML = icon(target.id === 'upload-portrait' ? 'camera' : 'person');
    }
  }

  function updateContactPreview() {
    const data = values();
    const fullName = [data.firstName, data.surname].filter(Boolean).join(' ');
    document.querySelector('#contact-name').textContent = fullName || 'Your name';
    document.querySelector('#contact-email').textContent = data.email || 'Your email address';
    document.querySelector('#contact-phone').textContent = data.phone || 'Your WhatsApp number';
    document.querySelector('#contact-linkedin').textContent = data.linkedin || 'Your profile URL';
    const avatar = document.querySelector('#contact-avatar');
    const initials = [data.firstName, data.surname].filter(Boolean).map((part) => Array.from(part)[0]).join('').toUpperCase();
    avatar.classList.toggle('has-initials', Boolean(initials) && !portraitUrl);
    portraitContents(avatar, initials);
    portraitContents(document.querySelector('#upload-portrait'));
    document.querySelector('#remove-photo').hidden = !portraitUrl;
    document.querySelector('#photo-caption').textContent = photoName || 'JPG or PNG';
    document.querySelector('#choose-photo').textContent = portraitUrl ? 'Change photo' : 'Choose photo';
  }

  form.addEventListener('input', (event) => {
    if (fieldNames.includes(event.target.name)) {
      event.target.setCustomValidity('');
      updateContactPreview();
    }
  });

  document.querySelector('#choose-photo').addEventListener('click', () => document.querySelector('#photo').click());
  document.querySelector('#photo').addEventListener('change', (event) => loadPhoto(event.target.files[0]));
  document.querySelector('#remove-photo').addEventListener('click', () => {
    if (lockedForRetry || submitting) return;
    photoVersion += 1;
    photoLoading = false;
    if (portraitUrl) URL.revokeObjectURL(portraitUrl);
    portraitUrl = '';
    photoName = '';
    photoBlob = null;
    document.querySelector('#photo').value = '';
    document.querySelector('#photo-error').hidden = true;
    updateContactPreview();
    updateButtons();
  });

  async function loadPhoto(file) {
    if (!file || lockedForRetry || submitting) return;
    const version = ++photoVersion;
    const error = document.querySelector('#photo-error');
    error.hidden = true;
    if (!['image/jpeg', 'image/png'].includes(file.type) || !file.size || file.size > 10 * 1024 * 1024) {
      photoLoading = false;
      error.textContent = 'Choose a JPG or PNG photo under 10 MB.';
      error.hidden = false;
      document.querySelector('#photo').value = '';
      updateButtons();
      return;
    }
    photoLoading = true;
    document.querySelector('#photo-caption').textContent = 'Preparing photo…';
    updateButtons();
    const nextUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise((resolve, reject) => {
        const candidate = new Image();
        candidate.onload = () => resolve(candidate);
        candidate.onerror = () => reject(new Error('This photo could not be opened. Please choose another.'));
        candidate.src = nextUrl;
      });
      if (version !== photoVersion) return;
      if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 80000000) {
        throw new Error('This photo is too large to process. Please choose a smaller JPG or PNG.');
      }
      const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This photo could not be prepared. Please choose another.');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      let processed = null;
      for (const quality of [0.86, 0.72, 0.55]) {
        processed = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (processed && processed.size <= 1024 * 1024) break;
      }
      if (version !== photoVersion) return;
      if (!processed || !processed.size || processed.size > 1024 * 1024) throw new Error('This photo could not be prepared. Please choose a smaller photo.');
      if (portraitUrl) URL.revokeObjectURL(portraitUrl);
      photoBlob = processed;
      portraitUrl = URL.createObjectURL(processed);
      photoName = file.name;
      updateContactPreview();
    } catch (cause) {
      if (version === photoVersion) {
        error.textContent = cause.message || 'This photo could not be opened. Please choose another.';
        error.hidden = false;
        updateContactPreview();
      }
    } finally {
      URL.revokeObjectURL(nextUrl);
      if (version === photoVersion) { photoLoading = false; updateButtons(); }
    }
  }

  const upload = document.querySelector('#photo-upload');
  ['dragenter', 'dragover'].forEach((name) => upload.addEventListener(name, (event) => { event.preventDefault(); upload.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach((name) => upload.addEventListener(name, (event) => { event.preventDefault(); upload.classList.remove('is-dragging'); }));
  upload.addEventListener('drop', (event) => loadPhoto(event.dataTransfer.files[0]));

  function showStage(stage) {
    ['registration', 'review', 'confirmation'].forEach((name) => { document.querySelector(`#${name}-stage`).hidden = name !== stage; });
    document.querySelector('.intro').hidden = stage !== 'registration';
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.querySelector(stage === 'registration' ? '#page-title' : stage === 'review' ? '#review-title' : '#confirmation-title').focus({ preventScroll: true });
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!serviceReady || photoLoading || submitting || lockedForRetry) return;
    const data = values();
    for (const name of fieldNames) {
      const field = form.elements[name];
      field.setCustomValidity(data[name] ? '' : 'Please complete this field.');
    }
    try {
      const address = new URL(/^www\./i.test(data.linkedin) ? `https://${data.linkedin}` : data.linkedin);
      if (!['http:', 'https:'].includes(address.protocol) || !address.hostname || address.username || address.password) throw new Error('invalid');
    } catch { form.elements.linkedin.setCustomValidity('Enter a valid website URL, beginning with https://, http:// or www.'); }
    if (!form.reportValidity()) return;
    const error = document.querySelector('#availability-error');
    if (!availability.some((slots) => slots.length)) {
      error.textContent = 'Add your availability for at least one day.';
      error.hidden = false;
      dayContainer.querySelector('button').focus();
      return;
    }
    for (let day = 0; day < availability.length; day += 1) {
      let previousEnd = null;
      for (let slot = 0; slot < availability[day].length; slot += 1) {
        const range = availability[day][slot];
        if (!range.start || !range.end || minutes(range.end) <= minutes(range.start)) {
          error.textContent = `Choose an end time after the start time for ${days[day]}.`;
          error.hidden = false;
          document.querySelector(`#day-${day}-${slot}-end`).focus();
          return;
        }
        const start = minutes(range.start);
        const end = minutes(range.end);
        if (!Number.isFinite(start) || !Number.isFinite(end) || start < 6 * 60 || end > 22 * 60 || start % 15 !== 0 || end % 15 !== 0
          || (previousEnd !== null && start < previousEnd + 15)) {
          error.textContent = `Choose ${days[day]} times between 06:00 and 22:00 in 15-minute increments, with at least 15 minutes between ranges.`;
          error.hidden = false;
          document.querySelector(`#day-${day}-${slot}-start`).focus();
          return;
        }
        previousEnd = end;
      }
    }
    renderReview();
    submissionMessage.hidden = true;
    updateButtons();
    showStage('review');
  });

  function renderReview() {
    const data = values();
    const list = document.querySelector('#review-details');
    list.replaceChildren();
    [
      ['Full name', `${data.firstName} ${data.surname}`],
      ['Email address', data.email],
      ['WhatsApp number', data.phone],
      ['LinkedIn profile URL', data.linkedin],
      ['Contact card photo', portraitUrl ? photoName : 'No photo selected'],
    ].forEach(([label, value]) => {
      const row = document.createElement('div');
      const term = document.createElement('dt');
      const definition = document.createElement('dd');
      term.textContent = label;
      definition.textContent = value;
      row.append(term, definition);
      list.append(row);
    });
    portraitContents(document.querySelector('#review-portrait'), `${Array.from(data.firstName)[0] || ''}${Array.from(data.surname)[0] || ''}`.toUpperCase());
    const times = document.querySelector('#review-times');
    times.replaceChildren();
    availability.forEach((slots, day) => {
      if (!slots.length) return;
      const row = document.createElement('div');
      row.className = 'review-day';
      const label = document.createElement('span');
      label.textContent = days[day];
      const ranges = document.createElement('div');
      slots.forEach((slot) => { const range = document.createElement('p'); range.textContent = `${slot.start} – ${slot.end}`; ranges.append(range); });
      row.append(label, ranges);
      times.append(row);
    });
  }

  editButton.addEventListener('click', () => {
    if (!submitting && !lockedForRetry) showStage('registration');
  });

  async function payloadFingerprint(payload) {
    const details = JSON.stringify({ ...payload.data, availability: payload.availability });
    const text = new TextEncoder().encode(details);
    const photo = payload.photo ? new Uint8Array(await payload.photo.arrayBuffer()) : new Uint8Array();
    const bytes = new Uint8Array(text.length + 1 + photo.length);
    bytes.set(text);
    bytes[text.length] = 0;
    bytes.set(photo, text.length + 1);
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  createButton.addEventListener('click', async () => {
    if (submitting || !serviceReady || photoLoading) return;
    submitting = true;
    updateButtons();
    showSubmissionMessage('Creating your account and sending your contact card. Please keep this page open.');
    try {
      const payload = submissionPayload || {
        data: values(),
        availability: availability.flatMap((slots, day) => slots.length ? [{ day: days[day], slots: slots.map((slot) => ({ ...slot })) }] : []),
        photo: photoBlob,
      };
      const fingerprint = await payloadFingerprint(payload);
      if (request && recovery && fingerprint !== request.fingerprint) {
        showSubmissionMessage('These details do not match the pending registration. Go back and enter the same details, availability and photo you submitted before. This prevents creating another account.', true);
        return;
      }
      if (!request) request = { id: crypto.randomUUID(), fingerprint, accountCreated: false };
      else if (!lockedForRetry && !recovery) request.fingerprint = fingerprint;
      submissionPayload = payload;
      saveRequest();
      lockedForRetry = true;
      const body = new FormData();
      body.set('requestId', request.id);
      Object.entries(payload.data).forEach(([key, value]) => body.set(key, value));
      body.set('availability', JSON.stringify(payload.availability));
      if (payload.photo) body.set('photo', payload.photo, 'contact-photo.jpg');
      const abort = new AbortController();
      const timeout = setTimeout(() => abort.abort(), 90000);
      let response;
      try {
        response = await fetch('/api/coach-registration', { method: 'POST', headers: { Accept: 'application/json' }, body, signal: abort.signal });
      } finally { clearTimeout(timeout); }
      const result = await response.json();
      if (response.ok && result.ok === true && result.status === 'registered') {
        try { sessionStorage.removeItem(sessionKey); sessionStorage.setItem(receiptKey, 'complete'); } catch { /* Confirmation still works without storage. */ }
        request = null;
        submissionPayload = null;
        recovery = false;
        document.querySelector('#service-notice').hidden = true;
        showStage('confirmation');
        return;
      }
      if (result.accountCreated === true) request.accountCreated = true;
      saveRequest();
      if (request.accountCreated) {
        showSubmissionMessage('Your account and availability have been saved, but the contact card email is still pending. Click Retry registration to finish safely. This will not create another account.', true);
      } else if (response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 409 && response.status !== 429 && result.accountCreated === false) {
        lockedForRetry = false;
        recovery = false;
        submissionPayload = null;
        showSubmissionMessage(result.message || 'Your account has not been created. Go back and check your details, then try again.', true);
      } else {
        showSubmissionMessage(result.message ? `${result.message} Retry registration to continue with the same request.` : 'We could not confirm whether registration finished. Click Retry registration to continue safely with the same request. Please do not start another registration.', true);
      }
    } catch {
      showSubmissionMessage(request?.accountCreated
        ? 'Your account has been saved, but we could not confirm contact card delivery. Check your connection, then click Retry registration. This will not create another account.'
        : 'We could not confirm whether registration finished. Check your connection, then click Retry registration to continue safely. Please do not start another registration.', true);
    } finally {
      submitting = false;
      updateButtons();
    }
  });

  renderAvailability();
  updateContactPreview();
  try {
    if (sessionStorage.getItem(receiptKey) === 'complete') {
      document.querySelector('#service-notice').hidden = true;
      showStage('confirmation');
      return;
    }
  } catch { /* Storage is optional; all data remains browser-memory only. */ }
  recovery = Boolean(request);
  checkService();
})();
