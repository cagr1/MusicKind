import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildGenreLookup, classifyByTags, isJunkGenre, normalizeGenre } from "../src/tag-classifier.js";

function tempDir(prefix) { return fs.mkdtempSync(path.join(os.tmpdir(), prefix)); }
function addFile(root, relative, bytes = "fake-audio") {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  return file;
}
function snapshot(root) {
  return fs.readdirSync(root, { recursive: true }).map((relative) => {
    const file = path.join(root, relative);
    const stat = fs.statSync(file);
    return [relative, stat.size, stat.mtimeMs];
  });
}

test("normaliza separadores y ampersand; detecta tags basura", () => {
  assert.equal(normalizeGenre("  Melodic House / Techno "), "melodic house and techno");
  assert.equal(normalizeGenre("Melodic House & Techno"), "melodic house and techno");
  assert.equal(isJunkGenre("https://example.org/tag"), true);
  assert.equal(isJunkGenre("www.example.com"), true);
});

test("propone alias canónicos, revisión y duplicado sin cambiar input", async (t) => {
  const root = tempDir("mk-tags-input-");
  const excluded = tempDir("mk-tags-examples-");
  const destination = path.join(tempDir("mk-tags-dest-parent-"), "classified");
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(excluded, { recursive: true, force: true }); fs.rmSync(path.dirname(destination), { recursive: true, force: true }); });
  addFile(root, "alias.wav");
  addFile(root, "missing.wav");
  addFile(root, "junk.wav");
  addFile(root, "unknown.wav");
  const sameBytes = "duplicate-audio";
  const duplicate = addFile(root, "duplicate.wav", sameBytes);
  addFile(root, "same-name-different-size.wav", "small");
  addFile(excluded, "sample/duplicate.wav", sameBytes);
  addFile(excluded, "same-name-different-size.wav", "larger protected version");
  addFile(excluded, "not-in-input.wav");
  const before = snapshot(root);
  const tags = new Map([["alias.wav", " Latin Tech "], ["junk.wav", "http://genre.example.com"], ["unknown.wav", "Space Funk"]]);
  const result = await classifyByTags({
    inputRoot: root, excludeRoots: [excluded], destRoot: destination,
    parseFile: async (file, options) => {
      assert.deepEqual(options, { duration: false, skipCovers: true });
      const value = tags.get(path.basename(file));
      return { common: { genre: value ? [value] : [] } };
    }
  });
  const byName = Object.fromEntries(result.map((item) => [path.basename(item.path), item]));
  assert.equal(byName["alias.wav"].genre, "Tech House");
  assert.equal(byName["alias.wav"].status, "ok");
  assert.equal(byName["alias.wav"].destination, path.join(destination, "Tech House", "alias.wav"));
  assert.deepEqual([byName["missing.wav"].status, byName["missing.wav"].reason], ["review", "missing-genre-tag"]);
  assert.deepEqual([byName["junk.wav"].status, byName["junk.wav"].reason], ["review", "junk-genre-tag"]);
  assert.deepEqual([byName["unknown.wav"].status, byName["unknown.wav"].reason], ["review", "unknown-genre-tag"]);
  assert.deepEqual([byName["duplicate.wav"].status, byName["duplicate.wav"].reason], ["duplicate", "same-name-and-size-in-exclude-root"]);
  assert.equal(byName["duplicate.wav"].destination, null);
  assert.equal(byName["same-name-different-size.wav"].possibleDuplicate, true);
  assert.equal(byName["alias.wav"].possibleDuplicate, false);
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(fs.readdirSync(path.dirname(destination)), []);
  assert.ok(!result.some((item) => item.path.startsWith(excluded + path.sep)));
  assert.notEqual(fs.statSync(duplicate).mtimeMs, 0);
});

test("incluye alias adicionales de Afro House y Electronica", () => {
  const aliases = JSON.parse(fs.readFileSync(new URL("../config/genre-aliases.json", import.meta.url), "utf8"));
  const lookup = buildGenreLookup(aliases);
  assert.equal(lookup.get(normalizeGenre("Afro / Latin / Brazilian")), "Afro House");
  assert.equal(lookup.get(normalizeGenre("Afro Melodic")), "Afro House");
  assert.equal(lookup.get(normalizeGenre("Electronica / Downtempo")), "Electronica");
});

