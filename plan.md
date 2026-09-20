# MusicKind — Plan de corrección

> Actualizado: 2026-09-13
> Objetivo principal: ordenar una biblioteca grande de música por género desde la interfaz, sin exigir conocimientos técnicos y sin mover archivos incorrectamente.

## Diagnóstico verificado

### 1. El clasificador no obtiene siempre un género musical real

El flujo actual intenta, en este orden:

1. override manual;
2. género embebido ID3/Vorbis;
3. tags de Last.fm y géneros de artista de Spotify;
4. tempo y energía reportados por Spotify;
5. BPM calculado localmente;
6. `Unsorted`.

El género embebido sí se lee antes de consultar servicios externos, pero solo sirve si coincide con las reglas codificadas y está dentro de los géneros activos. Un valor válido pero no reconocido continúa hacia las APIs.

Spotify y Last.fm no deberían ser obligatorios cuando el archivo ya contiene un género útil. Sin embargo, el endpoint de la interfaz rechaza la clasificación completa si faltan las credenciales de Spotify. Esto contradice el propio orden del clasificador y realiza trabajo externo innecesario.

Cuando metadata, Spotify y Last.fm no resuelven el género, la clasificación local usa únicamente BPM. BPM no identifica un género musical: varios géneros comparten tempo. Además, los rangos actuales se superponen; por el orden de las condiciones, 118–126 BPM termina favoreciendo `Afro House` y deja reglas posteriores inaccesibles para parte de ese rango.

### 2. La identificación tipo Shazam está separada del clasificador

No existe Shazam en el código actual. Hay identificación mediante AcoustID + `fpcalc`, pero solo se usa en el editor de metadata. Puede obtener artista, título, álbum y año; no entrega género y no participa en la clasificación por lotes.

Identificar una canción y determinar su género son dos operaciones distintas:

- la huella acústica permite reconocer la grabación;
- después se necesita el género embebido, una fuente de tags como Last.fm/Spotify/MusicBrainz u otro catálogo, o un modelo real de clasificación de audio.

El flujo deseado debe reutilizar la metadata existente y recurrir a identificación acústica únicamente cuando falten artista/título. Una canción identificada debe continuar automáticamente hacia la obtención de género, sin obligar al usuario a pasar primero por el editor de metadata.

### 3. El instalador de librerías de audio está roto en este Mac

Error reproducido por la evidencia del usuario:

```text
no such option: --break-system-packages
```

La app selecciona `/Library/Developer/CommandLineTools/usr/bin/python3` (Python 3.9.6, pip 21.2.4) y ejecuta:

```text
python3 -m pip install --upgrade --break-system-packages librosa numpy
```

Ese pip no reconoce `--break-system-packages`. La app solo comprueba que Python responda a `--version`; no valida la versión/capacidades de pip, compatibilidad de paquetes ni permisos.

Problemas relacionados:

- intenta modificar un Python del sistema en lugar de usar un entorno aislado;
- existen dos instaladores distintos (endpoint del servidor e IPC de Electron) con argumentos diferentes;
- el log de instalación no se guarda y desaparece al cerrar o reintentar;
- `requirements.txt`, la UI y el servidor duplican listas diferentes de dependencias;
- `fpcalc` requiere una instalación nativa separada que todavía expone instrucciones de terminal;
- no hay pruebas automatizadas del instalador en macOS o Windows.

### 4. La interfaz no es segura para una biblioteca grande

La interfaz ya llama a la opción **Simulación (no mueve archivos)**, aunque todavía muestra `--dry-run` como explicación secundaria. Esa mitigación no constituye un flujo completo de revisión: hoy puede mover cada archivo inmediatamente y no ofrece:

- conteo previo de archivos;
- vista previa estructurada del género y la fuente de la decisión;
- nivel de confianza;
- selección/corrección antes de aplicar;
- aprobación por lote;
- deshacer o manifiesto de movimientos reversible;
- acceso visible al reporte final;
- reanudación confiable tras cerrar la app.

