import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile as defaultParseFile } from "music-metadata";
import { discoverAudioFiles } from "./services/audio-discovery.js";
import { parseArtistTitleFromFilename } from "./utils.js";

const aliasesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/genre-aliases.json");
const GENERIC_ONLINE_TAGS = new Set([
  "electronic", "electronica", "dance", "pop", "electro", "edm", "club", "electronic dance music",
].map(normalizeGenre));
const SPECIFIC_HOUSE_GENRES = new Set([
  "Deep House", "Tech House", "Afro House", "Progressive House", "Organic House",
  "Melodic House & Techno", "Minimal Deep Tech",
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

export function isJunkGenre(value) {
  return /(?:https?:\/\/|www\.|\.com\b)/i.test(String(value ?? ""));
}

export async function classifyByTags({ inputRoot, destRoot, parseFile = defaultParseFile, discovery = discoverAudioFiles, aliasTable, online = true, lastfmClient = null, discogsClient = null, onProgress = (message) => console.log(message), concurrency = 4, timeoutMs = 8000 } = {}) {
  const input = path.resolve(inputRoot || "");
  const destinationRoot = path.resolve(destRoot || "");
  validateClassificationRoots(input, destinationRoot);
  const aliases = aliasTable ?? JSON.parse(fs.readFileSync(aliasesPath, "utf8"));
  const lookup = buildGenreLookup(aliases);
  const scan = await discovery({ target: input, recursive: true });
  const files = scan.files.filter((file) => !isWithin(file, destinationRoot));
  const results = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    onProgress(`[PROGRESS:${index + 1}/${files.length}] Processing: ${path.basename(file)}`);
    const metadata = await parseFile(file, { duration: false, skipCovers: true });
    const parsedName = parseArtistTitleFromFilename(path.basename(file));
    const artist = String(metadata?.common?.artist || parsedName.artist || "").trim();
    const title = String(metadata?.common?.title || parsedName.title || "").trim();
    const rawGenre = metadata?.common?.genre;
    const tagGenre = Array.isArray(rawGenre) ? rawGenre[0] ?? null : (typeof rawGenre === "string" ? rawGenre : null);
    const genre = tagGenre && !isJunkGenre(tagGenre) ? lookup.get(normalizeGenre(tagGenre)) ?? null : null;
    let status = "ok";
    let reason = null;
    if (!tagGenre) { status = "review"; reason = "missing-genre-tag"; }
    else if (isJunkGenre(tagGenre)) { status = "review"; reason = "junk-genre-tag"; }
    else if (!genre) { status = "review"; reason = "unknown-genre-tag"; }
    results.push({ path: file, artist, title, tagGenre, genre, status, reason, genreSource: genre ? "tag" : null, onlineTag: null, destination: genre ? path.join(destinationRoot, genre, path.basename(file)) : null });
  }
  if (online && (lastfmClient || discogsClient)) {
    const pending = results.filter((row) => row.status === "review" && ["missing-genre-tag", "junk-genre-tag", "unknown-genre-tag"].includes(row.reason));
    let cursor = 0;
    const workers = Array.from({ length: Math.min(Math.max(1, concurrency), pending.length) }, async () => {
      while (cursor < pending.length) {
        const row = pending[cursor++];
        const index = cursor;
        onProgress(`[PROGRESS:${index}/${pending.length}] Processing: online · ${path.basename(row.path)}`);
        const artist = row.artist;
        const title = row.title;
        if (!artist || !title) continue;
        const candidates = [];
        if (discogsClient) candidates.push(async () => {
          if (typeof discogsClient.getStyleResults === "function") {
            const groups = await discogsClient.getStyleResults(artist, title);
            return { source: "discogs", tags: groups.flat(), groups };
          }
          return { source: "discogs", tags: await discogsClient.getTags(artist, title) };
        });
        if (lastfmClient) candidates.push(async () => ({ source: "lastfm", tags: await lastfmClient.getTrackTags(artist, title) }));
        if (lastfmClient) candidates.push(async () => ({ source: "lastfm", tags: await lastfmClient.getArtistTags(artist) }));
        for (const getCandidates of candidates) {
          try {
            const { source, tags, groups } = await withTimeout(getCandidates(), timeoutMs);
            const match = chooseOnlineMatch(tags, source, lookup, groups);
            if (match) {
              row.genre = match.genre;
              row.status = "ok";
              row.genreSource = source;
              row.onlineTag = match.tag;
              row.destination = path.join(destinationRoot, match.genre, path.basename(row.path));
              break;
            }
          } catch { /* Online errors and timeouts leave this candidate unresolved. */ }
        }
      }
    });
    await Promise.all(workers);
  }
  console.log(JSON.stringify(results, null, 2));
  return results;
}

function chooseOnlineMatch(tags, source, lookup, groups) {
  const mapped = (Array.isArray(tags) ? tags : [])
    .filter((tag) => !GENERIC_ONLINE_TAGS.has(normalizeGenre(tag)))
    .map((tag) => ({ tag, genre: lookup.get(normalizeGenre(tag)) }))
    .filter((item) => item.genre);
  if (source !== "discogs" || !mapped.some((item) => item.genre === "House")) {
    return mapped[0] ?? null;
  }

  const specific = mapped.filter((item) => SPECIFIC_HOUSE_GENRES.has(item.genre));
  if (!specific.length) return mapped.find((item) => item.genre === "House");
  if (!Array.isArray(groups)) {
    const counts = new Map();
    for (const item of specific) counts.set(item.genre, (counts.get(item.genre) ?? 0) + 1);
    return specific.reduce((best, item) => counts.get(item.genre) > counts.get(best.genre) ? item : best);
  }
  const counts = new Map();
  for (const group of groups) {
    const present = new Set((Array.isArray(group) ? group : [])
      .map((tag) => lookup.get(normalizeGenre(tag)))
      .filter((genre) => SPECIFIC_HOUSE_GENRES.has(genre)));
    for (const genre of present) counts.set(genre, (counts.get(genre) ?? 0) + 1);
  }
  return specific.reduce((best, item) => counts.get(item.genre) > counts.get(best.genre) ? item : best);
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Online lookup timeout")), timeoutMs); })])
    .finally(() => clearTimeout(timer));
}

export function validateClassificationRoots(inputRoot, destRoot) {
  for (const [label, value] of [["inputRoot", inputRoot], ["destRoot", destRoot]]) {
    if (!path.isAbsolute(value)) throw new Error(`${label} debe ser una ruta absoluta`);
  }
  if (!fs.existsSync(inputRoot) || !fs.statSync(inputRoot).isDirectory()) throw new Error("inputRoot debe existir y ser una carpeta");
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
