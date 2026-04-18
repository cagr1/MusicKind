import fs from "fs";
import path from "path";
import crypto from "crypto";
import { DEFAULT_SUPPORTED_EXTENSIONS, ERROR_CODES, IGNORE_REASONS, MANIFEST_VERSION } from "./constants.js";
import { createMusicMetadataAdapter } from "./adapters/music-metadata-adapter.js";
import { createFFprobeAdapter } from "./adapters/ffprobe-adapter.js";
import { isHiddenName, isSupportedExtension, toAbsoluteNormalized } from "./path-utils.js";

export async function ingestAudio(input, options = {}) {
  const startedAt = new Date().toISOString();
  const result = createBaseResult(input, startedAt);

  try {
    const validationErrors = validateInput(input);
    if (validationErrors.length > 0) {
      result.errors.push(...validationErrors);
      result.ok = false;
      result.finishedAt = new Date().toISOString();
      updateSummary(result);
      return result;
    }

    const normalizedInput = normalizeInput(input);
    result.summary.targetsReceived = normalizedInput.targets.length;
    const metadataAdapter = resolveMetadataAdapter(normalizedInput, options);
    const discovered = [];
    const visited = new Set();

    for (const target of normalizedInput.targets) {
      const resolvedTarget = toAbsoluteNormalized(target);
      result.summary.targetsResolved += 1;

      let stat;
      try {
        stat = fs.statSync(resolvedTarget.normalized);
      } catch (err) {
        result.errors.push(buildError(ERROR_CODES.TARGET_NOT_FOUND, `No se encontro la ruta: ${target}`, {
          target,
          path: resolvedTarget.portable,
          details: { originalMessage: err.message }
        }));
        result.ok = false;
        continue;
      }

      if (stat.isDirectory()) {
        walkDirectory({
          rootDir: resolvedTarget.normalized,
          recursive: normalizedInput.recursive,
          includeHidden: normalizedInput.includeHidden,
          supportedExtensionsSet: normalizedInput.supportedExtensionsSet,
          visited,
          files: discovered,
          ignored: result.manifest.ignored
        });
      } else if (stat.isFile()) {
        pushCandidateFile({
          filePath: resolvedTarget.normalized,
          includeHidden: normalizedInput.includeHidden,
          supportedExtensionsSet: normalizedInput.supportedExtensionsSet,
          visited,
          files: discovered,
          ignored: result.manifest.ignored
        });
      } else {
        result.manifest.ignored.push({
          path: resolvedTarget.portable,
          reason: IGNORE_REASONS.NOT_A_FILE,
          message: "La ruta no es un archivo de audio ni una carpeta"
        });
      }
    }

    result.summary.filesDiscovered = discovered.length;

    for (const filePath of discovered) {
      const fileDescriptor = toAbsoluteNormalized(filePath);
      const ext = path.extname(fileDescriptor.normalized).toLowerCase();
      const entry = {
        id: createManifestId(fileDescriptor.normalized),
        path: {
          absolute: fileDescriptor.normalized,
          portable: fileDescriptor.portable,
          name: path.basename(fileDescriptor.normalized),
          directory: toAbsoluteNormalized(path.dirname(fileDescriptor.normalized)).portable,
          extension: ext
        },
        sizeBytes: null,
        durationSeconds: null,
        format: {
          detectedBy: metadataAdapter.name,
          container: null,
          codec: null,
          sampleRate: null,
          bitrate: null
        },
        status: normalizedInput.dryRun ? "dry-run" : "ready"
      };

      try {
        const stat = fs.statSync(fileDescriptor.normalized);
        entry.sizeBytes = stat.size;

        if (normalizedInput.collectMetadata) {
          const metadata = await metadataAdapter.probeAudio(fileDescriptor.normalized);
          entry.durationSeconds = toRoundedSeconds(metadata?.durationSeconds);
          entry.format.container = metadata?.formatName || ext.replace(".", "") || null;
          entry.format.codec = metadata?.codecName || null;
          entry.format.sampleRate = toNumberOrNull(metadata?.sampleRate);
          entry.format.bitrate = toNumberOrNull(metadata?.bitrate);
        } else {
          entry.format.container = ext.replace(".", "") || null;
        }
      } catch (err) {
        result.ok = false;
        result.errors.push(buildError(ERROR_CODES.METADATA_READ_FAILED, `No se pudo leer metadata de ${entry.path.portable}`, {
          path: entry.path.portable,
          details: { originalMessage: err.message }
        }));

        entry.status = "error";
        entry.error = {
          code: ERROR_CODES.METADATA_READ_FAILED,
          message: err.message
        };
      }

      result.manifest.files.push(entry);
    }

    result.finishedAt = new Date().toISOString();
    updateSummary(result);
    return result;
  } catch (err) {
    result.ok = false;
    result.errors.push(buildError(ERROR_CODES.INTERNAL_ERROR, "Fallo inesperado en audio-ingestion", {
      details: { originalMessage: err.message }
    }));
    result.finishedAt = new Date().toISOString();
    updateSummary(result);
    return result;
  }
}

