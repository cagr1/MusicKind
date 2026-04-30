# CODEX TASK 03 — Formulario HTML de edición de metadatos

> Arquitecto: Claude Code
> Ejecutor: Codex
> Fecha: 2026-04-30
> Estado: PENDIENTE

---

## Contexto mínimo

El tab de Metadata en `ui/index.html` permite cargar archivos e identificarlos con Spotify, pero no tiene un formulario para editar los tags manualmente. La lógica ya existe completa en `ui/app.js` (funciones `updateMetaPreview`, `metaSave`, `metaCancelEdit`, `metaTitle`, etc.) pero las variables están hardcodeadas a `null` porque no existen los elementos HTML. El backend también ya tiene el endpoint `GET /api/metadata?file=...` que devuelve los tags del archivo.

**Reglas:**
- Editar solo los dos archivos indicados: `ui/app.js` y `ui/index.html`
- No crear archivos nuevos
- No tocar ningún tab ni funcionalidad fuera del tab de Metadata
- No cambiar la lógica de los event listeners de `metaSave`, `metaCancelEdit`, `updateMetaPreview` — solo activarlos cambiando los `null`

---

## Cambio 1 — `ui/app.js`: activar variables del editor (L885-895)

### Estado actual (líneas 885-895):

```js
const metaEditor = null;
const metaNewFilename = null;
const metaCancelEdit = null;
const metaSave = null;
const metaPreviewName = null;
const metaTitle = null;
const metaArtist = null;
const metaAlbum = null;
const metaYear = null;
const metaGenre = null;
const metaTrack = null;
```

### Reemplazar EXACTAMENTE ese bloque con:

```js
const metaEditor = document.getElementById("meta-editor");
const metaNewFilename = document.getElementById("meta-new-filename");
const metaCancelEdit = document.getElementById("meta-cancel-edit");
const metaSave = document.getElementById("meta-save");
const metaPreviewName = document.getElementById("meta-preview-name");
const metaTitle = document.getElementById("meta-title");
const metaArtist = document.getElementById("meta-artist");
const metaAlbum = document.getElementById("meta-album");
const metaYear = document.getElementById("meta-year");
const metaGenre = document.getElementById("meta-genre");
const metaTrack = document.getElementById("meta-track");
```

---

## Cambio 2 — `ui/app.js`: agregar botón "Editar" a cada fila de archivo

### Estado actual de `fileItem.innerHTML` dentro de `renderMetaFileList` (~L981-985):

```js
    fileItem.innerHTML = `
      <button class="file-item-remove" data-idx="${idx}" title="Quitar archivo">×</button>
      <span class="file-item-name">${fileName}</span>
      <span class="file-item-meta">${ext}</span>
    `;
```

### Reemplazar con:

```js
    fileItem.innerHTML = `
      <button class="file-item-remove" data-idx="${idx}" title="Quitar archivo">×</button>
      <span class="file-item-name">${fileName}</span>
      <span class="file-item-meta">${ext}</span>
      <button class="file-item-edit btn" data-path="${filePath}" title="Editar metadatos">✎</button>
    `;
```

---

## Cambio 3 — `ui/app.js`: agregar handler de click para el botón Editar

### Punto de inserción

Busca el bloque de handlers de los botones "remove" (~L990-996):

```js
  // Add click handlers for remove buttons
  document.querySelectorAll(".file-item-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = parseInt(e.target.dataset.idx);
      removeMetaFile(idx);
    });
  });
```

### Agregar INMEDIATAMENTE DESPUÉS de ese bloque (no dentro de él):

