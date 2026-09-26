import { cached, cleanTrackTitle, fetchJson, normalizeArtistName, splitArtists } from './http.js';

function normalizedTitle(title = '') {
  return cleanTrackTitle(title)
    .replace(/[([][^)\]]*[)\]]/g, ' ')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function explicitVersion(title = '') {
  const descriptors = String(title).matchAll(/[([]([^\])]+)[)\]]/g);
  const descriptor = [...descriptors].map(match => match[1]).find(value =>
    /\b(?:remix|edit|dub|rework|bootleg)\b/i.test(value) ||
    (/\bmix\b/i.test(value) && !/\b(?:original|extended)\b/i.test(value))
  );
  if (!descriptor) return '';
  return descriptor.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function withoutExplicitVersion(title = '') {
  const descriptor = String(title).match(/[([]([^\])]+)[)\]]/g)?.find(value =>
    /\b(?:remix|edit|dub|rework|bootleg)\b|\bmix\b/i.test(value) && !/\b(?:original|extended)\b/i.test(value)
  );
  return cleanTrackTitle(descriptor ? String(title).replace(descriptor, ' ') : title);
}

function matchesRequestedArtist(resultArtist, requestedArtists) {
  const result = normalizeArtistName(resultArtist);
  return Boolean(result && requestedArtists.some(name => {
    const requested = normalizeArtistName(name);
    return requested && (requested === result || requested.includes(result) || result.includes(requested));
  }));
}

export class DeezerClient {
  constructor({ cache, fetcher = fetchJson } = {}) { this.cache = cache; this.fetcher = fetcher; }

  async search(artist, title) {
    const cleanTitle = cleanTrackTitle(title);
    const requestedVersion = explicitVersion(title);
    const cacheKey = `deezer:v3:${JSON.stringify([artist || '', cleanTitle])}`;
    return cached(this.cache, cacheKey, async () => {
      const requestedArtists = splitArtists(artist);
      const attempts = [];
      const advanced = [artist && `artist:"${artist}"`, cleanTitle && `track:"${cleanTitle}"`].filter(Boolean).join(' ');
      if (advanced) attempts.push(advanced);
      for (const requestedArtist of requestedArtists.slice(0, 4)) {
        attempts.push(`${requestedArtist} ${cleanTitle}`.trim());
      }
      if (cleanTitle) attempts.push(cleanTitle);

      for (const query of attempts.slice(0, 6)) {
        const data = await this.fetcher(`https://api.deezer.com/search?q=${encodeURIComponent(query)}`);
        const track = (data.data || []).slice(0, 5).find(candidate =>
          matchesRequestedArtist(candidate.artist?.name, requestedArtists) &&
          normalizedTitle(candidate.title) === normalizedTitle(cleanTitle) &&
          (!requestedVersion || candidate.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').includes(requestedVersion))
        );
        if (!track) continue;

        const details = track.id ? await this.fetcher(`https://api.deezer.com/track/${track.id}`) : track;
        return {
          artist: track.artist?.name || '', title: track.title || '', album: track.album?.title || '',
          isrc: track.isrc || details.isrc || '', bpm: details.bpm || null,
          cover: track.album?.cover_medium || '', releaseDate: details.release_date || '',
        };
      }
      return null;
    });
  }
}
