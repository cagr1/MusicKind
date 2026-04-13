import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { readMetadata, listAudioFiles, renameFile, writeMetadata, generateFilename, identifyAndTag } from "./metadata_editor.js";
import { SpotifyClient } from "./spotify.js";
import { JsonCache } from "./cache.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const uiRoot = path.join(projectRoot, "ui");
const genresPath = path.join(projectRoot, "config", "genres.json");
const settingsPath = path.join(projectRoot, "config", "settings.json");

const AUDIO_EXTS = new Set([".aiff", ".aif", ".wav", ".mp3", ".flac"]);

// Registry for running processes (for cancellation)
const runningProcesses = new Map();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url);
      return;
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveFile(res, path.join(uiRoot, "index.html"));
    }

    const filePath = path.join(uiRoot, url.pathname);
    if (filePath.startsWith(uiRoot)) {
      return serveFile(res, filePath);
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
});

const PORT = process.env.PORT || 3030;
server.listen(PORT, () => {
  console.log(`MusicKind dashboard running on http://localhost:${PORT}`);
});

async function handleApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/genres") {
    const genres = readGenres();
    return sendJson(res, { ok: true, genres });
  }

  if (req.method === "POST" && url.pathname === "/api/genres") {
    const body = await readJsonBody(req);
    const genres = Array.isArray(body.genres) ? body.genres : [];
    const cleaned = genres
      .map((g) => (typeof g === "string" ? g.trim() : ""))
      .filter((g) => g.length > 0);
    if (!cleaned.length) {
      return sendJson(res, { ok: false, error: "Lista de generos vacia" }, 400);
    }
    fs.writeFileSync(genresPath, JSON.stringify(cleaned, null, 2), "utf-8");
    return sendJson(res, { ok: true, genres: cleaned });
  }

  if (req.method === "POST" && url.pathname === "/api/genre-classify") {
    const body = await readJsonBody(req);
    const inputPath = body.inputPath ? String(body.inputPath) : "";
    const dryRun = Boolean(body.dryRun);
    const processId = body.processId || `cls-${Date.now()}`;
    
    if (!inputPath) {
      return sendJson(res, { ok: false, error: "inputPath requerido" }, 400);
    }
    
    // Check FFmpeg availability
    const ffmpegAvailable = await checkFFmpeg();
    
    const args = [path.join(projectRoot, "src", "cli.js"), "--input", inputPath];
    if (dryRun) args.push("--dry-run");
    const result = await runProcessWithProgress(process.execPath, args, res, processId);
    return sendJson(res, result.ok ? { ok: true, output: result.output, ffmpegAvailable } : result, result.ok ? 200 : 500);
  }

  if (req.method === "POST" && url.pathname === "/api/set-counts") {
    const body = await readJsonBody(req);
    const baseDj = body.baseDj ? String(body.baseDj) : "";
    if (!baseDj) {
      return sendJson(res, { ok: false, error: "baseDj requerido" }, 400);
    }
    const warmup = await countAudioFiles(path.join(baseDj, "warmup"));
    const peak = await countAudioFiles(path.join(baseDj, "peak"));
    const closing = await countAudioFiles(path.join(baseDj, "closing"));
    return sendJson(res, { ok: true, counts: { warmup, peak, closing, total: warmup + peak + closing } });
  }

  if (req.method === "POST" && url.pathname === "/api/set-create") {
    const body = await readJsonBody(req);
    const baseDj = body.baseDj ? String(body.baseDj) : "";
    const newPack = body.newPack ? String(body.newPack) : "";
    const outputDir = body.outputDir ? String(body.outputDir) : "output";
    const analysisSeconds = body.analysisSeconds ? Number(body.analysisSeconds) : null;
    const tempFormat = body.tempFormat ? String(body.tempFormat) : "";
    const tempBitrate = body.tempBitrate ? Number(body.tempBitrate) : null;
    const processId = body.processId || `set-${Date.now()}`;

    if (!baseDj || !newPack) {
      return sendJson(res, { ok: false, error: "baseDj y newPack requeridos" }, 400);
    }

    // Check FFmpeg availability if temp conversion is requested
    let ffmpegAvailable = true;
    if (tempFormat) {
      ffmpegAvailable = await checkFFmpeg();
      if (!ffmpegAvailable) {
        return sendJson(res, { ok: false, error: "FFmpeg no disponible. Instala FFmpeg para usar conversión temporal." }, 400);
      }
    }

    const args = [path.join(projectRoot, "src", "run_classification.py"), "--base-dj", baseDj, "--new-pack", newPack, "--output", outputDir];
    if (analysisSeconds) args.push("--analysis-seconds", String(analysisSeconds));
    if (tempFormat) args.push("--temp-format", tempFormat);
    if (tempBitrate) args.push("--temp-bitrate", String(tempBitrate));

    const result = await runProcessWithProgress("python3", args, res, processId);
    return sendJson(res, result.ok ? { ok: true, output: result.output, ffmpegAvailable } : result, result.ok ? 200 : 500);
  }

  if (req.method === "POST" && url.pathname === "/api/convert") {
    const body = await readJsonBody(req);
    const inputPath = body.inputPath ? String(body.inputPath) : "";
    const outputPath = body.outputPath ? String(body.outputPath) : "";
    const format = body.format ? String(body.format) : "";
    const bitrate = body.bitrate ? Number(body.bitrate) : null;
    const processId = body.processId || `conv-${Date.now()}`;

    if (!inputPath || !outputPath || !format) {
      return sendJson(res, { ok: false, error: "inputPath, outputPath y format requeridos" }, 400);
    }

    // Check FFmpeg availability
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
      return sendJson(res, { ok: false, error: "FFmpeg no disponible. Instala FFmpeg para usar el convertidor." }, 400);
    }

    const args = [
      path.join(projectRoot, "src", "convert_audio.py"),
      "--input",
      inputPath,
      "--output",
      outputPath,
      "--format",
      format
    ];
    if (bitrate) args.push("--bitrate", String(bitrate));

    const result = await runProcessWithProgress("python3", args, res, processId);
    return sendJson(res, result.ok ? { ok: true, output: result.output, ffmpegAvailable } : result, result.ok ? 200 : 500);
  }

  // Settings API
  if (req.method === "GET" && url.pathname === "/api/settings") {
    const settings = loadSettings();
    return sendJson(res, { ok: true, settings });
  }

  if (req.method === "POST" && url.pathname === "/api/settings") {
    const body = await readJsonBody(req);
    const settings = {
      spotifyClientId: body.spotifyClientId ? String(body.spotifyClientId).trim() : "",
      spotifyClientSecret: body.spotifyClientSecret ? String(body.spotifyClientSecret).trim() : "",
      lastfmApiKey: body.lastfmApiKey ? String(body.lastfmApiKey).trim() : "",
      language: body.language ? String(body.language).trim() : "es"
    };
    saveSettings(settings);
    return sendJson(res, { ok: true, message: "Configuracion guardada" });
  }

  // FFmpeg status API
  if (req.method === "GET" && url.pathname === "/api/ffmpeg-status") {
    const installed = await checkFFmpeg();
    return sendJson(res, { ok: true, installed });
  }

  // Cancel process API
  if (req.method === "POST" && url.pathname === "/api/cancel") {
    const body = await readJsonBody(req);
    const processId = body.processId ? String(body.processId) : "";
    if (!processId) {
      return sendJson(res, { ok: false, error: "processId requerido" }, 400);
    }
    const cancelled = cancelProcess(processId);
    return sendJson(res, { ok: true, cancelled });
  }

  // ==================== METADATA EDITOR API ====================
  
  // Get metadata for a single file
  if (req.method === "GET" && url.pathname === "/api/metadata") {
    const filePath = url.searchParams.get("file");
    if (!filePath) {
      return sendJson(res, { ok: false, error: "file parameter required" }, 400);
    }
    try {
      const result = await readMetadata(filePath);
      return sendJson(res, result);
    } catch (error) {
      return sendJson(res, { ok: false, error: error.message }, 400);
    }
  }

  // List audio files in a directory
  if (req.method === "GET" && url.pathname === "/api/metadata/list") {
    const dirPath = url.searchParams.get("dir");
    const recursive = url.searchParams.get("recursive") === "true";
    if (!dirPath) {
      return sendJson(res, { ok: false, error: "dir parameter required" }, 400);
    }
    try {
      const files = listAudioFiles(dirPath, recursive);
      return sendJson(res, { ok: true, files });
    } catch (error) {
      return sendJson(res, { ok: false, error: error.message }, 400);
    }
  }

  // Rename file
  if (req.method === "POST" && url.pathname === "/api/metadata/rename") {
    const body = await readJsonBody(req);
    const filePath = body.filePath ? String(body.filePath) : "";
    const newName = body.newName ? String(body.newName) : "";
    if (!filePath || !newName) {
      return sendJson(res, { ok: false, error: "filePath and newName required" }, 400);
    }
    try {
      const newPath = renameFile(filePath, newName);
      return sendJson(res, { ok: true, newPath });
    } catch (error) {
      return sendJson(res, { ok: false, error: error.message }, 400);
    }
  }

  // Write metadata to file
  if (req.method === "POST" && url.pathname === "/api/metadata/write") {
    const body = await readJsonBody(req);
    const filePath = body.filePath ? String(body.filePath) : "";
    const metadata = body.metadata || {};
    if (!filePath) {
      return sendJson(res, { ok: false, error: "filePath required" }, 400);
    }
    try {
      // Check FFmpeg availability
      const ffmpegAvailable = await checkFFmpeg();
      if (!ffmpegAvailable) {
        return sendJson(res, { ok: false, error: "FFmpeg not available for writing metadata" }, 400);
      }
      await writeMetadata(filePath, metadata);
      return sendJson(res, { ok: true });
    } catch (error) {
      return sendJson(res, { ok: false, error: error.message }, 400);
    }
  }

  // Generate filename from metadata
  if (req.method === "POST" && url.pathname === "/api/metadata/generate-filename") {
    const body = await readJsonBody(req);
    const metadata = body.metadata || {};
    const format = body.format || "{artist} - {title}";
    const filename = generateFilename(metadata, format);
    return sendJson(res, { ok: true, filename });
  }

  // Auto-identify and tag a file using Spotify
  if (req.method === "POST" && url.pathname === "/api/metadata/identify") {
    const body = await readJsonBody(req);
    const filePath = body.filePath ? String(body.filePath) : "";
    
    if (!filePath) {
      return sendJson(res, { ok: false, error: "filePath required" }, 400);
    }
    
    try {
      // Load Spotify credentials
      const settings = loadSettings();
      if (!settings.spotifyClientId || !settings.spotifyClientSecret) {
        return sendJson(res, { ok: false, error: "Spotify credentials not configured. Go to Settings." }, 400);
      }
      
      const cache = new JsonCache(path.join(projectRoot, ".cache/api-cache.json"));
      const spotify = new SpotifyClient({
        clientId: settings.spotifyClientId,
        clientSecret: settings.spotifyClientSecret,
        cache
      });
      
      const result = await identifyAndTag(filePath, spotify);
      return sendJson(res, result);
    } catch (error) {
      return sendJson(res, { ok: false, error: error.message }, 400);
    }
  }

  // ==================== BPM ANALYZER API ====================
  
  // Analyze BPM for multiple files
  if (req.method === "POST" && url.pathname === "/api/bpm/analyze") {
    const body = await readJsonBody(req);
    const files = Array.isArray(body.files) ? body.files : [];
    const analysisSeconds = body.analysisSeconds ? Number(body.analysisSeconds) : null;
    const processId = body.processId || `bpm-${Date.now()}`;
    
    if (files.length === 0) {
      return sendJson(res, { ok: false, error: "files required" }, 400);
    }
    
    // Check FFmpeg availability
    const ffmpegAvailable = await checkFFmpeg();
    if (!ffmpegAvailable) {
      return sendJson(res, { ok: false, error: "FFmpeg not available for BPM analysis" }, 400);
    }
    
    const args = [
      path.join(projectRoot, "src", "bpm_analyzer.py"),
      "--files",
      ...files
    ];
    if (analysisSeconds) {
      args.push("--analysis-seconds", String(analysisSeconds));
    }
    
    const result = await runProcessWithProgress("python3", args, res, processId);
    return sendJson(res, result.ok ? { ok: true, output: result.output, ffmpegAvailable } : result, result.ok ? 200 : 500);
  }

  res.writeHead(404);
  res.end("Not found");
}

