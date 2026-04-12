import { sleep } from "./utils.js";

export class LastFmClient {
  constructor({ apiKey, cache }) {
    this.apiKey = apiKey;
    this.cache = cache;
    this.timeoutMs = Number(process.env.LASTFM_TIMEOUT_MS ?? "10000");
  }

  async getTrackTags(artist, track) {
    const key = `lastfm:track:${artist}|${track}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const url = `https://ws.audioscrobbler.com/2.0/?method=track.gettoptags&artist=${encodeURIComponent(artist)}&track=${encodeURIComponent(track)}&api_key=${this.apiKey}&format=json`;
    const data = await fetchJsonWithRetry(url, this.timeoutMs);
    const tags = (data?.toptags?.tag ?? []).map((t) => t.name).filter(Boolean);
    this.cache.set(key, tags);
    return tags;
  }

  async getArtistTags(artist) {
    const key = `lastfm:artist:${artist}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const url = `https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=${encodeURIComponent(artist)}&api_key=${this.apiKey}&format=json`;
    const data = await fetchJsonWithRetry(url, this.timeoutMs);
    const tags = (data?.toptags?.tag ?? []).map((t) => t.name).filter(Boolean);
    this.cache.set(key, tags);
    return tags;
  }
}

async function fetchJsonWithRetry(url, timeoutMs, attempt = 0) {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (res.status === 429 || res.status === 503) {
    const waitMs = Math.min(10_000, (attempt + 1) * 1000);
    await sleep(waitMs);
    if (attempt < 5) return fetchJsonWithRetry(url, timeoutMs, attempt + 1);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Last.fm error: ${res.status} ${text}`);
  }
  const data = await res.json();
  if (data?.error) {
    throw new Error(`Last.fm error: ${data.message || data.error}`);
  }
  return data;
}

async function fetchWithTimeout(url, timeoutMs) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Last.fm request timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  const fetchPromise = fetch(url);
  fetchPromise.catch(() => {});
  return Promise.race([fetchPromise, timeout]);
}
