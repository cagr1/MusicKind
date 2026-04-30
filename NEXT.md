# MusicKind — Qué falta y qué ya está hecho

> Última actualización: 2026-04-30 (rev 4)
> Este archivo es la fuente de verdad del avance. PROJECT_STATE.md tiene el contexto de arquitectura.

---

## Decisión de plataforma

**La app es Electron-only.**
El servidor Node.js en puerto 3030 sigue existiendo, pero solo como backend embebido que Electron arranca automáticamente. No se desarrolla ni mantiene el modo web dashboard. `npm run dashboard` queda solo para debug en desarrollo.

---

## Qué ya está funcionando ✅

### Infraestructura
- [x] Electron arranca una sola ventana (single-instance lock + fix de race condition `activate`)
- [x] Backend Node.js arranca automáticamente, Electron espera a que esté listo antes de cargar la UI
- [x] Ciclo de vida limpio: `before-quit` mata el proceso backend
- [x] Diálogos nativos (`openDirectory`, `openFiles`) devuelven rutas reales del OS
- [x] FFmpeg: check de instalación + instalador automático (macOS Homebrew / Windows winget/choco)

### SSE / Procesos
- [x] Headers SSE correctos en todos los endpoints (`Content-Type: text/event-stream`)
- [x] Cancel funciona: `child._killed = true` → flag `cancelled` correcto en el evento `complete`
- [x] Error de subproceso propagado como `{ type:'complete', error:... }` en genre classifier

### Tabs
- [x] **Genre Classifier**: progreso bar funciona, chips renderizan desde el server, bloqueo con mensaje si faltan keys de Spotify
- [x] **Genre Classifier — doble ícono en dock**: `ELECTRON_RUN_AS_NODE=1` en backend spawn — eliminado
- [x] **Genre Classifier — "No audio files found"**: `isAlreadySorted` ahora usa path relativo al inputDir — carpetas llamadas "Unsorted" ya no se filtran
- [x] **Genre Classifier — cancel bloquea UI**: servidor ahora siempre emite `complete` + `res.end()` aunque el proceso sea killed
- [x] **Converter**: formato de progreso Python corregido (`[PROGRESS:X/Y] Processing: ...`)
- [x] **Set Creator**: formato de progreso Python corregido
- [x] **BPM**: resultados JSON emitidos como evento SSE `{ type:'result' }`, tabla renderiza, double-fetch eliminado
- [x] **Metadata (backend)**: `renameFile`, `writeMetadata`, `identifyAndTag` corregidos. Tests: 11/11
- [x] **Metadata (lista/identify UI)**: botones `metaLoad`, `metaIdentifyAll`, `metaCancel` funcionan

### Otros
- [x] `audio-ingestion` skill integrado vía `services/audio-discovery.js`. Tests: 4/4
- [x] Settings: lectura y escritura de API keys funcionan
- [x] Toggle de idioma ES/EN funciona
- [x] Cache de respuestas Spotify/LastFM

---

## Qué falta — ruta de trabajo (en orden)

### 1. UX Pausar/Reanudar/Cancelar en Classifier `[EN PROGRESO — Codex implementó botones, server fix aplicado]`
**Archivos:** `ui/app.js`, `ui/index.html`, `src/server.js`

**Problema actual:** al presionar Cancelar el proceso se detiene en el backend pero la UI queda bloqueada — el botón "Clasificar ahora" no vuelve.

---

**Estados de la UI:**

```
[Inicial]           [ Clasificar ahora ]

[Clasificando]      [ ⏸ Pausar ]  [ ✕ Cancelar ]
                    (barra de progreso activa)

[Pausado]           [ ▶ Reanudar ]  [ ✕ Cancelar ]
                    (barra congelada, status: "Pausado")

[Confirm cancel]    confirm(): "¿Estás seguro que deseas cancelar la clasificación?"
                    → Aceptar → POST /api/cancel → UI reset → [ Clasificar ahora ]
                    → Rechazar → no pasa nada, sigue pausado o corriendo

[Completado/cancel] [ Clasificar ahora ]  (siempre, tanto éxito como cancel)
```

---

**Mecanismo técnico — señales POSIX (macOS):**
- Pausa: `child.kill('SIGSTOP')` — el OS congela el proceso en el punto exacto donde está
- Reanudar: `child.kill('SIGCONT')` — el OS lo reanuda desde donde se paró
- Cancelar: `child.kill('SIGTERM')` — ya implementado
- Windows: SIGSTOP/SIGCONT no existen → ocultar el botón Pausar en `process.platform === 'win32'`

