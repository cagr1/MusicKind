import { sleep } from "./utils.js";

export class SpotifyClient {
  constructor({ clientId, clientSecret, cache }) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.cache = cache;
    this.token = null;
    this.tokenExpiry = 0;
    this.timeoutMs = Number(process.env.SPOTIFY_TIMEOUT_MS ?? "15000");
  }

  async getAccessToken() {
    const now = Date.now();
    if (this.token && now < this.tokenExpiry - 60_000) return this.token;
    const key = `spotify:token`;
    const cached = this.cache.get(key);
    if (cached && now < cached.expiresAt - 60_000) {
      this.token = cached.token;
      this.tokenExpiry = cached.expiresAt;
      return this.token;
    }

    const creds = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString("base64");
    const res = await fetchWithTimeout("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    }, this.timeoutMs);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify token error: ${res.status} ${text}`);
    }

    const data = await res.json();
    this.token = data.access_token;
    this.tokenExpiry = now + data.expires_in * 1000;
    this.cache.set(key, { token: this.token, expiresAt: this.tokenExpiry });
    return this.token;
  }

  async request(url) {
    const token = await this.getAccessToken();
    return fetchWithRetry(url, {
      headers: { Authorization: `Bearer ${token}` }
    }, this.timeoutMs);
  }

  async searchTrack(artist, title) {
    const key = `spotify:search:${artist}|${title}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const query = artist ? `track:${title} artist:${artist}` : `track:${title}`;
    const q = encodeURIComponent(query);
    const url = `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`;
    const res = await this.request(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify search error: ${res.status} ${text}`);
    }
    const data = await res.json();
    const track = data.tracks?.items?.[0] ?? null;
    this.cache.set(key, track);
    return track;
  }

  async getArtist(artistId) {
    const key = `spotify:artist:${artistId}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const url = `https://api.spotify.com/v1/artists/${artistId}`;
    const res = await this.request(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify artist error: ${res.status} ${text}`);
    }
    const data = await res.json();
    this.cache.set(key, data);
    return data;
  }

  async getAudioFeatures(trackId) {
    const key = `spotify:audio:${trackId}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const url = `https://api.spotify.com/v1/audio-features/${trackId}`;
    const res = await this.request(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Spotify audio-features error: ${res.status} ${text}`);
    }
    const data = await res.json();
    this.cache.set(key, data);
    return data;
  }
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const timeout = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Spotify request timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  const fetchPromise = fetch(url, options);
  fetchPromise.catch(() => {});
  return Promise.race([fetchPromise, timeout]);
}

async function fetchWithRetry(url, options, timeoutMs, attempt = 0) {
  const res = await fetchWithTimeout(url, options, timeoutMs);
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get("retry-after"));
    const baseMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000;
    const waitMs = Math.min(30_000, baseMs * Math.pow(2, attempt));
    await sleep(waitMs);
    if (attempt < 7) return fetchWithRetry(url, options, timeoutMs, attempt + 1);
  }
  return res;
}
