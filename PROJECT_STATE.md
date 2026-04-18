# MusicKind — Project State

> Last updated: 2026-04-18
> Purpose: persistent context for LLM sessions. Read this before any work on the codebase.

---

## 1. Project Overview

MusicKind is a desktop-first DJ tool for:
- **Genre classification** of audio files using Spotify/Last.fm APIs
- **DJ set creation** (warmup/peak/closing) scored against an existing collection
- **Audio conversion** (MP3/WAV/AIFF/FLAC) via FFmpeg
- **Metadata editing** and Spotify auto-tagging
- **BPM/key analysis** via Python/librosa

Primary target: macOS, Electron desktop app. Also runs as a local web dashboard at `localhost:3030`.

---

## 2. Current Architecture

```
electron/           Desktop shell (Electron 28). Native dialogs, FFmpeg installer.
  main.cjs          IPC handlers: select-directory, select-files, check-ffmpeg, install-ffmpeg, is-electron.
                    Starts backend automatically and enforces single-instance window behavior.
  preload.cjs       Exposes electronAPI to renderer: openDirectory, openFiles, checkFFmpeg, installFFmpeg, isElectron

src/
  server.js         Node.js HTTP server on port 3030. All API endpoints. Spawns Python subprocesses.
  cli.js            Genre classifier CLI. Called by server as a Node subprocess.
  metadata_editor.js  Metadata read/write/rename/identify. ✅ Fixed in this session.
  spotify.js        Spotify Web API client with retry and cache.
  lastfm.js         Last.fm API client.
  cache.js          JSON file cache for API responses.
  utils.js          Legacy file discovery utilities. Partially superseded by audio-ingestion.
  classify.js       Genre classification logic (Spotify + audio features fallback).

  skills/
    audio-ingestion/  ✅ Structured discovery with manifest, adapters, dry-run, deduplication.
                      Integrated via services/audio-discovery.js. Tests pass.

  services/
    audio-discovery.js       Wraps audio-ingestion for server use.
    metadata-list-api.js     Builds /api/metadata/list response using discovery service.

  bpm_analyzer.py     BPM + key detection via librosa. Outputs [PROGRESS:X/Y] + JSON blob.
  run_classification.py  Set creation scoring. ⚠ Uses wrong progress format (see §5).
  convert_audio.py    Audio format conversion via FFmpeg. ⚠ Uses wrong progress format (see §5).
  audio_features.py   Shared librosa feature extraction.

ui/
  index.html        Single-page dashboard. Single Settings panel (no duplicated cfg-* IDs).
  app.js            All frontend logic. Metadata null-guards applied (critical crash resolved).
  styles.css        Dashboard styles.

config/
  genres.json       Active genre list (12 genres). Read by both server.js and cli.js.
  settings.json     Spotify/LastFM credentials + language preference.
                    Includes defaultOutputDir for global output defaults.

tests/
  audio-ingestion.test.js   ✅ 4 tests pass
  metadata-editor.test.js   ✅ 11 tests pass
```

**FFmpeg usage:** required by set-create (optional), convert, metadata write. Frontend uses global `AppState.ffmpegReady` initialized once in `initAppState()`.

**Python runtime:** `python3` must be in PATH. Dependencies: `librosa`, `numpy`. No virtual env enforced.

---

## 3. Key Decisions (already made, do not revisit)

| decision | rationale |
|---|---|
| **Desktop-first (Electron)** | `showDirectoryPicker()` (browser File System API) cannot return real OS paths — the server needs paths to spawn processes. Electron dialogs return real paths. Browser mode = text input only. |
| **No `showDirectoryPicker()`** | Returns `FileSystemDirectoryHandle`, not a path string. Assigning to `input.value` produces `"[object FileSystemDirectoryHandle]"`. Dead end. |
| **`Runtime` object for context detection** | Single `const Runtime = { isElectron: Boolean(window.electronAPI?.openDirectory) }` evaluated once. Not per-function detection. |
| **`AppState` for FFmpeg** | Single `AppState.ffmpegReady` populated once at startup via `initAppState()`. All tabs subscribe with `onFfmpegStateChange()`. Replaces 4+ independent checks. |
| **`defaultOutputDir` in Settings** | Global output directory stored in `config/settings.json`. Tabs read it as default, can override per operation. |
| **Spotify keys are mandatory for classification** | If `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` are missing, `/api/genre-classify` must return a clear user-facing error and not start classification. |
| **audio-ingestion as canonical discovery** | `utils.listAudioFiles()` and inline discovery in `server.js` are superseded. All file discovery goes through `services/audio-discovery.js → audio-ingestion`. |
| **`safePath()` for all path inputs** | Server must validate all path parameters from requests: `path.resolve()` + optional `mustExist` check. Blocks path traversal. Not yet implemented. |

