# MusicKind - Guía Rápida de Empezar

## 🚀 Empezar en 3 Pasos

### 1. Instalar FFmpeg (Recomendado)
```bash
./install_ffmpeg.sh
```

### 2. Instalar Dependencias
```bash
npm install
pip3 install -r requirements.txt
```

### 3. Iniciar la Aplicación

**Opción A: Dashboard Web**
```bash
npm run dashboard
# Abre: http://localhost:3030
```

**Opción B: App de Escritorio (Electron)**
```bash
npm run electron
```

## 🎯 Características Principales

### ✨ Mejoras Nuevas
- 📁 **Selección de carpetas** con dialogos visuales
- 🎬 **Instalación automática** de FFmpeg
- ⚡ **Progreso en tiempo real** para todos los procesos
- 🖥️ **App de escritorio** con Electron
- 🧪 **Tests automatizados**

### 🎵 Usos Principales
1. **Clasificar música** por género (Afro House, Tech House, etc.)
2. **Crear sets** profesionales (warmup/peak/closing)
3. **Convertir audio** entre formatos

## 🔧 Configuración Rápida

### Spotify/Last.fm (Opcional)
```bash
export SPOTIFY_CLIENT_ID=tu_client_id
export SPOTIFY_CLIENT_SECRET=tu_client_secret
```

### Géneros Personalizados
Edita `config/genres.json` para añadir/quitar géneros.

## 🧪 Verificar Instalación
```bash
./run_tests.sh
```

## 📱 Interfaz Mejorada

- **📁 Botón "Examinar"** para seleccionar carpetas
- **⚡ Barra de progreso** en tiempo real
- **⚠️ Advertencias** claras de tiempo de procesamiento
- **🎯 Asistente** de instalación de FFmpeg

## 🆘 Problemas Comunes

**FFmpeg no encontrado:**
```bash
./install_ffmpeg.sh
```

**App no inicia:**
```bash
npm install
npm run electron-dev
```

**Tests fallan:**
```bash
./run_tests.sh
```

## 📄 Documentación Completa

Para detalles completos, características avanzadas y troubleshooting, vea [README_improved.md](./README_improved.md).