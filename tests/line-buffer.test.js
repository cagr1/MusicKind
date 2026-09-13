import test from "node:test";
import assert from "node:assert/strict";
import { LineBuffer } from "../src/line-buffer.js";

test("LineBuffer emite líneas completas cuando llegan en un solo chunk", () => {
  const lb = new LineBuffer();
  const lines = lb.push(Buffer.from("[PROGRESS:1/2] Processing: a.mp3\n[PROGRESS:2/2] Processing: b.mp3\n"));
  assert.deepEqual(lines, ["[PROGRESS:1/2] Processing: a.mp3", "[PROGRESS:2/2] Processing: b.mp3"]);
  assert.deepEqual(lb.flush(), []);
});

test("LineBuffer recompone una línea [PROGRESS:X/Y] partida a mitad de chunk", () => {
  const lb = new LineBuffer();
  const part1 = "[PROGRESS:3/1";
  const part2 = "0] Processing: track.mp3\n";
  let lines = lb.push(Buffer.from(part1));
  assert.deepEqual(lines, [], "no debe emitir nada hasta ver el \\n");
  lines = lb.push(Buffer.from(part2));
  assert.deepEqual(lines, ["[PROGRESS:3/10] Processing: track.mp3"]);
});

test("LineBuffer emite la última línea sin \\n solo en flush() al cerrar el proceso", () => {
  const lb = new LineBuffer();
  const lines = lb.push(Buffer.from("línea completa\nresto sin salto"));
  assert.deepEqual(lines, ["línea completa"]);
  assert.deepEqual(lb.flush(), ["resto sin salto"]);
  assert.deepEqual(lb.flush(), [], "flush() debe quedar vacío tras vaciarse");
});

test("LineBuffer recompone un carácter UTF-8 multibyte partido entre chunks", () => {
  const lb = new LineBuffer();
  const text = "Processing: canción japonesa 日本語.mp3\n";
  const full = Buffer.from(text, "utf8");
  // Split in the middle of a multibyte sequence (e.g. within "ó" or "日")
  const splitAt = Math.floor(full.length / 2);
  const chunk1 = full.subarray(0, splitAt);
  const chunk2 = full.subarray(splitAt);

  let lines = lb.push(chunk1);
  // StringDecoder withholds incomplete multibyte tails, so no premature garbled output
  lines = lines.concat(lb.push(chunk2));
  assert.deepEqual(lines, [text.slice(0, -1)]);
});

test("LineBuffer no corrompe una secuencia multibyte partida exactamente a mitad de byte", () => {
  const lb = new LineBuffer();
  const text = "[PROGRESS:1/2] Processing: Café Ñandú.mp3\n";
  const full = Buffer.from(text, "utf8");

  // "é" (U+00E9) is encoded as the 2-byte sequence 0xC3 0xA9 in UTF-8.
  // Find its offset and split the buffer right between the two bytes,
  // guaranteeing the split lands mid-multibyte-sequence (not by chance).
  const eIndex = full.indexOf(Buffer.from("é", "utf8"));
  assert.ok(eIndex >= 0, "el texto de prueba debe contener 'é'");
  const splitAt = eIndex + 1; // after the first byte of "é" (0xC3), before 0xA9

  const chunk1 = full.subarray(0, splitAt);
  const chunk2 = full.subarray(splitAt);

  let lines = lb.push(chunk1);
  assert.deepEqual(lines, [], "no debe emitir nada mientras el multibyte está incompleto");
  lines = lines.concat(lb.push(chunk2));
  assert.deepEqual(lines, [text.slice(0, -1)]);
});

test("LineBuffer maneja múltiples splits arbitrarios sin perder ni corromper líneas", () => {
  const lb = new LineBuffer();
  const text = "[PROGRESS:1/3] Processing: uno.mp3\n[PROGRESS:2/3] Processing: dos düsseldorf.mp3\n[PROGRESS:3/3] Processing: tres.mp3\n";
  const full = Buffer.from(text, "utf8");
  const collected = [];
  for (let i = 0; i < full.length; i += 5) {
    const chunk = full.subarray(i, Math.min(i + 5, full.length));
    collected.push(...lb.push(chunk));
  }
  collected.push(...lb.flush());
  assert.deepEqual(collected, [
    "[PROGRESS:1/3] Processing: uno.mp3",
    "[PROGRESS:2/3] Processing: dos düsseldorf.mp3",
    "[PROGRESS:3/3] Processing: tres.mp3"
  ]);
});
