import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createRecruitmentApp } from "../server/app.js";
import { createSignedCookieCodec } from "../server/recruitment-access.js";

test("a recording lost between stat and stream open fails that request without crashing the service", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "patch-monitor-stream-race-"));
  const token = "synthetic_read_token_for_stream_race_0123456789";
  const app = await createRecruitmentApp({
    service: {}, cookieCodec: createSignedCookieCodec("synthetic-stream-cookie-secret-at-least-32-bytes"),
    reviewerSecret: "SYNTHREVIEW1", recruitmentMonitorToken: token,
    recruitmentMonitor: {
      list: () => ({ ok: true, applications: [] }),
      audio: () => ({ filePath: path.join(directory, "synthetic-recording-removed-after-stat.webm"),
        mimeType: "audio/webm", fileSize: 100 }),
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => { server.once("listening", resolve); server.once("error", reject); });
  const base = `http://127.0.0.1:${server.address().port}/api/recruitment/monitor/applications`;
  const headers = { Authorization: `Bearer ${token}` };
  try {
    await assert.rejects(async () => {
      const response = await fetch(`${base}/00000000-0000-4000-8000-000000000001/audio`, { headers });
      await response.arrayBuffer();
    });
    const next = await fetch(base, { headers });
    assert.equal(next.status, 200);
    assert.deepEqual(await next.json(), { ok: true, applications: [] });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
