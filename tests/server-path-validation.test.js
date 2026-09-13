import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../src/server.js";

function startServer() {
  const server = createServer();
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function base(server) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

test("/api/metadata/list rechaza un basename (no ruta absoluta) con 400 claro", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${base(server)}/api/metadata/list?dir=track.mp3`);
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /[Rr]uta no absoluta/);
  assert.doesNotMatch(body.error, /No se encontro la ruta/);
});

test("/api/bpm/analyze rechaza un basename en files con 400 claro", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${base(server)}/api/bpm/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: ["track.mp3"] })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /[Rr]uta no absoluta/);
});

test("/api/metadata/write rechaza filePath no absoluto", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${base(server)}/api/metadata/write`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath: "track.mp3", metadata: {} })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /[Rr]uta no absoluta/);
});

test("/api/metadata/write rechaza bpm fuera de rango 20-300", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mk-write-validate-"));
  const filePath = path.join(dir, "track.mp3");
  fs.writeFileSync(filePath, "dummy");
  const response = await fetch(`${base(server)}/api/metadata/write`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath, metadata: { bpm: 500 } })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /bpm/);
});

test("/api/metadata/write rechaza key no string / demasiado larga", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mk-write-validate-"));
  const filePath = path.join(dir, "track.mp3");
  fs.writeFileSync(filePath, "dummy");
  const response = await fetch(`${base(server)}/api/metadata/write`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath, metadata: { key: "x".repeat(20) } })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.match(body.error, /key/);
});

test("/api/metadata/write rechaza filePath inexistente", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  const missing = path.join(os.tmpdir(), "mk-does-not-exist", String(Date.now()) + ".mp3");
  const response = await fetch(`${base(server)}/api/metadata/write`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filePath: missing, metadata: {} })
  });
  const body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
});
