import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyClassifyMoves, listClassifyManifests, undoClassifyManifest } from "../src/classify-apply.js";
import { createServer } from "../src/server.js";

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "mk-apply-"));
  const input = path.join(root, "input"); const dest = path.join(root, "classified"); const excluded = path.join(root, "2026");
  fs.mkdirSync(input); fs.mkdirSync(excluded);
  const add = (folder, name, data = "audio") => { const file = path.join(folder, name); fs.writeFileSync(file, data); return file; };
  return { root, input, dest, excluded, add };
}

test("mueve a nombre único, escribe manifiesto y permite deshacer", async (t) => {
  const env = setup(); t.after(() => fs.rmSync(env.root, { recursive: true, force: true }));
  const from = env.add(env.input, "track.wav"); const desired = path.join(env.dest, "House", "track.wav");
  fs.mkdirSync(path.dirname(desired), { recursive: true }); fs.writeFileSync(desired, "existing");
  const applied = await applyClassifyMoves({ moves: [{ from, to: desired }], excludeRoots: [env.excluded], destRoot: env.dest });
  assert.equal(applied.manifest.moves[0].status, "done");
  assert.equal(applied.manifest.moves[0].to, path.join(env.dest, "House", "track (2).wav"));
  assert.equal(fs.readFileSync(applied.manifest.moves[0].to, "utf8"), "audio");
  assert.deepEqual(listClassifyManifests(env.dest).map(({ total, done, undone }) => ({ total, done, undone })), [{ total: 1, done: 1, undone: false }]);
  const undone = await undoClassifyManifest({ manifestPath: applied.manifestPath });
  assert.equal(fs.readFileSync(from, "utf8"), "audio"); assert.equal(undone.manifest.undone, true);
  assert.equal(listClassifyManifests(env.dest)[0].undone, true);
});

test("rechaza lote inválido antes de mover cualquier archivo", async (t) => {
  const env = setup(); t.after(() => fs.rmSync(env.root, { recursive: true, force: true }));
  const safe = env.add(env.input, "safe.wav"); const protectedFile = env.add(env.excluded, "protected.wav");
  await assert.rejects(applyClassifyMoves({ destRoot: env.dest, excludeRoots: [env.excluded], moves: [
    { from: safe, to: path.join(env.dest, "safe.wav") }, { from: protectedFile, to: path.join(env.dest, "protected.wav") }
  ] }), /excludeRoots/);
  assert.equal(fs.existsSync(safe), true); assert.equal(fs.existsSync(env.dest), false);
  await assert.rejects(applyClassifyMoves({ destRoot: env.dest, excludeRoots: [], moves: [{ from: safe, to: path.join(env.root, "outside.wav") }] }), /fuera de destRoot/);
});

test("cancelar tras el primer archivo deja un manifiesto coherente", async (t) => {
  const env = setup(); t.after(() => fs.rmSync(env.root, { recursive: true, force: true }));
  const a = env.add(env.input, "a.wav"); const b = env.add(env.input, "b.wav"); let stop = false;
  const result = await applyClassifyMoves({ destRoot: env.dest, excludeRoots: [], moves: [a, b].map((from) => ({ from, to: path.join(env.dest, path.basename(from)) })), cancelled: () => stop, onProgress: () => { stop = true; } });
  assert.equal(result.cancelled, true); assert.deepEqual(result.manifest.moves.map((move) => move.status), ["done", "pending"]);
  assert.equal(fs.existsSync(b), true);
});

test("deshacer ocupado no sobrescribe origen y EXDEV copia/verifica/borra", async (t) => {
  const env = setup(); t.after(() => fs.rmSync(env.root, { recursive: true, force: true }));
  const from = env.add(env.input, "track.flac", "audio-data");
  const forceExdev = () => { const error = new Error("cross-device"); error.code = "EXDEV"; throw error; };
  const applied = await applyClassifyMoves({ destRoot: env.dest, excludeRoots: [], moves: [{ from, to: path.join(env.dest, "track.flac") }], renameSync: forceExdev });
  const actual = applied.manifest.moves[0].to;
  assert.equal(fs.existsSync(from), false); assert.equal(fs.readFileSync(actual, "utf8"), "audio-data");
  fs.writeFileSync(from, "keep me");
  const undone = await undoClassifyManifest({ manifestPath: applied.manifestPath });
  assert.equal(undone.manifest.moves[0].status, "done"); assert.equal(undone.manifest.moves[0].undoStatus, "error");
  assert.equal(fs.readFileSync(from, "utf8"), "keep me"); assert.equal(fs.existsSync(actual), true);
});

test("API valida antes de mover y aplica/deshace por SSE", async (t) => {
  const env = setup(); t.after(() => fs.rmSync(env.root, { recursive: true, force: true }));
  const from = env.add(env.input, "track.mp3"); const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (url, body) => fetch(`${base}${url}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  let response = await post("/api/classify-apply", { destRoot: env.dest, excludeRoots: [env.excluded], moves: [
    { from, to: path.join(env.dest, "track.mp3") }, { from: path.join(env.excluded, "absent.wav"), to: path.join(env.dest, "absent.wav") }
  ] });
  assert.equal(response.status, 400); assert.equal(fs.existsSync(from), true); assert.equal(fs.existsSync(env.dest), false);
  response = await post("/api/classify-apply", { destRoot: env.dest, excludeRoots: [env.excluded], moves: [{ from, to: path.join(env.dest, "track.mp3") }] });
  const events = (await response.text()).split("\n\n").filter(Boolean).map((chunk) => JSON.parse(chunk.replace(/^data: /, "")));
  const manifestPath = events.find((event) => event.type === "result").manifestPath; assert.equal(events.at(-1).success, true);
  response = await post("/api/classify-undo", { manifestPath }); assert.equal((await response.text()).includes('"success":true'), true);
  assert.equal(fs.existsSync(from), true);
});
