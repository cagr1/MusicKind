# MusicKind — Manual de Usuario

## ¿Qué es MusicKind?

MusicKind es una herramienta para DJs que te ayuda a:
- Clasificar tu música por género automáticamente
- Descubrir en qué parte del set encaja cada track (warmup / peak / closing)
- Convertir archivos de audio entre formatos (MP3, WAV, AIFF, FLAC)
- Analizar el BPM y la tonalidad de tus tracks
- Separar la voz del instrumental de cualquier canción
- Editar el nombre y metadata de tus archivos de música

---

## 1. Instalación

### macOS

1. Descarga el archivo `MusicKind-mac.dmg` desde el link que te enviaron.
2. Haz doble clic en el archivo `.dmg` que se descargó.
3. Arrastra el ícono de **MusicKind** a la carpeta **Aplicaciones**.
4. Abre **Aplicaciones** y haz doble clic en **MusicKind**.
   - Si aparece un mensaje "no se puede abrir porque es de un desarrollador no identificado":
     ve a **Preferencias del Sistema → Seguridad y privacidad → General** y haz clic en
     **Abrir de todas formas**.

### Windows

1. Descarga el archivo `MusicKind-setup.exe` desde el link que te enviaron.
2. Haz doble clic en `MusicKind-setup.exe`.
3. Si Windows muestra "protegió tu PC", haz clic en **Más información → Ejecutar de todas formas**.
4. Sigue los pasos del instalador y haz clic en **Instalar**.
5. Al terminar, haz clic en **Finalizar**. MusicKind se abrirá automáticamente.

---

## 2. Primera vez que abres la app

La primera vez que abres MusicKind aparece una pantalla de **Configuración inicial**.
Esta pantalla verifica que tu computadora tiene todo lo necesario para que la app funcione.

### ¿Qué hace esa pantalla?

Revisa tres cosas:

| Componente | Para qué sirve |
|---|---|
| **Python** | Motor de análisis de audio (BPM, Set Creator, Stem Separator) |
| **Librerías de audio** | Paquetes de procesamiento de música (librosa, demucs) |
| **FFmpeg** | Conversión y separación de stems |

### Si aparece ✅ en todo:
Haz clic en **Abrir MusicKind**. ¡Listo!

### Si aparece ⚠️ o ❌ en Python:

Python no está instalado en tu computadora. Haz esto:

