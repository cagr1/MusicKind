# ESTADO REAL Y ORDEN ÚNICO (2026-09-25, conciliado por el cerebro contra código y commits)

> Manda sobre todas las casillas de abajo (las de 13-sep quedaron sin marcar aunque se hicieron en otros lotes). Estado vivo: `NEXT.md`.

## Casillas viejas ya resueltas (evidencia)
| Ítem viejo | Estado | Dónde |
|---|---|---|
| P0 `fpcalc` sin asumir Homebrew | **Resuelto al empaquetar**: fpcalc 1.5.1 va dentro de la app (P1 punto final). El botón "Instalar Chromaprint" (brew/winget) queda solo para desarrollo | `467a33d`, `electron/main.cjs:291` |
| P1 quitar Spotify | Hecho | `c474104` |
| P1 género embebido primero + fuente | Hecho (`genreSource`) | E1 `0ee9157` |
| P1 alias sin lista rígida | Hecho: catálogo Discogs + aprendido | G1 `e490eed` |
| P1 fuentes externas solo para lo faltante, con trazabilidad | Hecho (Discogs/Last.fm/Deezer) | Back 4, E2.2 |
| P1 BPM no decide género | Hecho en el método recomendado (etiquetas); solo el método "online" viejo lo usa | E1 |
| P1 evaluar modelo local | Medido y descartado (audio ≈ azar en subgéneros) | E0 |
| P1 casos no confiables → Por revisar | Hecho | E1/G1 |
| P2 analizar sin mover, tabla, filtros, corregir individual/lote, aplicar aprobados, manifiesto, deshacer | Hecho | E2/E3/E3.1 `5b528a1` |
| P4 rediseño | Hecho (web/ React) | Front 1/2, Lotes 3–5 |
| F1/F1.1 capa de datos (abort, randomUUID, releaseLock, cancel) | Hecho | `web/src/lib/api.ts` |
| F1.0 ruta absoluta al arrastrar | Hecho (`getPathForFile`) | `e0c0424` |
| F2 Convertidor · F4 Stems · F5 Metadata · F6 Sets · F7 Settings · F8 Clasificador | Hechas | Front 2, C2, G1 |
| F9 servir `web/dist` y MIME | Hecho (F9a) | NEXT punto 5 |

## Abiertos reales de las listas viejas
- P1 **AcoustID dentro del clasificador** para archivos sin artista/título (caso `track01.mp3` → hoy va a Por revisar).
- P1 separar género de pista vs de artista (Last.fm por artista se usa como respaldo; falta marcarlo distinto).
- P2 reanudar trabajos grandes / no reclasificar lo ya procesado.
- P0 fijar versiones de dependencias Python → se resuelve en D1 (Python propio).
- F3 BPM: "Guardar seleccionados / Guardar todos" y escritura por formato con relectura (hoy se guarda de a una desde el Inspector).
- F9 borrar `ui/` tras QA manual de Carlos en Electron.
- P3 QA manual en Electron (Carlos) y medición en bibliotecas grandes (señales: 980 pistas en 2–3 min; vista previa de 884 en 35 s).
- Informativo, sin acción: BPM Serato vs MusicKind.

## Orden único de trabajo
1. **Creador de sets (la estrella)** — secciones de abajo, versión mínima útil:
   S1 afinidad honesta → S3 motor de secuencia (BPM + Camelot + fijar/excluir + duración + **recorrido**: suave, ascendente,
   intenso, cierre, expresado por progresión de BPM mientras no exista energía validada) → S4 editor y escucha → S5 exportar
   el orden exacto → **validación de Carlos escuchando 2–3 sets** (sustituye al S0 formal; S0 completo solo si hay dudas).
2. Abiertos cortos: AcoustID en el clasificador · BPM guardar en lote (F3) · G2 Configuración → Géneros.
3. Continuidad: S2 caché de análisis (si 1.000 pistas tarda) · S6 sesión que sobrevive al cierre · "Preparar set" desde el Clasificador.
4. Entrega: D1 = P2/P3 del punto final (Python propio, .dmg arm64/x64, release **con OK de Carlos**) · QA en la MacBook Pro 2017 (Ventura) · borrar `ui/`.
5. Cuando haya usuarios: S7 piloto 3–5 DJs · E1 energía estimada (experimento, no bloquea).

