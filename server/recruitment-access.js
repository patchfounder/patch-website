import {
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const MADRID_TIME_ZONE = "Europe/Madrid";
export const APPLICANT_COOKIE_NAME = "patch_recruitment_applicant";
export const REVIEWER_COOKIE_NAME = "patch_recruitment_reviewer";

const DEFAULT_SCRYPT_PARAMETERS = Object.freeze({
  N: 16_384,
  r: 8,
  p: 1,
  keyLength: 64,
  maxmem: 64 * 1024 * 1024,
});

function boundedString(value, label, maximumLength) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new RecruitmentAccessError(`${label} is required.`, "required");
  }
  if (normalized.length > maximumLength) {
    throw new RecruitmentAccessError(`${label} is too long.`, "too_long");
  }
  return normalized;
}

export class RecruitmentAccessError extends Error {
  constructor(message, code = "invalid_access_input") {
    super(message);
    this.name = "RecruitmentAccessError";
    this.code = code;
    this.statusCode = 400;
  }
}

export async function hashCohortPassword(password, parameters = DEFAULT_SCRYPT_PARAMETERS) {
  const normalized = boundedString(password, "Cohort password", 256);
  const params = {
    N: Number(parameters.N || DEFAULT_SCRYPT_PARAMETERS.N),
    r: Number(parameters.r || DEFAULT_SCRYPT_PARAMETERS.r),
    p: Number(parameters.p || DEFAULT_SCRYPT_PARAMETERS.p),
    keyLength: Number(parameters.keyLength || DEFAULT_SCRYPT_PARAMETERS.keyLength),
    maxmem: Number(parameters.maxmem || DEFAULT_SCRYPT_PARAMETERS.maxmem),
  };
  const salt = randomBytes(16);
  const hash = await scrypt(normalized, salt, params.keyLength, {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: params.maxmem,
  });
  return {
    salt,
    hash: Buffer.from(hash),
    parameters: JSON.stringify(params),
  };
}

