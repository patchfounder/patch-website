export class RecruitmentInvitationError extends Error {
  constructor(message, code = "invalid_invitation_configuration", statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function normalizeInvitationCode(value) {
  if (typeof value !== "string") return "";
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9_-]{1,63}$/.test(code) ? code : "";
}

export function parseInvitationSeeds(value = "") {
  if (!value) return [];
  let entries;
  try { entries = JSON.parse(value); } catch {
    throw new RecruitmentInvitationError("Invitation registry configuration is invalid.");
  }
  if (!Array.isArray(entries) || entries.length > 5000) {
    throw new RecruitmentInvitationError("Invitation registry configuration is invalid.");
  }
  return entries.map(entry => {
    const code = normalizeInvitationCode(typeof entry === "string" ? entry : entry?.code);
    const coachId = typeof entry === "string" ? entry : entry?.coachId;
    if (!code || typeof coachId !== "string" || !/^C\d{1,12}$/.test(coachId)) {
      throw new RecruitmentInvitationError("Each invitation must identify an existing referring Coach.");
    }
    return { code, coachId };
  });
}

export function initializeRecruitmentInvitationSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS recruitment_invitations (
      invitation_code TEXT PRIMARY KEY NOT NULL,
      referrer_coach_id TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
      revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
      created_at TEXT NOT NULL
    ) STRICT;
  `);
  const columns = new Set(database.prepare("PRAGMA table_info(recruitment_applications)").all().map(column => column.name));
  if (!columns.has("invitation_code")) database.exec("ALTER TABLE recruitment_applications ADD COLUMN invitation_code TEXT");
  if (!columns.has("referrer_coach_id")) database.exec("ALTER TABLE recruitment_applications ADD COLUMN referrer_coach_id TEXT");
  database.exec("CREATE INDEX IF NOT EXISTS recruitment_applications_invitation ON recruitment_applications(invitation_code, submitted_at)");
}

export function createRecruitmentInvitationStore({ database, transaction }) {
  const read = database.prepare("SELECT * FROM recruitment_invitations WHERE invitation_code = ?");
  function get(code) {
    const row = read.get(normalizeInvitationCode(code));
    return row ? { code: row.invitation_code, coachId: row.referrer_coach_id,
      active: row.active === 1, revision: row.revision, createdAt: row.created_at } : null;
  }
  return Object.freeze({
    get,
    register(entries, createdAt = new Date().toISOString()) {
      const checked = parseInvitationSeeds(JSON.stringify(entries));
      return transaction(() => {
        let added = 0;
        for (const entry of checked) {
          const current = get(entry.code);
          if (current && current.coachId !== entry.coachId) {
            throw new RecruitmentInvitationError("An invitation code is already registered to a different Coach.", "invitation_referrer_conflict", 409);
          }
          added += Number(database.prepare(`INSERT OR IGNORE INTO recruitment_invitations
            (invitation_code, referrer_coach_id, created_at) VALUES (?, ?, ?)`)
            .run(entry.code, entry.coachId, createdAt).changes);
        }
        return { added, alreadyRegistered: checked.length - added };
      });
    },
    revoke(code) {
      return database.prepare("UPDATE recruitment_invitations SET active = 0, revision = revision + 1 WHERE invitation_code = ? AND active = 1")
        .run(normalizeInvitationCode(code));
    },
  });
}
