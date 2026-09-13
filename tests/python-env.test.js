import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ensurePythonEnv,
  getVenvDir,
  getVenvPython,
  isSupportedPythonVersion,
  resolvePython,
  splitBufferedLines,
  redactDiagnostic
} from "../src/python-env.js";

function fakeSpawnFactory({ failOn, pipMissing = false, architectureMissing = false } = {}) {
  const calls = [];
  const spawnImpl = (command, args) => {
    calls.push([command, ...args]);
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => {
      const key = args.join(" ");
      if (failOn && key.includes(failOn)) {
        child.stderr.emit("data", Buffer.from("installation failed\n"));
        child.emit("close", 1);
        return;
      }
      if (args[0] === "--version") child.stdout.emit("data", Buffer.from("Python 3.11.4\n"));
      if (args[0] === "-m" && args[1] === "pip" && !pipMissing) child.stdout.emit("data", Buffer.from("pip 24.0 from /tmp/venv (python 3.11)\n"));
      if (args[0] === "-c" && !architectureMissing) child.stdout.emit("data", Buffer.from("arm64\n"));
      child.emit("close", 0);
    });
    return child;
  };
  return { calls, spawnImpl };
}

test("resuelve las rutas POSIX y Windows del venv", () => {
  const root = "/tmp/musickind-test";
  assert.equal(getVenvDir(root, { MUSIC_KIND_DATA_DIR: "/data" }), "/data/python-venv");
  assert.equal(getVenvDir(root, {}), "/tmp/musickind-test/.runtime/python-venv");
  assert.equal(getVenvPython("/data/python-venv", "darwin"), "/data/python-venv/bin/python");
  assert.equal(getVenvPython("C:\\data\\python-venv", "win32"), "C:\\data\\python-venv/Scripts/python.exe");
});

test("acepta Python >= 3.9 y rechaza versiones anteriores", () => {
  assert.equal(isSupportedPythonVersion([3, 9, 0]), true);
  assert.equal(isSupportedPythonVersion([3, 11, 0]), true);
  assert.equal(isSupportedPythonVersion([3, 8, 19]), false);
});

test("crea venv, actualiza herramientas, instala grupo y verifica imports en orden", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-python-"));
  const { calls, spawnImpl } = fakeSpawnFactory();
  const stages = [];
  await ensurePythonEnv({
    projectRoot: root,
    env: { MUSIC_KIND_DATA_DIR: path.join(root, "data") },
    packages: ["librosa", "numpy"],
    spawnImpl,
    onStage: (stage) => stages.push(stage)
  });
  assert.deepEqual(stages, ["preparing", "pip", "packages", "verify"]);
  assert.equal(calls.some((call) => call[1] === "-m" && call[2] === "venv" && call[3] === path.join(root, "data", "python-venv")), true);
  assert.equal(calls.filter((call) => call[1] === "-m" && call[2] === "pip" && call[3] === "install").length, 2);
  assert.equal(calls.some((call) => call[1] === "-c" && call[2] === "import librosa"), true);
  assert.equal(calls.some((call) => call[1] === "-c" && call[2] === "import numpy"), true);
  assert.equal(calls.flat().some((value) => /break-system|sudo|--user/.test(value)), false);
});

test("rechaza un grupo vacío y conserva la causa de un fallo", async () => {
  await assert.rejects(() => ensurePythonEnv({ projectRoot: "/tmp/x", packages: [] }), /vacío/);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-python-fail-"));
  const { spawnImpl } = fakeSpawnFactory({ failOn: "demucs" });
  await assert.rejects(
    () => ensurePythonEnv({ projectRoot: root, packages: ["demucs"], spawnImpl }),
    /instalar los paquetes/
  );
});

test("prefiere un venv funcional y falla de forma accionable si se exige y falta", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-python-pref-"));
  const venvDir = getVenvDir(root, { MUSIC_KIND_DATA_DIR: path.join(root, "data") });
  const venvPython = getVenvPython(venvDir, "linux");
  fs.mkdirSync(path.dirname(venvPython), { recursive: true });
  fs.writeFileSync(venvPython, "fake");
  const { calls, spawnImpl } = fakeSpawnFactory();
  const resolved = await resolvePython({ projectRoot: root, env: { MUSIC_KIND_DATA_DIR: path.join(root, "data") }, spawnImpl });
  assert.equal(resolved.source, "venv");
  assert.equal(calls[0][0], venvPython);
  await assert.rejects(
    () => resolvePython({ projectRoot: "/tmp/no-venv", env: { MUSIC_KIND_DATA_DIR: "/tmp/no-venv-data" }, requireVenv: true, spawnImpl }),
    /Configuración/
  );
});

test("conserva fragmentos parciales al convertir salida en líneas", () => {
  let result = splitBufferedLines("primera", " línea\nsegunda");
  assert.deepEqual(result, { lines: ["primera línea"], remainder: "segunda" });
  result = splitBufferedLines(result.remainder, " línea\n");
  assert.deepEqual(result, { lines: ["segunda línea"], remainder: "" });
});

test("redacta Bearer, parámetros sensibles y credenciales URL", () => {
  const value = redactDiagnostic("Bearer abc key=one&token=two https://user:pass@example.test/x?api_key=three");
  assert.equal(value.includes("abc"), false);
  assert.equal(value.includes("one"), false);
  assert.equal(value.includes("two"), false);
  assert.equal(value.includes("user:pass"), false);
  assert.equal(value.includes("three"), false);
});

test("rechaza intérpretes sin pip o sin arquitectura", async () => {
  const noPip = fakeSpawnFactory({ pipMissing: true });
  await assert.rejects(() => resolvePython({ projectRoot: "/tmp/no-pip", spawnImpl: noPip.spawnImpl }), /No se encontró Python/);
  const noArchitecture = fakeSpawnFactory({ architectureMissing: true });
  await assert.rejects(() => resolvePython({ projectRoot: "/tmp/no-arch", spawnImpl: noArchitecture.spawnImpl }), /No se encontró Python/);
});
