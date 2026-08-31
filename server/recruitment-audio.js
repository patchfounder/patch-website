import { parseBuffer } from "music-metadata";

import { normalizeAudioMimeType } from "./recruitment-storage.js";

export const MAX_RECRUITMENT_AUDIO_SECONDS = 60;

export class RecruitmentAudioError extends Error {
  constructor(message, code = "invalid_audio_file", statusCode = 400) {
    super(message);
    this.name = "RecruitmentAudioError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function inspectRecruitmentAudio(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new RecruitmentAudioError("The voice recording is empty.", "empty_audio");
  }

  let metadata;
  try {
    metadata = await parseBuffer(
      buffer,
      { mimeType: normalizeAudioMimeType(mimeType), size: buffer.length },
      { duration: true, skipCovers: true },
    );
  } catch (_error) {
    throw new RecruitmentAudioError(
      "The voice recording could not be read. Record it again in Safari or Chrome.",
      "invalid_audio_file",
    );
  }

  const durationSeconds = Number(metadata?.format?.duration);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RecruitmentAudioError(
      "The voice recording duration could not be verified. Record it again in Safari or Chrome.",
      "unverified_audio_duration",
    );
  }
  if (durationSeconds > MAX_RECRUITMENT_AUDIO_SECONDS) {
    throw new RecruitmentAudioError(
      "The voice note must be no longer than 60 seconds.",
      "audio_too_long",
    );
  }

  return Object.freeze({ durationSeconds: Math.round(durationSeconds * 1000) / 1000 });
}