---

**Cambios necesarios:**

`src/server.js`:
- Agregar endpoint `POST /api/pause` → busca el proceso en `runningProcesses`, llama `child.kill('SIGSTOP')`
- Agregar endpoint `POST /api/resume` → busca el proceso, llama `child.kill('SIGCONT')`

`ui/index.html`:
- En `.actions` del tab Classifier: agregar `<button id="cls-pause" class="btn hidden">⏸ Pausar</button>`
- `#cls-cancel` ya existe

`ui/app.js`:
- Agregar `const clsPause = document.getElementById('cls-pause')`
- Al iniciar clasificación: mostrar `clsPause` + `clsCancel`, ocultar `clsRun`
- `clsPause.addEventListener('click')`:
  - Si está pausado (`clsPaused = true`): `POST /api/resume` → botón cambia a "⏸ Pausar" → `clsPaused = false`
  - Si está corriendo: `POST /api/pause` → botón cambia a "▶ Reanudar" → `clsPaused = true`
- `clsCancel.addEventListener('click')`:
  - `confirm('¿Estás seguro que deseas cancelar la clasificación?')`
  - Si acepta: `POST /api/cancel` con el `processId` → reset de UI
  - Si rechaza: no hace nada
- Al recibir `{ type: 'complete' }` (éxito o cancel): ocultar `clsPause` + `clsCancel`, mostrar `clsRun`, `clsPaused = false`

**Nota:** leer las líneas exactas de `clsRun`/`clsCancel` en app.js antes de editar (buscar `#cls-run` y `#cls-cancel`).

---

### 2. Clasificación: leer tags ID3 + expandir mapeo de géneros `[BLOCKER — CODEX_TASK_02.md]`
**Archivos:** `src/cli.js`, `src/classify.js`

Ver diagnóstico completo en la sección "DIAGNÓSTICO: Por qué el 90% va a Unsorted" más abajo.
El prompt exacto para Codex está en `CODEX_TASK_02.md`.

Cambios:
- `cli.js`: leer `metadata.common.genre` (tag ID3 embebido) ANTES de llamar a Spotify. Si coincide con la lista de géneros → clasificar directamente, sin red. Insertar entre L142 y L144.
- `classify.js`: agregar variantes de géneros que Spotify devuelve realmente: "south african house", "amapiano", "organic house" → Afro House; "organic techno", "minimal techno" → Melodic Techno.

---

### 3. Formulario HTML de edición de metadatos `[BLOCKER]`
**Archivo:** `ui/index.html` → sección `#tab-metadata`

La lógica ya existe completa en `ui/app.js` L1082-1154. Solo falta el HTML.
Elementos necesarios:

| ID | Tipo | Descripción |
|---|---|---|
| `#meta-editor` | `<div>` contenedor | Envuelve todo el formulario |
| `#meta-title` | `<input>` | Campo título |
| `#meta-artist` | `<input>` | Campo artista |
| `#meta-album` | `<input>` | Campo álbum |
| `#meta-year` | `<input type="number">` | Año |
| `#meta-genre` | `<input>` | Género |
| `#meta-track` | `<input type="number">` | Número de pista |
| `#meta-new-filename` | `<input>` | Nombre de archivo nuevo |
| `#meta-preview-name` | `<span>` | Preview del nombre resultante |
| `#meta-save` | `<button>` | Guardar cambios |
| `#meta-cancel` | `<button>` | Cancelar edición |

La lógica de save llama a `POST /api/metadata/write`. La de preview actualiza el span en tiempo real al escribir.

---

### 4. Error surfacing en tabs pendientes `[IMPORTANTE]`
**Archivo:** `ui/app.js`

Converter, Set Creator y BPM no muestran `data.error` cuando el proceso falla (`success: false`).
El patrón ya existe en el Classifier: cuando `data.type === 'complete' && !data.success`, se agrega `data.error` al log.

Aplicar el mismo patrón a:
- `#conv-log` (Converter)
- `#set-log` (Set Creator)  
- `#bpm-status` (BPM — ya tiene el elemento)

---

### 5. Test E2E manual en Electron `[CIERRE DE MVP]`
Correr `npm run electron` con archivos reales y verificar cada tab:

