import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import test from "node:test";
import { createServer } from "../src/server.js";

const ffmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

function startServer() {
  const server = createServer();
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function base(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function makeWav() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-media-"));
  const file = path.join(dir, "tone.wav");
  if (ffmpeg) spawnSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-loglevel", "error", file]);
  return file;
}

function makeHalfVolumeWav() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-waveform-"));
  const file = path.join(dir, "levels.wav");
  const sampleRate = 8000;
  const samples = sampleRate;
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const amplitude = i < samples / 2 ? 0.25 : 1;
    const value = Math.round(Math.sin(2 * Math.PI * 440 * i / sampleRate) * amplitude * 32767);
    data.writeInt16LE(value, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, data]));
  return file;
}

test("media endpoints validan ruta, extensión y existencia", async (t) => {
  const server = await startServer();
  t.after(() => server.close());
  for (const [endpoint, expected] of [["/api/audio", 400], ["/api/waveform", 400], ["/api/artwork", 400]]) {
    const response = await fetch(`${base(server)}${endpoint}?path=relative.wav`);
    assert.equal(response.status, expected);
  }
  const unsupported = await fetch(`${base(server)}/api/audio?path=${encodeURIComponent("/tmp/file.txt")}`);
  assert.equal(unsupported.status, 415);
  const missing = await fetch(`${base(server)}/api/audio?path=${encodeURIComponent("/tmp/missing-musickind.wav")}`);
  assert.equal(missing.status, 404);
});

test("/api/audio transcodifica AIFF una vez y sirve FLAC con rangos", { skip: !ffmpeg }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-aiff-"));
  const file = path.join(dir, "tone.aiff");
  assert.equal(spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", file]).status, 0);
  let transcodes = 0;
  const server = createServer({ mediaSpawn: (...args) => { transcodes++; return spawn(...args); } });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const url = `${base(server)}/api/audio?path=${encodeURIComponent(file)}`;
  const [first, second] = await Promise.all([fetch(url), fetch(url)]);
  assert.equal(first.status, 200);
  assert.equal(second.headers.get("content-type"), "audio/flac");
  assert.ok((await first.arrayBuffer()).byteLength > 0);
  assert.equal(transcodes, 1);
  const range = await fetch(url, { headers: { Range: "bytes=0-99" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-type"), "audio/flac");
  assert.equal((await range.arrayBuffer()).byteLength, 100);
  assert.equal(transcodes, 1);
});

test("/api/artwork extrae y cachea carátulas y devuelve 404 si no hay imagen", { skip: !ffmpeg }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-artwork-"));
  const audio = path.join(dir, "tone.wav");
  const cover = path.join(dir, "cover.jpg");
  const tagged = path.join(dir, "tagged.mp3");
  assert.equal(spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", audio]).status, 0);
  assert.equal(spawnSync("ffmpeg", ["-y", "-v", "error", "-f", "lavfi", "-i", "color=c=red:s=32x32", "-frames:v", "1", cover]).status, 0);
  assert.equal(spawnSync("ffmpeg", ["-y", "-v", "error", "-i", audio, "-i", cover, "-map", "0:a", "-map", "1:v", "-c:a", "libmp3lame", "-c:v", "mjpeg", "-disposition:v:0", "attached_pic", "-id3v2_version", "3", tagged]).status, 0);
  const server = await startServer();
  t.after(() => { server.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const imageUrl = `${base(server)}/api/artwork?path=${encodeURIComponent(tagged)}`;
  const image = await fetch(imageUrl);
  assert.equal(image.status, 200);
  assert.match(image.headers.get("content-type"), /^image\/(jpeg|png)$/);
  assert.ok((await image.arrayBuffer()).byteLength > 0);
  const cached = await fetch(imageUrl);
  assert.equal(cached.status, 200);
  const empty = await fetch(`${base(server)}/api/artwork?path=${encodeURIComponent(audio)}`);
  assert.equal(empty.status, 404);
  assert.deepEqual(await empty.json(), { ok: false });
});

test("/api/audio entrega el archivo completo y rangos 206", { skip: !ffmpeg }, async (t) => {
  const file = makeWav();
  const server = await startServer();
  t.after(() => server.close());
  const url = `${base(server)}/api/audio?path=${encodeURIComponent(file)}`;
  const full = await fetch(url);
  assert.equal(full.status, 200);
  assert.equal(full.headers.get("accept-ranges"), "bytes");
  assert.equal(full.headers.get("content-type"), "audio/wav");
  const range = await fetch(url, { headers: { Range: "bytes=0-99" } });
  assert.equal(range.status, 206);
  assert.equal(range.headers.get("content-range"), expectContentRange(range.headers.get("content-range")));
  assert.equal((await range.arrayBuffer()).byteLength, 100);
});

test("/api/convert emite el resultado estructurado por SSE", { skip: !ffmpeg }, async (t) => {
  const input = makeWav();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-convert-"));
  const server = await startServer();
  t.after(() => server.close());

  const response = await fetch(`${base(server)}/api/convert`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      inputPath: input,
      outputPath: output,
      format: "wav",
      processId: `test-convert-${Date.now()}`
    })
  });
  assert.equal(response.status, 200);
  const events = (await response.text())
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
  const resultEvent = events.find((event) => event.type === "result");
  assert.ok(resultEvent);
  assert.equal(resultEvent.results[0].ok, true);
  assert.ok(resultEvent.results[0].sizeOut > 0);
});

function expectContentRange(value) {
  assert.match(value || "", /^bytes 0-99\/\d+$/);
  return value;
}

test("/api/waveform devuelve bins y duración", { skip: !ffmpeg }, async (t) => {
  const file = makeWav();
  const server = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${base(server)}/api/waveform?path=${encodeURIComponent(file)}&bins=32`);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.peaks.length, 32);
  assert.ok(body.peaks.every((peak) => peak >= 0 && peak <= 1));
  assert.ok(body.duration > 0);
});

test("/api/waveform usa RMS normalizado por pista", { skip: !ffmpeg }, async (t) => {
  const file = makeHalfVolumeWav();
  const server = await startServer();
  t.after(() => server.close());
  const response = await fetch(`${base(server)}/api/waveform?path=${encodeURIComponent(file)}&bins=32`);
  assert.equal(response.status, 200);
  const { peaks } = await response.json();
  assert.ok(peaks.slice(0, 16).every((peak) => peak >= 0.23 && peak <= 0.27));
  assert.ok(peaks.slice(16).every((peak) => peak >= 0.99 && peak <= 1));
});
