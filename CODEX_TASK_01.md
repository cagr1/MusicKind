# CODEX TASK 01 — Classifier: Pause / Resume / Cancel con confirmación

> Arquitecto: Claude Code  
> Ejecutor: Codex (u otro agente)  
> Fecha: 2026-04-30  
> Estado: PENDIENTE

---

## Contexto mínimo

MusicKind es una app Electron (desktop, macOS). El tab "Clasificador por Género" lanza un proceso Node.js largo (`cli.js`) que clasifica archivos de audio. La comunicación es via SSE (Server-Sent Events).

**Reglas que no debes romper:**
- No crear archivos nuevos. Solo editar los tres archivos indicados.
- No tocar ningún otro tab ni función fuera del Classifier.
- No cambiar la lógica SSE ni el endpoint `/api/genre-classify`.
- Después de cada cambio verifica que `npm run test:metadata-editor` y `npm run test:audio-ingestion` siguen pasando (no tocan este código, pero sirven para verificar que no rompiste imports globales).

---

## Archivos a editar (solo estos tres)

1. `src/server.js` — agregar 2 endpoints nuevos
2. `ui/index.html` — agregar 1 botón
3. `ui/app.js` — modificar lógica de botones y cancel handler

---

## Cambio 1 — `src/server.js`

**Contexto:** el endpoint `/api/cancel` existe en la línea 210. El `Map` `runningProcesses` guarda los procesos activos por `processId`. Agrega los dos endpoints nuevos INMEDIATAMENTE DESPUÉS del bloque de `/api/cancel` (después de la línea 219, antes de la línea 221 que dice `// ==================== METADATA EDITOR API ====================`).

**Agregar este bloque en la línea 220 (entre cancel y metadata):**

```js
  // Pause a running process (macOS/Linux only — SIGSTOP)
  if (req.method === "POST" && url.pathname === "/api/pause") {
    const body = await readJsonBody(req);
    const processId = body.processId ? String(body.processId) : "";
    if (!processId) return sendJson(res, { ok: false, error: "processId requerido" }, 400);
    const child = runningProcesses.get(processId);
    if (!child) return sendJson(res, { ok: false, error: "proceso no encontrado" }, 404);
    try { child.kill('SIGSTOP'); } catch (e) { return sendJson(res, { ok: false, error: e.message }, 500); }
    return sendJson(res, { ok: true });
  }

  // Resume a paused process (macOS/Linux only — SIGCONT)
  if (req.method === "POST" && url.pathname === "/api/resume") {
    const body = await readJsonBody(req);
    const processId = body.processId ? String(body.processId) : "";
    if (!processId) return sendJson(res, { ok: false, error: "processId requerido" }, 400);
    const child = runningProcesses.get(processId);
    if (!child) return sendJson(res, { ok: false, error: "proceso no encontrado" }, 404);
    try { child.kill('SIGCONT'); } catch (e) { return sendJson(res, { ok: false, error: e.message }, 500); }
    return sendJson(res, { ok: true });
  }

```

---

## Cambio 2 — `ui/index.html`

**Contexto:** línea 95-96 son los botones actuales del Classifier:
```html
<button id="cls-run" class="btn primary">Clasificar ahora</button>
<button id="cls-cancel" class="btn danger hidden">Cancelar</button>
```

**Reemplazar esas dos líneas con:**
```html
<button id="cls-run" class="btn primary">Clasificar ahora</button>
<button id="cls-pause" class="btn hidden">⏸ Pausar</button>
<button id="cls-cancel" class="btn danger hidden">✕ Cancelar</button>
```

Solo agregar una línea entre las dos existentes. No mover nada más.

---

## Cambio 3 — `ui/app.js`

Este archivo tiene 1551+ líneas. Lee las líneas indicadas antes de editar.

### 3a — Declarar variable `clsPause` y estado de pausa (líneas 417-419)

**Estado actual (líneas 417-419):**
```js
const clsRun = document.getElementById("cls-run");
const clsCancel = document.getElementById("cls-cancel");
let currentProcessId = null;
```

**Reemplazar con:**
```js
const clsRun = document.getElementById("cls-run");
const clsPause = document.getElementById("cls-pause");
const clsCancel = document.getElementById("cls-cancel");
let currentProcessId = null;
let clsIsPaused = false;
```

### 3b — Mostrar `clsPause` al iniciar la clasificación (líneas 447-448)

**Estado actual:**
```js
  clsRun.classList.add("hidden");
  clsCancel.classList.remove("hidden");
```