- [ ] Genre Classifier con keys de Spotify configuradas — progreso + resultado
- [ ] Converter: seleccionar carpeta, elegir formato, ver barra de progreso
- [ ] Set Creator: correr scoring, ver progreso
- [ ] BPM: analizar carpeta, ver tabla de resultados
- [ ] Metadata: listar archivos, identificar uno, editar con el formulario nuevo

---

---

## DIAGNÓSTICO: Por qué el 90% va a Unsorted

> Verificado leyendo el código el 2026-04-30. Esto es lo que realmente pasa en `cli.js` + `classify.js` + `spotify.js`.

### El pipeline real de clasificación (paso a paso)

```
Para cada archivo:
  1. Lee metadata ID3 (artist, title) — o parsea el nombre del archivo
  2. cleanTitle() → elimina "Original Mix", "feat.", "_", etc.
  3. Busca el track en Spotify (4 intentos con variaciones del nombre)
  4. Si encuentra track → getArtist(firstArtist.id) → spotifyArtist.genres[]
  5. Si tiene Last.fm key → getTrackTags() + getArtistTags()
  6. tags = [...lastfmTags, ...spotifyGenres]
  7. classifyFromTags(tags) → busca keywords exactos ("afro house", "tech house", etc.)
  8. Si no matchea → classifyFromAudio(tempo, energy) de Spotify audio-features
  9. Si no matchea → Unsorted
```

### Causa #1 — Spotify audio-features DEPRECADA (el fallback BPM está muerto)

Spotify deprecó el endpoint `/v1/audio-features/` para apps nuevas en noviembre 2024.
Cualquier app creada después de esa fecha recibe **403 Forbidden**.
El código lo captura y hace `audioFeaturesEnabled = false` → la clasificación por BPM/energía
nunca corre. Si los géneros del artista tampoco matchean → Unsorted.

**Impacto:** el segundo nivel de clasificación (BPM/energy) está completamente deshabilitado.

### Causa #2 — Spotify devuelve micro-géneros que no matchean la lista

Spotify no tiene géneros de tracks — tiene géneros de **artistas**, y son extremadamente específicos:
- Black Coffee → "afropop", "south african house", "cape town electronic"
- &ME → "melodic house", "organic house", "minimal techno"
- Keinemusik → "melodic techno", "afro house"

`classifyFromTags` busca keywords exactos. Resultados:
- "afropop" → no contiene "afro house" → ❌ miss
- "south african house" → contiene "house" → ✅ "House" (pero debería ser "Afro House")
- "organic house" → contiene "house" → ✅ "House"
- "cape town electronic" → ❌ miss → Unsorted

La lista de géneros es correcta. El problema es que la **búsqueda de palabras clave es demasiado rígida**.

### Causa #3 — Archivos con múltiples artistas ("Artist1, Artist2, Artist3 - Title")

Para `&ME, Black Coffee, Keinemusik - The Rapture Pt.III (Original Mix).aiff`:
- `parseArtistTitleFromFilename` → artist: `&ME, Black Coffee, Keinemusik`
- Spotify busca ese string como artista → no encuentra match exacto
- Cae al último fallback: busca solo por título `The Rapture Pt.III`
- Si encuentra el track → `track.artists[0]` → primer artista listado → sus géneros
- El primer artista puede no ser el más representativo del género

### Causa #4 — La metadata ID3 no se usa para clasificar

`music-metadata` ya lee `metadata.common.genre` del archivo (el tag ID3 embebido).
Muchos archivos de DJ tienen el género ya escrito ahí (puesto por Rekordbox, Traktor, Serato o manualmente).
El código LEE esa metadata pero la descarta — solo usa artist y title para buscar en Spotify.

**Esta es la oportunidad más grande**: si el archivo tiene `genre: "Afro House"` en sus tags ID3,
podríamos clasificarlo instantáneamente sin llamar a ninguna API.

---

### Solución completa (ordenada por impacto)

#### Solución A — Usar tags ID3 embebidos primero `[MÁXIMO IMPACTO, 0 APIs]`
**Archivo:** `src/cli.js`

Antes de llamar a Spotify, leer `metadata.common.genre`. Si coincide con un género de la lista → clasificar directamente.
El código ya lee la metadata (línea ~92). Solo hay que agregar un check antes de la búsqueda de Spotify.

