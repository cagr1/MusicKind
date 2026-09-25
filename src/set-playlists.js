import fs from "node:fs";
import path from "node:path";
import { parseFile } from "music-metadata";
import { discoverAudioFiles } from "./services/audio-discovery.js";

const SECTION_NAMES = ["warmup", "peak", "closing"];
const PLAYLIST_FILES = { warmup: "Warmup.m3u8", peak: "Peak.m3u8", closing: "Closing.m3u8" };

function within(candidate, root) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function assertSafeRoot(root) {
  const parts = path.resolve(root).split(path.sep).filter(Boolean);
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i].toLocaleLowerCase() === "music backup" && parts[i + 1] === "2026") {
      throw new Error("No se permiten playlists dentro de MUSIC BACKUP/2026");
    }
  }
}

function validateSections(root, sections) {
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) throw new Error("sections inválido");
  const folders = new Set(fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name));
  for (const section of SECTION_NAMES) {
    if (!Array.isArray(sections[section])) throw new Error(`${section} debe ser una lista de géneros`);
    for (const genre of sections[section]) {
      if (typeof genre !== "string" || genre === ".." || /[\\/]/.test(genre) || !folders.has(genre)) {
        throw new Error(`Género inexistente o inválido: ${String(genre)}`);
      }
    }
  }
}

export function listSetPlaylistGenres(root) {
  if (typeof root !== "string" || !path.isAbsolute(root) || !fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("root debe ser una carpeta existente y absoluta");
  root = fs.realpathSync(root);
  assertSafeRoot(root);
  return {
    genres: fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort((a, b) => a.localeCompare(b)),
    existing: Object.values(PLAYLIST_FILES).filter((name) => fs.existsSync(path.join(root, name))),
  };
}

function trackSort(a, b) {
  if (a.bpmSort == null && b.bpmSort != null) return 1;
  if (a.bpmSort != null && b.bpmSort == null) return -1;
  if (a.bpmSort != null && b.bpmSort != null && a.bpmSort !== b.bpmSort) return a.bpmSort - b.bpmSort;
  return a.artist.localeCompare(b.artist, undefined, { sensitivity: "base" }) || a.path.localeCompare(b.path);
}

function normalizeBpm(bpm) {
  if (!Number.isFinite(bpm) || bpm <= 0) return null;
  let normalized = bpm;
  while (normalized < 85) normalized *= 2;
  while (normalized >= 175) normalized /= 2;
  return normalized;
}

function formatPlaylist(root, tracks) {
  const lines = ["#EXTM3U"];
  for (const track of tracks) {
    const seconds = Number.isFinite(track.duration) ? Math.round(track.duration) : -1;
    const artist = track.artist.replace(/[\r\n]/g, " ");
    const title = track.title.replace(/[\r\n]/g, " ");
    lines.push(`#EXTINF:${seconds},${artist} - ${title}`);
    lines.push(path.relative(root, track.path).split(path.sep).join("/"));
  }
  return `${lines.join("\n")}\n`;
}

function atomicWrite(file, contents) {
  const temporary = `${file}.${process.pid}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  try {
    fs.writeFileSync(temporary, contents, { encoding: "utf8", flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export async function createSetPlaylists({ root, sections, dryRun = true, discover = discoverAudioFiles, readMetadata = parseFile }) {
  if (typeof root !== "string" || !path.isAbsolute(root)) throw new Error("root debe ser una ruta absoluta");
  let resolvedRoot = path.resolve(root);
  if (!fs.existsSync(resolvedRoot) || !fs.statSync(resolvedRoot).isDirectory()) throw new Error("root debe ser una carpeta existente");
  resolvedRoot = fs.realpathSync(resolvedRoot);
  assertSafeRoot(resolvedRoot);
  validateSections(resolvedRoot, sections);
  if (typeof dryRun !== "boolean") throw new Error("dryRun debe ser booleano");

  const results = {};
  const written = [];
  for (const section of SECTION_NAMES) {
    const files = new Set();
    for (const genre of [...new Set(sections[section])]) {
      const found = await discover({ target: path.join(resolvedRoot, genre), recursive: true });
      if (!found.ok) throw new Error(found.errors?.[0]?.message || `No se pudo leer ${genre}`);
      for (const file of found.files) files.add(path.resolve(file));
    }
    const tracks = [];
    const skipped = [];
    for (const file of files) {
      let metadata;
      try {
        metadata = await readMetadata(file, { duration: true });
      } catch (error) {
        skipped.push({ path: file, reason: error instanceof Error ? error.message : String(error) });
        continue;
      }
      if (!Number.isFinite(metadata?.format?.duration) || metadata.format.duration <= 0) {
        skipped.push({ path: file, reason: "Duración ilegible o inválida" });
        continue;
      }
      const common = metadata.common ?? {};
      const bpm = Number(common.bpm ?? metadata.format?.bpm);
      const validBpm = Number.isFinite(bpm) && bpm > 0 ? bpm : null;
      tracks.push({ path: file, artist: String(common.artist || "Desconocido"), title: String(common.title || path.basename(file, path.extname(file))), bpm: validBpm, bpmSort: normalizeBpm(validBpm), duration: metadata.format.duration });
    }
    tracks.sort(trackSort);
    const bpms = tracks.map((track) => track.bpmSort).filter((bpm) => bpm != null);
    results[section] = {
      count: tracks.length,
      skipped,
      skippedCount: skipped.length,
      bpmMin: bpms.length ? Math.min(...bpms) : null,
      bpmMax: bpms.length ? Math.max(...bpms) : null,
      durationSec: tracks.reduce((total, track) => total + (Number.isFinite(track.duration) ? track.duration : 0), 0),
      tracks: tracks.map(({ path: file, artist, title, bpm, bpmSort }) => ({ path: file, artist, title, bpm, bpmSort })),
    };
    if (!dryRun && tracks.length) {
      const output = path.resolve(resolvedRoot, PLAYLIST_FILES[section]);
      if (!within(output, resolvedRoot)) throw new Error("Ruta de playlist fuera de root");
      atomicWrite(output, formatPlaylist(resolvedRoot, tracks));
      written.push(output);
    }
  }
  return dryRun ? { ok: true, sections: results } : { ok: true, sections: results, written };
}