`dry-run` debe mantenerse como mecanismo interno, pero en la interfaz debe expresarse como **Analizar sin mover** o **Revisar antes de ordenar**. El usuario final no necesita conocer el término técnico.

### 5. Cobertura de pruebas insuficiente

Las pruebas actuales cubren descubrimiento de audio y partes del editor de metadata. No cubren el orden de clasificación, prioridad del género embebido, rangos BPM, APIs, AcoustID integrado, endpoint SSE, movimientos/deshacer, instalador Python ni el flujo de interfaz.

## Plan priorizado

### P0 — Desbloquear la instalación desde la interfaz

- [x] Unificar los dos instaladores en un solo servicio usado por Electron.
- [x] Crear un entorno Python privado de MusicKind dentro de los datos de la app; no modificar el Python del sistema.
- [x] Detectar intérprete, versión, pip, plataforma y arquitectura antes de instalar.
- [x] Eliminar el uso incondicional de `--break-system-packages`.
- [ ] Definir y fijar versiones compatibles de las dependencias en una sola fuente de verdad.
- [x] Incluir esa fuente de dependencias en el paquete distribuido.
- [x] Mostrar errores claros y accionables dentro de la app y guardar un log diagnóstico.
- [ ] Resolver `fpcalc` desde la interfaz o presentar una instalación guiada específica por plataforma, sin asumir Homebrew.
- [x] Añadir tests de selección de Python, argumentos, errores, SSE y variantes macOS/Windows.

**Aceptación:** una instalación limpia desde la app instala y verifica `librosa`/`numpy`; un fallo explica la causa y conserva el log; no altera el Python del sistema.

### P1 — Corregir el motor de clasificación

- [ ] Quitar el requisito global de Spotify antes de iniciar.
- [ ] Aceptar primero un género embebido válido y registrar `source=embedded`.
- [ ] Normalizar alias de géneros sin reducir todos los valores a una lista rígida silenciosamente.
- [ ] Si falta identidad, integrar AcoustID en el propio clasificador para obtener artista/título.
- [ ] Consultar fuentes externas solo para los datos faltantes y conservar qué fuente produjo cada resultado.
- [ ] Separar género de pista y género de artista; no mezclarlos sin trazabilidad.
- [ ] Eliminar BPM como decisión final de género o degradarlo a señal auxiliar de baja confianza.
- [ ] Evaluar un modelo local real de clasificación musical para operar sin APIs; comparar precisión, tamaño, velocidad y licencias antes de elegirlo.
- [ ] Enviar casos no confiables a `Por revisar`, no a un género inventado.
- [ ] Añadir caché por identidad/huella para no repetir consultas.

**Aceptación:** archivos con género embebido se clasifican sin red; archivos reconocibles sin metadata se identifican y continúan al paso de género; ninguna pista recibe un género únicamente por BPM; cada decisión muestra fuente y confianza.

### P2 — Flujo seguro para ordenar mucha música

- [ ] Paso 1: seleccionar carpeta y contar archivos compatibles.
- [ ] Paso 2: analizar sin mover y mostrar tabla de resultados.
- [ ] Permitir filtrar por `confiable`, `por revisar`, `sin identificar` y `error`.
- [ ] Permitir corregir género individualmente o en lote.
- [ ] Paso 3: confirmar y aplicar únicamente los movimientos aprobados.
- [ ] Generar un manifiesto antes/después con origen, destino, fuente y confianza.
- [ ] Implementar deshacer usando el manifiesto.
- [ ] Reanudar trabajos grandes y evitar reclasificar archivos ya procesados.
- [ ] Mostrar resumen final y acceso al reporte desde la interfaz.

**Aceptación:** se puede analizar una biblioteca completa sin moverla, aprobar un subconjunto, aplicar los cambios y revertirlos desde la app.

### P3 — Pruebas funcionales y medición

- [ ] Crear fixtures sin secretos: género embebido reconocido, alias, sin metadata, API simulada, AcoustID simulado, BPM ambiguo y archivo corrupto.
- [ ] Probar la prioridad exacta de fuentes y que una API no sobrescriba metadata confiable.
- [ ] Probar interrupción, reanudación, duplicados y reversión de movimientos.
- [ ] Probar bibliotecas pequeñas, medianas y grandes con tiempos y uso de memoria registrados.
- [ ] Ejecutar QA manual en Electron para macOS y Windows.

