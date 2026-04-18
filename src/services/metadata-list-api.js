import { discoverAudioFiles } from "./audio-discovery.js";

export async function buildMetadataListResponse({ dirPath, recursive }) {
  const discovery = await discoverAudioFiles({
    target: dirPath,
    recursive
  });

  const structuralError = discovery.errors.find((error) =>
    error.code === "INVALID_INPUT" ||
    error.code === "TARGET_NOT_FOUND" ||
    error.code === "TARGET_NOT_ACCESSIBLE"
  );

  if (structuralError) {
    return {
      status: 400,
      payload: { ok: false, error: structuralError.message },
      logs: []
    };
  }

  const logs = [];
  if (discovery.errors.length > 0) {
    logs.push(`[audio-discovery] /api/metadata/list completed with ${discovery.errors.length} error(s) for ${dirPath}`);
  }

  return {
    status: 200,
    payload: {
      ok: true,
      files: discovery.files,
      summary: discovery.summary,
      ignored: discovery.ignored
    },
    logs
  };
}