Descartado (costo > aporte): E0b sugerir género con modelo entrenado; S0 formal con 30–60 pistas antes de construir.

---

# MusicKind — Plan de corrección

> Plan de producto añadido el 2026-09-25: ver **«Evolución de producto — preparación de sets»** al final. Para este trabajo manda esa sección; las listas de septiembre 13 se conservan como historial y no deben interpretarse como tareas aún pendientes. `NEXT.md` sigue siendo la fuente de estado.

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

> **2026-09-23:** F1–F8 se ejecutan según `design/SPEC.md` (Back 1 · Back 2 · Front 1 · Front 2), con `design/prototype/` como referencia visual.

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

---

# Evolución de producto — preparación de sets (2026-09-25)

**Estado: plan documentado, implementación no iniciada.** Carlos pidió detallar cómo llegar a las mejoras propuestas. Esta petición autoriza la documentación; no reanuda P2/P3 de distribución ni autoriza publicar. Una fase por unidad de trabajo.

## Objetivo y primera entrega útil

Preparar una selección musical desde una biblioteca propia: importar → revisar → clasificar → construir un set editable → escuchar → exportar. El DJ conserva la decisión sobre selección, orden y carácter musical.

Primera entrega completa: escoger canciones, indicar duración aproximada, obtener una secuencia propuesta por BPM/Camelot, fijar canciones, reordenar, escuchar y exportar exactamente ese orden. La energía automática se incorpora solo después de validarla; no bloquea una primera versión útil con energía asignada por el DJ o sin ese criterio.

No se incluye en este ciclo: mezcla automática, beatgrids, puntos de mezcla/cues automáticos, nuevos modelos de género, entrenamiento de redes, streaming, sincronización cloud, nuevas funciones de stems ni formatos propietarios de bibliotecas DJ. La compatibilidad M3U8 se comprobará en la aplicación de destino elegida para QA antes de prometerla.

## Responsabilidades: el modelo fuerte dirige y verifica

Se aplica el protocolo de delegación existente en `CLAUDE.md` y el pedido explícito de Carlos; no se añaden hooks ni skills.

1. **Cerebro:** leer el código, delimitar una fase, redactar su spec con archivos/líneas vigentes, contratos, exclusiones y gates. Puede editar documentación, observar la app y ejecutar comandos de inspección/verificación. No escribe código de producto, pruebas, scripts ni arreglos.
2. **Ejecutor Luna:** implementar únicamente la fase delegada, incluidas sus pruebas. No modificar `NEXT.md`, `plan.md`, specs ni hacer commits. Comando de referencia del proyecto: `codex exec -m gpt-6-luna --approve-for-me "Implementa únicamente la fase indicada de design/SPEC.md; respeta exclusiones y entrega diff y resultados" < /dev/null`. El cerebro debe sustituir «fase indicada» por el identificador exacto y comprobar que la CLI admite los argumentos antes de usarla.
3. **Cerebro:** leer todos los hunks y archivos nuevos; correr los gates con sus propios comandos. El resumen del ejecutor y su exit 0 no constituyen evidencia. Revisar contra la spec, probar el flujo real sobre copias y guardar resultados.
4. **Si falla:** registrar caso reproducible y salida real, ajustar la spec y re-delegar a Luna; escalar a Terra si el fallo persiste. El cerebro no teclea el arreglo.
5. **Cierre:** review del diff de la fase, anotar evidencia y pendientes en `NEXT.md`; commit solo si Carlos lo pide. No adjudicar a la fase cambios previos del working tree.