**Aceptación:** los gates automatizados cubren el motor y el instalador; el QA manual usa una matriz reproducible y conserva evidencia.

### P4 — Rediseño de interfaz

- [ ] Rediseñar navegación, jerarquía, estados, tablas y mensajes después de estabilizar instalación y clasificación.
- [ ] Diseñar alrededor de la tarea principal: `seleccionar → analizar → revisar → ordenar → deshacer`.
- [ ] Ocultar términos técnicos (`dry-run`, pip, SSE, traceback) detrás de mensajes útiles, manteniendo un panel diagnóstico opcional.
- [ ] Validar legibilidad y rendimiento con bibliotecas grandes.

**Aceptación:** una persona puede completar el flujo principal sin conocer términos de terminal, distingue claramente análisis de movimiento y puede encontrar el detalle técnico solo cuando necesita diagnosticar un error.

## Exclusiones por ahora

- No mover música real durante el diagnóstico.
- No elegir todavía un modelo local de género sin comparar alternativas y licencias.
- No rediseñar visualmente antes de estabilizar el flujo principal.
- No almacenar ni mostrar valores de API keys en logs o reportes.

## Evidencia pendiente para cerrar el diagnóstico

- Resultado de instalación en un entorno Python aislado.
- Muestra pequeña y representativa con géneros esperados definidos por el usuario.
- Comparación de resultados por fuente: embebido, Last.fm, Spotify, identificación acústica y modelo local candidato.
- Medición sobre una copia o modo de análisis sin movimientos; nunca usar la biblioteca original como primera prueba destructiva.

---

# Frente UI — Migración a React + shadcn/ui

> Decidido 2026-09-13. Reemplaza a P4 y levanta la exclusión "No rediseñar antes de estabilizar": el front
> se construye en paralelo al back (Codex) sin tocar sus archivos. Insight aplicado: INS-2026-005.

## Decisión

| Elemento | Elección | Por qué |
|---|---|---|
| Base | React 19 + Vite + TypeScript | shadcn lo exige; tipos protegen contratos `/api` y `electronAPI` |
| Componentes | shadcn/ui (tema neutral `zinc`, oscuro, 1 acento) | El código del componente vive en el repo: cambiar algo = editar un archivo (lección OrchestOS). HeroUI se descarta: tema en librería, override costoso |
| Estilo | Tailwind v4 + tokens CSS en un solo archivo | Paleta/radios/tipografía en un lugar |
| Iconos | `lucide-react` | Set único, el que usa shadcn |
| Extras | `cmdk` (⌘K estilo Raycast), `sonner` (toasts), `@fontsource-variable/geist` | Fuentes empaquetadas: Electron offline |
| Ubicación | `web/` con su propio `package.json` y lockfile | No toca `package.json`/lockfile raíz que edita Codex |

Descartado: Basecoat/Franken UI sobre el vanilla actual — mantiene 185 `getElementById` y 24 `innerHTML` en `ui/app.js`, que es el costo de cambio real.

## Reglas de diseño (obligatorias)

1. **Icono antes que texto.** Acciones = icon button + `Tooltip` + `aria-label`. Prohibido: párrafos descriptivos, subtítulos explicativos, "Formatos aceptados: …", instrucciones de terminal.
2. Texto visible solo para: título de vista (1 palabra), datos (nombres de archivo, BPM, género), valores de formulario y errores accionables.
3. Estados vacíos = icono grande + 1 verbo (`Soltar carpeta`). Nada más.
4. Densidad Linear: sidebar de iconos colapsable, tablas compactas, un solo acento, sin degradados ni glow.
5. i18n: todo texto (incluidos tooltips) sale de `web/src/i18n/{es,en}.json`. Cero literales en JSX.
6. Ningún componente llama `fetch` ni `window.electronAPI` directo: pasa por `web/src/lib/api.ts` y `web/src/lib/electron.ts`.

