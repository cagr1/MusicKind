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
4. [x] **Front 2** — lote en `design/SPEC.md` § "Lote Front 2 (resto)".
   - [x] Convertidor — verificado en vivo (MP3→WAV, tags en fila/Inspector, tonalidad nula = —). Commit `9f90ea2`.
   - [x] L1 Metadatos — `identify` con `preview` (no escribe ni renombra; verificado con Spotify real, mtime igual), formulario con original tachado, tonalidad del tag (`Amin`→8A). Pendiente de producto: identify reemplaza "Chocolate Spread, Oscar P" por "Chocolate Spread" (pierde remixer).
   - [x] L2 Configuración (L2/L2.1/L2.2 en `19f4a78`/`9017847`; claves solo en "Avanzado" opcional). 2026-09-24: `format:check` volvía a fallar en 5 archivos de E2 → formateado; vitest 89/89, build 0.
   - [x] L3 Sets — 4 carpetas, agrupado por sección con rango BPM, medidor 3 segmentos, curva de energía, puntajes en Inspector (verificado en vivo con copias).
     **Mejora de back pendiente (Back 3):** `style_analyzer.py` da 93–100% a casi todo (cosine sobre features sin normalizar; tempo domina) → estandarizar features (z-score por feature sobre las referencias) antes del coseno y medir separación.
   -
   - [x] L4 Clasificador — solo análisis (dryRun fijo), verificado en vivo sobre copias: nada se mueve, `config/` intacto; fuente i18n, chip Camelot, Select/Switch de radix, sin destino falso.
   -
   - [x] L5 Stems — vista DAW (3 carriles con onda real, regla de tiempo, M/S, volumen, Inspector); QA con `/api/stem-separate` simulado en el navegador (demucs no instalado) + estado real "falta demucs". Pendiente: prueba real tras instalar demucs (~2 GB).

5. [x] **F9a** — el servidor sirve `web/dist` (UI nueva) en Electron; `npm run electron`/`dev` compilan la web antes; `npm run electron:legacy` abre `ui/`. Verificado: `:3030/` entrega la UI nueva, CSS y woff2 con MIME correcto; node 57/57.

6. [x] **Lote 3** (`design/SPEC.md` § Lote 3): M1 selección sin barra + lazy [x] · M2 agregar archivos siempre [x] · M3 icono nuevo [x] · M5 selección y limpiar tabla [x] · M4 reproductor tipo deck [x]. Verificado en vivo (3030): doble clic reproduce, ↓ continúa sonando, espacio pausa, Inspector y deck sincronizados; causa raíz de la regresión: `WaveSurfer.destroy()` pausa el audio compartido → ondas en SVG, `wavesurfer.js` retirado.

7. [x] **Lote 4** — A1 AIFF→FLAC en caché + `/api/artwork` · A2 errores visibles + carátulas · A3 onda del deck en SVG · A4 deck independiente de la lista (limpiar no corta la pista; X cierra). Verificado en vivo con AIFF reales: suenan (00:02→00:05), carátulas en filas/Inspector/deck, clic al 75% → 05:43/07:35 (0.754) con la línea a 3 px del clic.

8. [x] **Lote 5** — S1 stems a elección + escucha por carril (verificado en vivo: envía `stems:"vocals"`, solo Voces audible) · S1.1 carriles no generados ocultos · C1 botón Instalar Chromaprint (brew/winget).
   **Antes de distribuir:** la app empaquetada abierta desde Finder no hereda el PATH de la terminal → no encontrará `ffmpeg`/`fpcalc`/`brew` en `/opt/homebrew/bin`. Resolver con rutas conocidas o binarios incluidos (junto con fijar versiones y Python propio).