Antes de cada delegación registrar `git status --short` y diff base. Hay cambios previos en clasificador, proveedores, servidor, traducciones y spec. Si la fase necesita alguno de esos archivos, describir los hunks que puede modificar y revisar que conserve el resto. Las líneas de este plan son anclas leídas el 2026-09-25: actualizar las anclas en la spec de cada fase.

## Evidencia de partida y límites

| Evidencia | Implicación para la implementación |
|---|---|
| `src/style_analyzer.py:78` calcula percentiles de distancia y siempre elige una sección si hay referencias, incluso con puntuaciones cero. | Afinidad no equivale a probabilidad de acierto; admitir abstención y conservar las razones. |
| `src/style_analyzer.py:171` ordena por afinidad. `web/src/views/Sets.tsx:40` agrupa por sección. | Falta un motor de secuencias que evalúe relaciones entre canciones. |
| `web/src/views/Sets.tsx:54` y `:508` representan afinidad bajo la etiqueta energía. | Corregir el significado antes de presentar una curva de energía musical. |
| `src/set-playlists.js:45`, `:61`, `:87` ya ordenan por BPM y exportan tres playlists por carpetas/géneros. | Reutilizar formato/validación donde convenga, pero ofrecer exportación de una lista ordenada explícita que no se vuelva a ordenar. |
| `web/src/lib/process.tsx:32` mantiene resultados en memoria. | Para continuar tras cerrar la app hace falta persistencia de la sesión, con versión de esquema. |
| `scripts/eval_sets.py:18` usa carpetas deep house, Tech house y minimal/deep tech. | El 44,7 % registrado en NEXT mide separación de esas colecciones; no mide calidad de transiciones ni acierto warmup/peak/closing. No usarlo como precisión de un set. |
| NEXT registra 980 canciones clasificadas en 2–3 min por Carlos. | Señal de utilidad en su biblioteca; falta validación independiente. No es un benchmark reproducido en esta sesión. |

Esta planificación verificó código, no ejecutó benchmarks ni QA de audio. No presupone que las métricas históricas se reproduzcan en otro equipo o colección.

## Orden y dependencias

`S0 contrato y muestra → S1 semántica → S2 datos → S3 secuencias → S4 edición/escucha → S5 exportación → S6 continuidad → S7 piloto`.

`E1 energía estimada` es una rama opcional después de S2 y de obtener etiquetas humanas en S0; solo entra en el motor si supera su gate. `D1 distribución` depende de autorización posterior para reanudar P2/P3; un piloto externo sin entorno preparado requiere D1. La evaluación local supervisada puede precederla.

## S0 — Contrato musical y conjunto de evaluación

**Cerebro prepara:** spec de primera entrega en `design/SPEC.md`, partiendo de `web/src/views/Sets.tsx:18`, `src/server.js:705`, `src/style_analyzer.py:78` y `scripts/eval_sets.py:18`. No cambiar aún el motor.

- Definir dos entradas: carpeta o selección explícita de pistas. Referencias personales opcionales para la futura secuencia; el análisis de afinidad existente conserva su contrato.
- Definir duración objetivo como suma de duraciones completas, rotulada «duración de pistas». No prometer duración real de actuación: depende de solapes y puntos de mezcla que esta versión no conoce.
- Fijar semántica: «imprescindible» obliga a incluir; «posición fijada» impide mover; «excluida» no puede regresar; cambio manual de sección/energía prevalece sobre sugerencias.
- Preparar 30–60 pistas diversas y 20–30 pares para escucha, con identidad de versiones/remixes y grupo de duplicados. Anotar BPM/key disponibles, decisiones de DJ, pares aceptables y motivo del rechazo. No inferir warmup o peak directamente del género.
- Separar pistas/grabaciones de ajuste y evaluación para que versiones de la misma canción no aparezcan en ambos grupos. Las referencias tampoco pueden incluir la pista evaluada.
- Registrar propuestas de éxito antes de ajustar pesos: cero restricciones duras violadas; exportación fiel; comparar aceptación por escucha frente a orden BPM. El umbral musical se fija con el piloto, no se inventa una precisión garantizada.