```js
  // Add click handlers for edit buttons
  document.querySelectorAll(".file-item-edit").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const filePath = btn.dataset.path;
      if (!filePath || !metaEditor) return;
      try {
        const res = await fetch(`/api/metadata?file=${encodeURIComponent(filePath)}`);
        const data = await res.json();
        if (!data.ok) return;
        currentMetaFile = filePath;
        currentMetaData = data.metadata;
        if (metaTitle) metaTitle.value = data.metadata.title || "";
        if (metaArtist) metaArtist.value = data.metadata.artist || "";
        if (metaAlbum) metaAlbum.value = data.metadata.album || "";
        if (metaYear) metaYear.value = data.metadata.year || "";
        if (metaGenre) metaGenre.value = data.metadata.genre || "";
        if (metaTrack) metaTrack.value = data.metadata.track || "";
        const baseName = filePath.split("/").pop().replace(/\.[^.]+$/, "");
        if (metaNewFilename) metaNewFilename.value = baseName;
        updateMetaPreview();
        metaEditor.classList.remove("hidden");
        metaEditor.scrollIntoView({ behavior: "smooth" });
      } catch (err) {
        if (metaStatus) metaStatus.textContent = `Error al leer metadatos: ${err.message}`;
      }
    });
  });
```

---

## Cambio 4 — `ui/index.html`: insertar el formulario en #tab-metadata

### Punto de inserción

Busca estas dos líneas consecutivas (~L529-531):

```html
            </div>

            <div class="status" id="meta-status"></div>
```

### Insertar el bloque HTML ENTRE esas dos líneas, quedando así:

```html
            </div>

            <div id="meta-editor" class="metadata-editor hidden">
              <h3>Editar metadatos</h3>
              <div class="meta-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:16px;">
                <div class="field">
                  <label for="meta-title">Título</label>
                  <input id="meta-title" type="text" placeholder="Título" />
                </div>
                <div class="field">
                  <label for="meta-artist">Artista</label>
                  <input id="meta-artist" type="text" placeholder="Artista" />
                </div>
                <div class="field">
                  <label for="meta-album">Álbum</label>
                  <input id="meta-album" type="text" placeholder="Álbum" />
                </div>
                <div class="field">
                  <label for="meta-year">Año</label>
                  <input id="meta-year" type="number" placeholder="2024" />
                </div>
                <div class="field">
                  <label for="meta-genre">Género</label>
                  <input id="meta-genre" type="text" placeholder="Afro House" />
                </div>
                <div class="field">
                  <label for="meta-track">Pista #</label>
                  <input id="meta-track" type="number" placeholder="1" />
                </div>
                <div class="field" style="grid-column:1/-1;">
                  <label for="meta-new-filename">Nombre de archivo</label>
                  <input id="meta-new-filename" type="text" />
                </div>
              </div>
              <div class="meta-preview">
                Vista previa: <code id="meta-preview-name">nombre.mp3</code>
              </div>
              <div class="actions">
                <button id="meta-save" class="btn primary">Guardar cambios</button>
                <button id="meta-cancel-edit" class="btn">Cancelar</button>
              </div>
            </div>

            <div class="status" id="meta-status"></div>
```

---

## Verificación después de los cambios

1. Correr `npm run test:metadata-editor` → debe pasar 11/11
2. Correr `npm run test:audio-ingestion` → debe pasar 4/4
3. En Electron: abrir tab Metadata → cargar carpeta → aparecen archivos con botón ✎ (lápiz) en hover
4. Hacer clic en ✎ → aparece el formulario con los datos del archivo populados
5. Editar campos → el campo "Vista previa" se actualiza en tiempo real
6. Clic "Guardar cambios" → metadatos escritos, formulario se oculta
7. Clic "Cancelar" → formulario se oculta sin guardar

---

## Notas para el agente

- Los IDs de los elementos deben coincidir EXACTAMENTE: `meta-cancel-edit` (no `meta-cancel`, que ya existe como botón de cancelar identificación)
- `updateMetaPreview()` ya está definida en app.js L1147-1152. No la toques.
- Los event listeners de `metaSave` y `metaCancelEdit` ya están definidos (~L1160-1235). Solo se activan cuando las variables dejan de ser `null`.
- El endpoint backend `GET /api/metadata?file=<path>` ya existe y devuelve `{ ok, metadata: { title, artist, album, year, genre, track } }`
- La variable `e` en el catch del handler de edición puede colisionar con el parámetro del `forEach`. Usa `err` en el catch (ya está escrito así arriba).
