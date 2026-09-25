import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile as defaultParseFile } from "music-metadata";
import { discoverAudioFiles } from "./services/audio-discovery.js";
import { parseArtistTitleFromFilename } from "./utils.js";
import { getDataDir } from "./python-env.js";

const aliasesPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../config/genre-aliases.json",
);
const catalogPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../config/genre-catalog.json",
);
const GENERIC_ONLINE_TAGS = new Set(
  [
    "electronic",
    "electronica",
    "dance",
    "pop",
    "electro",
    "edm",
    "club",
    "electronic dance music",
  ].map(normalizeGenre),
);
const SPECIFIC_HOUSE_GENRES = new Set([
  "Deep House",
  "Tech House",
  "Afro House",
  "Progressive House",
  "Organic House",
  "Melodic House & Techno",
  "Minimal Deep Tech",
]);

export function normalizeGenre(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/&/g, " and ")
    .replace(/[/:]/g, " and ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildGenreLookup(aliasTable) {
  const lookup = new Map();
  for (const [canonical, aliases] of Object.entries(aliasTable)) {
    lookup.set(normalizeGenre(canonical), canonical);
    for (const alias of aliases) lookup.set(normalizeGenre(alias), canonical);
  }
  return lookup;
}

export function resolveGenre(
  value,
  {
    aliasTable = {},
    catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8")),
    learnedCatalog = loadLearnedCatalog(),
  } = {},
) {
  const normalized = normalizeGenre(value);
  const aliases = buildGenreLookup(aliasTable);
  const genericFamilies = new Map([
    ["electronic", "Electronic"],
    ["electronica", "Electronic"],
    ["electro", "Electronic"],
    ["edm", "Electronic"],
    ["club", "Electronic"],
    ["electronic dance music", "Electronic"],
    ["dance", "Electronic"],
    ["pop", "Pop"],
  ]);
  if (genericFamilies.has(normalized))
    return { genre: null, family: genericFamilies.get(normalized) };
  if (aliases.has(normalized))
    return { genre: aliases.get(normalized), family: "Electronic" };
  const families = Object.entries(catalog.families ?? {});
  const factoryMatch = findCatalogGenre(normalized, families);
  if (factoryMatch) return factoryMatch;
  const learnedMatch = findCatalogGenre(normalized, Object.entries(learnedCatalog.families ?? {}));
  if (learnedMatch) return learnedMatch;
  const family = families.find(([name]) => normalizeGenre(name) === normalized);
  return family
    ? { genre: null, family: family[0] }
    : { genre: null, family: null };
}

function findCatalogGenre(normalized, families) {
  for (const [family, styles] of families) {
    const style = styles.find((item) => normalizeGenre(item) === normalized);
    if (style) return GENERIC_ONLINE_TAGS.has(normalized) ? { genre: null, family } : { genre: style, family };
  }
  return null;
}

export function loadLearnedCatalog(filePath = path.join(getDataDir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")), "genre-catalog-learned.json")) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return { families: value?.families && typeof value.families === "object" ? value.families : {} };
  } catch { return { families: {} }; }
}

