#!/usr/bin/env node
import { classifyByTags } from "./tag-classifier.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonCache } from "./cache.js";
import { LastFmClient } from "./providers/lastfm.js";
import { DiscogsClient } from "./providers/discogs.js";
import { loadAppKeys } from "./providers/app-keys.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = path.join(projectRoot, "config", "settings.json");
const online = !process.argv.includes("--no-online");
const settings = online && fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : {};
const cache = new JsonCache(path.join(projectRoot, ".cache", "api-cache.json"));
const keys = online ? loadAppKeys({ settings }) : {};
const lastfmClient = keys.lastfmApiKey ? new LastFmClient({ apiKey: keys.lastfmApiKey, cache }) : null;
const discogsClient = keys.discogsKey && keys.discogsSecret ? new DiscogsClient({ key: keys.discogsKey, secret: keys.discogsSecret, cache }) : null;
if (lastfmClient) lastfmClient.timeoutMs = 8000;


function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

try {
  await classifyByTags({
    inputRoot: arg("--input-root"),
    destRoot: arg("--dest-root"),
    online,
    lastfmClient,
    discogsClient,
  });
  if (lastfmClient || discogsClient) {
    fs.mkdirSync(path.dirname(cache.filePath), { recursive: true });
    cache.save();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
