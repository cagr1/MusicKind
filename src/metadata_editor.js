#!/usr/bin/env node
/**
 * Metadata Editor Module
 * Allows reading and writing audio file metadata
 */

import fs from "fs";
import path from "path";
import { parseFile } from "music-metadata";
import { spawn } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

const SUPPORTED_EXTENSIONS = new Set([".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a"]);

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
export function listAudioFiles(dirPath, recursive = false) {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }
  
  const files = [];
  
  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory() && recursive) {
        scanDir(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (SUPPORTED_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }
  
  scanDir(dirPath);
  return files;
}

/**
 * Rename a file
 */
export function renameFile(oldPath, newName) {
  if (!fs.existsSync(oldPath)) {
    throw new Error(`File not found: ${oldPath}`);
  }
  
  const dir = path.dirname(oldPath);
  const ext = path.extname(oldPath);
  const newPath = path.join(dir, newName + ext);
  
  if (fs.existsSync(newPath) && oldPath !== newPath) {
    throw new Error(`Target file already exists: ${newPath}`);
  }
  
  fs.renameSync(oldPath, newPath);
  return newPath;
}

/**
 * Write metadata to a file using FFmpeg
 */
export function writeMetadata(filePath, metadata) {
  return new Promise((resolve, reject) => {
    const args = ["-y", "-i", filePath];
    
    // Copy to temp file first to avoid issues
    const ext = path.extname(filePath);
    const tempPath = filePath + ".tmp";
    
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
        resolve({ ok: true });
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

export default {
  readMetadata,
  listAudioFiles,
  renameFile,
  writeMetadata,
  generateFilename
};