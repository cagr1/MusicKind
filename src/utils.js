import fs from "fs";
import path from "path";

export function normalizeTag(tag) {
  return tag
    .trim()
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function cleanTitle(title) {
  if (!title) return "";
  let t = title;
  t = t.replace(/\.[a-z0-9]{2,4}$/i, "");
  t = t.replace(/[_]+/g, " ");
  t = t.replace(/\s*-\s*\d{2,3}\s*kbps\b/gi, "");
  t = t.replace(/\s*\b(official|audio|video|lyrics|lyric|hq|hd)\b/gi, "");
  t = t.replace(/\s*\b(www\.[^\s]+|[^\s]+\.(com|net|org|info|ru|pro|co))\b/gi, "");
  t = t.replace(/\s*\b(promotional|promo|rip|ripped|cdq)\b/gi, "");
  t = t.replace(/\s*\b(mixed)\b/gi, "");
  t = t.replace(/\s*\b(original mix|extended mix|club mix|radio edit|original)\b/gi, "");
  t = t.replace(/\s*\([^)]*\b(remix|edit|mix|version|feat\.?|ft\.?|featuring)\b[^)]*\)/gi, "");
  t = t.replace(/\s*\[[^\]]*\b(remix|edit|mix|version|feat\.?|ft\.?|featuring)\b[^\]]*\]/gi, "");
  t = t.replace(/\s*-\s*(remix|edit|mix|version|feat\.?|ft\.?|featuring)\b.*$/gi, "");
  t = t.replace(/\s+feat\.?\s+.*$/gi, "");
  t = t.replace(/\s+ft\.?\s+.*$/gi, "");
  t = t.replace(/\(\s*\)/g, "");
  t = t.replace(/\[\s*\]/g, "");
  t = t.replace(/-+$/g, "");
  t = t.replace(/\s{2,}/g, " ");
  return t.trim();
}

export function parseArtistTitleFromFilename(filename) {
  const base = filename.replace(/\.[a-z0-9]{2,4}$/i, "");
  let cleaned = base.replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();

  cleaned = cleaned.replace(/^\d+\s*[-.]?\s*/g, "");
  cleaned = cleaned.replace(/\b(www\.[^\s]+|[^\s]+\.(com|net|org|info|ru|pro|co))\b/gi, "");
  cleaned = cleaned.replace(/\s*\([^)]*\)/g, (m) => (/\b(remix|edit|mix|version|feat|ft|featuring|original|extended|club|radio)\b/i.test(m) ? "" : m));
  cleaned = cleaned.replace(/\s*\[[^\]]*\]/g, (m) => (/\b(remix|edit|mix|version|feat|ft|featuring|original|extended|club|radio)\b/i.test(m) ? "" : m));
  cleaned = cleaned.replace(/\s*\b(mixed)\b/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  const sepMatch = cleaned.match(/^(.*?)\s*-\s*(.*)$/);
  if (sepMatch) {
    let artist = sepMatch[1].trim();
    let title = sepMatch[2].trim();
    if (/^\d+$/.test(artist) || artist.length <= 2) {
      const secondSplit = title.match(/^(.*?)\s*-\s*(.*)$/);
      if (secondSplit) {
        artist = secondSplit[1].trim();
        title = secondSplit[2].trim();
      }
    }
    title = title.replace(/-+$/g, "").trim();
    return { artist, title };
  }

  return { artist: "", title: cleaned };
}

export function ensureDir(dirPath, dryRun) {
  if (dryRun) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

export function moveFile(src, dest, dryRun) {
  if (dryRun) return;
  fs.renameSync(src, dest);
}

export function listAudioFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  const exts = new Set([".mp3", ".wav", ".aif", ".aiff"]);
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (exts.has(ext)) files.push(full);
      }
    }
  }
  return files;
}

export function listMp3Files(rootDir) {
  return listAudioFiles(rootDir);
}

export function writeCsv(rows, destPath, dryRun) {
  if (dryRun) return;
  const header = ["file","artist","title","clean_title","genre","reason"].join(",");
  const lines = rows.map((r) => [
    csvEscape(r.file),
    csvEscape(r.artist),
    csvEscape(r.title),
    csvEscape(r.cleanTitle),
    csvEscape(r.genre),
    csvEscape(r.reason)
  ].join(","));
  const content = [header, ...lines].join("\n");
  fs.writeFileSync(destPath, content, "utf8");
}

function csvEscape(value) {
  const v = (value ?? "").toString();
  if (/[",\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function appendLog(line, logPath, dryRun) {
  if (dryRun) return;
  fs.appendFileSync(logPath, line + "\n", "utf8");
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
