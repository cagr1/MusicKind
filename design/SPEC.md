# SPEC — UI "instrumento" (4 fases: Back 1 · Back 2 · Front 1 · Front 2)

> Escrito 2026-09-23 (Opus, cerebro). Ejecutor: Luna (`gpt-6-luna` desde 2026-09-24; antes `gpt-5.6-luna`). Una fase por corrida, en orden.
> Protocolo: el cerebro delega, lee el diff, corre los gates él mismo y re-delega si falla. Luna **no commitea
> ni toca `NEXT.md`, `plan.md` ni esta spec**.
> Cada fase cierra con su gate y un reporte ≤200 palabras (gates con código de salida; detalle en archivo).
> Si algo de esta spec no coincide con el código, **parar y reportar**; no improvisar.

## Contexto y reglas

- **Referencia visual aprobada:** `design/prototype/` (Google AI Studio, React). Es la fuente de verdad del **aspecto**.
  No se compila ni se importa desde `web/`. Verlo: `cd design/prototype && npm i --legacy-peer-deps && npm run dev`.
- **Portar = copiar el JSX y las clases casi literal**, y reemplazar solo la capa de abajo:

  | Del prototipo | En `web/` |
  |---|---|
  | `mocks.ts`, `runProcess` | `web/src/lib/api.ts` (`streamProcess`, `useProcessStream`, `getJson`, `postJson`) |
  | `strings.ts` y literales en JSX | `web/src/i18n/{es,en}.json` (ambos idiomas) |
  | Hex hardcodeados (`#F97316`, `#09090b`, `#111113`, `#18181b`, `#ea580c`) | Tokens de `web/src/index.css` (Front 1, paso 1) |
  | `@radix-ui/react-*`, `components/ui` reescritos a mano | `radix-ui` + los componentes shadcn que ya existen en `web/src/components/ui` |
  | Imports `@/src/...` | Alias de `web/` (`@/...`) |

- No tocar `ui/` (legado; se borra en F9 de `plan.md`).
- Ningún componente llama `fetch` ni `window.electronAPI` directo: `lib/api.ts` y `lib/electron.ts`.
- **Prohibido inventar datos.** Si el back no entrega un valor, se muestra `—`.
- Nunca probar escrituras/movimientos sobre la biblioteca real: usar copias.

## Decisiones de Carlos (no revisitar)

- **El Inspector derecho se conserva completo** (`design/prototype/src/components/TrackInspector.tsx`):
  carátula 96px, título, artista, lectura BPM 40px + línea secundaria, lectura KEY 40px + nombre musical + Mayor/Menor,
  bloque "Rueda armónica Camelot" con la rueda clicable y fila Down/Exact/Up/Relat., bloque de forma de onda
  con play/pausa, playhead y tiempo, y el slot `children` por vista.
  Solo cambia el **contenido** de dos textos que en el prototipo son de relleno:
  - `±0.0% pitch` → BPM analizado con 1 decimal y, si difiere del tag, `tag 120` (si no hay dato: `—`).
  - `120px` (cabecera de la rueda) → nombre musical de la tonalidad (`Am`).
- **Se elimina:** en Clasificador la columna de iconos de fuente (sin encabezado, al final de la tabla);
  en Metadatos la columna Confianza.
- **Se agrega:** reproductor real (una pista suena a la vez) y formas de onda reales.
- Barra de distribución por género: acento naranja para el género mayoritario y escala zinc para el resto
  (el prototipo usa cian/violeta/rosa: prohibido).
- Colores Camelot (`design/prototype/src/utils/camelot.ts`, mapa verificado correcto) = color funcional permitido.

---

## Back 1 — Tonalidad con modo y Camelot

**Problema verificado:** `src/bpm_analyzer.py:28-34` toma `argmax` del chroma medio y devuelve solo la nota
(`"A"`), sin mayor/menor. Sin modo no existe Camelot (8A vs 11B): la rueda, los chips y el Inspector no tienen dato real.

