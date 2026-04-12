import fs from "fs";
import path from "path";
import { normalizeTag } from "./utils.js";

export function loadOverrides() {
  const filePath = path.resolve("config/overrides.json");
  if (!fs.existsSync(filePath)) {
    return { artists: {}, labels: {}, keywords: {} };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(raw);
    return {
      artists: data.artists ?? {},
      labels: data.labels ?? {},
      keywords: data.keywords ?? {}
    };
  } catch {
    return { artists: {}, labels: {}, keywords: {} };
  }
}

export function classifyFromOverrides({ artist, title, filename }, overrides) {
  const artistNorm = normalizeTag(artist || "");
  const titleNorm = normalizeTag(title || "");
  const fileNorm = normalizeTag(filename || "");

  for (const [key, genre] of Object.entries(overrides.artists)) {
    const k = normalizeTag(key);
    if (artistNorm === k || artistNorm.includes(k)) {
      return { genre, reason: `override:artist:${key}` };
    }
  }

  for (const [key, genre] of Object.entries(overrides.labels)) {
    const k = normalizeTag(key);
    if (fileNorm.includes(k) || titleNorm.includes(k)) {
      return { genre, reason: `override:label:${key}` };
    }
  }

  for (const [key, genre] of Object.entries(overrides.keywords)) {
    const k = normalizeTag(key);
    if (titleNorm.includes(k) || fileNorm.includes(k)) {
      return { genre, reason: `override:keyword:${key}` };
    }
  }

  return null;
}
