'use strict';

const SYSTEM_PATHS = ['/opt/homebrew/bin', '/usr/local/bin'];

function buildRuntimePath({ currentPath = '', packaged = false, resourcesPath = '', platform = process.platform } = {}) {
  const delimiter = platform === 'win32' ? ';' : ':';
  if (platform !== 'darwin') return currentPath;
  const paths = [];
  if (packaged && resourcesPath) paths.push(`${resourcesPath}/bin`);
  paths.push(...currentPath.split(delimiter).filter(Boolean), ...SYSTEM_PATHS);
  return [...new Set(paths)].join(delimiter);
}

module.exports = { buildRuntimePath };