## Hallazgos para el back (Codex)

- [x] `src/server.js:759` parte cada chunk de stdout como si fueran líneas completas: un `[PROGRESS:X/Y]` partido entre chunks se pierde. Bufferizar por línea.
- [x] **Seguridad:** `src/server.js:116` `listen(PORT)` no fija `127.0.0.1`; la API (mueve/borra archivos) puede quedar expuesta en la red local. Fijar host loopback.
- [x] **BPM:** `/api/bpm/analyze` solo calcula y transmite resultados; no escribe metadata. La vista solo tiene **Analizar/Cancelar** y la columna **Acciones** está vacía. El escritor actual no admite BPM.
- [ ] MusicKind usa `librosa.beat.beat_track`, analiza por defecto 60 s y redondea a una décima. Una diferencia como 119 BPM en Serato frente a 120 BPM en MusicKind puede deberse al algoritmo, la ventana o la visualización; no permite declarar cuál es correcto sin una comparación controlada.

## Fases (en orden, una a la vez; cada una cierra con su gate)

### F0 — Andamiaje  ✓ 2026-09-13 (build+lint verdes, captura OK, revisado por gpt-5.6-sol)
- [x] `web/` con Vite + React + TS + Tailwind v4 + shadcn init (zinc, dark) + lucide + geist.
- [x] Proxy Vite `/api` → `http://127.0.0.1:3030`.
- [x] Sin tocar `src/`, `electron/`, `ui/`, `package.json` raíz.

**Gate:** `npm --prefix web run build` y `npm --prefix web run lint` pasan; `npm --prefix web run dev` muestra shell vacío.

### F1 — Shell y capa de datos  ← EN CURSO
- [ ] Pendientes de la revisión F0: `shadcn`, `tailwindcss`, `@tailwindcss/vite` a devDependencies; favicon Vite por logo MusicKind con ruta relativa; borrar `vite.svg`, `public/icons.svg`, README de Vite; literales ingleses sr-only de `components/ui` (`Close`, `Toggle Sidebar`, `Sidebar`) vía i18n; padding y logo en sidebar.
- [ ] Layout: sidebar de iconos (7 vistas) + área principal; ruta por vista.
- [ ] `lib/api.ts`: `getJson`, `postJson`, y un único `streamProcess()` (hook `useProcessStream`) que reemplaza los 6 lectores SSE duplicados de `ui/app.js` (L353, 903, 1070, 1235, 1737, 1929): progreso `[PROGRESS:X/Y]`, `result`, cancel/pause/resume.
- [ ] `lib/electron.ts`: wrapper tipado de `checkPython, openExternal, openDirectory, openFiles, showInFolder, checkFFmpeg, installFFmpeg` con fallback no-op en navegador.
- [ ] i18n `es`/`en`, ⌘K con navegación, toaster, estado global de ffmpeg/python.

**Gate:** build + lint + tests de `lib/` (vitest) para parser de progreso y stream.

### F1.0 — Bloqueo: ruta absoluta al arrastrar una canción  ← SIGUIENTE (BLOQUEANTE)
- [ ] Corregir el fallo confirmado de BPM por arrastre: `ui/app.js` usa `f.path || f.name`; en Electron 44 `File.path` puede faltar, se envía solo el basename a `/api/metadata/list` y aparece `No se encontro la ruta` antes de ejecutar `/api/bpm/analyze`.
- [x] Resolver la ruta absoluta mediante un puente seguro de preload/Electron (`webUtils.getPathForFile` o mecanismo compatible); no aceptar un basename como ruta.
- [ ] Conservar la selección por diálogo.
- [ ] Añadir prueba de `DataTransfer.File` sin `path` y prueba de que al backend llega una ruta absoluta.

Alcance conforme INS-2026-005: solo resolver la ruta de archivos arrastrados y cubrir el contrato de seguridad y pruebas indicado. Workaround temporal: usar selección por clic/carpeta.