**En Mac:**
1. Descarga Python desde [python.org/downloads](https://python.org/downloads)
2. Instálalo siguiendo los pasos normales
3. Cierra MusicKind y vuelve a abrirlo

**En Windows:**
1. Descarga Python desde [python.org/downloads](https://python.org/downloads)
2. Al instalar, **marca la casilla "Add Python to PATH"** (esto es importante)
3. Haz clic en "Install Now"
4. Cierra MusicKind y vuelve a abrirlo

### Si aparece ⚠️ en Librerías de audio:
Haz clic en **Instalar automáticamente**. La app descargará e instalará los componentes
necesarios. Esto puede tardar **5 a 15 minutos** la primera vez (especialmente el Stem
Separator que descarga ~2 GB de modelos de IA).

Puedes ver el progreso en el log que aparece en pantalla. No cierres la app durante la instalación.

### Si aparece ⚠️ en FFmpeg:
Puedes continuar con la app. FFmpeg se puede instalar después desde la pestaña **Configuración**.

---

## 3. Configuración inicial de las API Keys

Para usar el **Clasificador de géneros** necesitas claves gratuitas de Spotify.

1. Ve a la pestaña **Configuración** (última del menú lateral).
2. Completa los campos **Spotify Client ID** y **Spotify Client Secret**.
3. Haz clic en **Guardar configuración**.

### ¿Cómo obtengo las claves de Spotify?

1. Ve a [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Inicia sesión con tu cuenta de Spotify (cualquier cuenta funciona, incluso la gratuita)
3. Haz clic en **Create app**
4. Ponle cualquier nombre (ej: "MusicKind")
5. En "Redirect URIs" escribe: `http://localhost`
6. Haz clic en **Save**
7. En la página de tu app, haz clic en **Settings**
8. Copia el **Client ID** y el **Client Secret**
9. Pégalos en MusicKind → Configuración

---

## 4. Tab: Clasificador de géneros

### Para qué sirve
Analiza tus tracks y los mueve automáticamente a carpetas por género.
Usa Spotify para identificar el género. Si Spotify no lo sabe, usa el BPM como guía.

### Cómo usarlo
1. Haz clic en **Examinar** y selecciona la carpeta con tus tracks sin clasificar.
2. Revisa la lista de **Géneros activos** — puedes agregar o quitar géneros.
3. Haz clic en **Clasificar ahora**.
4. Verás una barra de progreso. Puedes pausar con ⏸ o cancelar con ✕.
5. Al terminar, los archivos habrán sido movidos a subcarpetas por género dentro de
   la **carpeta de salida** que configuraste en Settings.

> Si activas **Simulación**, la app solo te dice qué haría pero no mueve nada.
> Útil para probar antes de mover archivos reales.

---

## 5. Tab: Creador de Sets

### Para qué sirve
Aprende el "ADN sonoro" de tus secciones favoritas (warmup, peak, closing) y evalúa
si un track nuevo encajaría bien en cada momento de tu set.

### Cómo usarlo
1. Selecciona una o más carpetas de referencia:
   - **Warmup**: tracks que ya usas para arrancar tu set
   - **Peak**: tracks de máxima energía
   - **Closing**: tracks para cerrar
   (No necesitas las tres — con una ya funciona)
2. Selecciona el **Pack nuevo a evaluar**: la carpeta con tracks que no sabes dónde van.
3. Ajusta los **Segundos a analizar** (más segundos = más preciso, más lento).
4. Haz clic en **Analizar pack**.
5. La tabla de resultados muestra el porcentaje de encaje en cada sección y cuál es la mejor.

---

## 6. Tab: Convertidor

### Para qué sirve
Convierte tus archivos de audio entre formatos: MP3, WAV, AIFF, FLAC, M4A.

### Cómo usarlo
1. Arrastra o selecciona la **carpeta** con los archivos a convertir.
2. Elige el **Formato de salida** (ej: WAV).
3. Si conviertes a MP3, elige la **Calidad** (320 kbps = mejor calidad).
4. Haz clic en **Convertir**.
5. Los archivos convertidos aparecen en tu carpeta de salida.

> Requiere FFmpeg instalado. Si aparece una advertencia amarilla, ve a Settings e instálalo.

---

## 7. Tab: Analizador de BPM

### Para qué sirve
Detecta el BPM y la tonalidad musical (Key) de todos los tracks de una carpeta.

### Cómo usarlo
1. Selecciona la carpeta con tus tracks.
2. Ajusta los **Segundos a analizar** (60s es suficiente para la mayoría).
3. Haz clic en **Analizar BPM**.
4. La tabla muestra el BPM y la tonalidad de cada track.

---

## 8. Tab: Stem Separator

### Para qué sirve
Separa una canción en dos pistas: la **voz (acapella)** y el **instrumental**.
Ideal para hacer mashups, ensayar, o practicar con la pista sin voz.

### Cómo usarlo
1. Arrastra una canción a la zona de drop (o haz clic para seleccionarla).
2. Elige el **Formato de salida** (WAV tiene mayor calidad; MP3 pesa menos).
3. Haz clic en **Separar stems**.
4. La primera vez puede tardar varios minutos (descarga modelos de IA ~300 MB).
5. Al terminar aparecen dos botones: **Voz (Acapella)** e **Instrumental** — haz clic para
   abrirlos directamente en el explorador de archivos.

---

## 9. Tab: Editor de Metadata

### Para qué sirve
Identifica automáticamente las canciones por su audio y escribe los tags correctos en
los archivos (artista, título, álbum, año, género). También renombra los archivos al
formato "Artista - Canción.ext".

Para identificar canciones automáticamente, la app usa Shazam internamente.
No necesitas ninguna cuenta ni API key para esta función.
(Spotify sigue siendo necesario para el Clasificador de géneros.)

### Cómo usarlo
1. Selecciona la carpeta con tus archivos.
2. Haz clic en **Cargar archivos**. Aparecerá la lista de tracks.
3. Haz clic en **Identificar todos** para que Spotify identifique todos los tracks automáticamente.
4. Para editar un archivo manualmente, haz clic en el ícono ✎ junto al archivo.
5. Modifica los campos y haz clic en **Guardar cambios**.

---

## 10. Configuración

### Carpeta de salida por defecto
Todos los archivos generados (conversiones, stems, clasificaciones) van aquí.
Selecciona una carpeta en tu disco donde quieras guardar los resultados.

### FFmpeg
FFmpeg es necesario para convertir archivos y separar stems.
Haz clic en **Instalar FFmpeg** y la app lo instalará automáticamente.
- En Mac necesita **Homebrew** instalado. Si no lo tienes, la app te indicará cómo instalarlo.
- En Windows usa winget (incluido en Windows 10/11) o Chocolatey.

---

## 11. Preguntas frecuentes

**¿Por qué el clasificador dice que mis tracks son del género incorrecto?**
Spotify no siempre tiene información de todos los artistas. Puedes ajustar los géneros
activos en el tab del Clasificador para que sean más específicos o generales.

**¿La app modifica mis archivos originales?**
- El **Clasificador** mueve los archivos a carpetas nuevas (no los copia, los mueve).
  Usa el modo **Simulación** para ver qué pasaría sin mover nada.
- El **Editor de Metadata** modifica los tags dentro del archivo. Los cambios son reversibles
  editando el archivo de nuevo.
- El **Convertidor** y el **Stem Separator** siempre crean archivos nuevos en la carpeta de salida.

**El Stem Separator tarda demasiado**
Es normal la primera vez — descarga modelos de IA de ~300 MB. La separación en sí tarda
2–5 minutos por canción dependiendo de la velocidad de tu computadora.

**¿Funciona sin internet?**
- **Clasificador**: necesita internet para consultar Spotify y Last.fm.
- **BPM Analyzer**: funciona sin internet.
- **Converter**: funciona sin internet.
- **Stem Separator**: funciona sin internet (después de descargar los modelos la primera vez).
- **Set Creator**: funciona sin internet.
- **Metadata Editor**: necesita internet para identificar canciones con Spotify.
