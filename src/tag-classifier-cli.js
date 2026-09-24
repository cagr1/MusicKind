#!/usr/bin/env node
import { classifyByTags } from "./tag-classifier.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JsonCache } from "./cache.js";
import { LastFmClient } from "./lastfm.js";
import { SpotifyClient } from "./spotify.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = path.join(projectRoot, "config", "settings.json");
const settings = fs.existsSync(settingsPath) ? JSON.parse(fs.readFileSync(settingsPath, "utf8")) : {};
const cache = new JsonCache(path.join(projectRoot, ".cache", "api-cache.json"));
const lastfmApiKey = process.env.LASTFM_API_KEY || settings.lastfmApiKey;
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID || settings.spotifyClientId;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET || settings.spotifyClientSecret;
const lastfmClient = lastfmApiKey ? new LastFmClient({ apiKey: lastfmApiKey, cache }) : null;
const spotifyClient = spotifyClientId && spotifyClientSecret
  ? new SpotifyClient({ clientId: spotifyClientId, clientSecret: spotifyClientSecret, cache })
  : null;
if (lastfmClient) lastfmClient.timeoutMs = 8000;
if (spotifyClient) spotifyClient.timeoutMs = 8000;

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

try {
  await classifyByTags({
    inputRoot: arg("--input-root"),
    excludeRoots: process.argv.flatMap((value, index) => value === "--exclude-root" && process.argv[index + 1] ? [process.argv[index + 1]] : []),
    destRoot: arg("--dest-root"),
    online: !process.argv.includes("--no-online"),
    lastfmClient,
    spotifyClient,
  });
  if (lastfmClient || spotifyClient) {
    fs.mkdirSync(path.dirname(cache.filePath), { recursive: true });
    cache.save();
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
