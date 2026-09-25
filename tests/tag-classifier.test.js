import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildGenreLookup,
  classifyByTags,
  isJunkGenre,
  normalizeGenre,
  resolveGenre,
} from "../src/tag-classifier.js";

function tempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
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
  assert.equal(
    normalizeGenre("  Melodic House / Techno "),
    "melodic house and techno",
  );
  assert.equal(
    normalizeGenre("Melodic House & Techno"),
    "melodic house and techno",
  );
  assert.equal(isJunkGenre("https://example.org/tag"), true);
  assert.equal(isJunkGenre("www.example.com"), true);
});

test("propone alias canónicos y revisión sin cambiar input", async (t) => {
  const root = tempDir("mk-tags-input-");
  const destination = path.join(tempDir("mk-tags-dest-parent-"), "classified");
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(path.dirname(destination), { recursive: true, force: true });
  });
  addFile(root, "alias.wav");
  addFile(root, "missing.wav");
  addFile(root, "junk.wav");
  addFile(root, "unknown.wav");
  addFile(root, "same-name-different-size.wav", "small");
  const before = snapshot(root);
  const tags = new Map([
    ["alias.wav", " Latin Tech "],
    ["junk.wav", "http://genre.example.com"],
    ["unknown.wav", "Space Funk"],
  ]);
  const result = await classifyByTags({
    inputRoot: root,
    destRoot: destination,
    parseFile: async (file, options) => {
      assert.deepEqual(options, { duration: false, skipCovers: true });
      const value = tags.get(path.basename(file));
      return { common: { genre: value ? [value] : [] } };
    },
  });
  const byName = Object.fromEntries(
    result.map((item) => [path.basename(item.path), item]),
  );
  assert.equal(byName["alias.wav"].genre, "Tech House");
  assert.equal(byName["alias.wav"].status, "ok");
  assert.equal(
    byName["alias.wav"].destination,
    path.join(destination, "Tech House", "alias.wav"),
  );
  assert.deepEqual(
    [byName["missing.wav"].status, byName["missing.wav"].reason],
    ["review", "missing-genre-tag"],
  );
  assert.deepEqual(
    [byName["junk.wav"].status, byName["junk.wav"].reason],
    ["review", "junk-genre-tag"],
  );
  assert.deepEqual(
    [byName["unknown.wav"].status, byName["unknown.wav"].reason],
    ["review", "unknown-genre-tag"],
  );
  assert.deepEqual(snapshot(root), before);
  assert.deepEqual(fs.readdirSync(path.dirname(destination)), []);
});

test("incluye alias adicionales de Afro House y Electronica", () => {
  const aliases = JSON.parse(
    fs.readFileSync(
      new URL("../config/genre-aliases.json", import.meta.url),
      "utf8",
    ),
  );
  const lookup = buildGenreLookup(aliases);
  assert.equal(
    lookup.get(normalizeGenre("Afro / Latin / Brazilian")),
    "Afro House",
  );
  assert.equal(lookup.get(normalizeGenre("Afro Melodic")), "Afro House");
  assert.equal(
    lookup.get(normalizeGenre("Electronica / Downtempo")),
    "Electronica",
  );
});

test("resuelve alias prioritario, estilo/familia Discogs y tags genéricos", () => {
  const catalog = JSON.parse(
    fs.readFileSync(
      new URL("../config/genre-catalog.json", import.meta.url),
      "utf8",
    ),
  );
  const aliases = JSON.parse(
    fs.readFileSync(
      new URL("../config/genre-aliases.json", import.meta.url),
      "utf8",
    ),
  );
  assert.deepEqual(
    resolveGenre("Latin Tech", { aliasTable: aliases, catalog }),
    { genre: "Tech House", family: "Electronic" },
  );
  assert.deepEqual(resolveGenre("Salsa", { aliasTable: aliases, catalog }), {
    genre: "Salsa",
    family: "Latin",
  });
  assert.deepEqual(resolveGenre("Rock", { aliasTable: aliases, catalog }), {
    genre: null,
    family: "Rock",
  });
  assert.deepEqual(resolveGenre("Pop", { aliasTable: aliases, catalog }), {
    genre: null,
    family: "Pop",
  });
  assert.deepEqual(
    resolveGenre("not-a-genre", { aliasTable: aliases, catalog }),
    { genre: null, family: null },
  );
});