test("excluye raíces anidadas y rechaza rutas protegidas", async (t) => {
  const parent = tempDir("mk-tags-containment-");
  const input = path.join(parent, "input");
  const examples = path.join(input, "examples");
  const destination = path.join(parent, "dest");
  fs.mkdirSync(examples, { recursive: true });
  addFile(input, "one.wav");
  addFile(examples, "sample.wav");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const result = await classifyByTags({ inputRoot: input, excludeRoots: [examples], destRoot: destination, parseFile: async () => ({ common: {} }) });
  assert.deepEqual(result.map((item) => path.basename(item.path)), ["one.wav"]);
  await assert.rejects(() => classifyByTags({ inputRoot: examples, excludeRoots: [input], destRoot: destination }), /dentro de excludeRoots/);
  await assert.rejects(() => classifyByTags({ inputRoot: input, excludeRoots: [examples], destRoot: path.join(examples, "out") }), /dentro de excludeRoots/);
  await assert.rejects(() => classifyByTags({ inputRoot: input, excludeRoots: [examples], destRoot: parent }), /excludeRoots no pueden estar dentro/);
});

test("no vuelve a proponer archivos que ya están bajo destRoot", async (t) => {
  const parent = tempDir("mk-tags-rescan-");
  const input = path.join(parent, "input");
  const destination = path.join(input, "Clasificado");
  fs.mkdirSync(destination, { recursive: true });
  addFile(input, "pending.wav");
  addFile(destination, "House", "classified.wav");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const result = await classifyByTags({ inputRoot: input, destRoot: destination, parseFile: async () => ({ common: { genre: ["House"] } }) });
  assert.deepEqual(result.map((item) => path.basename(item.path)), ["pending.wav"]);
});

async function onlineFixture(t, { lastfmClient = null, spotifyClient = null, online = true, timeoutMs = 20 } = {}) {
  const parent = tempDir("mk-tags-online-");
  const input = path.join(parent, "input");
  fs.mkdirSync(input);
  const file = addFile(input, "Test Artist - Test Track.mp3");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return classifyByTags({
    inputRoot: input,
    destRoot: path.join(parent, "out"),
    aliasTable: { House: ["deep house"] },
    parseFile: async () => ({ common: { genre: ["https://junk.example.com"] } }),
    lastfmClient,
    spotifyClient,
    online,
    timeoutMs,
    onProgress() {},
  }).then((rows) => rows[0]).then((row) => ({ row, file }));
}

test("respaldo online mapea tag basura de Last.fm y conserva fuente/tag de origen", async (t) => {
  let trackCalls = 0;
  const { row, file } = await onlineFixture(t, {
    lastfmClient: {
      async getTrackTags(artist, title) {
        trackCalls++;
        assert.equal(artist, "Test Artist");
        assert.equal(title, "Test Track");
        return ["Deep House"];
      },
      async getArtistTags() { throw new Error("artist lookup should not run after match"); },
    },
  });
  assert.equal(trackCalls, 1);
  assert.match(row.path, /Test Artist - Test Track\.mp3/);
  assert.equal(row.genre, "House");
  assert.equal(row.status, "ok");
  assert.equal(row.genreSource, "lastfm");
  assert.equal(row.onlineTag, "Deep House");
  assert.equal(row.destination, path.join(path.dirname(path.dirname(file)), "out", "House", path.basename(file)));
});

test("respaldo online sin mapeo deja review y respeta orden Spotify antes de tags de artista", async (t) => {
  const calls = [];
  const { row } = await onlineFixture(t, {
    lastfmClient: {
      async getTrackTags() { calls.push("track"); return ["unmapped track"]; },
      async getArtistTags() { calls.push("artist"); return ["unmapped artist"]; },
    },
    spotifyClient: {
      async searchTrack() { calls.push("search"); return { artists: [{ id: "artist-id" }] }; },
      async getArtist() { calls.push("spotify"); return { genres: ["unmapped spotify"] }; },
    },
  });
  assert.deepEqual(calls, ["track", "search", "spotify", "artist"]);
  assert.equal(row.status, "review");
  assert.equal(row.reason, "junk-genre-tag");
  assert.equal(row.genre, null);
});

test("sin claves online no hace llamadas y un timeout deja la pista en review", async (t) => {
  let calls = 0;
  const noKeys = await onlineFixture(t);
  assert.equal(noKeys.row.status, "review");
  const timeout = await onlineFixture(t, {
    lastfmClient: {
      async getTrackTags() { calls++; return new Promise(() => {}); },
      async getArtistTags() { calls++; return []; },
    },
    timeoutMs: 5,
  });
  assert.equal(calls, 2);
  assert.equal(timeout.row.status, "review");
  assert.equal(timeout.row.reason, "junk-genre-tag");
});
