#!/usr/bin/env node
/**
 * Metadata Editor Module
 * Allows reading and writing audio file metadata
 * Includes Spotify/LastFM integration for auto-identification
 */

import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { getAudioExtensions, discoverAudioFiles } from "./services/audio-discovery.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const SUPPORTED_EXTENSIONS = new Set(getAudioExtensions());

/**
 * Read metadata from an audio file
 */
export async function readMetadata(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported file format: ${ext}`);
  }
  
  try {
    const metadata = await parseFile(filePath);
    const filename = path.basename(filePath);
    const { dir } = path.parse(filePath);
    
    return {
      ok: true,
      file: {
        path: filePath,
        name: filename,
        dir: dir,
        ext: ext
      },
      metadata: {
        title: metadata.common.title || "",
        artist: metadata.common.artist || "",
        album: metadata.common.album || "",
        year: metadata.common.year || null,
        genre: metadata.common.genre?.[0] || "",
        duration: metadata.format.duration || 0,
        bitrate: metadata.format.bitrate || 0,
        sampleRate: metadata.format.sampleRate || 0,
        track: metadata.common.track?.no || null,
        disc: metadata.common.disk?.no || null
      }
    };
  } catch (error) {
    throw new Error(`Failed to read metadata: ${error.message}`);
  }
}

/**
 * List audio files in a directory
 */
export async function listAudioFiles(dirPath, recursive = false) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const discovery = await discoverAudioFiles({
    target: dirPath,
    recursive
  });

  const structuralError = discovery.errors.find((error) =>
    error.code === "INVALID_INPUT" ||
    error.code === "TARGET_NOT_FOUND" ||
    error.code === "TARGET_NOT_ACCESSIBLE"
  );

  if (structuralError) {
    throw new Error(structuralError.message);
  }

  return discovery.files;
}

/**
 * Rename a file. newName may include or omit the extension — it will never be doubled.
 */
export function renameFile(oldPath, newName) {
  if (!fs.existsSync(oldPath)) {
    throw new Error(`File not found: ${oldPath}`);
  }
  if (!newName || !newName.trim()) {
    throw new Error(`Target filename cannot be empty`);
  }
  if (newName.includes("/") || newName.includes("\\")) {
    throw new Error(`Invalid filename: path separators are not allowed`);
  }

  const dir = path.dirname(oldPath);
  const ext = path.extname(oldPath).toLowerCase();

  // Avoid doubling the extension if newName already ends with it (case-insensitive)
  const newNameExt = path.extname(newName).toLowerCase();
  const finalName = newNameExt === ext ? newName : newName + ext;

  const newPath = path.join(dir, finalName);

  if (fs.existsSync(newPath) && path.resolve(oldPath) !== path.resolve(newPath)) {
    throw new Error(`Target file already exists: ${newPath}`);
  }

  fs.renameSync(oldPath, newPath);
  return newPath;
}

/**
 * Write metadata to a file using FFmpeg.
 * Resolves with { ok: true, newPath: string, metadataWritten: boolean }.
 * The file path does not change; newPath === filePath on success.
 */
export function writeMetadata(filePath, metadata) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      return reject(new Error(`File not found: ${filePath}`));
    }

    const args = ["-y", "-i", filePath];

    // Copy to temp file keeping the same extension so ffmpeg can detect the format
    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    const tempPath = base + ".__mk__" + ext;
    
    // Build FFmpeg metadata args
    if (metadata.title) args.push("-metadata", `title=${metadata.title}`);
    if (metadata.artist) args.push("-metadata", `artist=${metadata.artist}`);
    if (metadata.album) args.push("-metadata", `album=${metadata.album}`);
    if (metadata.year) args.push("-metadata", `year=${metadata.year}`);
    if (metadata.genre) args.push("-metadata", `genre=${metadata.genre}`);
    if (metadata.track) args.push("-metadata", `track=${metadata.track}`);
    
    // Output to temp file
    args.push("-codec", "copy", tempPath);
    
    const child = spawn("ffmpeg", args, { cwd: projectRoot });
    let stderr = "";
    
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });
    
    child.on("close", (code) => {
      if (code === 0) {
        // Replace original with temp
        fs.unlinkSync(filePath);
        fs.renameSync(tempPath, filePath);
        resolve({ ok: true, newPath: filePath, metadataWritten: true });
      } else {
        // Clean up temp if exists
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
        reject(new Error(stderr || `FFmpeg failed with code ${code}`));
      }
    });
    
    child.on("error", (err) => {
      reject(new Error(`Failed to run FFmpeg: ${err.message}`));
    });
  });
}

/**
 * Generate new filename from metadata
 */
export function generateFilename(metadata, format = "{artist} - {title}") {
  let filename = format
    .replace("{artist}", metadata.artist || "Unknown Artist")
    .replace("{title}", metadata.title || "Unknown Title")
    .replace("{album}", metadata.album || "")
    .replace("{year}", metadata.year || "")
    .replace("{track}", metadata.track ? String(metadata.track).padStart(2, "0") : "");
  
  // Clean invalid characters
  filename = filename.replace(/[/\\?%*:|"<>]/g, "-").trim();
  
  return filename;
}

export async function identifyAndTag(filePath, spotifyClient, shazamResult = null) {
  const currentData = await readMetadata(filePath);
  const currentMeta = currentData.metadata;

  let spotifyTrack = null;

  // 1. If Shazam already identified the song, try to enrich it with Spotify metadata.
  if (shazamResult && shazamResult.artist && shazamResult.title && spotifyClient) {
    try {
      spotifyTrack = await spotifyClient.searchTrack(shazamResult.artist, shazamResult.title);
    } catch (e) {
      console.log("Spotify enrichment failed:", e.message);
    }
  }

  // 2. Fallback: Spotify text search using existing tags or "Artist - Title" filename pattern.
  if (!shazamResult && !spotifyTrack && spotifyClient) {
    if (currentMeta.title || currentMeta.artist) {
      try {
        spotifyTrack = await spotifyClient.searchTrack(
          currentMeta.artist || "",
          currentMeta.title || currentData.file.name.replace(/\.[^.]+$/, "")
        );
      } catch (e) {
        console.log("Spotify search by tags failed:", e.message);
      }
    }

    if (!spotifyTrack) {
      const filename = currentData.file.name.replace(/\.[^.]+$/, "");
      const parts = filename.split(" - ");
      if (parts.length >= 2) {
        const artistFromFile = parts.slice(0, -1).join(" - ");
        const titleFromFile = parts[parts.length - 1];
        try {
          spotifyTrack = await spotifyClient.searchTrack(artistFromFile, titleFromFile);
        } catch (e) {
          console.log("Spotify search by filename failed:", e.message);
        }
      }
    }
  }

  // 3. Build final metadata.
  const newMetadata = {
    title: spotifyTrack?.name || shazamResult?.title || currentMeta.title,
    artist: spotifyTrack?.artists?.[0]?.name || shazamResult?.artist || currentMeta.artist,
    album: spotifyTrack?.album?.name || shazamResult?.album || currentMeta.album,
    year: spotifyTrack?.album?.release_date
      ? new Date(spotifyTrack.album.release_date).getFullYear()
      : (shazamResult?.year || currentMeta.year),
    genre: "",
    track: spotifyTrack?.track_number || currentMeta.track
  };

  // 4. If nothing was identified, fail explicitly.
  if (!newMetadata.artist && !newMetadata.title) {
    throw new Error(
      "No se pudo identificar la canción. Asegúrate de que shazamio esté instalado (pip install shazamio)."
    );
  }

  // 5. Write tags and rename file.
  await writeMetadata(filePath, newMetadata);
  const newFilename = generateFilename(newMetadata);
  const newPath = renameFile(filePath, newFilename);

  return {
    ok: true,
    original: currentData.file.name,
    result: `${newMetadata.artist} - ${newMetadata.title}`,
    newFilename: path.basename(newPath),
    newPath: newPath,
    metadata: newMetadata
  };
}

export default {
  readMetadata,
  listAudioFiles,
  renameFile,
  writeMetadata,
  generateFilename,
  identifyAndTag
};
