export const APPLICATION_TIME_ZONE = 'Europe/London';

const inputFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: APPLICATION_TIME_ZONE,
});

const titleFormatter = new Intl.DateTimeFormat('en-GB', {
  month: 'long',
  year: 'numeric',
  timeZone: APPLICATION_TIME_ZONE,
});

const dateFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: APPLICATION_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZoneName: 'short',
  timeZone: APPLICATION_TIME_ZONE,
});

function partsFor(date) {
  return Object.fromEntries(
    inputFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
}

function localInputFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

function localDateFromParts(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

export function defaultApplicationWindow(now = new Date()) {
  const opening = partsFor(now);
  const closingDate = new Date(
    Date.UTC(
      Number(opening.year),
      Number(opening.month) - 1,
      Number(opening.day) + 5,
    ),
  );

  return {
    password: '',
    opensAt: localDateFromParts(opening),
    closesAt: `${closingDate.getUTCFullYear()}-${pad(closingDate.getUTCMonth() + 1)}-${pad(
      closingDate.getUTCDate(),
    )}`,
  };
}

export function applicationWindowSubmission(form) {
  const dates = [form.opensAt, form.closesAt];
  const parsed = dates.map((value) => new Date(`${value}T00:00:00.000Z`));
  if (dates.some((value, index) => (
    !/^\d{4}-\d{2}-\d{2}$/.test(value)
    || Number.isNaN(parsed[index].getTime())
    || parsed[index].toISOString().slice(0, 10) !== value
  ))) {
    throw new Error('Choose valid Open and Close dates.');
  }
  if (form.closesAt < form.opensAt) {
    throw new Error('The Close date must be on or after the Open date.');
  }
  // The server interprets local midnight in Europe/London. Advance a calendar
  // date, not a timestamp, so the entire Close date is included even across DST.
  const closeBoundary = parsed[1];
  closeBoundary.setUTCDate(closeBoundary.getUTCDate() + 1);
  return {
    password: form.password,
    opensAt: `${form.opensAt}T00:00`,
    closesAt: `${closeBoundary.toISOString().slice(0, 10)}T00:00`,
  };
}

export function applicationWindowTitle(value, fallback = 'Application Window') {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : titleFormatter.format(date);
}

export function formatApplicationDateTime(value, fallback = 'Not set') {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateTimeFormatter.format(date);
}

export function formatApplicationDate(value, fallback = 'Not set') {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : dateFormatter.format(date);
}

export function formatApplicationClosingDate(value, fallback = 'Not set') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  const local = partsFor(date);
  // New windows close at the following midnight. Legacy timed windows still
  // display their original calendar date and retain their original boundaries.
  if (local.hour === '00' && local.minute === '00'
    && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0) {
    date.setTime(date.getTime() - 1);
  }
  return dateFormatter.format(date);
}

export function applicationInputValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localInputFromParts(partsFor(date));
}
