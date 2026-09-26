import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { spawnSync } from "child_process";
import {
  renameFile,
  generateFilename,
  writeMetadata,
  readMetadata,
  identifyAndTag,
} from "../src/metadata_editor.js";

function ffmpegAvailable() {
  const result = spawnSync("ffmpeg", ["-version"]);
  return result.status === 0;
}

function makeToneFile(dir) {
  // MP3/ID3 supports arbitrary metadata frames (TBPM/TKEY); WAV's RIFF INFO
  // chunk silently drops tags ffmpeg does not know how to map.
  const filePath = path.join(dir, "tone.mp3");
  spawnSync("ffmpeg", [
    "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-loglevel", "error", filePath
  ]);
  return filePath;
}

function readTags(filePath) {
  const result = spawnSync("ffprobe", [
    "-v", "error", "-show_entries", "format_tags", "-of", "json", filePath
  ]);
  return JSON.parse(result.stdout.toString()).format.tags || {};
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "metadata-editor-"));
}

function writeFile(filePath, content = "dummy") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

// ─── generateFilename ────────────────────────────────────────────────────────

test("generateFilename produce 'Artist - Title' sin extensión", () => {
  const name = generateFilename({ artist: "Bicep", title: "Glue" });
  assert.equal(name, "Bicep - Glue");
  assert.equal(path.extname(name), "", "no debe incluir extensión");
});

test("generateFilename rellena con fallbacks cuando faltan campos", () => {
  const name = generateFilename({});
  assert.equal(name, "Unknown Artist - Unknown Title");
});

test("generateFilename limpia caracteres inválidos de path", () => {
  const name = generateFilename({ artist: "AC/DC", title: 'Back in Black: "Live"' });
  assert.ok(!name.includes("/"), "no debe contener /");
  assert.ok(!name.includes(":"), "no debe contener :");
  assert.ok(!name.includes('"'), 'no debe contener "');
});

// ─── renameFile ──────────────────────────────────────────────────────────────

test("renameFile renombra correctamente cuando newName NO trae extensión", () => {
  const dir = makeTempDir();
  const oldPath = path.join(dir, "original.mp3");
  writeFile(oldPath);

  const newPath = renameFile(oldPath, "Bicep - Glue");

  assert.equal(path.basename(newPath), "Bicep - Glue.mp3");
  assert.ok(fs.existsSync(newPath), "el archivo nuevo debe existir");
  assert.ok(!fs.existsSync(oldPath), "el archivo viejo no debe existir");
});

test("renameFile NO duplica extensión cuando newName ya la incluye", () => {
  const dir = makeTempDir();
  const oldPath = path.join(dir, "original.mp3");
  writeFile(oldPath);

  const newPath = renameFile(oldPath, "Bicep - Glue.mp3");

  assert.equal(path.basename(newPath), "Bicep - Glue.mp3");
  assert.ok(!newPath.endsWith(".mp3.mp3"), "extensión no debe estar duplicada");
  assert.ok(fs.existsSync(newPath));
});

test("renameFile lanza si el archivo de origen no existe", () => {
  assert.throws(
    () => renameFile("/tmp/nonexistent-file-musickind.mp3", "nuevo"),
    /File not found/
  );
});

test("renameFile lanza si newName está vacío", () => {
  const dir = makeTempDir();
  const oldPath = path.join(dir, "track.mp3");
  writeFile(oldPath);

  assert.throws(() => renameFile(oldPath, ""), /cannot be empty/);
  assert.throws(() => renameFile(oldPath, "   "), /cannot be empty/);
});

test("renameFile lanza si newName contiene separadores de path", () => {
  const dir = makeTempDir();
  const oldPath = path.join(dir, "track.mp3");
  writeFile(oldPath);

  assert.throws(
    () => renameFile(oldPath, "../../otro/archivo"),
    /path separators/
  );
  assert.throws(
    () => renameFile(oldPath, "subdir\\archivo"),
    /path separators/
  );
});

