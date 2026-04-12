import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";

const inputDir = process.argv[2] || "data/dj_tracks";
const outPath = process.argv[3] || "data/tracks.csv";
const limit = 20;

const exts = new Set([".aiff", ".aif", ".mp3", ".wav", ".flac", ".m4a"]);

async function listFiles(dir) {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const nested = await listFiles(full);
      files.push(...nested);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (exts.has(ext)) files.push(full);
    }
  }
  return files;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes("\"") || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/\"/g, '""')}"`;
  }
  return s;
}

async function main() {
  const exists = fs.existsSync(inputDir);
  if (!exists) {
    await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
    await fs.promises.writeFile(outPath, "track_id,path,bpm,key\n", "utf8");
    process.exit(0);
  }

  const files = (await listFiles(inputDir)).sort();
  const selected = files.slice(0, limit);

  const rows = [];
  rows.push("track_id,path,bpm,key");

  let idx = 1;
  for (const filePath of selected) {
    let bpm = "";
    let key = "";
    try {
      const meta = await parseFile(filePath, { duration: false });
      const common = meta.common || {};
      const bpmVal = common.bpm ?? common.tempo ?? "";
      const keyVal = common.key ?? common.initialKey ?? common.keySignature ?? "";
      if (bpmVal !== "" && bpmVal != null) bpm = Number(bpmVal).toFixed(1);
      if (keyVal) key = String(keyVal);
    } catch {
      // leave empty
    }
    const trackId = `t${String(idx).padStart(3, "0")}`;
    rows.push([trackId, csvEscape(filePath), bpm, csvEscape(key)].join(","));
    idx += 1;
  }

  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, rows.join("\n") + "\n", "utf8");
}

main();
