# MusicKind — Qué falta y qué ya está hecho

> Última actualización: 2026-05-02 (rev 17)
> Este archivo es la fuente de verdad del avance. PROJECT_STATE.md tiene el contexto de arquitectura.

---

## Decisión de plataforma

**La app es Electron-only.**
El servidor Node.js en puerto 3030 sigue existiendo, pero solo como backend embebido que Electron arranca automáticamente. `npm run dashboard` queda solo para debug.

---

## DECISIÓN ARQUITECTÓNICA CERRADA (2026-04-30)

**Style Matcher se absorbe dentro de Set Creator. El tab `#tab-style` se elimina.**

| Elemento | Antes | Después |
|---|---|---|
| `#tab-style` | Tab independiente | **Eliminado** |
| `style_analyzer.py` | Backend de Style Matcher | **Renombrado/reusado** como motor de Set Creator evolucionado |
| `/api/style-match` | Endpoint independiente | **Eliminado** (Set Creator usará un nuevo endpoint o evolucionará `/api/set-create`) |
| `Set Creator` | Scoring simple de pack vs colección | **Evolucionado**: 3 perfiles de ADN (warmup/peak/closing) → cada track nuevo recibe 3 scores |
| `Nav sidebar` | 8 tabs | **7 tabs** (quitar Style Matcher) |

**Por qué:** Style Matcher genérico responde "¿encaja en mi gusto?". Set Creator evolucionado responde "¿en qué parte de mi set va esto?" — que es la pregunta real del DJ. Ninguna app hace esto.

**Qué NO cambia:** `stem_separator.py`, Stem Separator tab, todos los demás tabs.

---

## Principios de UX (no repetir, no omitir)

| Principio | Regla |
|---|---|
| **Carpeta de salida única** | Solo se define en Settings (`#cfg-output-dir`). Ningún tab tiene su propio selector de output. |
| **Un selector de entrada por tab** | Cada tab tiene su propio drop zone de entrada. No se comparten. |
| **Sin configuración duplicada** | Si algo puede leerse de Settings, no se vuelve a pedir en el tab. |

---

## Visión del producto — qué es MusicKind realmente

El núcleo de la app es el **Set Creator evolucionado**: la única herramienta que aprende la *intención* del DJ por sección (warmup / peak / closing) y encuentra canciones que encajan en cada momento específico del set.

### El problema que resuelve
Un DJ tiene cientos de canciones. No sabe qué track meter en su warmup vs su peak sin escucharlos todos. El género y BPM son guías superficiales. Lo que define si una canción "encaja" en un momento del set es su ADN sonoro completo comparado contra las canciones que el DJ ya sabe que van ahí.

### Cómo funciona (visión técnica)
1. **Fase de aprendizaje**: el usuario carga sus canciones favoritas (su colección de referencia). La app extrae el "ADN sonoro" de cada una usando librosa:
   - **MFCCs** (Mel-frequency cepstral coefficients) → timbre, color del sonido, textura
   - **Chroma features** → melodía, armonía, tonalidad
   - **Spectral centroid + rolloff** → brillo, presencia de agudos
   - **Zero crossing rate** → percusión, densidad del snare
   - **RMS energy** → energía, intensidad
   - **Tempo + beat strength** → ritmo, groove
   - **Spectral contrast** → separación entre peaks y valleys (define si hay bass pesado o melodía aérea)
2. **Perfil de estilo**: se agrega el vector de features de toda la colección de referencia → un "perfil de gusto" numérico
3. **Scoring de canciones nuevas**: para cada canción nueva, extraer el mismo vector → calcular similitud (coseno o distancia euclidiana) contra el perfil → score 0-100%
4. **Output**: tabla ordenada por score — qué canciones encajan y cuánto, con las razones

**Esto ES posible con librosa + numpy**. El `run_classification.py` ya hace algo similar pero más simple.

---

## Qué ya está funcionando ✅

### Infraestructura
- [x] Electron: single-instance lock, lifecycle limpio, ELECTRON_RUN_AS_NODE
- [x] Backend Node.js arranca automáticamente, espera a que esté listo
- [x] FFmpeg: check + instalador automático (macOS Homebrew / Windows winget/choco)

