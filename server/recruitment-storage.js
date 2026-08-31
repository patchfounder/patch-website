import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  createReadStream,
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";

export const DEFAULT_MAX_AUDIO_BYTES = 12 * 1024 * 1024;

const MIME_EXTENSIONS = new Map([
  ["audio/webm", "webm"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/aac", "aac"],
  ["audio/mpeg", "mp3"],
  ["audio/ogg", "ogg"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
]);

const MONTH_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;
const STORAGE_KEY_PATTERN = /^\d{4}-(0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(webm|m4a|aac|mp3|ogg|wav)$/i;

export class RecruitmentStorageError extends Error {
  constructor(message, code = "storage_error", statusCode = 500) {
    super(message);
    this.name = "RecruitmentStorageError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isPathInside(candidate, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function canonicalCandidatePath(candidate) {
  let existing = path.resolve(candidate);
  const missingSegments = [];
  while (!existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missingSegments.unshift(path.basename(existing));
    existing = parent;
  }
  return path.join(realpathSync(existing), ...missingSegments);
}

export function resolveRecruitmentDataRoot(env = process.env) {
  const configured = String(env.RECRUITMENT_DATA_ROOT || "").trim();
  if (env.NODE_ENV === "production") {
    if (!configured || !path.isAbsolute(configured)) {
      throw new RecruitmentStorageError(
        "RECRUITMENT_DATA_ROOT must be an absolute private path in production.",
        "invalid_data_root",
      );
    }
    const productionRoot = path.resolve(configured);
    if (productionRoot !== "/data/recruitment") {
      throw new RecruitmentStorageError(
        "Production recruitment data must use the Website volume path /data/recruitment.",
        "invalid_data_root",
      );
    }
    return productionRoot;
  }
  const resolved = path.resolve(configured || path.join(tmpdir(), "patch-website-recruitment"));
  if (resolved === path.resolve(tmpdir()) || !isPathInside(resolved, tmpdir())) {
    throw new RecruitmentStorageError(
      "Non-production recruitment data must stay inside the operating-system temporary directory.",
      "unsafe_data_root",
    );
  }
  return resolved;
}

export function normalizeAudioMimeType(value) {
  return String(value || "").split(";", 1)[0].trim().toLowerCase();
}

function safeStorageKey(storageKey) {
  const normalized = String(storageKey || "");
  if (!STORAGE_KEY_PATTERN.test(normalized)) {
    throw new RecruitmentStorageError("Invalid recruitment audio key.", "invalid_storage_key", 400);
  }
  return normalized;
}

function safeMonthKey(monthKey) {
  const normalized = String(monthKey || "");
  if (!MONTH_KEY_PATTERN.test(normalized)) {
    throw new RecruitmentStorageError("Invalid recruitment cohort month.", "invalid_month_key", 400);
  }
  return normalized;
}

export function createRecruitmentStorage(options = {}) {
  const environment = options.env || process.env;
  const dataRoot = path.resolve(options.dataRoot || resolveRecruitmentDataRoot(options.env));
  const projectRoot = path.resolve(options.projectRoot || process.cwd());
  const configuredMaxAudioBytes = Number(options.maxAudioBytes || DEFAULT_MAX_AUDIO_BYTES);
  const maxAudioBytes = Number.isFinite(configuredMaxAudioBytes) && configuredMaxAudioBytes > 0
    ? Math.floor(configuredMaxAudioBytes)
    : DEFAULT_MAX_AUDIO_BYTES;
  const persistenceRequired = environment.NODE_ENV === "production";
  const persistenceAcknowledged = !persistenceRequired
    || String(environment.RECRUITMENT_PERSISTENCE_ACK || "").trim() === "website-volume-mounted";

  if (
    dataRoot === path.parse(dataRoot).root
    || isPathInside(dataRoot, projectRoot)
    || isPathInside(canonicalCandidatePath(dataRoot), realpathSync(projectRoot))
  ) {
    throw new RecruitmentStorageError(
      "Recruitment data must not be stored inside the Website repository.",
      "repository_data_root",
    );
  }

  const databasePath = path.join(dataRoot, "recruitment.sqlite");
  const audioDirectory = path.join(dataRoot, "audio");
  const stagingDirectory = path.join(dataRoot, ".staging");
  const trashDirectory = path.join(dataRoot, ".trash");

  function initialize() {
    [dataRoot, audioDirectory, stagingDirectory, trashDirectory].forEach((directory) => {
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      chmodSync(directory, 0o700);
    });
    const realDataRoot = realpathSync(dataRoot);
    if (isPathInside(realDataRoot, realpathSync(projectRoot))) {
      throw new RecruitmentStorageError(
        "Recruitment data resolves inside the Website repository.",
        "repository_data_root",
      );
    }
    return Object.freeze({ dataRoot: realDataRoot, databasePath, audioDirectory });
  }

  function recoverInterruptedOperations(retainedMonthKeys = [], retainedStorageKeys = []) {
    initialize();
    const retainedMonths = new Set(retainedMonthKeys.map(safeMonthKey));
    const retainedKeys = new Set(retainedStorageKeys.map(safeStorageKey));
    let restoredAudioCount = 0;
    let removedOrphanCount = 0;

    for (const entry of readdirSync(stagingDirectory, { withFileTypes: true })) {
      rmSync(path.join(stagingDirectory, entry.name), { recursive: entry.isDirectory(), force: true });
      removedOrphanCount += 1;
    }

    for (const operation of readdirSync(trashDirectory, { withFileTypes: true })) {
      const operationPath = path.join(trashDirectory, operation.name);
      if (!operation.isDirectory()) {
        rmSync(operationPath, { force: true });
        removedOrphanCount += 1;
        continue;
      }

      for (const monthEntry of readdirSync(operationPath, { withFileTypes: true })) {
        const quarantinedPath = path.join(operationPath, monthEntry.name);
        if (!monthEntry.isDirectory() || !MONTH_KEY_PATTERN.test(monthEntry.name)) {
          rmSync(quarantinedPath, { recursive: monthEntry.isDirectory(), force: true });
          removedOrphanCount += 1;
          continue;
        }
        if (!retainedMonths.has(monthEntry.name)) {
          rmSync(quarantinedPath, { recursive: true, force: true });
          removedOrphanCount += 1;
          continue;
        }

        const destinationDirectory = path.join(audioDirectory, monthEntry.name);
        mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
        chmodSync(destinationDirectory, 0o700);
        for (const audioEntry of readdirSync(quarantinedPath, { withFileTypes: true })) {
          const source = path.join(quarantinedPath, audioEntry.name);
          const destination = path.join(destinationDirectory, audioEntry.name);
          if (!audioEntry.isFile()) {
            rmSync(source, { recursive: true, force: true });
            removedOrphanCount += 1;
          } else if (existsSync(destination)) {
            rmSync(source, { force: true });
          } else {
            renameSync(source, destination);
            restoredAudioCount += 1;
          }
        }
        rmSync(quarantinedPath, { recursive: true, force: true });
      }
      rmSync(operationPath, { recursive: true, force: true });
    }

    for (const monthEntry of readdirSync(audioDirectory, { withFileTypes: true })) {
      const monthPath = path.join(audioDirectory, monthEntry.name);
      if (!monthEntry.isDirectory() || !retainedMonths.has(monthEntry.name)) {
        rmSync(monthPath, { recursive: monthEntry.isDirectory(), force: true });
        removedOrphanCount += 1;
        continue;
      }
      for (const audioEntry of readdirSync(monthPath, { withFileTypes: true })) {
        const audioPathname = path.join(monthPath, audioEntry.name);
        const storageKey = `${monthEntry.name}/${audioEntry.name}`;
        if (!audioEntry.isFile() || !retainedKeys.has(storageKey)) {
          rmSync(audioPathname, { recursive: audioEntry.isDirectory(), force: true });
          removedOrphanCount += 1;
        }
      }
      try {
        rmdirSync(monthPath);
      } catch (error) {
        if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) throw error;
      }
    }

    return Object.freeze({ restoredAudioCount, removedOrphanCount });
  }

  function audioPath(storageKey) {
    return path.join(audioDirectory, safeStorageKey(storageKey));
  }

  function removeEmptyCohortDirectory(storageKey) {
    const cohortDirectory = path.dirname(audioPath(storageKey));
    try {
      rmdirSync(cohortDirectory);
    } catch (error) {
      if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) throw error;
    }
  }

  function validateAudio(buffer, mimeType) {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
      throw new RecruitmentStorageError("The voice recording is empty.", "empty_audio", 400);
    }
    if (buffer.length > maxAudioBytes) {
      throw new RecruitmentStorageError("The voice recording is too large.", "audio_too_large", 413);
    }
    const normalizedMimeType = normalizeAudioMimeType(mimeType);
    const extension = MIME_EXTENSIONS.get(normalizedMimeType);
    if (!extension) {
      throw new RecruitmentStorageError(
        "This voice-recording format is not supported.",
        "unsupported_audio_type",
        415,
      );
    }
    return { normalizedMimeType, extension };
  }

  function storeAudio(monthKey, buffer, mimeType) {
    initialize();
    const cohortMonth = safeMonthKey(monthKey);
    const validated = validateAudio(buffer, mimeType);
    const id = randomUUID();
    const storageKey = `${cohortMonth}/${id}.${validated.extension}`;
    const stagingPath = path.join(stagingDirectory, `${id}.pending`);
    const finalPath = audioPath(storageKey);
    mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o700 });
    chmodSync(path.dirname(finalPath), 0o700);
    try {
      writeFileSync(stagingPath, buffer, { mode: 0o600, flag: "wx" });
      renameSync(stagingPath, finalPath);
      return Object.freeze({
        storageKey,
        mimeType: validated.normalizedMimeType,
        fileSize: buffer.length,
        filePath: finalPath,
      });
    } catch (error) {
      rmSync(stagingPath, { force: true });
      rmSync(finalPath, { force: true });
      removeEmptyCohortDirectory(storageKey);
      throw new RecruitmentStorageError(
        "The voice recording could not be stored.",
        "audio_write_failed",
      );
    }
  }

  function removeAudio(storageKey) {
    rmSync(audioPath(storageKey), { force: true });
    removeEmptyCohortDirectory(storageKey);
  }

  function statAudio(storageKey) {
    const filePath = audioPath(storageKey);
    let stats;
    try {
      stats = statSync(filePath);
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new RecruitmentStorageError("Voice recording is unavailable.", "audio_unavailable", 404);
      }
      throw error;
    }
    if (!stats.isFile()) {
      throw new RecruitmentStorageError("Voice recording is unavailable.", "audio_unavailable", 404);
    }
    return { filePath, stats };
  }

  function streamAudio(storageKey, streamOptions = {}) {
    const { filePath } = statAudio(storageKey);
    return createReadStream(filePath, streamOptions);
  }

  function quarantineAudio(storageKeys = []) {
    initialize();
    const operationId = randomUUID();
    const operationDirectory = path.join(trashDirectory, operationId);
    mkdirSync(operationDirectory, { mode: 0o700 });
    const moved = [];
    try {
      for (const candidate of [...new Set(storageKeys.filter(Boolean))]) {
        const storageKey = safeStorageKey(candidate);
        const source = audioPath(storageKey);
        if (!existsSync(source)) continue;
        const destination = path.join(operationDirectory, storageKey);
        mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
        renameSync(source, destination);
        moved.push({ storageKey, source, destination });
      }
      for (const cohortDirectory of new Set(moved.map((entry) => path.dirname(entry.source)))) {
        try {
          rmdirSync(cohortDirectory);
        } catch (error) {
          if (!["ENOENT", "ENOTEMPTY"].includes(error?.code)) throw error;
        }
      }
      return { operationDirectory, moved };
    } catch (error) {
      for (const entry of moved.reverse()) {
        if (existsSync(entry.destination)) {
          mkdirSync(path.dirname(entry.source), { recursive: true, mode: 0o700 });
          renameSync(entry.destination, entry.source);
        }
      }
      rmSync(operationDirectory, { recursive: true, force: true });
      throw new RecruitmentStorageError(
        "Older-cohort audio could not be prepared for deletion.",
        "audio_quarantine_failed",
      );
    }
  }

  function quarantineCohorts(monthKeys = []) {
    initialize();
    const operationId = randomUUID();
    const operationDirectory = path.join(trashDirectory, operationId);
    mkdirSync(operationDirectory, { mode: 0o700 });
    const moved = [];
    try {
      for (const candidate of [...new Set(monthKeys.filter(Boolean))]) {
        const monthKey = safeMonthKey(candidate);
        const source = path.join(audioDirectory, monthKey);
        if (!existsSync(source)) continue;
        const destination = path.join(operationDirectory, monthKey);
        renameSync(source, destination);
        moved.push({ monthKey, source, destination });
      }
      return { operationDirectory, moved };
    } catch (error) {
      for (const entry of moved.reverse()) {
        if (existsSync(entry.destination)) renameSync(entry.destination, entry.source);
      }
      rmSync(operationDirectory, { recursive: true, force: true });
      throw new RecruitmentStorageError(
        "Older-cohort audio could not be prepared for deletion.",
        "audio_quarantine_failed",
      );
    }
  }

  function rollbackQuarantine(quarantine) {
    for (const entry of [...(quarantine?.moved || [])].reverse()) {
      if (existsSync(entry.destination)) {
        mkdirSync(path.dirname(entry.source), { recursive: true, mode: 0o700 });
        renameSync(entry.destination, entry.source);
      }
    }
    if (quarantine?.operationDirectory) {
      rmSync(quarantine.operationDirectory, { recursive: true, force: true });
    }
  }

  function commitQuarantine(quarantine) {
    if (quarantine?.operationDirectory) {
      rmSync(quarantine.operationDirectory, { recursive: true, force: true });
    }
  }

  function healthCheck() {
    try {
      initialize();
      [dataRoot, audioDirectory, stagingDirectory, trashDirectory].forEach((directory) => {
        accessSync(directory, fsConstants.R_OK | fsConstants.W_OK);
      });
      return {
        ok: persistenceAcknowledged,
        audioWritable: true,
        persistenceAcknowledged,
      };
    } catch (_error) {
      return { ok: false, audioWritable: false, persistenceAcknowledged };
    }
  }

  return Object.freeze({
    dataRoot,
    databasePath,
    audioDirectory,
    maxAudioBytes,
    persistenceRequired,
    persistenceAcknowledged,
    initialize,
    recoverInterruptedOperations,
    storeAudio,
    removeAudio,
    statAudio,
    streamAudio,
    quarantineAudio,
    quarantineCohorts,
    rollbackQuarantine,
    commitQuarantine,
    healthCheck,
  });
}
