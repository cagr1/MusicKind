import http from "http";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { readMetadata, renameFile, writeMetadata, generateFilename, identifyAndTag } from "./metadata_editor.js";
import { SpotifyClient } from "./spotify.js";
import { JsonCache } from "./cache.js";
import { discoverAudioFiles } from "./services/audio-discovery.js";
import { buildMetadataListResponse } from "./services/metadata-list-api.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const uiRoot = path.join(projectRoot, "ui");
const genresPath = path.join(projectRoot, "config", "genres.json");
const settingsPath = path.join(projectRoot, "config", "settings.json");

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

    const settings = loadSettings();
    const spotifyClientId = process.env.SPOTIFY_CLIENT_ID || settings.spotifyClientId;
    const spotifyClientSecret = process.env.SPOTIFY_CLIENT_SECRET || settings.spotifyClientSecret;
    if (!spotifyClientId || !spotifyClientSecret) {
      return sendJson(
        res,
        {
          ok: false,
          error: "Faltan credenciales de Spotify. Configura Spotify Client ID y Spotify Client Secret en Settings para poder clasificar."
        },
        400
      );
    }
    
    const args = [path.join(projectRoot, "src", "cli.js"), "--input", inputPath];
    if (dryRun) args.push("--dry-run");
    
    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress(process.execPath, args, res, processId);
    return; // Response already sent by runProcessWithProgress
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

    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress("python3", args, res, processId);
    return; // Response already sent by runProcessWithProgress
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

    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress("python3", args, res, processId);
    return; // Response already sent by runProcessWithProgress
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
      language: body.language ? String(body.language).trim() : "es",
      defaultOutputDir: body.defaultOutputDir ? String(body.defaultOutputDir).trim() : "output"
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

  // Pause / Resume a running process (macOS/Linux — SIGSTOP / SIGCONT)
  if (req.method === "POST" && (url.pathname === "/api/pause" || url.pathname === "/api/resume")) {
    const body = await readJsonBody(req);
    const processId = body.processId ? String(body.processId) : "";
    if (!processId) return sendJson(res, { ok: false, error: "processId requerido" }, 400);
    const signal = url.pathname === "/api/pause" ? "SIGSTOP" : "SIGCONT";
    return signalProcess(processId, signal, res);
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
      const response = await buildMetadataListResponse({ dirPath, recursive });
      for (const line of response.logs) {
        console.warn(line);
      }
      return sendJson(res, response.payload, response.status);
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
    
    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress("python3", args, res, processId, { parseJsonResult: true });
    return; // Response already sent by runProcessWithProgress
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
    language: "es",
    defaultOutputDir: "output"
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
  const discovery = await discoverAudioFiles({
    target: dirPath,
    recursive: true
  });

  if (!discovery.ok) {
    return 0;
  }

  return discovery.files.length;
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

function runProcessWithProgress(cmd, args, res, processId, options = {}) {
  const { parseJsonResult = false } = options;
  return new Promise((resolve) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
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

      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        // Extract progress information from [PROGRESS:X/Y] format
        const progressRegex = /\[PROGRESS:(\d+)\/(\d+)\]\s*Processing:\s*(.+)/;
        const match = line.match(progressRegex);

        if (match) {
          processedFiles = parseInt(match[1]);
          totalFiles = parseInt(match[2]);
          currentFile = match[3].trim();

          const percentage = totalFiles > 0 ? Math.round((processedFiles / totalFiles) * 100) : 0;

          // Send progress update
          res.write(`data: ${JSON.stringify({
            type: "progress",
            current: currentFile,
            processed: processedFiles,
            total: totalFiles,
            percentage,
            message: `(${processedFiles}/${totalFiles}) ${currentFile}`
          })}\n\n`);
          continue;
        }

        if (line.includes("[PROGRESS:") && line.includes("]")) {
          res.write(`data: ${JSON.stringify({ type: "progress", message: line })}\n\n`);
          continue;
        }

        res.write(`data: ${JSON.stringify({ type: "log", message: line })}\n\n`);
      }
    });
    
    child.stderr.on("data", (data) => {
      output += data.toString();
      const text = data.toString();
      const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
      for (const line of lines) {
        res.write(`data: ${JSON.stringify({ type: "log", message: line, stream: "stderr" })}\n\n`);
      }
    });
    
    child.on("close", (code) => {
      isKilled = child._killed === true;
      // Remove from registry
      if (processId) {
        runningProcesses.delete(processId);
      }

      // Send completion signal — always close the SSE stream
      if (isKilled) {
        res.write(`data: ${JSON.stringify({ type: 'complete', success: false, cancelled: true })}\n\n`);
      } else {
        if (parseJsonResult && code === 0) {
          try {
            const lines = output.split('\n');
            const jsonLineIdx = lines.findIndex(l => l.trim() === '[');
            if (jsonLineIdx >= 0) {
              const parsed = JSON.parse(lines.slice(jsonLineIdx).join('\n'));
              res.write(`data: ${JSON.stringify({ type: 'result', results: parsed })}\n\n`);
            }
          } catch (e) {
            // JSON not found or malformed — skip result event
          }
        }
        const completePayload = {
          type: "complete",
          success: code === 0,
          processed: processedFiles,
          total: totalFiles,
          cancelled: false
        };
        if (code !== 0) {
          completePayload.error = (output || `Process failed with code ${code}`).trim().slice(-1200);
        } else if (!processedFiles && output.trim()) {
          completePayload.message = output.trim().slice(-400);
        }
        res.write(`data: ${JSON.stringify(completePayload)}\n\n`);
      }
      res.end();
      
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
    child._killed = true;
    child.kill('SIGTERM');
    runningProcesses.delete(processId);
    return true;
  }
  return false;
}

function signalProcess(processId, signal, res) {
  const child = runningProcesses.get(processId);
  if (!child) return sendJson(res, { ok: false, error: "proceso no encontrado" }, 404);
  try {
    child.kill(signal);
  } catch (e) {
    return sendJson(res, { ok: false, error: e.message }, 500);
  }
  return sendJson(res, { ok: true });
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
