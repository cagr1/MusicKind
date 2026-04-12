# MusicKind 🎵

**¡Ver la documentación mejorada en [README_improved.md](./README_improved.md)!**

Este repo contiene **dos herramientas** distintas:

1. **Clasificador de música por género** (Node.js + Spotify/Last.fm).
2. **Creador de sets** (Python + audio features) que sugiere `warmup/peak/closing` según el gusto del DJ.

## 🚀 Novedades en la Versión Actual

- ✅ **Dialogos nativos** para seleccionar carpetas (escribe rutas manualmente)
- ✅ **Instalación automática de FFmpeg** desde la app
- ✅ **Soporte multiplataforma** (macOS y Windows)
- ✅ **Progreso en tiempo real** para todos los procesos
- ✅ **App de escritorio** compilable como ejecutable
- ✅ **Tests automatizados**
- ✅ **Mejoras UX** y advertencias contextuales

## 🎮 Empezar Rápido

```bash
# Instalar dependencias
npm install

# Opción 1: App de escritorio (recomendado)
npm run electron

# Opción 2: Dashboard web
npm run dashboard
```

**Con la app de escritorio:**
- Selecciona carpetas con dialogos nativos
- FFmpeg se instala automáticamente si no lo tienes
- Ejecutable compilable: `npm run build`

Para documentación completa, características y detalles de instalación, consulta [README_improved.md](./README_improved.md).

---

**Dashboard (Interfaz Web)**

Para usar el clasificador, el creador de sets y el convertidor sin comandos:

```bash
node src/server.js
```

Luego abre `http://localhost:3030` en tu navegador.

---

**Clasificador por género (CLI Node.js)**

Clasifica archivos de música electrónica en subgéneros usando Spotify y Last.fm.

**Requisitos**
- Node.js 18+
- Credenciales de Spotify (Client ID/Secret)
- API key de Last.fm (opcional)

**Configuración**
Exporta las variables en tu shell:

```bash
export SPOTIFY_CLIENT_ID=...
export SPOTIFY_CLIENT_SECRET=...
export LASTFM_API_KEY=... # opcional
```

**Uso**

```bash
node src/cli.js --input "/ruta/a/tu/carpeta" --dry-run
```

Ejecutar de verdad (mueve archivos):

```bash
node src/cli.js --input "/ruta/a/tu/carpeta"
```

**Opciones**
- `--dry-run` No mueve archivos.
- `--report <csv>` Ruta para el reporte CSV.
- `--log <file>` Ruta para el log de no clasificados.

**Carpetas de salida**
- `Afro House`
- `Tech House`
- `Melodic Techno`
- `Unsorted`

Se crean dentro de la carpeta de entrada.

**Cache**
Respuestas de APIs se guardan en `.cache/api-cache.json`.

**Overrides Manuales**
Si Spotify no devuelve género, puedes forzar clasificación editando `config/overrides.json`.

Ejemplo:

```json
{
  "artists": {
    "16bl": "Melodic Techno"
  },
  "labels": {
    "anjunadeep": "Melodic Techno"
  },
  "keywords": {
    "afro house": "Afro House"
  }
}
```

**Géneros activos**
Edita `config/genres.json` para habilitar o desactivar géneros que quieras usar en el clasificador.

---

**Creador de sets (Python)**

Genera tres listas `warmup/peak/closing` a partir de:
- Tracks base del DJ (ya clasificados manualmente).
- Un pack nuevo que quieres evaluar.

**Requisitos**
- Python 3.9+
- `librosa` y `numpy` instalados en tu entorno.

**Estructura de carpetas esperada**
- `data/dj_tracks/warmup`
- `data/dj_tracks/peak`
- `data/dj_tracks/closing`
- `output/` (salida)

**Cómo usarlo**

1. Coloca los tracks base del DJ en `data/dj_tracks/warmup`, `data/dj_tracks/peak` y `data/dj_tracks/closing`.
2. Ejecuta (o pasa tus rutas con flags):

```bash
python3 src/run_classification.py
```

Ejemplo con rutas:

```bash
python3 src/run_classification.py --base-dj "/ruta/dj_tracks" --new-pack "/ruta/new_pack" --output "/ruta/output"
```

**Opciones**
- `--base-dj` Ruta base con `warmup/peak/closing`.
- `--new-pack` Ruta del pack nuevo.
- `--output` Ruta de salida.
- `--analysis-seconds` Analiza solo los primeros N segundos.
- `--temp-format` Convierte temporalmente a `mp3`, `wav` o `aiff` para acelerar.
- `--temp-bitrate` Bitrate kbps para MP3 temporal.

**Salida**
Genera:
- `output/warmup.txt`
- `output/peak.txt`
- `output/closing.txt`

Cada archivo contiene una lista de rutas de archivos sugeridos para ese momento del set.

**Notas de performance**
El script carga cada archivo completo para extraer features (BPM, energía, brillo, etc.). En colecciones muy grandes o formatos sin compresión (por ejemplo `.aiff`), el tiempo de análisis puede ser alto. Si activas conversión temporal, se requiere FFmpeg instalado.
