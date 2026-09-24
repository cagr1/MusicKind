import fs from "node:fs";
import path from "node:path";
import { getAudioExtensions } from "./services/audio-discovery.js";

const within = (candidate, root) => {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
};

function isAudio(file) {
  return getAudioExtensions().includes(path.extname(file).toLowerCase());
}

function realPathIfExists(value) {
  const absolute = path.resolve(value);
  try { return fs.realpathSync(absolute); } catch { /* resolve through the nearest existing ancestor */ }
  const parent = path.dirname(absolute);
  if (parent === absolute) return absolute;
  return path.join(realPathIfExists(parent), path.basename(absolute));
}

function isProtected(file, excludes) {
  const candidate = realPathIfExists(file);
  return excludes.some((root) => within(candidate, realPathIfExists(root)));
}

function manifestDirectory(destRoot) {
  return path.join(destRoot, ".musickind", "manifests");
}

function writeManifest(file, manifest) {
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(manifest, null, 2), { flag: "w" });
  fs.renameSync(temporary, file);
}

export function validateMoves({ moves, excludeRoots = [], destRoot }) {
  if (!Array.isArray(moves) || moves.length === 0) throw new Error("moves debe contener al menos un movimiento");
  if (typeof destRoot !== "string" || !path.isAbsolute(destRoot)) throw new Error("destRoot debe ser una ruta absoluta");
  if (!Array.isArray(excludeRoots) || excludeRoots.some((root) => typeof root !== "string" || !path.isAbsolute(root))) throw new Error("excludeRoots debe contener rutas absolutas");
  const destination = path.resolve(destRoot);
  const realDestination = realPathIfExists(destination);
  const excludes = excludeRoots.map((root) => path.resolve(root));
  if (excludes.some((root) => within(realDestination, realPathIfExists(root)))) throw new Error("destRoot no puede estar dentro de excludeRoots");
  const seenSources = new Set();
  for (const [index, move] of moves.entries()) {
    if (!move || typeof move.from !== "string" || typeof move.to !== "string" || !path.isAbsolute(move.from) || !path.isAbsolute(move.to)) throw new Error(`Movimiento ${index + 1}: from y to deben ser rutas absolutas`);
    const from = path.resolve(move.from);
    const to = path.resolve(move.to);
    if (from === to) throw new Error(`Origen y destino coinciden: ${from}`);
    if (seenSources.has(from)) throw new Error(`Movimiento duplicado: ${from}`);
    seenSources.add(from);
    if (!fs.existsSync(from) || !fs.statSync(from).isFile()) throw new Error(`Origen inexistente o no es archivo: ${from}`);
    if (!isAudio(from)) throw new Error(`Formato de audio no soportado: ${from}`);
    if (isProtected(from, excludes)) throw new Error(`Origen dentro de excludeRoots: ${from}`);
    if (!within(to, destination) || to === destination || !within(realPathIfExists(to), realDestination)) throw new Error(`Destino fuera de destRoot: ${to}`);
    if (isProtected(to, excludes)) throw new Error(`Destino dentro de excludeRoots: ${to}`);
  }
  return { destination, excludes };
}

function availableDestination(requested) {
  if (!fs.existsSync(requested)) return requested;
  const extension = path.extname(requested);
  const stem = requested.slice(0, requested.length - extension.length);
  for (let index = 2; ; index++) {
    const candidate = `${stem} (${index})${extension}`;
    if (!fs.existsSync(candidate)) return candidate;
  }
}

async function moveFile(from, to, renameSync = fs.renameSync) {
  fs.mkdirSync(path.dirname(to), { recursive: true });
  try {
    renameSync(from, to);
  } catch (error) {
    if (error.code !== "EXDEV") throw error;
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    if (fs.statSync(from).size !== fs.statSync(to).size) {
      fs.rmSync(to, { force: true });
      throw new Error("Verificación de tamaño fallida durante copia entre volúmenes");
    }
    fs.unlinkSync(from);
  }
}

