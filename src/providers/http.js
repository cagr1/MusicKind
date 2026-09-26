export const USER_AGENT = `MusicKind/1.0.0 (+https://github.com/cagr1/MusicKind)`;
export async function fetchJson(url, { timeoutMs = 8000, headers = {}, retries = 1, fetchImpl = fetch } = {}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try { response = await fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, ...headers }, signal: controller.signal }); }
    finally { clearTimeout(timer); }
    if (response.status === 429 && attempt < retries) {
      const retryAfter = response.headers.get('retry-after');
      const value = retryAfter === null ? NaN : Number(retryAfter);
      await new Promise(resolve => setTimeout(resolve, Number.isFinite(value) ? Math.max(0, Math.min(value * 1000, 30000)) : 1000));
      continue;
    }
    if (!response.ok) throw new Error(`Provider error ${response.status}`);
    return response.json();
  }
}
export function cached(cache, key, fetcher) {
  const previous = cache?.get(key);
  if (previous) return Promise.resolve(previous);
  return fetcher().then(value => { cache?.set(key, value); return value; });
}

export function cleanTrackTitle(title = '') {
  return String(title)
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\b(?:free\s+download|free\s+dl|unreleased|unrelease|promo|snippet)\b/gi, ' ')
    .replace(/[([]\s*[)\]]/g, ' ')
    .replace(/\s*\((?:original|extended)\s+mix\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeArtistName(name = '') {
  return String(name).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');
}

export function splitArtists(text = '') {
  return String(text)
    .split(/\s*,\s*|\s+&\s+|\s+feat\.\s+|\s+ft\.\s+|\s+x\s+|\s+vs\s+|\s+y\s+/i)
    .map(artist => artist.trim())
    .filter(Boolean);
}
