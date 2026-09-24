import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const envMap = { discogsKey: 'DISCOGS_KEY', discogsSecret: 'DISCOGS_SECRET', lastfmApiKey: 'LASTFM_API_KEY', acoustidApiKey: 'ACOUSTID_API_KEY' };
export function loadAppKeys({ env = process.env, settings = {}, filePath = path.join(root, 'config/app-keys.json') } = {}) {
  let file = {};
  try { file = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch {}
  return Object.fromEntries(Object.entries(envMap).map(([key, variable]) => [key, env[variable] || file[key] || file[variable] || settings[key] || '']));
}