```js
// Después de leer metadata (cli.js ~L92), antes de llamar a Spotify:
const embeddedGenre = metadata.common.genre?.[0];
if (embeddedGenre) {
  const normalizedEmbedded = normalizeTag(embeddedGenre);
  const matched = classifyFromTags([normalizedEmbedded]);
  if (matched && allowedGenres.has(matched.genre)) {
    // clasificar directamente sin Spotify
  }
}
```

#### Solución B — Expandir el mapeo de géneros de Spotify `[ALTO IMPACTO, sin APIs]`
**Archivo:** `src/classify.js`

Agregar variantes de géneros que Spotify realmente devuelve:

```js
// Afro House:
"organic house", "south african house", "afropop" con BPM 110-123 → "Afro House"
// Melodic Techno:
"melodic techno", "organic techno", "ethereal wave" → "Melodic Techno"
// Etc.
```

#### Solución C — Reemplazar audio-features con librosa local `[ALTO IMPACTO]`
**Archivos:** `src/cli.js`, `src/bpm_analyzer.py`

`bpm_analyzer.py` ya extrae BPM y key con librosa. Reutilizarlo en el clasificador:
si Spotify no clasifica, llamar a `bpm_analyzer.py` con el archivo y usar el BPM
para `classifyFromAudio()`. Elimina la dependencia del endpoint deprecado.

#### Solución D — Agregar MusicBrainz como API suplementaria `[MEDIO IMPACTO]`
MusicBrainz es gratuita, sin API key, tiene géneros via folksonomy ("tags").
Endpoint: `https://musicbrainz.org/ws/2/recording/?query=...&fmt=json`
Devuelve tags como "afro house", "deep house" que matchean mejor la lista.
**Requiere nuevo archivo `src/musicbrainz.js`** — aceptable como excepción a la regla de no nuevos módulos
si la ganancia en clasificación lo justifica.

### Recomendación de implementación

```
PRIORIDAD 1: Solución A (ID3 tags) — 1 día, máximo impacto
PRIORIDAD 2: Solución B (expandir classify.js) — 2 horas, impacto inmediato  
PRIORIDAD 3: Solución C (librosa fallback) — 1 día, elimina dependencia deprecada
PRIORIDAD 4: Solución D (MusicBrainz) — 2 días, última opción
```

### ¿Cuánto tiempo toma clasificar cada canción?

Con la implementación actual:
- Token Spotify (cacheado): 0ms
- `searchTrack` (4 intentos): 300-800ms × hasta 4 = 1-3 segundos
- `getArtist`: 200-400ms
- Total por track con Spotify: **1-4 segundos**
- 1289 tracks × 2.5s promedio = **~54 minutos** en el peor caso
- Con cache (segunda corrida, mismos artistas): mucho más rápido

Con Solución A (ID3 primero): tracks con tags embebidos → **<10ms** (sin red). El resto sigue por Spotify.

---

### Items menores (no bloquean MVP)

| item | archivo | impacto |
|---|---|---|
| Guard para `inputPath` vacío antes del fetch en classifier | `app.js` ~L422 | Evita round-trip innecesario, cosmético |
| `cli.js` L79: "Starting classification..." no matchea regex PROGRESS | `src/cli.js` | Cae en log genérico — visible pero no crítico |

---

## Estado del MVP

```
Infraestructura Electron   ████████████ 100%
SSE / Procesos             ████████████ 100%
Genre Classifier UX        ████████████ 100%  (botones, cancel, pausar, dock fix, isAlreadySorted fix)
Genre Classifier calidad   ██████░░░░░░  50%  (90% va a Unsorted — CODEX_TASK_02 lo resuelve)
Converter                  ██████████░░  85%  (falta error surfacing)
Set Creator                ██████████░░  85%  (falta error surfacing)
BPM Analyzer               ██████████░░  85%  (falta error surfacing)
Metadata Editor            ████████░░░░  70%  (falta formulario HTML)
Test E2E                   ██░░░░░░░░░░  15%  (Classifier E2E confirmado, resto pendiente)

MVP general                ████████░░░░  80%
```

---

## Reglas para esta fase

1. No crear módulos nuevos. Todo va en archivos existentes.
2. No agregar features. Solo terminar lo que existe.
3. Leer líneas exactas antes de editar `app.js` o `index.html`.
4. Correr `npm run test:metadata-editor` y `npm run test:audio-ingestion` si se toca `metadata_editor.js` o `audio-ingestion`.
5. El formulario de metadatos va en `index.html` dentro de `#tab-metadata`, sin crear nuevos tabs ni secciones.