---

## 4. What is Working

| module | status | notes |
|---|---|---|
| Genre classifier — backend | ✅ | `cli.js` emits correct `[PROGRESS:X/Y] Processing:` format. Server parses it. Progress bar updates in UI. |
| Genre classifier — API key validation | ✅ | `/api/genre-classify` now blocks execution with HTTP 400 + clear message when Spotify keys are missing. |
| Genre classifier — run/cancel buttons | ✅ | `clsRun` and `clsCancel` handlers are attached before the app.js crash. Buttons work. |
| Set creator — scoring algorithm | ✅ | `run_classification.py` produces correct warmup/peak/closing sets. |
| Set creator — counts check | ✅ | `/api/set-counts` works. |
| Audio converter — conversion | ✅ | `convert_audio.py` converts correctly via FFmpeg when it runs. |
| Metadata editor — `renameFile()` | ✅ FIXED | No longer doubles extension. Validates empty/traversal names. |
| Metadata editor — `writeMetadata()` | ✅ FIXED | Returns `{ ok, newPath, metadataWritten }`. Checks file exists before FFmpeg. |
| Metadata editor — `identifyAndTag()` | ✅ FIXED | `newFilename` derived from `path.basename(newPath)` not manual concat. |
| audio-ingestion skill | ✅ | Manifest, deduplication, dry-run, adapters. Integrated into server via services/. |
| `/api/metadata/list` | ✅ | Uses audio-ingestion via audio-discovery. Returns `{ ok, files, summary, ignored }`. |
| Metadata tab — load/list/identify UI | ✅ | `metaLoad`, `metaIdentifyAll`, `metaCancel` buttons work (attached before crash). |
| Electron — dialogs | ✅ | `openDirectory` and `openFiles` return real path strings. |
| Electron — startup flow | ✅ | Starts backend automatically and waits for readiness before loading window. Single-instance lock enabled. |
| Electron — FFmpeg install | ✅ | macOS (Homebrew), Windows (winget/choco). |
| Language toggle (ES/EN) | ✅ | Sidebar button works. `applyLanguage()` is hoisted — available before crash. |
| Settings — API (read/write) | ✅ | `/api/settings` GET and POST work correctly. |
| Cache | ✅ | Spotify/LastFM responses cached in `.cache/api-cache.json`. |

---

## 5. What is Broken / Partial

### Critical Bug #1 — app.js crash at metadata listeners (**RESOLVED**)

The `metaNewFilename`/metadata form references were crashing top-level execution. This is now guarded with null declarations + `if (element)` listener checks, so the script no longer stops when metadata form DOM is absent.

**Resolution applied:** metadata editor variables are declared defensively (`null`) and related listeners are guarded. This keeps app startup stable even without metadata form HTML.

---

### Genre Classifier — genres UI shows static text, not chips

`#genres-list` is empty (loadGenres never runs → crash). The `.genres-note` div has hardcoded HTML text: *"Géneros actuales: Afro House, Tech House..."* and *"Usa el botón × en cada género para eliminarlo."* The user sees this static text and believes the chip UI is that list — but there are no × buttons.

**Fix:** Remove the static `.genres-note` content from index.html. Once the crash is fixed, chips render correctly from `renderGenres()`.

---

### Progress bars — Converter and Set Creator

`convert_audio.py` (L62) and `run_classification.py` (L143) both print `[{idx}/{total}] file -> output`. The server's `runProcessWithProgress` parser only matches `[PROGRESS:X/Y] Processing: file`. No match → bars stay at 0% → jump to "Completado".

