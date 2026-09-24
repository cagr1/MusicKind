#!/usr/bin/env node
import { classifyByTags } from "./tag-classifier.js";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1] ?? null;
}

try {
  await classifyByTags({
    inputRoot: arg("--input-root"),
    excludeRoots: process.argv.flatMap((value, index) => value === "--exclude-root" && process.argv[index + 1] ? [process.argv[index + 1]] : []),
    destRoot: arg("--dest-root")
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