function createBaseResult(input, startedAt) {
  return {
    ok: true,
    startedAt,
    finishedAt: null,
    dryRun: Boolean(input?.dryRun),
    manifest: {
      version: MANIFEST_VERSION,
      generatedAt: startedAt,
      files: [],
      ignored: []
    },
    summary: {
      targetsReceived: 0,
      targetsResolved: 0,
      filesDiscovered: 0,
      supportedFiles: 0,
      ignoredFiles: 0,
      errors: 0
    },
    errors: [],
    warnings: []
  };
}

function normalizeInput(input) {
  const supportedExtensions = input.supportedExtensions || DEFAULT_SUPPORTED_EXTENSIONS;

  return {
    targets: input.targets && input.targets.length > 0 ? input.targets : [input.target],
    dryRun: Boolean(input.dryRun),
    recursive: input.recursive !== false,
    includeHidden: Boolean(input.includeHidden),
    collectMetadata: input.collectMetadata !== false,
    metadataAdapter: input.metadataAdapter || "music-metadata",
    ffprobeOptions: input.ffprobeOptions || {},
    supportedExtensionsSet: new Set(supportedExtensions.map((ext) => ext.toLowerCase()))
  };
}

function validateInput(input) {
  const errors = [];

  if (!input || typeof input !== "object") {
    errors.push(buildError(ERROR_CODES.INVALID_INPUT, "Input invalido: se esperaba un objeto"));
    return errors;
  }

  const hasTarget = typeof input.target === "string" && input.target.trim().length > 0;
  const hasTargets = Array.isArray(input.targets) && input.targets.some((item) => typeof item === "string" && item.trim().length > 0);

  if (!hasTarget && !hasTargets) {
    errors.push(buildError(ERROR_CODES.INVALID_INPUT, "Debes enviar 'target' o 'targets' con rutas validas"));
  }

  if (input.targets && !Array.isArray(input.targets)) {
    errors.push(buildError(ERROR_CODES.INVALID_INPUT, "'targets' debe ser un arreglo de rutas"));
  }

  if (input.supportedExtensions && !Array.isArray(input.supportedExtensions)) {
    errors.push(buildError(ERROR_CODES.INVALID_INPUT, "'supportedExtensions' debe ser un arreglo de extensiones"));
  }

  return errors;
}

function resolveMetadataAdapter(input, options) {
  if (options.metadataAdapter) {
    return options.metadataAdapter;
  }

  if (input.metadataAdapter === "ffprobe") {
    return createFFprobeAdapter(input.ffprobeOptions || {});
  }

  return createMusicMetadataAdapter();
}

function walkDirectory(context) {
  const {
    rootDir,
    recursive,
    includeHidden,
    supportedExtensionsSet,
    visited,
    files,
    ignored
  } = context;

  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch (err) {
    ignored.push({
      path: toAbsoluteNormalized(rootDir).portable,
      reason: ERROR_CODES.TARGET_NOT_ACCESSIBLE,
      message: `No se pudo leer la carpeta: ${err.message}`
    });
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);

    if (!includeHidden && isHiddenName(entry.name)) {
      ignored.push({
        path: toAbsoluteNormalized(fullPath).portable,
        reason: IGNORE_REASONS.HIDDEN_FILE,
        message: "Elemento oculto ignorado"
      });
      continue;
    }

    if (entry.isDirectory()) {
      if (recursive) {
        walkDirectory({ rootDir: fullPath, recursive, includeHidden, supportedExtensionsSet, visited, files, ignored });
      }
      continue;
    }

    if (entry.isFile()) {
      pushCandidateFile({ filePath: fullPath, includeHidden, supportedExtensionsSet, visited, files, ignored });
    }
  }
}

function pushCandidateFile(context) {
  const { filePath, includeHidden, supportedExtensionsSet, visited, files, ignored } = context;
  const descriptor = toAbsoluteNormalized(filePath);

  if (!includeHidden && isHiddenName(path.basename(descriptor.normalized))) {
    ignored.push({
      path: descriptor.portable,
      reason: IGNORE_REASONS.HIDDEN_FILE,
      message: "Archivo oculto ignorado"
    });
    return;
  }

  if (visited.has(descriptor.normalized)) {
    ignored.push({
      path: descriptor.portable,
      reason: IGNORE_REASONS.DUPLICATED_PATH,
      message: "Archivo duplicado por targets superpuestos"
    });
    return;
  }

  visited.add(descriptor.normalized);

  if (!isSupportedExtension(descriptor.normalized, supportedExtensionsSet)) {
    ignored.push({
      path: descriptor.portable,
      reason: IGNORE_REASONS.UNSUPPORTED_EXTENSION,
      message: "Extension no soportada"
    });
    return;
  }

  files.push(descriptor.normalized);
}

function updateSummary(result) {
  result.summary.supportedFiles = result.manifest.files.length;
  result.summary.ignoredFiles = result.manifest.ignored.length;
  result.summary.errors = result.errors.length;
}

function buildError(code, message, extra = {}) {
  return {
    code,
    message,
    target: extra.target || null,
    path: extra.path || null,
    details: extra.details || null
  };
}

function createManifestId(value) {
  return crypto.createHash("sha1").update(value).digest("hex");
}

function toRoundedSeconds(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.round(value * 1000) / 1000;
}

function toNumberOrNull(value) {
  return Number.isFinite(value) ? value : null;
}
