import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";
import {
  renameFile,
  generateFilename,
  writeMetadata,
} from "../src/metadata_editor.js";

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
