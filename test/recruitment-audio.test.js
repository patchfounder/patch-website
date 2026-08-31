import assert from "node:assert/strict";
import test from "node:test";

import { inspectRecruitmentAudio } from "../server/recruitment-audio.js";

function wavBuffer(durationSeconds, sampleRate = 8_000) {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataSize = sampleCount;
  const buffer = Buffer.alloc(44 + dataSize, 128);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate, 28);
  buffer.writeUInt16LE(1, 32);
  buffer.writeUInt16LE(8, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
}

test("server verifies the uploaded container duration and enforces 60 seconds", async () => {
  const verified = await inspectRecruitmentAudio(wavBuffer(1.25), "audio/wav");
  assert.equal(verified.durationSeconds, 1.25);

  await assert.rejects(
    inspectRecruitmentAudio(wavBuffer(61), "audio/wav"),
    (error) => error.code === "audio_too_long",
  );

  await assert.rejects(
    inspectRecruitmentAudio(Buffer.from("not audio"), "audio/webm"),
    (error) => error.code === "invalid_audio_file" || error.code === "unverified_audio_duration",
  );
});
