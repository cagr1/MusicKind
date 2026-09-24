import assert from "node:assert/strict";
import test from "node:test";
import { sourceFromReason } from "../src/classification-source.js";

test("sourceFromReason distingue origen embebido, online y filtrado", () => {
  const cases = {
    "id3:House": "embedded",
    "tag:house": "online",
    "spotify:pop": "spotify",
    "local:128": "bpm",
    "override:House": "override",
    "filtered:disabled-genre": "filtered",
    "lastfm:house": "unmatched",
    unmatched: "unmatched"
  };
  for (const [reason, expected] of Object.entries(cases)) {
    assert.equal(sourceFromReason(reason), expected, reason);
  }
});
