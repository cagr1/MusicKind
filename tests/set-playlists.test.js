import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSetPlaylists } from "../src/set-playlists.js";
import { createServer } from "../src/server.js";

const selections = { warmup: ["House"], peak: ["Tech House"], closing: [] };

async function fixture(run) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "mk-playlists-")));
  for (const genre of ["House", "Tech House"]) fs.mkdirSync(path.join(root, genre));
  const files = ["slow.mp3", "fast.mp3", "unknown.mp3"].map((name, i) => {
    const file = path.join(root, "House", name);
    fs.writeFileSync(file, "audio");
    return file;
  });
  const discover = async ({ target }) => ({ ok: true, files: fs.readdirSync(target).map((name) => path.join(target, name)) });
  const metadata = async (file) => ({ common: { title: path.basename(file, ".mp3"), artist: "DJ Test", ...(file.includes("fast") ? { bpm: 120 } : file.includes("slow") ? { bpm: 90 } : {}) }, format: { duration: 61.4 } });
  try { await run(root, files, discover, metadata); } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

test("playlist preview sorts BPM, puts unknown BPM last and never writes", async () => fixture(async (root, files, discover, readMetadata) => {
  const result = await createSetPlaylists({ root, sections: selections, dryRun: true, discover, readMetadata });
  assert.deepEqual(result.sections.warmup.tracks.map((track) => track.path), [files[0], files[1], files[2]]);
  assert.equal(result.sections.warmup.bpmMin, 90);
  assert.equal(result.sections.warmup.bpmMax, 120);
  assert.equal(result.sections.warmup.count, 3);
  assert.equal(fs.existsSync(path.join(root, "Warmup.m3u8")), false);
}));

test("skips unreadable tracks and sorts by BPM normalized to the DJ range", async () => fixture(async (root, files, _discover, readMetadata) => {
  const broken = path.join(root, "House", "broken.mp3");
  const invalid = path.join(root, "House", "invalid.mp3");
  const discover = async () => ({ ok: true, files: [...files, broken, invalid] });
  const read = async (file) => {
    if (file === broken) throw new Error("corrupt audio");
    if (file === invalid) return { common: {}, format: { duration: 0 } };
    const bpm = file.includes("slow") ? 79 : file.includes("fast") ? 201 : 128;
    return { common: { bpm }, format: { duration: 60 } };
  };
  const result = await createSetPlaylists({ root, sections: selections, dryRun: true, discover, readMetadata: read });
  const section = result.sections.warmup;
  assert.deepEqual(section.tracks.map((track) => track.path), [files[1], files[2], files[0]]);
  assert.deepEqual(section.tracks.map((track) => track.bpmSort), [100.5, 128, 158]);
  assert.deepEqual(section.tracks.map((track) => track.bpm), [201, 128, 79]);
  assert.equal(section.bpmMin, 100.5);
  assert.equal(section.bpmMax, 158);
  assert.equal(section.skippedCount, 2);
  assert.equal(section.skipped.length, 2);
}));

test("writes UTF-8 M3U8 with relative slash paths, correct EXTINF, skips empty sections and leaves no tmp", async () => fixture(async (root, files, discover, readMetadata) => {
  const result = await createSetPlaylists({ root, sections: selections, dryRun: false, discover, readMetadata });
  assert.deepEqual(result.written, [path.join(root, "Warmup.m3u8")]);
  const playlist = fs.readFileSync(result.written[0], "utf8");
  assert.equal(playlist.charCodeAt(0), "#".charCodeAt(0));
  assert.match(playlist, /^#EXTM3U\n#EXTINF:61,DJ Test - slow\nHouse\/slow\.mp3/m);
  assert.match(playlist, /House\/fast\.mp3/);
  assert.equal(fs.existsSync(path.join(root, "Closing.m3u8")), false);
  assert.deepEqual(fs.readdirSync(root).filter((name) => name.endsWith(".tmp")), []);
}));

test("rejects missing genres, traversal and roots under MUSIC BACKUP/2026", async () => fixture(async (root, _files, discover, readMetadata) => {
  await assert.rejects(createSetPlaylists({ root, sections: { ...selections, warmup: ["Missing"] }, discover, readMetadata }), /Género inexistente/);
  await assert.rejects(createSetPlaylists({ root, sections: { ...selections, warmup: [".."] }, discover, readMetadata }), /Género inexistente/);
  const forbidden = path.join(root, "MUSIC BACKUP", "2026", "Clasificado");
  fs.mkdirSync(forbidden, { recursive: true });
  await assert.rejects(createSetPlaylists({ root: forbidden, sections: { warmup: [], peak: [], closing: [] }, discover, readMetadata }), /MUSIC BACKUP\/2026/);
  await assert.rejects(createSetPlaylists({ root: path.dirname(forbidden), sections: { warmup: [], peak: [], closing: [] }, discover, readMetadata }), /MUSIC BACKUP\/2026/);
}));

test("POST /api/set-playlists returns 400 for invalid genre", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-playlist-api-"));
  fs.mkdirSync(path.join(root, "House"));
  const settings = path.join(root, "settings.json");
  fs.writeFileSync(settings, "{}");
  const server = createServer({ settingsFile: settings });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  });
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/set-playlists`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ root, sections: { warmup: [".."], peak: [], closing: [] }, dryRun: true }),
  });
  assert.equal(response.status, 400);
});
