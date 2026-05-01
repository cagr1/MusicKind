# MusicKind - DJ Music Management Tool

MusicKind es una estación de trabajo de librería musical para DJs. La app está orientada a escritorio, corre sobre Electron y usa un backend local Node.js con procesos Python para análisis pesado.

## Estado actual

### Módulos activos
- Clasificador por género con overrides, tags embebidos, Spotify/Last.fm y fallback local por BPM.
- Creador de Sets por secciones, entrenado con carpetas `warmup`, `peak` y `closing`.
- Convertidor de audio por lotes con FFmpeg.
- Editor de metadata con auto-tagging y edición manual.
- BPM/Key analyzer.
- Stem Separator con `demucs`.

### Experiencia actual
- Selección de carpetas con diálogos nativos en Electron.
- Barras de progreso en tiempo real vía SSE.
- Settings centralizado para credenciales y carpeta de salida.
- Cancelación de procesos largos.

## Instalación

### Requisitos
- Node.js 18+
- Python 3.9+
- FFmpeg
- `librosa`, `numpy`
- `demucs` para separación de stems

### Setup recomendado
```bash
npm install
pip3 install -r requirements.txt
./install_ffmpeg.sh
pip3 install demucs
```

## Ejecución

### App de escritorio
```bash
npm run electron
```

### Modo debug
```bash
npm run dashboard
```

## Módulos en detalle

### Clasificador por género
- Lee metadata embebida antes de llamar APIs.
- Soporta pausa, reanudación y cancelación.
- Si Spotify no da audio-features útiles, usa BPM local como fallback.

### Creador de Sets
- Ya no depende del antiguo flujo UI basado en `run_classification.py`.
- Compara un pack nuevo contra referencias separadas:
  - `warmup`
  - `peak`
  - `closing`
- Devuelve score por sección y la mejor ubicación para cada track.

### Stem Separator
- Usa `python3 -m demucs`.
- Genera `vocals`, `instrumental` o ambos.
- La primera vez descarga modelos, por lo que puede tardar más.

## Estructura técnica relevante
```text
src/server.js           Endpoints HTTP + SSE
src/cli.js              Clasificador por género
src/style_analyzer.py   Modo simple + modo multi-reference para sets
src/stem_separator.py   Separación de stems con demucs
src/bpm_analyzer.py     BPM y tonalidad
src/metadata_editor.js  Metadata read/write/identify
ui/index.html           Tabs y layout principal
ui/app.js               Lógica frontend
electron/               Shell de escritorio e IPC
```

## Pruebas recomendadas
```bash
npm run test:metadata-editor
npm run test:audio-ingestion
npm run test:metadata-endpoint
```

## Troubleshooting rápido
- FFmpeg: `./install_ffmpeg.sh`
- Demucs: `pip3 install demucs`
- Electron: `npm run electron-dev`
- Credenciales Spotify: configúralas desde `Settings`
