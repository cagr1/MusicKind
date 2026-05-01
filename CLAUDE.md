# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Start of every session

Read `NEXT.md` before doing anything. It is the source of truth: what's done, what's next, exact line numbers for pending tasks. `PROJECT_STATE.md` has deeper architecture context but `NEXT.md` has the ordered work queue.

---

## What is this project

MusicKind is a desktop-first DJ tool (Electron 28 + Node.js):
- **Genre classification** via Spotify / Last.fm APIs + local BPM fallback
- **Style Matcher** — extracts 53 audio features (MFCCs, chroma, spectral, tempo) and scores new tracks against a reference collection using cosine similarity
- **Stem Separator** — separates vocals / instrumental via `demucs --two-stems vocals`
- **DJ set creation** scored against a local collection
- **Audio conversion** (MP3 / WAV / AIFF / FLAC) via FFmpeg
- **Metadata editing** + Spotify auto-tagging
- **BPM / key analysis** via Python + librosa

Runs as an Electron desktop app. `npm run dashboard` starts the backend only (debug).

---

## Architecture at a glance

```
electron/
  main.cjs      openDirectory, openFiles, checkFFmpeg, installFFmpeg, is-electron
  preload.cjs   Exposes electronAPI to renderer

src/
  server.js     Node.js HTTP server on port 3030. All API routes (~696 lines).
  cli.js        Genre classifier CLI (spawned by server).
  classify.js   Genre classification logic + classifyFromBpm(bpm) BPM fallback.
  metadata_editor.js  Metadata read / write / rename / identify.
  spotify.js    Spotify Web API client (retry + cache).
  lastfm.js     Last.fm API client.
  cache.js      JSON cache (.cache/api-cache.json).
  bpm_analyzer.py       BPM + key via librosa. Outputs [PROGRESS:X/Y] + JSON blob.
  style_analyzer.py     Style Matcher. Features: MFCCs×2, chroma, centroid×2,
                        contrast, ZCR×2, RMS×2, tempo, beat_strength → cosine sim.
  stem_separator.py     Stem separation via demucs --two-stems vocals. WAV/MP3 out.
  run_classification.py Set scoring.
  convert_audio.py      Format conversion via FFmpeg.
  audio_features.py     Shared librosa feature extraction.

  services/
    audio-discovery.js      Wraps audio-ingestion for server use.
    metadata-list-api.js    Builds /api/metadata/list response.

  skills/audio-ingestion/   Structured file discovery with manifest, dedup, dry-run.

ui/
  index.html    Single-page dashboard (8 tabs: ~731 lines).
  app.js        All frontend logic (~1988 lines).
  styles.css    Dashboard styles.

config/
  genres.json   Active genre list.
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
| Desktop-first (Electron) | `showDirectoryPicker()` returns a FileSystemDirectoryHandle, not a path. Server needs real OS paths. |
| `Runtime.isElectron` | `const Runtime = { isElectron: Boolean(window.electronAPI?.openDirectory) }` evaluated once at top of app.js. |
| `AppState.ffmpegReady` | Single flag set at startup via `initAppState()`. All tabs subscribe via `onFfmpegStateChange()`. |
| `defaultOutputDir` in Settings only | Stored in `config/settings.json`. No tab has its own output dir selector. |
| Spotify keys mandatory | `/api/genre-classify` returns HTTP 400 if keys are missing. |
| `runProcessWithProgress()` | All SSE subprocess routes go through this one function in server.js. Pass `{ parseJsonResult: true }` to emit a `result` SSE event from the final JSON blob in stdout. |
| Progress format | Server parses `[PROGRESS:X/Y] Processing: filename`. All Python scripts must print this exactly. |
| audio-ingestion canonical | All file discovery goes through `services/audio-discovery.js`. `utils.listAudioFiles()` is deprecated. |

---

## Tab inventory (8 tabs)

| data-tab | Panel ID | Key IDs |
|---|---|---|
| classifier | #tab-classifier | cls-input, cls-run, cls-pause, cls-cancel |
| sets | #tab-sets | set-base, set-pack |
| converter | #tab-converter | conv-input-drop |
| metadata | #tab-metadata | meta-input-drop |
| bpm | #tab-bpm | bpm-input, bpm-analyze |
| style | #tab-style | style-ref-input, style-input-dir, style-analyze |
| stems | #tab-stems | stems-input-dir, stems-run, stems-format |
| settings | #tab-settings | cfg-spotify-id, cfg-output-dir, cfg-save |

**Known fragility:** `applyLanguage()` in app.js assigns nav button labels by array index (navBtns[0..5]). Adding new tabs before Settings shifts indices and mislabels buttons. Fix by selecting by `data-tab` attribute instead.

---

## i18n

Translations are an inline object at the top of `app.js` (L1-27). The `applyLanguage(lang)` function (L1884) applies them. The object only covers the original 6 tabs — Style Matcher and Stems labels are missing and must be added when the index bug is fixed.

---

## API endpoints (server.js)

| Method | Path | Notes |
|---|---|---|
| GET | /api/genres | List genres |
| POST | /api/genres | Save genres |
| POST | /api/genre-classify | SSE — runs cli.js |
| POST | /api/set-create | SSE — runs run_classification.py |
| POST | /api/convert | SSE — runs convert_audio.py |
| GET/POST | /api/settings | Read/write config/settings.json |
| GET | /api/ffmpeg-status | checkFFmpeg() |
| POST | /api/cancel | Kill process by processId |
| POST | /api/pause \| /api/resume | SIGSTOP / SIGCONT |
| GET | /api/metadata | Read metadata for one file |
| GET | /api/metadata/list | List audio files in a dir |
| POST | /api/metadata/rename | Rename file |
| POST | /api/metadata/write | Write tags + ffmpeg |
| POST | /api/metadata/identify | Spotify identify |
| POST | /api/bpm/analyze | SSE + parseJsonResult — runs bpm_analyzer.py |
| POST | /api/style-match | SSE + parseJsonResult — runs style_analyzer.py |
| POST | /api/stem-separate | SSE + parseJsonResult — runs stem_separator.py |

---

## Rules for working on this codebase

1. **Read NEXT.md first.** Work queue, exact line numbers, verified state of each task.
2. **Read before editing.** Always read the relevant lines before changing them.
3. **Run tests after touching metadata-editor or audio-ingestion.**
   - `npm run test:metadata-editor`
   - `npm run test:audio-ingestion`
4. **app.js is ~1988 lines, server.js is ~696 lines.** Specify exact line numbers when editing.
5. **SSE endpoints:** `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` — handled automatically by `runProcessWithProgress()`.
6. **Python scripts must use** `[PROGRESS:X/Y] Processing: filename` and print a `json.dumps(results, indent=2)` list at the end (so the line `[` appears alone, enabling `parseJsonResult` parsing).
7. **New tabs in index.html** require three changes: nav button in sidebar, panel section before `#tab-settings`, and entry in the `panels` object in app.js — plus entries in `translations` (both `es` and `en` keys) and update `applyLanguage` to use `data-tab` selectors.

---

## Running the project

```bash
# Desktop app
npm run electron

# Backend only (debug)
npm run dashboard         # localhost:3030

# Tests
npm run test:metadata-editor
npm run test:audio-ingestion
npm run test:metadata-endpoint
```

**Requirements:** Node.js, Electron 28, Python 3 + `librosa` + `numpy` in PATH, FFmpeg. For Stem Separator: `pip install demucs` (downloads ~300MB models on first run).
