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
      23,
      59,
    ),
  );

  return {
    password: '',
    opensAt: localInputFromParts(opening),
    closesAt: `${closingDate.getUTCFullYear()}-${pad(closingDate.getUTCMonth() + 1)}-${pad(
      closingDate.getUTCDate(),
    )}T23:59`,
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

export function applicationInputValue(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : localInputFromParts(partsFor(date));
}
