#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";
import dotenv from "dotenv";
import { JsonCache } from "./cache.js";
import { SpotifyClient } from "./spotify.js";
import { LastFmClient } from "./lastfm.js";
import { classifyFromTags, classifyFromAudio } from "./classify.js";
import { cleanTitle, ensureDir, moveFile, writeCsv, appendLog, parseArtistTitleFromFilename } from "./utils.js";
import { loadOverrides, classifyFromOverrides } from "./overrides.js";
import { discoverAudioFiles } from "./services/audio-discovery.js";

const args = parseArgs(process.argv.slice(2));

if (args.help || !args.input) {
  printHelp();
  process.exit(args.help ? 0 : 1);
}

loadEnvFiles();

const inputDir = path.resolve(args.input);
const dryRun = Boolean(args["dry-run"]);
const limit = args.limit ? Number(args.limit) : null;
const debug = Boolean(args.debug);
const skipSpotify = Boolean(args["no-spotify"]);
const spotifyTrackTimeoutMs = Number(process.env.SPOTIFY_TRACK_TIMEOUT_MS ?? process.env.SPOTIFY_TIMEOUT_MS ?? "8000");
const reportPath = args.report ? path.resolve(args.report) : path.join(inputDir, "report.csv");
const logPath = args.log ? path.resolve(args.log) : path.join(inputDir, "unmatched.log");
let audioFeaturesEnabled = true;

// Load settings from config file (fallback if env vars not set)
const settings = loadSettings();
const spotifyClientId = process.env.SPOTIFY_CLIENT_ID || settings.spotifyClientId;
const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET || settings.spotifyClientSecret;
const lastfmApiKey = process.env.LASTFM_API_KEY || settings.lastfmApiKey;

