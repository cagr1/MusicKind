#!/usr/bin/env python3
"""Read-only BPM detector comparison against BPM tags in the 2026 collection."""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
import os
import shutil
import subprocess
import time
from collections import Counter
from pathlib import Path

# Keep Numba's JIT cache in the workspace; the app venv itself is read-only here.
os.environ.setdefault("NUMBA_CACHE_DIR", str(Path(__file__).resolve().parents[1] / ".cache/eval/numba"))
import numpy as np

AUDIO_EXTS = {".aiff", ".aif", ".mp3", ".flac", ".wav", ".m4a", ".ogg", ".opus"}
SAMPLE_RATE = 22050
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"


def files_under(folder: Path):
    return sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTS)


def read_bpm_tag(path: Path):
    try:
        probe = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format_tags:stream_tags", "-of", "json", str(path)],
            capture_output=True, text=True, check=True,
        )
        metadata = json.loads(probe.stdout)
        candidates = []
        tag_sets = [metadata.get("format", {}).get("tags", {})]
        tag_sets += [stream.get("tags", {}) for stream in metadata.get("streams", [])]
        for tags in tag_sets:
            for key, value in tags.items():
                if key.lower() in {"tbpm", "bpm", "tmpo"}:
                    candidates.append(value)
        for value in candidates:
            try:
                bpm = float(str(value).strip())
            except (TypeError, ValueError):
                continue
            if np.isfinite(bpm) and bpm > 0:
                return bpm
    except Exception:
        return None
    return None


