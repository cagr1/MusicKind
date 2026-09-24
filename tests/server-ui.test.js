import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createServer } from "../src/server.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const fontAsset = fs.readdirSync(path.join(projectRoot, "web", "dist", "assets"))
  .find((file) => file.endsWith(".woff2"));

function startServer() {
  const server = createServer();
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function base(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

test("sirve web/dist por defecto y ui con MUSIC_KIND_UI=legacy", async (t) => {
  const previous = process.env.MUSIC_KIND_UI;
  delete process.env.MUSIC_KIND_UI;
  const server = await startServer();
  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.MUSIC_KIND_UI;
    else process.env.MUSIC_KIND_UI = previous;
  });

  const modern = await fetch(`${base(server)}/`);
  assert.equal(modern.status, 200);
  assert.match(await modern.text(), /MusicKind/);

  process.env.MUSIC_KIND_UI = "legacy";
  const legacy = await fetch(`${base(server)}/`);
  assert.equal(legacy.status, 200);
  assert.match(await legacy.text(), /MusicKind/);
});

test("sirve MIME de fuentes y rechaza traversal", async (t) => {
  const previous = process.env.MUSIC_KIND_UI;
  delete process.env.MUSIC_KIND_UI;
  const server = await startServer();
  t.after(() => {
    server.close();
    if (previous === undefined) delete process.env.MUSIC_KIND_UI;
    else process.env.MUSIC_KIND_UI = previous;
  });

  assert.ok(fontAsset, "web/dist debe contener una fuente para verificar su MIME");
  const font = await fetch(`${base(server)}/assets/${fontAsset}`);
  assert.equal(font.status, 200);
  assert.equal(font.headers.get("content-type"), "font/woff2");

  const traversal = await fetch(`${base(server)}/../package.json`);
  assert.equal(traversal.status, 404);
});
