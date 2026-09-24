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

## Fuera de alcance

P1/P2 del clasificador (motor, manifiesto, deshacer) · contrato seguro de escritura de tags por formato (F3 de `plan.md`)
· corte `ui/` → `web/dist` (F9).