**Gate:** contratos sin ambigüedad, fixtures definidos y protocolo reproducible. Si faltan juicios humanos, documentar ese pendiente: los tests técnicos no lo sustituyen. La implementación técnica puede continuar con fixtures, pero no se declara validación musical.

## S1 — Afinidad honesta y estados por revisar

**Delegar:** `src/style_analyzer.py:78`, `web/src/views/Sets.tsx:35`, `:54`, `:508`, `tests/test_style_scoring.py`, `web/src/views/Sets.test.ts`, traducciones `web/src/i18n/{es,en}.json`.

- Presentar los puntajes como afinidad relativa a las referencias; quitar el símbolo de probabilidad o explicar la escala en el Inspector. La curva actual se etiqueta afinidad o se retira de la zona de energía hasta E1.
- Añadir estado de revisión con motivos: ausencia de datos, referencias insuficientes, puntuaciones todas cero o empate ambiguo. Mantener visibles esas pistas aunque `best` sea null; hoy agrupar solo tres secciones puede ocultarlas.
- Umbrales adicionales se calibran con S0; no colocar un corte arbitrario como supuesto nivel de confianza. Conservar puntajes y tamaño de muestra para diagnóstico.
- Mantener diferenciadas fuentes: tag, análisis y corrección manual. No sobrescribir tags al analizar.

**Gate:** cero y empate no fuerzan una clasificación presentada como fiable; ninguna fila desaparece; labels ES/EN coherentes; tests de scoring y vista más gates web. QA del cerebro sobre entradas con y sin referencias suficientes.

## S2 — Datos de pistas reutilizables

**Delegar:** integrar desde `src/server.js:705`, `src/style_analyzer.py:27`, `src/services/audio-discovery.js`, `src/python-env.js:7`; crear módulos acotados `src/set-track-data.js` y `web/src/lib/set-session.ts` (nuevos, línea 1). Revisar lectores actuales antes de duplicar extracción.

- Contrato versionado por pista: id, ruta, título/artista, duración, BPM original, BPM usado para comparar, Camelot, fuente por campo, afinidades y estado; energía nullable con fuente/manual. Ausencia se representa con null, nunca cero inventado.
- Descubrimiento de carpeta desde el servicio canónico; una selección explícita no debe expandirse a toda su carpeta ni exigir mover música.
- Cachear análisis por ruta canónica, tamaño, mtime, versión del algoritmo y parámetros/ventana. Invalidar al cambiar archivo o algoritmo. No reutilizar una puntuación de afinidad si cambió el conjunto de referencias.
- Almacenar caché dentro del directorio de datos de la app, usando su resolución existente. Registrar fallos por pista; cancelación conserva resultados completos y no los marca todos como terminados.
- Evitar decodificar de nuevo solo para obtener datos que ya produjo el análisis. Medir primero y decidir después cualquier paralelismo para no saturar memoria.

**Gate:** segunda lectura sin cambios usa caché; cambio de archivo/parámetro la invalida; selección respeta exactamente las rutas; corruptos/faltantes tienen resultado visible; analizar no altera originales. Registrar tiempo frío/caliente y memoria con 100 y 1.000 pistas, equipo y parámetros.

## S3 — Motor determinista de selección y secuencia

**Delegar:** nuevos `src/set-sequencer.js`, `tests/set-sequencer.test.js`; integración en `src/server.js` junto a `:705` mediante un endpoint separado propuesto `/api/set-sequence`. Entrada: datos analizados, duración objetivo, restricciones y preferencias. Salida: ids ordenados, duración, razones por transición y restricciones no satisfechas.

