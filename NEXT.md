# MusicKind — Qué falta y qué ya está hecho

> Última actualización: 2026-05-03 (rev 21)
> Este archivo es la fuente de verdad del avance. PROJECT_STATE.md tiene el contexto de arquitectura.

## Estado 2026-09-23 — UI "instrumento" (manda sobre todo lo de abajo)

Referencia visual aprobada: `design/prototype/`. Spec completa para Luna: **`design/SPEC.md`**. Una fase por sesión, en orden:

1. [x] **Back 1** — tonalidad con modo + Camelot. Ejecutado por: Luna (3 corridas) · Spec: `design/SPEC.md` § Back 1 / 1.1.
   Verificado por el cerebro 2026-09-23: venv 6/6, node 47/47; tag primero (124/124 leídos bien), análisis de respaldo 47% exacto / 60% compatible sobre 124 pistas reales, marcado `keySource: "analysis"`. Sin commit.
   Mejora futura (Back 1b): medir `libkeyfinder` (Mixxx, GPL-3, Homebrew 2.2.8) contra esas 124 pistas.
2. [x] **Back 2** — `/api/waveform` (RMS normalizado, caché v2), `/api/audio` (Range), bpm/key en `readMetadata`, JSON final en clasificador/convertidor, `vocals`/`instrumental` en stems. Ejecutado por: Luna (2 corridas) · Spec: `design/SPEC.md` § Back 2 / 2.1.
   Verificado por el cerebro 2026-09-23: node 53/53, `test_basic` 4/4 (venv); en vivo 206/400, waveform con relieve real, servidor sigue vivo si el archivo desaparece durante el stream. Sin commit.
   **Defecto hallado en QA de Front 2:** `parseJsonResult` quedó en `/api/set-create` en vez de `/api/convert`; la revisión del cerebro no lo detectó (no comprobó a qué ruta pertenecía el hunk). Corregido y verificado.
3. [x] **Front 1** — tokens (`brand`), Inspector completo, reproductor, shell, `ProcessProvider`, vista BPM. Ejecutado por: Luna (6 corridas: 1a, 1a.1, 1b, 1b.1, 1b.2, chip) · Spec: `design/SPEC.md` § Front 1.
   Verificado por el cerebro 2026-09-23: build 0, lint 0 errores, vitest 35/35, sin hex en tsx. QA en vivo (Chrome headless + backend real + `electronAPI` simulado, copias): flujo vacío→analizar→resultados, títulos/artistas del tag, tonalidad tag vs estimada (borde punteado), ondas reales, Inspector completo; guardar escribe TBPM/TKEY y conserva título y carátula. Falta QA manual de Carlos en Electron (audio audible, arrastrar carpeta). Sin commit.
   Nota: el plugin `impeccable` del entorno Codex crea `.impeccable/` en la raíz y empuja a Luna a añadir supresiones; se borró. Ignorado en `.gitignore`.
4. [~] **Front 2** — lote en `design/SPEC.md` § "Lote Front 2 (resto)".
   - [x] Convertidor — verificado en vivo (MP3→WAV, tags en fila/Inspector, tonalidad nula = —). Commit `9f90ea2`.
   - [x] L1 Metadatos — `identify` con `preview` (no escribe ni renombra; verificado con Spotify real, mtime igual), formulario con original tachado, tonalidad del tag (`Amin`→8A). Pendiente de producto: identify reemplaza "Chocolate Spread, Oscar P" por "Chocolate Spread" (pierde remixer).
   - [ ] L2 Configuración ·
   - [x] L3 Sets — 4 carpetas, agrupado por sección con rango BPM, medidor 3 segmentos, curva de energía, puntajes en Inspector (verificado en vivo con copias).
     **Mejora de back pendiente (Back 3):** `style_analyzer.py` da 93–100% a casi todo (cosine sobre features sin normalizar; tempo domina) → estandarizar features (z-score por feature sobre las referencias) antes del coseno y medir separación.
   -
   - [x] L4 Clasificador — solo análisis (dryRun fijo), verificado en vivo sobre copias: nada se mueve, `config/` intacto; fuente i18n, chip Camelot, Select/Switch de radix, sin destino falso.
   - [ ] L5 Stems (demucs no instalado en QA)

Sigue pendiente en paralelo: revisión Terra del back (`e0c0424`), P1/P2 del clasificador, F3 contrato de escritura de tags.

## Estado 2026-09-13 — orden de trabajo (manda sobre lo de abajo; detalle en `plan.md`)

Hecho (back, commit `e0c0424`, tests 9/9 exit 0):
- SSE bufferiza por línea (`src/line-buffer.js`), streams de procesos UTF-8 seguros en `src/` y `electron/`.
- Servidor solo `127.0.0.1`.
- `POST /api/metadata/write` acepta `bpm` (entero, TBPM) y `key` (TKEY) con validación.
- Preload expone `electronAPI.getPathForFile`; back rechaza con 400 rutas no absolutas.