**Fix:** One-line change per Python file:
```python
# convert_audio.py L62:
print(f"[PROGRESS:{idx}/{total}] Processing: {rel}", flush=True)

# run_classification.py L143:
print(f"[PROGRESS:{i}/{total}] Processing: {track.name}", flush=True)
```

---

### SSE endpoints — missing Content-Type header

`runProcessWithProgress()` calls `res.write()` without a prior `res.writeHead()`. Node.js sends HTTP 200 with no `Content-Type`. SSE requires `Content-Type: text/event-stream`.

**Fix:** Add at top of `runProcessWithProgress`:
```js
res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
```

---

### BPM — results never displayed + double-fetch

`bpm_analyzer.py` outputs `[PROGRESS:X/Y] Processing: file` during analysis (correct), then dumps a JSON blob at the end via `print(json.dumps(results))`. The server captures this in `output` but never emits it as an SSE event. app.js listens for `{ type: 'result' }` events that never arrive → `bpmTableBody` stays empty.

Additionally, app.js lines 1267-1276 make a second identical POST to `/api/bpm/analyze` after the stream finishes ("Get final results") — spawning a second full Python analysis that also produces nothing in the UI.

**Fix:** Server must parse the JSON stdout line and emit it as `{ type: 'result', results: [...] }`. Delete lines 1267-1276 from app.js. Add table rendering when `data.type === 'result'` is received.

---

### Error messages from classifier subprocess (**PARTIALLY RESOLVED**)

For genre classification, `runProcessWithProgress` now includes an `error` payload on non-zero exit and UI appends it to `#cls-log`. This makes missing-credentials and runtime failures visible to users.

**Remaining:** apply equivalent error surfacing consistency for all tabs/processes.

---

### Cancel — `cancelled` flag always false

