# MusicKind — CLAUDE.md

## Start of every session

Read `PROJECT_STATE.md` before doing anything. It has the full architecture, what works, what's broken, and the ordered fix list. Do not ask for context that is already there.

---

## What is this project

MusicKind is a desktop-first DJ tool (Electron 28 + Node.js) for:
- **Genre classification** via Spotify / Last.fm APIs
- **DJ set creation** (warmup / peak / closing) scored against a local collection
- **Audio conversion** (MP3 / WAV / AIFF / FLAC) via FFmpeg
- **Metadata editing** + Spotify auto-tagging
- **BPM / key analysis** via Python + librosa

Runs as an Electron desktop app and also as a local web dashboard at `localhost:3030`.

---

## Architecture at a glance

```
electron/       Desktop shell. IPC handlers. Starts backend automatically.
  main.cjs      openDirectory, openFiles, checkFFmpeg, installFFmpeg, is-electron
  preload.cjs   Exposes electronAPI to renderer

src/
  server.js     Node.js HTTP server on port 3030. All API routes. Spawns subprocesses.
  cli.js        Genre classifier CLI (spawned by server).
  metadata_editor.js  Metadata read / write / rename / identify.
  spotify.js    Spotify Web API client (retry + cache).
  lastfm.js     Last.fm API client.
  cache.js      JSON cache for API responses (.cache/api-cache.json).
  utils.js      Legacy file discovery. Superseded by audio-ingestion.
  classify.js   Genre classification logic.
  bpm_analyzer.py     BPM + key via librosa. Outputs [PROGRESS:X/Y] + JSON blob.
  run_classification.py  Set scoring. Wrong progress format (see PROJECT_STATE.md §5).
  convert_audio.py    Format conversion via FFmpeg. Wrong progress format (see §5).
  audio_features.py   Shared librosa feature extraction.

  services/
    audio-discovery.js      Wraps audio-ingestion for server use.
    metadata-list-api.js    Builds /api/metadata/list response.

  skills/audio-ingestion/   Structured file discovery with manifest, dedup, dry-run.

ui/
  index.html    Single-page dashboard.
  app.js        All frontend logic (~1551 lines).
  styles.css    Dashboard styles.

config/
  genres.json   Active genre list (12 genres).
  settings.json Spotify/LastFM credentials + defaultOutputDir.

tests/
  audio-ingestion.test.js   (4 tests — node --test)
  metadata-editor.test.js   (11 tests — node --test)
  server-metadata-list.test.js
```

---

## Key decisions (do not revisit)

| Decision | Reason |
|---|---|
| Desktop-first (Electron) | `showDirectoryPicker()` returns a handle, not a path. Server needs real OS paths. |
| No `showDirectoryPicker()` | Returns `FileSystemDirectoryHandle` — unusable as a path string. |
| `Runtime` object for context | `const Runtime = { isElectron: Boolean(window.electronAPI?.openDirectory) }` evaluated once. |
| `AppState.ffmpegReady` | Single flag set at startup via `initAppState()`. All tabs subscribe via `onFfmpegStateChange()`. |
| `defaultOutputDir` in Settings | Stored in `config/settings.json`. Tabs use it as default, can override per operation. |
| Spotify keys mandatory | `/api/genre-classify` returns HTTP 400 with a clear message if keys are missing. |
| audio-ingestion as canonical discovery | All file discovery goes through `services/audio-discovery.js`. `utils.listAudioFiles()` is deprecated. |
| `safePath()` for all path inputs | Server must validate all path params: `path.resolve()` + optional `mustExist`. Blocks path traversal. |

---

## Rules for working on this codebase

1. **Read PROJECT_STATE.md first.** It has the full bug list and fix order.
2. **One problem at a time.** Fix in the order listed in §8 of PROJECT_STATE.md.
3. **Read before editing.** Always read the relevant lines of a file before changing them.
4. **No new modules.** The architecture is sufficient. Add to existing files.
5. **No new features.** Fix what exists. The product is feature-complete for MVP.
6. **Run tests after touching metadata-editor or audio-ingestion.**
   - `npm run test:metadata-editor`
   - `npm run test:audio-ingestion`
7. **app.js is ~1551 lines, server.js is ~575 lines.** Always specify exact line numbers when editing.
8. **Progress format for subprocess output:** server parses `[PROGRESS:X/Y] Processing: file`. Python scripts must match this exactly.
9. **SSE endpoints need:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`.
10. **Backend errors go to stderr.** Check the `output` variable in server.js when debugging subprocess failures.

---

## Running the project

```bash
# Desktop app
npm run electron

# Web dashboard only
npm run dashboard         # starts server on localhost:3030

# Tests
npm run test:metadata-editor
npm run test:audio-ingestion
npm run test:metadata-endpoint
```

**Requirements:** Node.js, Electron 28, Python 3 with `librosa` and `numpy` in PATH, FFmpeg (for conversion and metadata write).

---

## Current fix priority (from PROJECT_STATE.md §8)

1. Validate Electron startup (single window, stable backend lifecycle)
2. Genres UI — verify chips render from server data
3. SSE headers — add `res.writeHead(200, SSE headers)` to `runProcessWithProgress`
4. Error propagation — surface subprocess stderr in `{ type:'complete', error }` events
5. Cancel flag — fix `isKilled` in `cancelProcess` + `runProcessWithProgress`
6. Progress format — fix `convert_audio.py` and `run_classification.py` print statements (1 line each)
7. BPM results — parse JSON stdout from `bpm_analyzer.py`, emit as SSE result event; delete double-fetch at app.js L1267-1276
8. Metadata form HTML — add editing form to `#tab-metadata` in index.html