function learnDiscogsStyles(styles, genres, catalog, filePath) {
  const familyNames = Object.keys(catalog.families ?? {});
  const familyLookup = new Map(familyNames.map((family) => [normalizeGenre(family), family]));
  const family = (Array.isArray(genres) ? genres : []).map((item) => familyLookup.get(normalizeGenre(item))).find(Boolean);
  if (!family) return;
  const factory = Object.values(catalog.families ?? {}).flat();
  const learned = loadLearnedCatalog(filePath);
  let changed = false;
  for (const style of (Array.isArray(styles) ? styles : []).map(String)) {
    const normalized = normalizeGenre(style);
    if (!normalized || factory.some((item) => normalizeGenre(item) === normalized) ||
        Object.values(learned.families).flat().some((item) => normalizeGenre(item) === normalized)) continue;
    (learned.families[family] ??= []).push(style);
    changed = true;
  }
  if (!changed) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(learned, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(temporary, filePath);
}

export function isJunkGenre(value) {
  return /(?:https?:\/\/|www\.|\.com\b)/i.test(String(value ?? ""));
}

export async function classifyByTags({
  inputRoot,
  inputPaths,
  destRoot,
  parseFile = defaultParseFile,
  discovery = discoverAudioFiles,
  aliasTable,
  catalog,
  online = true,
  lastfmClient = null,
  discogsClient = null,
  onProgress = (message) => console.log(message),
  concurrency = 4,
  timeoutMs = 8000,
  learnedCatalogPath = path.join(getDataDir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")), "genre-catalog-learned.json"),
} = {}) {
  const inputs = inputPaths?.length
    ? inputPaths.map((value) => path.resolve(value))
    : [path.resolve(inputRoot || "")];
  if (
    !inputs.length ||
    inputs.some((input) => !path.isAbsolute(input) || !fs.existsSync(input))
  )
    throw new Error("Se requiere una ruta de entrada absoluta y existente");
  const destinationRoot = destRoot ? path.resolve(destRoot) : null;
  if (destinationRoot && !path.isAbsolute(destinationRoot))
    throw new Error("destRoot debe ser una ruta absoluta");
  if (
    destinationRoot &&
    inputs.some((input) => fs.statSync(input).isDirectory())
  )
    validateClassificationRoots(
      inputs.find((input) => fs.statSync(input).isDirectory()),
      destinationRoot,
    );
  const aliases =
    aliasTable ?? JSON.parse(fs.readFileSync(aliasesPath, "utf8"));
  const lookup = buildGenreLookup(aliases);
  const genreCatalog =
    catalog ?? JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const files = [
    ...new Set(
      (
        await Promise.all(
          inputs.map(async (input) =>
            fs.statSync(input).isDirectory()
              ? (await discovery({ target: input, recursive: true })).files
              : [input],
          ),
        )
      ).flat(),
    ),
  ].filter((file) => !destinationRoot || !isWithin(file, destinationRoot));
  const results = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    onProgress(
      `[PROGRESS:${index + 1}/${files.length}] Processing: ${path.basename(file)}`,
    );
    const metadata = await parseFile(file, {
      duration: false,
      skipCovers: true,
    });
    const parsedName = parseArtistTitleFromFilename(path.basename(file));
    const artist = String(
      metadata?.common?.artist || parsedName.artist || "",
    ).trim();
    const title = String(
      metadata?.common?.title || parsedName.title || "",
    ).trim();
    const rawGenre = metadata?.common?.genre;
    const tagGenre = Array.isArray(rawGenre)
      ? (rawGenre[0] ?? null)
      : typeof rawGenre === "string"
        ? rawGenre
        : null;
    const resolution =
      tagGenre && !isJunkGenre(tagGenre)
        ? resolveGenre(tagGenre, { aliasTable: aliases, catalog: genreCatalog })
        : { genre: null, family: null };
    const genre = resolution.genre;
    const family = resolution.family;
    let status = genre ? "ok" : family ? "family" : "review";
    let reason = null;
    if (!tagGenre) {
      status = "review";
      reason = "missing-genre-tag";
    } else if (isJunkGenre(tagGenre)) {
      status = "review";
      reason = "junk-genre-tag";
    } else if (!genre && !family) {
      status = "review";
      reason = "unknown-genre-tag";
    }
    results.push({
      path: file,
      artist,
      title,
      tagGenre,
      genre,
      family,
      status,
      reason,
      genreSource: genre || family ? "tag" : null,
      onlineTag: null,
      destination:
        destinationRoot && (genre || family)
          ? path.join(destinationRoot, genre || family, path.basename(file))
          : null,
    });
  }
  if (online && (lastfmClient || discogsClient)) {
    const pending = results.filter(
      (row) =>
        row.status === "review" &&
        ["missing-genre-tag", "junk-genre-tag", "unknown-genre-tag"].includes(
          row.reason,
        ),
    );
    let cursor = 0;
    const workers = Array.from(
      { length: Math.min(Math.max(1, concurrency), pending.length) },
      async () => {
        while (cursor < pending.length) {
          const row = pending[cursor++];
          const index = cursor;
          onProgress(
            `[PROGRESS:${index}/${pending.length}] Processing: online · ${path.basename(row.path)}`,
          );
          const artist = row.artist;
          const title = row.title;
          if (!artist || !title) continue;
          const candidates = [];
          if (discogsClient)
            candidates.push(async () => {
              if (typeof discogsClient.getStyleResults === "function") {
                const groups = await discogsClient.getStyleResults(
                  artist,
                  title,
                );
                const genres =
                  typeof discogsClient.getGenreResults === "function"
                    ? (
                        await discogsClient.getGenreResults(artist, title)
                      ).flat()
                    : [];
                return {
                  source: "discogs",
                  tags: groups.flat(),
                  groups,
                  genres,
                };
              }
              return {
                source: "discogs",
                tags: await discogsClient.getTags(artist, title),
              };
            });
          if (lastfmClient)
            candidates.push(async () => ({
              source: "lastfm",
              tags: await lastfmClient.getTrackTags(artist, title),
            }));
          if (lastfmClient)
            candidates.push(async () => ({
              source: "lastfm",
              tags: await lastfmClient.getArtistTags(artist),
            }));
          for (const getCandidates of candidates) {
            try {
              const { source, tags, groups, genres } = await withTimeout(
                getCandidates(),
                timeoutMs,
              );
              if (source === "discogs") learnDiscogsStyles(tags, genres, genreCatalog, learnedCatalogPath);
              const learnedCatalog = loadLearnedCatalog(learnedCatalogPath);
              const match =
                chooseOnlineMatch(tags, source, lookup, groups, genreCatalog, learnedCatalog) ??
                (source === "discogs"
                  ? familyFromOnline(genres, genreCatalog, learnedCatalog)
                  : familyFromOnline(tags, genreCatalog, learnedCatalog));
              if (match) {
                row.genre = match.genre;
                row.family = match.family ?? row.family ?? null;
                row.status = match.genre ? "ok" : "family";
                row.genreSource = source;
                row.onlineTag = match.tag;
                row.destination = destinationRoot
                  ? path.join(
                      destinationRoot,
                      match.genre || match.family,
                      path.basename(row.path),
                    )
                  : null;
                break;
              }
            } catch {
              /* Online errors and timeouts leave this candidate unresolved. */
            }
          }
        }
      },
    );
    await Promise.all(workers);
  }
  console.log(JSON.stringify(results, null, 2));
  return results;
}

function familyFromOnline(tags, catalog, learnedCatalog) {
  for (const tag of Array.isArray(tags) ? tags : []) {
    const resolved = resolveGenre(tag, { catalog, aliasTable: {}, learnedCatalog });
    if (resolved.family) return { ...resolved, tag };
  }
  return null;
}

function chooseOnlineMatch(tags, source, lookup, groups, catalog, learnedCatalog) {
  const mapped = (Array.isArray(tags) ? tags : [])
    .filter((tag) => !GENERIC_ONLINE_TAGS.has(normalizeGenre(tag)))
    .map((tag) => ({
      tag,
      ...(lookup.has(normalizeGenre(tag))
        ? { genre: lookup.get(normalizeGenre(tag)), family: "Electronic" }
        : resolveGenre(tag, { catalog, aliasTable: {}, learnedCatalog })),
    }))
    .filter((item) => item.genre);
  if (source !== "discogs" || !mapped.some((item) => item.genre === "House")) {
    return mapped[0] ?? null;
  }

  const specific = mapped.filter((item) =>
    SPECIFIC_HOUSE_GENRES.has(item.genre),
  );
  if (!specific.length) return mapped.find((item) => item.genre === "House");
  if (!Array.isArray(groups)) {
    const counts = new Map();
    for (const item of specific)
      counts.set(item.genre, (counts.get(item.genre) ?? 0) + 1);
    return specific.reduce((best, item) =>
      counts.get(item.genre) > counts.get(best.genre) ? item : best,
    );
  }
  const counts = new Map();
  for (const group of groups) {
    const present = new Set(
      (Array.isArray(group) ? group : [])
        .map((tag) => lookup.get(normalizeGenre(tag)))
        .filter((genre) => SPECIFIC_HOUSE_GENRES.has(genre)),
    );
    for (const genre of present)
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return specific.reduce((best, item) =>
    counts.get(item.genre) > counts.get(best.genre) ? item : best,
  );
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("Online lookup timeout")),
        timeoutMs,
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

export function validateClassificationRoots(inputRoot, destRoot) {
  for (const [label, value] of [
    ["inputRoot", inputRoot],
    ["destRoot", destRoot],
  ]) {
    if (!path.isAbsolute(value))
      throw new Error(`${label} debe ser una ruta absoluta`);
  }
  if (!fs.existsSync(inputRoot) || !fs.statSync(inputRoot).isDirectory())
    throw new Error("inputRoot debe existir y ser una carpeta");
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative))
  );
}
