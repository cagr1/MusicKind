# MusicKind - Plan de Desarrollo

## ESTADO ACTUAL (12/04/2026)

### PROBLEMAS REPORTADOS POR USUARIO (CRÍTICOS)
1. **Toggle de idioma** - [EN PROGRESO] Mover a parte inferior del sidebar como "ES | EN"
2. **Validación archivos** - [PENDIENTE] Validación ESTRICTA solo audio en convertidor
3. **Eliminar archivos** - [PENDIENTE] Botón × en cada archivo para eliminar
4. **Auto-tag error** - [PENDIENTE] Fix "Directory not found: archivo.mp3"
5. **BPM analyzer** - [PENDIENTE] Verificar que funciona correctamente

### CAMBIOS REALIZADOS ESTA SESIÓN
- [x] Toggle idioma movido a footer del sidebar "ES | EN" con estilo visible
- [x] applyLanguage() ya no referencing brand-subtitle que no existe
- [x] Removido código de langIcon que ya no se usa

---

## TAREAS PENDIENTES

### 1. VISUALIZACIÓN DE PROCESAMIENTO [COMPLETADO]
- [x] Analizar estructura actual
- [x] Modificar server.js para enviar progreso del archivo actual
- [x] Modificar cli.js para mostrar progreso en formato compatible
- [x] Actualizar frontend con barra de progreso y nombre de archivo actual
- [x] Aplicar igual comportamiento en Creador de Sets

### 2. ADVERTENCIA FFMPEG + BOTÓN CANCELAR [COMPLETADO]
- [x] Mostrar advertencia en tabs si FFmpeg no está instalado
- [x] Agregar botón "Cancelar" en Clasificador
- [x] Agregar botón "Cancelar" en Creador de Sets
- [x] Agregar botón "Cancelar" en Convertidor
- [x] Implementar lógica de cancelación en server.js
- [ ] Verificar que la cancelación realmente funciona

### 3. EDICIÓN DE METADATA DE AUDIO [COMPLETADO]
- [x] Crear módulo de edición de metadata (src/metadata_editor.js)
- [x] Añadir nuevo tab "Auto-Tag de Música"
- [x] Integración con Spotify API
- [x] Escribir tags y renombrar archivos
- [ ] Fix: "Directory not found" error - necesita ruta de carpeta

### 4. EDITOR DE BPM [COMPLETADO]
- [x] Añadir tab "Editor de BPM"
- [x] Permitir subir carpeta
- [x] Analizar BPM
- [x] Mostrar resultados en tabla
- [ ] Verificar que análisis funciona correctamente

### 5. VALIDACIÓN ESTRICTA DE ARCHIVOS [PENDIENTE]
- [ ] Implementar validación solo archivos de audio en TODOS los inputs
- [ ] Mostrar error si se sube archivo no válido
- [ ] Prevenir subida de archivos peligrosos (.exe, .sh, .pdf, etc.)
- [ ] Agregar botón eliminar en cada archivo

### 6. UI/UX IDIOMA [EN PROGRESO]
- [x] Toggle EN | ES visible en parte inferior del sidebar
- [ ] Cambio instantáneo sin recargar página
- [ ] Estilo visible (no oscuro)

---

## HISTORIAL

### 2026-04-12 - Correcciones de UX/UI
- Iconos con Iconify (Material Design)
- Toggle idioma con icono translate
- Instrucciones claras en Set Creator
- Más formatos en convertidor (FLAC, M4A)
- Timeout en check FFmpeg

### 2026-04-12 - Integración Dashboard
- Toast notifications
- Drag & drop zones
- Progreso en tiempo real
- Sistema de cancelación

### 2026-04-12 - FASE PRUEBA COMPLETADA
- Objetivo: entregar 3 sets (warmup, peak, closing)
- Criterio: ≥ 3-5 tracks usados en evento real
