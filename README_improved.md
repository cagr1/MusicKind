# MusicKind - DJ Music Management Tool

Una herramienta completa para DJs que clasifica música por género y crea sets profesionales.

## 🚀 Características

### ✨ Mejoras Nuevas

1. **📁 Selección de Carpetas con Dialogos**
   - Interfaz gráfica para seleccionar carpetas en lugar de escribir rutas manualmente
   - Compatible con Electron para una experiencia de escritorio nativa

2. **🎬 Instalación Automática de FFmpeg**
   - Script de instalación automática para macOS, Linux, y Windows
   - Verificación automática de FFmpeg antes de procesos
   - Manejo de errores amigables

3. **⚡ Streaming de Progreso en Tiempo Real**
   - Barra de progreso para todos los procesos (clasificación, creación de sets, conversión)
   - Actualizaciones en tiempo real del estado del proceso
   - Feedback visual durante operaciones largas

4. **⚠️ Advertencias Contextuales**
   - Advertencia de tiempo de procesamiento movida al creador de sets
   - Mensajes claros sobre el tiempo requerido para carpetas grandes
   - Sugerencias para acelerar el proceso

5. **🖥️ Soporte para Electron**
   - Aplicación de escritorio nativa
   - Integración con sistema de archivos del sistema
   - Menú nativo y notificaciones del sistema

6. **🧪 Infraestructura de Tests**
   - Tests automatizados para funcionalidad básica
   - Verificación de dependencias
   - Script de ejecución de tests completo

## 📦 Instalación

### Requisitos Previos

- Node.js 18+
- Python 3.9+
- FFmpeg (opcional, pero recomendado)

### Instalación de FFmpeg

Ejecuta el script de instalación automática:

```bash
./install_ffmpeg.sh
```

El script detecta tu sistema operativo e instala FFmpeg automáticamente:

- **macOS**: Usa Homebrew
- **Debian/Ubuntu**: Usa apt
- **RedHat/CentOS**: Usa yum/dnf
- **Windows**: Instrucciones manuales

### Instalación de MusicKind

```bash
# Clona el repositorio
git clone <repository-url>
cd MusicKind

# Instala dependencias
npm install

# Instala dependencias de Python
pip3 install -r requirements.txt
```

## 🎮 Uso

### Modo Web (Dashboard)

```bash
# Inicia el servidor web
npm run dashboard

# Abre en tu navegador
http://localhost:3030
```

### Modo Escritorio (Electron)

```bash
# Inicia la aplicación de escritorio
npm run electron

# Modo desarrollo (con DevTools)
npm run electron-dev
```

### Interfaz Mejorada

1. **📁 Selección de Carpetas**
   - Haz clic en "Examinar" para seleccionar carpetas
   - Dialogos nativos del sistema
   - Soporte para rutas largas y espacios

2. **⚡ Procesamiento con Progreso**
   - Barra de progreso en tiempo real
   - Mensajes de estado claros
   - Cancelación de procesos disponible

3. **🎯 Asistente de FFmpeg**
   - Verificación automática al iniciar
   - Instalación con un clic
   - Mensajes de error claros

## 🧪 Tests

Ejecuta los tests automatizados:

```bash
# Ejecuta todos los tests
./run_tests.sh

# Ejecuta solo tests Python
python3 tests/test_basic.py
```

Los tests verifican:
- ✅ Disponibilidad de dependencias
- ✅ Funcionalidad de audio features
- ✅ Configuración de géneros
- ✅ Creación de archivos temporales
- ✅ Conexión con APIs externas

## 🏗️ Estructura del Proyecto

```
MusicKind/
├── src/                    # Código fuente
│   ├── server.js          # Servidor web
│   ├── cli.js             # Interfaz de línea de comandos
│   ├── audio_features.py  # Análisis de audio
│   ├── run_classification.py # Creador de sets
│   └── convert_audio.py   # Convertidor de audio
├── ui/                    # Interfaz web
│   ├── index.html         # HTML principal
│   ├── app.js             # Lógica de la UI
│   └── styles.css         # Estilos
├── electron/              # Aplicación de escritorio
│   ├── main.js           # Proceso principal de Electron
│   └── preload.js        # Script de precarga
├── config/               # Archivos de configuración
├── tests/                # Tests automatizados
├── install_ffmpeg.sh     # Instalador de FFmpeg
└── run_tests.sh         # Ejecutor de tests
```

## 🔧 Configuración

### Géneros Musicales

Edita `config/genres.json` para personalizar los géneros disponibles:

```json
[
  "Afro House",
  "Tech House",
  "Deep House",
  "Melodic Techno"
]
```

### API Keys

Para usar el clasificador con Spotify y Last.fm:

```bash
export SPOTIFY_CLIENT_ID=your_client_id
export SPOTIFY_CLIENT_SECRET=your_client_secret
export LASTFM_API_KEY=your_lastfm_key
```

## 📋 Funcionalidades por Módulo

### Clasificador por Género
- ✅ Clasificación automática por género
- ✅ Integración con Spotify/Last.fm
- ✅ Modo de prueba (no mueve archivos)
- ✅ Reportes CSV

### Creador de Sets
- ✅ Análisis de audio con librosa
- ✅ Sugerencias warmup/peak/closing
- ✅ Análisis parcial (segundos iniciales)
- ✅ Conversión temporal para acelerar
- ✅ Progreso en tiempo real

### Convertidor de Audio
- ✅ Conversión entre formatos (MP3, WAV, AIFF)
- ✅ Control de calidad (bitrate)
- ✅ Progreso en tiempo real
- ✅ Verificación de FFmpeg

## 🐛 Solución de Problemas

### FFmpeg no encontrado

1. Ejecuta el instalador: `./install_ffmpeg.sh`
2. Verifica instalación: `ffmpeg -version`
3. Revisa tu PATH: `echo $PATH`

### Problemas con Electron

1. Asegúrate de tener Node.js 18+
2. Reinstala dependencias: `npm install`
3. Ejecuta en modo desarrollo: `npm run electron-dev`

### Tests fallando

1. Verifica dependencias: `./run_tests.sh`
2. Instala FFmpeg: `./install_ffmpeg.sh`
3. Revisa logs de error específicos

## 📝 Changelog

### v1.1.0 - Mejora UX
- ✅ Añadida selección de carpetas con dialogos
- ✅ Instalación automática de FFmpeg
- ✅ Streaming de progreso en tiempo real
- ✅ Advertencias contextuales mejoradas
- ✅ Soporte para Electron
- ✅ Infraestructura de tests

### v1.0.0 - Versión Inicial
- ✅ Clasificador de música por género
- ✅ Creador de sets automático
- ✅ Convertidor de audio
- ✅ Interfaz web

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama de feature: `git checkout -b feature/nueva-funcionalidad`
3. Commit tus cambios: `git commit -am 'Añade nueva funcionalidad'`
4. Push a la rama: `git push origin feature/nueva-funcionalidad`
5. Abre un Pull Request

## 📄 Licencia

MIT License - ver archivo LICENSE para detalles.

## 🎵 Creditos

Desarrollado con ❤️ para DJs y productores musicales.