export async function applyClassifyMoves({ moves, excludeRoots = [], destRoot, cancelled = () => false, onProgress = () => {}, renameSync = fs.renameSync }) {
  const { destination, excludes } = validateMoves({ moves, excludeRoots, destRoot });
  const directory = manifestDirectory(destination);
  const manifestPath = path.join(directory, `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}-${Math.random().toString(36).slice(2, 8)}.json`);
  const manifest = { createdAt: new Date().toISOString(), destRoot: destination, excludeRoots: excludes, undone: false,
    moves: moves.map(({ from, to }) => ({ from: path.resolve(from), to: path.resolve(to), status: "pending" })) };
  fs.mkdirSync(directory, { recursive: true });
  writeManifest(manifestPath, manifest);
  for (let index = 0; index < manifest.moves.length; index++) {
    const move = manifest.moves[index];
    if (cancelled()) break;
    try {
      if (!fs.existsSync(move.from) || isProtected(move.from, excludes)) throw new Error("El origen cambió o quedó protegido antes del movimiento");
      const actualTo = availableDestination(move.to);
      move.to = actualTo;
      await moveFile(move.from, actualTo, renameSync);
      move.status = "done";
    } catch (error) {
      move.status = "error";
      move.reason = error.message;
    }
    writeManifest(manifestPath, manifest);
    onProgress({ current: path.basename(move.from), processed: index + 1, total: manifest.moves.length, status: move.status });
  }
  return { manifestPath, manifest, cancelled: cancelled() };
}

export function listClassifyManifests(destRoot) {
  if (typeof destRoot !== "string" || !path.isAbsolute(destRoot)) throw new Error("destRoot debe ser una ruta absoluta");
  const directory = manifestDirectory(path.resolve(destRoot));
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort().map((name) => {
    const manifestPath = path.join(directory, name);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const moves = Array.isArray(manifest.moves) ? manifest.moves : [];
    return { manifestPath, createdAt: manifest.createdAt, total: moves.length, done: moves.filter((move) => move.status === "done" || move.status === "undone").length, undone: Boolean(manifest.undone) };
  });
}

export async function undoClassifyManifest({ manifestPath, excludeRoots = [], cancelled = () => false, onProgress = () => {}, renameSync = fs.renameSync }) {
  if (typeof manifestPath !== "string" || !path.isAbsolute(manifestPath) || path.extname(manifestPath) !== ".json") throw new Error("manifestPath inválido");
  const resolved = path.resolve(manifestPath);
  const manifest = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (!manifest.destRoot || path.resolve(resolved) !== path.join(manifestDirectory(path.resolve(manifest.destRoot)), path.basename(resolved))) throw new Error("El manifiesto debe estar dentro de destRoot/.musickind/manifests");
  if (!Array.isArray(manifest.moves) || manifest.undone) throw new Error("Manifiesto inválido o ya deshecho");
  const completed = manifest.moves.filter((move) => move.status === "done");
  for (let index = 0; index < completed.length; index++) {
    const move = completed[index];
    if (cancelled()) break;
    try {
      if (!within(move.to, manifest.destRoot)) throw new Error("Destino del movimiento fuera de destRoot del manifiesto");
      if (!fs.existsSync(move.to) || fs.existsSync(move.from) || isProtected(move.from, [...(manifest.excludeRoots || []), ...excludeRoots])) throw new Error("Destino ausente, origen ocupado o ruta protegida");
      await moveFile(move.to, move.from, renameSync);
      move.status = "undone";
      delete move.undoReason;
    } catch (error) {
      move.undoStatus = "error";
      move.undoReason = error.message;
    }
    writeManifest(resolved, manifest);
    onProgress({ current: path.basename(move.from), processed: index + 1, total: completed.length, status: move.status === "undone" ? "undone" : "error" });
  }
  manifest.undone = manifest.moves.filter((move) => move.status === "done").length === 0;
  writeManifest(resolved, manifest);
  return { manifestPath: resolved, manifest, cancelled: cancelled() };
}
