(() => {
  'use strict';

  // This prototype uses browser memory only. It has no account, email or storage API.
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const availability = days.map(() => []);
  const form = document.querySelector('#registration-form');
  const dayContainer = document.querySelector('#availability-days');
  const fieldNames = ['firstName', 'surname', 'email', 'phone', 'linkedin'];
  const values = () => Object.fromEntries(fieldNames.map((name) => [name, form.elements[name].value.trim()]));
  let portraitUrl = '';
  let photoName = '';

  const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#${name}" /></svg>`;
  const clearError = () => { document.querySelector('#availability-error').hidden = true; };

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
    document.querySelector('#contact-phone').textContent = data.phone || 'Your mobile number';
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
    if (fieldNames.includes(event.target.name)) updateContactPreview();
  });

  document.querySelector('#choose-photo').addEventListener('click', () => document.querySelector('#photo').click());
  document.querySelector('#photo').addEventListener('change', (event) => loadPhoto(event.target.files[0]));
  document.querySelector('#remove-photo').addEventListener('click', () => {
    if (portraitUrl) URL.revokeObjectURL(portraitUrl);
    portraitUrl = '';
    photoName = '';
    document.querySelector('#photo').value = '';
    document.querySelector('#photo-error').hidden = true;
    updateContactPreview();
  });

  function loadPhoto(file) {
    if (!file) return;
    const error = document.querySelector('#photo-error');
    error.hidden = true;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      error.textContent = 'Choose a JPG or PNG photo under 10 MB.';
      error.hidden = false;
      return;
    }
    const nextUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      if (portraitUrl) URL.revokeObjectURL(portraitUrl);
      portraitUrl = nextUrl;
      photoName = file.name;
      updateContactPreview();
    };
    image.onerror = () => {
      URL.revokeObjectURL(nextUrl);
      error.textContent = 'This photo could not be opened. Please choose another.';
      error.hidden = false;
    };
    image.src = nextUrl;
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
        if (start < 6 * 60 || end > 22 * 60 || start % 15 !== 0 || end % 15 !== 0
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
    showStage('review');
  });

  function renderReview() {
    const data = values();
    const list = document.querySelector('#review-details');
    list.replaceChildren();
    [
      ['Full name', `${data.firstName} ${data.surname}`],
      ['Email address', data.email],
      ['Mobile number', data.phone],
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

  document.querySelector('#edit-registration').addEventListener('click', () => showStage('registration'));
  document.querySelector('#restart-preview').addEventListener('click', () => showStage('registration'));
  document.querySelector('#create-account').addEventListener('click', () => {
    const data = values();
    const fullName = `${data.firstName} ${data.surname}`;
    document.querySelector('#confirmation-subject').textContent = `New coach registration: ${fullName}`;
    document.querySelector('#confirmation-body').textContent = `${fullName} has registered as a Patch Coach and added their weekly availability. Their contact card is attached below.`;
    document.querySelector('#confirmation-file').textContent = `${fullName.replace(/[^\p{L}\p{N} -]/gu, '').replace(/\s+/g, '-') || 'coach'}.vcf`;
    showStage('confirmation');
  });

  document.querySelector('#fill-example').addEventListener('click', () => {
    const sample = { firstName: 'Alex', surname: 'Morgan', email: 'alex.morgan@example.com', phone: '+44 7700 900123', linkedin: 'www.linkedin.com/in/alex-morgan-example' };
    Object.entries(sample).forEach(([key, value]) => { form.elements[key].value = value; });
    availability.forEach((_, day) => { availability[day] = []; });
    availability[0] = [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '17:00' }];
    availability[1] = [{ start: '10:00', end: '16:00' }];
    availability[2] = [{ start: '09:00', end: '13:00' }];
    availability[4] = [{ start: '09:00', end: '12:00' }];
    clearError();
    renderAvailability();
    updateContactPreview();
    document.querySelector('#fill-example').innerHTML = `Example details filled ${icon('check')}`;
  });

  renderAvailability();
  updateContactPreview();
})();