if (!skipSpotify && (!spotifyClientId || !spotifyClientSecret)) {
  console.error("Missing API keys. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET or use --no-spotify.");
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Input folder not found: ${inputDir}`);
  process.exit(1);
}

const cache = new JsonCache(path.resolve(".cache/api-cache.json"));
const spotify = skipSpotify ? null : new SpotifyClient({ clientId: spotifyClientId, clientSecret: spotifyClientSecret, cache });
const lastfm = lastfmApiKey ? new LastFmClient({ apiKey: lastfmApiKey, cache }) : null;
const overrides = loadOverrides();
if (skipSpotify) {
  audioFeaturesEnabled = false;
  if (debug) console.log("DEBUG spotify: disabled via --no-spotify");
}

const allowedGenres = loadAllowedGenres();
const genreFolders = new Set([...allowedGenres, "Unsorted"]);

const discovery = await discoverAudioFiles({ target: inputDir, recursive: true });
if (!discovery.ok && discovery.files.length === 0) {
  const firstError = discovery.errors[0];
  const message = firstError?.message || "No se pudo descubrir archivos de audio";
  console.error(message);
  process.exit(1);
}

let files = discovery.files.filter((filePath) => !isAlreadySorted(filePath, genreFolders, inputDir));
if (Number.isFinite(limit) && limit > 0) {
  files = files.slice(0, limit);
}
if (files.length === 0) {
  console.log("No audio files found.");
  process.exit(0);
}

// Show total count for progress tracking
console.log(`[PROGRESS:0/${files.length}] Starting classification of ${files.length} files...`);

const reportRows = [];
let processedCount = 0;

for (const filePath of files) {
  const relative = path.relative(inputDir, filePath);
  processedCount++;
  
  // Show current file being processed
  console.log(`[PROGRESS:${processedCount}/${files.length}] Processing: ${relative}`);
  
  try {
    const metadata = await parseFile(filePath);
    const rawArtist = metadata.common.artist || metadata.common.albumartist || "";
    const rawTitle = metadata.common.title || "";
    const filenameBase = path.basename(filePath);
    const fromFilename = parseArtistTitleFromFilename(filenameBase);
    const artist = rawArtist || fromFilename.artist || "";
    const title = rawTitle || fromFilename.title || path.basename(filePath, path.extname(filePath));
    const clean = cleanTitle(title);
    const cleanArtist = cleanTitle(artist);

    if (debug) {
      console.log(`DEBUG meta: ${relative}`);
      console.log(`  rawArtist="${rawArtist}" rawTitle="${rawTitle}"`);
      console.log(`  fromFile artist="${fromFilename.artist}" title="${fromFilename.title}"`);
      console.log(`  used artist="${artist}" title="${title}"`);
      console.log(`  clean artist="${cleanArtist}" title="${clean}"`);
    }

    if (!cleanArtist || !clean) {
      handleUnmatched({ inputDir, filePath, relative, artist, title, clean, reportRows, logPath, dryRun });
      continue;
    }

    const overrideClassification = classifyFromOverrides(
      { artist: cleanArtist, title: clean, filename: path.basename(filePath) },
      overrides
    );
    if (overrideClassification) {
      const genre = allowedGenres.has(overrideClassification.genre) ? overrideClassification.genre : "Unsorted";
      const finalDir = path.join(inputDir, genre);
      ensureDir(finalDir, dryRun);
      const destPath = path.join(finalDir, path.basename(filePath));
      if (!dryRun) {
        if (fs.existsSync(destPath)) {
          const unique = uniquePath(finalDir, path.basename(filePath));
          moveFile(filePath, unique, dryRun);
        } else {
          moveFile(filePath, destPath, dryRun);
        }
      }
      reportRows.push({
        file: relative,
        artist,
        title,
        cleanTitle: clean,
        genre,
        reason: genre === "Unsorted" ? "filtered:disabled-genre" : overrideClassification.reason
      });
      console.log(`${relative} -> ${genre}`);
      continue;
    }

    // Check embedded ID3/Vorbis genre tag before calling any API
    const embeddedGenres = Array.isArray(metadata.common.genre)
      ? metadata.common.genre
      : metadata.common.genre
      ? [metadata.common.genre]
      : [];

    if (embeddedGenres.length > 0) {
      const id3Classification = classifyFromTags(embeddedGenres);
      if (id3Classification && allowedGenres.has(id3Classification.genre)) {
        const genre = id3Classification.genre;
        const finalDir = path.join(inputDir, genre);
        ensureDir(finalDir, dryRun);
        const destPath = path.join(finalDir, path.basename(filePath));
        if (!dryRun) {
          if (fs.existsSync(destPath)) {
            const unique = uniquePath(finalDir, path.basename(filePath));
            moveFile(filePath, unique, dryRun);
          } else {
            moveFile(filePath, destPath, dryRun);
          }
        }
        reportRows.push({
          file: relative,
          artist,
          title,
          cleanTitle: clean,
          genre,
          reason: `id3:${embeddedGenres[0]}`
        });
        console.log(`${relative} -> ${genre} [id3]`);
        continue;
      }
    }

    const trackTagsPromise = lastfm ? lastfm.getTrackTags(artist, clean).catch(() => []) : Promise.resolve([]);
    const artistTagsPromise = lastfm ? lastfm.getArtistTags(artist).catch(() => []) : Promise.resolve([]);

    let track;
    let classification;
    let spotifyGenres = [];
    let audioFeatures = null;
    try {
      if (spotify) {
        if (debug) console.log("  spotify: searching track...");
        track = await withTimeout(spotify.searchTrack(cleanArtist, clean), spotifyTrackTimeoutMs);
        if (debug) console.log(`  search: artist="${cleanArtist}" title="${clean}" -> ${track ? "hit" : "miss"}`);
        if (!track && clean !== title) {
          track = await withTimeout(spotify.searchTrack(cleanArtist, title), spotifyTrackTimeoutMs);
          if (debug) console.log(`  search: artist="${cleanArtist}" title="${title}" -> ${track ? "hit" : "miss"}`);
        }
        if (!track && cleanArtist !== artist) {
          track = await withTimeout(spotify.searchTrack(artist, clean), spotifyTrackTimeoutMs);
          if (debug) console.log(`  search: artist="${artist}" title="${clean}" -> ${track ? "hit" : "miss"}`);
        }
        if (!track) {
          const loose = await withTimeout(spotify.searchTrack("", clean), spotifyTrackTimeoutMs);
          track = loose;
          if (debug) console.log(`  search: artist="" title="${clean}" -> ${track ? "hit" : "miss"}`);
        }
        if (!track) {
          if (debug) console.log("  spotify: no track found");
          track = null;
        }

        if (track && debug) {
          const trackArtistNames = track.artists?.map((a) => a.name).join(", ");
          console.log(`  spotify track: id=${track.id} name="${track.name}" artists="${trackArtistNames}"`);
        }

        if (track) {
          const audioFeaturesPromise = audioFeaturesEnabled
            ? withTimeout(spotify.getAudioFeatures(track.id), spotifyTrackTimeoutMs).catch((err) => {
                if (debug) {
                  console.log(`  audio error: ${err.message}`);
                }
                if (err.message.includes("403")) {
                  audioFeaturesEnabled = false;
                  if (debug) console.log("  audio features disabled due to 403");
                }
                return null;
              })
            : Promise.resolve(null);

          const artistId = track.artists?.[0]?.id;
          const spotifyArtist = await (artistId
            ? withTimeout(spotify.getArtist(artistId), spotifyTrackTimeoutMs).catch(() => null)
            : Promise.resolve(null));
          spotifyGenres = spotifyArtist?.genres ?? [];
          audioFeatures = await audioFeaturesPromise;
        }
      }
    } catch (err) {
      console.error(`Spotify error for ${relative}: ${err.message}`);
    }

    const [trackTags, artistTags] = await Promise.all([trackTagsPromise, artistTagsPromise]);
    const tags = [...trackTags, ...artistTags, ...spotifyGenres];
    classification = classifyFromTags(tags);
    if (!classification) {
      classification = classifyFromAudio({
        tempo: audioFeatures?.tempo,
        energy: audioFeatures?.energy
      });
    }

    if (!classification) {
      handleUnmatched({ inputDir, filePath, relative, artist, title, clean, reportRows, logPath, dryRun });
      continue;
    }
    if (!allowedGenres.has(classification.genre)) {
      classification = { genre: "Unsorted", reason: "filtered:disabled-genre" };
    }

    if (debug) {
      if (spotifyGenres.length) {
        console.log(`  spotify genres: ${spotifyGenres.join(", ")}`);
      }
      console.log(`  audio: tempo=${audioFeatures?.tempo ?? "n/a"} energy=${audioFeatures?.energy ?? "n/a"}`);
      console.log(`  classification: ${classification ? classification.genre : "none"}`);
    }

    const destDir = path.join(inputDir, classification.genre);
    ensureDir(destDir, dryRun);
    const destPath = path.join(destDir, path.basename(filePath));
    if (!dryRun) {
      if (fs.existsSync(destPath)) {
        const unique = uniquePath(destDir, path.basename(filePath));
        moveFile(filePath, unique, dryRun);
      } else {
        moveFile(filePath, destPath, dryRun);
      }
    }

    reportRows.push({
      file: relative,
      artist,
      title,
      cleanTitle: clean,
      genre: classification.genre,
      reason: classification.reason
    });

    console.log(`${relative} -> ${classification.genre}`);
  } catch (error) {
    console.error(`Error processing ${relative}: ${error.message}`);
    appendLog(`${relative} | error: ${error.message}`, logPath, dryRun);
  } finally {
    cache.save();
  }
}

writeCsv(reportRows, reportPath, dryRun);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      out.help = true;
    } else if (arg === "--input" || arg === "-i") {
      out.input = argv[++i];
    } else if (arg === "--dry-run") {
      out["dry-run"] = true;
    } else if (arg === "--report") {
      out.report = argv[++i];
    } else if (arg === "--log") {
      out.log = argv[++i];
    } else if (arg === "--limit") {
      out.limit = argv[++i];
    } else if (arg === "--debug") {
      out.debug = true;
    } else if (arg === "--no-spotify") {
      out["no-spotify"] = true;
    }
  }
  return out;
}

function printHelp() {
  console.log(`\nMusicKind CLI\n\nUsage:\n  musickind --input <folder> [--dry-run] [--limit <n>] [--report <csv>] [--log <file>] [--debug] [--no-spotify]\n\nEnv:\n  SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET\n  LASTFM_API_KEY (opcional)\n`);
}

function loadEnvFiles() {
  const candidates = [".env.local", ".env"];
  for (const file of candidates) {
    const full = path.resolve(file);
    if (fs.existsSync(full)) {
      dotenv.config({ path: full, override: false });
    }
  }
}

function handleUnmatched({ inputDir, filePath, relative, artist, title, clean, reportRows, logPath, dryRun }) {
  const targetRoot = path.resolve(inputDir, "Unsorted");
  ensureDir(targetRoot, dryRun);
  const destPath = path.join(targetRoot, path.basename(filePath));
  if (!dryRun) {
    if (fs.existsSync(destPath)) {
      const unique = uniquePath(targetRoot, path.basename(filePath));
      moveFile(filePath, unique, dryRun);
    } else {
      moveFile(filePath, destPath, dryRun);
    }
  }

  reportRows.push({
    file: relative,
    artist,
    title,
    cleanTitle: clean,
    genre: "Unsorted",
    reason: "unmatched"
  });
  appendLog(`${relative} | ${artist} - ${title}`, logPath, dryRun);
  console.log(`${relative} -> Unsorted`);
}

function withTimeout(promise, ms) {
  if (!Number.isFinite(ms) || ms <= 0) return promise;
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]);
}

function isAlreadySorted(filePath, genreFolders, baseDir) {
  const relative = path.relative(baseDir, filePath);
  const parts = relative.split(path.sep);
  return parts.some((part) => genreFolders.has(part));
}

function loadAllowedGenres() {
  const defaultGenres = [
    "Afro House",
    "Tech House",
    "Deep House",
    "Latin House",
    "Minimal Deep Tech",
    "Progressive House",
    "Acapellas Instrumental",
    "Dance Pop",
    "Nu Disco",
    "House",
    "Melodic Techno",
    "Melodic House & Techno"
  ];
  const configPath = path.resolve("config/genres.json");
  if (!fs.existsSync(configPath)) {
    return new Set(defaultGenres);
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (!Array.isArray(parsed)) return new Set(defaultGenres);
    const cleaned = parsed
      .map((g) => (typeof g === "string" ? g.trim() : ""))
      .filter((g) => g.length > 0);
    if (!cleaned.length) return new Set(defaultGenres);
    return new Set(cleaned);
  } catch {
    return new Set(defaultGenres);
  }
}

function loadSettings() {
  const settingsPath = path.resolve("config/settings.json");
  const defaultSettings = {
    spotifyClientId: "",
    spotifyClientSecret: "",
    lastfmApiKey: ""
  };
  if (!fs.existsSync(settingsPath)) return defaultSettings;
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

function uniquePath(dir, filename) {
  const ext = path.extname(filename);
  const base = path.basename(filename, ext);
  let counter = 1;
  while (true) {
    const candidate = path.join(dir, `${base} (${counter})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
    counter++;
  }
}