test("renameFile lanza si el archivo destino ya existe (y es diferente)", () => {
  const dir = makeTempDir();
  const oldPath = path.join(dir, "track.mp3");
  const existingPath = path.join(dir, "otro.mp3");
  writeFile(oldPath);
  writeFile(existingPath);

  assert.throws(
    () => renameFile(oldPath, "otro"),
    /already exists/
  );
});

test("renameFile acepta renombrar al mismo nombre (no-op sin error)", () => {
  const dir = makeTempDir();
  const oldPath = path.join(dir, "track.mp3");
  writeFile(oldPath);

  const result = renameFile(oldPath, "track");
  assert.equal(path.resolve(result), path.resolve(oldPath));
  assert.ok(fs.existsSync(result));
});

// ─── writeMetadata ───────────────────────────────────────────────────────────

test("writeMetadata rechaza con error claro si el archivo no existe", async () => {
  await assert.rejects(
    () => writeMetadata("/tmp/nonexistent-musickind.mp3", { title: "Test" }),
    /File not found/
  );
});

test("readMetadata expone bpm y key desde los tags", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = makeToneFile(dir);
  await writeMetadata(filePath, { bpm: 128.7, key: "Am" });
  const result = await readMetadata(filePath);
  assert.equal(Number(result.metadata.bpm), 129);
  assert.equal(result.metadata.key, "Am");
});

test("writeMetadata escribe bpm redondeado a entero (TBPM/bpm) y key (TKEY/initialkey)", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = makeToneFile(dir);

  const result = await writeMetadata(filePath, { bpm: 128.7, key: "Am" });

  assert.equal(result.ok, true);
  assert.equal(result.newPath, filePath);

  const tags = readTags(filePath);
  const lowerTags = Object.fromEntries(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
  assert.equal(lowerTags.tbpm ?? lowerTags.bpm, "129");
  assert.equal(lowerTags.tkey ?? lowerTags.initialkey, "Am");
});

test("writeMetadata no escribe bpm/key cuando no se proveen", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = makeToneFile(dir);

  await writeMetadata(filePath, { title: "Solo titulo" });

  const tags = readTags(filePath);
  const lowerKeys = Object.keys(tags).map((k) => k.toLowerCase());
  assert.ok(!lowerKeys.includes("tbpm") && !lowerKeys.includes("bpm"));
  assert.ok(!lowerKeys.includes("tkey") && !lowerKeys.includes("initialkey"));
});

test("identifyAndTag usa Deezer por nombre de archivo cuando faltan tags", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = path.join(dir, "Bicep - Glue.mp3");
  spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-loglevel", "error", filePath]);
  const calls = [];
  const deezer = { async search(artist, title) { calls.push([artist, title]); return { artist: "Bicep", title: "Glue", album: "Isles", releaseDate: "2021-01-01" }; } };
  const result = await identifyAndTag(filePath, deezer, null, { preview: true });
  assert.deepEqual(calls, [["Bicep", "Glue"]]);
  assert.deepEqual(result.metadata, { title: "Glue", artist: "Bicep", album: "Isles", year: 2021, genre: "", track: null });
  assert.equal(fs.existsSync(path.join(dir, "Bicep - Glue.mp3")), true);
});

test("identifyAndTag preview no escribe ni renombra el archivo", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = makeToneFile(dir);
  const before = fs.statSync(filePath);

  const result = await identifyAndTag(filePath, null, {
    artist: "Bicep",
    title: "Glue",
    album: "Isles",
    year: 2021,
  }, { preview: true });

  const after = fs.statSync(filePath);
  assert.deepEqual(result, {
    ok: true,
    original: "tone.mp3",
    metadata: {
      title: "Glue",
      artist: "Bicep",
      album: "Isles",
      year: 2021,
      genre: "",
      track: null,
    },
    newFilename: "Bicep - Glue.mp3",
    matchType: "fingerprint",
  });
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.ok(fs.existsSync(filePath));
  assert.equal(fs.existsSync(path.join(dir, "Bicep - Glue.mp3")), false);
});

