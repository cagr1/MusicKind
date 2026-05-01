# Manual de Usuario — MusicKind

## 1. Objetivo
MusicKind te ayuda a organizar tu biblioteca musical para DJ, clasificar tracks, evaluar en qué parte del set encajan, convertir formatos, editar metadata, analizar BPM/key y separar stems.

## 2. Abrir la aplicación
1. Instala dependencias:
```bash
npm install
pip3 install -r requirements.txt
```
2. Instala extras recomendados:
```bash
./install_ffmpeg.sh
pip3 install demucs
```
3. Inicia la app:
```bash
npm run electron
```

## 3. Configuración inicial
Abre `Settings` y completa:
- Spotify Client ID
- Spotify Client Secret
- Last.fm API Key opcional
- Carpeta de salida por defecto

## 4. Tab: Clasificador

### Qué hace
Clasifica archivos por género y los mueve a carpetas de salida.

### Flujo
1. Selecciona carpeta de entrada.
2. Ajusta géneros activos si hace falta.
3. Ejecuta `Clasificar ahora`.

### Controles
- `⏸ Pausar`
- `▶ Reanudar`
- `✕ Cancelar`

## 5. Tab: Creador de Sets

### Qué hace
Aprende tu estilo por secciones y evalúa cada track nuevo para decidir dónde encaja mejor:
- `warmup`
- `peak`
- `closing`

### Flujo
1. Selecciona una carpeta de referencia para `warmup` si la tienes.
2. Selecciona una carpeta de referencia para `peak` si la tienes.
3. Selecciona una carpeta de referencia para `closing` si la tienes.
4. Selecciona el pack nuevo a evaluar.
5. Ajusta los segundos por pista.
6. Ejecuta `Analizar pack`.

### Resultado
La tabla muestra score por sección y una columna `Mejor sección`.

## 6. Tab: Convertidor

### Qué hace
Convierte audio entre formatos usando FFmpeg.

### Flujo
1. Selecciona carpeta de entrada.
2. Elige formato.
3. Ejecuta conversión.

La salida va a la carpeta definida en `Settings`.

## 7. Tab: BPM Analyzer

### Qué hace
Analiza carpetas completas y devuelve BPM y tonalidad por track.

### Flujo
1. Selecciona carpeta.
2. Ejecuta análisis.
3. Revisa la tabla de resultados.

## 8. Tab: Stem Separator

### Qué hace
Separa una canción en:
- Acapella
- Instrumental
- Ambos

### Requisito
```bash
pip3 install demucs
```

### Flujo
1. Selecciona la carpeta de entrada.
2. Elige qué extraer.
3. Elige formato de salida.
4. Ejecuta `Separar stems`.

## 9. Tab: Editor de Metadata

### Qué hace
Permite cargar archivos, identificar metadata y editar tags manualmente.

### Flujo recomendado
1. Selecciona carpeta.
2. Clic en `Cargar archivos`.
3. Clic en `Identificar todos`.
4. Usa el botón `✎` para editar un archivo.
5. Ajusta campos y revisa la vista previa.
6. Guarda o cancela.

## 10. Problemas comunes

### No clasifica
Verifica las credenciales de Spotify en `Settings`.

### FFmpeg no disponible
Ejecuta:
```bash
./install_ffmpeg.sh
```

### Stem Separator no inicia
Instala `demucs` y recuerda que la primera ejecución descarga modelos.

### Proceso lento
Es normal con bibliotecas grandes o archivos sin compresión. Divide en lotes si hace falta.

## 11. Atajos técnicos
```bash
npm run test:metadata-editor
npm run test:audio-ingestion
```
