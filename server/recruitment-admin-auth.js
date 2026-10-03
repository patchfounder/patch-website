import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const SCRYPT_OPTIONS = Object.freeze({ N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
const HASH_PATTERN = /^scrypt\$16384\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/;
const MAX_ATTEMPTS = 10;
const ATTEMPT_WINDOW_MS = 15 * 60_000;

function validPasswordInput(password) {
  return typeof password === "string" && password.length > 0 && Buffer.byteLength(password, "utf8") <= 256;
}

export function validateAdminPasswordHash(passwordHash) {
  if (passwordHash === undefined || passwordHash === null || passwordHash === "") return null;
  if (typeof passwordHash !== "string" || !HASH_PATTERN.test(passwordHash)) {
    throw new Error("RECRUITMENT_ADMIN_PASSWORD_HASH must use the supported salted scrypt format.");
  }
  return passwordHash;
}

// For configuration only: persist the returned hash in the Website service's
// environment, never the original password in source, browser code, or logs.
export async function hashAdminPassword(password) {
  if (!validPasswordInput(password)) throw new Error("An administration password of 1–256 bytes is required.");
  const salt = randomBytes(16);
  const digest = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${Buffer.from(digest).toString("hex")}`;
}

export function createAdminPasswordAuth({ passwordHash, now = Date.now } = {}) {
  const configuredHash = validateAdminPasswordHash(passwordHash);
  const [, saltHex, digestHex] = configuredHash?.match(HASH_PATTERN) || [];
  const salt = saltHex ? Buffer.from(saltHex, "hex") : null;
  const expected = digestHex ? Buffer.from(digestHex, "hex") : null;
  let attempts = [];

  return Object.freeze({
    async authenticate(password) {
      if (!configuredHash) {
        return { ok: false, statusCode: 503, code: "admin_login_unavailable", message: "Administration login is unavailable." };
      }
      const nowMs = Number(now());
      attempts = attempts.filter((timestamp) => timestamp > nowMs - ATTEMPT_WINDOW_MS);
      if (attempts.length >= MAX_ATTEMPTS) {
        return {
          ok: false,
          statusCode: 429,
          code: "admin_login_rate_limited",
          message: "Too many attempts. Please try again later.",
          retryAfterSeconds: Math.max(1, Math.ceil((attempts[0] + ATTEMPT_WINDOW_MS - nowMs) / 1000)),
        };
      }
      // Reserve synchronously before scrypt. The global cap cannot be evaded by
      // concurrent requests, spoofed forwarding headers, or a successful login.
      attempts.push(nowMs);
      if (validPasswordInput(password)) {
        const actual = Buffer.from(await scrypt(password, salt, expected.length, SCRYPT_OPTIONS));
        if (timingSafeEqual(actual, expected)) return { ok: true };
      }
      return { ok: false, statusCode: 401, code: "invalid_admin_password", message: "Incorrect password." };
    },
  });
}
