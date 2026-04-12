OBJETIVO GLOBAL
Entregar 3 sets (warmup, peak, closing) que un DJ use en un evento real a partir de 15–20 tracks base y un pack nuevo, con clasificación directa en 3 categorías y salida en listas listas para tocar.

ENTRADAS Y ESTRUCTURA
- data/dj_tracks/warmup
- data/dj_tracks/peak
- data/dj_tracks/closing
- data/new_pack
- src/audio_features.py
- src/run_classification.py
- output/
- feedback.txt

FASE ACTUAL — PRUEBA
Qué se hace: clasificar manualmente los 15–20 tracks base en warmup/peak/closing, ejecutar clasificación del pack nuevo y entregar 3 salidas finales.
Qué NO se hace: no usar metadata externa, no optimizar, no agregar features, no UI.
Criterio de éxito (numérico): ≥ 3–5 tracks usados en evento real.

CHECKLIST EJECUTABLE
Día 1
- [ ] Colocar los 15–20 tracks base del DJ dentro de `data/dj_tracks/warmup`, `data/dj_tracks/peak`, `data/dj_tracks/closing`.

Día 2
- [ ] Colocar el pack nuevo en `data/new_pack`.

Día 3
- [ ] Ejecutar `python3 src/run_classification.py`.

Día 4
- [ ] Revisar `output/warmup.txt`, `output/peak.txt`, `output/closing.txt`.

Día 5
- [ ] Entregar `output/warmup.txt`, `output/peak.txt`, `output/closing.txt` al DJ.

Día 6–7
- [ ] Registrar en `feedback.txt` cuántos tracks usó.
- [ ] Registrar en `feedback.txt` en qué parte del set los usó.
- [ ] Registrar en `feedback.txt` cuáles ignoró.

ESTADO ACTUAL
- Fase actual: PRUEBA
- Objetivo activo: generar sets utilizables
- Métrica clave: tracks usados en evento

CRITERIOS DE DECISIÓN
- Si usa ≥ 3–5 tracks en evento → continuar.
- Si usa 1–2 tracks → iterar selección manual y repetir prueba.
- Si no usa ninguno → descartar y rehacer selección manual.

PROHIBICIONES
- No escalar a librerías grandes.
- No optimizar algoritmos.
- No construir UI.
- No usar metadata externa.
- No agregar features.

SIGUIENTE PASO (SI TODO FUNCIONA)
Ejecutar la misma clasificación con un segundo pack nuevo y comparar uso real en evento.