1. Validar candidatos y restricciones: ids únicos, duración positiva, pistas excluidas, obligatorias, posiciones fijadas. Si son incompatibles, devolver explicación concreta; no relajar silenciosamente.
2. Separar restricciones duras de preferencias. Obligaciones/exclusiones/fijaciones son duras. Proximidad BPM, Camelot, afinidad, variedad de artistas y trayectoria de energía son preferencias; los datos ausentes se reportan como desconocidos.
3. Comparar tempos relativos contemplando mitad/doble solo como hipótesis registrada. No reescribir el BPM del tag ni equiparar automáticamente canciones por normalizarlas al mismo rango.
4. Compatibilidad armónica inicial explícita: misma clave, vecinas de número en la misma letra con vuelta 12↔1, y A↔B del mismo número. Tratarla como heurística de selección, no como garantía audible.
5. Construir coste de transición desglosado y versionado; las razones que muestra la UI salen de los mismos componentes que decidió el motor. No asignar ventajas a datos desconocidos.
6. Crear primero baseline por BPM. Delegar después búsqueda con haz acotado que conserva varias secuencias parciales; reducir candidatos por proximidad sin perder obligatorias/fijadas. Evitar explorar todas las permutaciones. Fijar orden de desempate y límite de trabajo para reproducibilidad.
7. Elegir una secuencia cercana a la duración pedida, con tolerancia inicial propuesta de ±10 %; si no existe, devolver la mejor alternativa y la desviación visible. Sin duración suficiente o con obligatorias que exceden el objetivo, explicar la causa.
8. La fase musical puede usar secciones asignadas manualmente; no imponer que el cierre tenga menos BPM. La energía se usa solo si hay valores manuales o E1 aprobado.

**Gate:** sin duplicados ni excluidas, todas las obligatorias y fijaciones respetadas, mismo input produce mismo resultado; casos de una pista, claves nulas, 12A→1A, medio/doble tempo, conflictos y duración imposible. Medir planificación con 100/1.000 candidatos ya analizados; objetivo inicial ≤2 s/≤5 s en el equipo documentado, separado del coste de audio. Si falla, perfilar y re-delegar. La escucha compara motor y baseline sin revelar cuál es cuál.

## S4 — Editor y escucha del set

**Delegar:** `web/src/views/Sets.tsx:94`, `web/src/lib/player.tsx:34`, `web/src/lib/api.ts`, `web/src/lib/set-session.ts` nuevo y tests relacionados. Reutilizar componentes visuales existentes; no rediseñar el shell.

- Añadir duración, preferencias mínimas y acción de proponer. La tabla muestra un único orden explícito, número de pista, duración acumulada, BPM/key y revisión pendiente.
- Incluir/excluir, fijar, reordenar por arrastre y teclado, sustituir una pista por alternativas explicadas y deshacer edición. Regenerar respeta decisiones manuales.
- Inspector muestra motivos concretos entre pista anterior y actual, y datos desconocidos. Explicaciones extensas en detalle; datos/acciones principales compactos.
- Cola del reproductor, tabla y exportación consumen la misma lista ordenada. Reordenar no debe interrumpir el audio actual. Escucha secuencial; no simular una mezcla sin implementarla.
- Duración recalculada tras cada edición; estado vacío, error, cancelación y falta de candidatas visibles. Estado conservado al cambiar de pestaña.

**Gate:** crear → fijar → regenerar → reordenar → escuchar → deshacer en Electron; posición y cola coinciden; reproducción no se corta al editar; teclado y labels ES/EN revisados. El cerebro observa el flujo real y captura estados relevantes; un mock del reproductor no demuestra audio audible.

## S5 — Exportación exacta y recuperable

**Delegar:** `src/set-playlists.js:61`, `:87`, `src/server.js:227`, `tests/set-playlists.test.js`, `web/src/views/Sets.tsx`; módulo nuevo `src/set-export.js` si aislarlo simplifica el contrato.

- Crear operación separada para lista ordenada, propuesta `/api/set-export`, sin modificar el significado del endpoint existente de playlists por género. Reutilizar serialización M3U8 cuando sea compatible, sin llamar al sort por BPM.
- Vista previa de nombre/destino, orden, duración y archivos ausentes. Salida en la carpeta configurada; confirmar sustitución de archivos existentes desde la app o elegir nombre nuevo.
- Resolver rutas relativas desde la carpeta que contiene el M3U8; si el volumen/plataforma impide una ruta relativa válida, usar ruta absoluta y advertir falta de portabilidad. No copiar/mover audio automáticamente.
- Validar nombres y saltos de línea en rutas/títulos; nombre de salida no puede escapar del destino. Escritura temporal + reemplazo recuperable; no dejar playlists parciales.
- Si desaparece una pista tras la vista previa, detener exportación y ofrecer actualizarla; no omitirla silenciosamente. Preservar exactamente el orden confirmado.