function readGenres() {
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
  if (!fs.existsSync(genresPath)) return defaultGenres;
  try {
    const parsed = JSON.parse(fs.readFileSync(genresPath, "utf-8"));
    if (Array.isArray(parsed) && parsed.length) return parsed;
    return defaultGenres;
  } catch {
    return defaultGenres;
  }
}

function loadSettings() {
  const defaultSettings = {
    spotifyClientId: "",
    spotifyClientSecret: "",
    lastfmApiKey: "",
    language: "es"
  };
  if (!fs.existsSync(settingsPath)) return defaultSettings;
  try {
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return { ...defaultSettings, ...parsed };
  } catch {
    return defaultSettings;
  }
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

async function countAudioFiles(dirPath) {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        count += await countAudioFiles(full);
      } else if (AUDIO_EXTS.has(path.extname(entry.name).toLowerCase())) {
        count += 1;
      }
    }
    return count;
  } catch {
    return 0;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (err) {
        reject(err);
      }
    });
  });
}

function sendJson(res, payload, status = 200) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

function serveFile(res, filePath) {
  if (!fs.existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html",
    ".css": "text/css",
    ".js": "text/javascript",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg"
  };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

async function checkFFmpeg() {
  return new Promise((resolve) => {
    const child = spawn("ffmpeg", ["-version"], { 
      cwd: projectRoot,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    child.on('error', () => {
      resolve(false);
    });
    
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

function runProcessWithProgress(cmd, args, res, processId) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: projectRoot });
    let output = "";
    let currentFile = "";
    let totalFiles = 0;
    let processedFiles = 0;
    let isKilled = false;
    
    // Register process for cancellation
    if (processId) {
      runningProcesses.set(processId, child);
    }
    
    child.stdout.on("data", (data) => {
      output += data.toString();
      const text = data.toString();
      
      // Extract progress information from [PROGRESS:X/Y] format
      const progressRegex = /\[PROGRESS:(\d+)\/(\d+)\]\s*Processing:\s*(.+)/;
      const match = text.match(progressRegex);
      
      if (match) {
        processedFiles = parseInt(match[1]);
        totalFiles = parseInt(match[2]);
        currentFile = match[3].trim();
        
        const percentage = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;
        
        // Send progress update
        res.write(`data: ${JSON.stringify({ 
          type: 'progress', 
          current: currentFile,
          processed: processedFiles,
          total: totalFiles,
          percentage: percentage,
          message: `(${processedFiles}/${totalFiles}) ${currentFile}`
        })}\n\n`);
      } else if (text.includes('[PROGRESS:') && text.includes(']')) {
        // Fallback for other progress formats
        const lines = text.split('\n');
        lines.forEach(line => {
          if (line.includes('[') && line.includes(']')) {
            res.write(`data: ${JSON.stringify({ type: 'progress', message: line.trim() })}\n\n`);
          }
        });
      }
    });
    
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    
    child.on("close", (code) => {
      // Remove from registry
      if (processId) {
        runningProcesses.delete(processId);
      }
      
      // Send completion signal
      if (!isKilled) {
        res.write(`data: ${JSON.stringify({ type: 'complete', success: code === 0, processed: processedFiles, total: totalFiles, cancelled: isKilled })}\n\n`);
        res.end();
      }
      
      if (code === 0) {
        resolve({ ok: true, output });
      } else {
        resolve({ ok: false, error: output || `Process failed with code ${code}` });
      }
    });
  });
}

// Cancel a running process
function cancelProcess(processId) {
  const child = runningProcesses.get(processId);
  if (child) {
    child.kill('SIGTERM');
    runningProcesses.delete(processId);
    return true;
  }
  return false;
}

function runProcess(cmd, args) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd: projectRoot });
    let output = "";
    child.stdout.on("data", (data) => {
      output += data.toString();
    });
    child.stderr.on("data", (data) => {
      output += data.toString();
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ ok: true, output });
      } else {
        resolve({ ok: false, error: output || `Process failed with code ${code}` });
      }
    });
  });
}
