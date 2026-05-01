# MusicKind

MusicKind es una app desktop-first para DJs. Corre sobre Electron y reúne en una sola interfaz clasificación por género, análisis de set por secciones, conversión de audio, edición de metadata, análisis BPM/key y separación de stems.

## Qué hace hoy
- Clasificador por género con overrides, tags embebidos, Spotify/Last.fm y fallback local por BPM.
- Creador de sets por secciones, comparando un pack nuevo contra referencias `warmup`, `peak` y `closing`.
- Convertidor de audio con FFmpeg.
- Editor de metadata con carga por carpeta, identificación automática y edición manual.
- BPM/Key analyzer por lotes.
- Stem Separator con `demucs` para extraer voz e instrumental.

## Requisitos
- Node.js 18+
- Python 3.9+
- Dependencias Python base: `librosa`, `numpy`
- FFmpeg
- `demucs` para el módulo Stem Separator

## Instalación
```bash
npm install
pip3 install -r requirements.txt
pip3 install demucs
```

## Ejecución
```bash
# Recomendado
npm run electron

# Backend + UI en navegador, útil para debug
npm run dashboard
```

## Scripts útiles
```bash
npm run test:metadata-editor
npm run test:audio-ingestion
npm run test:metadata-endpoint
npm run build
```

## Configuración
Las credenciales de Spotify y Last.fm pueden guardarse desde el tab de `Settings` o definirse como variables de entorno:

```bash
export SPOTIFY_CLIENT_ID=...
export SPOTIFY_CLIENT_SECRET=...
export LASTFM_API_KEY=...
```

Spotify sigue siendo obligatorio para el flujo principal del clasificador. Last.fm es opcional.

## Módulos principales

### Clasificador
- Clasifica archivos por género en subcarpetas dentro de la carpeta de entrada.
- Prioriza override manual, luego género embebido, luego tags/APIs y finalmente BPM local.
- Soporta pausa, reanudación y cancelación desde la UI.

### Creador de Sets
- Aprende perfiles separados para `warmup`, `peak` y `closing`.
- Evalúa cada pista nueva y devuelve en qué parte del set encaja mejor.
- Muestra scores por sección en una tabla.

### Convertidor
- Convierte lotes de audio usando FFmpeg.
- Usa la carpeta de salida por defecto definida en `Settings`.

### Editor de Metadata
- Lista archivos por carpeta.
- Identifica metadata automáticamente.
- Permite editar tags y nombre de archivo desde formulario.

### BPM Analyzer
- Extrae BPM y tonalidad para colecciones completas.

### Stem Separator
- Usa `demucs` para extraer `vocals`, `instrumental` o ambos.
- La primera ejecución descarga modelos adicionales.

## Estructura relevante
```text
electron/             Shell de escritorio e IPC
src/server.js         Backend HTTP + endpoints SSE
src/cli.js            Clasificador por género
src/style_analyzer.py Analizador de similitud / perfiles de set
src/stem_separator.py Separación de stems con demucs
src/classify.js       Reglas de clasificación
src/metadata_editor.js Lectura/escritura metadata
ui/                   Interfaz principal
config/               Settings, géneros y overrides
tests/                Pruebas automatizadas
```

## Documentación adicional
- [QUICKSTART.md](./QUICKSTART.md)
- [MANUAL_USUARIO.md](./MANUAL_USUARIO.md)
- [PROJECT_STATE.md](./PROJECT_STATE.md)