### SSE / Procesos
- [x] Headers SSE correctos, cancel/pause/resume en todos los tabs
- [x] Error surfacing: `data.error` en evento `complete` — Classifier, Converter, Set Creator, BPM

### Tabs
- [x] **Genre Classifier**: progreso, chips, pause/resume (SIGSTOP/SIGCONT), cancel, dock fix
- [x] **Genre Classifier — calidad**: tags ID3 antes de Spotify; variantes Afro House + Melodic Techno
- [x] **Genre Classifier — fallback BPM**: `classifyFromBpm(bpm)` + `spawnSync` en cli.js (CODEX_TASK_04 — ✅ verificado)
- [x] **Converter**: progreso Python corregido, error surfacing, sin selector de output propio (CODEX_TASK_05 — ✅ verificado)
- [x] **Set Creator**: progreso Python corregido, error surfacing, sin selector de output propio (CODEX_TASK_05 — ✅ verificado)
- [x] **BPM**: tabla de resultados renderiza, error surfacing
- [x] **Metadata**: formulario HTML completo — botón ✎ por archivo, GET /api/metadata popula form, Guardar/Cancelar

### Otros
- [x] audio-ingestion: Tests 4/4 | metadata-editor: Tests 11/11
- [x] Settings: API keys + defaultOutputDir (única fuente de verdad de la carpeta de salida)
- [x] Toggle de idioma ES/EN, cache Spotify/LastFM

---

## Features completados ✅

