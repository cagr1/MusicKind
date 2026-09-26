import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTrackTitle, normalizeArtistName } from '../src/providers/http.js';
import { DeezerClient, explicitVersion, withoutExplicitVersion } from '../src/providers/deezer.js';

test('normaliza nombres de artista ignorando puntuación y separadores', () => {
  assert.equal(normalizeArtistName('RUN DMC'), normalizeArtistName('Run-DMC'));
  assert.equal(normalizeArtistName('run.dmc'), normalizeArtistName('Run-DMC'));
});

test('elimina marcas promocionales y conserva descriptores de versión', () => {
  assert.equal(cleanTrackTitle("It's Like That  (Raxon Edit) Unrelease"), "It's Like That (Raxon Edit)");
  assert.equal(cleanTrackTitle('Track [FREE DL] (Promo)'), 'Track');
  assert.equal(cleanTrackTitle('Track (Extended Remix)'), 'Track (Extended Remix)');
});

test('exporta detección y eliminación del descriptor de versión', () => {
  assert.ok(explicitVersion("It's Like That (Raxon Edit)"));
  assert.equal(withoutExplicitVersion("It's Like That (Raxon Edit) Unrelease"), "It's Like That");
});

test('usa una clave deezer:v3', async () => {
  const keys = [];
  const cache = { get: (key) => undefined, set: (key) => keys.push(key) };
  const client = new DeezerClient({ cache, fetcher: async () => ({ data: [] }) });
  await client.search('Bicep', 'Glue');
  assert.ok(keys.length);
  assert.ok(keys.every((key) => key.startsWith('deezer:v3:')));
});
