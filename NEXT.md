# MusicKind — Qué falta y qué ya está hecho

> Última actualización: 2026-05-03 (rev 21)
> Este archivo es la fuente de verdad del avance. PROJECT_STATE.md tiene el contexto de arquitectura.

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