test("resuelve estilos del catálogo aprendido después del de fábrica", () => {
  const catalog = { families: { Pop: ["Factory Pop"] } };
  const learnedCatalog = { families: { Electronic: ["Future Style"] } };
  assert.deepEqual(resolveGenre("Future Style", { catalog, learnedCatalog }), {
    genre: "Future Style", family: "Electronic",
  });
  assert.deepEqual(resolveGenre("Factory Pop", { catalog, learnedCatalog }), {
    genre: "Factory Pop", family: "Pop",
  });
});

test("el análisis ignora carpetas normales y solo excluye el destino", async (t) => {
  const parent = tempDir("mk-tags-containment-");
  const input = path.join(parent, "input");
  const nested = path.join(input, "nested");
  const destination = path.join(parent, "dest");
  fs.mkdirSync(nested, { recursive: true });
  addFile(input, "one.wav");
  addFile(nested, "sample.wav");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const result = await classifyByTags({
    inputRoot: input,
    destRoot: destination,
    parseFile: async () => ({ common: {} }),
  });
  assert.deepEqual(result.map((item) => path.basename(item.path)).sort(), [
    "one.wav",
    "sample.wav",
  ]);
});

test("no vuelve a proponer archivos que ya están bajo destRoot", async (t) => {
  const parent = tempDir("mk-tags-rescan-");
  const input = path.join(parent, "input");
  const destination = path.join(input, "Clasificado");
  fs.mkdirSync(destination, { recursive: true });
  addFile(input, "pending.wav");
  addFile(destination, "House", "classified.wav");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const result = await classifyByTags({
    inputRoot: input,
    destRoot: destination,
    parseFile: async () => ({ common: { genre: ["House"] } }),
  });
  assert.deepEqual(
    result.map((item) => path.basename(item.path)),
    ["pending.wav"],
  );
});

test("acepta archivos sueltos y análisis sin destino; asigna familia si solo reconoce familia", async (t) => {
  const parent = tempDir("mk-tags-loose-");
  const file = addFile(parent, "solo.wav");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const rows = await classifyByTags({
    inputPaths: [file],
    online: false,
    parseFile: async () => ({ common: { genre: ["Rock"] } }),
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].family, "Rock");
  assert.equal(rows[0].status, "family");
  assert.equal(rows[0].destination, null);
});

async function onlineFixture(
  t,
  {
    lastfmClient = null,
    discogsClient = null,
    online = true,
    timeoutMs = 20,
    aliasTable = { House: ["deep house"] },
  } = {},
) {
  const parent = tempDir("mk-tags-online-");
  const input = path.join(parent, "input");
  fs.mkdirSync(input);
  const file = addFile(input, "Test Artist - Test Track.mp3");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  return classifyByTags({
    inputRoot: input,
    destRoot: path.join(parent, "out"),
    aliasTable,
    parseFile: async () => ({
      common: { genre: ["https://junk.example.com"] },
    }),
    lastfmClient,
    discogsClient,
    online,
    timeoutMs,
    onProgress() {},
  })
    .then((rows) => rows[0])
    .then((row) => ({ row, file }));
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
      async getArtistTags() {
        throw new Error("artist lookup should not run after match");
      },
    },
  });
  assert.equal(trackCalls, 1);
  assert.match(row.path, /Test Artist - Test Track\.mp3/);
  assert.equal(row.genre, "House");
  assert.equal(row.status, "ok");
  assert.equal(row.genreSource, "lastfm");
  assert.equal(row.onlineTag, "Deep House");
  assert.equal(
    row.destination,
    path.join(
      path.dirname(path.dirname(file)),
      "out",
      "House",
      path.basename(file),
    ),
  );
});

test("Discogs mapea el style canónico antes de consultar Last.fm", async (t) => {
  let lastfmCalls = 0;
  const { row } = await onlineFixture(t, {
    discogsClient: {
      async getTags() {
        return ["Deep House"];
      },
      async getGenres() {
        throw new Error("genre lookup is after style match");
      },
    },
    lastfmClient: {
      async getTrackTags() {
        lastfmCalls++;
        return [];
      },
      async getArtistTags() {
        lastfmCalls++;
        return [];
      },
    },
  });
  assert.equal(row.genre, "House");
  assert.equal(row.genreSource, "discogs");
  assert.equal(row.onlineTag, "Deep House");
  assert.equal(lastfmCalls, 0);
});

