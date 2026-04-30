# MusicKind — Project State

> Last updated: 2026-04-30
> Purpose: arquitectura y decisiones para LLMs. Leer antes de cualquier trabajo.
> Para avance y tareas pendientes: ver **NEXT.md**.

---

## 1. Project Overview

MusicKind is a desktop-first DJ tool for:
- **Genre classification** of audio files using Spotify/Last.fm APIs
- **DJ set creation** (warmup/peak/closing) scored against an existing collection
- **Audio conversion** (MP3/WAV/AIFF/FLAC) via FFmpeg
- **Metadata editing** and Spotify auto-tagging
- **BPM/key analysis** via Python/librosa

Primary target: macOS, Electron desktop app. El servidor Node.js en puerto 3030 es el backend embebido que Electron arranca automáticamente — no se desarrolla como web dashboard independiente. `npm run dashboard` es solo para debug.

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

### Genre Classifier — genres UI shows static text, not chips (**RESOLVED**)

Static placeholder text removed from `.genres-note` div. Chips render correctly from `renderGenres()` via `loadGenres()`.

---

### Progress bars — Converter and Set Creator (**RESOLVED**)

`convert_audio.py` (L62) and `run_classification.py` (L143) now print `[PROGRESS:X/Y] Processing: ...`. Matches server parser. Progress bars update correctly.

---

### SSE endpoints — missing Content-Type header (**RESOLVED**)

`runProcessWithProgress()` now calls `res.writeHead(200, SSE headers)` at the top.

---

### BPM — results never displayed + double-fetch (**RESOLVED**)

Server now parses JSON stdout from `bpm_analyzer.py` and emits `{ type: 'result', results: [...] }` before the `complete` event. `renderBpmResults()` renders into `bpmTableBody`. Double-fetch removed from app.js.

---

### Error messages from classifier subprocess (**PARTIALLY RESOLVED**)

For genre classification, `runProcessWithProgress` now includes an `error` payload on non-zero exit and UI appends it to `#cls-log`. This makes missing-credentials and runtime failures visible to users.

**Remaining:** apply equivalent error surfacing consistency for all tabs/processes.

---

### Cancel — `cancelled` flag always false (**RESOLVED**)

`cancelProcess()` now sets `child._killed = true` before `child.kill('SIGTERM')`. In `runProcessWithProgress`, `isKilled = child._killed === true` is read in the `close` handler.

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

## 6. Recent Fixes (cumulative)

| fix | files changed | tests |
|---|---|---|
| `renameFile()` — extension never doubled | `src/metadata_editor.js` | `tests/metadata-editor.test.js` (11 pass) |
| `renameFile()` — validates empty name + path separators | `src/metadata_editor.js` | included above |
| `writeMetadata()` — returns `{ ok, newPath, metadataWritten }` | `src/metadata_editor.js` | included above |
| `writeMetadata()` — checks file exists before spawning FFmpeg | `src/metadata_editor.js` | included above |
| `identifyAndTag()` — `newFilename` from `path.basename(newPath)` | `src/metadata_editor.js` | included above |
| `npm run test:metadata-editor` script added | `package.json` | — |
| audio-ingestion integrated via `services/audio-discovery.js` | `src/services/` | `tests/audio-ingestion.test.js` (4 pass) |
| Electron backend autostart + loadURL + graceful shutdown | `electron/main.cjs` | ✅ verified |
| Electron single-instance lock (prevent double app windows) | `electron/main.cjs` | ✅ verified |
| Electron `activate` race condition fix — `startupDone` flag | `electron/main.cjs` | manual verify |
| Classifier API-key gate with explicit error message | `src/server.js` | ✅ verified |
| Classifier UI now appends analyzed files and backend errors to log | `ui/app.js`, `src/server.js` | ✅ verified |
| Last.fm key hidden by default + eye toggle | `ui/index.html`, `ui/app.js` | ✅ verified |
| SSE headers — `res.writeHead(200, SSE headers)` in `runProcessWithProgress` | `src/server.js` | manual verify |
| Cancel flag — `child._killed = true` in `cancelProcess`, read in `close` handler | `src/server.js` | manual verify |
| Progress format — `convert_audio.py` L62 | `src/convert_audio.py` | manual verify |
| Progress format — `run_classification.py` L143 | `src/run_classification.py` | manual verify |
| BPM results — parse JSON stdout, emit `{ type:'result' }` SSE event | `src/server.js` | manual verify |
| BPM results — `renderBpmResults()` added to table in UI | `ui/app.js` | manual verify |
| BPM double-fetch removed (app.js L1299-1308) | `ui/app.js` | manual verify |
| Genres — static placeholder text removed from `index.html` | `ui/index.html` | manual verify |

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

Items 1-7 are resolved as of 2026-04-30. Remaining:

```
8. META FORM   Add metadata editing HTML form to #tab-metadata in index.html.
               app.js already has full logic (L1082-1154): title, artist, album, year, genre, track,
               preview, save/cancel. Elements needed: #meta-editor, #meta-title, #meta-artist,
               #meta-album, #meta-year, #meta-genre, #meta-track, #meta-preview-name, #meta-save, #meta-cancel.

9. CLASSIFIER UX (minor)
               Guard for empty inputPath before fetch (app.js ~L422) — non-critical, cosmetic.
               cli.js L79 "Starting classification..." line doesn't match PROGRESS regex
               — benign, falls through to generic log.

10. ERROR SURFACING (remaining tabs)
               Converter, Set Creator, BPM tabs don't render data.error in their log/status
               when success=false. Apply same pattern as Classifier tab.

11. MANUAL END-TO-END TEST
               Run each tab with real audio files in Electron:
               - Genre classifier with Spotify keys set
               - Converter (check progress bar)
               - BPM (check table renders after analysis)
               - Set creator (check progress bar)
               - Metadata tab (list + identify)
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
10. **El crash en L1079 está resuelto.** Variables de metadatos declaradas como `null` con guards en listeners.