**Gate:** pruebas automatizadas de `DataTransfer.File` sin `path` y de ruta absoluta entregada al backend; tests Node relacionados; `node --check` de los archivos JS/CJS modificados; build de la interfaz aplicable; `git diff --check`; QA manual en Electron arrastrando una canción y usando selección por clic.

### F1.1 — Correcciones F1 (build/lint/15 tests verdes; revisión gpt-5.6-sol con 5 altas)
Revisión cruda: `/private/tmp/claude-501/-Users-carlosgallardo-Documents-projects-Music-MusicKind/2ef191db-935a-45aa-84e7-e657af04f45c/tasks/buojg6m0k.output` (temporal).
- [ ] `api.ts:157` capturar errores de `fetch`/`reader.read()` → estado `error` siempre.
- [ ] `api.ts:203` `useProcessStream`: abortar corrida previa al `run` y al desmontar.
- [ ] `api.ts:241` cancelar como `ui/app.js`: POST `/api/cancel` y seguir leyendo hasta `complete{cancelled:true}`.
- [ ] `api.ts:153` `reader.cancel()`/`releaseLock()` en `finally`; `decoder.decode()` final y flush de `buffer` en EOF.
- [ ] `api.ts:141,106` un único callback terminal; no-200/body ausente distinguible.
- [ ] `api.ts:84` conservar `message`, `stream`, `processed/total/error` de `complete`; progreso `{type:"progress",message}` sin ceros.
- [ ] `api.ts:120` processId con `crypto.randomUUID()`.
- [ ] Tests que ejecuten `streamProcess` y `useProcessStream` con fetch simulado (rechazo, no-200, chunk partido, cancel, desmontaje).
- [ ] Diseño: acento único = naranja del logo (reemplaza violeta; vista activa con acento). Indicadores FFmpeg+Python → un solo icono de estado (punto = peor estado, popover con detalle, enfocable, `aria-label`). En navegador Python = `unknown`, no `warn`.
- [ ] `useView.ts:11` canonicalizar hash inválido. ⌘K: sin encabezados de grupo.
- Formato de reporte del ejecutor: ≤200 palabras, gates solo con código de salida, detalle en archivo.

### F2..F7 — Vistas (orden por estabilidad del back)
- [ ] F2 Converter

### F3 — BPM / Key (después de F1.0)
- [ ] Contrato seguro conforme INS-2026-005, INS-2026-010, INS-2026-002 e INS-2026-011: mostrar BPM anterior, BPM calculado y diferencia; permitir editar y aceptar; ofrecer **Guardar seleccionados** y **Guardar todos** como acciones explícitas.
- [ ] Escribir el tag BPM correcto por formato: MP3 `TBPM`, FLAC/Vorbis `BPM`, MP4/M4A `tmpo`. Investigar AIFF/WAV antes de afirmar soporte.
- [ ] Preservar tags, carátula, permisos y fechas; crear un respaldo o reemplazo recuperable; releer desde disco y reportar el resultado por archivo.
- [ ] Gate con fixtures por formato: no modificar audio real, relectura independiente y QA supervisado en Serato usando copias.
- [ ] F4 Stems
- [ ] F5 Metadata
- [ ] F6 Sets (incluye Style Matcher)
- [ ] F7 Settings + dependencias — **esperar a que Codex cierre P0**

**Gate por vista:** paridad funcional con la vista vieja contra backend real + captura en Electron + revisión adversarial (`gpt-5.6-sol`).

### F8 — Clasificador
- [ ] Diseñado sobre el flujo P2 `seleccionar → analizar → revisar → ordenar → deshacer`. **Esperar P1/P2 de Codex.**

### F9 — Corte
- [ ] `serveFile()` (`src/server.js` ~L712): MIME `.woff2`, `.woff`, `.json`, `.webp`, `.ico`.
- [ ] `src/server.js:21` sirve `web/dist` en vez de `ui/`; `package.json` `build.files` incluye `web/dist/**/*`; script raíz `build:web`.
- [ ] Borrar `ui/` tras QA manual en Electron. **Solo cuando Codex haya terminado con `src/server.js` y `electron/`.**

**Gate:** app empaquetada abre la UI nueva offline; tests raíz pasan.
