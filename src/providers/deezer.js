import { cached, fetchJson } from './http.js';
export class DeezerClient {
  constructor({ cache, fetcher = fetchJson } = {}) { this.cache = cache; this.fetcher = fetcher; }
  async search(artist, title) {
    const query = [artist && `artist:"${artist}"`, title && `track:"${title}"`].filter(Boolean).join(' ');
    return cached(this.cache, `deezer:${query}`, async () => {
      const data = await this.fetcher(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);
      const track = data.data?.[0];
      if (!track) return null;
      const details = track.id ? await this.fetcher(`https://api.deezer.com/track/${track.id}`) : track;
      return { artist: track.artist?.name || '', title: track.title || '', album: track.album?.title || '', isrc: track.isrc || details.isrc || '', bpm: details.bpm || null, cover: track.album?.cover_medium || '', releaseDate: details.release_date || '' };
    });
  }
}
