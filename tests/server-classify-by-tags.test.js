import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createServer } from "../src/server.js";

async function withServer(run, options = {}) {
  const temporarySettings = path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "mk-tags-settings-")),
    "settings.json",
  );
  fs.writeFileSync(temporarySettings, "{}");
  const server = createServer({ settingsFile: temporarySettings, ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(path.dirname(temporarySettings), {
      recursive: true,
      force: true,
    });
  }
}

test("/api/classify-by-tags valida rutas y bloquea solapamientos", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-tags-api-"));
  const input = path.join(root, "input");
  const destination = path.join(root, "classified");
  fs.mkdirSync(input, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(async (base) => {
    const request = (body) =>
      fetch(`${base}/api/classify-by-tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    let response = await request({
      inputRoot: "relative",
      destRoot: destination,
    });
    assert.equal(response.status, 400);
    response = await request({
      inputRoot: path.join(root, "missing"),
      destRoot: destination,
    });
    assert.equal(response.status, 400);
  });
});

test("/api/genre-catalog separa estilos de fábrica y aprendidos", async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "mk-learned-catalog-api-"));
  const previous = process.env.MUSIC_KIND_DATA_DIR;
  process.env.MUSIC_KIND_DATA_DIR = dataDir;
  fs.writeFileSync(path.join(dataDir, "genre-catalog-learned.json"), JSON.stringify({
    families: { Electronic: ["Future Style"], "Unlisted Family": ["Extra Style"] },
  }));
  t.after(() => {
    if (previous === undefined) delete process.env.MUSIC_KIND_DATA_DIR;
    else process.env.MUSIC_KIND_DATA_DIR = previous;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/genre-catalog`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.families.Electronic.factory.includes("House"));
    assert.deepEqual(payload.families.Electronic.learned, ["Future Style"]);
    assert.deepEqual(payload.families["Unlisted Family"], {
      factory: [], learned: ["Extra Style"],
    });
  });
});

test("/api/classify-by-tags propone tags reales con FFmpeg en tmp y no altera el árbol", async (t) => {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
  if (ffmpeg.status !== 0) return t.skip("ffmpeg no disponible");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-tags-ffmpeg-"));
  const input = path.join(root, "input");
  const destination = path.join(root, "classified");
  fs.mkdirSync(input);
  const settingsFile = path.join(root, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ retained: "keep" }));
  const tagged = path.join(input, "tagged.mp3");
  assert.equal(
    spawnSync("ffmpeg", [
      "-y",
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.2",
      "-metadata",
      "genre=Latin Tech",
      "-q:a",
      "9",
      tagged,
    ]).status,
    0,
  );
  const before = fs.statSync(tagged);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(
    async (base) => {
      const response = await fetch(`${base}/api/classify-by-tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          inputRoot: input,
          destRoot: destination,
          online: false,
        }),
      });
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/event-stream/);
      const events = (await response.text())
        .split("\n\n")
        .filter(Boolean)
        .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
      const result = events.find((event) => event.type === "result");
      assert.equal(result.results[0].tagGenre, "Latin Tech");
      assert.equal(result.results.length, 1);
      assert.equal(result.results[0].genre, "Tech House");
      assert.equal(
        result.results[0].destination,
        path.join(destination, "Tech House", "tagged.mp3"),
      );
      assert.equal(events.at(-1).success, true);
      assert.equal(fs.existsSync(destination), false);
      const after = fs.statSync(tagged);
      assert.equal(after.mtimeMs, before.mtimeMs);
      assert.equal(after.size, before.size);
    },
    { settingsFile },
  );
});

test("/api/classify-by-tags admite un archivo suelto y una carpeta sin destino", async (t) => {
  if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0)
    return t.skip("ffmpeg no disponible");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-tags-mixed-inputs-"));
  const folder = path.join(root, "folder");
  fs.mkdirSync(folder);
  const loose = path.join(root, "loose.mp3");
  const nested = path.join(folder, "nested.mp3");
  for (const output of [loose, nested])
    assert.equal(
      spawnSync("ffmpeg", [
        "-y",
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=0.1",
        "-metadata",
        "genre=Salsa",
        "-q:a",
        "9",
        output,
      ]).status,
      0,
    );
  const settingsFile = path.join(root, "settings.json");
  fs.writeFileSync(settingsFile, "{}");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(
    async (base) => {
      const response = await fetch(`${base}/api/classify-by-tags`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputPaths: [loose, folder], online: false }),
      });
      assert.equal(response.status, 200);
      const events = (await response.text())
        .split("\n\n")
        .filter(Boolean)
        .map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
      const result = events.find((event) => event.type === "result");
      assert.equal(result.results.length, 2);
      assert.ok(
        result.results.every(
          (row) =>
            row.genre === "Salsa" &&
            row.family === "Latin" &&
            row.destination === null,
        ),
      );
      assert.equal(events.at(-1).success, true);
    },
    { settingsFile },
  );
});

test("/api/genre-classify permite arrancar sin credenciales externas", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-no-provider-keys-"));
  const input = path.join(root, "input");
  fs.mkdirSync(input);
  const settingsFile = path.join(root, "settings.json");
  fs.writeFileSync(settingsFile, "{}");
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(
    async (base) => {
      const response = await fetch(`${base}/api/genre-classify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ inputPath: input, dryRun: true }),
      });
      assert.equal(response.status, 200);
      const stream = await response.text();
      assert.match(stream, /complete/);
      assert.doesNotMatch(stream, /Missing API keys/);
    },
    { settingsFile },
  );
});
