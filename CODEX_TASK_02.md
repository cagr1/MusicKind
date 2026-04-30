# CODEX TASK 02 — Clasificador: leer tags ID3 primero + expandir mapeo de géneros

> Arquitecto: Claude Code
> Ejecutor: Codex
> Fecha: 2026-04-30
> Estado: PENDIENTE

---

## Contexto mínimo

El clasificador de géneros (`src/cli.js`) actualmente ignora los tags de género que ya están escritos en los archivos de audio (ID3 / Vorbis comment). Estos tags los escribe Rekordbox, Traktor, Serato, o el usuario manualmente. Al ignorarlos, el clasificador llama a Spotify para cada archivo incluso cuando la respuesta ya está en el archivo mismo.

Además, `src/classify.js` tiene un mapeo de géneros demasiado rígido que no cubre variantes comunes que Spotify devuelve para artistas de house africano y techno melódico.

**Reglas que no debes romper:**
- Editar solo los dos archivos indicados: `src/cli.js` y `src/classify.js`
- No crear archivos nuevos
- No tocar ningún otro tab ni función fuera del clasificador
- No cambiar la estructura del loop ni el orden del pipeline de clasificación
- Correr `npm run test:metadata-editor` y `npm run test:audio-ingestion` al terminar (estos tests no tocan classify pero verifican imports globales)

---

## Cambio 1 — `src/cli.js`: leer tag ID3 de género antes de llamar a Spotify

### Contexto exacto

El loop de clasificación está en el archivo. La parte relevante:

- **Línea 92**: `const metadata = await parseFile(filePath);` — aquí ya se leen todos los metadatos ID3
- **Línea 142**: `continue;` — fin del bloque de override classification
- **Línea 144**: `const trackTagsPromise = lastfm ? ...` — aquí comienza la llamada a Spotify/Last.fm

El nuevo código va **entre la línea 142 y la línea 144**, es decir, DESPUÉS del bloque de override y ANTES de las llamadas a APIs externas.

### Código a agregar (insertar entre línea 142 y línea 144)

```js
    // Check embedded ID3/Vorbis genre tag before calling any API
    const embeddedGenres = Array.isArray(metadata.common.genre)
      ? metadata.common.genre
      : metadata.common.genre
      ? [metadata.common.genre]
      : [];

    if (embeddedGenres.length > 0) {
      const id3Classification = classifyFromTags(embeddedGenres);
      if (id3Classification && allowedGenres.has(id3Classification.genre)) {
        const genre = id3Classification.genre;
        const finalDir = path.join(inputDir, genre);
        ensureDir(finalDir, dryRun);
        const destPath = path.join(finalDir, path.basename(filePath));
        if (!dryRun) {
          if (fs.existsSync(destPath)) {
            const unique = uniquePath(finalDir, path.basename(filePath));
            moveFile(filePath, unique, dryRun);
          } else {
            moveFile(filePath, destPath, dryRun);
          }
        }
        reportRows.push({
          file: relative,
          artist,
          title,
          cleanTitle: clean,
          genre,
          reason: `id3:${embeddedGenres[0]}`
        });
        console.log(`${relative} -> ${genre} [id3]`);
        continue;
      }
    }

```

### Verificación visual del resultado correcto

Antes de la inserción, el código debe verse así (alrededor de las líneas 140-145):
```js
      console.log(`${relative} -> ${genre}`);
      continue;
    }

    const trackTagsPromise = lastfm ? lastfm.getTrackTags(artist, clean).catch(() => []) : Promise.resolve([]);
```

Después de la inserción, debe verse así:
```js
      console.log(`${relative} -> ${genre}`);
      continue;
    }

    // Check embedded ID3/Vorbis genre tag before calling any API
    const embeddedGenres = Array.isArray(metadata.common.genre)
    // ... (bloque completo) ...
        continue;
      }
    }

    const trackTagsPromise = lastfm ? lastfm.getTrackTags(artist, clean).catch(() => []) : Promise.resolve([]);
```

---

## Cambio 2 — `src/classify.js`: agregar variantes de géneros de Spotify

### Contexto exacto

El archivo completo tiene 59 líneas. La función `classifyFromTags` empieza en la línea 3.
El orden de los checks es importante: los más específicos van primero.

### Estado actual de las primeras líneas de `classifyFromTags` (líneas 3-14):
```js
  if (hasTag(normalized, "afro house")) return { genre: "Afro House", reason: "tag:afro house" };
  if (hasTag(normalized, "tech house")) return { genre: "Tech House", reason: "tag:tech house" };
  if (hasTag(normalized, "deep house")) return { genre: "Deep House", reason: "tag:deep house" };
  if (hasTag(normalized, "latin house")) return { genre: "Latin House", reason: "tag:latin house" };
```

### Y las líneas 27-33 (cerca del final de classifyFromTags):
```js
  if (hasTag(normalized, "melodic techno") || hasTag(normalized, "melodic house techno")) {
    return { genre: "Melodic Techno", reason: "tag:melodic techno" };
  }
  if (hasTag(normalized, "melodic house") || hasTag(normalized, "melodic")) {
    return { genre: "Melodic House & Techno", reason: "tag:melodic house/techno" };
  }
  if (hasTag(normalized, "house")) return { genre: "House", reason: "tag:house" };
```

### Cambios a aplicar

**2a — Agregar variantes de Afro House ANTES de la línea de "afro house" existente (línea 3):**

Reemplazar:
```js
  if (hasTag(normalized, "afro house")) return { genre: "Afro House", reason: "tag:afro house" };
```

Con:
```js
  if (hasTag(normalized, "afro house") || hasTag(normalized, "south african house") || hasTag(normalized, "amapiano") || hasTag(normalized, "organic house")) return { genre: "Afro House", reason: "tag:afro house" };
```

**2b — Agregar variantes de Melodic Techno ANTES del check existente de "melodic techno" (línea 27):**

Reemplazar:
```js
  if (hasTag(normalized, "melodic techno") || hasTag(normalized, "melodic house techno")) {
    return { genre: "Melodic Techno", reason: "tag:melodic techno" };
  }
```

Con:
```js
  if (hasTag(normalized, "melodic techno") || hasTag(normalized, "melodic house techno") || hasTag(normalized, "organic techno") || hasTag(normalized, "minimal techno")) {
    return { genre: "Melodic Techno", reason: "tag:melodic techno" };
  }
```

---

## Verificación después de los cambios

1. Correr `npm run test:metadata-editor` → debe pasar 11/11
2. Correr `npm run test:audio-ingestion` → debe pasar 4/4
3. Probar en Electron: abrir el Clasificador, seleccionar una carpeta con archivos que tengan tags ID3 de género
4. En el log de clasificación deben aparecer líneas con `[id3]` al final para los archivos que ya tenían género embebido
5. Archivos sin tag ID3 → siguen por el flujo normal de Spotify

---

## Notas para el agente

- La función `classifyFromTags` ya importa `normalizeTag` de utils.js — no necesitas agregar imports
- `metadata.common.genre` puede ser un string o un array de strings dependiendo del formato del archivo (MP3 vs FLAC vs AIFF). Por eso el código usa el ternario con `Array.isArray`
- El patrón de mover el archivo y hacer `continue` es idéntico al bloque de override (líneas 119-141). Cópialo exactamente, cambiando solo `genre` y `reason`
- No cambies el orden de los checks existentes en `classifyFromTags` — solo agrega variantes a los ORs existentes
- Si las líneas no coinciden exactamente, busca por contenido: busca `const trackTagsPromise` para el punto de inserción en cli.js
