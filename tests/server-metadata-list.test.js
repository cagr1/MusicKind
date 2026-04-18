import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import { buildMetadataListResponse } from "../src/services/metadata-list-api.js";

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "mk-server-meta-"));
}

function writeFile(filePath, content = "x") {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content);
}

test("metadata list response returns supported files and remains UI-consumable", async () => {
  const dir = makeTempDir();
  writeFile(path.join(dir, "track.mp3"));
  writeFile(path.join(dir, "voice.wav"));
  writeFile(path.join(dir, "notes.txt"));

  const response = await buildMetadataListResponse({
    dirPath: dir,
    recursive: false
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.ok, true);
  assert.ok(Array.isArray(response.payload.files));
  assert.equal(response.payload.files.length, 2);
  assert.ok(response.payload.files.some((filePath) => filePath.endsWith("track.mp3")));
  assert.ok(response.payload.files.some((filePath) => filePath.endsWith("voice.wav")));
  assert.ok(response.payload.summary);
  assert.ok(Array.isArray(response.payload.ignored));
});

test("metadata list response handles empty folder", async () => {
  const dir = makeTempDir();

  const response = await buildMetadataListResponse({
    dirPath: dir,
    recursive: false
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.files.length, 0);
});

test("metadata list response returns readable error for missing path", async () => {
  const missing = path.join(os.tmpdir(), "does-not-exist", String(Date.now()));

  const response = await buildMetadataListResponse({
    dirPath: missing,
    recursive: false
  });

  assert.equal(response.status, 400);
  assert.equal(response.payload.ok, false);
  assert.match(response.payload.error, /No se encontro la ruta/);
});