export async function verifyCohortPassword(password, record) {
  const normalized = String(password ?? "").trim();
  if (!normalized || !record?.passwordSalt || !record?.passwordHash) {
    return false;
  }
  let params;
  try {
    params = { ...DEFAULT_SCRYPT_PARAMETERS, ...JSON.parse(record.passwordParameters || "{}") };
  } catch (_error) {
    return false;
  }
  const expected = Buffer.from(record.passwordHash);
  const actual = Buffer.from(await scrypt(normalized, Buffer.from(record.passwordSalt), expected.length, {
    N: Number(params.N),
    r: Number(params.r),
    p: Number(params.p),
    maxmem: Number(params.maxmem),
  }));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function signatureFor(secret, encodedPayload) {
  return createHmac("sha256", secret).update(encodedPayload).digest("base64url");
}

export function createSignedCookieCodec(secret) {
  const normalizedSecret = boundedString(secret, "Recruitment cookie secret", 4096);
  if (Buffer.byteLength(normalizedSecret, "utf8") < 32) {
    throw new RecruitmentAccessError(
      "Recruitment cookie secret must contain at least 32 bytes.",
      "weak_cookie_secret",
    );
  }
  return Object.freeze({
    seal(payload) {
      const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
      return `${encodedPayload}.${signatureFor(normalizedSecret, encodedPayload)}`;
    },
    unseal(value) {
      const [encodedPayload, providedSignature, ...rest] = String(value || "").split(".");
      if (!encodedPayload || !providedSignature || rest.length) return null;
      const expectedSignature = signatureFor(normalizedSecret, encodedPayload);
      const provided = Buffer.from(providedSignature);
      const expected = Buffer.from(expectedSignature);
      if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return null;
      try {
        const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
        return payload && typeof payload === "object" && !Array.isArray(payload) ? payload : null;
      } catch (_error) {
        return null;
      }
    },
  });
}

export function parseCookieHeader(headerValue = "") {
  return Object.fromEntries(String(headerValue || "").split(";").flatMap((entry) => {
    const separator = entry.indexOf("=");
    if (separator < 1) return [];
    const name = entry.slice(0, separator).trim();
    const rawValue = entry.slice(separator + 1).trim();
    try {
      return [[name, decodeURIComponent(rawValue)]];
    } catch (_error) {
      return [];
    }
  }));
}

export function serializeCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(String(value ?? ""))}`];
  parts.push(`Path=${options.path || "/"}`);
  if (options.httpOnly !== false) parts.push("HttpOnly");
  if (options.secure === true) parts.push("Secure");
  parts.push(`SameSite=${options.sameSite || "Strict"}`);
  if (options.maxAgeSeconds != null) {
    parts.push(`Max-Age=${Math.max(0, Math.floor(Number(options.maxAgeSeconds) || 0))}`);
  }
  if (options.expires instanceof Date && Number.isFinite(options.expires.getTime())) {
    parts.push(`Expires=${options.expires.toUTCString()}`);
  }
  return parts.join("; ");
}

export function clearCookie(name, options = {}) {
  return serializeCookie(name, "", {
    ...options,
    maxAgeSeconds: 0,
    expires: new Date(0),
  });
}

export function bearerTokenMatches(authorizationHeader, expectedSecret) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorizationHeader || ""));
  const expected = Buffer.from(String(expectedSecret || ""), "utf8");
  const actual = Buffer.from(match?.[1] || "", "utf8");
  return expected.length === 12
    && actual.length === expected.length
    && timingSafeEqual(actual, expected);
}

export function validateReviewerSecret(secret) {
  const normalized = String(secret || "");
  if (!/^[A-Za-z0-9_-]{12}$/.test(normalized)) {
    throw new RecruitmentAccessError(
      "RECRUITMENT_REVIEWER_SECRET must be exactly 12 URL-safe ASCII characters.",
      "invalid_reviewer_secret",
    );
  }
  return normalized;
}

const madridFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MADRID_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function madridParts(instantMs) {
  return Object.fromEntries(madridFormatter.formatToParts(new Date(instantMs))
    .filter((part) => part.type !== "literal")
    .map((part) => [part.type, part.value]));
}

function localPartsMatch(parts, candidate) {
  return Number(parts.year) === candidate.year
    && Number(parts.month) === candidate.month
    && Number(parts.day) === candidate.day
    && Number(parts.hour) === candidate.hour
    && Number(parts.minute) === candidate.minute
    && Number(parts.second) === candidate.second;
}

export function madridLocalDateTimeToIso(value) {
  const normalized = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(normalized);
  if (!match) {
    throw new RecruitmentAccessError(
      "Use an ISO local date and time such as 2026-09-01T09:00.",
      "invalid_madrid_time",
    );
  }
  const candidate = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  const utcGuess = Date.UTC(
    candidate.year,
    candidate.month - 1,
    candidate.day,
    candidate.hour,
    candidate.minute,
    candidate.second,
  );
  const matches = [];
  for (let offsetMinutes = -240; offsetMinutes <= 240; offsetMinutes += 1) {
    const instant = utcGuess + offsetMinutes * 60_000;
    if (localPartsMatch(madridParts(instant), candidate)) matches.push(instant);
  }
  const uniqueMatches = [...new Set(matches)];
  if (uniqueMatches.length !== 1) {
    throw new RecruitmentAccessError(
      uniqueMatches.length
        ? "That Europe/Madrid time is ambiguous because the clocks change. Choose another time."
        : "That Europe/Madrid time does not exist because the clocks change.",
      uniqueMatches.length ? "ambiguous_madrid_time" : "missing_madrid_time",
    );
  }
  return new Date(uniqueMatches[0]).toISOString();
}

export function normalizeMadridTimestamp(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new RecruitmentAccessError("Opening and closing times are required.", "required_time");
  }
  if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    return madridLocalDateTimeToIso(normalized);
  }
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) {
    throw new RecruitmentAccessError("Opening or closing time is invalid.", "invalid_time");
  }
  return new Date(timestamp).toISOString();
}

export function assertMonthKey(value) {
  const monthKey = String(value || "").trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
    throw new RecruitmentAccessError("Cohort month must use YYYY-MM.", "invalid_month");
  }
  return monthKey;
}

export function cohortWindowState(cohort, now = new Date()) {
  if (!cohort) return "unavailable";
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const opensMs = Date.parse(cohort.opensAt);
  const closesMs = Date.parse(cohort.closesAt);
  if (nowMs < opensMs) return "not_open";
  if (nowMs >= closesMs) return "closed";
  return "open";
}
