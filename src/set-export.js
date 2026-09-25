import fs from "node:fs";
import path from "node:path";
import { assertSafeRoot, atomicWrite } from "./set-playlists.js";

const GROUPS = ["warmup", "peak", "closing", "review"];
const LABELS = { warmup: "Warmup", peak: "Peak", closing: "Closing", review: "Por revisar" };

function cleanText(value) {
  return typeof value === "string" ? value.replace(/[\r\n]/g, " ").trim() : "";
}

export function exportSetResults({ outputDir, baseName, groups, overwrite = false }) {
  if (typeof outputDir !== "string" || !path.isAbsolute(outputDir)) throw new Error("outputDir debe ser una ruta absoluta");
  let root = path.resolve(outputDir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) throw new Error("outputDir debe ser una carpeta existente");
  root = fs.realpathSync(root);
  assertSafeRoot(root);
  if (typeof baseName !== "string" || !baseName.trim() || /[\/\\:]|\.\./.test(baseName)) throw new Error("baseName inválido");
  baseName = baseName.trim();
  if (!groups || typeof groups !== "object" || Array.isArray(groups)) throw new Error("groups inválido");
  const files = [];
  for (const group of GROUPS) {
    const tracks = groups[group] ?? [];
    if (!Array.isArray(tracks)) throw new Error(`${group} debe ser una lista`);
    if (!tracks.length) continue;
    const filename = `${baseName} - ${LABELS[group]}.m3u8`;
    const destination = path.join(root, filename);
    const lines = ["#EXTM3U"];
    for (const track of tracks) {
      if (!track || typeof track.path !== "string" || !path.isAbsolute(track.path)) throw new Error("Cada pista debe tener una ruta absoluta");
      const file = path.resolve(track.path);
      if (!fs.existsSync(file)) throw new Error(`La pista no existe: ${track.path}`);
      const duration = Number.isFinite(track.duration) ? Math.round(track.duration) : -1;
      const artist = cleanText(track.artist);
      const title = cleanText(track.title);
      const display = artist || title ? `${artist}${artist && title ? " - " : ""}${title}` : path.basename(file, path.extname(file));
      lines.push(`#EXTINF:${duration},${display}`, file);
    }
    files.push({ destination, contents: `${lines.join("\n")}\n` });
  }
  const existing = files.filter(({ destination }) => fs.existsSync(destination)).map(({ destination }) => path.basename(destination));
  if (existing.length && overwrite !== true) return { conflict: true, existing };
  for (const { destination, contents } of files) atomicWrite(destination, contents);
  return { conflict: false, written: files.map(({ destination }) => destination) };
}
