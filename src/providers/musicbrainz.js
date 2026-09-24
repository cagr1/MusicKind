import { cached, fetchJson } from './http.js';
const lastCall = new WeakMap();
export class MusicBrainzClient {
  constructor({ cache, fetcher = fetchJson } = {}) { this.cache = cache; this.fetcher = fetcher; }
  async recording(mbid) {
    return cached(this.cache, `musicbrainz:${mbid}`, async () => {
      const previous = lastCall.get(this) || 0;
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 1000 - (Date.now() - previous))));
      lastCall.set(this, Date.now());
      return this.fetcher(`https://musicbrainz.org/ws/2/recording/${encodeURIComponent(mbid)}?inc=artists+releases+tags+genres&fmt=json`);
    });
  }
}
