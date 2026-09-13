import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { checkPythonImport } from "../src/server.js";

test("check-deps exige el venv y no hace fallback al Python del sistema", async () => {
  let options;
  const result = await checkPythonImport("librosa", {
    getPythonCommand: (received) => {
      options = received;
      throw new Error("venv ausente");
    }
  });

  assert.deepEqual(options, { requireVenv: true });
  assert.equal(result, false);
});

test("checkPythonImport usa únicamente el intérprete entregado por el venv", async () => {
  const child = new EventEmitter();
  const calls = [];
  const result = await checkPythonImport("numpy", {
    getPythonCommand: async ({ requireVenv }) => {
      assert.equal(requireVenv, true);
      return "/managed/venv/bin/python";
    },
    spawnImpl: (command, args, options) => {
      calls.push({ command, args, options });
      queueMicrotask(() => child.emit("close", 0));
      return child;
    }
  });

  assert.equal(result, true);
  assert.equal(calls[0].command, "/managed/venv/bin/python");
  assert.deepEqual(calls[0].args, ["-c", "import numpy"]);
});