Pendiente, en orden:
1. **Revisión Terra del back** (`e0c0424`) cuando haya cuota Codex: `codex exec -m gpt-5.6-terra -s read-only -o .memories/back-cleanup/review-terra-3.md`, criterios `.memories/back-cleanup/spec.md`. Revisar el commit, no reviews previas.
2. **Front F1.0** (`plan.md:212`): usar `getPathForFile` al arrastrar en la UI + tests `DataTransfer.File` sin `path`. Sin commitear aún: `ui/app.js`, `web/`, `plan.md`.
3. **Front F1.1** correcciones (`plan.md:222`), luego F3 BPM/Key con botones Guardar (usa el endpoint nuevo).
4. BPM Serato vs MusicKind (`plan.md:192`): informativo, requiere comparación controlada.
5. Recortar `CLAUDE.md` del proyecto (desactualizado: Electron 28, líneas y tamaños viejos).

---

## Decisión de plataforma

**La app es Electron-only.**
El servidor Node.js en puerto 3030 sigue existiendo, pero solo como backend embebido que Electron arranca automáticamente. `npm run dashboard` queda solo para debug.

---

## DECISIONES ARQUITECTÓNICAS CERRADAS

| Decisión | Detalle |
|---|---|
| Electron-only | `showDirectoryPicker()` necesita paths reales del OS |
| Style Matcher absorbido en Set Creator | `#tab-style` eliminado. 7 tabs en total. |
| Set Creator evolucionado | 3 perfiles ADN (warmup/peak/closing) → `/api/set-analyze` |
| Carpeta de salida única | Solo en Settings. Ningún tab tiene su propio output dir. |
| Sin comandos de terminal en la UI | El usuario nunca ve `pip install` ni nada técnico. |

---

## Principios de UX

- Un selector de entrada por tab. No se comparten.
- Sin configuración duplicada. Settings es la fuente de verdad.
- Dependencias Python se instalan desde Settings con botón, no desde terminal.

---

## Features completados ✅

| Feature | Task |
|---|---|
| pause/resume/cancel Classifier | CODEX_TASK_01 |
| Tags ID3 + variantes géneros | CODEX_TASK_02 |
| Formulario HTML Metadata Editor | CODEX_TASK_03 |
| Fallback BPM local en cli.js | CODEX_TASK_04 |
| Output dir unificado en Settings | CODEX_TASK_05 |
| Style Matcher (tab + endpoint + py) | CODEX_TASK_06 |
| Stem Separator (tab + endpoint + py) | CODEX_TASK_07 |
| Bug applyLanguage: data-tab en vez de índice | CODEX_TASK_08 |
| Set Creator evolucionado (3 perfiles + /api/set-analyze) | CODEX_TASK_09 |
| Stem Separator UX: un archivo, dos botones resultado | CODEX_TASK_10 |
| i18n archivos separados (es.js + en.js) | CODEX_TASK_11 |
| UI redesign: violet/cyan, pulse, breathing-border | CODEX_TASK_12 |
| i18n infra: tr(), applyLanguage(), data-i18n | CODEX_TASK_13 |
| i18n HTML: data-i18n en index.html, claves en i18n files | CODEX_TASK_14 |
| Seguridad: settings.json fuera de git | CODEX_TASK_15 |
| Limpieza repo | CODEX_TASK_16 |
| Python multiplataforma: getPythonCmd() | CODEX_TASK_17 |
| Setup Assistant: overlay primera ejecución | CODEX_TASK_18 |
| Manual de usuario (MANUAL_USUARIO.md) | CODEX_TASK_19 |
| Identificación de canciones: AcoustID + fpcalc (reemplaza shazamio) | CODEX_TASK_20 |
| Dep guards por tab con pip install (❌ enfoque descartado) | CODEX_TASK_21 |
| Deps en Settings: tarjetas + botón Instalar + toast en tabs | CODEX_TASK_22 |

---

## Pendiente ⏳

No hay tasks pendientes. La app está lista para QA y build.

---

## Roadmap — fase release

```
COMPLETADO ✅                   PENDIENTE (en orden)
──────────────────────────────  ─────────────────────────────────────────
Infraestructura Electron        QA manual Electron macOS + Windows
SSE / procesos / cancel         Build & packaging (.dmg + .exe)
Todos los tabs funcionales      
i18n completo                   
UI Redesign                     
Python multiplataforma          
Setup Assistant                 
Shazam real                     
Deps en Settings (TASK_22)      
```

---

## Arquitectura de distribución

| Dependencia | Bundleada | Cómo se instala |
|---|---|---|
| Node.js / Electron | ✅ | — |
| Python 3.8+ | ❌ | Setup Assistant guía la descarga |
| librosa, numpy | ❌ | Settings → Herramientas de audio → Instalar |
| demucs + PyTorch | ❌ ~2 GB | Settings → Herramientas de audio → Instalar |
| FFmpeg | ❌ | Settings → Instalar FFmpeg |
| fpcalc (chromaprint) | ❌ | Terminal: brew install chromaprint |

---

## Reglas

1. NEXT.md solo tiene lista de tareas. Los detalles van en `codex_task_N.md`.
2. Leer líneas exactas antes de editar `app.js` o `index.html`.
3. `applyLanguage()` DEBE usar `querySelector("[data-tab='X']")`, nunca índices.
4. Correr tests después de cambios en `metadata_editor.js` o `audio-ingestion`.
5. Python scripts: `[PROGRESS:X/Y] Processing: filename` + JSON blob al final.
