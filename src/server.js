import http from "http";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { StringDecoder } from "string_decoder";
import { config as loadEnv } from "dotenv";
import { readMetadata, renameFile, writeMetadata, generateFilename, identifyAndTag } from "./metadata_editor.js";
import { SpotifyClient } from "./spotify.js";
import { JsonCache } from "./cache.js";
import { discoverAudioFiles, getAudioExtensions } from "./services/audio-discovery.js";
import { buildMetadataListResponse } from "./services/metadata-list-api.js";
import {
  resolvePython
} from "./python-env.js";
import { createPythonInstallHandler } from "./python-install.js";
import { LineBuffer } from "./line-buffer.js";
import { parseFile } from "music-metadata";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
loadEnv({ path: path.join(projectRoot, ".env.local"), override: false });
const legacyUiRoot = path.join(projectRoot, "ui");
const webUiRoot = path.join(projectRoot, "web", "dist");
const genresPath = path.join(projectRoot, "config", "genres.json");
const settingsPath = path.join(projectRoot, "config", "settings.json");
const pythonDependenciesPath = path.join(projectRoot, "config", "python-dependencies.json");

function loadPythonDependencies() {
  const config = JSON.parse(fs.readFileSync(pythonDependenciesPath, "utf8"));
  for (const group of ["audio", "stems"]) {
    if (!config[group] || !Array.isArray(config[group].packages) || config[group].packages.length === 0
      || config[group].packages.some((pkg) => typeof pkg !== "string" || !/^[A-Za-z0-9_.-]+$/.test(pkg))) {
      throw new Error(`Configuración inválida de dependencias Python: ${group}`);
    }
  }
  return config;
}

const pythonDependencies = loadPythonDependencies();

// Resolves the correct Python command for the current platform.
// Tries python3 first on Unix-like systems and python first on Windows.
async function getPythonCmd({ requireVenv = false } = {}) {
  const resolved = await resolvePython({ projectRoot, requireVenv });
  return resolved.command;
}

export async function checkPythonImport(packageName, { getPythonCommand = getPythonCmd, spawnImpl = spawn } = {}) {
  let pyCmd;
  try {
    pyCmd = await getPythonCommand({ requireVenv: true });
  } catch {
    return false;
  }

  return new Promise((resolve) => {
    const child = spawnImpl(pyCmd, ["-c", `import ${packageName}`], {
      cwd: projectRoot,
      stdio: "ignore"
    });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function checkFpcalc() {
  return new Promise((resolve) => {
    const child = spawn("fpcalc", ["--version"], { stdio: "ignore" });
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0));
  });
}

function writeSseCompleteError(res, errorMessage) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive"
  });
  res.write(`data: ${JSON.stringify({ type: "complete", success: false, error: errorMessage })}\n\n`);
  res.end();
}

const installPythonDependencies = createPythonInstallHandler({ projectRoot, dependencies: pythonDependencies });

// Registry for running processes (for cancellation)
const runningProcesses = new Map();

function getUiRoot() {
  if (process.env.MUSIC_KIND_UI !== "legacy"
    && fs.existsSync(path.join(webUiRoot, "index.html"))) {
    return webUiRoot;
  }
  return legacyUiRoot;
}

export function createServer({ installHandler = installPythonDependencies, mediaSpawn = spawn } = {}) {
  return http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url, { installHandler, mediaSpawn });
      return;
    }

    const uiRoot = getUiRoot();
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return serveFile(res, path.join(uiRoot, "index.html"));
    }

    const filePath = path.join(uiRoot, url.pathname);
    if (filePath.startsWith(`${uiRoot}${path.sep}`)) {
      return serveFile(res, filePath);
    }

    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: err.message }));
  }
  });
}

const PORT = process.env.PORT || 3030;
const HOST = "127.0.0.1";
if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  createServer().listen(PORT, HOST, () => console.log(`MusicKind dashboard running on http://${HOST}:${PORT} (loopback only)`));
}

