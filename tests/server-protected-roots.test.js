import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../src/server.js";
import { applyClassifyMoves } from "../src/classify-apply.js";

async function withServer(settingsFile, run) {
  const server = createServer({ settingsFile });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve) => server.close(resolve)); }
}

test("settings preserva claves existentes y expone géneros canónicos", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-settings-"));
  const settingsFile = path.join(root, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ protectedRoots: [root], customSetting: "preserve-me", language: "en" }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(settingsFile, async (base) => {
    let response = await fetch(`${base}/api/settings`);
    assert.deepEqual((await response.json()).settings.protectedRoots, [root]);
    response = await fetch(`${base}/api/settings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ protectedRoots: [root] }) });
    assert.equal(response.status, 200);
    const saved = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    assert.equal(saved.customSetting, "preserve-me");
    assert.equal(saved.language, "en");
    response = await fetch(`${base}/api/genre-aliases`);
    assert.deepEqual((await response.json()).canonical, Object.keys(JSON.parse(fs.readFileSync(new URL("../config/genre-aliases.json", import.meta.url), "utf8"))));
  });
});

test("classify-apply bloquea un origen protegido aunque el cliente mande excludeRoots vacío", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-protected-apply-"));
  const protectedRoot = path.join(root, "examples");
  const destRoot = path.join(root, "classified");
  fs.mkdirSync(protectedRoot);
  const protectedFile = path.join(protectedRoot, "example.wav");
  fs.writeFileSync(protectedFile, "stay here");
  const settingsFile = path.join(root, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ protectedRoots: [protectedRoot] }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(settingsFile, async (base) => {
    const response = await fetch(`${base}/api/classify-apply`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ destRoot, excludeRoots: [], moves: [{ from: protectedFile, to: path.join(destRoot, "example.wav") }] }) });
    assert.equal(response.status, 400);
    assert.equal(fs.readFileSync(protectedFile, "utf8"), "stay here");
    assert.equal(fs.existsSync(destRoot), false);
  });
});

test("classify-undo respeta protectedRoots actuales del servidor", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-protected-undo-"));
  const protectedRoot = path.join(root, "examples");
  fs.mkdirSync(protectedRoot);
  const original = path.join(protectedRoot, "example.wav");
  fs.writeFileSync(original, "audio");
  const destRoot = path.join(root, "classified");
  const applied = await applyClassifyMoves({ destRoot, moves: [{ from: original, to: path.join(destRoot, "example.wav") }] });
  const settingsFile = path.join(root, "settings.json");
  fs.writeFileSync(settingsFile, JSON.stringify({ protectedRoots: [protectedRoot] }));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await withServer(settingsFile, async (base) => {
    const response = await fetch(`${base}/api/classify-undo`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ manifestPath: applied.manifestPath }) });
    assert.match(await response.text(), /"success":true/);
    assert.equal(fs.existsSync(original), false);
    assert.equal(fs.existsSync(path.join(destRoot, "example.wav")), true);
  });
});