test("identifyAndTag conserva varios artistas y el sufijo remix del crédito actual", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = makeToneFile(dir);
  await writeMetadata(filePath, { artist: "Chocolate Spread, Oscar P", title: "Chocolate Spread (Extended Remix)" });
  const deezer = {
    async search() {
      return { artist: "Chocolate Spread", title: "Chocolate Spread", album: "Single", releaseDate: "2024-01-01" };
    },
  };

  const result = await identifyAndTag(filePath, deezer, null, { preview: true });
  assert.equal(result.metadata.artist, "Chocolate Spread, Oscar P");
  assert.equal(result.metadata.title, "Chocolate Spread (Extended Remix)");
  assert.equal(fs.existsSync(filePath), true);
});

for (const version of ["Extended Mix", "Original Mix"]) {
  test(`identifyAndTag conserva (${version}) y normaliza espacios`, { skip: !ffmpegAvailable() }, async () => {
    const dir = makeTempDir();
    const filePath = path.join(dir, "track.aiff");
    spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-loglevel", "error", filePath]);
    await writeMetadata(filePath, { title: `Excuse Me  (${version})`, artist: "Italobros" });
    const result = await identifyAndTag(filePath, { async search() {
      return { title: "Excuse Me", artist: "Italobros", album: "Single" };
    } }, null, { preview: true });
    assert.equal(result.metadata.title, `Excuse Me (${version})`);
    assert.equal(result.newFilename, `Italobros - Excuse Me (${version}).aiff`);
  });
}

test("identifyAndTag uses the provider title when the source has no version descriptor", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = path.join(dir, "track.mp3");
  spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-loglevel", "error", filePath]);
  await writeMetadata(filePath, { title: "Excuse Me", artist: "Italobros" });
  const result = await identifyAndTag(filePath, { async search() {
    return { title: "Excuse Me (Radio Edit)", artist: "Italobros", album: "Single" };
  } }, null, { preview: true });
  assert.equal(result.metadata.title, "Excuse Me (Radio Edit)");
});

test("identifyAndTag sugiere la original sin cambiar el título del edit", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = path.join(dir, "RUN DMC, Jason Nevins - It's Like That (Raxon Edit) Unrelease.mp3");
  spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-loglevel", "error", filePath]);
  const calls = [];
  const deezer = { async search(artist, title) {
    calls.push([artist, title]);
    return calls.length === 1 ? null : { artist: "Run-DMC", title: "It's Like That", album: "Best Of", releaseDate: "2003-01-01", isrc: "X" };
  } };
  const result = await identifyAndTag(filePath, deezer, null, { preview: true });
  assert.deepEqual(calls, [["RUN DMC, Jason Nevins", "It's Like That (Raxon Edit)"], ["RUN DMC, Jason Nevins", "It's Like That"]]);
  assert.equal(result.metadata.artist, "RUN DMC, Jason Nevins");
  assert.equal(result.metadata.title, "It's Like That (Raxon Edit)");
  assert.equal(result.metadata.album, "Best Of");
  assert.equal(result.matchType, "original");
  assert.deepEqual(result.identification, { cover: "", isrc: "X" });
});

test("identifyAndTag explica los motivos cuando no encuentra coincidencias", { skip: !ffmpegAvailable() }, async () => {
  const dir = makeTempDir();
  const filePath = path.join(dir, "Unknown Artist - Unknown Edit (Raxon Remix).mp3");
  spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-loglevel", "error", filePath]);
  const deezer = { async search() { return null; } };
  await assert.rejects(
    identifyAndTag(filePath, deezer, null, { preview: true, identifyError: "Tiempo agotado en AcoustID" }),
    (error) => {
      assert.match(error.message, /Tiempo agotado en AcoustID/);
      assert.match(error.message, /Tags del archivo: vacíos/);
      assert.match(error.message, /búsqueda por nombre en Deezer/i);
      assert.match(error.message, /tampoco la versión original/);
      return true;
    },
  );
});