**Gate:** relectura del M3U8 verifica cada ruta y orden; espacios, Unicode, archivo faltante y salida existente cubiertos. Importar en el software DJ usado para QA y comparar selección/orden. Originales intactos. Las playlists actuales del clasificador siguen pasando sus pruebas.

## S6 — Continuidad entre herramientas y sesiones

**Delegar:** `web/src/views/Classifier.tsx:572`, `web/src/lib/process.tsx:32`, `web/src/lib/set-session.ts` nuevo, servidor y módulo nuevo `src/set-session-store.js`; usar directorio de datos de `src/python-env.js:7`.

- Acción «Preparar set» sobre seleccionadas entrega ids/rutas y datos conocidos a Sets; no vuelve a clasificar ni pierde correcciones manuales. Verificar ruta actual si la clasificación movió el archivo, usando el resultado/manifiesto real de `src/classify-apply.js:77`.
- Persistir sesión con versión de esquema: candidatas, orden, exclusiones/fijaciones, preferencias, correcciones y revisión. Guardado atómico y copia recuperable; no guardar credenciales ni estado de audio en reproducción.
- Al abrir, verificar archivos disponibles y marcar los ausentes; nunca sustituir por otra canción con igual nombre. Recuperar mediante selección explícita de archivo/carpeta y nueva validación.
- No simular la reanudación de un proceso que murió: restaurar lo ya completado y ofrecer analizar pendientes. Caché válida evita recalcular.

**Gate:** seleccionar en Clasificador → preparar → editar → cerrar → abrir conserva orden y decisiones. Archivo movido/corrupto y sesión con versión no soportada generan recuperación clara. Escritura interrumpida mantiene una versión utilizable.

## E1 — Energía estimada, condicionada a evidencia

**Delegar tras S2:** experimento acotado en `src/audio_features.py:5`, `src/style_analyzer.py:27`, script nuevo `scripts/eval_set_energy.py` y pruebas. Separar experimento de la activación en UI.

- Primero recoger energía manual ordinal y comparaciones por pares de S0. Energía percibida no equivale a loudness ni BPM; RMS solo no es suficiente. El campo actual `vocal_presence` es una proporción armónica, no un detector validado de voces: no usarlo para prometer compatibilidad vocal.
- Comparar baseline BPM/RMS con combinación de densidad de ataques, componente percusivo y rasgos espectrales. Muestrear ventanas de inicio/centro/final para evitar que una intro determine toda la pista; documentar duración/coste.
- Normalizar con conjunto de ajuste fijo, versionado; conjunto de evaluación separado. Medir correlación ordinal y aciertos por pares frente a baseline, por género y por DJ, con tamaño de muestra y desacuerdos.
- Activar únicamente si mejora la evaluación reservada y la escucha lo respalda; mostrar «energía estimada» y permitir corregirla. Si no mejora, conservar energía manual y documentar resultado. No añadir modelos grandes sin una nueva decisión de alcance.

**Gate:** informe reproducible con resultados favorables o desfavorables y coste de análisis; ninguna curva usa afinidad como energía. La falta de validación bloquea activar estimación, no bloquea S3–S7.

## D1 — Distribución autosuficiente (sigue en pausa)

**Solo cuando Carlos reanude P2/P3:** partir de `electron/main.cjs:157`, `electron/runtime-path.cjs`, `src/python-env.js:7`, `src/python-install.js`, `requirements.txt`, `package.json` y la spec P1/P2/P3 vigente. Reutilizar P1 ya realizado.

