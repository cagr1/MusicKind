import assert from 'node:assert/strict';
import test from 'node:test';
import { loadAppKeys } from '../src/providers/app-keys.js';
import { DiscogsClient } from '../src/providers/discogs.js';
import { DeezerClient } from '../src/providers/deezer.js';
import { JsonCache } from '../src/cache.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('app keys prefer env, then app file, then settings', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-keys-'));
  const filePath = path.join(directory, 'keys.json');
  fs.writeFileSync(filePath, JSON.stringify({ discogsKey: 'file', discogsSecret: 'file-secret', lastfmApiKey: 'file-lastfm', acoustidApiKey: 'file-acoustid' }));
  assert.deepEqual(loadAppKeys({ env: { DISCOGS_KEY: 'env' }, settings: { discogsKey: 'setting', acoustidApiKey: 'setting-acoustid' }, filePath }), {
    discogsKey: 'env', discogsSecret: 'file-secret', lastfmApiKey: 'file-lastfm', acoustidApiKey: 'file-acoustid',
  });
  fs.rmSync(directory, { recursive: true, force: true });
});

test('app keys file accepts camelCase and environment-style names', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'mk-key-aliases-'));
  const filePath = path.join(directory, 'keys.json');
  fs.writeFileSync(filePath, JSON.stringify({ DISCOGS_KEY: 'dk', DISCOGS_SECRET: 'ds', LASTFM_API_KEY: 'lf', ACOUSTID_API_KEY: 'ak' }));
  assert.deepEqual(loadAppKeys({ env: {}, filePath }), { discogsKey: 'dk', discogsSecret: 'ds', lastfmApiKey: 'lf', acoustidApiKey: 'ak' });
  fs.rmSync(directory, { recursive: true, force: true });
});

test('Discogs reads singular style and genre fields and caches searches', async () => {
  const cache = new JsonCache(path.join(os.tmpdir(), `mk-provider-${Date.now()}.json`));
  let calls = 0;
  const client = new DiscogsClient({ key: 'k', secret: 's', cache, fetcher: async () => { calls++; return { results: [{ style: ['Deep House'], genre: ['Electronic'] }] }; } });
  assert.deepEqual(await client.getTags('artist', 'title'), ['Deep House']);
  assert.deepEqual(await client.getGenres('artist', 'title'), ['Electronic']);
  assert.equal(calls, 1);
});

test('Discogs retries an empty artist and track search with a cleaned free-text query', async () => {
  const cache = new JsonCache(path.join(os.tmpdir(), `mk-discogs-fallback-${Date.now()}.json`));
  const urls = [];
  const client = new DiscogsClient({ key: 'k', secret: 's', cache, fetcher: async url => {
    urls.push(new URL(url));
    if (urls.length === 1) return { results: [] };
    return { results: [{ style: ['House', 'Deep House'], genre: ['Electronic'] }] };
  } });

  assert.deepEqual(await client.search('Black Coffee', 'The Rapture Pt.III (Original Mix) [Extended]'), [
    { styles: ['House', 'Deep House'], genres: ['Electronic'] },
  ]);
  assert.equal(urls.length, 2);
  assert.equal(urls[0].searchParams.get('artist'), 'Black Coffee');
  assert.equal(urls[0].searchParams.get('track'), 'The Rapture Pt.III (Original Mix) [Extended]');
  assert.equal(urls[1].searchParams.get('q'), 'Black Coffee The Rapture Pt.III');
  assert.equal(urls[1].searchParams.has('artist'), false);
});

test('Deezer resolves track metadata using injected fetcher', async () => {
  const responses = [{ data: [{ id: 5, title: 'Track', artist: { name: 'Artist' }, album: { title: 'Album', cover_medium: 'cover' }, isrc: 'ISRC' }] }, { bpm: 124, release_date: '2024-01-01' }];
  const client = new DeezerClient({ fetcher: async () => responses.shift() });
  assert.deepEqual(await client.search('Artist', 'Track'), { artist: 'Artist', title: 'Track', album: 'Album', isrc: 'ISRC', bpm: 124, cover: 'cover', releaseDate: '2024-01-01' });
});

test('Deezer retries an empty advanced search with cleaned free text and checks artist identity', async () => {
  const urls = [];
  const responses = [
    { data: [] },
    { data: [{ id: 42, title: 'Losing It', artist: { name: 'FÍSHER' }, album: { title: 'Boom' } }] },
    { bpm: 125, release_date: '2018-06-01' },
  ];
  const client = new DeezerClient({ fetcher: async url => { urls.push(new URL(url)); return responses.shift(); } });

  assert.equal((await client.search('Fisher', 'Losing It (Original Mix) [Extended]')).artist, 'FÍSHER');
  assert.equal(urls.length, 3);
  assert.match(urls[0].searchParams.get('q'), /artist:/);
  assert.equal(urls[1].searchParams.get('q'), 'Fisher Losing It');

  const wrongArtist = new DeezerClient({ fetcher: async () => ({ data: [{ title: 'Losing It', artist: { name: 'Someone Else' } }] }) });
  assert.equal(await wrongArtist.search('Fisher', 'Losing It'), null);
});

test('provider HTTP honors Retry-After on 429', async () => {
  const { fetchJson } = await import('../src/providers/http.js');
  let attempts = 0;
  const result = await fetchJson('https://unit.test/resource', { retries: 1, fetchImpl: async () => {
    attempts++;
    return attempts === 1
      ? { status: 429, headers: { get: () => '0' } }
      : { ok: true, json: async () => ({ ok: true }) };
  } });
  assert.deepEqual(result, { ok: true });
  assert.equal(attempts, 2);
});