9. [~] **Lote 6 — Clasificar por ejemplos** (`design/SPEC.md` § Lote 6). **PAUSADO 2026-09-24 a pedido de Carlos.**
   - [x] E0 medición (audio ≈ base "siempre Tech house"; tag ~97%) · [x] E1 motor por tags (`0ee9157`) · [x] E3 mover con manifiesto/deshacer (verificado sobre copia) · [x] E3.1 excluir destino + validar deshacer (`5b528a1`).
   - [ ] **E2 vista "Clasificar por etiquetas"**: hecha por Luna, **SIN COMMIT y NO VERIFICADA** (working tree: `web/src/views/Classifier.tsx`, `web/src/lib/tag-classifier.ts`, `api.ts`, i18n, `web/package.json` con `@tanstack/react-virtual`).
   - [x] **E2.1** (Luna, 1 corrida tras la interrumpida) — `protectedRoots` en `config/settings.json` unidas en servidor a classify-by-tags/apply/undo; `GET /api/genre-aliases`; UI Clasificador + Configuración leen/escriben `protectedRoots`; Select de método con valor. **Sin commit.**
     Verificado por el cerebro 2026-09-24: node 75/75, build 0, lint 0 errores (4 warnings), vitest 86/86; en vivo (3099, archivos tmp): con `excludeRoots: []` la carpeta protegida no se lista, alias `Afro Latin`→`Afro House`, settings conserva claves. Falta QA visual de la vista (E2 sigue sin QA en UI).
     Nota QA: `MUSIC_KIND_DATA_DIR` **no** afecta a `settings.json` (siempre `config/settings.json`); la prueba escribió ahí y se revirtió.
   - [x] **E2.2** (Luna, spec `design/SPEC.md` § E2.2) — género canónico ya no lo pisa la metadata del archivo, distribución compacta arriba, respaldo online Last.fm/Spotify para "Por revisar".
     Verificado por el cerebro 2026-09-24: node 78/78, build 0, lint 0, vitest 89/89. Corrida real solo lectura `Unsorted`→`Music` (excl. `2026`): 1331 pistas, 1197 por tag, 134 por revisar (93 sin tag, 27 desconocido, 14 basura). **Online encontró 0**: Spotify ya no devuelve `genres` de artista a esta app (probado: campo ausente) y no hay clave Last.fm. Falta QA visual de Carlos.
   - [x] **Back 4 / 4.1–4.3** — Spotify eliminado (feb-2026: sin `genres` y exige Premium). Proveedores en `src/providers/`: Discogs (styles), Last.fm, Deezer, MusicBrainz; claves de la app en `config/app-keys.json` (gitignored, repo público) → el usuario no crea claves. Online ignora genéricos (Electronic/dance).
     Verificado 2026-09-24: node 86/86, build/lint 0, vitest 89/89; en vivo `Unsorted`: 1197 tag + 37 Discogs + 5 Last.fm, 92 por revisar. AcoustID: clave válida (verificado 2026-09-24, `status: ok`). Deezer (4.4) verificado en vivo: "Fisher – Losing It" → ISRC/BPM/carátula. **4.5/4.5.1 [x]** varios artistas (intento por artista), título exacto (Pt.II ≠ Pt.III), remix explícito exigido, se conserva el crédito completo ("Chocolate Spread, Oscar P"). Verificado 2026-09-24: node 93/93; en vivo &ME/Rapture Pt.III y Jimi Jules/Trippy Yeah encontrados, remixes inventados → null.
   - [x] **E2.3** — carpetas protegidas eliminadas (decisión de Carlos): solo entrada y destino; el análisis sigue excluyendo el destino.
   - [x] **Back 1b / 1b.1** medición de motores de tonalidad (`scripts/eval_key.py`, sin commit; spec `design/SPEC.md` § Back 1b/1b.1).
     Verificado por el cerebro 2026-09-24 sobre 194 pistas con tag de `2026` (el reporte viejo tenía ~1/3 de fallos por `ffmpeg` fuera del PATH; re-corrido con el venv): **libkeyfinder pista entera 76,3% exacto / 83,0% compatible / 17% error mayor (6 s/pista)**; libkeyfinder 120 s 71,1% / 78,9% (2 s); essentia edma/bgate ~51% / 68%; librosa actual 45,4% / 58,2%. Dos corridas idénticas, 194 aciertos de caché, confusiones sin aciertos. Ojo: la verdad es el tag (quizá puesto por otro software), no un oído humano.
   - [x] **Back 1c / 1c.1** libkeyfinder incluido como respaldo (tag → keyfinder pista entera → librosa). MusicKind pasa a **GPL-3.0-or-later** (gratis, decisión de Carlos); `LICENSE`, `THIRD_PARTY_NOTICES.md`, licencias en el paquete. Luna (2 corridas).
     Verificado por el cerebro 2026-09-24: binario universal `x86_64 arm64`, solo `/usr/lib`, minos 12.0; Rosetta = arm64 en 20/20 pistas reales; `resolve_key` sobre 20 copias sin tag → keyfinder en 20 (librosa 0), 14/20 exactas vs tag, 3,9 s/pista; unittest 8/8, node 88/88. Reconstruir: `scripts/build-keyfinder.sh` (requiere cmake).
     **macOS mínimo 12 (Electron 44)**: Mojave no abre la app. Pendiente: medir velocidad en la MacBook Pro 2017 de Carlos tras actualizarla a Ventura.
   - [x] fpcalc detectado con `-version` (`8e8e4d8`). AcoustID: huellas reconocidas (score ~1.0) pero sin grabación MusicBrainz en electrónica → identify cae a Deezer.
   - Pendiente después: E4 `.m3u8` Warmup/Peak/Closing; E0b (entrenar audio con las ~2,300 etiquetadas para sugerir en las ~190 sin tag).
   - QA: servidor aparte en `PORT=3099` con `MUSIC_KIND_DATA_DIR="$HOME/Library/Application Support/MusicKind"`; copia de prueba del backup en el scratchpad de la sesión (temporal).

**Back 3 [x]** (Luna, 1 corrida; spec `design/SPEC.md` § Back 3) — puntajes de Sets por z-score + percentil frente a las propias referencias.
Verificado por el cerebro 2026-09-24: unittest 6/6, test_basic 4/4; medición repetida idéntica (`.cache/eval/sets-report.md`, 3 carpetas de `2026`, 5 particiones): acierto `best` 29,4% → 44,7% (azar 33%), desviación 1,3 → 28,7, puntajes ≥90 100% → 2,4%. En vivo `/api/set-analyze` (3099, 20 copias, 8 refs/sección): puntajes 0–100 repartidos. Observaciones: con pocas referencias el puntaje va en saltos (8 refs → múltiplos de 12,5); si todo da 0 igual se asigna `best`; warnings de NumPy por `float(tempo)` en el log.
**Siguiente (2026-09-24):** Front 2 completo. Queda QA visual de Carlos en Electron (Clasificar por etiquetas, audio, arrastrar) → Lote 6 pausado (E4, E0b) → punto final.
**Punto final (decisión de Carlos):** app autosuficiente — incluir o instalar desde la app ffmpeg, fpcalc, Python + librerías; nada por terminal ni PATH; probar `.dmg` en la MacBook Pro 2017 (Intel, tras actualizar a Ventura; Electron 44 exige macOS 12+).

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