- Delegar runtime Python privado, versiones reproducibles y resolución de recursos del paquete. Herramientas necesarias disponibles sin terminal; stems puede conservar descarga opcional con progreso y error recuperable.
- Evitar incluir configuración personal/secretos en el paquete; comprobar el contenido efectivo del artefacto, no solo patrones de configuración.
- Probar apertura desde Finder en macOS ARM e Intel con entorno limpio, sin depender del PATH del desarrollador. Probar primero set/análisis/conversión; registrar tamaño, primer arranque y funcionamiento offline tras instalar recursos.
- La MacBook Pro 2017 tras actualización sigue siendo el dispositivo Intel previsto. No declarar soporte de Windows/Linux por tener targets configurados sin probar artefactos allí.

**Gate:** instalar y completar el recorrido de S4/S5 en máquina limpia sin terminal; errores de instalación recuperables y logs. Publicar sigue siendo una acción separada que requiere autorización.

## S7 — Piloto de utilidad real

El cerebro diseña y observa; Carlos coordina participantes. No contactar a terceros ni enviar música sin autorización.

- 3–5 DJs, sus bibliotecas y dos sesiones comparables: preparar como acostumbran y preparar con MusicKind. Alternar orden cuando sea posible para reducir el efecto de aprendizaje.
- Tarea común: selección de duración objetivo, revisión, escucha y exportación. Observar sin guiar cada clic; registrar bloqueos, correcciones, tiempo activo y tiempo esperando análisis por separado.
- Medir canciones conservadas, transiciones aceptadas por escucha, reordenamientos, fallos de exportación, necesidad de ayuda y uso voluntario en una segunda sesión. Guardar conteos/denominadores y comentarios; no publicar porcentajes sin contexto.
- Criterio orientativo para decidir el siguiente ciclo: al menos 3 personas completan sin ayuda técnica, mayoría reduce tiempo activo, cero pérdida de archivos y mayoría vuelve a usarla. Con una muestra pequeña son señales cualitativas, no validación de mercado.
- Convertir los problemas observados en siguiente spec priorizada. No ampliar catálogo de funciones para compensar un recorrido que todavía falla.

**Gate:** informe con evidencia, limitaciones y decisión: pulir, ajustar motor o ampliar distribución. Sin usuarios/escucha real, esta fase queda pendiente.

## Verificación propia del cerebro y cierre por fase

Antes de implementar, medir el estado base; si ya falla un gate, conservar salida y distinguir fallo previo de regresión. Los siguientes comandos son el protocolo futuro; no se ejecutaron al escribir este plan:

- Node: `node --test tests/*.test.js tests/runtime-path.test.cjs` (el glob JS solo no incluye el test CJS de runtime).
- Web: `npm --prefix web run test`, `npm --prefix web run build`, `npm --prefix web run lint`, `npm --prefix web run format:check`.
- Python al tocar análisis: localizar el Python del venv real de la app; ejecutar con él `-m unittest discover -s tests -p 'test_style_scoring.py'` y `tests/test_basic.py`; agregar suite de secuencia/energía si la fase incorpora lógica Python. No usar el Python global suponiendo que tiene las dependencias.
- Al tocar metadatos/ingestión: `npm run test:metadata-editor`, `npm run test:audio-ingestion`, `npm run test:metadata-endpoint`.
- Revisión: `git diff --check`, lectura del diff y de nuevos archivos, revisión de contratos y QA real aplicable. No cerrar audio, importación externa ni máquina limpia solo con tests simulados.

Por fase conservar: comandos y salida/código de retorno, equipo/parámetros del benchmark, casos manuales y resultado, errores conocidos y diff revisado. La evidencia local con rutas privadas no se publica; el resumen en NEXT puede enlazarla y debe distinguir «implementado», «verificado técnicamente» y «validado por escucha».

**Siguiente acción al comenzar implementación:** el cerebro prepara únicamente la spec S0/S1 con las líneas actualizadas, después delega S1. Esta sesión termina con documentación; no se inicia código, no se instala nada, no se publica ni se hace commit.