def load_audio(path: Path, window: str):
    args = [FFMPEG, "-v", "error", "-i", str(path)]
    if window == "center60":
        probe = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, check=True,
        )
        duration = float(probe.stdout.strip())
        args += ["-ss", f"{max(0.0, duration / 2 - 30.0):.6f}", "-t", "60"]
    args += ["-map", "0:a:0", "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"]
    result = subprocess.run(args, capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def librosa_beat(y):
    import librosa
    librosa.cache.level = 0
    tempo, _ = librosa.beat.beat_track(y=y, sr=SAMPLE_RATE, hop_length=512)
    return float(np.asarray(tempo).reshape(-1)[0])


def librosa_fine(y):
    import librosa
    librosa.cache.level = 0
    hop = 128
    onset = librosa.onset.onset_strength(y=y, sr=SAMPLE_RATE, hop_length=hop)
    tg = librosa.feature.tempogram(onset_envelope=onset, sr=SAMPLE_RATE, hop_length=hop)
    curve = np.mean(tg, axis=1)
    # Convert lag bins to BPM, then refine the strongest interior peak with a parabola.
    bpm = librosa.tempo_frequencies(len(curve), sr=SAMPLE_RATE, hop_length=hop)
    valid = np.flatnonzero((bpm >= 30) & (bpm <= 300))
    if not len(valid):
        raise ValueError("tempograma sin frecuencias BPM utilizables")
    peak = int(valid[np.argmax(curve[valid])])
    if 0 < peak < len(curve) - 1:
        left, center, right = curve[peak - 1:peak + 2]
        denom = left - 2 * center + right
        offset = float(0.5 * (left - right) / denom) if denom else 0.0
        if abs(offset) <= 1:
            refined_lag = peak + offset
            estimate = 60.0 * SAMPLE_RATE / (hop * refined_lag) if refined_lag else bpm[peak]
        else:
            estimate = bpm[peak]
    else:
        estimate = bpm[peak]
    return float(estimate)


def engine_setup():
    engines = ["librosa-beat", "librosa-fine"]
    errors = {}
    import importlib.util
    for optional in ("deeprhythm", "tempocnn"):
        if importlib.util.find_spec(optional) is None:
            errors[optional] = "No instalado en el venv; motor opcional omitido (sin instalación adicional)."
    try:
        import essentia.standard as es
        engines += ["essentia-rhythm", "essentia-percival"]
        return engines, errors, es
    except Exception as exc:
        errors["essentia"] = f"{type(exc).__name__}: {exc}"
        return engines, errors, None


def detect(engine, y, essentia):
    if engine == "librosa-beat":
        return librosa_beat(y)
    if engine == "librosa-fine":
        return librosa_fine(y)
    if engine == "essentia-rhythm":
        import librosa
        audio = librosa.resample(y, orig_sr=SAMPLE_RATE, target_sr=44100).astype(np.float32)
        bpm, _confidence, *_ = essentia.RhythmExtractor2013(method="multifeature")(audio)
        return float(bpm)
    if engine == "essentia-percival":
        import librosa
        audio = librosa.resample(y, orig_sr=SAMPLE_RATE, target_sr=44100).astype(np.float32)
        return float(essentia.PercivalBpmEstimator(sampleRate=44100)(audio))
    raise ValueError(f"Motor desconocido: {engine}")


def corrected_error(truth, prediction):
    ratios = (1.0, 0.5, 2.0, 2.0 / 3.0, 1.5)
    return min(abs(prediction * ratio - truth) for ratio in ratios)


def cache_file(root, path, st, engine, window):
    identity = f"{path.resolve()}|{st.st_size}|{st.st_mtime_ns}|{engine}|{window}|v1"
    return root / f"{hashlib.sha1(identity.encode()).hexdigest()}.json"


def evaluate_one(path, st, engine, window, truth, audio, decode_error, cache_root, essentia):
    dest = cache_file(cache_root, path, st, engine, window)
    if dest.exists():
        saved = json.loads(dest.read_text())
        return engine, window, saved["prediction"], float(saved["seconds"]), None, True
    if decode_error:
        return engine, window, None, 0.0, decode_error, False
    try:
        started = time.perf_counter()
        pred = detect(engine, audio, essentia)
        elapsed = time.perf_counter() - started
        dest.write_text(json.dumps({"prediction": pred, "seconds": elapsed}))
        return engine, window, pred, elapsed, None, False
    except Exception as exc:
        return engine, window, None, 0.0, f"{type(exc).__name__}: {exc}", False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="/Volumes/Mac Backup/MUSIC BACKUP/2026")
    ap.add_argument("--limit", type=int, default=0, help="0 = todas las pistas")
    ap.add_argument("--cache", default=".cache/eval/bpm")
    ap.add_argument("--report", default=".cache/eval/bpm-report")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()
    input_root = Path(args.input).expanduser().resolve()
    if not input_root.is_dir():
        raise SystemExit(f"No existe el directorio de entrada: {input_root}")
    tracks = [(p, tag) for p in files_under(input_root) if (tag := read_bpm_tag(p)) is not None]
    if args.limit > 0:
        tracks = tracks[:args.limit]
    engines, unavailable, es = engine_setup()
    windows = ("center60", "full")
    cache_root, report_base = Path(args.cache), Path(args.report)
    cache_root.mkdir(parents=True, exist_ok=True)
    report_base.parent.mkdir(parents=True, exist_ok=True)
    results = {f"{engine}/{window}": {"engine": engine, "window": window, "errors": [], "times": [], "predictions": [], "cached": 0}
               for engine in engines for window in windows}
    for index, (path, truth) in enumerate(tracks, 1):
        print(f"[{index}/{len(tracks)}] {path.name}", flush=True)
        st = path.stat()
        audio_by_window = {}
        decode_errors = {}
        needed_windows = {window for window in windows
                          if any(not cache_file(cache_root, path, st, engine, window).exists() for engine in engines)}
        for window in needed_windows:
            try:
                audio_by_window[window] = load_audio(path, window)
                if not len(audio_by_window[window]):
                    raise ValueError("ffmpeg devolvió audio vacío")
            except Exception as exc:
                decode_errors[window] = f"{type(exc).__name__}: {exc}"
        futures = []
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            for engine in engines:
                for window in windows:
                    futures.append(pool.submit(evaluate_one, path, st, engine, window, truth,
                                               audio_by_window.get(window), decode_errors.get(window), cache_root, es))
            for future in as_completed(futures):
                engine, window, pred, elapsed, error, cached = future.result()
                key = f"{engine}/{window}"
                if error:
                    results[key]["errors"].append({"file": str(path), "error": error})
                elif pred is not None:
                    results[key]["times"].append(elapsed)
                    results[key]["predictions"].append({"file": str(path), "truth": truth, "prediction": pred})
                    results[key]["cached"] += int(cached)
    payload_results = {}
    for key, result in results.items():
        rows = result.pop("predictions")
        errors = result.pop("errors")
        exact = {f"±{threshold:g}": sum(abs(r["prediction"] - r["truth"]) <= threshold for r in rows) for threshold in (0.5, 1, 2)}
        octave = sum(any(abs(r["prediction"] * ratio - r["truth"]) <= 1 for ratio in (0.5, 2, 2 / 3, 1.5)) for r in rows)
        corrected = [corrected_error(r["truth"], r["prediction"]) for r in rows]
        popular = Counter(round(r["prediction"], 1) for r in rows).most_common(1)
        result.update({"evaluated": len(rows), "tagged_tracks": len(tracks), "exact_counts": exact,
                       "octave_error_count": octave, "mean_abs_error_octave_corrected": float(np.mean(corrected)) if corrected else None,
                       "most_common_prediction": popular[0][0] if popular else None,
                       "most_common_prediction_pct": 100 * popular[0][1] / len(rows) if rows else None,
                       "mean_seconds_per_track": float(np.mean(result["times"])) if result["times"] else None,
                       "times": None, "failures": len(errors), "error_examples": errors[:5]})
        payload_results[key] = result
    payload = {"input": str(input_root), "tagged_tracks": len(tracks), "engines": engines,
               "unavailable": unavailable, "results": payload_results}
    json_path, md_path = report_base.with_suffix(".json"), report_base.with_suffix(".md")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    lines = ["# Evaluación de motores de BPM", "", f"Conjunto: `{input_root}` · pistas con BPM tag válido: **{len(tracks)}**", "",
             "Ventanas: 60 s centrados y pista entera. Decodificación ffmpeg por pipe; `/Volumes` solo se lee.", "",
             "| Motor / ventana | N | ±0.5 | ±1 | ±2 | Error octava (±1 BPM tras corrección) | MAE corregido | Predicción más repetida | s/pista | Fallos | Caché |",
             "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for key, r in payload_results.items():
        n = r["evaluated"]
        pct = lambda count: f"{100 * count / n:.1f}%" if n else "—"
        popular = f"{r['most_common_prediction']:.1f} ({r['most_common_prediction_pct']:.1f}%)" if n and r["most_common_prediction"] is not None else "—"
        lines.append(f"| {key} | {n} | {pct(r['exact_counts']['±0.5'])} | {pct(r['exact_counts']['±1'])} | {pct(r['exact_counts']['±2'])} | {pct(r['octave_error_count'])} | {r['mean_abs_error_octave_corrected']:.2f} | {popular} | {r['mean_seconds_per_track']:.2f} | {r['failures']} | {r['cached']} |" if n else f"| {key} | 0 | — | — | — | — | — | — | — | {r['failures']} | {r['cached']} |")
    lines += ["", "## Disponibilidad de motores", ""] + ([f"- **{k}:** {v}" for k, v in unavailable.items()] or ["- Todos los motores requeridos disponibles."])
    lines += ["", "## Fallos por motor", ""]
    for key, r in payload_results.items():
        lines += [f"### {key}", ""] + ([f"- `{e['file']}` — {e['error']}" for e in r["error_examples"]] or ["- Sin fallos."]) + [""]
    md_path.write_text("\n".join(lines) + "\n")
    print(f"Reporte: {md_path}\nJSON: {json_path}\nPistas: {len(tracks)}")


if __name__ == "__main__":
    main()
