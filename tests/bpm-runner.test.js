import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { runBpmAnalyzer } from "../src/bpm-runner.js";

function makeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killCalls = [];
  child.kill = (signal) => child.killCalls.push(signal);
  return child;
}

test("BPM analyzer escala de SIGTERM a SIGKILL y limpia al cerrar", async () => {
  const child = makeChild();
  child.kill = (signal) => {
    child.killCalls.push(signal);
    if (signal === "SIGKILL") queueMicrotask(() => child.emit("close", null));
    return true;
  };
  const promise = runBpmAnalyzer("python", "/analyzer.py", "/song.mp3", {
    spawnImpl: () => child,
    timeoutMs: 10,
    timeoutGraceMs: 5
  });

  await assert.rejects(promise, /BPM analyzer timeout after 10ms/);
  assert.deepEqual(child.killCalls, ["SIGTERM", "SIGKILL"]);
  assert.equal(child.listenerCount("close"), 0);
  assert.equal(child.listenerCount("error"), 0);
  assert.equal(child.stdout.listenerCount("data"), 0);
  assert.equal(child.stderr.listenerCount("data"), 0);
});

test("BPM analyzer limpia el timeout y listeners al cerrar", async () => {
  const child = makeChild();
  const promise = runBpmAnalyzer("python", "/analyzer.py", "/song.mp3", {
    spawnImpl: () => {
      queueMicrotask(() => {
        child.stdout.emit("data", "[ok]");
        child.emit("close", 0);
      });
      return child;
    },
    timeoutMs: 100
  });

  assert.deepEqual(await promise, { code: 0, stdout: "[ok]", stderr: "" });
  assert.deepEqual(child.killCalls, []);
  assert.equal(child.listenerCount("close"), 0);
  assert.equal(child.stdout.listenerCount("data"), 0);
});

test("BPM analyzer conserva UTF-8 dividido entre chunks", async () => {
  const child = makeChild();
  const encoded = Buffer.from("canción 🎵\n", "utf8");
  const splitAt = encoded.indexOf(0xc3) + 1;
  const promise = runBpmAnalyzer("python", "/analyzer.py", "/song.mp3", {
    spawnImpl: () => {
      queueMicrotask(() => {
        child.stdout.emit("data", encoded.subarray(0, splitAt));
        child.stdout.emit("data", encoded.subarray(splitAt));
        child.emit("close", 0);
      });
      return child;
    }
  });

  assert.deepEqual(await promise, { code: 0, stdout: "canción 🎵\n", stderr: "" });
});