`cancelProcess()` kills the child with SIGTERM but never updates `isKilled` (a local variable in `runProcessWithProgress`'s closure). The `complete` event is emitted with `cancelled: false` even after a user-triggered cancel.

**Fix:** Set `child._killed = true` before `child.kill('SIGTERM')` in `cancelProcess()`. In `runProcessWithProgress`, read `isKilled = child._killed === true` inside `child.on("close")`.

---

### Runtime — browser mode path handling (**RESOLVED FOR MAIN FLOW**)

In browser (non-Electron), `selectDirectory()` calls `showDirectoryPicker()` which returns a `FileSystemDirectoryHandle`. This gets assigned to `input.value` → `"[object FileSystemDirectoryHandle]"` → all API calls fail.

`isValidDirectoryHandle()` and `getFilesFromHandle()` exist in app.js (L65-81) but are **never called** — dead code from an incomplete implementation.

`f.path` in drag-and-drop (L151, L179) is `undefined` in browsers — falls back to `f.name` (filename only, no directory). Server receives `"track01.mp3"` and cannot find the file.

**Status:** main flow already uses Electron-first dialogs with `prompt()` fallback (no handles as paths).

---

### index.html — Settings panel duplicated (**RESOLVED**)

`id="cfg-save"`, `id="cfg-spotify-id"`, `id="cfg-spotify-secret"`, `id="cfg-lastfm-key"`, `id="cfg-language"` each appear **twice** in index.html. `getElementById` returns the first match; the second panel is visually rendered but silently inert.

**Status:** single Settings panel remains with unique IDs.

---

### Metadata editing form — missing from HTML

app.js contains complete logic for manual metadata editing (lines 1082-1154): title, artist, album, year, genre, track fields, preview, save/cancel. The corresponding HTML elements (`#meta-editor`, `#meta-title`, `#meta-artist`, etc.) **do not exist in index.html**. This feature is fully coded but has no UI.

**Fix:** Add the form HTML to `#tab-metadata`. This is required to make the edit-after-load flow work.

---

### Other gaps

| issue | location | status |
|---|---|---|
| Spotify credentials missing | `/api/genre-classify` | Endpoint now returns explicit 400 with guidance; classification is blocked until keys are configured |
| Spotify/Last.fm connectivity failures | Runtime/network | Classifier may continue but degrade to `Unsorted`; stdout/stderr logs are now streamed to UI for visibility |
| Converter/Set feedback consistency | UI tabs | Some flows still need clearer end-user messages on subprocess failure/cancel |
| `cli.js` first progress line format mismatch | cli.js L79 | `Starting classification...` doesn't match regex → bitmapped into generic fallback |
| No guard for empty `inputPath` before fetch in classifier | app.js L422 | Makes unnecessary server round-trip (non-critical, works anyway) |
| `config/genres.json` path in cli.js is `path.resolve("config/genres.json")` | cli.js L355 | Resolves correctly only when CWD=projectRoot (which it is when spawned from server) |

---

## 6. Recent Fixes (this session)

| fix | files changed | tests |
|---|---|---|
| `renameFile()` — extension never doubled | `src/metadata_editor.js` | `tests/metadata-editor.test.js` (11 pass) |
| `renameFile()` — validates empty name + path separators | `src/metadata_editor.js` | included above |
| `writeMetadata()` — returns `{ ok, newPath, metadataWritten }` | `src/metadata_editor.js` | included above |
| `writeMetadata()` — checks file exists before spawning FFmpeg | `src/metadata_editor.js` | included above |
| `identifyAndTag()` — `newFilename` from `path.basename(newPath)` | `src/metadata_editor.js` | included above |
| `npm run test:metadata-editor` script added | `package.json` | — |
| audio-ingestion integrated via `services/audio-discovery.js` | `src/services/` | `tests/audio-ingestion.test.js` (4 pass) |
| Electron backend autostart + loadURL + graceful shutdown | `electron/main.cjs` | manual verification pending |
| Electron single-instance lock (prevent double app windows) | `electron/main.cjs` | manual verification pending |
| Classifier API-key gate with explicit error message | `src/server.js` | manual verification pending |
| Classifier UI now appends analyzed files and backend errors to log | `ui/app.js`, `src/server.js` | manual verification pending |
| Last.fm key hidden by default + eye toggle | `ui/index.html`, `ui/app.js` | manual verification pending |

---

## 7. Current Focus

Stabilizing the dashboard tab by tab. Order:

1. **Genre Classifier** — first, because it's the core feature and most of its backend already works
2. **Converter** — one-line Python fix for progress
3. **BPM Analyzer** — needs result rendering + remove double-fetch
4. **Metadata Editor** — needs HTML form + Runtime fix for file selection
5. **Set Creator** — one-line Python fix for progress; TempAudio stub is a known bug, non-blocking

Do not create new modules. Do not add features. Fix what exists.

---

## 8. Next Steps (ordered)

```
1. VALIDATE DESKTOP STARTUP
               Confirm Electron always starts exactly one app window and backend lifecycle is stable.

2. GENRES UI   Verify chips render correctly from server data and no static placeholder text confuses users.

3. SSE HEADERS Add res.writeHead(200, SSE headers) to runProcessWithProgress in server.js

4. ERRORS      Propagate subprocess stderr to { type:'complete', error: ... } event
               Render data.error in #cls-log when success=false

5. CANCEL FLAG Fix isKilled flag in cancelProcess + runProcessWithProgress

6. PROGRESS PY Change print format in convert_audio.py and run_classification.py (1 line each)

7. BPM RESULTS Parse JSON stdout from bpm_analyzer.py, emit as SSE result event
               Delete double-fetch in app.js lines 1267-1276
               Add table rendering for { type:'result' } events

8. CLASSIFIER UX
               Keep explicit message when Spotify keys are missing; do not start classification without credentials.

9. META FORM   Add metadata editing HTML form to #tab-metadata in index.html
```

---

## 9. Rules for Working with LLMs

1. **Read this file first.** Do not ask for project context that is already here.
2. **One problem at a time.** Fix the crash first. Don't touch BPM before crash is fixed.
3. **Read before writing.** Any edit to app.js requires reading the affected lines first.
4. **No new modules.** The architecture is sufficient. Add to existing files.
5. **No new features.** Fix what exists. The product is feature-complete for MVP.
6. **Validate manually after each change.** Run the relevant test suite. Check in browser/Electron.
7. **Tests exist for metadata-editor and audio-ingestion.** Run them after changes to those modules.
8. **Check line numbers.** app.js is 1551 lines. server.js is 575 lines. Specify exact locations.
9. **Backend errors go to stderr.** Check `output` variable in server.js when debugging subprocess failures.
10. **The crash at L1079 is the highest-priority issue.** Almost every "nothing happens" bug traces back to it.
