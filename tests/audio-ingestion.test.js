import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { ingestAudio } from "../src/skills/audio-ingestion.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "audio-ingestion-"));
}

function writeFile(filePath, content = "dummy") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

function buildFakeAdapter(overrides = {}) {
  return {
    name: "fake-adapter",
    async probeAudio(filePath) {
      if (overrides.failFor && filePath.endsWith(overrides.failFor)) {
        throw new Error("metadata unavailable");
      }

      const ext = path.extname(filePath).toLowerCase();
      const durationMap = {
        ".mp3": 180.123,
        ".wav": 90,
        ".flac": 200.5,
        ".m4a": 222.2,
        ".aiff": 150,
        ".aif": 150
      };

      return {
        durationSeconds: durationMap[ext] || null,
        formatName: ext.replace(".", ""),
        codecName: "pcm_s16le",
        sampleRate: 44100,
        bitrate: 320000
      };
    }
  };
}

test("ingestAudio construye manifest en dry-run y separa ignorados", async () => {
  const root = makeTempDir();

  writeFile(path.join(root, "artist - song.mp3"), "a");
  writeFile(path.join(root, "voice.wav"), "b");
  writeFile(path.join(root, "notes.txt"), "c");
  writeFile(path.join(root, ".hidden.mp3"), "d");
  writeFile(path.join(root, "nested", "deep.flac"), "e");

  const result = await ingestAudio(
    {
      target: root,
      dryRun: true,
      recursive: true
    },
    { metadataAdapter: buildFakeAdapter() }
  );

  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.manifest.files.length, 3);
  assert.equal(result.manifest.ignored.length, 2);
  assert.equal(result.summary.supportedFiles, 3);
  assert.equal(result.summary.ignoredFiles, 2);

  const fileEntry = result.manifest.files.find((entry) => entry.path.name === "artist - song.mp3");
  assert.ok(fileEntry);
  assert.equal(fileEntry.status, "dry-run");
  assert.equal(fileEntry.format.detectedBy, "fake-adapter");
  assert.equal(fileEntry.durationSeconds, 180.123);

  const ignoredReasons = new Set(result.manifest.ignored.map((entry) => entry.reason));
  assert.ok(ignoredReasons.has("UNSUPPORTED_EXTENSION"));
  assert.ok(ignoredReasons.has("HIDDEN_FILE"));
});

test("ingestAudio devuelve error estructurado para target inexistente", async () => {
  const result = await ingestAudio({
    target: "/path/does/not/exist.mp3",
    dryRun: true
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].code, "TARGET_NOT_FOUND");
});

test("ingestAudio captura errores de metadata sin lanzar excepcion", async () => {
  const root = makeTempDir();
  writeFile(path.join(root, "broken.mp3"), "broken");

  const result = await ingestAudio(
    {
      target: root,
      dryRun: false
    },
    { metadataAdapter: buildFakeAdapter({ failFor: "broken.mp3" }) }
  );

  assert.equal(result.ok, false);
  assert.equal(result.manifest.files.length, 1);
  assert.equal(result.manifest.files[0].status, "error");
  assert.equal(result.errors[0].code, "METADATA_READ_FAILED");
});

test("ingestAudio soporta batch y evita duplicados en targets superpuestos", async () => {
  const root = makeTempDir();
  const file = path.join(root, "song.m4a");
  writeFile(file, "demo");

  const result = await ingestAudio(
    {
      targets: [root, file],
      dryRun: true
    },
    { metadataAdapter: buildFakeAdapter() }
  );

  assert.equal(result.manifest.files.length, 1);
  assert.equal(result.manifest.ignored.length, 1);
  assert.equal(result.manifest.ignored[0].reason, "DUPLICATED_PATH");
});