1. Crear `src/key_detection.py` con `detect_key(y, sr) -> {"key": "Am", "mode": "minor", "camelot": "8A"}`:
   - `librosa.feature.chroma_cqt` (más estable que `chroma_stft` para tonalidad), media por clase de nota.
   - Correlación de Pearson contra los 24 perfiles Krumhansl-Kessler (12 rotaciones × mayor/menor); gana el máximo.
   - Tabla nota+modo → Camelot (1A=Abm, 1B=B … 8A=Am, 8B=C … 12A=C#m, 12B=E; misma tabla que `design/prototype/src/utils/camelot.ts`).
   - Notación de salida `key`: sostenidos para mayores salvo `Db, Eb, Ab, Bb`; menores `Abm, Ebm, Bbm, Fm, Cm, Gm, Dm, Am, Em, Bm, F#m, C#m` (coincide con el prototipo).
2. `src/bpm_analyzer.py`: usar `detect_key`; el resultado pasa a
   `{"ok", "bpm", "key", "mode", "camelot", "file", "index"}`. No cambiar `[PROGRESS:X/Y]` ni el JSON final.
3. `src/style_analyzer.py`: cada resultado agrega `bpm` (redondeado a 1 decimal) y `camelot`, reutilizando
   `detect_key` y el tempo que ya calcula (verificar en `src/audio_features.py` antes de duplicar trabajo).
4. Escritura de tag: `POST /api/metadata/write` sigue igual. El front enviará `key` en notación musical (`Am`),
   que es lo que TKEY espera; Camelot se deriva al leer.

**Tests:** `tests/test_key_detection.py`, ejecutado con el Python del venv de la app
(`"$HOME/Library/Application Support/MusicKind/python-venv/bin/python"`, librosa 0.11; el `python3` del sistema no tiene librosa):
- Señal sintética de 6 s (tríadas con senos + armónicos) de La menor → `8A`; Do mayor → `8B`; Fa# menor → `11A`.
- Las 24 entradas de la tabla nota+modo→Camelot.
- Archivo corrupto → `{"ok": false, "error": ...}` sin traceback en stdout.

**Gate:** `"$HOME/Library/Application Support/MusicKind/python-venv/bin/python" tests/test_key_detection.py` exit 0 · `node --test tests/*.test.js` exit 0 ·
`POST /api/bpm/analyze` sobre 2 copias de pistas reales devuelve `camelot` no vacío (pegar el JSON en el reporte).

### Back 1.1 — Corrección (2026-09-23, tras medir con 124 pistas reales)

Medición del cerebro sobre 124 pistas con tonalidad en el tag (Beatport): la versión entregada acierta ~25-33% exacto.
Sin corrimiento de semitono; errores = quintas y mayor↔menor. Mejor variante medida: **48% exacto / 61% compatible**.
Decisión de Carlos: **el tag manda; el análisis solo rellena lo que falta y se marca como estimado.**

**Esta sección son CAMBIOS A IMPLEMENTAR** sobre el código de Back 1 que ya está en el working tree (sin commit). Que las funciones nuevas no existan todavía es lo esperado, no una discrepancia.

1. `src/key_detection.py:9`: caché de numba en `os.path.join(tempfile.gettempdir(), "musickind-numba-cache")` (hoy `/tmp` fijo, no existe en Windows).
2. `detect_key` pasa a la variante medida (reemplaza `chroma_cqt` sobre la señal recibida):
   - Nueva `detect_key_from_file(path) -> dict`: `librosa.get_duration(path=...)`; carga **120 s centrados en la mitad**
     de la pista (`offset=max(0, dur/2-60)`, `duration=120`, `sr=22050`, mono); si dura <120 s, la pista entera.
   - `librosa.effects.harmonic(y, margin=4)` → `librosa.feature.chroma_stft(y=yh, sr=sr, n_fft=8192)` → media por nota.
   - Krumhansl-Kessler (mismos perfiles) con **+0.1 a la correlación de los 24 candidatos menores** (sesgo medido; el catálogo es ~88% menor).
   - Mantener `detect_key(y, sr)` usando el mismo pipeline desde `harmonic` (para los tests sintéticos).
3. Nuevo `read_tag_key(path) -> str | None` en `src/key_detection.py`: `ffprobe -v error -show_entries
   format_tags=TKEY,initialkey,INITIALKEY,key -of json <path>` (timeout 10 s, sin excepción si falla → `None`).
   Nuevo `parse_key(text) -> {"key","mode","camelot"} | None` que acepta: `Am`, `Amin`, `A minor`, `A Minor`, `A`, `Amaj`,
   `A major`, sostenidos/bemoles (`F#m`, `Gbm`, `Dbm`, `C#maj`, `Bb`) y Camelot (`8A`, `08A`, `12B`). Salida normalizada a la
   notación de Back 1 (enarmónicos incluidos: `Gbm` → `F#m`, `C#` → `Db`). Texto irreconocible → `None`.
4. Nuevo `resolve_key(path) -> {"key","mode","camelot","keySource"}`: tag parseable → `keySource: "tag"`;
   si no, `detect_key_from_file` → `keySource: "analysis"`. Si ambos fallan: `key/mode/camelot = None`, `keySource: None`.
5. `src/bpm_analyzer.py` y `src/style_analyzer.py` usan `resolve_key(path)` (el BPM sigue igual). Salida de cada ítem agrega `keySource`.
   **Nada escribe tags en esta fase**: guardar la tonalidad estimada es una acción explícita del usuario (Front 1, "Guardar N cambios").

**Tests** (`tests/test_key_detection.py`, venv): `parse_key` con todas las formas del punto 3 + basura (`""`, `"xyz"`, `"13A"`);
`resolve_key` con un WAV sintético sin tag → `analysis`, y una copia FLAC del mismo audio con `-metadata initialkey=Am` (ffmpeg, en un tmpdir; WAV no conserva ese tag) → `tag`/`8A`;
los 3 sintéticos de Back 1 siguen pasando.

**Gate:** tests del venv exit 0 · `node --test tests/*.test.js` exit 0 (línea base 47/47). La precisión sobre la biblioteca real la mide el cerebro.

**Revisión 2 del cerebro (2026-09-23).** Medido: tag 124/124 correcto; análisis 58/124 exacto (47%), 75/124 compatible (60%) — dentro de lo esperado. Falta corregir:
1. Quitar de `detect_key` el bloque `raw_best` / `active_notes <= 4` (lógica no pedida, solo para aprobar tests sintéticos; con música real no se activa).
   En su lugar: `detect_key(y, sr, minor_bias=0.1)`; `detect_key_from_file` y `resolve_key` usan el valor por defecto.
2. Tests sintéticos existentes: llamar `detect_key(..., minor_bias=0.0)` (validan las plantillas, no el sesgo). Agregar uno que muestre que con
   `minor_bias=0.1` una señal ambigua de Do mayor + La menor (mismas notas) resuelve a `8A`.
3. Agregar los tests que faltan de Back 1.1: `parse_key` (todas las formas del punto 3 + `""`, `"xyz"`, `"13A"`, `None`) y `resolve_key`
   (WAV sintético sin tag → `analysis`; copia FLAC con `-metadata initialkey=Am` → `tag`/`8A`; saltar con `skipTest` explícito si no hay ffmpeg).

---

## Back 2 — Datos para Inspector, reproductor y resultados estructurados

1. **`GET /api/waveform?path=<abs>&bins=<n>`** en `src/server.js`:
   - Validar ruta absoluta (400, mismo mensaje que `/api/metadata/write`), extensión soportada (`getAudioExtensions()` de `src/services/audio-discovery.js:31`, 415), existencia (404).
   - `bins` entero 32..1000 (por defecto 200).
   - FFmpeg: `-v error -i <path> -ac 1 -ar 8000 -f s16le -`; agrupar en `bins` cubetas, pico = max |x|, normalizar 0..1 (2 decimales).
   - Respuesta: `{ ok: true, peaks: number[], duration: number }` (duración = muestras/8000).
   - Caché en disco: `.cache/waveforms/<sha1(path|size|mtimeMs|bins)>.json`.
   - Sin FFmpeg: `{ ok: false, error }` 503.
2. **`GET /api/audio?path=<abs>`**: mismas validaciones; `Accept-Ranges: bytes`, soporte `Range` (206) y 416 fuera de rango;
   `Content-Type` por extensión (mp3 `audio/mpeg`, wav `audio/wav`, aif/aiff `audio/aiff`, flac `audio/flac`, m4a `audio/mp4`).
   Stream con `fs.createReadStream(path, {start, end})`. El servidor ya escucha solo en `127.0.0.1` (`src/server.js:117`).
3. **`readMetadata`** (`src/metadata_editor.js:40`): agregar `bpm` (`common.bpm`) y `key` (`common.key`) al objeto `metadata`
   (`null` si no hay). Actualizar `tests/metadata-editor.test.js`.
4. **Clasificador con resultado estructurado** (`src/cli.js`): al final imprimir `json.dumps`-equivalente
   (`JSON.stringify(rows, null, 2)`, con `[` solo en su línea) de las filas de `reportRows` extendidas con
   `path` (absoluta), `source` (`embedded|spotify|lastfm|bpm|override|unmatched`, derivado de `reason`),
   `destination` (carpeta destino absoluta o `null`), `bpm`/`key` leídos de los tags (sin analizar audio).
   `/api/genre-classify` (`src/server.js:162`) pasa a `{ parseJsonResult: true }`. No cambiar la lógica de clasificación
   ni de movimiento (eso es P1/P2 de `plan.md`).
5. **Convertidor con resultado estructurado** (`src/convert_audio.py`): JSON final
   `[{ ok, input, output, format, bitrate, sizeIn, sizeOut, error? }]`; `/api/convert` (`src/server.js:259`) con `parseJsonResult`.
6. **Stems:** confirmar que `stem_separator.py` devuelve rutas absolutas en `files` y que distingue voces/instrumental
   por nombre; si no, agregar `{ vocals, instrumental }` explícitos al resultado.

**Tests (node --test):** `tests/server-media.test.js`: `/api/audio` 400 ruta relativa, 415 extensión, 404 inexistente,
200 completo y 206 con `Range: bytes=0-99` sobre un WAV generado en el test; `/api/waveform` validaciones y, si hay FFmpeg,
`peaks.length === bins` con valores en 0..1 (skip explícito si no hay FFmpeg). Parser del JSON final de `cli.js` y `convert_audio.py`.

**Gate:** `node --test tests/*.test.js` exit 0 · `"$HOME/Library/Application Support/MusicKind/python-venv/bin/python" tests/test_basic.py` exit 0 · `curl` a ambos endpoints con
una copia real (pegar cabeceras de la respuesta 206 en el reporte).

---

### Back 2.1 — Corrección tras revisión del cerebro (2026-09-23)

Verificado en vivo (servidor real, copia de pista): `/api/audio` 206/400 correctos; caché de waveform <1 ms. Falta corregir:

1. **`serveAudio` (`src/server.js`)**: el `fs.createReadStream` no tiene manejador de `error`; si el archivo desaparece o falla la lectura,
   el proceso del servidor cae. Agregar `.on("error", ...)` que destruya la respuesta sin tumbar el servidor. Test: archivo borrado entre
   validación y lectura (o stream que emite error) → el servidor sigue respondiendo a otra petición.
2. **Waveform plana**: con pico máximo por cubeta, una pista masterizada da casi todo `1.0` (medido: 43/48 cubetas ≥0.97).
   Cambiar a **RMS por cubeta** y normalizar dividiendo por el RMS máximo de la pista (0..1, 2 decimales; pista en silencio → todo 0).
   Incluir `v2` en la clave de caché para invalidar las entradas viejas. Test: señal con una mitad a volumen 0.25 y otra a 1.0 →
   las cubetas de la primera mitad ≈0.25 y las de la segunda ≈1.0.
3. **`sourceFromReason` (`src/cli.js`)**: `tag:` NO es metadata embebida; viene de `classifyFromTags([...trackTags, ...artistTags, ...spotifyGenres])`
   (Last.fm + Spotify). Mapeo correcto: `id3:`→`embedded`, `tag:`→`online`, `spotify:`→`spotify`, `local:`→`bpm`, `override:`→`override`,
   `filtered:`→`filtered`, resto→`unmatched`. Test unitario del mapeo (exportar la función o moverla a un módulo pequeño).

**Gate:** `node --test tests/*.test.js` exit 0 (línea base 51/51 + los nuevos).

---

## Front 1 — Base visual, Inspector, reproductor y vista BPM

**Se ejecuta en dos corridas** (línea base `web/` 2026-09-23: build ok, lint solo warnings, vitest 15/15):
- **Front 1a** = Paso 0 + puntos 1 y 2 (deuda de `api.ts`, tokens, componentes compartidos con tests). Sin vistas nuevas.
- **Front 1b** = puntos 3 a 6 (reproductor, shell, `ProcessProvider`, vista BPM).
- `MiniWaveform`: máximo **4 peticiones `/api/waveform` simultáneas** (cola en memoria); los `peaks` ya vienen normalizados 0..1 (RMS).

**Paso 0 — deuda previa obligatoria** (`plan.md`): todos los ítems de **F1.1** (`plan.md:222-234`, correcciones de `api.ts`
y sus tests) y la parte `web/` de **F1.0** (`plan.md:212`: arrastrar usa `getPathForFile` vía `lib/electron.ts`, test de
`DataTransfer.File` sin `path`). Sin esto el resto no es confiable.

1. **Tokens** en `web/src/index.css` (`@theme`, Tailwind v4): `surface-app #09090b`, `surface-panel #111113`,
   `surface-elevated #18181b`, `accent #F97316`, `accent-hover #ea580c`, `line rgb(255 255 255 / 0.06)`, y `key-1`..`key-12`
   (hex del mapa Camelot). Fuente base 13px Geist; `font-mono` = Geist Mono + `tabular-nums`; scrollbar de 5px como el prototipo.
   Regla: cero hex en `.tsx`.
2. **Utilidades y componentes compartidos** portados del prototipo a `web/src/components/music/` y `web/src/lib/camelot.ts`:
   `camelot.ts` (con tests vitest de `normalizeCamelot` y `getHarmonicMatches`), `TrackArtwork`, `CamelotBadge`, `CamelotWheel`,
   `MiniWaveform`, `TrackInspector` (**completo, ver Decisiones**).
   - `MiniWaveform`: barras SVG desde `GET /api/waveform?bins=48`; carga solo filas visibles (IntersectionObserver),
     caché en memoria por ruta; mientras carga, `Skeleton`. Nada de ondas pseudoaleatorias.
3. **Reproductor**: `web/src/lib/player.tsx` (`PlayerProvider` en App) con un solo `HTMLAudioElement`, `src = /api/audio?path=`.
   Onda grande del Inspector con **wavesurfer.js v7** (`media` = ese elemento, `peaks` + `duration` de `/api/waveform?bins=200`,
   sin decodificar en el navegador), estilo idéntico al prototipo (300×56, barras, reproducido zinc-300, pendiente zinc-700).
   Barra espaciadora = play/pausa cuando el foco no está en un input.
4. **Shell** según `design/prototype/src/App.tsx`: sidebar 220px (marca con `web/src/assets/musickind-logo.svg`, no la "M"), buscador ⌘K,
   navegación con barra izquierda naranja en la vista activa, pie con proceso activo o punto de estado + popover
   (reutilizar `lib/system-status.tsx`). ⌘K existente (`components/command-menu.tsx`).
5. **`ProcessProvider`** en App: guarda el proceso activo (`processId`, vista, nombre, `current/total`, archivo, estado)
   y los **últimos resultados por vista**. Cambiar de vista no cancela ni pierde resultados (el prototipo sí los perdía).
6. **Vista BPM completa** (`web/src/views/Bpm.tsx`, desde `design/prototype/src/views/Bpm.tsx`) contra `/api/bpm/analyze`:
   - 4 estados reales: vacío (icono + "Soltar carpeta", drop + clic), ejecutando (barra 2px + `X/Y` + archivo, fila en curso marcada),
     terminado (tabla + Inspector), error (mensaje accionable en la vista, no solo toast).
   - Pausar / Reanudar / Cancelar con `useProcessStream`.
   - Tonalidad con `keySource: "analysis"` = chip con borde punteado + tooltip "Estimada"; con `"tag"`, chip normal.
   - Chip Camelot = control editable (popover con rueda); BPM editable como texto mono; guardar por fila solo si cambió,
     y "Guardar N cambios" en la barra superior → `POST /api/metadata/write` con `bpm` entero y `key` en notación musical.
   - Falta FFmpeg o librosa: estado vacío con botón a Configuración.

### Front 1a.1 — Corrección tras revisión del cerebro (2026-09-23)

Verificado: build 0, vitest 23/23, sin hex en `.tsx`, Inspector con todos sus elementos. Falta corregir (solo `web/`):
1. **i18n**: todo texto visible o `aria-label` en `web/src/components/music/*` sale de `web/src/i18n/{es,en}.json` (claves bajo `music.*`):
   "Ninguna pista seleccionada", "Rueda armónica Camelot", "Forma de onda & análisis", "Down/Exact/Up/Relat.", "Minor (Menor)"/"Major (Mayor)",
   "Pausar"/"Reproducir", "Forma de onda". Usar el hook existente de `web/src/i18n/I18nProvider.tsx`.
2. **Formato**: reescribir `web/src/components/music/*.tsx` en JSX multilínea como `web/src/App.tsx` (un elemento por línea cuando no cabe
   en ~100 columnas). Hoy hay líneas de >1000 caracteres.
3. **`MiniWaveform`**: si `/api/waveform` falla → línea plana gris (no skeleton infinito), sin promesa rechazada sin capturar;
   guardar el fallo en la caché para no reintentar en bucle. Test vitest con fetch simulado que falla.
4. **Tests F1.1 faltantes** (`web/src/lib/api.test.ts`): respuesta no-200 con JSON `{error}` → `onError` con ese mensaje;
   `cancel()` hace POST `/api/cancel` y el estado termina en `idle` al llegar `complete{cancelled:true}`; desmontar `useProcessStream` aborta el fetch.

Nota para Front 1b: `LargeWaveform` hoy crea su propio `Audio` y al cambiar de pista la anterior sigue sonando. En 1b se reemplaza por el
`PlayerProvider` (un solo elemento de audio) — no mantener dos reproductores.

### Front 1b.1 — Corrección tras revisión del cerebro (2026-09-23)

Verificado: build 0, vitest 27/27, sin hex. Captura headless (`vite` + backend real) de `#bpm` y `#classifier` mostró fallos. Corregir (solo `web/`):
1. **Nav activa** (`web/src/App.tsx`): el ítem activo pierde el icono y no tiene barra naranja. Debe ser como `design/prototype/src/App.tsx:191-207`:
   icono visible en `text-accent`, barra izquierda de 2px `border-accent`, fondo `bg-white/[0.06]`.
2. **i18n de navegación** (`web/src/i18n/es.json` → `nav`): `Converter`→`Convertidor`, `Metadata`→`Metadatos`, `Ajustes`→`Configuración`.
   Revisar que ningún otro valor de `es.json` quede en inglés.
3. **Slider** de segundos: hoy es el nativo azul. Usar el Slider de `radix-ui` con pista zinc-800, rango y thumb en `accent` (como el prototipo).
4. **Estado vacío** (regla del proyecto: icono grande + un verbo): quitar el subtítulo "o hacer clic…" y el botón "Elegir carpeta";
   toda la zona (borde punteado) es clicable (abre el selector) y acepta soltar. El chip de carpeta de la barra solo aparece cuando hay carpeta.
5. **Acción principal** "Analizar" deshabilitada sin carpeta seleccionada.
6. **Fila en proceso**: quitar `animate-pulse` (prohibido); marcador fijo: punto `bg-accent` sin animación.
7. **BPM editable**: `input type="text"` + `inputMode="numeric"`, sin flechas; acepta solo enteros 20–300 (la regla del back); fuera de rango →
   borde rojo apagado y no cuenta como cambio.
8. **Tonalidad estimada**: pasar `keySource` a `CamelotBadge`; con `"analysis"` → borde punteado + `Tooltip` i18n "Estimada"/"Estimated".
9. **Título/artista/BPM del tag**: al llegar el resultado, pedir `GET /api/metadata?file=` por pista (máx. 4 simultáneas) y rellenar
   `title`, `artist` y `tagBpm` (el Inspector muestra `tag N` si difiere). Sin tags → nombre de archivo y artista `—`.
10. **Guardar**: cada escritura se reporta por pista (toast de error con el nombre si falla); tras guardar con éxito, la fila deja de contar como cambio.
11. **Formato**: JSX multilínea en `views/Bpm.tsx`, `App.tsx`, `lib/player.tsx`, `lib/process.tsx` (hoy 25 líneas >140 columnas).
12. **Fuera de alcance creado por la corrida anterior**: borrar la carpeta `.impeccable/` de la raíz del repo (la creó un plugin durante la
    corrida 1b; es lo único fuera de `web/` que se permite tocar) y no agregar supresiones de linters de diseño.
13. **Tests nuevos** (vitest): `ProcessProvider` conserva el resultado al desmontar/remontar la vista; `PlayerProvider` reproduce una sola pista
    (al reproducir B se pausa A); validación del BPM editable (19, 301, 12.5 y "abc" rechazados; 128 aceptado).

### Front 1b.2 — Corrección tras QA en vivo del cerebro (2026-09-23)

QA: Chrome headless + backend real + `window.electronAPI` simulado apuntando a una carpeta de copias. El flujo completo funciona
(títulos/artistas del tag, tonalidades tag 8A/11A/6A y análisis 1A, formas de onda reales, Inspector completo). Corregir (solo `web/`):
1. **Causa raíz**: `web/src/index.css` define `--color-accent` dos veces (`:11` naranja y `:47` el `accent` de shadcn); gana el de shadcn
   (gris oscuro) y las 21 clases `text-accent`/`bg-accent`/`border-accent` salen casi negras (icono de nav activa, barra naranja, "Exacto",
   slider, reintentar). Renombrar el token de marca a `--color-brand` / `--color-brand-hover` (clases `text-brand`, `bg-brand`, `border-brand`,
   `fill-brand`…) y reemplazar **todas** las usos de marca; no tocar el `accent` de shadcn. Gate: `grep -c "color-accent:" web/src/index.css` = 1.
2. **BPM entero en pantalla**: tabla e Inspector muestran `Math.round(bpm)`; el decimal va a la línea secundaria del Inspector
   (`129.2 · etiqueta 129`). Un valor que el usuario no editó nunca se marca inválido (hoy `129.2` sale con borde rojo);
   la validación 20–300 entero aplica solo a lo que el usuario escribe. Guardar envía el entero.
3. **Chip de carpeta** en la barra: oculto cuando no hay carpeta (hoy muestra "Soltar carpeta" duplicado).
4. **Estado de error**: se renderiza dentro del layout normal (barra superior e Inspector siguen visibles) y centrado como el vacío;
   solo el mensaje accionable + botón reintentar visible en `brand`. Quitar el párrafo "Analiza una carpeta para…".
5. **Onda grande del Inspector**: hoy desborda el panel por la derecha; ancho = ancho interno del panel (sin overflow).

**Gate:** `npm --prefix web run build` · `npm --prefix web run lint` · `npm --prefix web run test` (exit 0 cada uno) ·
`grep -rEn "#[0-9a-fA-F]{6}" web/src --include=*.tsx` sin resultados · QA manual en Electron con una carpeta de **copias**:
analizar, pausar, reproducir desde el Inspector, cambiar de vista y volver (resultados siguen), guardar 1 BPM y releer
con `GET /api/metadata`. Captura de pantalla en el reporte.

---

## Front 2 — Resto de vistas con el mismo patrón

Cada vista: JSX del prototipo + componentes de Front 1 + 4 estados reales + i18n + tokens. Orden:

1. **Convertidor** → `/api/convert`. Columnas: # · Archivo · `MP3 → WAV` · Tamaño · Estado; "mostrar en carpeta" en hover
   (`lib/electron.ts` `showInFolder`). Resumen `12 archivos · 486 MB → 1.2 GB` desde `sizeIn/sizeOut`. Select de bitrate solo si MP3.
   Sin FFmpeg: estado vacío con botón a Configuración.
2. **Metadatos** → `/api/metadata/list`, `/api/metadata/identify` (una llamada por archivo, secuencial, cancelable),
   `/api/metadata/write`, `/api/metadata/rename`. **Sin columna Confianza.** Al seleccionar, el slot del Inspector
   muestra el formulario de edición del prototipo (original tachado zinc-600 / nuevo zinc-100) con Guardar / Cancelar.
3. **Stems** → `/api/stem-separate`. Vista DAW del prototipo: carriles Original / Voces / Instrumental con onda real
   (`/api/waveform` sobre cada archivo), regla de tiempo, playhead común, M/S y volumen por carril con 3 `HTMLAudioElement`
   sincronizados (re-sincronizar `currentTime` al buscar). Abrir / mostrar en carpeta por carril. Sin demucs: estado vacío
   con botón a Configuración.
4. **Sets** → `/api/set-analyze`. Agrupado por mejor sección con encabezados sticky (`WARMUP 5 · 121–124 BPM`), medidor de
   3 segmentos, curva de energía. Verificar la escala de los puntajes que devuelve `style_analyzer.py` (0–1 o 0–100) y normalizar a 0–100.
5. **Configuración** → `/api/settings`, `/api/check-deps`, `/api/install-dep`, `/api/ffmpeg-status`, `installFFmpeg` (electron).
   Mismo layout de una columna del prototipo.
6. **Clasificador** → `/api/genre-classify` (JSON de Back 2). **Solo análisis sin mover** (switch Simulación forzado en on):
   tabla sin columna de fuente, corrección de género por fila, Inspector con carpeta destino, barra de distribución.
   **Ordenar y Deshacer quedan ocultos** hasta P2 de `plan.md` (manifiesto + aplicar solo aprobados + deshacer);
   hoy `cli.js` sin `--dry-run` mueve todo sin aprobación.
   Sin claves de Spotify: el análisis sigue (usa `--no-spotify`); mostrar aviso accionable, no bloquear.

**Gate por vista:** build + lint + test exit 0 · grep de hex vacío · QA manual en Electron con copias de los 4 estados ·
captura en el reporte. Al cerrar Front 2: revisión adversarial del diff (`gpt-5.6-sol`).

### Front 2 · Convertidor — Corrección tras QA en vivo (2026-09-23)

QA (Chrome headless + backend real, salida redirigida a carpeta temporal): la conversión escribe los archivos pero la vista no muestra resultados.
1. **Back (defecto de Back 2):** `parseJsonResult: true` quedó en `/api/set-create` (`src/server.js:232`, `run_classification.py`) en vez de
   `/api/convert` (`src/server.js:275`). Moverlo: quitarlo de set-create, ponerlo en convert. Test en `tests/` que llame a la ruta
   `/api/convert` real (servidor en puerto efímero, WAV generado en el test, requiere ffmpeg → skip explícito si no hay) y verifique un evento
   SSE `type:"result"` con `results[0].ok === true` y `sizeOut > 0`.
2. `web/src/views/Converter.tsx`:
   - `if (state.status === 'error') break` usa un `state` viejo (closure): cortar el bucle según el resultado real de cada `run` (p. ej. que `run`
     devuelva el estado terminal, o un flag local en `onError`).
   - Estado vacío: quitar la segunda línea naranja duplicada ("Soltar archivos" dos veces); icono + un verbo.
   - Entrada "archivos o carpeta": la zona abre archivos; agregar botón de icono con Tooltip en la barra para elegir carpeta
     (`electron.openDirectory`) que se envía como `inputPath` (el back acepta carpeta).
   - El resumen `N archivos · X → Y` solo aparece cuando hay resultados.
   - JSX multilínea (hoy 18 líneas >140 columnas).

### Front 2 · Convertidor — Corrección 2 (2026-09-23)

QA en vivo OK: MP3→WAV, tabla, resumen `2 archivos · 68.3 MB → 121.5 MB`, Inspector con salida. Falta:
1. **Dato inventado** (viene del prototipo): `normalizeCamelot` (`web/src/lib/camelot.ts:31`) devuelve `'8A'` si no hay tonalidad, y el Inspector,
   la rueda, la carátula y el chip muestran 8A/Am falsos. Cambiar a `string | null`; con `null`: Inspector muestra `—` en KEY, nombre musical y
   modo; la rueda sin segmento activo ni compatibles; fila Down/Exact/Up/Relat. en `—`; carátula en zinc neutro; chip `—`. Ajustar tipos y usos
   (4 llamadas en `.tsx`) y tests de `camelot.test.ts` (null/basura → null).
2. Convertidor: por cada resultado pedir `GET /api/metadata?file=<input>` (máx. 4 simultáneas, igual que BPM) para título, artista, BPM y
   tonalidad del tag en fila e Inspector; sin tags → nombre de archivo y `—`.
3. JSX multilínea en `views/Converter.tsx` (quedan 9 líneas >140 columnas).

## Lote Front 2 (resto) — 2026-09-23

Una vista por corrida, en este orden. El cerebro verifica cada una en vivo (Chrome headless + backend real + `electronAPI` simulado,
salida redirigida a carpeta temporal) y hace commit antes de delegar la siguiente.

**Checklist común (aprendido en Front 1 y Convertidor; aplica a todas):**
- Patrón: `web/src/views/Bpm.tsx` y `web/src/views/Converter.tsx` (4 estados, `ProcessProvider`, Inspector con `children`).
- Estado vacío = icono + un verbo, zona entera clicable y que acepta soltar; sin subtítulos ni botones duplicados.
- Estado de error dentro del layout (barra superior e Inspector visibles), solo mensaje accionable + reintentar.
- Tokens `brand` (nunca `accent`), cero hex en `.tsx`, sin `animate-pulse`. Formato: `npm --prefix web run format:check` (desde L2.1).
- Todo texto visible y `aria-label` por i18n `es` y `en`.
- **Sin datos inventados**: sin dato → `—`. Título/artista/BPM/tonalidad desde `GET /api/metadata?file=` (máx. 4 simultáneas).
- Rutas de salida = `defaultOutputDir` de `GET /api/settings`.
- Tests vitest de la lógica propia de la vista. Gates: `npm --prefix web run build`, `lint`, `test` exit 0 (+ `node --test tests/*.test.js` si toca `src/`).
- No commitear, no tocar `ui/`, `design/`, `NEXT.md`, `plan.md`, `CLAUDE.md`; no agregar supresiones de linters.

### L1 · Metadatos
- **Back:** `POST /api/metadata/identify` acepta `preview: true` → devuelve `{ ok, original, metadata, newFilename }` **sin** `writeMetadata`
  ni `renameFile` (`src/metadata_editor.js:283-285`). Sin `preview` el comportamiento actual no cambia (lo usa `ui/`). Test node con
  `identifyAndTag` en modo preview sobre una copia: el archivo no cambia (mismo mtime y nombre).
- **Vista** (`design/prototype/src/views/Metadata.tsx`): carpeta → `/api/metadata/list` → filas con tags actuales. "Identificar" recorre las
  filas en secuencia con `preview: true` (cancelable) y guarda la propuesta por fila. **Sin columna Confianza.** Al seleccionar, el slot del
  Inspector es el formulario del prototipo (Título, Artista, Álbum, Año, Género, N.º de pista, Nombre de archivo nuevo) con original tachado
  zinc-600 / nuevo zinc-100; Guardar → `POST /api/metadata/write` y, si cambió el nombre, `POST /api/metadata/rename`; Cancelar descarta.
  Sin claves (identify responde 400 "Falta la clave API…"): mensaje accionable con botón a Configuración.

### L1.1 · Corrección tras QA en vivo (2026-09-23)
QA: identify con `preview` no toca el archivo (mtime y nombre iguales) y la vista muestra propuestas y formulario. Falta:
1. `web/src/views/Metadata.tsx:75-76` fija `bpm: null, key: null`: usar `bpm`/`key` del tag (ya vienen de `/api/metadata`).
2. `normalizeCamelot` (`web/src/lib/camelot.ts:29`) solo entiende `Am`/`8A`. Paridad con `parse_key` de `src/key_detection.py`: `Amin`, `A minor`,
   `A Minor`, `Amaj`, `A major`, `A`, sostenidos/bemoles con enarmónicos (`Gbm`→11A, `Dbm`→12A, `C#maj`→3B, `C#`→3B, `Bb`→6B), Camelot
   `8A`/`08A`/`12B`; basura (`""`, `xyz`, `13A`) → `null`. Tests vitest con esos mismos casos. (Tag real que falló: `Amin` → debe dar `8A`.)

### L2 · Configuración
- `design/prototype/src/views/Settings.tsx`, una columna. `GET/POST /api/settings` (spotifyClientId, spotifyClientSecret, lastfmApiKey,
  acoustidApiKey, language, defaultOutputDir). Secretos con botón de icono mostrar/ocultar. Carpeta de salida con `electron.openDirectory`.
- Idioma: cambia la UI en vivo (i18n existente) y se guarda.
- Dependencias como filas con estado: `GET /api/check-deps` (librosa, numpy, demucs, acoustid) y `GET /api/ffmpeg-status`; Instalar →
  `POST /api/install-dep` `{group:"audio"|"stems"}` (SSE, progreso en la fila); FFmpeg → `electron.installFFmpeg`; "Verificar todo".
- Guardar con feedback (toast). Nunca mostrar un secreto en logs ni en toasts.

### L2.1 · Corrección tras revisión (2026-09-23)
QA: vista completa, secretos ocultos, dependencias con estado real, idioma guardado (`en`) aplicado. Falta:
1. **Formateador como gate (reemplaza la regla ">140 columnas")**: para cumplir esa regla se partieron líneas por comas
   (`Settings.tsx:118-140`, `api.ts:26` quedaron ilegibles). Agregar `prettier` como devDependency de `web/` con `.prettierrc`
   `{ "semi": false, "singleQuote": true, "printWidth": 100, "trailingComma": "all" }` (estilo actual de `web/src/App.tsx`),
   scripts `format` y `format:check` sobre `src/App.tsx src/views src/lib src/components/music src/i18n` (no `components/ui`).
   Ejecutar `format` una vez. Gate nuevo del lote: `npm --prefix web run format:check` exit 0.
2. Quitar textos descriptivos (regla del proyecto): subtítulo bajo el título (`settings.subtitle`) y la pista de carpeta (`settings.outputHint`).
3. Fila FFmpeg: botón "Verificar" con texto igual a las demás filas (hoy un icono suelto que parece spinner). Fila Chromaprint:
   sin icono de check cuando no está instalado; solo el estado.

### L2.2 · Bugs de la fila de dependencias (2026-09-23)
En `web/src/views/Settings.tsx:350-360`:
1. `busy` usa `installing === group`; con FFmpeg `group` es `null` e `installing` arranca en `null` → siempre ocupado (spinner fijo).
   `busy` = `checking || (installing !== null && installing === (key === 'ffmpeg' ? 'ffmpeg' : group))`.
2. Con la dependencia instalada el botón dice "Verificar" pero ejecuta `install(group)` / `installFfmpeg()` (reinstala).
   Instalada → la acción es `checkDependencies()`; no instalada → instalar. Chromaprint (sin grupo) no tiene acción.
Tests vitest: FFmpeg instalado no está ocupado al montar; "Verificar" en librosa instalado llama a `/api/check-deps` y **no** a `/api/install-dep`.

### L3 · Sets
- `design/prototype/src/views/Sets.tsx`. Cuatro carpetas (Warmup, Peak, Closing, Pack nuevo) con `electron.openDirectory`; Slider 30–120 (60).
- `POST /api/set-analyze` `{warmup, peak, closing, input, analysisSeconds}` → `[{file, warmup, peak, closing, best, bpm, camelot, keySource, error?}]`;
  los puntajes ya vienen 0–100 (`src/style_analyzer.py:117`); `null` = sección sin referencia → `—`.
- Agrupado por `best` con encabezado sticky (`WARMUP 5 · 121–124 BPM`), medidor de 3 segmentos (ganador en `brand`), curva de energía (SVG 1px).

### L4 · Clasificador (solo análisis)
- `design/prototype/src/views/Classifier.tsx`. `POST /api/genre-classify` `{inputPath, dryRun: true}` **siempre** (switch Simulación visible,
  fijo en on y deshabilitado con Tooltip). Resultado `[{path, artist, title, genre, source, destination, bpm, key, reason}]`.
- Sin columna de iconos de fuente. Género editable por fila (solo en memoria). Inspector: carpeta destino y fuente (texto i18n).
- Géneros: botón "Géneros · N" → Popover con chips (agregar/quitar) y Guardar → `GET/POST /api/genres`.
- Barra de distribución: `brand` para el mayoritario, escala zinc para el resto. **Ordenar/Deshacer no se muestran** (P2 de `plan.md`).
- Sin claves de Spotify: aviso accionable (el análisis sigue con `--no-spotify`).

### L4.1 · Corrección tras QA en vivo (2026-09-23)
QA: dry-run real sobre copias, nada se movió, `config/` intacto; tabla, géneros, distribución e Inspector OK. Corregir en `web/src/views/Classifier.tsx`:
1. **Dato engañoso**: el pie "Destino: <defaultOutputDir>" es falso — el clasificador mueve a `<carpeta de entrada>/<género>` (`src/cli.js:297`).
   Quitar ese pie; el destino por pista ya se ve en el Inspector (`destination`).
2. `source` crudo ("embedded") → etiqueta i18n: embedded="Tag del archivo", online="Spotify/Last.fm", spotify="Spotify", lastfm="Last.fm",
   bpm="BPM", override="Regla manual", filtered="Género desactivado", unmatched="Sin identificar" (y `en`).
3. En la fila, la tonalidad cruda (`Amin`) → `CamelotBadge` normalizado (como BPM/Metadatos); sin tonalidad → `—`.
4. Selector de género por fila: `Select` de shadcn/radix (como el Select de formato del Convertidor), no `<select>` nativo.
5. "Simulación": `Switch` (radix) en on y deshabilitado con `Tooltip` i18n ("Por ahora solo se analiza; ordenar llegará con el flujo seguro"),
   no un checkbox nativo.

### L5 · Stems
- `design/prototype/src/views/Stems.tsx` (vista DAW). Un archivo (`electron.openFiles` sin multiselección), Select WAV/MP3.
- `POST /api/stem-separate` `{files:[path], outputDir, stems:"both", format}` → `[{ok, files, vocals, instrumental}]`.
- Carriles Original / Voces / Instrumental con onda real (`/api/waveform`), regla de tiempo, playhead común, M/S y volumen por carril con
  3 `HTMLAudioElement` sincronizados (re-sincronizar `currentTime` al buscar). Abrir / mostrar en carpeta por carril.
- Sin demucs (`/api/check-deps` demucs=false): estado vacío con botón a Configuración. (En la máquina de QA demucs no está instalado.)

## F9a · Servir la UI nueva en Electron (2026-09-24)

Problema: `npm run electron` / `npm run dev` muestran la UI vieja: Electron carga `SERVER_ORIGIN` (`electron/main.cjs:72`) y el servidor
sirve `ui/` (`src/server.js:23` `uiRoot`, `:98-105`). La UI nueva solo existía en Vite (5173). Cambios (sin borrar `ui/`):
1. `src/server.js`: raíz estática = `web/dist` si existe `web/dist/index.html` y `process.env.MUSIC_KIND_UI !== 'legacy'`; si no, `ui/`.
   Mantener la protección de path traversal (`filePath.startsWith(root)`).
2. `serveFile` (`src/server.js:861`): MIME `.woff2` `font/woff2`, `.woff` `font/woff`, `.json` `application/json`, `.webp` `image/webp`,
   `.ico` `image/x-icon`, `.map` `application/json`.
3. `package.json` raíz: script `"build:web": "npm --prefix web run build"`; `"electron"` y `"dev"` ejecutan `npm run build:web &&` antes de
   `electron .`; script `"electron:legacy": "MUSIC_KIND_UI=legacy electron ."`. `build.files` incluye `web/dist/**/*`.
4. Test node (`tests/`): con un `web/dist` temporal (o el real si existe) `GET /` devuelve el `index.html` de web/dist; con
   `MUSIC_KIND_UI=legacy` devuelve `ui/index.html`; `GET /assets/x.woff2` → `font/woff2`; `GET /../package.json` → 404.
**Gate:** `node --test tests/*.test.js` exit 0 · `npm run build:web` exit 0 · el cerebro abre Electron y comprueba la UI nueva.

## Lote 3 — feedback de Carlos en Electron (2026-09-24)

Mismo "Checklist común" del Lote Front 2. Un ítem por corrida; el cerebro verifica en vivo y hace commit entre ítems.

### M1 · Selección sin barra lateral + carga diferida de vistas
- La barra naranja lateral de 2px (`border-l-2 border-brand`) se percibe como "AI slop". Eliminarla en **todos** los usos (15: nav en
  `web/src/App.tsx` y filas seleccionadas en `web/src/views/*`).
- Nav activa: `bg-white/[0.07]`, texto `zinc-50`, icono `text-brand`; hover `bg-white/[0.04]`; sin borde.
- Fila seleccionada de tabla: `bg-white/[0.06]` sin borde; la mini onda sigue tiñéndose en `brand`.
- Vistas con `React.lazy` + `Suspense` (fallback: `Skeleton` del área principal) en `web/src/App.tsx`; el aviso de Vite ">500 kB" debe
  desaparecer de `npm --prefix web run build`.

### M2 · Agregar archivos en cualquier momento (BPM, Convertidor, Metadatos)
- Hoy soltar solo funciona en el estado vacío. Tras analizar, debe poder **soltarse en toda la vista** (overlay de borde punteado `brand`
  con el verbo i18n "Soltar para agregar" mientras se arrastra) y con un botón de icono `+` (Tooltip "Agregar archivos") en la barra que abre
  `electron.openFiles` multiselección.
- Los nuevos se **suman** a la lista (sin duplicar por ruta absoluta) y la acción principal procesa **solo los pendientes**; los resultados
  se anexan y los anteriores se conservan. Contador en la barra: `N pistas · M pendientes`.
- Soltar una carpeta la expande con `/api/metadata/list` (como hoy) y suma sus archivos.
- Durante un proceso en curso, soltar encola los archivos como pendientes (no interrumpe).
- Tests vitest del reductor de lista (merge sin duplicados, pendientes, anexar resultados).

### M3 · Icono de la app
- Generar `electron/assets/icon.png` (1024×1024) desde `web/src/assets/musickind-logo.svg`: fondo cuadrado redondeado `#09090b`
  (radio 22%), logo centrado al ~68% del ancho. Render con Chrome headless (`--default-background-color=00000000`) o equivalente sin
  dependencias nuevas; conservar el anterior como `electron/assets/icon-legacy.png`.
- Generar `build/icon.icns` con `iconutil` (iconset 16…1024) y apuntar `package.json` `build.mac.icon` a él.
- `electron/main.cjs:17` ya usa `assets/icon.png` para ventana y Dock: no cambiar código salvo que falte algo.

### M3.1 · Corrección del icono (2026-09-24)
1. Plantilla macOS: lienzo 1024 transparente con el cuadrado redondeado de **824×824 centrado** (margen 100px), radio ~185px; logo al ~68% del
   cuadrado. Hoy el fondo ocupa los 1024 y en el Dock se verá más grande que el resto.
2. `build/` está en `.gitignore:27` → el `.icns` no se versiona. Mover a `electron/assets/icon.icns`, apuntar `build.mac.icon` ahí, borrar
   `build/icon.icns` y `build/icon.iconset`.
3. `iconutil` falló por "Invalid Iconset": nombres exactos `icon_16x16.png`, `icon_16x16@2x.png` … `icon_512x512@2x.png` (10 archivos);
   usar `iconutil` (sin Pillow). Verificar con `iconutil -c iconset electron/assets/icon.icns -o /tmp/check.iconset` (ida y vuelta).

### M5 · Selección de filas y limpiar tabla (datatable) — antes de M4
Aplica a **BPM, Convertidor, Metadatos, Sets y Clasificador** (toda vista donde se acumulan filas).
- Columna inicial con `Checkbox` (radix, añadir componente shadcn `checkbox` a `web/src/components/ui`): por fila y en el encabezado
  (seleccionar todo; estado `indeterminate` con selección parcial). Shift+clic selecciona rango. Clic en la casilla no cambia la fila del Inspector.
- Con selección: la barra muestra `N seleccionadas` + botón "Quitar" (icono `Trash2`, Tooltip). Tecla Supr/Backspace (sin foco en input) = Quitar.
- Botón de icono "Limpiar tabla" (`ListX`, Tooltip) siempre visible con filas: vacía la tabla y los pendientes.
- Quitar y Limpiar muestran un toast con acción "Deshacer" (5 s) que restaura filas, orden, resultados y selección.
- **Solo quitan de la lista; nunca borran archivos del disco** (ningún endpoint nuevo). Filas en proceso no se pueden quitar (casilla deshabilitada).
- Si se quita la pista seleccionada en el Inspector, se selecciona la siguiente (o ninguna).
- Lógica en `web/src/lib/list.ts` (extender el módulo de M2) + hook compartido de selección; tests vitest: seleccionar todo/indeterminado,
  rango con Shift, quitar, limpiar, deshacer, filas en proceso protegidas.

### M4 · Reproductor tipo deck (barra de transporte)
Objetivo: combinar la herramienta con la experiencia de Serato/rekordbox sin salir de la app.
- Barra fija inferior (64px) en todas las vistas, sobre el `PlayerProvider` existente (`web/src/lib/player.tsx`, un solo elemento de audio).
  Oculta hasta que se reproduce algo por primera vez.
- Contenido: carátula 40px (`TrackArtwork`), título/artista, BPM y chip Camelot; controles anterior / play-pausa / siguiente; forma de onda
  a lo ancho (`/api/waveform?bins=400`) con parte reproducida en zinc-300, pendiente zinc-700, playhead `brand`, clic = buscar;
  tiempo `mm:ss / mm:ss` mono; volumen (Slider radix) y mute.
- Cola = pistas de la vista actual en su orden (cada vista expone su lista al `PlayerProvider`); doble clic en una fila la reproduce.
  El play del Inspector usa el mismo reproductor.
- Atajos globales (no activos si el foco está en un input): espacio play/pausa, ←/→ ±5 s, Shift+←/→ ±30 s, ↑/↓ pista anterior/siguiente.
- La barra no tapa contenido: el área principal y el Inspector reducen su alto.
- Tests vitest: cola (siguiente/anterior en bordes), atajos ignorados con foco en input, buscar por clic.

### M4.1 · Pulido tras QA en vivo (2026-09-24)
QA: doble clic reproduce (00:03→00:06), ↓ pasa a la siguiente, espacio pausa. Falta:
1. Deck: BPM entero (`Math.round`), como en tablas e Inspector.
2. Pista en reproducción: en su fila, el número `#` se reemplaza por un icono `AudioLines` en `brand` (sin animación); el doble clic
   también la selecciona (el Inspector la muestra) y al cambiar de pista con ↑/↓ o anterior/siguiente la selección la sigue.
3. Inspector (`LargeWaveform`): el botón play/pausa se superpone al playhead; moverlo fuera de la onda (a la izquierda del tiempo `mm:ss`).
Tests vitest de 1 y 2.

### M4.2 · Causa raíz de "doble clic no reproduce" (2026-09-24, diagnóstico del cerebro)
`web/src/components/music/LargeWaveform.tsx:47-50` crea WaveSurfer con `media: audio` (el elemento **compartido** del `PlayerProvider`) y en
cada cambio de pista del Inspector llama `waveRef.current?.destroy()`. En wavesurfer 7.8.15 `Player.destroy()` hace `this.media.pause()`
**siempre**, también con media externa (`web/node_modules/wavesurfer.js/dist/player.js:69`). Con M4.1 el Inspector sigue a la pista en
reproducción → play → cambia el Inspector → destroy → pausa. Los tests con audio simulado no lo ven.
Corrección:
1. Ningún componente enlaza WaveSurfer al audio compartido. `LargeWaveform` (y el deck si lo usa) dibuja las barras en SVG desde `peaks`
   (como `MiniWaveform`), con progreso = `currentTime/duration` del `PlayerProvider` **solo si** `path === activePath` (si no, 0);
   clic = `seek` (si es otra pista: `toggle(path)` y luego seek). Quitar la dependencia `wavesurfer.js` si queda sin uso.
2. Test vitest con un `HTMLAudioElement` simulado que registra `pause()`: reproducir la pista A y cambiar el `path` del Inspector a B
   **no** llama `pause()` sobre el audio compartido.

## Lote 4 — reproducción real y carátulas (2026-09-24)

Diagnóstico del cerebro: en Electron el reproductor no suena porque **Chromium no decodifica AIFF** (`NotSupportedError`, código 4, medido
contra el servidor real); MP3 suena. La biblioteca de Carlos es 109 AIFF / 14 MP3 / 5 FLAC / 1 WAV. El error se tragaba en
`web/src/lib/player.tsx:60,105` (`catch(() => setPlaying(false))`).

### A1 · Back: audio reproducible y carátulas (`src/server.js`)
1. `/api/audio`: si la extensión es `.aif`/`.aiff` (lista `NEEDS_TRANSCODE`), transcodificar **una vez** con ffmpeg a FLAC
   (`-v error -i <path> -map 0:a:0 -c:a flac -compression_level 5 <tmp>`; escribir a `.tmp` y renombrar al terminar) en
   `.cache/audio/<sha1(path|size|mtimeMs)>.flac` y servir ese archivo con el mismo soporte de Range y `Content-Type: audio/flac`.
   Peticiones concurrentes al mismo archivo esperan la misma transcodificación (mapa de promesas en curso). Sin ffmpeg → 503 con mensaje.
   El archivo original nunca se modifica.
2. `GET /api/artwork?path=<abs>`: mismas validaciones que `/api/audio`; con `music-metadata` (`parseFile`, opción `skipPostHeaders`),
   devolver `common.picture[0]` (Content-Type de su `format`) cacheado en `.cache/artwork/<sha1(path|size|mtimeMs)>.<ext>`;
   sin imagen → 404 `{ok:false}` y guardar un marcador de "sin carátula" para no reparsear.
3. Tests node: AIFF generado en el test (ffmpeg, skip explícito si no hay) → `/api/audio` responde `audio/flac` con 200 y 206;
   dos peticiones simultáneas producen una sola transcodificación; `/api/artwork` con un MP3 generado con carátula (ffmpeg `-map 1 -disposition:v attached_pic`)
   → 200 `image/jpeg` o `image/png`; sin carátula → 404; validaciones 400/415/404.

### A2 · Front: errores visibles y carátulas
1. `web/src/lib/player.tsx`: los `catch` de `play()` y el evento `error` del audio muestran toast i18n "No se pudo reproducir <archivo>"
   con el motivo (`MediaError.code`) — nunca silencioso. Mientras se prepara (AIFF convirtiéndose) el botón play muestra estado de carga
   (icono `Loader2` sin `animate-spin`… usar `animate-spin` solo en ese icono está permitido) y el deck el texto i18n "Preparando…".
2. `TrackArtwork`: nueva prop `path`; si hay ruta, `<img src="/api/artwork?path=…" loading="lazy">` recortada (`object-cover`) con el mismo
   tamaño/radio; en error o 404 → el placeholder actual con color Camelot. Usar `path` en filas (todas las vistas), Inspector y deck.
3. Tests vitest: toast en fallo de `play()`; `TrackArtwork` cae al placeholder en error de imagen.

### A3 · Deck: la onda no corresponde a la posición (2026-09-24, diagnóstico del cerebro)
Carlos: "una cosa es donde está la barra naranja y otra donde se desplaza; queda muy adelante". Medido: la duración de Chromium y la real
coinciden (0.0 s en 7 MP3), el seek va al tiempo correcto. Causa: `web/src/components/music/DeckPlayer.tsx:106-118` pinta 400 `<span>` con
`min-w-px flex-1` + `gap-px` (≥ ~800 px) dentro de un botón con `overflow-hidden` de ~665 px → las barras sobrantes se recortan: la onda
visible es solo el ~80% inicial estirado y el tramo "reproducido" (por índice) no coincide con la línea naranja (por % del ancho).
Corrección: la onda del deck en **SVG** con `viewBox="0 0 400 32"` y `preserveAspectRatio="none"` (una `rect` por pico, ancho 0.7 de unidad),
coloreado por `index/peaks.length <= progress`; línea naranja en la misma escala del SVG. Revisar que `LargeWaveform` y `MiniWaveform` no
tengan el mismo patrón. Test vitest: con 400 picos y contenedor de 300 px, la barra en la posición x=150 corresponde al pico 200 y un clic ahí
hace `seek(duration/2)`.

### A4 · El deck desaparece pero la pista sigue sonando (2026-09-24, reporte de Carlos)
Causa: `web/src/components/music/DeckPlayer.tsx:45` obtiene los datos de la pista actual buscándola en la `queue`, y `:64` hace
`return null` si no está. Al quitar/limpiar la tabla la pista sale de la cola → el deck se oculta mientras el audio sigue (sin forma de pararlo).
Decisión (como Spotify/rekordbox): quitar de la lista **no** corta la reproducción.
1. `PlayerProvider` guarda una copia `current: DeckTrack | null` al empezar a reproducir (título, artista, bpm, key, path); el deck usa
   `current`, no la cola. Visible mientras `current` exista.
2. Si `current` ya no está en la cola: anterior/siguiente deshabilitados; al terminar la pista no avanza (se detiene).
3. Botón de icono "Cerrar reproductor" (`X`, Tooltip i18n) en el deck: pausa, vacía `src`, `current = null`, oculta el deck.
4. Tests vitest: limpiar la cola con una pista sonando → deck visible y audio no pausado; cerrar → `pause()` y deck oculto;
   siguiente deshabilitado si `current` no está en la cola.

## Lote 5 — Stems a elección, escucha por carril y Chromaprint (2026-09-24)

### S1 · Stems: elegir qué generar y escuchar por carril (solo `web/`)
Diagnóstico: el play de Stems (`web/src/views/Stems.tsx:272`) reproduce los 3 carriles a la vez (volúmenes 85/100/90 en `:52-54`),
así que se oye la mezcla completa; no hay forma práctica de oír solo voces. `:261` envía siempre `stems: 'both'`.
1. Control segmentado (i18n) "Voces · Instrumental · Ambos" junto al formato → `stems: 'vocals'|'instrumental'|'both'` (el back ya lo acepta,
   `src/server.js` `/api/stem-separate`). Tooltip i18n: el tiempo de proceso es el mismo; cambia qué archivos se guardan. Los carriles que
   se muestran son Original + los generados.
2. Escucha exclusiva por defecto: solo **un** carril audible (al terminar la separación: Voces si existe, si no Instrumental). Cada carril
   tiene un botón de auriculares (`Headphones`, Tooltip i18n "Escuchar este carril"); clic = escuchar solo ese carril al instante, sin
   perder sincronía; Shift+clic = sumarlo/quitarlo de la mezcla. El carril audible se marca con fondo `bg-white/[0.06]` e icono `brand`.
   Se conservan volumen por carril; M/S se reemplaza por esta lógica (menos controles).
3. Reproducir stems pausa el deck global (`usePlayer`) y reproducir en el deck pausa los stems.
4. Tests vitest de `createStemAudioController`: exclusivo por defecto, clic cambia de carril, Shift suma, volúmenes efectivos correctos;
   y de que `stems` enviado coincide con la opción elegida.

### S1.1 · Ocultar carriles no generados
QA: con "Voces" el carril Instrumental aparece vacío. Mostrar solo Original + los carriles realmente devueltos (`vocals`/`instrumental`
no nulos); ajustar la regla de tiempo y el Inspector (fila del stem ausente oculta). Test vitest.

### C1 · Chromaprint instalable (electron + web)
`fpcalc` (Chromaprint) solo se usa para identificar por huella con clave de AcoustID. Hoy Configuración muestra "No instalado" sin acción.
1. `electron/main.cjs`: handler `install-chromaprint` análogo a la instalación de FFmpeg (macOS: `brew install chromaprint`; Windows: `winget
   install -e --id AcoustID.Chromaprint` si existe, si no mensaje accionable), mismo manejo de errores y mensajes; exponer en
   `electron/preload.cjs` y `web/src/lib/electron.ts` (no-op en navegador).
2. Configuración: fila Chromaprint con botón "Instalar" cuando no está; tras instalar → re-verificar (`/api/check-deps`). Tooltip i18n:
   "Opcional: identifica pistas sin tags por huella de audio (requiere clave de AcoustID)".
3. Tests: wrapper `electron.ts` (no-op sin Electron) y la fila de Settings (Instalar llama al wrapper y luego re-verifica).

## Lote 6 — Clasificar por ejemplos (colección de ehdu, 2026-09-24)

Objetivo (acordado con Carlos): usar su gusto curado para clasificar la colección `/Volumes/Mac Backup/MUSIC BACKUP`.
- **Ejemplos** = subcarpetas de `MUSIC BACKUP/2026/` (Tech house 116, house 16, Indie dance 16, minimal : deep tech 13, Afro House 12,
  deep house 11; `acapella` y los archivos sueltos de la raíz de `2026` no son ejemplos). 172 AIFF, 14 MP3, 10 FLAC, 1 WAV.
- **A clasificar** = todo `MUSIC BACKUP/` **excepto** `2026/` (~2,480 pistas, ~135 GB): carpetas de género del MusicKind viejo + `Unsorted`.
- **Regla dura:** nada se escribe, mueve ni borra dentro de `MUSIC BACKUP/2026/` (validado en código, no solo en UI).
- Etapa 1: mover lo aprobado a `MUSIC BACKUP/Clasificado/<Género>/`; lo que no se parece a ningún ejemplo queda fuera (sin más procesamiento).
- Etapa 2: playlists `.m3u8` Warmup (deep + afro) · Peak (tech house) · Closing (indie dance + house) desde `Clasificado/`; minimal fuera del set.

### E0 · Medición antes de construir (script reutilizable)
Crear `scripts/eval_examples.py` (Python del venv de la app; instalar `transformers` en ese venv si falta). **Solo lectura del disco**;
caché en `.cache/embeddings/<backend>/<sha1(path|size|mtime)>.npy` (dentro del repo, ya ignorado por `.gitignore`).
1. Entrada: `--examples "/Volumes/Mac Backup/MUSIC BACKUP/2026"` (etiqueta = nombre de subcarpeta; excluir `acapella` y archivos sueltos)
   y `--negatives` = muestra aleatoria fija (seed 42) de 60 pistas de `MUSIC BACKUP/Melodic Techno`, `Progressive House`,
   `Melodic House : Techno`, `Dance Pop` (fuera del gusto) para calibrar el rechazo.
2. Por pista: 30 s centrados en la mitad (si dura menos, entera), mono. Backends:
   - `librosa`: las 53 features de `src/style_analyzer.py` **estandarizadas** (z-score con media/desviación de los ejemplos).
   - `clap`: `transformers` `ClapModel` + `ClapProcessor` `laion/clap-htsat-unfused` (48 kHz), embedding de audio normalizado L2.
   - `mert`: `m-a-p/MERT-v1-95M` (`trust_remote_code=True`, 24 kHz), media temporal de la última capa oculta; si falla por dependencias,
     reportar el error y seguir con los otros.
   Dispositivo `mps` si está disponible, si no `cpu`.
3. Métricas por backend: kNN coseno (k=5, voto ponderado) con **leave-one-out** y regresión logística con **5-fold estratificado**:
   exactitud, macro-F1, recall por clase y matriz de confusión. Rechazo: con el umbral de similitud máxima que deja pasar el 95% de los
   ejemplos (LOO), ¿qué % de los negativos se rechaza? Tiempo medio por pista.
4. Salida: `.cache/eval/report.md` + `.cache/eval/report.json` y resumen en stdout. No toca `web/`, `src/` salvo lectura.
**Gate (cerebro):** reporte con los 3 backends (o el error de MERT), números reproducibles en una segunda corrida desde caché.

### E0 · Resultado (medido por el cerebro, 2026-09-24)
- Audio con los ejemplos de `2026` (184): kNN LOO exactitud librosa 0.571 · CLAP 0.636 · MERT 0.598 — **igual a la base "siempre Tech house" (0.630)**;
  recall por clase fuera de Tech house 0–0.27. Centroide balanceado: macro-recall 0.26–0.29 (azar 0.17). Rechazo de fuera-de-gusto: CLAP 38%.
  → El audio **no** sirve para decidir género con 11–16 ejemplos por clase.
- Tags de género: 100% de `2026` tiene tag y coincide con la carpeta de Carlos ~93% exacto / ~97% con alias. En las 2,487 a clasificar:
  ~90% con tag Beatport limpio; 157 sin tag + ~30 con basura (URLs).
  → **Etapa 1 = género por tag normalizado**; sin tag/basura/desconocido → "Por revisar". Audio: etapa 2 (gusto) y, opcional, E0b
  (entrenar con las ~2,300 pistas etiquetadas para sugerir en las ~190 sin tag).

### E1 · Motor de clasificación por tags (back, solo propone)
1. `config/genre-aliases.json`: géneros canónicos y alias (comparación sin mayúsculas, espacios colapsados, `&`/`and`, `/`, `:` normalizados):
   Tech House ← Latin Tech · Afro House ← Afro Latin, Afro / Latin · Deep House · House ← Funky House · Indie Dance ← Nu Disco, NuDisco,
   Nu Disco / Disco, Nu Disco / Indie Dance, Indie Dance / Nu Disco · Minimal Deep Tech ← Minimal, Minimal / Deep Tech, Deep Tech ·
   Melodic House & Techno ← Melodic House, Melodic Techno · Progressive House · Organic House ← Organic House / Downtempo · Techno ·
   Electronica ← Electronic · Dance Pop ← Dance, Dance / Pop, Dance / Electro Pop, Europop · DJ Tools ← DJ Tools / Acapellas.
   Tag con `http`, `www.` o `.com` = basura.
2. `src/tag-classifier.js` (Node, `music-metadata` `parseFile(path, {duration:false, skipCovers:true})`): recorre `inputRoot` recursivo con
   `services/audio-discovery.js`, **excluyendo** `excludeRoots` (y cualquier ruta dentro de ellas). Por pista:
   `{ path, tagGenre, genre|null, status: 'ok'|'review'|'duplicate', reason, destination|null }`.
   `status:'review'` si no hay tag, es basura o no está en la tabla; `duplicate` si existe un archivo con mismo nombre y tamaño en un
   `excludeRoot` (es un ejemplo ya clasificado: no se mueve). `destination = destRoot/<genre>/<nombre>`.
3. `POST /api/classify-by-tags` (SSE, `runProcessWithProgress` con `parseJsonResult`, script CLI `src/tag-classifier-cli.js`):
   body `{ inputRoot, excludeRoots, destRoot }`. **Rechaza (400)** si `destRoot` o `inputRoot` están dentro de un `excludeRoot`, o si
   algún `excludeRoot` está dentro de `destRoot`. Nunca escribe ni mueve nada. `[PROGRESS:X/Y] Processing: nombre` por archivo.
4. Tests node con archivos generados en tmp (ffmpeg `-metadata genre=…`): alias, basura, sin tag, desconocido, duplicado, exclusión de
   `excludeRoots`, validaciones 400, y que el árbol de entrada queda idéntico (mismos mtimes) tras correr.
**Gate:** `node --test tests/*.test.js` exit 0 + corrida real del cerebro sobre `MUSIC BACKUP` con `excludeRoots=[…/2026]` (solo lectura).

### E3 · Aplicar movimientos con manifiesto y deshacer (back, crítico)
1. `config/genre-aliases.json`: agregar alias Afro House ← "Afro / Latin / Brazilian", "Afro Melodic"; Electronica ← "Electronica / Downtempo".
   `src/tag-classifier.js`: marcar `possibleDuplicate: true` (sin cambiar `status`) si existe en un `excludeRoot` un archivo con el mismo
   nombre (sin distinguir mayúsculas) aunque el tamaño difiera (corrida real: 6 casos).
2. `POST /api/classify-apply` (SSE, progreso por archivo) body `{ moves:[{from,to}], excludeRoots, destRoot }`:
   - Validar **cada** movimiento antes de mover nada: `from` existe, es audio soportado y **no** está dentro de un `excludeRoot`;
     `to` está dentro de `destRoot`; `destRoot` no está dentro de un `excludeRoot`. Un solo movimiento inválido → 400 y no se mueve nada.
   - Escribir primero el manifiesto `destRoot/.musickind/manifests/<ISO>.json` `{createdAt, destRoot, moves:[{from,to,status:'pending'}]}`.
   - Mover uno por uno: crear carpeta; si `to` existe, sufijo ` (2)`, ` (3)`… (nunca sobrescribir); `fs.rename`, y si falla con `EXDEV`,
     copiar + verificar tamaño + borrar origen. Actualizar el manifiesto tras cada archivo (`done`/`error` con motivo). Cancelable.
3. `GET /api/classify-manifests?destRoot=` lista manifiestos (fecha, total, hechos, deshecho sí/no). `POST /api/classify-undo`
   `{ manifestPath }` (SSE): mueve de vuelta cada `done` si `to` sigue existiendo y `from` está libre (si no, `error` sin tocar);
   marca `undone` en el manifiesto. El manifiesto debe estar dentro de `destRoot/.musickind/manifests`.
4. Tests node en tmp: movimiento válido, colisión con sufijo, rechazo de `from` dentro de exclude (nada se mueve), rechazo de `to` fuera de
   destRoot, cancelación a mitad deja manifiesto coherente, deshacer completo, deshacer con destino ocupado, EXDEV simulado.
**Gate:** node tests exit 0 + corrida real del cerebro sobre una **copia** de 5 pistas (no sobre el backup).

### E3.1 · Refuerzos tras prueba real sobre copia (2026-09-24)
Prueba del cerebro sobre una copia: rechazo total con un archivo de `2026`, movimiento y deshacer correctos. Falta:
1. **Re-escaneo:** `destRoot` (`Clasificado/`) está dentro de `inputRoot`; tras mover, un segundo análisis propone de nuevo las pistas ya
   clasificadas. `classifyByTags` debe excluir siempre `destRoot` (además de `excludeRoots`) del recorrido. Test.
2. **Deshacer confía en el manifiesto:** `undoClassifyManifest` (`src/classify-apply.js`) no valida que cada `move.to` esté dentro de
   `manifest.destRoot`. Validar por movimiento (si no, `undoStatus:'error'` sin tocar). Test con manifiesto alterado.

### Back 1b · Medir motores de tonalidad (solo medición, 2026-09-24)
Motivo: el análisis actual (`src/key_detection.py`, librosa + Krumhansl) acierta 47% exacto / 60% compatible. Carlos quiere mejorarlo
**sin cambiar la UI** (se sigue viendo como hoy: nota musical + chip Camelot; nada de notación Open Key/Serato).
1. `scripts/eval_key.py` (venv de la app, Python 3.9): conjunto de verdad = pistas de `MUSIC BACKUP/2026` (solo lectura, recursivo)
   cuya tonalidad del tag se interpreta con `parse_key` (`src/key_detection.py`). Límite `--limit` (defecto todas), `--input` configurable.
2. Motores a comparar sobre **la misma ventana** que hoy (120 s centrados) y también la pista entera:
   - `librosa`: `detect_key_from_file` actual (línea base).
   - `essentia`: `pip install essentia` en el venv si hay rueda para 3.9/arm64; `KeyExtractor` con perfiles `edma`, `bgate`, `temperley`.
   - `libkeyfinder`: `brew install libkeyfinder`; compilar un CLI mínimo (C++ con `keyfinder::KeyFinder`, audio decodificado por
     `ffmpeg -f f32le -ac 1 -ar 44100` por pipe) en `.cache/tools/keyfinder-cli`. Si instalar/compilar falla, reportar el error exacto y seguir.
3. Métricas por motor: exacto, relativo (mismo número Camelot distinto modo), quinta (±1 Camelot mismo modo), compatible (suma de los tres),
   error mayor/menor, tiempo medio por pista. Matriz de errores más frecuentes (verdad→predicción, top 10).
4. Salida `.cache/eval/key-report.md` + `.json` y resumen en stdout. Caché por pista en `.cache/eval/key/` para re-correr sin recalcular.
   No toca `src/`, `web/`, ni escribe nada en `/Volumes`.
**Gate (cerebro):** reporte con los 3 motores (o el error de instalación), segunda corrida desde caché con los mismos números.
Decisión posterior (fase aparte): integrar el ganador en `resolve_key` como motor de respaldo; el tag sigue mandando.

### Back 1b.1 · Correcciones del reporte (revisión del cerebro, 2026-09-24)
Solo `scripts/eval_key.py`. No tocar `src/`, `web/`, `/Volumes`.
1. **Confusiones:** en el bucle de `main()` registrar en `confusions` solo si `pred` es `None` o `pred["camelot"] != truth["camelot"]`.
   Hoy lista aciertos ("6A → 6A").
2. **Cuentas que suman 100 %:** añadir al informe columnas `Sin predicción` (pred `None`) y `Fallos` (excepción) por motor/ventana.
   `N` = filas totales del motor (pistas con tag); porcentajes sobre `N`, de modo que exacto + error menor + error mayor + sin predicción
   + fallos = 100 %. Mostrar en la sección de errores los 3 mensajes de excepción más frecuentes por motor.
**Gate (cerebro):** dos corridas seguidas con el venv de la app dan tablas idénticas; la 2.ª con `Cache hits` = N − fallos en todos
los motores; ninguna fila de confusiones con verdad = predicción.

### Back 1c · libkeyfinder incluido como motor de respaldo (2026-09-24)
Decisiones de Carlos: pista entera (no 120 s); binario incluido en la app (el usuario no instala nada); MusicKind es gratis → **GPL-3.0-or-later**.
Medición que lo justifica: Back 1b (76,3% exacto vs 45,4% librosa sobre 194 pistas). La UI no cambia.
1. **Binario universal** — `scripts/build-keyfinder.sh` (bash, idempotente, trabaja en `.cache/build/keyfinder/`):
   descarga fuentes fijadas con sha256 (`fftw-3.3.11.tar.gz` de fftw.org, `libkeyfinder` tag `2.2.8` de github.com/mixxxdj),
   compila **estáticos** fftw (precisión doble, la que usa libkeyfinder) y libkeyfinder para `arm64` y `x86_64` por separado
   (`MACOSX_DEPLOYMENT_TARGET=12.0`), compila `tools/keyfinder-cli/keyfinder-cli.cpp` (mover aquí el fuente que hoy genera
   `scripts/eval_key.py`, mismo protocolo: f32le mono 44100 por stdin → `{"key":"Am"}`) enlazando los estáticos, y une con `lipo`
   en `vendor/keyfinder/darwin/keyfinder-cli`. Herramientas de compilación (`cmake`) se pueden instalar con brew; el binario final
   no puede depender de `/opt/homebrew` ni `/usr/local`. El binario **sí se commitea** (el usuario no compila).
   `scripts/eval_key.py` usa ese binario en vez de compilar el suyo.
2. **`src/key_detection.py`**: `detect_key_keyfinder(path)` — decodifica la pista entera con `ffmpeg -v error -i <path> -map 0:a:0 -vn
   -ac 1 -ar 44100 -f f32le pipe:1`, la pasa al binario (timeout 120 s), `parse_key` del resultado. Ruta del binario: env
   `MUSICKIND_KEYFINDER` si existe, si no `<raíz del repo>/vendor/keyfinder/darwin/keyfinder-cli` (solo en `darwin`).
   `resolve_key`: tag → keyfinder → librosa (`detect_key_from_file` actual) → nulos. Cualquier fallo de keyfinder (binario ausente,
   no ejecutable, salida inválida, timeout) cae a librosa sin traza en stdout. `keySource` sigue siendo `"analysis"`; contrato igual.
3. **Empaquetado:** `package.json` → `"license": "GPL-3.0-or-later"`, `build.extraResources` copia `vendor/keyfinder/darwin` a
   `keyfinder/` (solo mac). `electron/main.cjs:143` (env del backend): si `app.isPackaged`, añadir
   `MUSICKIND_KEYFINDER = path.join(process.resourcesPath, 'keyfinder', 'keyfinder-cli')`. El servidor ya hereda `process.env` a Python.
4. **Licencias:** `LICENSE` en la raíz con el texto íntegro de la GPL-3 (de gnu.org); `THIRD_PARTY_NOTICES.md` con libkeyfinder
   (GPL-3, © Ibrahim Sha'ath y colaboradores de Mixxx, enlace al tag 2.2.8), fftw (GPL-2+, © MIT/Frigo-Johnson, enlace 3.3.11),
   Electron (MIT), librosa (ISC), numpy (BSD-3), demucs (MIT), FFmpeg (LGPL/GPL, lo instala el usuario). Copiar `COPYING` de
   libkeyfinder y fftw a `vendor/keyfinder/licenses/`. README: sección "Licencia" y agradecimiento al proyecto Mixxx.
5. **Tests** (`tests/test_key_detection.py`): keyfinder se usa cuando el binario existe (tríada sintética escrita a WAV temporal →
   tonalidad correcta); con `MUSICKIND_KEYFINDER` apuntando a un archivo inexistente cae a librosa y devuelve resultado; tag sigue mandando.
No tocar `web/`, UI, ni otros motores. Sin commit.
**Gate (cerebro):** `lipo -archs` = `x86_64 arm64`; `otool -L` solo `/usr/lib/*`; `vtool -show-build` minos 12.0; la rebanada x86_64
bajo Rosetta (`arch -x86_64`) da la misma tonalidad que arm64 en 20 pistas de `2026`; tests de tonalidad en verde con el venv;
`resolve_key` sobre 20 pistas **sin tag** (copias en el scratchpad) devuelve tonalidad por keyfinder; node test suite sin regresiones.

### Back 4 · Quitar Spotify; Discogs + Last.fm + Deezer + MusicBrainz con claves de la app (2026-09-24)
Motivo: desde feb-2026 Spotify no entrega `genres` a apps en modo desarrollo y exige Premium al dueño. Decisión de Carlos: quitar
Spotify y que el usuario **no tenga que crear claves**.
1. **Claves de la app (no del usuario):** `src/providers/app-keys.js` lee, en orden, `process.env` (`DISCOGS_KEY`, `DISCOGS_SECRET`,
   `LASTFM_API_KEY`, `ACOUSTID_API_KEY`) → `config/app-keys.json` (nuevo, **en `.gitignore`**; el repo es público) → `settings.json`
   (override opcional). Crear `config/app-keys.example.json` con las claves vacías. Sin clave = ese proveedor se omite sin error.
2. **Proveedores** en `src/providers/` (fetch con timeout 8 s, reintento en 429 respetando `Retry-After`, caché `src/cache.js`,
   `User-Agent: MusicKind/<version> (+https://github.com/cagr1/MusicKind)`):
   - `discogs.js`: `GET /database/search?type=release&artist=&track=` con `key`/`secret` → hasta 3 resultados → `styles` + `genres`.
     Límite 60/min: cola con ≥1.1 s entre llamadas.
   - `lastfm.js`: mover `src/lastfm.js` aquí (mismo API).
   - `deezer.js` (sin clave): `GET https://api.deezer.com/search?q=artist:"…" track:"…"` → `{artist,title,album,isrc,bpm,cover,releaseDate}`
     (`bpm` y `release_date` vía `GET /track/{id}`).
   - `musicbrainz.js` (sin clave, 1 llamada/s): `recording/{mbid}?inc=artists+releases+tags+genres` para enriquecer lo que dé AcoustID.
3. **Clasificador por tags** (`src/tag-classifier.js` online): orden Discogs `styles` → Discogs `genres` → Last.fm pista → Last.fm artista.
   `genreSource: 'discogs'|'lastfm'`. Quitar la rama Spotify.
4. **Identificar** (`/api/metadata/identify`, `identifyAndTag` en `src/metadata_editor.js`): AcoustID (+MusicBrainz) si hay huella; si no,
   Deezer por tags o por nombre `Artista - Título`. Mismo contrato de respuesta (`preview` incluido).
5. **Clasificador legado** (`src/cli.js`, `src/classify.js`, `src/classification-source.js`): reemplazar Spotify por Discogs/Last.fm;
   `/api/genre-classify` ya **no** devuelve 400 por falta de claves de Spotify. Fuente `spotify` → `discogs`.
6. **Borrar** `src/spotify.js`, `spotifyClientId/Secret` de `loadSettings`, `settings.example.json`, `POST /api/settings`, i18n y `Settings.tsx`.
   Configuración: quitar los campos de claves de la vista principal; sección plegada "Avanzado · claves propias (opcional)" con Last.fm,
   Discogs y AcoustID. Web: `genreSource` y chips aceptan `discogs`; quitar `spotify`.
7. **Tests** node con `fetch` simulado (sin red): Discogs mapea style→canónico; 429 con reintento; sin claves se omite; Deezer identifica
   por nombre; `/api/genre-classify` sin claves no da 400; `app-keys` respeta el orden env → archivo → settings. Vitest de los cambios web.
**Gate:** node + build + lint 0 errores + vitest; `grep -ri spotify src web/src tests config` sin resultados (salvo este historial);
el cerebro prueba en vivo con claves reales: Discogs sobre las 134 "Por revisar" (solo lectura) e identify sobre una copia.

### E2.3 · Eliminar carpetas protegidas (decisión de Carlos, 2026-09-24)
Solo existen carpeta de entrada y carpeta de salida. Revierte E2.1 punto 1-2 y los `excludeRoots` de E1/E3:
1. Back: quitar `protectedRoots` de `loadSettings`/`POST /api/settings`/`normalizeProtectedRoots`; `/api/classify-by-tags`,
   `/api/classify-apply`, `/api/classify-undo` ya no aceptan ni exigen `excludeRoots` (ignorar si llega). Se mantiene: el análisis
   excluye siempre `destRoot` (E3.1), `to` dentro de `destRoot`, validación de rutas del manifiesto al deshacer, colisiones con sufijo.
   `src/tag-classifier.js`/CLI: quitar `--exclude-root`, `status:'duplicate'` y `possibleDuplicate` (dependían de las carpetas de ejemplo).
2. Web: quitar tarjeta "Ejemplos protegidos", aviso rojo, Tooltip de Mover, la línea de protegidas del diálogo, sección de Configuración,
   estado/filtro "Posible duplicado" e i18n asociadas. Quedan 2 tarjetas: Carpeta a clasificar · Destino.
3. Tests: borrar `tests/server-protected-roots.test.js`; ajustar los de E1/E3 que usaban `excludeRoots`; vitest actualizados.
**Gate:** node + build + lint 0 errores + vitest; `grep -rn "protectedRoots\|excludeRoot\|possibleDuplicate" src web/src tests` vacío.

### Back 4.1 · Correcciones de la revisión del cerebro
1. `src/providers/discogs.js:28`: la búsqueda de Discogs devuelve `style` y `genre` (singular), no `styles`. Leer `result.style` y
   `result.genre`. Ajustar el test para que el mock use la forma real de la API.
2. `src/providers/app-keys.js`: el archivo `config/app-keys.json` acepta **ambas** formas de nombre por clave (`discogsKey` o `DISCOGS_KEY`,
   `discogsSecret`/`DISCOGS_SECRET`, `lastfmApiKey`/`LASTFM_API_KEY`, `acoustidApiKey`/`ACOUSTID_API_KEY`). Test de ambas.

### Back 4.2 · Discogs: segunda búsqueda por texto libre
Medido en vivo: `artist=Black Coffee&track=The Rapture` → 0 resultados (Discogs lista "&Me, Black Coffee*"); `q=Black Coffee The Rapture Pt.III`
→ `style: House, Deep House`. En `src/providers/discogs.js` `search`: si la búsqueda por `artist`+`track` devuelve 0, repetir con
`q="<artist> <title>"` (título sin "(Original Mix)", "(Extended Mix)" ni corchetes `[...]`). Misma caché por consulta. Test con mock.

### Back 4.3 · Online: no aceptar géneros genéricos
Medido en vivo (Unsorted, 134 por revisar): 56 resueltas online, pero 43 eran genéricas — Discogs `genre: Electronic`→Electronica (33),
Last.fm `electronic` (6) y `dance`→Dance Pop (4). Solo 13 útiles.
1. `src/tag-classifier.js:72`: quitar el candidato `discogsClient.getGenres` (el campo `genre` de Discogs es siempre de nivel superior).
2. En la fase online (solo ahí; el pase por tag del archivo no cambia) ignorar tags genéricos: `electronic`, `electronica`, `dance`,
   `pop`, `electro`, `edm`, `club`, `electronic dance music`.
3. Especificidad: si en los resultados aparecen `House` y otro canónico más específico (`Deep House`, `Tech House`, `Afro House`,
   `Progressive House`, `Organic House`, `Melodic House & Techno`, `Minimal Deep Tech`), gana el específico; entre varios específicos,
   el más frecuente en los 3 resultados de Discogs (empate: el primero).
Tests node con mocks para 1-3.

### Back 4.4 · Deezer: búsqueda por texto libre
Medido en vivo 2026-09-24: `q=artist:"Fisher" track:"Losing It"` → total 0; `q=Fisher Losing It` → "Losing It | Fisher".
`src/providers/deezer.js`: si la búsqueda avanzada da 0, repetir con `q="<artist> <title>"` (título limpio como en Discogs 4.2:
sin corchetes ni "(Original/Extended Mix)"). Aceptar el primer resultado solo si el artista coincide (sin mayúsculas/acentos, contiene)
con alguno de los artistas del tag. Test con mock.

### E2 · Vista "Clasificar por etiquetas" (front)
Modo por defecto del Clasificador (el método viejo queda en un `Select` "Método: Etiquetas (recomendado) · Reglas online").
1. Tres carpetas: Carpeta a clasificar · Ejemplos protegidos (excluidas; se guardan en `localStorage` como conveniencia) · Destino
   (por defecto `<carpeta a clasificar>/Clasificado`). Analizar → `/api/classify-by-tags`.
2. Tabla virtualizada (`@tanstack/react-virtual`; 2,487 filas fluidas) con: carátula, título/artista, tag original, género propuesto
   (Select con los canónicos + "Por revisar"; editable por fila y **en lote** para las seleccionadas), estado (Propuesto · Por revisar ·
   Posible duplicado de ejemplos) y destino. Filtros por estado y por género con conteos; barra de distribución.
3. "Mover N propuestas" → diálogo de confirmación con conteo por género y destino → `/api/classify-apply` solo con filas `ok` o
   corregidas (nunca "Por revisar" ni duplicados); progreso; al terminar toast con "Deshacer" (`/api/classify-undo`) y panel "Historial"
   (manifiestos). Reproductor, selección y carátulas como el resto.
4. Tests vitest: construcción de `moves` (excluye revisar/duplicados, respeta correcciones), filtros y conteos, lote de cambio de género.

### E2.1 · Protección en el servidor y géneros del back (QA en vivo, 2026-09-24) — CRÍTICO
QA del cerebro sobre el disco real (solo análisis, nada movido): sin carpeta protegida la vista analizó 2,684 pistas **incluyendo `2026`**
y habilitó "Mover propuestas · 2443". La protección dependía de que el cliente enviara `excludeRoots`. Corregir:
1. **Carpetas protegidas en el servidor:** `config/settings.json` gana `protectedRoots: string[]` (rutas absolutas; `GET/POST /api/settings`
   las lee/guarda sin perder las demás claves). `/api/classify-by-tags`, `/api/classify-apply` y `/api/classify-undo` **siempre** unen
   `settings.protectedRoots` con lo que envíe el cliente (el cliente no puede quitarlas). Tests node: con `protectedRoots` en settings y
   `excludeRoots: []` en la petición, apply de un archivo protegido → 400 y nada se mueve; classify-by-tags no lo lista.
2. **UI:** "Ejemplos protegidos" del Clasificador y una sección "Carpetas protegidas" en Configuración leen/escriben `protectedRoots`
   (no `localStorage`); botón visible con texto "Agregar" cuando la lista está vacía. Si `protectedRoots` está vacío, el botón Mover muestra
   un Tooltip de advertencia y el diálogo de confirmación lista las carpetas protegidas (o "ninguna" en rojo).
3. **Géneros:** nuevo `GET /api/genre-aliases` → `{ canonical: string[] }` desde `config/genre-aliases.json`. El Select de género, los filtros
   y la leyenda usan **solo** `result.genre` del back y esa lista canónica (eliminar `TAG_GENRES`, `web/src/views/Classifier.tsx:571`).
   Hoy aparecen valores crudos ("Latin Tech", "Afro Latin", "Nu Disco / Disco") en la leyenda y una fila "Afro Latin" con Select vacío.
4. **Método:** el control de método muestra el método **actual** (Select con valor), no el otro.
Tests vitest de 2–4.

### E2.2 · QA de Carlos en Electron (2026-09-24): género pisado, layout y respaldo online
Captura: 980 pistas de `MUSIC BACKUP/Music`; leyenda con tags crudos ("electronicfresh.com", "Minimal", "92" sin nombre), barra de
distribución ocupando media vista abajo (solo 2 filas visibles), encabezado "Original tag" montado sobre la columna de pista.
1. **Bug (causa verificada):** `web/src/views/Classifier.tsx:620` hace `{ ...row, ...meta }` y el `genre` crudo de `readMetadata`
   pisa el `genre` canónico del back. Mezclar solo `title`, `artist`, `bpm`, `key` (nunca `genre`, `status`, `destination`). Test vitest.
2. **Layout:** la distribución va **arriba** de la tabla (debajo de los filtros), en una sola línea: barra delgada + los 6 géneros
   principales con conteo + "+N" con Tooltip del resto; "Por revisar" con su nombre traducido. Leyenda solo con canónicos + Por revisar.
   La tabla ocupa el resto de la altura. Encabezados alineados con las celdas (mismo `flex`/anchos en `thead` que en las filas virtuales).
3. **Respaldo online (back)** en `src/tag-classifier.js`, tras el pase por tags, solo para filas `review` con motivo
   `missing-genre-tag` | `junk-genre-tag` | `unknown-genre-tag`:
   - Artista/título del tag (`common.artist`/`common.title`); si faltan, del nombre `Artista - Título`. Sin ambos → queda `review`.
   - Last.fm `getTrackTags` y luego `getArtistTags` (si hay `lastfmApiKey`); Spotify `searchTrack` → `getArtist().genres` (si hay claves).
     Reusar `src/lastfm.js`, `src/spotify.js` y `src/cache.js`; credenciales de `config/settings.json` (misma lectura que `src/cli.js`).
   - Cada tag/género candidato pasa por la **misma** tabla de alias (`normalizeGenre` + lookup); el primero que mapee a un canónico gana
     (orden: tags de pista Last.fm, géneros Spotify, tags de artista Last.fm). Nada mapea → sigue `review`, `reason` igual.
   - Si mapea: `genre`, `status:'ok'`, `genreSource:'lastfm'|'spotify'`, `onlineTag` (el valor crudo que mapeó), `destination`.
     Filas del tag: `genreSource:'tag'`.
   - Concurrencia 4, timeout 8 s por llamada, error/timeout = sin resultado (no aborta). Sin claves → se omite sin error.
     Flag CLI `--no-online` y body `online:false` en `/api/classify-by-tags` para desactivarlo (tests lo usan; por defecto activo).
   - Progreso: segunda fase `[PROGRESS:X/Y] Processing: online · nombre`.
   - Nunca escribe tags ni mueve nada.
4. **UI:** estado "Sugerido online (Last.fm/Spotify)" distinto de "Propuesto" (chip + filtro con conteo); se incluye en "Mover" y en el
   conteo del diálogo por separado ("N desde tags · M online"). Inspector muestra `onlineTag` y la fuente.
5. Tests node con clientes simulados (inyectables): junk → Last.fm mapea → ok/lastfm; sin mapeo → review; sin claves → review sin
   llamadas; timeout → review. Vitest de 1, 2 (leyenda solo canónicos) y 4.
**Gate:** node + build + lint 0 errores + vitest; el cerebro re-corre el análisis (solo lectura) sobre `MUSIC BACKUP/Music` y compara conteos.

## Fuera de alcance

P1/P2 del clasificador (motor, manifiesto, deshacer) · contrato seguro de escritura de tags por formato (F3 de `plan.md`)
· corte `ui/` → `web/dist` (F9).

### Back 1c.1 · Licencias dentro del paquete (revisión del cerebro)
`package.json` `build.mac.extraResources` hoy copia solo `keyfinder-cli`; la GPL exige que la licencia viaje con el binario.
Copiar también `vendor/keyfinder/licenses/*` a `keyfinder/licenses/`, y añadir `LICENSE` y `THIRD_PARTY_NOTICES.md` a `build.files`
(todas las plataformas). Solo `package.json`. **Gate:** `node -e` que lea el JSON y muestre ambas entradas; node tests sin regresión.

### Back 3 · Puntajes de Sets calibrados (2026-09-24)
Problema: `src/style_analyzer.py` da 93–100 % a casi todo: coseno sobre features crudas (tempo ~125 y centroide ~2000 dominan
el vector; todo apunta en la misma dirección). E0 ya mostró que el audio separa géneros de forma débil → el objetivo es que el
puntaje **discrimine y signifique algo**, no una precisión alta.
1. **Estandarizar:** con todos los vectores de referencia (todas las secciones juntas en modo multi; la referencia en modo simple)
   calcular media y desviación por feature (`sd < 1e-9` → 1). Todo vector (referencias e input) se transforma a z-score.
2. **Puntaje por percentil:** centroide de cada sección = media de sus z-vectores. `d` = distancia euclídea del input al centroide.
   Puntaje = % de referencias de esa sección cuya distancia a su propio centroide es **≥ d** (0–100, un decimal): "más cerca que el
   X % de tus propias pistas". Si la sección tiene < 5 referencias, usar como distribución las distancias de todas las referencias
   a sus propios centroides. `best` = sección con mayor puntaje (empate → menor `d`). Modo simple: una sola sección, mismo cálculo.
   El coseno desaparece de los puntajes; contrato JSON de salida igual (mismas claves, 0–100).
3. **Refactor mínimo:** funciones puras `fit_scaler(vectors)`, `score_sections(input_vec, ref_vectors_by_section)` reutilizadas por
   ambos modos. Features, `extract_features`, progreso y `resolve_key` sin cambios. No tocar `web/` ni `server.js`.
4. **Tests** `tests/test_style_scoring.py` (unittest, vectores sintéticos, sin audio): una feature con escala 1000× no domina;
   input idéntico al centroide → 100; input lejano → 0; tres secciones separadas → `best` correcto; < 5 referencias usa distribución
   combinada; `sd = 0` no divide por cero.
5. **Medición** `scripts/eval_sets.py` (solo lectura, caché de vectores en `.cache/eval/sets/`, reutiliza `extract_features` con
   `--analysis-seconds 30`): secciones = carpetas de `MUSIC BACKUP/2026` `deep house`, `Tech house` (muestra fija de 20, seed 42),
   `minimal : deep tech`; por sección 60 % referencia / 40 % prueba (seed 42), 5 particiones. Reportar para **coseno viejo vs nuevo**:
   acierto de `best`, puntaje medio en la sección correcta vs en las otras, desviación estándar de los puntajes, % de puntajes ≥ 90.
   Salida `.cache/eval/sets-report.md`.
**Gate (cerebro):** tests nuevos + `test_basic` en verde con el venv; en el reporte, % ≥ 90 cae claramente y la desviación sube frente
al coseno viejo, con acierto de `best` ≥ al viejo; corrida real de `/api/set-analyze` (servidor en 3099, copias) devuelve puntajes
repartidos.

### Back 4.5 · Deezer con varios artistas + no perder créditos (2026-09-24)
Probado en vivo: `artist:"&ME" track:"The Rapture Pt.III"` → 0 resultados; texto libre `&ME The Rapture Pt.III` → correcto; texto
libre con los tres artistas juntos → falla. Además `identify` cambia "Chocolate Spread, Oscar P" por "Chocolate Spread": Deezer da
solo el artista principal y pisa el crédito completo.
1. `src/providers/http.js`: `splitArtists(text)` separa por `,`, ` & ` (con espacios; "&ME" no se parte), ` feat. `, ` ft. `, ` x `,
   ` vs `, ` y `, sin distinguir mayúsculas; recorta y quita vacíos.
2. `src/providers/deezer.js` `search(artist, title)`: título limpio con `cleanTrackTitle`. Intentos en orden hasta el primero válido:
   búsqueda avanzada con el crédito completo; por cada artista de `splitArtists` (máx. 4): texto libre `"<artista> <título>"`;
   por último texto libre solo con el título. Revisar hasta 5 resultados por intento. **Válido** = el artista del resultado coincide
   (normalizado, igualdad o contención) con alguno de los artistas pedidos **y** el título normalizado del resultado sin paréntesis /
   corchetes es igual al pedido sin paréntesis / corchetes ("The Rapture Pt.II" ≠ "The Rapture Pt.III"). Clave de caché nueva
   (`deezer:v2:…`). Máximo de llamadas por `search`: 6.
3. `src/metadata_editor.js:276`: si el crédito actual (tag o nombre de archivo) tiene más artistas que el de Deezer y el de Deezer
   es uno de ellos, conservar el crédito actual. Igual para el título: si el actual contiene el de Deezer más un paréntesis de mezcla
   o remix, conservar el actual.
4. Tests en `tests/providers.test.js` y `tests/metadata-editor.test.js` con `fetcher` falso: varios artistas encuentra por el 2.º
   intento; Pt.II no se acepta por Pt.III; "&ME" no se parte; crédito "Chocolate Spread, Oscar P" se conserva; artista sin relación
   → null.
No tocar `web/`. **Gate (cerebro):** node tests en verde; en vivo (red real) `search("&ME, Black Coffee, Keinemusik", "The Rapture
Pt.III (Original Mix)")` → `&ME | The Rapture Pt.III`, y `search("Black Coffee, Jimi Jules", "Trippy Yeah (Original Mix)")` no
devuelve otra canción.

### Back 4.5.1 · Remix explícito + sin duplicar (revisión del cerebro)
1. `src/providers/deezer.js`: si el título pedido tiene un paréntesis/corchete con `remix`, `edit`, `dub`, `rework`, `bootleg` o un
   `mix` que no sea `original`/`extended`, el candidato solo es válido si ese texto (normalizado) aparece también en su título.
   Test: pedir "Losing It (Chris Lake Remix)" no acepta "Losing It"; sí acepta "Losing It (Chris Lake Remix)".
2. `src/metadata_editor.js`: usar `splitArtists` y `normalizeArtistName` de `src/providers/http.js` en vez de repetir la regex y
   la normalización. Sin cambio de comportamiento. **Gate:** node tests en verde.

### C2 · Convertidor: lista inmediata + formato por fila (2026-09-25)
Pedido de Carlos: al soltar archivos/carpeta no ve qué canciones va a convertir (la vista sigue en `EmptyState`,
`web/src/views/Converter.tsx:465`; la lista solo aparece al correr o con resultados). Quiere elegir formato por canción.
Decisiones: mismo formato → se omite; carpeta → recursiva y la salida **mantiene la estructura** relativa a la carpeta soltada;
archivos sueltos → salida plana.
1. **Modelo** en `Converter.tsx`: `files: string[]` → `items: {path, root: string|null, format: ConversionFormat|null}`
   (`format null` = sigue el general; `root` = carpeta soltada o `null` si fue archivo suelto). `expandPaths` (`:720`) usa
   `recursive=true` y conserva `root`. Deduplicar por `path`.
2. **Una sola tabla** desde que hay ≥1 ítem (antes de convertir): `EmptyState` solo con lista vacía; con lista, soltar encima sigue
   agregando (`DropOverlay`). Columnas: #, título/artista (del tag, carga perezosa con la función existente; mientras tanto nombre de
   archivo), origen (extensión en chip), **salida** (Select por fila: "General (WAV)" + MP3/WAV/AIFF/FLAC; si difiere del general,
   borde/texto `brand`), estado (pendiente · convirtiendo · listo con tamaño · error · "ya es WAV — se omite"). La fila en curso
   marcada. `RunningState` desaparece (la misma tabla muestra el progreso). Resultados se integran a la fila por `input`.
3. **Formato efectivo** = `item.format ?? format general`. Si coincide con la extensión de origen (aif/aiff = aiff) → estado
   "se omite", no se envía. Cambiar el general actualiza las filas con `format null`.
4. **Selección múltiple** (`web/src/lib/selection.ts`, ya usada): Inspector con ≥2 seleccionadas muestra un Select "Formato de
   salida" que aplica a todas (incluye "General"). Con 1 seleccionada, el Inspector muestra también su Select.
5. **Envío:** `/api/convert` por ítem con `{inputPath, outputPath, format: efectivo, bitrate (si mp3, el general), relativeTo: root}`.
   Botón "Convertir N" (N = pendientes no omitidos).
6. **Back:** `src/server.js:317` acepta `relativeTo` opcional (string absoluta) y lo pasa como `--relative-to`.
   `src/convert_audio.py`: con `--relative-to` y entrada archivo dentro de esa carpeta → salida `output/<ruta relativa>` con la nueva
   extensión (crea subcarpetas); si no está dentro → plano. Sin `--relative-to` → igual que hoy. Nunca escribir fuera de `output`.
7. i18n es/en para textos nuevos. Tests vitest: formato efectivo, omisión por mismo formato (aif≡aiff), cambio del general respeta
   overrides, aplicar formato a selección; test Python/node de `--relative-to` (estructura preservada; fuera de la raíz → plano;
   `..` no escapa de `output`).
No tocar otras vistas. **Gate (cerebro):** vitest, build, lint 0 errores, `format:check`, node tests; QA en vivo (servidor 3099,
copias en scratchpad): soltar carpeta con subcarpetas → lista visible antes de convertir; 1 fila en AIFF y resto WAV → archivos
correctos en la estructura; un WAV omitido.

### C2.1 · Soltar carpeta (revisión del cerebro)
`Converter.tsx` `onDrop` (~:303): con una carpeta soltada, `resolveDroppedFiles` devuelve la ruta de la carpeta y hoy se agrega
como ítem sin expandir (root = su padre). Además `commonParent` (~:918) no termina con 1 ruta (al pasar el final compara
`undefined === undefined` y sigue). Corrección: `onDrop` usa siempre `expandPaths(next)` (carpeta → sus archivos recursivos con
`root` = esa carpeta; archivo → `root null`), igual que `chooseDirectory`; borrar `commonParent` y la detección `webkitGetAsEntry`.
Extraer a `converter-model.ts` una función pura `itemsFromPaths(paths, listDir)` (listDir inyectable) usada por drop, archivos y
carpeta. Tests: carpeta → archivos con root = carpeta; archivo suelto → root null; mezcla carpeta + archivo; carpeta vacía → nada.
**Gate:** vitest/build/lint/format:check.

### C2.2 · Archivo suelto con raíz = sí mismo (revisión del cerebro, verificado en vivo)
`/api/metadata/list?dir=<archivo>` devuelve `files:[<archivo>]` → `itemsFromPaths` le pone `root = <archivo>`. Con
`--relative-to <archivo>`, `convert_audio.py` calcula `rel = "."` y escribe **`<output>.aiff` fuera de la carpeta de salida**
(reproducido: `c2/out.aiff`).
1. `converter-model.ts` `itemsFromPaths`: si `listDir` devuelve exactamente `[path]` (la misma ruta), es archivo → `root null`.
   Test.
2. `src/convert_audio.py` `output_path_for`: si `rel` es vacío o `.` (`rel.parts == ()`) → salida plana `output/<nombre>`.
   Además, antes de convertir, `out_path.resolve()` debe estar dentro de `output_dir.resolve()`; si no, resultado `ok:false` con
   error y **sin escribir**. Test Python/node: `--relative-to` = el propio archivo → `output/<nombre>.<fmt>` y nada fuera de `output`.
**Gate:** vitest/build/lint/format:check, node tests, reproducción de arriba escribe dentro de `output`.

### C2.3 · Pulido visual del convertidor (QA del cerebro, captura en vivo)
Solo `web/src/views/Converter.tsx` e i18n.
1. Select de salida (fila e Inspector) trunca "General (WAV)" → ancho suficiente (`min-w` o texto corto "Gral · WAV") sin cortar.
2. Tamaño antes de convertir y en omitidos muestra "0.0 KB → —" → mostrar "—" hasta tener `sizeIn` real del resultado.
3. Estado por fila dice "pendientes" (clave plural del encabezado) → nueva clave singular "pendiente"/"pending".
4. Barra superior dice "4 seleccionados" sin ninguna fila marcada → mostrar la cantidad real seleccionada; sin selección, ocultar.
5. Omitido: texto corto en una línea "ya es WAV · se omite" (con el formato real), sin salto.
Tests vitest para 2 y 5 (funciones puras). **Gate:** vitest/build/lint/format:check + captura en vivo.
**C2.3.1:** el punto 2 no se ve en vivo: en `ResultsTable` `results` son las filas (incluyen pendientes), así que
`results.some(...)` (~`Converter.tsx:797`) siempre es verdadero. Corregir en origen: la fila sintética (~`:389`) lleva
`sizeIn: null` (tipo `number | null`), la celda usa `formatBytes(result.sizeIn)` y se elimina `conversionInputSize` y su test
(reemplazar por test de la fila sintética con `sizeIn null`). Gate: vitest/build/lint/format:check.

### E4 · Playlists del set (`.m3u8`) desde `Clasificado/` (2026-09-25)
Etapa 2 del Lote 6: tres playlists a partir de las carpetas por género que dejó E3; **no mueve ni copia audio**.
Por defecto: Warmup = Deep House + Afro House · Peak = Tech House · Closing = Indie Dance + House. Minimal y el resto, fuera.
1. **Back** `src/set-playlists.js` (puro, testeable) + `POST /api/set-playlists` (JSON, no SSE):
   - `{ root, sections: {warmup:[géneros], peak:[…], closing:[…]}, dryRun }`. `root` absoluta y existente; géneros = nombres de
     subcarpetas directas de `root` (rechazar `..`, separadores o carpetas inexistentes → 400).
   - Por sección: archivos de audio recursivos de esas carpetas (vía `services/audio-discovery.js`), leer con `music-metadata`
     (`duration`, `artist`, `title`, `bpm`) — sin analizar audio. Orden: BPM ascendente (sin BPM al final), luego artista.
   - `dryRun:true` → `{ok, sections:{warmup:{count, bpmMin, bpmMax, durationSec, tracks:[{path,artist,title,bpm}]}, …}}`.
   - `dryRun:false` → escribe `root/Warmup.m3u8`, `Peak.m3u8`, `Closing.m3u8` (solo secciones con ≥1 pista), UTF-8 sin BOM:
     `#EXTM3U`, por pista `#EXTINF:<seg>,<Artista> - <Título>` + **ruta relativa a `root`** con `/`. Escritura atómica (tmp + rename);
     si ya existe se reemplaza (la UI avisa antes). Devuelve rutas escritas. Nunca escribe fuera de `root` ni en `MUSIC BACKUP/2026`
     (rechazar `root` que sea o esté dentro de una carpeta llamada `2026` bajo `MUSIC BACKUP` — misma regla que E3).
2. **UI** en la vista Clasificador, junto a los manifiestos: botón "Playlists del set" → panel/diálogo con la carpeta raíz
   (por defecto el `destRoot` actual), tres filas Warmup/Peak/Closing con los géneros disponibles (subcarpetas de `root`) como
   chips seleccionables (defaults de arriba si existen), vista previa con `dryRun` (N pistas · BPM min–max · duración total por
   sección), botón "Crear playlists" (aviso si ya existen) y, al terminar, "Mostrar en Finder". i18n es/en. Tokens `brand`.
3. **Tests** node: orden por BPM, sin BPM al final, rutas relativas con `/`, EXTINF correcto, secciones vacías no se escriben,
   400 por género inexistente/`..`, escritura atómica no deja `.tmp`, dryRun no escribe nada. vitest de la función de defaults.
No tocar otras vistas. **Gate (cerebro):** node/vitest/build/lint/format:check; en vivo (3099) sobre una copia con subcarpetas de
género en el scratchpad: vista previa correcta, `.m3u8` escritos que abren en un reproductor (ffprobe de cada ruta relativa resuelve).

### E4.1 · Pistas ilegibles y BPM a mitad/doble (QA del cerebro en vivo)
Vista previa real sobre `MUSIC BACKUP` (solo lectura): 884 pistas, 35 s, BPM de tag entre 72 y 201. Escritura en copia: un archivo
corrupto entró como `#EXTINF:-1,Desconocido - roto` (ffprobe no lo abre).
1. `src/set-playlists.js`: si `readMetadata` lanza o no hay `format.duration` finita > 0 → la pista **no entra**; se devuelve en
   `skipped:[{path, reason}]` por sección (y `skippedCount`). Nunca falla la petición por un archivo.
2. BPM para ordenar: `bpmSort` = BPM del tag llevado a [85, 175) duplicando o dividiendo por 2 (79 → 158? no: 79×2 = 158 ✓; 201/2 = 100.5 ✓).
   Orden y `bpmMin`/`bpmMax` usan `bpmSort`; `tracks[].bpm` conserva el del tag y se añade `bpmSort`.
3. UI: en la vista previa mostrar "N omitidas (ilegibles)" por sección si > 0.
Tests: archivo ilegible omitido y listado; 79→158, 201→100.5, 128→128 y orden resultante. **Gate:** node/vitest/build/lint/format.

## Punto final — App autosuficiente en Mac (2026-09-25)
Decisiones de Carlos: sin firma de Apple (pasos de "Abrir igualmente" en README y en la página de la release); **dos `.dmg`**
(arm64 y x64), publicados como GitHub Release (nunca en git); solo Mac (Windows después, en otra sesión). macOS mínimo 12.
Python 3.11 (último con PyTorch 2.2.2 para Intel, necesario para demucs en x64).

### P1 · Binarios incluidos y PATH propio
1. `scripts/fetch-binaries.sh <arm64|x64>` (idempotente, caché en `.cache/build/bin/`, sha256 fijados en el script): descarga
   ffmpeg + ffprobe **estáticos** para esa arquitectura (fuente con builds estáticos macOS arm64 y x64 y versión fijada; documentar la
   URL y la licencia GPL en `THIRD_PARTY_NOTICES.md`) y `fpcalc` (Chromaprint 1.5.1, release oficial macOS). Deja en
   `vendor/bin/darwin-<arch>/` `ffmpeg`, `ffprobe`, `fpcalc` (+ `keyfinder-cli` copiado de `vendor/keyfinder/darwin/`). Verificar con
   `file`/`lipo -archs` que cada binario es de la arquitectura pedida y `otool -L` solo `/usr/lib` y `/System`. **Estos binarios NO se
   commitean** (`.gitignore`): se generan antes de empaquetar. Licencias en `vendor/bin/licenses/`.
2. `electron/main.cjs` (env del backend, ~:143): si `app.isPackaged`, `PATH = <resources>/bin + ':' + PATH + ':/opt/homebrew/bin:/usr/local/bin'`;
   en desarrollo, `PATH + ':/opt/homebrew/bin:/usr/local/bin'` (la app abierta desde Finder no hereda el PATH de la terminal). Así
   Node, Python y todos los hijos encuentran los binarios sin cambiar las llamadas existentes. Los chequeos de ffmpeg/fpcalc que hace
   `main.cjs` en su propio proceso (~:25, ~:256, ~:422) usan el mismo PATH ampliado.
3. `package.json` build: `mac.extraResources` copia `vendor/bin/darwin-${arch}` a `bin` (electron-builder `${arch}` = arm64/x64) y
   `vendor/bin/licenses` a `bin/licenses`. `MUSICKIND_KEYFINDER` pasa a `<resources>/bin/keyfinder-cli`.
4. Tests node: función pura que construye el PATH (empaquetado/desarrollo, sin duplicados).
**Gate (cerebro):** `fetch-binaries.sh arm64` y `x64` → arquitecturas correctas (`lipo -archs`), dependencias solo del sistema,
`ffmpeg -version` corre (x64 bajo Rosetta); node tests; con `env -i HOME=$HOME PATH=/usr/bin:/bin` + el PATH construido, el servidor
responde `ffmpeg-status` ok y convierte un archivo.

### P2 · Python propio con librosa/numpy (esbozo; spec detallada tras P1)
python-build-standalone 3.11 por arquitectura + librosa/numpy/scipy/soundfile preinstalados (wheels de la arquitectura destino) en
`Resources/python`; `resolvePython` lo prefiere (`MUSICKIND_PYTHON`); demucs se instala desde Configuración en `userData` (x64: torch
2.2.2). Sin Python del sistema ni Xcode CLT.

### P3 · Empaquetado y release (esbozo)
`asarUnpack` de `src/**/*.py` y binarios; `npm run dist:mac` genera `MusicKind-<ver>-arm64.dmg` y `-x64.dmg`; prueba de humo del .app
con PATH mínimo (BPM, tonalidad, convertir, identify); README con instalación y "Abrir igualmente"; release en GitHub **tras OK de Carlos**.

### E2.4 · La lista del clasificador sobrevive al cambio de pestaña (pedido de Carlos, 2026-09-25)
`Classifier.tsx` (vista por etiquetas, ~:548-560) guarda todo en `useState` local → al cambiar de pestaña se desmonta y se pierde.
Guardar en `useProcess().setResult('classifier-tags', snapshot)` y restaurar al montar (mismo patrón que las demás vistas):
`inputRoot`, `destRoot`, `results`, `selectedPath`, `selectedPaths`, `statusFilter`, `genreFilter`. Solo en memoria (se pierde
al cerrar la app); se borra únicamente con la acción existente de limpiar o al lanzar un análisis nuevo. Si hay un análisis
**en curso** al cambiar de pestaña, al volver se ve el progreso/resultado (el proceso ya vive en `ProcessProvider`; comprobar).
Tests vitest: desmontar y volver a montar conserva resultados, filtros y selección; limpiar los borra. No tocar otras vistas.
**Gate:** vitest/build/lint/format:check + QA en vivo: analizar → ir a otra pestaña → volver → lista intacta.

## Géneros para cualquier música (2026-09-25, decisión de Carlos)
El usuario no tiene que saber de géneros: la app trae un catálogo de fábrica (taxonomía de Discogs: familias + estilos) y
Configuración solo **muestra** lo detectado (G2). Analizar nunca mueve; mover sigue siendo un botón explícito.

### G1 · Catálogo + familia + analizar sin destino + archivos sueltos
1. **`config/genre-catalog.json`** (nuevo, versionado): `{ "source": "<URL Discogs>", "families": { "Electronic": [estilos…],
   "Latin": […], "Rock": […], "Pop": […], "Hip Hop": […], "Jazz": […], "Funk / Soul": […], "Reggae": […], "Blues": […],
   "Classical": […], "Folk, World, & Country": […], "Stage & Screen": […], "Brass & Military": […], "Children's": […],
   "Non-Music": […] } }` con la lista oficial de estilos de Discogs (citar fuente; no inventar estilos). Añadir alias
   latinos comunes que Beatport/tiendas usan y Discogs escribe distinto (p. ej. "Reggaeton"→"Reggaeton", "Latin Pop"→familia
   Latin/estilo "Latin Pop" si existe, "Bachata", "Merengue", "Cumbia", "Salsa") solo si el estilo existe en el catálogo.
   i18n es/en de los nombres de familia (Latin → "Latina", etc.); los estilos se muestran tal cual.
2. **Resolución** (`src/tag-classifier.js`), función pura `resolveGenre(value, {aliasTable, catalog})` →
   `{genre|null, family|null}`, en orden: (a) `config/genre-aliases.json` (los 13 electrónicos de Carlos, mandan; familia
   Electronic), (b) estilo del catálogo (normalizado con `normalizeGenre`) → genre = estilo, family = su familia (si un estilo
   está en varias familias, la primera en el orden del JSON), (c) nombre de familia → genre null, family = esa familia.
   Tags genéricos (`GENERIC_ONLINE_TAGS`: electronic, dance, pop, edm…) **solo pueden fijar familia**, nunca género.
3. **Filas**: se añade `family`. Nuevo estado `family` ("Solo familia") cuando hay familia pero no género: destino
   `<destRoot>/<Familia>/` (en español según idioma? **no**: carpeta con el nombre de catálogo en inglés, estable). `review`
   solo si no hay ni género ni familia. Online (Discogs) usa también `genres` de la búsqueda para la familia
   (`discogsClient.getGenres` o el mismo resultado); Last.fm igual con el filtro de basura existente.
4. **Destino opcional**: `/api/classify-by-tags` acepta sin `destRoot` → `destination: null` en todas las filas.
   **Entradas**: acepta `inputPaths: [absolutas]` (archivos y/o carpetas; carpetas recursivas) además de `inputRoot`
   (compatibilidad). UI: analizar sin destino; "Mover propuestas" deshabilitado con tooltip "Elige un destino para mover";
   soltar/elegir uno o varios archivos o carpetas; Inspector muestra "Género · Familia · fuente (tag/Discogs/Last.fm)".
   Filtro de estado incluye "Solo familia"; distribución arriba agrupa por familia→género.
5. **Tests**: resolveGenre (alias manda, estilo latino, familia sola, genérico solo familia, basura → review), fila `family`,
   sin destRoot → destinos null y 200, `inputPaths` con archivo suelto y carpeta, UI mover deshabilitado sin destino.
No tocar Sets, Convertidor ni otras vistas; playlists E4 siguen igual. **Gate (cerebro):** node/vitest/build/lint/format:check;
en vivo con archivos del disco (solo lectura) y copias con tags de género `Salsa`, `Rock`, `Pop`, `Reggaeton` y sin tag.

### G2 · Configuración → Géneros (esbozo, tras G1)
Colección aprendida (géneros detectados + nº de pistas, agrupados por familia, guardada en `userData`); unir y renombrar
(afecta a análisis futuros vía alias del usuario, que tienen prioridad). Solo lectura por defecto.

### G1.1 · Catálogo que aprende (revisión del cerebro)
Medido: de 92 estilos reales devueltos por Discogs (caché de la API), 17 no están en `genre-catalog.json` (18%): Tropical House,
Indie Pop, Pop Rock, Dance-pop, Power Pop, Prog Rock, Goth Rock, Neo Trance, Progressive Breaks, Synthpunk, Anarcho-Punk,
Horror Rock, Jangle Pop, No Wave, Psychobilly, Sound Collage, Speech. Las familias (11 vistas) sí están todas. La página de
estilos de Discogs responde 403: no hay lista oficial descargable. Diseño:
1. Añadir esos 17 al catálogo en su familia correcta (Tropical House/Neo Trance/Progressive Breaks → Electronic;
   Indie Pop/Dance-pop/Power Pop/Jangle Pop → Pop; Pop Rock/Prog Rock/Goth Rock/Horror Rock/Synthpunk/Anarcho-Punk/No Wave/
   Psychobilly → Rock; Sound Collage → Electronic; Speech → Non-Music).
2. **Online Discogs**: un estilo devuelto que no esté en el catálogo se **acepta** igual (genre = estilo tal cual, family =
   primer `genres` del mismo resultado que sea familia del catálogo) y se guarda en `<dataDir>/genre-catalog-learned.json`
   (`{family: [estilos]}`, escritura atómica, sin duplicados normalizados). `resolveGenre` consulta catálogo de fábrica + aprendido
   (el de fábrica manda). Así un tag de archivo "Tropical House" se resuelve en análisis futuros.
   Last.fm **no** aprende (tags ruidosos): solo resuelve contra catálogo + aprendido.
3. `GET /api/genre-catalog` → `{families: {familia: {factory:[…], learned:[…]}}}` (base para G2).
Tests: estilo desconocido de Discogs se acepta con su familia y queda aprendido; Last.fm desconocido no aprende; aprendido resuelve
un tag de archivo; escritura atómica. **Gate:** node/vitest/build/lint/format; re-medición sobre la caché: 0 estilos sin resolver.

### G1.2 · Pulido visual del clasificador (captura del cerebro)
Solo `web/src/views/Classifier.tsx` + i18n.
1. "Analizar sin destino" hoy es texto suelto que parece etiqueta: convertirlo en acción clara junto al campo Destino
   ("Quitar destino" como botón ghost con icono X dentro del FolderField, visible solo si hay destino). Sin destino, el campo
   muestra "Sin destino — solo analizar" en gris.
2. "1 elementos seleccionados" aparece sin selección y con mal plural: mostrar solo cuando se agregaron archivos sueltos,
   como "N archivos agregados" (singular/plural correcto, es/en).
3. Leyenda de distribución: el contador va en la misma línea que la etiqueta ("Latina → Salsa · 1"), sin salto.
**Gate:** vitest/build/lint/format:check + captura.
**G1.2.1:** el punto 3 sigue fallando con 7 elementos: cada elemento de la leyenda debe ser `whitespace-nowrap` y el contenedor
`flex-wrap` (varias filas de elementos completos), nunca partir "etiqueta · N". Gate: captura.

## Creador de sets (orden en `plan.md` § "Orden único")

### S1 · Afinidad honesta y "por revisar"
Hoy: `src/style_analyzer.py` `score_sections` siempre elige `best` aunque todo sea 0 o haya empate; `web/src/views/Sets.tsx:54`
`energyPath` dibuja la **afinidad** bajo la etiqueta "Curva de energía" (`sets.energy`); los puntajes se muestran como `72%`
(`:486`, `:562`), que se lee como probabilidad; `groupSetResults` (`:39`) solo agrupa las 3 secciones → filas con `best:null` o
`error` desaparecen de la lista.
1. **Back** `score_sections` → además de `scores` y `best`, devuelve `review: null | "all-zero" | "tie"` (`best = None` en ambos
   casos; empate = los dos mayores puntajes idénticos) y `refCounts: {sección: n}`. JSON por pista añade `review` y `refCounts`
   (modo multi) sin quitar claves existentes. Sin umbrales nuevos inventados. Tests en `tests/test_style_scoring.py`.
2. **UI Sets**: grupo adicional **"Por revisar"** al final (pistas con `best:null`, `review` o `error`), con el motivo en la fila
   (`Sin parecido con ninguna sección` / `Empate entre secciones` / mensaje de error). Ninguna fila desaparece.
3. **Lenguaje**: "Puntaje" → **"Afinidad"**; valores sin `%` (`72`), medidor igual. Inspector por sección: "Afinidad 72 · más
   cercana que el 72 % de tus N pistas de Warmup" (N = `refCounts`); si N < 5, nota "pocas referencias". Explicación de la escala
   una sola vez en el Inspector, breve.
4. **Quitar la curva de "energía"** (`energyPath`, el SVG y `sets.energy`) hasta que exista energía real (E1). No reemplazarla por
   otra curva de afinidad.
5. i18n es/en. Tests vitest: agrupación con por revisar/errores, sin `%`, Inspector con N, ya no existe la curva.
No tocar motor de secuencia (S3) ni otras vistas. **Gate (cerebro):** Python (venv) + vitest/build/lint/format; en vivo
`/api/set-analyze` con referencias reales (copias) incluyendo una pista sin parecido y un caso de empate forzado; captura.

### S1.1 · BPM analizado pisado por metadata (QA del cerebro)
`web/src/views/Sets.tsx:196-198` hace `{ ...track, ...metadata }` con la respuesta de `/api/metadata`, que desde Back 2 trae
`bpm`/`key` (null si el tag no los tiene) → el BPM analizado se pierde y toda la columna/encabezado muestran "—" (reproducido:
API devuelve 129.2, UI "—"). Mezclar **solo** `title` y `artist` (y solo si no son vacíos). Test vitest: metadata con `bpm:null`
no borra el BPM analizado. Además, el motivo de "Por revisar" (celda de sección) va en una línea (`whitespace-nowrap`, texto
truncado con `title` completo). **Gate:** vitest/build/lint/format + captura con BPM visibles.

### S3a · Medir motores de BPM (solo medición, antes del secuenciador)
Hallazgo S1: `librosa.beat.beat_track` (hop 512) da tempos cuantizados (129.2, 123, 117.5…); 3 analizadores lo usan
(`src/bpm_analyzer.py:25`, `src/style_analyzer.py:37`, `src/audio_features.py:8`). Un secuenciador por BPM no sirve así.
1. `scripts/eval_bpm.py` (venv de la app; mismo estilo/caché que `scripts/eval_key.py`): verdad = BPM del tag (TBPM/`bpm`) de
   `MUSIC BACKUP/2026` (solo lectura, recursivo); descartar tags ≤ 0 o no numéricos. `--limit`, `--input`.
2. Motores, sobre ventana centrada de 60 s **y** pista entera:
   - `librosa-beat` actual (línea base, sr 22050, hop 512).
   - `librosa-fine`: `librosa.feature.tempo` / tempograma con hop 128 y **interpolación parabólica** del pico (resolución < 0.5 BPM).
   - `essentia`: `RhythmExtractor2013(method="multifeature")` y `PercivalBpmEstimator` (essentia ya está en el venv).
   - Opcional si instala sin fricción en el venv: `deeprhythm` o `tempocnn`; si falla, reportar el error y seguir.
3. Métricas: exacto ±0.5, ±1 y ±2 BPM; **error de octava** (½×, 2×, ⅔×, 3⁄2×) contado aparte; error medio absoluto tras corregir
   octava; % de pistas en el valor más repetido (detector de cuantización); tiempo medio por pista.
4. Salida `.cache/eval/bpm-report.md` + `.json`; caché por pista en `.cache/eval/bpm/`. No toca `src/`, `web/` ni escribe en
   `/Volumes`.
**Gate (cerebro):** reporte con todos los motores (o su error), segunda corrida idéntica desde caché. Decisión posterior (S3b):
motor ganador + regla "tag primero" en los 3 analizadores.

### D2 · Soltar/elegir uniforme en BPM y Metadatos (pedido de Carlos, 2026-09-25)
Reproducido con arrastre simulado (2 archivos y luego una carpeta con subcarpetas, 3 audios):
Convertidor 2 → 5 filas ✓ · **Metadatos 1 → 2** (`Metadata.tsx:281` usa solo `paths[0]`, `recursive=false` y `loadFiles`
**reemplaza** la lista) · **BPM 0 → 0 filas** (agrega "3 pistas · 3 pendientes" pero no las muestra hasta analizar; `expandPaths`
`Bpm.tsx:537` con `recursive=false` y `folder` = primera carpeta como etiqueta única).
Referencia de comportamiento: Convertidor (C2/C2.1).
1. Mover `itemsFromPaths` de `web/src/views/converter-model.ts` a `web/src/lib/drop.ts` (genérico: rutas → `{path, root}`;
   carpeta → sus audios **recursivos** con `root` = carpeta; archivo → `root null`; lista `[path]` = archivo). Converter lo importa
   de ahí sin cambio de comportamiento. Una función `mergeUnique` para sumar sin duplicar.
2. **BPM** (`Bpm.tsx`): soltar/elegir archivos (varios) o carpetas **suma** a la lista; la tabla muestra las pistas pendientes
   **antes** de analizar (nombre, título/artista del tag si lo hay, estado "pendiente"); resultados se integran por ruta; quitar la
   etiqueta única de carpeta; botón "Analizar N" (N pendientes). Soltar encima de la lista sigue agregando (overlay).
3. **Metadatos** (`Metadata.tsx`): soltar varios archivos y/o carpetas (recursivo) **suma** a la lista sin reemplazar ni perder
   ediciones no guardadas de filas existentes; deduplicar por ruta.
4. Sets (una carpeta por sección) y Stems (un archivo) no cambian: su entrada es única por diseño.
5. Tests vitest: `itemsFromPaths` (movido), BPM muestra pendientes antes de analizar, BPM/Metadatos suman varios y carpeta
   recursiva, Metadatos no pierde ediciones. i18n es/en.
**Gate (cerebro):** vitest/build/lint/format + arrastre simulado: BPM y Metadatos 2 → 5 filas como el Convertidor; captura.

### S3b · BPM confiable: tag → essentia Percival (pista entera) → librosa (2026-09-25)
Base: S3a (`.cache/eval/bpm-report.md`): Percival pista entera 98,5 % ±0.5 (2,4 s/pista) vs librosa `beat_track` 10,3 %
(70 % de pistas en 129.2). Hoy los 3 analizadores usan `beat_track`: `src/bpm_analyzer.py:25`, `src/style_analyzer.py:37`,
`src/audio_features.py:8`.
1. Nuevo `src/bpm_detection.py` (mismo estilo que `src/key_detection.py:189-228`):
   - `parse_bpm(value)` → float redondeado a 0.1 si es numérico, finito y 20 ≤ bpm ≤ 300; si no, `None`.
   - `read_tag_bpm(path)`: `ffprobe -show_entries format_tags:stream_tags -of json`, claves sin distinguir mayúsculas
     `tbpm`, `bpm`, `tmpo`; primer valor que pase `parse_bpm`; `timeout=10`; cualquier fallo → `None`.
   - `detect_bpm_essentia(path)`: decodificar con `ffmpeg` la **pista entera** a mono 44100 Hz `f32le` por pipe (como
     `scripts/eval_bpm.py:56-67`, sin resample de librosa) → `essentia.standard.PercivalBpmEstimator(sampleRate=44100)`.
     `import essentia.standard` perezoso dentro de la función.
   - `detect_bpm_librosa(y, sr)`: el `beat_track` actual, `float(np.asarray(tempo).reshape(-1)[0])` (quita el warning de NumPy).
   - `resolve_bpm(path, y=None, sr=None)` → `{"bpm": float|None, "bpmSource": "tag"|"analysis"|None}`: tag → Percival →
     librosa (usa `y, sr` si vienen; si no, carga con librosa). Solo se usa librosa si Percival lanza excepción (essentia
     ausente, ffmpeg falla) o devuelve algo que `parse_bpm` rechaza. Todo falla → `bpm: None, bpmSource: None`.
   - Variable de entorno `MUSIC_KIND_BPM_ENGINE=librosa` fuerza saltar Percival (para tests y diagnóstico). Nada más.
2. `src/bpm_analyzer.py`: sustituir `librosa.load` + `beat_track` por `resolve_bpm(file_path)`; **no** cargar audio con
   librosa si hay tag o Percival funciona. Resultado añade `"bpmSource"`. `--analysis-seconds` se conserva en la CLI pero ya
   no limita el BPM (Percival siempre pista entera; decisión S3a); solo aplica al respaldo librosa.
3. `src/style_analyzer.py:27-50`: quitar `beat_track`; el tempo del vector (índice 51) y el `bpm` de salida salen de
   `resolve_bpm(file_path, y, sr)` (referencias incluidas, para que el z-score compare lo mismo). Si `bpm` es `None`, usar
   `0.0` en el vector y `null` en la salida. Salidas de ambos modos añaden `"bpmSource"`. `extract_features` conserva firma.
4. `src/audio_features.py:8`: `bpm` sale de `resolve_bpm(file_path, y, sr)` (`None` → mantener `float(tempo)` de librosa
   para no romper `run_classification.py:40`, que resta bpm).
5. `requirements.txt`: añadir `essentia` (versión que ya está en el venv: `2.1b6.dev*`; verificar el nombre del paquete
   pip con `pip show` en el venv). `THIRD_PARTY_NOTICES.md`: essentia — AGPL-3.0, Copyright © Universitat Pompeu Fabra
   (mismo formato que la línea de librosa).
6. Tests `tests/test_bpm_detection.py` (unittest, sin red, archivos en `tempfile`): `parse_bpm` ("128", "127.50", "0",
   "abc", "301", None); WAV sintético de clicks a 124 BPM (30 s) → Percival dentro de ±1; mismo WAV con tag `bpm=100`
   escrito por `ffmpeg -metadata` en FLAC → `resolve_bpm` da 100/`tag`; con `MUSIC_KIND_BPM_ENGINE=librosa` →
   `bpmSource == "analysis"` y bpm numérico; essentia simulada rota (`unittest.mock.patch` de `detect_bpm_essentia`
   lanzando) → cae a librosa.
**No tocar:** `web/`, `src/server.js`, `src/key_detection.py`, `scripts/`, `NEXT.md`, `plan.md`, specs. No commitear.
**Gate (cerebro):** unittest del venv (todas las suites), node, en vivo `/api/bpm/analyze` y `/api/set-analyze` (3099, copias
de `2026`, algunas con tag BPM borrado): tag → `bpmSource: tag` idéntico al tag; sin tag → Percival cerca del tag original
(±1 o mitad/doble); ya no hay valores repetidos 129.2 en masa. Re-medir `scripts/eval_sets.py` con caché nueva y comparar
con 44,7 % (reportar si baja).

## X1 — Exportar resultados de Sets a `.m3u8` (2026-09-25, pedido de Carlos)

Objetivo: los grupos que muestra la vista Sets se guardan como playlists `.m3u8` que abren VLC/Rekordbox/Serato sin MusicKind abierto. No reemplaza S5 (`plan.md:420`); es la versión mínima.

**Back** — módulo nuevo `src/set-export.js`, ruta `POST /api/set-export` en `src/server.js` junto a `/api/set-playlists` (`src/server.js:227`).
- Body: `{ outputDir, baseName, groups: { warmup?: Track[], peak?: Track[], closing?: Track[], review?: Track[] }, overwrite?: boolean }`, `Track = { path, artist?, title?, duration? }`.
- Escribe un archivo por grupo no vacío: `<baseName> - Warmup.m3u8`, `- Peak`, `- Closing`, `- Por revisar`. Grupos vacíos no se escriben.
- **Orden exacto recibido**, sin reordenar. **Rutas absolutas** (el playlist vive fuera del árbol de pistas; relativas se rompen). `#EXTM3U`; por pista `#EXTINF:<seg redondeados o -1>,<artist> - <title>` (sin artist/title → nombre de archivo sin extensión; quitar `\r\n`) y la ruta absoluta.
- Validar: `outputDir` absoluta, existente, carpeta; no dentro de `MUSIC BACKUP/2026` (exportar y reutilizar `assertSafeRoot` de `src/set-playlists.js:14`); cada `path` absoluto y existente (si no existe → error 400 con la ruta); `baseName` no vacío, sin `/ \ :` ni `..`, se recorta.
- Si alguno de los archivos destino existe y `overwrite !== true` → 409 `{ ok:false, existing:[nombres] }` sin escribir nada. Escritura atómica (exportar y reutilizar `atomicWrite` de `src/set-playlists.js:76`).
- Respuesta 200 `{ ok:true, written:[rutas absolutas] }`.
- No tocar el comportamiento de `/api/set-playlists` ni de `createSetPlaylists`.

**Front** — `web/src/views/Sets.tsx`:
- Botón "Exportar playlists" en la barra de resultados, visible con `results.length > 0` y sin proceso activo.
- Pide carpeta con `electron.openDirectory`. `baseName` por defecto = nombre de la carpeta de entrada (`folders.input`), si no "MusicKind Set".
- Grupos y orden = exactamente los de `groupSetResults(results)` (lo que ve el usuario), usando title/artist ya cargados.
- 409 → `window.confirm` con los nombres existentes → reintenta con `overwrite:true`.
- Éxito: `toast.success` con nº de archivos y acción "Mostrar en Finder" (`electron.showInFolder` del primero).
- i18n `es.json`/`en.json` (claves `sets.export*`). Tokens de color existentes; sin hex.

**Tests** — `tests/set-export.test.js` (node:test, carpeta temporal): 4 archivos con orden preservado y rutas absolutas; grupo vacío omitido; 409 sin sobrescribir y archivos intactos; `overwrite:true` reemplaza; rechaza ruta relativa, pista inexistente, baseName inválido y destino bajo `MUSIC BACKUP/2026`; saltos de línea en título eliminados. Vitest: helper puro que arma `groups` desde `groupSetResults` (si se extrae).

**No tocar:** `src/style_analyzer.py`, `src/set-playlists.js` salvo añadir `export` a las dos funciones, Clasificador, `NEXT.md`, `plan.md`, specs. Sin commit.

**Gate:** `node --test tests/*.test.js`, `npm --prefix web test`, `npm --prefix web run build`, `npm --prefix web run lint`, `npm --prefix web run format:check`.

## U1 — Encabezado de tabla sin hueco al hacer scroll (2026-09-25, pedido de Carlos)

Bug: al bajar por la lista, filas asoman por encima del `<thead>` fijo (captura de Carlos: la fila "Amor (Original Mix)" visible arriba de TRACK/ALBUM/YEAR). Causa probable: el contenedor con scroll tiene `py-2`; el `sticky top-0` queda debajo del padding superior y el contenido se ve en esa franja.
Contenedores: `web/src/views/Metadata.tsx:563`, `Converter.tsx:710`, `Bpm.tsx:496`, `Sets.tsx:408`, `Classifier.tsx:1119` y `:1467` (revisar todos los `overflow-auto` que contienen un `thead sticky`).
Arreglo: sin padding superior en el contenedor de scroll (mantener `px-*` y, si hace falta aire, `pb-2` o padding dentro de la tabla); el `thead` debe tapar por completo lo que pasa por debajo (fondo opaco). En Sets, las filas de sección `sticky top-8` deben seguir pegadas justo debajo del `thead` sin hueco.

## U2 — Ordenar columnas en todas las tablas (2026-09-25, pedido de Carlos)

- Helper común nuevo `web/src/lib/sort.ts`: `useSort` / funciones puras `compareBy(key)` y `sortRows(rows, sort, accessors)`. Clic en encabezado: ascendente → descendente → sin orden (orden original). Indicador ▲/▼ (icono lucide) en la columna activa; `aria-sort` en el `<th>`. Nulos/vacíos siempre al final en ambos sentidos. Texto con `localeCompare(…, {numeric:true, sensitivity:'base'})`. Tonalidad por Camelot (número, luego A antes de B) usando `web/src/lib/camelot.ts`. Orden estable (desempate por orden original).
- Columnas ordenables: todas las que muestran un dato (pista/título, artista, álbum, año, BPM, tonalidad, género, estado, formato, puntaje…); no el checkbox, ni `#`, ni columnas de acciones. `#` sigue mostrando la posición en pantalla.
- Vistas: Clasificador (ambas tablas; la virtualizada `Classifier.tsx:1140` debe virtualizar la lista ordenada), Convertidor, Metadatos, BPM, Sets.
- **Sets:** ordenar **dentro de cada sección** (Warmup, Peak, Closing, Por revisar); las secciones nunca se mezclan ni cambian de orden. La columna Sección ordena por puntaje de su sección.
- Lo que se ve manda: la cola del reproductor (`setQueue`), navegación con teclado ↑/↓, selección con rango (shift) de `useRowSelection` y la exportación de Sets (X1, "orden en pantalla") usan el orden mostrado. Ordenar no interrumpe el audio actual ni pierde la selección.
- El orden es por vista y vive en memoria (se conserva al cambiar de pestaña si la vista ya conserva sus filas; no persistir en disco).
- Tests vitest para `sort.ts` (asc/desc/none, nulos al final, Camelot, estabilidad, números como texto "10" > "9") y para el orden por sección de Sets (secciones intactas).

**No tocar:** backend (`src/`), `NEXT.md`, `plan.md`, specs. Sin commit. Sin hex en tsx; i18n `es/en` para textos nuevos (p.ej. `common.sortAsc/sortDesc`).
**Gate:** `npm --prefix web test`, `npm --prefix web run build`, `npm --prefix web run lint`, `npm --prefix web run format:check`.

## S1.2 — Puntaje de Sets con escala común (2026-09-25)

Bug verificado (prueba real de Carlos, `NEXT.md` 1c): `score_sections` (`src/style_analyzer.py:80`) calcula el percentil de cada sección contra la dispersión de **su propia** carpeta (`distribution = own_distances if len(own_distances) >= 5 else pooled`, línea ~101). La carpeta más compacta (peak) casi nunca gana: 0/117 pistas a peak; validación cruzada con las carpetas de Carlos (15 refs/sección, 10 semillas): actual 31,3 % (azar 33 %), escala común 53,3 %.
Arreglo: usar **siempre** `pooled` (distancias de todas las referencias a su propio centro) como distribución para todas las secciones. Todo lo demás igual (z-score conjunto, centros, `all-zero`, `tie`, `ref_counts`, contrato de 4 valores, salida JSON).
Tests (`tests/test_style_analyzer*.py` existente o nuevo, unittest): con una sección compacta y otra dispersa, una consulta en el centro de la compacta gana la compacta (hoy falla); una consulta igual de lejos de ambas no favorece a la dispersa; contrato de retorno intacto.
No tocar: resto de `src/`, `web/`, `NEXT.md`, `plan.md`, specs. Sin commit.
Gate: `"$HOME/Library/Application Support/MusicKind/python-venv/bin/python" -m unittest discover -s tests -p "test_*.py"` y `node --test tests/*.test.js`.

### S1.3 — Ganador por centro más cercano (corrige S1.2)

S1.2 medido por el cerebro: la escala común arregla peak pero dispara «Por revisar» (empates y ceros): `2026` 30,6 % por revisar, acierto 31,8 % (antes 43,5 %). Variante medida (scratchpad, mismas cachés): **ganador = sección con menor `query_distances` (distancia z al centro)**; `review='all-zero'` y `best=None` solo si todos los puntajes (escala común de S1.2) son 0; `tie` solo si las dos menores distancias son exactamente iguales. Resultado: Carlos CV 51,3 % (vs 31,3 %), `2026` 43,5 % con 11,8 % por revisar.
Cambio en `score_sections` (`src/style_analyzer.py:80`): conservar los `scores` de S1.2 (lo que muestra la UI) y el contrato de 4 valores; cambiar solo cómo se eligen `best`/`review`. Ajustar/añadir tests en `tests/test_style_scoring.py`: el ganador es el centro más cercano aunque dos puntajes empaten; todo 0 → `all-zero`; distancias idénticas → `tie`.
No tocar: resto de `src/`, `web/`, `NEXT.md`, `plan.md`, specs. Sin commit. Gate: igual que S1.2.

## S3a — «Ordenar set» por BPM y Camelot (2026-09-25, pedido de Carlos; subconjunto de `plan.md` § S3)

Objetivo: tras analizar, un botón propone el orden de mezcla dentro de cada sección con reglas explícitas y muestra el porqué de cada transición. Sin caché S2, sin duración objetivo, sin energía (E1), sin fijar/arrastrar (S4). Trabaja sobre los resultados ya en memoria.

**Back** — nuevo `src/set-sequencer.js` (puro, sin E/S) + `POST /api/set-sequence` en `src/server.js` junto a `/api/set-export`.
- Entrada: `{ sections: [{ key, tracks: [{ id, bpm|null, camelot|null, artist|null }] }] }` en orden de sección (warmup→peak→closing; la UI no manda «por revisar»). Salida: `{ ok, version: 1, sections: [{ key, order: [id…], transitions: [{ from, to, bpmDelta|null, tempoRelation: 'same'|'half'|'double'|'unknown', harmonic: 'same'|'adjacent'|'relative'|'clash'|'unknown', cost }] }] }`. La primera transición de una sección enlaza con la última pista de la anterior (`from` = id de la sección previa); la primera pista del set tiene `from: null`.
- Tempo: comparar BPM crudos; `half/double` solo si |a·2−b| o |a−b·2| ≤ 3 y está más cerca que el directo (se reporta, no se reescribe el BPM). `bpmDelta` = diferencia con la relación elegida.
- Camelot (normalizar `8A`, `08a`…): same; adjacent = ±1 misma letra con 12↔1; relative = mismo número A↔B; resto clash; nulo → unknown.
- Coste por transición (constantes exportadas y versionadas): BPM `|Δ|` (0 si ≤1; bajar BPM cuesta ×1.5 — el set tiende a subir, sin imponerlo); armónico same 0 / adjacent 0.5 / relative 1 / clash 4 / unknown 2 (desconocido nunca gana a conocido compatible); mismo artista consecutivo +1.
- Búsqueda: haz (beam) determinista ancho 16 dentro de cada sección, arrancando por la pista de menor BPM (o la de menor coste desde la última de la sección previa); desempate estable por id. Nulos de BPM al final de su sección en su orden original. Nunca duplica ni pierde pistas.
- Rendimiento: 1.000 pistas en una sección ≤2 s en este Mac (test con tiempo medido, umbral holgado 5 s para CI).

**Front** — `web/src/views/Sets.tsx`:
- Botón «Ordenar set» junto a «Exportar playlists» (visible con resultados y sin proceso activo). Llama a `/api/set-sequence` con las secciones visibles (sin «Por revisar», que queda al final sin ordenar).
- Modo secuencia: las secciones muestran el orden devuelto; clic en un encabezado de columna (U2) sale del modo secuencia; botón «Orden original» también. Mientras está activo, una columna estrecha/insignia por fila muestra la transición desde la anterior: `+2 BPM · 8A→9A` con color por `harmonic` (tokens existentes; clash en tono de aviso; unknown atenuado), y `½×`/`2×` si aplica. Tooltip con el desglose de coste.
- Cola del reproductor, selección y exportación (X1) siguen el orden mostrado (ya lo hacen con `visibleGroups`; mantenerlo). Si cambian los resultados (quitar filas, nuevo análisis) se sale del modo secuencia.
- i18n es/en (`sets.sequence*`). Sin hex.

**Tests** — `tests/set-sequencer.test.js`: sin duplicados ni pérdidas; determinista (misma entrada → misma salida, también con orden de entrada permutado); 12A→1A adjacent; 8A↔8B relative; nulos (BPM/clave) al final/unknown; half/double 64↔128; enlace entre secciones; 1 pista; sección vacía; 1.000 pistas en tiempo. Vitest: modo secuencia (entrar, salir por clic en columna, secciones intactas).

**No tocar:** `src/style_analyzer.py`, `src/set-export.js`, otras vistas, `NEXT.md`, `plan.md`, specs. Sin commit.
**Gate:** `node --test tests/*.test.js`, `npm --prefix web test`, `npm --prefix web run build`, `npm --prefix web run lint`, `npm --prefix web run format:check`.

## U3 — Columna «Artista» en todas las tablas (2026-09-25, pedido de Carlos: como Serato/Rekordbox)

Hoy el artista va como segunda línea gris bajo el título (`Bpm.tsx:679`, `Classifier.tsx:1217` y `:1573`, `Metadata.tsx:764`, `Sets.tsx:722`; Convertidor usa `artist` en `Converter.tsx:123`).
- Añadir columna **Artista** justo después de Pista/Título en Clasificador (ambas tablas), Convertidor, Metadatos, BPM y Sets. Ordenable con U2 (`SortableHeader`, clave `artist`; mismo comparador de texto; vacíos al final).
- La celda de pista muestra solo título (carátula y nombre de archivo de respaldo como hoy); quitar la segunda línea con el artista para no duplicar. Si una vista usa la segunda línea para otra cosa (ruta, estado), conservarla.
- Artista vacío → `—` atenuado. Truncar con `title` (tooltip nativo) para nombres largos con varios artistas.
- Anchos: la columna Artista flexible junto a Pista (p. ej. Pista ~40 % / Artista ~25 % del espacio flexible); el resto de columnas conserva su ancho. En la tabla virtualizada del Clasificador (grid `Classifier.tsx:1123`) añadir la pista de columna al `grid-cols` y a las filas. Sin scroll horizontal nuevo a 1300 px de ancho con el Inspector abierto.
- En Metadatos, si el usuario edita el artista en el Inspector, la columna muestra el valor editado (mismo origen que hoy usa la segunda línea).
- i18n `common.artist` o por vista, es/en. Sin hex.
Tests: vitest donde ya hay tests por vista — accesor `artist` en orden (asc/desc, vacíos al final).
No tocar: backend, `NEXT.md`, `plan.md`, specs. Sin commit. Gate: `npm --prefix web test`, `build`, `lint`, `format:check`.

## U4 — Detalles de Carlos (2026-09-25): responsive de tablas, quitar filas en Clasificador, Convertidor «General», Stems

Captura del cerebro (Chrome headless, ventana 900 px, Inspector abierto): en Convertidor y Metadatos la columna Pista colapsa a ~0 px y el texto del Artista queda encima de la carátula; el encabezado «Pista/Artista» se superpone; en la cabecera de la vista «N archivos · N pendientes» se parte en 3 líneas. Regresión de U3 (columnas fijas `w-40` + `table-fixed`).

**U4.1 Tablas responsive (todas: Clasificador ×2, Convertidor, Metadatos, BPM, Sets).**
- La celda Pista nunca baja de ~180 px (carátula + título legible, truncado con `title`). Nada se superpone nunca.
- Con poco ancho (contenedor de la tabla < ~720 px; usar container queries `@container` de Tailwind v4 o medir el contenedor, no el viewport, porque el Inspector ocupa ancho), ocultar la columna Artista y mostrar el artista como segunda línea gris bajo el título (como antes de U3). Con ancho suficiente, columna Artista como hoy. Las columnas de menor prioridad (Álbum, Año, Origen…) pueden ocultarse antes que Artista; ordenar por artista sigue disponible cuando la columna está visible.
- Si aun así no cabe, scroll horizontal dentro del contenedor de la tabla, no de la página. El `thead` sigue fijo (U1).
- Cabeceras de vista: el contador «N archivos · N pendientes» en una línea (`whitespace-nowrap`, truncar u ocultar «pendientes» en estrecho).

**U4.2 Clasificador (método por etiquetas, tabla virtualizada ~`Classifier.tsx:1140`): quitar filas como en las otras pestañas.** Hoy hay checkboxes (`selectedPaths`) y «Cambiar seleccionadas», pero no quitar. Añadir el mismo control que las demás vistas (`SelectionControls` de `web/src/components/music/TableSelection.tsx`: botón «N seleccionadas · Quitar», botón limpiar tabla, toast con Deshacer). Quitar = sacar de la lista actual (no toca archivos); las filas quitadas no entran en mover/aplicar ni en playlists; `selectedPaths`, filtros, distribución, snapshot (`setResult('classifier-tags', …)`) y la pista seleccionada del Inspector se actualizan; Deshacer restaura todo. Shift-clic para rango como en las otras vistas si es sencillo con el helper existente.

**U4.3 Convertidor: sin la palabra «General».** El selector por fila/Inspector (`Converter.tsx:613–660`) muestra hoy «General (WAV)». Mostrar solo los formatos (MP3/WAV/AIFF/FLAC) sin duplicados: una fila sin formato propio (`format: null`) muestra el formato global; elegir el mismo formato global deja `null` (sigue al global); elegir otro lo fija. Mantener cómo se distingue visualmente una fila con formato propio si ya existe; si no, no añadir nada. Quitar la clave i18n `converter.general` si queda sin uso.

**U4.4 Stems (`web/src/views/Stems.tsx`).**
- Cabecera (`:366`): quitar el nombre del archivo junto al título (duplicado; ya está en el Inspector).
- Barra (`:427`): el botón de la izquierda muestra hoy el nombre del archivo; debe mostrar la **carpeta de destino** (`outputDir`, que viene de Configuración): icono + «Destino: <nombre de carpeta>» con la ruta completa en `title`; clic → `electron.showInFolder(outputDir)`. No añadir selector de destino (decisión: solo en Configuración). Para cambiar de archivo: botón de icono en la cabecera («Elegir otro archivo», `aria-label`), además del arrastre existente.
- Transporte: quitar play/pausa y «00:00 / 06:25» de la barra (`:469–484`) y ponerlos en la zona de resultados, en la columna izquierda de la fila de la regla de tiempo (encima de los carriles Original/Voces/Instrumental, alineado con el ancho `w-44` de las etiquetas de carril). Botón perfectamente circular (`shrink-0`, tamaño fijo) y tiempo al lado. Mismo comportamiento de reproducción.
- Nada se superpone a 900 px ni a 1300 px.

Tests vitest donde haya lógica pura (quitar/deshacer en Clasificador; mapeo formato null ↔ global en Convertidor).
**No tocar:** backend, `NEXT.md`, `plan.md`, specs. Sin commit. Sin hex.
**Gate:** `npm --prefix web test`, `build`, `lint`, `format:check`. El cerebro verificará con capturas a 900 y 1300 px.

### U4.5 — Correcciones tras la verificación de U4 (capturas del cerebro a 900/1300 px)

Hallado: (a) a 900 px de ventana, barra lateral 220 + Inspector 340 dejan ~340 px a la vista; el contenido (columnas Origen/Formato/Tamaño, botones de cabecera «Convertir», «Identificar», «+») queda **debajo/encima del Inspector**. (b) a 1300 px Metadatos ya no muestra la columna Artista (umbral U4.1 demasiado alto; el contenedor mide ~716 px). (c) Stems a 900: en la barra «Destino:» se superpone con «Formato»; la regla de tiempo quedó desalineada de la onda (el `gap-3` nuevo corre la regla 12 px respecto al inicio de la onda).
- **Inspector responsive** (una sola vez en `web/src/components/music/TrackInspector.tsx`, sirve a todas las vistas): con ventana < 1100 px el Inspector sale del flujo y se muestra como panel lateral superpuesto (`web/src/components/ui/sheet.tsx`) cerrado por defecto; botón de icono (lucide `PanelRight`, `aria-label` i18n) en la cabecera de cada vista que usa Inspector para abrir/cerrar. ≥ 1100 px: igual que hoy. Nada del contenido principal queda nunca debajo del Inspector.
- **Cabeceras de vista**: los botones nunca se salen de su columna; en estrecho se quedan solo con icono (texto oculto, `aria-label` conservado) y el contador se trunca.
- **Umbral de la columna Artista**: visible cuando el contenedor de la tabla ≥ 600 px. Prioridad al faltar espacio: primero se ocultan Álbum/Año/Origen/Tamaño/Etiqueta original (las de menor valor en cada vista), después Artista (pasa a segunda línea). A 1300 px con Inspector, Metadatos debe mostrar Pista + Artista + Álbum (+ Año si cabe).
- **Stems**: la barra se ajusta en varias líneas (`flex-wrap`) sin superponer; la regla de tiempo empieza exactamente en la x donde empieza la onda de los carriles (misma anchura de columna izquierda y sin separación extra).
Gate igual que U4. El cerebro verificará capturas a 900, 1100 y 1300 px.

### U4.6 — Convertidor sin scroll horizontal a 1100 px
Verificado a 1100 px (Inspector en línea, contenedor ~540 px): la tabla tiene `min-w-[900px]` (`Converter.tsx:743`) → «Formato de salida» queda cortado y hay que desplazar. Quitar ese mínimo fijo; con el contenedor estrecho ocultar primero Tamaño y Origen (container queries, como Metadatos), después Artista (segunda línea). «Formato de salida» y Pista siempre visibles y completos. Sin scroll horizontal a 900, 1100 y 1300 px. Gate igual que U4.

### U4.7 — Convertidor: la Pista no se aplasta
Verificado a 1300 px (contenedor ~716 px): la columna Archivo/Pista queda en ~50 px («Red …», «— BP…») mientras Artista, Origen y Estado ocupan el resto. Regla: la columna Pista nunca < 220 px (título legible). Umbrales por ancho del contenedor elegidos para respetarlo: con ~716 px debe verse Pista (≥220) + Artista + Formato de salida + Estado; Origen solo si queda sitio; Tamaño el primero en ocultarse. Calcula los umbrales sumando anchos reales de columnas (checkbox, #, Formato ~140, Estado ~90…), no a ojo. Sin scroll horizontal a 900/1100/1300 px. Solo `web/src/views/Converter.tsx`. Gate igual que U4.

### U4.8 — Convertidor: umbrales exactos (U4.7 verificado y falla)
Capturas: a 1300 px el artista no aparece en ningún sitio; a 1100 px la Pista mide ~90 px. Causas en `web/src/views/Converter.tsx`: columna Artista oculta con `@max-[700px]` (`:759`, `:848`) pero la segunda línea solo con `@max-[600px]` (`:838`) → entre 600 y 700 px no hay artista; `min-w-[220px]` en el `<th>` (`:751`) no tiene efecto con `table-fixed`.
Cambios exactos (el `@container` mide el contenido, sin `px-6`):
- Anchos fijos: checkbox `w-8`, `#` `w-8`, Formato de salida `w-28`, Estado `w-24`, Artista `w-32`, Origen `w-16`, Tamaño `w-40`. Pista sin ancho (se queda con el resto). Quitar `min-w-[220px]`.
- Artista columna visible con contenedor ≥ 620 px (`@max-[620px]:hidden` en th y td); **la segunda línea con el artista bajo el título usa exactamente el umbral complementario** (`hidden @max-[620px]:block`). Nunca ambos ni ninguno.
- Origen oculto `@max-[690px]`; Tamaño oculto `@max-[860px]`.
- Con eso la Pista ≥ 220 px desde un contenedor de ~492 px (1100 px de ventana con Inspector).
Solo `Converter.tsx`. Gate web. No commitear.

## M1 — Identificar: artistas con guion, basura en el nombre, sugerir la original, errores claros (2026-09-26, pedido de Carlos)

Caso real (copia): `RUN DMC, Jason Nevins - It's Like That  (Raxon Edit) Unrelease.mp3`, sin tags. AcoustID: «Canción no encontrada» (edit no publicado, esperable). Deezer (`src/providers/deezer.js:32`): `RUN DMC, Jason Nevins`/`It's Like That (Raxon Edit) Unrelease` → null; `RUN DMC, Jason Nevins`/`It's Like That` → null; `Run-DMC`/`It's Like That` → encontrado (álbum *Best Of*). Error mostrado: «No se pudo identificar la canción. Revisa AcoustID o completa artista y título.» (`src/metadata_editor.js:299`), engañoso.

1. **Artistas equivalentes**: `normalizeArtistName` (`src/providers/http.js:33`) además de acentos/minúsculas: tratar todo lo que no sea letra/dígito como espacio y colapsar (`RUN DMC` = `Run-DMC` = `run.dmc`). Revisar todos sus usos (`grep -rn normalizeArtistName src`) y que los tests existentes sigan pasando.
2. **Basura en el título**: `cleanTrackTitle` (`http.js:25`) quita, fuera o dentro de paréntesis/corchetes y al final del título: `unrelease`, `unreleased`, `free dl`, `free download`, `promo`, `snippet` (sin distinguir mayúsculas). No tocar descriptores de versión (remix/edit/mix/dub/rework/bootleg).
3. **Caché**: subir la versión de la clave (`deezer:v2` → `deezer:v3`, `deezer.js:35`) para no reutilizar los `null` guardados con la lógica vieja.
4. **Sugerir la original**: en `identifyAndTag` (`src/metadata_editor.js:221`), si no hubo resultado exacto y el título pide una versión explícita (remix/edit…, misma detección que `explicitVersion` en `deezer.js:10`; exportarla), buscar la canción sin el descriptor de versión. Si aparece: proponer álbum, año y carátula/ISRC de la original, **conservar el título del archivo con su versión** (`It's Like That (Raxon Edit)`, ya sin «Unrelease») y el crédito de artistas del archivo si incluye al artista encontrado (regla `preserveArtistCredit` existente; con la normalización nueva `RUN DMC` casa con `Run-DMC`). Respuesta con `matchType: 'original'`; en los demás casos `'exact'` (texto) o `'fingerprint'` (AcoustID). Nunca escribir sin preview (la vista ya usa `preview: true`).
5. **Error con motivos**: si no se identifica, el error lista lo intentado y por qué, p. ej.: «No se encontró la canción. Huella de audio: sin coincidencias en AcoustID. Tags del archivo: vacíos. Búsqueda por nombre en Deezer: «RUN DMC, Jason Nevins – It's Like That (Raxon Edit)» sin resultados (tampoco la versión original). Completa artista y título y vuelve a intentar.» El servidor (`src/server.js:582–670`) pasa a `identifyAndTag` el motivo de AcoustID (`identifyError`: sin clave, tiempo agotado, no encontrada, fpcalc ausente…). Textos en español (el backend ya responde en español).
6. **Lote que no se corta**: `web/src/views/Metadata.tsx:333` hoy lanza en la primera pista que falla y detiene todo el lote. Cambiar a: una pista fallida queda marcada (estado «No identificada» con el motivo en `title`/Inspector) y el lote sigue; al final toast con «N identificadas · M sin identificar». Pistas con `matchType: 'original'` muestran en la fila/Inspector una marca «Original, no esta versión» (i18n es/en) para que el usuario revise antes de guardar.
Tests: `tests/metadata-editor.test.js` (y nuevo `tests/deezer.test.js` si conviene, con `fetcher` falso): `RUN DMC` casa con `Run-DMC`; «Unrelease» eliminado; versión no encontrada → original con `matchType: 'original'` y título conservado; error con motivos; clave de caché v3. Vitest: lote continúa tras un fallo y cuenta resultados.
**No tocar:** clasificador, otras vistas, `NEXT.md`, `plan.md`, specs. Sin commit.
**Gate:** `node --test tests/*.test.js`, `npm --prefix web test`, `build`, `lint`, `format:check`.

## B1 — BPM: lo analizado queda pendiente de guardar (2026-09-26, pedido de Carlos)

Bug: en `web/src/views/Bpm.tsx:168` el resultado del análisis se registra como `original` (lo que «tiene el archivo»), así que `changed` (`:213`) solo ve ediciones manuales. Si el BPM/tonalidad vino del **análisis** (archivo sin tag), no aparece «Guardar» y la fila muestra ✓ (parece guardado) aunque el archivo no se escribió. El backend ya informa la fuente: `bpmSource` y `keySource` (`'tag'` | `'analysis'`…) en cada resultado (`src/bpm_analyzer.py:29–33`).
- `original` debe reflejar **lo que hay en el archivo**: si `bpmSource === 'tag'` usar ese BPM, si no `null`; igual con `keySource` para la tonalidad. Así, una pista analizada sin tag queda «pendiente» → botón «Guardar cambios N» en cabecera y «Guardar» por fila (ya existen), sin ✓.
- Añadir `bpmSource` al tipo `BpmResult` y conservarlo. En la fila, un punto/estado «sin guardar» (tokens existentes, i18n) cuando difiere del archivo; ✓ solo cuando lo mostrado coincide con el archivo.
- Tras guardar con éxito: `original` = valores guardados y la fuente pasa a `tag` en memoria. Si falla, la fila sigue pendiente (ya hay toast de error).
- Si el archivo ya tenía tag y el análisis no cambió nada: sin pendiente (no reescribir).
- No escribir automáticamente al analizar (decisión existente: analizar no altera originales).
Tests vitest (función pura exportada, p. ej. `originalFromResult` / `isPendingSave`): análisis sin tag → pendiente; tag → no pendiente; edición manual → pendiente; tras guardar → no pendiente.
**No tocar:** backend, otras vistas, `NEXT.md`, `plan.md`, specs. Sin commit. **Gate:** `npm --prefix web test`, `build`, `lint`, `format:check`.

### B1.1 — Columna de acciones del BPM cortada
Captura a 1300 px (Inspector abierto): el encabezado de la última columna se ve «AC» y el botón de fila «Guardar» queda cortado («Gua»). La columna de acciones debe verse completa a 900/1100/1300 px (ancho fijo suficiente para icono + «Guardar», o solo icono con `aria-label`/`title` en estrecho), sin scroll horizontal; la Pista mantiene ≥ 220 px (misma técnica que U4.8: anchos fijos + `@container`). Solo `web/src/views/Bpm.tsx`. Gate web.

### B1.2 — BPM: un solo contador
Pedido de Carlos: la cabecera muestra «N pistas · N pendientes» (`web/src/views/Bpm.tsx:421`) y la barra repite «N archivos» junto al icono de carpeta (`:501`). Quitar el contador de la cabecera; dejar solo el de la barra junto al icono. Si «pendientes» aporta (hay archivos sin analizar), mostrarlo en ese mismo texto de la barra: «N archivos · M pendientes» solo cuando M > 0. Quitar claves i18n que queden sin uso. Solo `Bpm.tsx` + i18n. Gate web.

## M2 — Metadatos: conservar «(Extended Mix)» y guardar todo de una vez (2026-09-26, pedido de Carlos)

Caso real (copia de `muzrec/track.aiff`, tags de Beatport: título `Excuse Me  (Extended Mix)`, artista `Italobros`): identify propone `title: "Excuse Me"`, `newFilename: "Italobros - Excuse Me.aiff"`. Carlos espera `Italobros - Excuse Me (Extended Mix).aiff`.
1. **Regresión de M1** (`src/metadata_editor.js:~270–292`): `requestedTitle = cleanTrackTitle(...)` borra `(Original Mix)`/`(Extended Mix)` y `explicitVersion` los excluye, así que `preserveMixTitle` es falso. Arreglo: para **conservar** el título usar el título del archivo/tag solo sin basura (unrelease/free dl/promo/snippet, paréntesis vacíos) y con espacios colapsados (`Excuse Me (Extended Mix)`), y preservarlo cuando contiene el título encontrado (normalizado) y lleva cualquier descriptor entre paréntesis/corchetes (Original/Extended/Radio Edit/Club Mix/remix/edit…). `cleanTrackTitle` sigue usándose solo para **buscar**. Mantener lo de M1 (RUN DMC / original sugerida). Tests: `Excuse Me  (Extended Mix)` + Deezer `Excuse Me` → título `Excuse Me (Extended Mix)`, archivo `Italobros - Excuse Me (Extended Mix).aiff`; `(Original Mix)` igual; sin descriptor → título de Deezer.
2. **Guardar todo** (`web/src/views/Metadata.tsx`): hoy solo existe «Guardar» del Inspector para la fila seleccionada (`save`, `:448`). Añadir en la cabecera «Guardar cambios N» (como en BPM) que aplica a todas las filas con cambios pendientes (tags distintos de los originales o `newFilename` ≠ nombre actual; incluye las identificadas): escribe tags (`/api/metadata/write`) y renombra (`/api/metadata/rename`), fila por fila, sin cortar el lote si una falla (error en la fila con el motivo, p. ej. «ya existe un archivo con ese nombre»). Al terminar: toast «N guardadas · M con error»; filas guardadas actualizan ruta/nombre/originales (misma lógica que `save`, extraer a función compartida). No guardar filas marcadas «Original, no esta versión» (`matchType: 'original'`) salvo que el usuario las haya editado o guardado individualmente: se cuentan aparte en el toast («K por revisar»). Con proceso activo o sin pendientes, el botón no aparece.
3. Tras identificar, las filas con cambios muestran el estado «sin guardar» (como en BPM) para que se note que falta guardar.
Tests: node (título/nombre de archivo) y vitest (selección de filas a guardar, excluye `original`, lote continúa tras error).
**No tocar:** otras vistas, `NEXT.md`, `plan.md`, specs. Sin commit. **Gate:** `node --test tests/*.test.js`, `npm --prefix web test`, `build`, `lint`, `format:check`.
