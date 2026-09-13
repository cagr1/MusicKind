import fs from "fs";
import path from "path";
import { spawn as defaultSpawn } from "child_process";
import { StringDecoder } from "string_decoder";

export const MIN_PYTHON = [3, 9];

export function getDataDir(projectRoot, env = process.env) {
  return env.MUSIC_KIND_DATA_DIR && env.MUSIC_KIND_DATA_DIR.trim()
    ? env.MUSIC_KIND_DATA_DIR.trim()
    : path.join(projectRoot, ".runtime");
}

export function getVenvDir(projectRoot, env = process.env) {
  return path.join(getDataDir(projectRoot, env), "python-venv");
}

export function getVenvPython(venvDir, platform = process.platform) {
  return platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

export function getInstallLogPath(projectRoot, env = process.env) {
  return path.join(getDataDir(projectRoot, env), "logs", "python-install.log");
}

export function parsePythonVersion(text) {
  const match = String(text || "").match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3] || 0)] : null;
}

export function isSupportedPythonVersion(version) {
  return Array.isArray(version)
    && (version[0] > MIN_PYTHON[0] || (version[0] === MIN_PYTHON[0] && version[1] >= MIN_PYTHON[1]));
}

export function splitBufferedLines(buffer, chunk) {
  const text = `${buffer || ""}${chunk == null ? "" : String(chunk)}`;
  const parts = text.split(/\r?\n/);
  return { lines: parts.slice(0, -1), remainder: parts.at(-1) || "" };
}

function lastUsefulStderr(stderr) {
  return String(stderr || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).at(-1) || "";
}

function commandFailure(label, result) {
  const detail = lastUsefulStderr(result?.stderr);
  return new Error(`${label} (código ${result?.code ?? "desconocido"})${detail ? `: ${redactDiagnostic(detail)}` : ""}`);
}

function runCommand(command, args, { cwd, spawnImpl = defaultSpawn, onOutput } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const consume = (stream, name) => {
      let remainder = "";
      const decoder = new StringDecoder("utf8");
      stream.on("data", (chunk) => {
        const text = typeof chunk === "string" ? chunk : decoder.write(chunk);
        if (name === "stdout") stdout += text;
        else stderr += text;
        const split = splitBufferedLines(remainder, text);
        remainder = split.remainder;
        for (const line of split.lines) if (line) onOutput?.(line, name);
      });
      stream.on("end", () => {
        remainder += decoder.end();
        if (remainder) onOutput?.(remainder, name);
      });
    };
    consume(child.stdout, "stdout");
    consume(child.stderr, "stderr");
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function probePython(command, options = {}) {
  const versionResult = await runCommand(command, ["--version"], options).catch(() => null);
  if (!versionResult || versionResult.code !== 0) return null;
  const version = parsePythonVersion(`${versionResult.stdout}\n${versionResult.stderr}`);
  if (!isSupportedPythonVersion(version)) return null;
  const pipResult = await runCommand(command, ["-m", "pip", "--version"], options).catch(() => null);
  if (!pipResult || pipResult.code !== 0) return null;
  const pipVersion = String(pipResult.stdout || pipResult.stderr).match(/pip\s+([^\s]+)/i)?.[1] || null;
  if (!pipVersion) return null;
  const venvResult = await runCommand(command, ["-m", "venv", "--help"], options).catch(() => null);
  if (!venvResult || venvResult.code !== 0) return null;
  const architectureResult = await runCommand(command, ["-c", "import platform; print(platform.machine())"], options).catch(() => null);
  const architecture = architectureResult?.code === 0 ? String(architectureResult.stdout).trim() : "";
  if (!architecture) return null;
  return { command, version, pipVersion, architecture };
}

export async function resolveBootstrapPython({ platform = process.platform, spawnImpl = defaultSpawn, cwd } = {}) {
  const candidates = platform === "win32" ? ["python", "python3"] : ["python3", "python"];
  for (const command of candidates) {
    const result = await probePython(command, { spawnImpl, cwd });
    if (result) return result;
  }
  throw new Error("No se encontró Python 3.9 o posterior con soporte para entornos virtuales.");
}

export async function isFunctionalVenv(venvPython, { spawnImpl = defaultSpawn, cwd } = {}) {
  if (!venvPython || !fs.existsSync(venvPython)) return false;
  return Boolean(await probePython(venvPython, { spawnImpl, cwd }));
}

export async function resolvePython({ projectRoot, env = process.env, platform = process.platform, spawnImpl = defaultSpawn, requireVenv = false } = {}) {
  const venvDir = getVenvDir(projectRoot, env);
  const venvPython = getVenvPython(venvDir, platform);
  if (await isFunctionalVenv(venvPython, { spawnImpl, cwd: projectRoot })) {
    const probe = await probePython(venvPython, { spawnImpl, cwd: projectRoot });
    return { ...probe, source: "venv", venvDir };
  }
  if (requireVenv) {
    throw new Error("El entorno de MusicKind no está listo. Instala las herramientas desde Configuración.");
  }
  const bootstrap = await resolveBootstrapPython({ platform, spawnImpl, cwd: projectRoot });
  return { ...bootstrap, source: "bootstrap", venvDir, venvPython };
}

export async function ensurePythonEnv({ projectRoot, env = process.env, platform = process.platform, packages, spawnImpl = defaultSpawn, onStage, onOutput } = {}) {
  if (!Array.isArray(packages) || packages.length === 0) throw new Error("Grupo de dependencias vacío.");
  const venvDir = getVenvDir(projectRoot, env);
  const venvPython = getVenvPython(venvDir, platform);
  const existing = await isFunctionalVenv(venvPython, { spawnImpl, cwd: projectRoot });
  const bootstrap = existing ? null : await resolveBootstrapPython({ platform, spawnImpl, cwd: projectRoot });

  if (!existing) {
    onStage?.("preparing", "Preparando entorno privado");
    const created = await runCommand(bootstrap.command, ["-m", "venv", venvDir], { cwd: projectRoot, spawnImpl, onOutput });
    if (created.code !== 0) throw commandFailure("No se pudo crear el entorno privado", created);
  }

  onStage?.("pip", "Actualizando instalador");
  const tools = await runCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"], { cwd: projectRoot, spawnImpl, onOutput });
  if (tools.code !== 0) throw commandFailure("No se pudo actualizar el instalador", tools);

  onStage?.("packages", "Instalando paquetes");
  const installed = await runCommand(venvPython, ["-m", "pip", "install", "--upgrade", ...packages], { cwd: projectRoot, spawnImpl, onOutput });
  if (installed.code !== 0) throw commandFailure("No se pudieron instalar los paquetes", installed);

  onStage?.("verify", "Verificando componentes");
  for (const packageName of packages) {
    const checked = await runCommand(venvPython, ["-c", `import ${packageName}`], { cwd: projectRoot, spawnImpl, onOutput });
    if (checked.code !== 0) throw commandFailure(`La verificación de ${packageName} falló`, checked);
  }
  const diagnostics = await probePython(venvPython, { spawnImpl, cwd: projectRoot });
  return { command: venvPython, venvDir, packages, ...diagnostics };
}

export function redactDiagnostic(text) {
  return String(text || "")
    .replace(/((?:^|[?&\s])(?:key|token|secret|password|api_key)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .replace(/(https?:\/\/)([^\s/@:]+):([^\s/@]+)@/gi, "$1[redacted]@");
}
