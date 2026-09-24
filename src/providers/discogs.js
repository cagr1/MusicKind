import { cached, fetchJson, USER_AGENT } from './http.js';
export class DiscogsClient {
  constructor({ key, secret, cache, fetcher = fetchJson } = {}) {
    this.key = key;
    this.secret = secret;
    this.cache = cache;
    this.fetcher = fetcher;
    this.queue = Promise.resolve();
    this.lastRequestAt = 0;
  }
  async request(url) {
    const task = this.queue.then(async () => {
      const waitMs = Math.max(0, 1100 - (Date.now() - this.lastRequestAt));
      if (waitMs) await new Promise(resolve => setTimeout(resolve, waitMs));
      this.lastRequestAt = Date.now();
      return this.fetcher(url, { headers: { 'User-Agent': USER_AGENT } });
    });
    this.queue = task.catch(() => {});
    return task;
  }
  async search(artist, track) {
    const structured = await this.searchQuery(`artist=${artist}|track=${track}`, { artist, track });
    if (structured.length) return structured;

    const cleanTrack = track
      .replace(/\[[^\]]*\]/g, ' ')
      .replace(/\s*\((?:original|extended)\s+mix\)\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const query = `${artist} ${cleanTrack}`.trim();
    return this.searchQuery(`q=${query}`, { q: query });
  }
  async searchQuery(cacheKey, params) {
    return cached(this.cache, `discogs:${cacheKey}`, async () => {
      const url = new URL('https://api.discogs.com/database/search');
      url.search = new URLSearchParams({ type: 'release', ...params, key: this.key, secret: this.secret }).toString();
      const data = await this.request(url.toString());
      return (data.results || []).slice(0, 3).map(result => ({ styles: result.style || [], genres: result.genre || [] }));
    });
  }
  async getStyleResults(artist, track) { return (await this.search(artist, track)).map(x => x.styles); }
  async getTags(artist, track) { return (await this.search(artist, track)).flatMap(x => x.styles); }
  async getGenres(artist, track) { return (await this.search(artist, track)).flatMap(x => x.genres); }
}
