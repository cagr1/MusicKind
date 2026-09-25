'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { buildRuntimePath } = require('../electron/runtime-path.cjs');

test('PATH development conserva entradas y añade rutas conocidas sin duplicados', () => {
  assert.equal(buildRuntimePath({ currentPath: '/usr/bin:/opt/homebrew/bin' }), '/usr/bin:/opt/homebrew/bin:/usr/local/bin');
});

test('PATH empaquetado antepone Resources/bin y elimina duplicados', () => {
  assert.equal(buildRuntimePath({
    currentPath: '/usr/bin:/usr/local/bin:/usr/bin',
    packaged: true,
    resourcesPath: '/Applications/MusicKind.app/Contents/Resources',
    platform: 'darwin'
  }), '/Applications/MusicKind.app/Contents/Resources/bin:/usr/bin:/usr/local/bin:/opt/homebrew/bin');
});

test('mantiene PATH intacto en otras plataformas', () => {
  assert.equal(buildRuntimePath({ currentPath: 'C:\\Windows\\System32;C:\\Tools', packaged: true, resourcesPath: 'C:\\resources', platform: 'win32' }), 'C:\\Windows\\System32;C:\\Tools');
});
