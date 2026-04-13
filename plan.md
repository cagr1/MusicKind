# MusicKind - Plan de Desarrollo

## ESTADO ACTUAL (12/04/2026)
- Dashboard funcional con tabs: Clasificador, Creador de Sets, Convertidor, Auto-Tag, Editor BPM, Configuración
- Toast notifications en esquina superior derecha
- Drag & drop zones para convertir y auto-tag
- Cambio de idioma visible en sidebar
- App corre como web (npm run dashboard) o Electron (npm run electron)

## TAREAS PENDIENTES

### 1. VISUALIZACIÓN DE PROCESAMIENTO [COMPLETADO]
- [x] Analizar estructura actual
- [x] Modificar server.js para enviar progreso del archivo actual
- [x] Modificar cli.js para mostrar progreso en formato compatible
- [x] Actualizar frontend con barra de progreso y nombre de archivo actual
- [x] Aplicar igual comportamiento en Creador de Sets

### 2. ADVERTENCIA FFMPEG + BOTÓN CANCELAR [EN PROGRESO]
- [ ] Mostrar advertencia en tabs si FFmpeg no está instalado, redirigir a Configuración
- [x] Agregar botón "Cancelar" en Clasificador durante procesamiento
- [x] Agregar botón "Cancelar" en Creador de Sets durante procesamiento
- [x] Agregar botón "Cancelar" en Convertidor durante procesamiento
- [x] Implementar lógica de cancelación en server.js (terminar proceso hijo)
- [ ] Verificar que la cancelación realmente funciona y detiene el proceso

### 3. EDICIÓN DE METADATA DE AUDIO [COMPLETADO]
- [x] Crear módulo de edición de metadata (src/metadata_editor.js)
- [x] Añadir nuevo tab "Auto-Tag de Música" en el dashboard
- [x] Integración con Spotify API para identificar canciones automáticamente
- [x] Escribir tags y renombrar archivos a formato "Artista - Canción.ext"
- [x] Mostrar resultados finales de identificación

### 4. EDITOR DE BPM [COMPLETADO]
- [x] Añadir nuevo tab "Editor de BPM" en el dashboard
- [x] Permitir subir archivo o carpeta
- [x] Analizar BPM de cada track
- [x] Mostrar resultados en datatable (nombre | BPM)
- [x] Permitir editar BPM y guardar en metadata (funcionalidad básica)

---

## HISTORIAL

### 2026-04-12 - Integración y mejoras del Dashboard
- Corregido error en server.js que crasheaba si FFmpeg no estaba instalado
- Implementado sistema de progreso en tiempo real para Clasificador, Sets y Convertidor
- Añadidos botones "Cancelar" en los 3 tabs principales
- Añadido tab "Editor de Metadata" con funcionalidad completa
- Añadido tab "Editor de BPM" con análisis automático
- Añadido sistema de advertencia FFmpeg en tabs que lo requieren

### 2026-04-12 - Revisión de Correcciones
- Usuario reporta que al presionar "Clasificar ahora" no ve qué se procesa
- Se identificaron 3 mejoras necesarias:
  1. Visualización de progreso (barra + archivo actual)
  2. Editor de metadata
  3. Editor de BPM

### 2026-04-12 - FASE PRUEBA COMPLETADA
- Objetivo: entregar 3 sets (warmup, peak, closing)
- Criterio: ≥ 3-5 tracks usados en evento real
