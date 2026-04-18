import path from "path";

export function toAbsoluteNormalized(inputPath) {
  const absolute = path.resolve(inputPath);
  const normalized = path.normalize(absolute);
  const portable = toPortablePath(normalized);
  return { absolute, normalized, portable };
}

export function toPortablePath(inputPath) {
  return inputPath.split(path.sep).join("/");
}

export function isHiddenName(name) {
  return name.startsWith(".");
}

export function isSupportedExtension(filePath, supportedExtensionsSet) {
  const ext = path.extname(filePath).toLowerCase();
  return supportedExtensionsSet.has(ext);
}
