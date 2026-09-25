import test from "node:test";
import assert from "node:assert/strict";
import {
  compareHarmonic,
  compareTempo,
  createSetSequence,
} from "../src/set-sequencer.js";

test("normalizes Camelot and reports compatible relationships", () => {
  assert.equal(compareHarmonic("08a", "8A"), "same");
  assert.equal(compareHarmonic("12A", "1A"), "adjacent");
  assert.equal(compareHarmonic("8A", "8B"), "relative");
  assert.equal(compareHarmonic("8A", "10B"), "clash");
  assert.equal(compareHarmonic(null, "8A"), "unknown");
});

test("detects half and double tempo without rewriting BPM", () => {
  assert.deepEqual(compareTempo(64, 128), {
    bpmDelta: 0,
    tempoRelation: "double",
  });
  assert.deepEqual(compareTempo(128, 64), {
    bpmDelta: 0,
    tempoRelation: "half",
  });
  assert.deepEqual(compareTempo(null, 64), {
    bpmDelta: null,
    tempoRelation: "unknown",
  });
});

test("sequences deterministically independent of input permutation", () => {
  const tracks = [
    { id: "c", bpm: 126, camelot: "9A", artist: "C" },
    { id: "a", bpm: 120, camelot: "8A", artist: "A" },
    { id: "b", bpm: 124, camelot: "8A", artist: "B" },
  ];
  const run = (input) =>
    createSetSequence({ sections: [{ key: "warmup", tracks: input }] });
  assert.deepEqual(run(tracks), run([...tracks].reverse()));
  assert.deepEqual(run(tracks).sections[0].order, ["a", "b", "c"]);
});

test("keeps every track once and puts missing BPM last in original order", () => {
  const result = createSetSequence({
    sections: [
      {
        key: "warmup",
        tracks: [
          { id: "known-2", bpm: 124, camelot: null },
          { id: "unknown-a", bpm: null, camelot: null },
          { id: "known-1", bpm: 120, camelot: "8A" },
          { id: "unknown-b", bpm: null, camelot: "8A" },
        ],
      },
    ],
  });
  assert.deepEqual(result.sections[0].order, [
    "known-1",
    "known-2",
    "unknown-a",
    "unknown-b",
  ]);
  assert.equal(new Set(result.sections[0].order).size, 4);
  assert.equal(result.sections[0].transitions.at(-1).harmonic, "unknown");
});

test("links section boundaries, handles one track and empty sections", () => {
  const result = createSetSequence({
    sections: [
      { key: "warmup", tracks: [{ id: "a", bpm: 120, camelot: "8A" }] },
      { key: "peak", tracks: [] },
      { key: "closing", tracks: [{ id: "b", bpm: 128, camelot: "8B" }] },
    ],
  });
  assert.equal(result.sections[0].transitions[0].from, null);
  assert.equal(result.sections[2].transitions[0].from, "a");
  assert.equal(result.sections[2].transitions[0].to, "b");
  assert.deepEqual(result.sections[1].order, []);
});

test("sequences 1,000 tracks within the five second gate", () => {
  const tracks = Array.from({ length: 1000 }, (_, index) => ({
    id: `track-${String(index).padStart(4, "0")}`,
    bpm: 80 + (index % 90),
    camelot: `${(index % 12) + 1}${index % 2 ? "A" : "B"}`,
    artist: `Artist ${index % 17}`,
  }));
  const start = performance.now();
  const result = createSetSequence({ sections: [{ key: "warmup", tracks }] });
  assert.equal(result.sections[0].order.length, 1000);
  assert.ok(performance.now() - start < 5000);
});

test("rejects duplicate ids", () => {
  assert.throws(
    () =>
      createSetSequence({
        sections: [{ key: "x", tracks: [{ id: "a" }, { id: "a" }] }],
      }),
    /único/,
  );
});