| Feature | Task | Estado |
|---|---|---|
| pause/resume/cancel Classifier | CODEX_TASK_01 | ✅ |
| Tags ID3 + variantes géneros | CODEX_TASK_02 | ✅ |
| Formulario HTML Metadata Editor | CODEX_TASK_03 | ✅ |
| Fallback BPM local en cli.js | CODEX_TASK_04 | ✅ verificado |
| Output dir unificado en Settings | CODEX_TASK_05 | ✅ verificado |
| Style Matcher (style_analyzer.py + /api/style-match + #tab-style) | CODEX_TASK_06 | ✅ verificado |
| Stem Separator (stem_separator.py + /api/stem-separate + #tab-stems) | CODEX_TASK_07 | ✅ verificado |
| Bug applyLanguage: selección por data-tab en vez de índice | CODEX_TASK_08 | ✅ verificado |
| Absorber Style Matcher en Set Creator (3 perfiles + /api/set-analyze) | CODEX_TASK_09 | ✅ verificado 2026-04-30 |
| Stem Separator UX: un archivo a la vez, dos botones resultado | CODEX_TASK_10 | ✅ verificado 2026-05-01 |
| i18n archivos separados (es.js + en.js) | CODEX_TASK_11 | ✅ verificado |
| UI redesign: violet/cyan, pulse, breathing-border | CODEX_TASK_12 | ✅ verificado |
| i18n infra: tr(), applyLanguage(), data-i18n base | CODEX_TASK_13 | ✅ verificado 2026-05-02 |
| i18n HTML: 129 data-i18n en index.html, 196 claves en i18n files | CODEX_TASK_14 | ✅ verificado 2026-05-02 |
| Seguridad: config/settings.json fuera de git, settings.example.json | CODEX_TASK_15 | ✅ verificado 2026-05-02 |
| Limpieza repo: plan.md, .m3u, guide.txt, README_improved eliminados | CODEX_TASK_16 | ✅ verificado 2026-05-02 |
| Python multiplataforma: getPythonCmd() + demucs en requirements.txt | CODEX_TASK_17 | ✅ verificado 2026-05-02 |
| Setup Assistant: overlay primera ejecución (Python/pip/FFmpeg) | CODEX_TASK_18 | ✅ verificado 2026-05-02 |
| Manual de usuario reescrito para no técnicos (MANUAL_USUARIO.md) | CODEX_TASK_19 | ✅ verificado 2026-05-02 |
| Shazam real: reemplazar AudD por shazamio (Python, sin API key) | CODEX_TASK_20 | ✅ verificado 2026-05-02 |

---

## Revisiones del usuario — ruta de trabajo (en orden)

---

### REV-1 ✅ — Bug navegación `applyLanguage` — COMPLETADO (CODEX_TASK_08 — verificado 2026-04-30)

**El bug:** `applyLanguage()` en `app.js` L1884-1904 asigna texto a los nav buttons **por índice de posición** (navBtns[0]…navBtns[5]). Al agregar Style Matcher y Stems se añadieron 2 botones nuevos antes de Settings, desplazando todos los índices. Resultado:
- `navBtns[5]` = botón Style Matcher → recibe el label `t.settings` ("Configuracion")
- El usuario hace clic en lo que parece "Configuracion" → ve el tab de Style Matcher (dos inputs de carpeta), que confunde con el Set Creator
- El botón real de Settings nunca recibe su label de la función

**Impacto arquitectónico:** Un solo cambio en un solo archivo (`app.js`) resuelve el problema. No toca server, ni Python, ni HTML.

**Fix requerido:**
1. Agregar claves `style` y `stems` a ambos objetos de traducción (`es` y `en`) en `app.js` L1-27
2. Reescribir `applyLanguage()` para seleccionar botones por `[data-tab='X']` en vez de por índice

**Archivos:** `ui/app.js` únicamente.

---

### REV-0 ✅ — Absorber Style Matcher en Set Creator — COMPLETADO (CODEX_TASK_09 — verificado 2026-04-30)

**Qué se hizo:**
- `#tab-style` eliminado de HTML, `panels`, traducciones y bloque JS completo
- `/api/style-match` eliminado de server.js
- `style_analyzer.py` extendido con modo `--multi-reference` (`--warmup/--peak/--closing/--input`)
- Nuevo endpoint `/api/set-analyze` en server.js
- `#tab-sets` rediseñado: 4 drop zones + tabla 5 columnas (Pista / Warmup% / Peak% / Closing% / Mejor sección)
- Set Creator lógica reescrita en app.js con `renderSetResults()`
- 7 tabs en total, sidebar sin "Style Matcher"

---

### REV-2 — UX Stem Separator: canción por canción `[CODEX_TASK_10 — PRIORIDAD MÁXIMA]`

**El problema:** La implementación actual pide una carpeta y produce una tabla. El usuario quiere el flujo de [vocalremover.org](https://vocalremover.org): cargas UNA canción → la app separa → aparecen DOS botones de descarga independientes (uno para acapella, otro para instrumental). Así puedes elegir qué extraer de cada canción individualmente.

**Impacto arquitectónico:**

| Capa | Cambio |
|---|---|
| `stem_separator.py` | **No cambia.** Ya acepta `--files <un_archivo>` y produce `{"files": ["..._vocals.wav", "..._instrumental.wav"]}` |
| `src/server.js` | **No cambia.** El endpoint ya soporta `files[]` con un solo elemento |
| `electron/main.cjs` | **Nuevo handler IPC:** `ipcMain.handle('show-in-folder', (_, p) => shell.showItemInFolder(p))` |
| `electron/preload.cjs` | **Nueva función expuesta:** `showInFolder: (path) => ipcRenderer.invoke('show-in-folder', path)` |
| `ui/index.html` `#tab-stems` | **Rediseño completo del HTML del tab:** quitar carpeta de entrada y radios de modo → poner drop zone de archivo único (`openFiles` en Electron) + selector de formato WAV/MP3 + zona de resultado con dos botones (Acapella / Instrumental) |
| `ui/app.js` stems section | **Reescribir lógica:** cargar un archivo → enviar `{files: [archivo], stems: "both", ...}` → al recibir `type: result` mostrar los dos botones con `showInFolder()` |

**Nueva UX del tab:**
```
┌─────────────────────────────────────┐
│ Stem Separator                      │
│ Arrastra aquí una canción           │
│ [nombre del archivo seleccionado]   │
│                                     │
│ Formato: [WAV ▾]                   │
│                                     │
│ [Separar stems]  [Cancelar]        │
│                                     │
│ ████████████████████ 100%          │
│ Separando: song.mp3...              │
│                                     │
│ ┌──────────┐  ┌──────────────────┐ │
│ │ 🎤 Voz   │  │ 🎵 Instrumental  │ │
│ │ Abrir    │  │ Abrir            │ │
│ └──────────┘  └──────────────────┘ │
│ Guardados en: /ruta/output/         │
└─────────────────────────────────────┘
```

---

### REV-3 — i18n: separar traducciones en archivos propios `[CODEX_TASK_11]`

**El problema:** Las traducciones están inline en `app.js` L1-27 y solo cubren los 6 tabs originales. Al crecer a 8 tabs (y más contenido por tab), el objeto `translations` en app.js se vuelve inmanejable.

**Impacto arquitectónico:**

| Elemento | Cambio |
|---|---|
| `ui/i18n/es.js` | Nuevo archivo. `window.MK_LANG_ES = { ... }` con todas las claves ES |
| `ui/i18n/en.js` | Nuevo archivo. `window.MK_LANG_EN = { ... }` con todas las claves EN |
| `ui/index.html` | Agregar `<script src="./i18n/es.js">` y `<script src="./i18n/en.js">` antes de `app.js` |
| `ui/app.js` | Reemplazar `const translations = {...}` (L1-27) por `const translations = { es: window.MK_LANG_ES, en: window.MK_LANG_EN }` |
| `ui/app.js` `applyLanguage` | Usar la función corregida de REV-1 (ya selecciona por data-tab) |

**Regla de contenido de los archivos i18n:** Cada clave debe cubrir todos los tabs incluyendo `style` y `stems`. Las claves inline de UI (textos de botones, placeholders) que no cambian con idioma quedan en el HTML.

**Dependencia:** Hacer después de REV-1 (CODEX_TASK_08) porque comparte la reescritura de `applyLanguage`.

---

### REV-4 — UI Redesign: interfaz para amantes de la música `[CODEX_TASK_12]`

**Feedback del usuario (2026-05-01):**
- Colores "muertos" — necesita energía de DJ (vibra, movimiento)
- Settings tab: separación entre secciones muy pegada
- Drop zones necesitan breathing animation al arrastrar
- Progress bar sin vida — debe pulsar

**Paleta nueva:** `--accent: #8b5cf6` (violet eléctrico) · `--accent-2: #22d3ee` (cyan) · `--accent-3: #f59e0b` (amber) · `--danger: #ef4444` (rojo para Cancel).

**Archivos:** `ui/styles.css` únicamente. Ver `CODEX_TASK_12.md` para spec completa.

---

### REV-5 — i18n completo: traducir TODA la UI `[CODEX_TASK_13]`

**El problema:** `applyLanguage()` solo cambia 9 strings (nav labels, hero, sidebar note). El resto de la app — botones, labels, placeholders, mensajes de estado — está hardcodeado en español. Al cambiar a EN, el 80% del texto queda en español.

**Approach:**
1. Agregar atributo `data-i18n="clave"` a cada elemento de texto en `ui/index.html`
2. Agregar `data-i18n-placeholder="clave"` a los `<input>` con placeholder
3. Expandir `ui/i18n/es.js` y `ui/i18n/en.js` con todas las claves nuevas
4. Reescribir `applyLanguage()` en `app.js`:
   ```js
   function applyLanguage(lang) {
     const t = translations[lang] || translations.es;
     document.querySelectorAll('[data-i18n]').forEach(el => {
       if (t[el.dataset.i18n]) el.textContent = t[el.dataset.i18n];
     });
     document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
       if (t[el.dataset.i18nPlaceholder]) el.placeholder = t[el.dataset.i18nPlaceholder];
     });
     localStorage.setItem('musickind-lang', lang);
   }
   ```
5. Los mensajes dinámicos en app.js (status, errors) también se traducen usando `t.clave` en cada `textContent =` hardcodeado.

**Dependencia:** Después de CODEX_12 (no bloquea pero evita conflictos).

---

## Roadmap visual actualizado

```
COMPLETADO ✅              PENDIENTE — FASE RELEASE (en orden)
──────────────────────     ──────────────────────────────────────────────────────────────
Genre Classifier           QA manual completo en Electron (macOS + Windows)
Converter                  E2E manual en Electron en Mac + Windows ★ SIGUIENTE
BPM Analyzer               Build & packaging test (npm run build → .dmg + .exe)
Metadata Editor            
Stem Separator             
Set Creator evolucionado ✅ 
i18n archivos separados ✅  
UI Redesign ✅ (CODEX_12)   
i18n infra ✅ (CODEX_13)    
Python multiplataforma ✅ (CODEX_17)
Setup Assistant ✅ (CODEX_18)
Manual usuario ✅ (CODEX_19)
Shazam real ✅ (CODEX_20)

ELIMINADO                  
──────────────────────     
Style Matcher (tab)  ✂️    → su core vive dentro de Set Creator evolucionado
```

---

## Estado del proyecto

```
Infraestructura Electron   ████████████ 100%
SSE / Procesos             ████████████ 100%
Navegación (applyLanguage) ████████████ 100%  ✅ CODEX_08
Set Creator evolucionado   ████████████ 100%  ✅ CODEX_09
Stem Separator UX          ████████████ 100%  ✅ CODEX_10
i18n archivos separados    ████████████ 100%  ✅ CODEX_11
UI / Diseño                ████████████ 100%  ✅ CODEX_12
i18n infra (tr/apply/files)████████████ 100%  ✅ CODEX_13
i18n HTML (data-i18n)      ████████████ 100%  ✅ CODEX_14
Seguridad (settings.json)  ████████████ 100%  ✅ CODEX_15
Limpieza repo              ████████████ 100%  ✅ CODEX_16
Python multiplataforma     ████████████ 100%  ✅ CODEX_17
Setup Assistant            ████████████ 100%  ✅ CODEX_18
Manual de usuario          ████████████ 100%  ✅ CODEX_19
Shazam (shazamio)          ████████████ 100%  ✅ CODEX_20
Build & packaging (.dmg/.exe)░░░░░░░░░░  0%  ← siguiente bloque release

App lista para release     ████████████ 95%
```

---

## Arquitectura de distribución — qué viene bundleado y qué no

| Dependencia | Viene en el instalador | Instalación por el usuario |
|---|---|---|
| **Node.js / Runtime JS** | ✅ electron-builder lo bundlea | — |
| **Python 3.8+** | ❌ No se puede bundlear fácilmente | Setup Assistant lo detecta y guía la descarga |
| **librosa, numpy** | ❌ Requieren pip | Setup Assistant los instala automáticamente (pip) |
| **demucs + PyTorch** | ❌ ~2 GB — impráctido bundlear | Setup Assistant los instala automáticamente; avisa que tarda |
| **FFmpeg** | ❌ | App lo instala via brew (Mac) o winget (Windows) desde Settings |

### Por qué Python no se bundlea
PyInstaller puede congelar scripts Python en binarios, pero requeriría convertir los 4 scripts
(bpm_analyzer, style_analyzer, stem_separator, run_classification) en ejecutables separados,
reescribir los spawns en server.js para usar esas rutas, y aumenta el tamaño del instalador
~500 MB. Se evalúa como mejora futura, no para v1.

### Flujo de usuario nuevo (desde cero)
1. Descarga `MusicKind-setup.exe` o `MusicKind.dmg`
2. Instala normalmente (doble clic)
3. Abre la app → aparece Setup Assistant
4. Si Python no está: guía al usuario con link a python.org
5. Si Python está pero faltan paquetes: instala automáticamente con pip
6. FFmpeg: instalación automática desde dentro de la app (Settings)
7. Usuario entra a la app completamente funcional

---

## Reglas para esta fase

1. No duplicar configuración entre tabs — Settings es la fuente de verdad.
2. Leer líneas exactas antes de editar `app.js` o `index.html`.
3. `applyLanguage()` DEBE usar `querySelector("[data-tab='X']")`, nunca índices de array.
4. Correr tests después de cualquier cambio en `metadata_editor.js` o `audio-ingestion`.