**Reemplazar con:**
```js
  clsRun.classList.add("hidden");
  clsPause.classList.remove("hidden");
  clsCancel.classList.remove("hidden");
  clsIsPaused = false;
  clsPause.textContent = "⏸ Pausar";
```

### 3c — Reset de botones en el bloque de error (líneas 461-462)

**Estado actual:**
```js
    clsRun.classList.remove("hidden");
    clsCancel.classList.add("hidden");
```

**Reemplazar con:**
```js
    clsRun.classList.remove("hidden");
    clsPause.classList.add("hidden");
    clsCancel.classList.add("hidden");
    clsIsPaused = false;
```

### 3d — Reset de botones en el `setTimeout` final (líneas 516-521)

**Estado actual:**
```js
  setTimeout(() => {
    progressContainer.classList.add("hidden");
    clsRun.classList.remove("hidden");
    clsCancel.classList.add("hidden");
    currentProcessId = null;
  }, 2000);
```

**Reemplazar con:**
```js
  setTimeout(() => {
    progressContainer.classList.add("hidden");
    clsRun.classList.remove("hidden");
    clsPause.classList.add("hidden");
    clsCancel.classList.add("hidden");
    clsIsPaused = false;
    currentProcessId = null;
  }, 2000);
```

### 3e — Reemplazar el handler de `clsCancel` (líneas 524-536)

**Estado actual:**
```js
clsCancel.addEventListener("click", async () => {
  if (!currentProcessId) return;
  
  try {
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: currentProcessId })
    });
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});
```

**Reemplazar con:**
```js
clsCancel.addEventListener("click", async () => {
  if (!currentProcessId) return;
  const confirmed = confirm("¿Estás seguro que deseas cancelar la clasificación?");
  if (!confirmed) return;
  try {
    if (clsIsPaused) {
      await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: currentProcessId })
      });
    }
    await fetch("/api/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ processId: currentProcessId })
    });
    clsIsPaused = false;
  } catch (e) {
    console.error('Error cancelling:', e);
  }
});
```

### 3f — Agregar handler de `clsPause` INMEDIATAMENTE DESPUÉS del handler de `clsCancel` (después de la línea 536, antes de la línea 538 que dice `const analysisSlider`)

**Agregar este bloque:**
```js
clsPause.addEventListener("click", async () => {
  if (!currentProcessId) return;
  if (clsIsPaused) {
    try {
      await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: currentProcessId })
      });
      clsIsPaused = false;
      clsPause.textContent = "⏸ Pausar";
    } catch (e) {
      console.error('Error resuming:', e);
    }
  } else {
    try {
      await fetch("/api/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: currentProcessId })
      });
    } catch (_) {}
    try {
      await fetch("/api/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ processId: currentProcessId })
      });
      clsIsPaused = true;
      clsPause.textContent = "▶ Reanudar";
    } catch (e) {
      console.error('Error pausing:', e);
    }
  }
});

```

---

## Verificación después de los cambios

1. Correr `npm run electron`
2. Ir al tab "Clasificador por Género"
3. Seleccionar una carpeta con archivos de audio
4. Presionar "Clasificar ahora" → deben aparecer los botones "⏸ Pausar" y "✕ Cancelar"
5. Presionar "⏸ Pausar" → el texto debe cambiar a "▶ Reanudar" y la barra de progreso debe congelarse
6. Presionar "▶ Reanudar" → el texto vuelve a "⏸ Pausar" y el progreso continúa
7. Presionar "✕ Cancelar" → debe aparecer el `confirm()` nativo del OS
   - Si acepta → la clasificación se detiene y vuelve el botón "Clasificar ahora"
   - Si rechaza → no pasa nada, la clasificación sigue
8. Dejar que termine normalmente → el botón "Clasificar ahora" debe volver a aparecer

---

## Notas para el agente

- SIGSTOP/SIGCONT solo funcionan en macOS/Linux. En Windows el `child.kill('SIGSTOP')` lanza excepción — el try/catch del endpoint lo maneja devolviendo error 500. El botón seguirá visible pero el servidor responderá error (aceptable para MVP, la app es macOS-first).
- El `confirm()` es nativo del navegador/Electron — no requiere ninguna librería.
- No cambies los estilos CSS. El botón `clsPause` hereda la clase `btn` y se verá igual que los otros.
- Si encuentras que las líneas no coinciden exactamente con lo indicado, lee el contexto circundante antes de editar — el código puede haber cambiado. La búsqueda por contenido es más confiable que el número de línea exacto.
