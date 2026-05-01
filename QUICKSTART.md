# MusicKind - Guía Rápida

## Inicio rápido

### 1. Instala dependencias
```bash
npm install
pip3 install -r requirements.txt
```

### 2. Instala extras recomendados
```bash
./install_ffmpeg.sh
pip3 install demucs
```

### 3. Abre la app
```bash
npm run electron
```

## Módulos disponibles
- Clasificador por género
- Creador de Sets por secciones (`warmup`, `peak`, `closing`)
- Convertidor de audio
- Editor de metadata
- BPM Analyzer
- Stem Separator

## Configuración mínima
Completa en `Settings`:
- `Spotify Client ID`
- `Spotify Client Secret`
- `Last.fm API Key` opcional
- Carpeta de salida por defecto

También puedes usar variables de entorno:
```bash
export SPOTIFY_CLIENT_ID=tu_client_id
export SPOTIFY_CLIENT_SECRET=tu_client_secret
export LASTFM_API_KEY=tu_lastfm_key
```

## Validación rápida
```bash
npm run test:metadata-editor
npm run test:audio-ingestion
```

## Si algo falla
- FFmpeg: ejecuta `./install_ffmpeg.sh`
- Stems: instala `demucs` con `pip3 install demucs`
- App: prueba `npm run electron-dev`

## Más documentación
- [README.md](./README.md)
- [MANUAL_USUARIO.md](./MANUAL_USUARIO.md)
- [PROJECT_STATE.md](./PROJECT_STATE.md)
