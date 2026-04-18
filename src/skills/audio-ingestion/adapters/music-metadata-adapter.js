import { parseFile } from "music-metadata";

export function createMusicMetadataAdapter() {
  return {
    name: "music-metadata",
    async probeAudio(filePath) {
      const metadata = await parseFile(filePath, { duration: true, skipCovers: true });
      return {
        durationSeconds: toNumberOrNull(metadata?.format?.duration),
        formatName: metadata?.format?.container || null,
        codecName: metadata?.format?.codec || null,
        sampleRate: toNumberOrNull(metadata?.format?.sampleRate),
        bitrate: toNumberOrNull(metadata?.format?.bitrate)
      };
    }
  };
}

function toNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
