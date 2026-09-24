import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseFile as defaultParseFile } from "music-metadata";
import { discoverAudioFiles } from "./services/audio-discovery.js";

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

export async function classifyByTags({ inputRoot, excludeRoots = [], destRoot, parseFile = defaultParseFile, discovery = discoverAudioFiles, aliasTable } = {}) {
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
    console.log(`[PROGRESS:${index + 1}/${files.length}] Processing: ${path.basename(file)}`);
    const stat = fs.statSync(file);
    const duplicateKey = `${path.basename(file).toLocaleLowerCase("en")}\0${stat.size}`;
    const duplicate = excludedFiles.has(duplicateKey);
    const metadata = await parseFile(file, { duration: false, skipCovers: true });
    const rawGenre = metadata?.common?.genre;
    const tagGenre = Array.isArray(rawGenre) ? rawGenre[0] ?? null : (typeof rawGenre === "string" ? rawGenre : null);
    const genre = tagGenre && !isJunkGenre(tagGenre) ? lookup.get(normalizeGenre(tagGenre)) ?? null : null;
    let status = "ok";
    let reason = null;
    if (duplicate) { status = "duplicate"; reason = "same-name-and-size-in-exclude-root"; }
    else if (!tagGenre) { status = "review"; reason = "missing-genre-tag"; }
    else if (isJunkGenre(tagGenre)) { status = "review"; reason = "junk-genre-tag"; }
    else if (!genre) { status = "review"; reason = "unknown-genre-tag"; }
    results.push({ path: file, tagGenre, genre, status, reason, possibleDuplicate: excludedNames.has(path.basename(file).toLocaleLowerCase("en")), destination: genre ? path.join(destinationRoot, genre, path.basename(file)) : null });
  }
  console.log(JSON.stringify(results, null, 2));
  return results;
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