async function handleApi(req, res, url, { installHandler = installPythonDependencies, mediaSpawn = spawn } = {}) {
  if (req.method === "GET" && ["/api/audio", "/api/waveform", "/api/artwork"].includes(url.pathname)) {
    const filePath = url.searchParams.get("path") || "";
    const validation = validateMediaPath(filePath);
    if (validation.error) return sendJson(res, validation.error, validation.status);
    if (url.pathname === "/api/audio") return serveAudio(res, filePath, req.headers.range, mediaSpawn);
    if (url.pathname === "/api/artwork") return serveArtwork(res, filePath);

    const rawBins = url.searchParams.get("bins");
    const bins = rawBins === null ? 200 : Number(rawBins);
    if (!Number.isInteger(bins) || bins < 32 || bins > 1000) {
      return sendJson(res, { ok: false, error: "bins debe ser un entero entre 32 y 1000" }, 400);
    }
    const waveform = await buildWaveform(filePath, bins);
    return sendJson(res, waveform.payload, waveform.status);
  }

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

  if (req.method === "POST" && url.pathname === "/api/classify-by-tags") {
    const body = await readJsonBody(req);
    const inputRoot = typeof body.inputRoot === "string" ? body.inputRoot : "";
    const destRoot = typeof body.destRoot === "string" ? body.destRoot : "";
    const excludeRoots = Array.isArray(body.excludeRoots) ? body.excludeRoots : [];
    const pathValues = [inputRoot, destRoot, ...excludeRoots];
    if (!inputRoot || !destRoot || !Array.isArray(body.excludeRoots) || excludeRoots.some((root) => typeof root !== "string" || !root)) {
      return sendJson(res, { ok: false, error: "inputRoot, excludeRoots y destRoot requeridos" }, 400);
    }
    if (pathValues.some((value) => !path.isAbsolute(value))) {
      return sendJson(res, { ok: false, error: "Todas las rutas deben ser absolutas" }, 400);
    }
    const normalized = pathValues.map((value) => path.resolve(value));
    const [input, destination, ...excludes] = normalized;
    const within = (candidate, root) => {
      const relative = path.relative(root, candidate);
      return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
    };
    if (excludes.some((root) => within(input, root) || within(destination, root)) || excludes.some((root) => within(root, destination))) {
      return sendJson(res, { ok: false, error: "inputRoot o destRoot se solapan con excludeRoots" }, 400);
    }
    if (!fs.existsSync(input) || !fs.statSync(input).isDirectory()
      || excludes.some((root) => !fs.existsSync(root) || !fs.statSync(root).isDirectory())) {
      return sendJson(res, { ok: false, error: "inputRoot y excludeRoots deben ser carpetas existentes" }, 400);
    }
    const args = [path.join(projectRoot, "src", "tag-classifier-cli.js"), "--input-root", input, "--dest-root", destination];
    for (const root of excludes) args.push("--exclude-root", root);
    const processId = body.processId || `tags-${Date.now()}`;
    await runProcessWithProgress(process.execPath, args, res, processId, { parseJsonResult: true });
    return;
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
    const hasSpotify = Boolean(spotifyClientId && spotifyClientSecret);

    const args = [path.join(projectRoot, "src", "cli.js"), "--input", inputPath];
    if (dryRun) args.push("--dry-run");
    if (!hasSpotify) args.push("--no-spotify");
    
    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress(process.execPath, args, res, processId, { parseJsonResult: true });
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

    let pyCmd;
    try {
      pyCmd = await getPythonCmd({ requireVenv: true });
    } catch (error) {
      writeSseCompleteError(res, error.message);
      return;
    }

    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress(pyCmd, args, res, processId);
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

    let pyCmd;
    try {
      pyCmd = await getPythonCmd({ requireVenv: false });
    } catch (error) {
      writeSseCompleteError(res, error.message);
      return;
    }

    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress(pyCmd, args, res, processId, { parseJsonResult: true });
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
      acoustidApiKey: body.acoustidApiKey ? String(body.acoustidApiKey).trim() : "",
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

  if (req.method === "GET" && url.pathname === "/api/check-deps") {
    const [librosa, numpy, demucs, acoustid] = await Promise.all([
      checkPythonImport("librosa"),
      checkPythonImport("numpy"),
      checkPythonImport("demucs"),
      checkFpcalc()
    ]);
    return sendJson(res, { ok: true, deps: { librosa, numpy, demucs, acoustid } });
  }

  if (req.method === "POST" && url.pathname === "/api/install-dep") {
    const body = await readJsonBody(req);
    const group = body.group ? String(body.group) : "";
    await installHandler(group, res);
    return;
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
    if (!path.isAbsolute(dirPath)) {
      return sendJson(res, { ok: false, error: `Ruta no absoluta: se recibió "${dirPath}" (solo el nombre de archivo/carpeta). Se requiere una ruta absoluta.` }, 400);
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
    if (!path.isAbsolute(filePath)) {
      return sendJson(res, { ok: false, error: `Ruta no absoluta: se recibió "${filePath}". Se requiere una ruta absoluta.` }, 400);
    }
    if (!fs.existsSync(filePath)) {
      return sendJson(res, { ok: false, error: `No se encontró el archivo: ${filePath}` }, 400);
    }
    if (metadata.bpm !== undefined && metadata.bpm !== null && metadata.bpm !== "") {
      const bpmNum = Number(metadata.bpm);
      if (!Number.isFinite(bpmNum) || bpmNum < 20 || bpmNum > 300) {
        return sendJson(res, { ok: false, error: "bpm debe ser numérico entre 20 y 300" }, 400);
      }
    }
    if (metadata.key !== undefined && metadata.key !== null && metadata.key !== "") {
      if (typeof metadata.key !== "string" || metadata.key.length > 16) {
        return sendJson(res, { ok: false, error: "key debe ser un string corto (máx. 16 caracteres)" }, 400);
      }
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

  // Auto-identify and tag a file using AcoustID, optionally enriched with Spotify
  if (req.method === "POST" && url.pathname === "/api/metadata/identify") {
    const body = await readJsonBody(req);
    const filePath = body.filePath ? String(body.filePath) : "";
    const preview = body.preview === true;

    if (!filePath) {
      return sendJson(res, { ok: false, error: "filePath required" }, 400);
    }
    if (!path.isAbsolute(filePath)) {
      return sendJson(res, { ok: false, error: `Ruta no absoluta: se recibió "${filePath}". Se requiere una ruta absoluta.` }, 400);
    }
    if (!fs.existsSync(filePath)) {
      return sendJson(res, { ok: false, error: `No se encontró el archivo: ${filePath}` }, 400);
    }

    try {
      const settings = loadSettings();

      let identifyResult = null;
      let identifyError = null;

      const acoustidApiKey = process.env.ACOUSTID_API_KEY || settings.acoustidApiKey || "";
      if (acoustidApiKey) {
        let pyCmd;
        try {
          pyCmd = await getPythonCmd();
        } catch (e) {
          identifyError = e.message;
        }

        if (pyCmd) {
          identifyResult = await new Promise((resolve) => {
            const args = [
              path.join(projectRoot, "src", "acoustid_identify.py"),
              "--file", filePath,
              "--api-key", acoustidApiKey
            ];
            const child = spawn(pyCmd, args, { cwd: projectRoot });
            let stdout = "";
            let settled = false;
            const identifyStdoutDecoder = new StringDecoder("utf8");

            const finish = (value) => {
              if (settled) return;
              settled = true;
              resolve(value);
            };

            const timeoutId = setTimeout(() => {
              child.kill("SIGTERM");
              identifyError = "Tiempo de espera agotado al identificar la canción";
              finish(null);
            }, 30000);

            child.stdout.on("data", (d) => {
              stdout += typeof d === "string" ? d : identifyStdoutDecoder.write(d);
            });
            child.stderr.on("data", () => {});
            child.on("close", () => {
              clearTimeout(timeoutId);
              stdout += identifyStdoutDecoder.end();
              try {
                const parsed = JSON.parse(stdout.trim());
                if (parsed.error) {
                  identifyError = parsed.error;
                  finish(null);
                } else {
                  finish(parsed);
                }
              } catch {
                identifyError = "Respuesta inesperada del proceso de identificación";
                finish(null);
              }
            });
            child.on("error", () => {
              clearTimeout(timeoutId);
              identifyError = "No se pudo ejecutar el proceso de identificación";
              finish(null);
            });
          });
        }
      }

      let spotify = null;
      if (settings.spotifyClientId && settings.spotifyClientSecret) {
        const cache = new JsonCache(path.join(projectRoot, ".cache/api-cache.json"));
        spotify = new SpotifyClient({
          clientId: settings.spotifyClientId,
          clientSecret: settings.spotifyClientSecret,
          cache
        });
      }

      if (!spotify && !identifyResult) {
        const err = identifyError
          || (!acoustidApiKey ? "Falta la clave API de AcoustID. Configúrala en Ajustes." : "No se pudo identificar la canción");
        return sendJson(res, { ok: false, error: err }, 400);
      }

      const result = await identifyAndTag(filePath, spotify, identifyResult, { preview });
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
    const nonAbsolute = files.find((f) => !path.isAbsolute(String(f)));
    if (nonAbsolute !== undefined) {
      return sendJson(res, { ok: false, error: `Ruta no absoluta: se recibió "${nonAbsolute}" (solo el nombre de archivo). Se requiere una ruta absoluta.` }, 400);
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
    
    let pyCmd;
    try {
      pyCmd = await getPythonCmd({ requireVenv: true });
    } catch (error) {
      writeSseCompleteError(res, error.message);
      return;
    }

    // Note: runProcessWithProgress handles response completion (res.end())
    // so no further response should be sent after this
    await runProcessWithProgress(pyCmd, args, res, processId, { parseJsonResult: true });
    return; // Response already sent by runProcessWithProgress
  }

  if (req.method === "POST" && url.pathname === "/api/set-analyze") {
    const body = await readJsonBody(req);
    const warmupDir = body.warmup ? String(body.warmup) : "";
    const peakDir = body.peak ? String(body.peak) : "";
    const closingDir = body.closing ? String(body.closing) : "";
    const inputDir = body.input ? String(body.input) : "";
    const analysisSeconds = body.analysisSeconds ? Number(body.analysisSeconds) : null;
    const processId = body.processId || `set-${Date.now()}`;

    if (!inputDir) {
      return sendJson(res, { ok: false, error: "input (pack nuevo) requerido" }, 400);
    }
    if (!warmupDir && !peakDir && !closingDir) {
      return sendJson(res, { ok: false, error: "Al menos una carpeta de referencia (warmup, peak o closing) es requerida" }, 400);
    }

    const args = [
      path.join(projectRoot, "src", "style_analyzer.py"),
      "--input", inputDir
    ];
    if (warmupDir) args.push("--warmup", warmupDir);
    if (peakDir) args.push("--peak", peakDir);
    if (closingDir) args.push("--closing", closingDir);
    if (analysisSeconds) args.push("--analysis-seconds", String(analysisSeconds));

    let pyCmd;
    try {
      pyCmd = await getPythonCmd({ requireVenv: true });
    } catch (error) {
      writeSseCompleteError(res, error.message);
      return;
    }

    await runProcessWithProgress(pyCmd, args, res, processId, { parseJsonResult: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/stem-separate") {
    const body = await readJsonBody(req);
    const files = Array.isArray(body.files) ? body.files.map(String) : [];
    const inputDir = body.inputDir ? String(body.inputDir) : "";
    const outputDir = body.outputDir ? String(body.outputDir) : "output";
    const stems = ["vocals", "instrumental", "both"].includes(body.stems) ? body.stems : "both";
    const format = ["wav", "mp3"].includes(body.format) ? body.format : "wav";
    const processId = body.processId || `stems-${Date.now()}`;

    if (files.length === 0 && !inputDir) {
      return sendJson(res, { ok: false, error: "files o inputDir requerido" }, 400);
    }

    const args = [
      path.join(projectRoot, "src", "stem_separator.py"),
      "--output", outputDir,
      "--stems", stems,
      "--format", format
    ];
    if (files.length > 0) {
      args.push("--files", ...files);
    } else {
      args.push("--input", inputDir);
    }

    let pyCmd;
    try {
      pyCmd = await getPythonCmd({ requireVenv: true });
    } catch (error) {
      writeSseCompleteError(res, error.message);
      return;
    }

    await runProcessWithProgress(pyCmd, args, res, processId, { parseJsonResult: true });
    return;
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
    acoustidApiKey: "",
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

function validateMediaPath(filePath) {
  if (!path.isAbsolute(filePath)) {
    return { status: 400, error: { ok: false, error: `Ruta no absoluta: se recibió "${filePath}". Se requiere una ruta absoluta.` } };
  }
  const ext = path.extname(filePath).toLowerCase();
  if (!getAudioExtensions().includes(ext)) {
    return { status: 415, error: { ok: false, error: `Formato de audio no soportado: ${ext || "(sin extensión)"}` } };
  }
  if (!fs.existsSync(filePath)) {
    return { status: 404, error: { ok: false, error: `No se encontró el archivo: ${filePath}` } };
  }
  return { status: 200 };
}

const AUDIO_CONTENT_TYPES = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4"
};

const NEEDS_TRANSCODE = new Set([".aif", ".aiff"]);
const transcodesInProgress = new Map();

function mediaCacheKey(filePath, stat) {
  return crypto.createHash("sha1").update(`${filePath}|${stat.size}|${stat.mtimeMs}`).digest("hex");
}

async function getPlayableAudio(filePath, mediaSpawn) {
  const ext = path.extname(filePath).toLowerCase();
  if (!NEEDS_TRANSCODE.has(ext)) return filePath;
  const stat = fs.statSync(filePath);
  const hash = mediaCacheKey(filePath, stat);
  const cacheDir = path.join(projectRoot, ".cache", "audio");
  const output = path.join(cacheDir, `${hash}.flac`);
  if (fs.existsSync(output)) return output;
  if (transcodesInProgress.has(output)) return transcodesInProgress.get(output);

  const pending = (async () => {
    fs.mkdirSync(cacheDir, { recursive: true });
    const temporary = path.join(cacheDir, `${hash}.tmp.flac`);
    await new Promise((resolve, reject) => {
      const child = mediaSpawn("ffmpeg", ["-y", "-v", "error", "-i", filePath, "-map", "0:a:0", "-c:a", "flac", "-compression_level", "5", temporary], { stdio: "ignore" });
      child.once("error", (error) => reject(error.code === "ENOENT" ? new Error("FFmpeg no está instalado; no se puede preparar el audio AIFF.") : error));
      child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`FFmpeg no pudo preparar el audio AIFF (código ${code}).`)));
    });
    fs.renameSync(temporary, output);
    return output;
  })().catch((error) => {
    try { fs.rmSync(path.join(cacheDir, `${hash}.tmp.flac`), { force: true }); } catch {}
    throw error;
  }).finally(() => transcodesInProgress.delete(output));
  transcodesInProgress.set(output, pending);
  return pending;
}

async function serveArtwork(res, filePath) {
  const stat = fs.statSync(filePath);
  const cacheDir = path.join(projectRoot, ".cache", "artwork");
  const hash = mediaCacheKey(filePath, stat);
  const missingMarker = path.join(cacheDir, `${hash}.none`);
  if (fs.existsSync(missingMarker)) return sendJson(res, { ok: false }, 404);
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  const cached = Object.keys(extensions).map((mime) => ({ mime, file: path.join(cacheDir, `${hash}.${extensions[mime]}`) })).find(({ file }) => fs.existsSync(file));
  if (cached) return streamArtwork(res, cached.file, cached.mime);

  const metadata = await parseFile(filePath, { skipPostHeaders: true });
  const picture = metadata.common.picture?.[0];
  const extension = extensions[picture?.format];
  if (!picture || !extension) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(missingMarker, "");
    return sendJson(res, { ok: false }, 404);
  }
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachedPath = path.join(cacheDir, `${hash}.${extension}`);
  fs.writeFileSync(cachedPath, picture.data);
  return streamArtwork(res, cachedPath, picture.format);
}

function streamArtwork(res, filePath, mime) {
  res.writeHead(200, { "Content-Type": mime, "Content-Length": fs.statSync(filePath).size, "Cache-Control": "public, max-age=31536000, immutable" });
  fs.createReadStream(filePath).on("error", () => { if (!res.destroyed) res.destroy(); }).pipe(res);
}

async function serveAudio(res, sourcePath, rangeHeader, mediaSpawn = spawn) {
  let filePath;
  try {
    filePath = await getPlayableAudio(sourcePath, mediaSpawn);
  } catch (error) {
    return sendJson(res, { ok: false, error: error.message }, error.message.startsWith("FFmpeg no está") ? 503 : 500);
  }
  const stat = fs.statSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let start = 0;
  let end = stat.size - 1;
  let status = 200;
  const headers = { "Content-Type": AUDIO_CONTENT_TYPES[ext], "Accept-Ranges": "bytes" };

  if (rangeHeader) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);
    const rangeStart = match?.[1] === "" ? null : Number(match?.[1]);
    const rangeEnd = match?.[2] === "" ? null : Number(match?.[2]);
    if (!match || (rangeStart === null && rangeEnd === null) ||
      (rangeStart !== null && (!Number.isInteger(rangeStart) || rangeStart < 0)) ||
      (rangeEnd !== null && (!Number.isInteger(rangeEnd) || rangeEnd < 0)) ||
      (rangeStart !== null && rangeStart >= stat.size) ||
      (rangeStart !== null && rangeEnd !== null && rangeStart > rangeEnd)) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    if (rangeStart === null) {
      start = Math.max(0, stat.size - rangeEnd);
    } else {
      start = rangeStart;
    }
    end = rangeEnd === null ? end : Math.min(rangeEnd, end);
    if (start > end) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      return res.end();
    }
    status = 206;
    headers["Content-Range"] = `bytes ${start}-${end}/${stat.size}`;
  }
  headers["Content-Length"] = end - start + 1;
  const stream = fs.createReadStream(filePath, { start, end });
  stream.on("error", () => {
    if (!res.destroyed) res.destroy();
  });
  stream.pipe(res.writeHead(status, headers));
}

async function buildWaveform(filePath, bins) {
  const stat = fs.statSync(filePath);
  const cacheDir = path.join(projectRoot, ".cache", "waveforms");
  const cacheKey = crypto.createHash("sha1")
    .update(`v2|${filePath}|${stat.size}|${stat.mtimeMs}|${bins}`)
    .digest("hex");
  const cachePath = path.join(cacheDir, `${cacheKey}.json`);
  if (fs.existsSync(cachePath)) {
    return { status: 200, payload: JSON.parse(fs.readFileSync(cachePath, "utf8")) };
  }

  try {
    const pcm = await new Promise((resolve, reject) => {
      const child = spawn("ffmpeg", ["-v", "error", "-i", filePath, "-ac", "1", "-ar", "8000", "-f", "s16le", "-"]);
      const chunks = [];
      let error = "";
      child.stdout.on("data", (chunk) => chunks.push(chunk));
      child.stderr.on("data", (chunk) => { error += chunk.toString(); });
      child.on("error", reject);
      child.on("close", (code) => code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(error.trim() || `FFmpeg terminó con código ${code}`)));
    });
    const sampleCount = Math.floor(pcm.length / 2);
    const rmsValues = Array.from({ length: bins }, (_, bucket) => {
      const from = Math.floor(bucket * sampleCount / bins);
      const to = Math.max(from + 1, Math.floor((bucket + 1) * sampleCount / bins));
      const count = Math.max(0, Math.min(to, sampleCount) - from);
      if (!count) return 0;
      let sumSquares = 0;
      for (let i = from; i < Math.min(to, sampleCount); i++) {
        const sample = pcm.readInt16LE(i * 2) / 32768;
        sumSquares += sample * sample;
      }
      return Math.sqrt(sumSquares / count);
    });
    const maxRms = Math.max(...rmsValues, 0);
    const peaks = rmsValues.map((rms) => Number((maxRms === 0 ? 0 : rms / maxRms).toFixed(2)));
    const payload = { ok: true, peaks, duration: sampleCount / 8000 };
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(payload));
    return { status: 200, payload };
  } catch (error) {
    return { status: 503, payload: { ok: false, error: `FFmpeg no disponible o falló: ${error.message}` } };
  }
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
    ".jpeg": "image/jpeg",
    ".woff2": "font/woff2",
    ".woff": "font/woff",
    ".json": "application/json",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".map": "application/json"
  };
  res.writeHead(200, {
    "Content-Type": types[ext] || "application/octet-stream",
    "Cache-Control": "no-cache"
  });
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
    const stdoutBuffer = new LineBuffer();
    const stderrBuffer = new LineBuffer();
    const outputStdoutDecoder = new StringDecoder("utf8");
    const outputStderrDecoder = new StringDecoder("utf8");

    // Register process for cancellation
    if (processId) {
      runningProcesses.set(processId, child);
    }

    const handleStdoutLines = (lines) => {
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
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
    };

    const handleStderrLines = (lines) => {
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;
        res.write(`data: ${JSON.stringify({ type: "log", message: line, stream: "stderr" })}\n\n`);
      }
    };

    child.stdout.on("data", (data) => {
      const text = typeof data === "string" ? data : outputStdoutDecoder.write(data);
      output += text;
      handleStdoutLines(stdoutBuffer.push(text));
    });

    child.stderr.on("data", (data) => {
      const text = typeof data === "string" ? data : outputStderrDecoder.write(data);
      output += text;
      handleStderrLines(stderrBuffer.push(text));
    });

    child.on("close", (code) => {
      const stdoutTail = outputStdoutDecoder.end();
      const stderrTail = outputStderrDecoder.end();
      output += stdoutTail + stderrTail;
      handleStdoutLines(stdoutBuffer.push(stdoutTail));
      handleStderrLines(stderrBuffer.push(stderrTail));
      handleStdoutLines(stdoutBuffer.flush());
      handleStderrLines(stderrBuffer.flush());
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
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");
    child.stdout.on("data", (data) => {
      output += typeof data === "string" ? data : stdoutDecoder.write(data);
    });
    child.stderr.on("data", (data) => {
      output += typeof data === "string" ? data : stderrDecoder.write(data);
    });
    child.on("close", (code) => {
      output += stdoutDecoder.end() + stderrDecoder.end();
      if (code === 0) {
        resolve({ ok: true, output });
      } else {
        resolve({ ok: false, error: output || `Process failed with code ${code}` });
      }
    });
  });
}
