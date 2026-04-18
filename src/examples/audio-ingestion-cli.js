#!/usr/bin/env node
import path from "path";
import { ingestAudio } from "../skills/audio-ingestion.js";

const args = process.argv.slice(2);
const target = args[0];

if (!target) {
  console.error("Uso: node src/examples/audio-ingestion-cli.js <ruta> [--dry-run] [--ffprobe]");
  process.exit(1);
}

const dryRun = args.includes("--dry-run");
const useFFprobe = args.includes("--ffprobe");

const result = await ingestAudio({
  target: path.resolve(target),
  dryRun,
  metadataAdapter: useFFprobe ? "ffprobe" : "music-metadata"
});

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result.manifest, null, 2));
