# MusicKind — Project State

> Last updated: 2026-04-30
> Purpose: arquitectura y decisiones para LLMs. Leer antes de cualquier trabajo.
> Para avance y tareas pendientes: ver **NEXT.md**.

---

## 1. Project Overview

MusicKind is a desktop-first DJ tool for:
- **Genre classification** using Spotify/Last.fm plus local fallbacks
- **Set analysis by section** (`warmup` / `peak` / `closing`) against a reference collection
- **Audio conversion** via FFmpeg
- **Metadata editing** and Spotify auto-tagging
- **BPM/key analysis** via Python/librosa
- **Stem separation** (vocals / instrumental) via demucs

Primary target: macOS, Electron desktop app. The Node.js server on port `3030` is the embedded backend that Electron starts automatically. `npm run dashboard` remains useful mainly for debugging.

---

## 2. Current Architecture

```text
electron/
  main.cjs              Desktop shell, native dialogs, FFmpeg install, backend autostart
  preload.cjs           Exposes electronAPI to the renderer

src/
  server.js             HTTP API + SSE endpoints
  cli.js                Genre classifier CLI
  classify.js           Genre classification helpers and BPM fallback rules
  spotify.js            Spotify Web API client
  lastfm.js             Last.fm API client
  metadata_editor.js    Metadata read/write/rename/identify
  bpm_analyzer.py       BPM + key extraction
  style_analyzer.py     Similarity engine; supports simple and multi-reference set modes
  stem_separator.py     Demucs wrapper for vocals/instrumental extraction
  run_classification.py Legacy set script kept for now, no longer the primary UI path
  convert_audio.py      Audio conversion with progress
  audio_features.py     Shared librosa feature extraction

  services/
    audio-discovery.js
    metadata-list-api.js

  skills/
    audio-ingestion/

ui/
  index.html            Single-page dashboard
  app.js                Frontend logic for all tabs
  styles.css            Dashboard styles

config/
  genres.json
  settings.json

tests/
  audio-ingestion.test.js
  metadata-editor.test.js
  server-metadata-list.test.js
```

Python runtime must be available as `python3`. Base dependencies include `librosa` and `numpy`. Stem separation additionally requires `demucs`.

---

## 3. Key Decisions

| decision | rationale |
|---|---|
| **Desktop-first (Electron)** | Native dialogs return real filesystem paths; browser handles do not. |
| **Single `Runtime` object** | Renderer detects Electron once and branches from a stable flag. |
| **Single `AppState` store** | Shared settings/FFmpeg state across tabs reduces duplicated checks. |
| **Global `defaultOutputDir`** | Output directory now comes from Settings instead of per-tab duplication. |
| **audio-ingestion is canonical discovery** | File discovery should go through structured discovery services. |
| **Set Creator absorbed Style Matcher** | The user-facing question changed from “does it fit my taste?” to “where in my set does it fit?”. |
| **Legacy `/api/set-create` kept temporarily** | It remains available while the new set-analysis flow stabilizes. |

---

## 4. What Is Working

| module | status | notes |
|---|---|---|
| Genre classifier | ✅ | UI + backend working, with pause/resume/cancel and clearer error output |
| ID3-first classification | ✅ | Embedded genre tags are checked before external APIs |
| Local BPM fallback | ✅ | Used when genre/tag/API classification is insufficient |
| Set Creator (new flow) | ✅ | Uses `style_analyzer.py` in multi-reference mode through `/api/set-analyze` |
| Style engine simple mode | ✅ | `--reference` + `--input` still works |
| Converter | ✅ | Uses FFmpeg, reports progress |
| Metadata editor | ✅ | Load/list/identify/edit/save flow active in UI |
| BPM Analyzer | ✅ | Results render in table from SSE `result` payload |
| Stem Separator | ✅ | New tab + SSE endpoint + Python demucs wrapper integrated |
| Electron dialogs | ✅ | Real filesystem paths returned |
| Settings API | ✅ | Reads/writes credentials, language and output directory |
| Automated tests | ✅ | Metadata editor and audio-ingestion tests pass |

---

## 5. Current Gaps / Risks

| issue | area | notes |
|---|---|---|
| Legacy `/api/set-create` still present | server / Python | Kept intentionally, but no longer used by the main UI |
| Classifier first progress line mismatch | `src/cli.js` | Initial “Starting classification...” line does not match the progress regex |
| Empty classifier input guard | `ui/app.js` | Still causes an avoidable round-trip |
| Error surfacing consistency | multiple tabs | Converter, stems, BPM and set analysis could align better on end-user messages |
| Demucs first-run behavior | stems | Model download and performance need validation on target machines |

---

## 6. Recent Product-Level Changes

- Metadata edit form added to the dashboard and wired to backend metadata endpoints.
- Classifier now supports pause/resume/cancel confirmation.
- Classifier checks ID3/Vorbis genre before APIs and falls back to local BPM.
- Style Matcher tab was removed and absorbed into Set Creator.
- Set Creator now scores tracks against `warmup`, `peak` and `closing` references.
- Stem Separator tab and backend were added using demucs.
- Settings remain the single source of truth for output directory.

---

## 7. Working Rules For Future LLM Tasks

1. Read this file first, then `NEXT.md` if you need pending work.
2. Preserve the desktop-first assumption unless explicitly changing architecture.
3. Prefer editing existing modules over creating new abstractions.
4. Validate syntax and run the relevant tests after backend/frontend changes.
5. Treat `run_classification.py` as legacy unless a task explicitly revives it.
