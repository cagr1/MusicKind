import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exportSetResults } from "../src/set-export.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "music-kind-export-"));
  const tracks = ["one.mp3", "two.mp3", "three.mp3", "four.mp3"].map((name) => {
    const file = path.join(root, name);
    fs.writeFileSync(file, "audio");
    return file;
  });
  return { root, tracks, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

test("exports non-empty groups in received order with absolute paths", () => {
  const f = fixture();
  try {
    const result = exportSetResults({ outputDir: f.root, baseName: "Friday", groups: {
      warmup: [{ path: f.tracks[1], artist: "A", title: "Second", duration: 45.7 }, { path: f.tracks[0] }],
      peak: [{ path: f.tracks[2], title: "Peak" }], closing: [], review: [],
    } });
    assert.equal(result.written.length, 2);
    const warmup = fs.readFileSync(path.join(f.root, "Friday - Warmup.m3u8"), "utf8");
    assert.equal(warmup, `#EXTM3U\n#EXTINF:46,A - Second\n${f.tracks[1]}\n#EXTINF:-1,one\n${f.tracks[0]}\n`);
    assert.equal(fs.existsSync(path.join(f.root, "Friday - Closing.m3u8")), false);
  } finally { f.cleanup(); }
});

test("reports conflicts without changing existing files, then overwrites when requested", () => {
  const f = fixture();
  try {
    const groups = { warmup: [{ path: f.tracks[0], title: "New" }] };
    const target = path.join(f.root, "Friday - Warmup.m3u8");
    fs.writeFileSync(target, "old playlist");
    const conflict = exportSetResults({ outputDir: f.root, baseName: "Friday", groups });
    assert.deepEqual(conflict, { conflict: true, existing: ["Friday - Warmup.m3u8"] });
    assert.equal(fs.readFileSync(target, "utf8"), "old playlist");
    exportSetResults({ outputDir: f.root, baseName: "Friday", groups, overwrite: true });
    assert.match(fs.readFileSync(target, "utf8"), /#EXTINF:-1,New\n/);
  } finally { f.cleanup(); }
});

test("rejects relative output and track paths, missing tracks, invalid names and protected roots", () => {
  const f = fixture();
  const groups = { warmup: [{ path: f.tracks[0] }] };
  try {
    assert.throws(() => exportSetResults({ outputDir: "relative", baseName: "x", groups }));
    assert.throws(() => exportSetResults({ outputDir: f.root, baseName: "../x", groups }));
    assert.throws(() => exportSetResults({ outputDir: f.root, baseName: "x/y", groups }));
    assert.throws(() => exportSetResults({ outputDir: f.root, baseName: "x", groups: { warmup: [{ path: "relative.mp3" }] } }));
    assert.throws(() => exportSetResults({ outputDir: f.root, baseName: "x", groups: { warmup: [{ path: path.join(f.root, "missing.mp3") }] } }));
    const protectedRoot = path.join(f.root, "MUSIC BACKUP", "2026", "exports");
    fs.mkdirSync(protectedRoot, { recursive: true });
    assert.throws(() => exportSetResults({ outputDir: protectedRoot, baseName: "x", groups }));
  } finally { f.cleanup(); }
});

test("removes line breaks from playlist metadata", () => {
  const f = fixture();
  try {
    exportSetResults({ outputDir: f.root, baseName: "Set", groups: { review: [{ path: f.tracks[0], artist: "Artist\r\nInjected", title: "Title\ncontinued" }] } });
    const text = fs.readFileSync(path.join(f.root, "Set - Por revisar.m3u8"), "utf8");
    assert.match(text, /#EXTINF:-1,Artist  Injected - Title continued\n/);
    assert.equal(text.split("\n").length, 4);
  } finally { f.cleanup(); }
});
