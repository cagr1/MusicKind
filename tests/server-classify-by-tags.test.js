import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createServer } from "../src/server.js";

async function withServer(run) {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("/api/classify-by-tags valida rutas y bloquea solapamientos", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-tags-api-"));
  const input = path.join(root, "input");
  const excluded = path.join(input, "2026");
  const destination = path.join(root, "classified");
  fs.mkdirSync(excluded, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(async (base) => {
    const request = (body) => fetch(`${base}/api/classify-by-tags`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    let response = await request({ inputRoot: "relative", excludeRoots: [], destRoot: destination });
    assert.equal(response.status, 400);
    response = await request({ inputRoot: input, excludeRoots: [excluded], destRoot: path.join(excluded, "out") });
    assert.equal(response.status, 400);
    response = await request({ inputRoot: path.join(root, "missing"), excludeRoots: [], destRoot: destination });
    assert.equal(response.status, 400);
  });
});

test("/api/classify-by-tags propone tags reales con FFmpeg en tmp y no altera el árbol", async (t) => {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) return t.skip("ffmpeg no disponible");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-tags-ffmpeg-"));
  const input = path.join(root, "input");
  const excluded = path.join(root, "examples");
  const destination = path.join(root, "classified");
  fs.mkdirSync(input);
  fs.mkdirSync(excluded);
  const tagged = path.join(input, "tagged.mp3");
  assert.equal(spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.2", "-metadata", "genre=Latin Tech", "-q:a", "9", tagged]).status, 0);
  const before = fs.statSync(tagged);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/classify-by-tags`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ inputRoot: input, excludeRoots: [excluded], destRoot: destination })
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /text\/event-stream/);
    const events = (await response.text()).split("\n\n").filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
    const result = events.find((event) => event.type === "result");
    assert.equal(result.results[0].tagGenre, "Latin Tech");
    assert.equal(result.results[0].genre, "Tech House");
    assert.equal(result.results[0].destination, path.join(destination, "Tech House", "tagged.mp3"));
    assert.equal(events.at(-1).success, true);
    assert.equal(fs.existsSync(destination), false);
    const after = fs.statSync(tagged);
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(after.size, before.size);
  });
});
