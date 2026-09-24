import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile as defaultParseFile } from "music-metadata";
import { discoverAudioFiles } from "./services/audio-discovery.js";
import { parseArtistTitleFromFilename } from "./utils.js";

const aliasesPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../config/genre-aliases.json");

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

export async function classifyByTags({ inputRoot, excludeRoots = [], destRoot, parseFile = defaultParseFile, discovery = discoverAudioFiles, aliasTable, online = true, lastfmClient = null, spotifyClient = null, onProgress = (message) => console.log(message), concurrency = 4, timeoutMs = 8000 } = {}) {
  const input = path.resolve(inputRoot || "");
  const excludes = excludeRoots.map((root) => path.resolve(root));
  const destinationRoot = path.resolve(destRoot || "");
  validateClassificationRoots(input, excludes, destinationRoot);
  const aliases = aliasTable ?? JSON.parse(fs.readFileSync(aliasesPath, "utf8"));
  const lookup = buildGenreLookup(aliases);
  const excludedFiles = new Map();
  const excludedNames = new Set();
  for (const root of excludes) {
    const scan = await discovery({ target: root, recursive: true });
    for (const file of scan.files) {
      const stat = fs.statSync(file);
      const key = `${path.basename(file).toLocaleLowerCase("en")}\0${stat.size}`;
      if (!excludedFiles.has(key)) excludedFiles.set(key, file);
      excludedNames.add(path.basename(file).toLocaleLowerCase("en"));
    }
  }
  const scan = await discovery({ target: input, recursive: true });
  const files = scan.files.filter((file) => !isWithin(file, destinationRoot) && !excludes.some((root) => isWithin(file, root)));
  const results = [];
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    onProgress(`[PROGRESS:${index + 1}/${files.length}] Processing: ${path.basename(file)}`);
    const stat = fs.statSync(file);
    const duplicateKey = `${path.basename(file).toLocaleLowerCase("en")}\0${stat.size}`;
    const duplicate = excludedFiles.has(duplicateKey);
    const metadata = await parseFile(file, { duration: false, skipCovers: true });
    const parsedName = parseArtistTitleFromFilename(path.basename(file));
    const artist = String(metadata?.common?.artist || parsedName.artist || "").trim();
    const title = String(metadata?.common?.title || parsedName.title || "").trim();
    const rawGenre = metadata?.common?.genre;
    const tagGenre = Array.isArray(rawGenre) ? rawGenre[0] ?? null : (typeof rawGenre === "string" ? rawGenre : null);
    const genre = tagGenre && !isJunkGenre(tagGenre) ? lookup.get(normalizeGenre(tagGenre)) ?? null : null;
    let status = "ok";
    let reason = null;
    if (duplicate) { status = "duplicate"; reason = "same-name-and-size-in-exclude-root"; }
    else if (!tagGenre) { status = "review"; reason = "missing-genre-tag"; }
    else if (isJunkGenre(tagGenre)) { status = "review"; reason = "junk-genre-tag"; }
    else if (!genre) { status = "review"; reason = "unknown-genre-tag"; }
    results.push({ path: file, artist, title, tagGenre, genre, status, reason, possibleDuplicate: excludedNames.has(path.basename(file).toLocaleLowerCase("en")), genreSource: genre ? "tag" : null, onlineTag: null, destination: genre ? path.join(destinationRoot, genre, path.basename(file)) : null });
  }
  if (online && (lastfmClient || spotifyClient)) {
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
        if (lastfmClient) candidates.push(async () => ({ source: "lastfm", tags: await lastfmClient.getTrackTags(artist, title) }));
        if (spotifyClient) candidates.push(async () => {
          const track = await spotifyClient.searchTrack(artist, title);
          const spotifyArtist = track?.artists?.[0];
          if (!spotifyArtist?.id) return { source: "spotify", tags: [] };
          const details = await spotifyClient.getArtist(spotifyArtist.id);
          return { source: "spotify", tags: details?.genres ?? [] };
        });
        if (lastfmClient) candidates.push(async () => ({ source: "lastfm", tags: await lastfmClient.getArtistTags(artist) }));
        for (const getCandidates of candidates) {
          try {
            const { source, tags } = await withTimeout(getCandidates(), timeoutMs);
            const match = (Array.isArray(tags) ? tags : []).map((tag) => ({ tag, genre: lookup.get(normalizeGenre(tag)) })).find((item) => item.genre);
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

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Online lookup timeout")), timeoutMs); })])
    .finally(() => clearTimeout(timer));
}

export function validateClassificationRoots(inputRoot, excludeRoots, destRoot) {
  for (const [label, value] of [["inputRoot", inputRoot], ["destRoot", destRoot], ...excludeRoots.map((root, i) => [`excludeRoots[${i}]`, root])]) {
    if (!path.isAbsolute(value)) throw new Error(`${label} debe ser una ruta absoluta`);
  }
  if (!fs.existsSync(inputRoot) || !fs.statSync(inputRoot).isDirectory()) throw new Error("inputRoot debe existir y ser una carpeta");
  for (const root of excludeRoots) if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error(`excludeRoot debe existir y ser una carpeta: ${root}`);
  if (excludeRoots.some((root) => isWithin(inputRoot, root)) || excludeRoots.some((root) => isWithin(destRoot, root))) {
    throw new Error("inputRoot o destRoot no pueden estar dentro de excludeRoots");
  }
  if (excludeRoots.some((root) => isWithin(root, destRoot))) throw new Error("excludeRoots no pueden estar dentro de destRoot");
}

function isWithin(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}