test("aprende estilos desconocidos solo de Discogs y los persiste de forma atómica", async (t) => {
  const parent = tempDir("mk-tags-learned-");
  const input = path.join(parent, "input");
  const learnedPath = path.join(parent, "data", "genre-catalog-learned.json");
  fs.mkdirSync(input);
  addFile(input, "Test Artist - Test Track.mp3");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const [row] = await classifyByTags({
    inputRoot: input,
    learnedCatalogPath: learnedPath,
    parseFile: async () => ({ common: { genre: ["unknown"] } }),
    discogsClient: {
      async getStyleResults() { return [["Future Style"]]; },
      async getGenreResults() { return [["Electronic"]]; },
    },
    onProgress() {},
  });
  assert.equal(row.genre, "Future Style");
  assert.equal(row.family, "Electronic");
  assert.deepEqual(JSON.parse(fs.readFileSync(learnedPath, "utf8")), {
    families: { Electronic: ["Future Style"] },
  });
  assert.deepEqual(fs.readdirSync(path.dirname(learnedPath)), ["genre-catalog-learned.json"]);

  const lastfmInput = path.join(parent, "lastfm");
  fs.mkdirSync(lastfmInput);
  addFile(lastfmInput, "Test Artist - Another Track.mp3");
  const lastfmPath = path.join(parent, "lastfm-data", "genre-catalog-learned.json");
  await classifyByTags({
    inputRoot: lastfmInput,
    learnedCatalogPath: lastfmPath,
    parseFile: async () => ({ common: { genre: ["unknown"] } }),
    lastfmClient: { async getTrackTags() { return ["Another Future Style"]; }, async getArtistTags() { return []; } },
    onProgress() {},
  });
  assert.equal(fs.existsSync(lastfmPath), false);
});

test("respaldo online ignora géneros genéricos y conserva el orden de proveedores", async (t) => {
  const calls = [];
  const { row } = await onlineFixture(t, {
    lastfmClient: {
      async getTrackTags() {
        calls.push("track");
        return ["unmapped track"];
      },
      async getArtistTags() {
        calls.push("artist");
        return ["unmapped artist"];
      },
    },
    discogsClient: {
      async getTags() {
        calls.push("styles");
        return ["Electronic", "unmapped style"];
      },
      async getGenres() {
        throw new Error("Discogs genre must not be queried");
      },
    },
  });
  assert.deepEqual(calls, ["styles", "track", "artist"]);
  assert.equal(row.status, "review");
  assert.equal(row.reason, "junk-genre-tag");
  assert.equal(row.genre, null);
});

test("respaldo online ignora tags genéricos, pero el pase local por tags no cambia", async (t) => {
  const { row } = await onlineFixture(t, {
    lastfmClient: {
      async getTrackTags() {
        return ["Electronic", "Dance", "Deep House"];
      },
      async getArtistTags() {
        throw new Error("artist lookup should not run after match");
      },
    },
  });
  assert.equal(row.genre, "House");
  assert.equal(row.onlineTag, "Deep House");

  const parent = tempDir("mk-tags-generic-local-");
  const input = path.join(parent, "input");
  fs.mkdirSync(input);
  addFile(input, "tagged.wav");
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const [local] = await classifyByTags({
    inputRoot: input,
    destRoot: path.join(parent, "out"),
    aliasTable: { Electronica: ["Electronic"] },
    online: false,
    parseFile: async () => ({ common: { genre: ["Electronic"] } }),
  });
  assert.equal(local.genre, null);
  assert.equal(local.family, "Electronic");
  assert.equal(local.status, "family");
});

test("Discogs prefiere estilo House específico más frecuente y desempata por primer resultado", async (t) => {
  const { row } = await onlineFixture(t, {
    aliasTable: { House: [], "Deep House": [], "Tech House": [] },
    discogsClient: {
      async getStyleResults() {
        return [
          ["House", "Tech House", "Tech House"],
          ["Deep House", "Tech House"],
        ];
      },
    },
  });
  assert.equal(row.genre, "Tech House");
  assert.equal(row.onlineTag, "Tech House");

  const tied = await onlineFixture(t, {
    aliasTable: { House: [], "Deep House": [], "Tech House": [] },
    discogsClient: {
      async getStyleResults() {
        return [["House", "Deep House"], ["Tech House"]];
      },
    },
  });
  assert.equal(tied.row.genre, "Deep House");
});

test("sin claves online no hace llamadas y un timeout deja la pista en review", async (t) => {
  let calls = 0;
  const noKeys = await onlineFixture(t);
  assert.equal(noKeys.row.status, "review");
  const timeout = await onlineFixture(t, {
    lastfmClient: {
      async getTrackTags() {
        calls++;
        return new Promise(() => {});
      },
      async getArtistTags() {
        calls++;
        return [];
      },
    },
    timeoutMs: 5,
  });
  assert.equal(calls, 2);
  assert.equal(timeout.row.status, "review");
  assert.equal(timeout.row.reason, "junk-genre-tag");
});
