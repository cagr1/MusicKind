import { DEFAULT_SUPPORTED_EXTENSIONS, ingestAudio } from "../skills/audio-ingestion.js";

export async function discoverAudioFiles(options) {
  const {
    target,
    recursive = false,
    includeHidden = false,
    metadataAdapter = "music-metadata"
  } = options;

  const result = await ingestAudio({
    target,
    recursive,
    includeHidden,
    dryRun: true,
    collectMetadata: false,
    metadataAdapter,
    supportedExtensions: DEFAULT_SUPPORTED_EXTENSIONS
  });

  return {
    ok: result.ok,
    files: result.manifest.files.map((entry) => entry.path.absolute),
    ignored: result.manifest.ignored,
    errors: result.errors,
    summary: result.summary,
    manifestVersion: result.manifest.version
  };
}

export function getAudioExtensions() {
  return DEFAULT_SUPPORTED_EXTENSIONS;
}
