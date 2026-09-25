#!/usr/bin/env python3
"""Read-only comparison of musical-key detectors against tagged 2026 tracks."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from key_detection import (  # noqa: E402
    CAMELOT_BY_PITCH_AND_MODE,
    detect_key,
    detect_key_from_file,
    detect_key_keyfinder,
    keyfinder_binary_path,
    parse_key,
)

AUDIO_EXTS = {".aiff", ".aif", ".mp3", ".flac", ".wav", ".m4a", ".ogg", ".opus"}
SAMPLE_RATE = 44100
FFMPEG = shutil.which("ffmpeg") or "/opt/homebrew/bin/ffmpeg"
FFPROBE = shutil.which("ffprobe") or "/opt/homebrew/bin/ffprobe"


def files_under(folder: Path):
    return sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTS)


def cache_file(cache_root: Path, path: Path, st, engine: str, window: str):
    identity = f"{path.resolve()}|{st.st_size}|{st.st_mtime_ns}|{engine}|{window}|v1"
    return cache_root / f"{hashlib.sha1(identity.encode()).hexdigest()}.json"


def normalize_key(name, mode=None):
    if not name:
        return None
    if mode and str(mode).lower() in {"minor", "major"}:
        name = f"{name}{'m' if str(mode).lower() == 'minor' else ''}"
    return parse_key(str(name))


def load_audio(path: Path, window: str):
    """Decode without creating files; select the centered 120 s where requested."""
    args = [FFMPEG, "-v", "error", "-i", str(path), "-map", "0:a:0", "-vn"]
    if window == "center120":
        probe = subprocess.run(
            [FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)],
            capture_output=True, text=True, check=True,
        )
        duration = float(probe.stdout.strip())
        offset = max(0.0, duration / 2 - 60.0)
        args += ["-ss", f"{offset:.6f}", "-t", "120"]
    args += ["-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "pipe:1"]
    result = subprocess.run(args, capture_output=True, check=True)
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def detect(engine, path, window, essentia_extractors=None):
    if engine == "libkeyfinder":
        return detect_key_keyfinder(str(path))
    if engine == "librosa" and window == "center120":
        return detect_key_from_file(str(path))
    audio = load_audio(path, window)
    if not len(audio):
        raise ValueError("ffmpeg devolvió audio vacío")
    if engine == "librosa":
        import librosa
        y = librosa.resample(audio, orig_sr=SAMPLE_RATE, target_sr=22050)
        return detect_key(y, 22050)
    if engine.startswith("essentia:"):
        profile = engine.split(":", 1)[1]
        key, scale, _strength = essentia_extractors[profile](audio.astype(np.float32))
        return normalize_key(key, scale)
    raise ValueError(f"Motor desconocido: {engine}")


def engine_setup():
    engines = ["librosa"]
    errors = {}
    essentia_extractors = None
    try:
        import essentia.standard as es
        essentia_extractors = {p: es.KeyExtractor(profileType=p, sampleRate=SAMPLE_RATE) for p in ("edma", "bgate", "temperley")}
        engines.extend(f"essentia:{p}" for p in essentia_extractors)
    except Exception as exc:
        errors["essentia"] = f"{type(exc).__name__}: {exc}"
    binary = keyfinder_binary_path()
    if binary and os.path.isfile(binary) and os.access(binary, os.X_OK):
        engines.append("libkeyfinder")
    else:
        errors["libkeyfinder"] = "Binario incluido no disponible"
    return engines, errors, essentia_extractors


def related(truth, prediction):
    if not truth or not prediction:
        return {"exact": False, "relative": False, "fifth": False, "compatible": False, "error": "unknown"}
    a, b = truth["camelot"], prediction["camelot"]
    na, nb = int(a[:-1]), int(b[:-1])
    same_number = na == nb
    same_mode = a[-1] == b[-1]
    fifth = same_mode and ((na - nb) % 12 in (1, 11))
    compatible = truth["camelot"] == prediction["camelot"] or same_number or fifth
    return {"exact": a == b, "relative": same_number and not same_mode, "fifth": fifth,
            "compatible": compatible, "error": "major" if not compatible else "minor" if not (a == b) else "none"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", default="/Volumes/Mac Backup/MUSIC BACKUP/2026")
    ap.add_argument("--limit", type=int, default=0, help="0 = todas las pistas")
    ap.add_argument("--cache", default=".cache/eval/key")
    ap.add_argument("--report", default=".cache/eval/key-report")
    args = ap.parse_args()
    input_root = Path(args.input).expanduser().resolve()
    if not input_root.is_dir():
        raise SystemExit(f"No existe el directorio de entrada: {input_root}")
    tracks = files_under(input_root)
    rows = []
    for path in tracks:
        tag = parse_key(__import__("key_detection").read_tag_key(path))
        if tag:
            rows.append((path, tag))
    if args.limit > 0:
        rows = rows[:args.limit]
    engines, errors, extractors = engine_setup()
    windows = ("center120", "full")
    cache_root = Path(args.cache)
    report_base = Path(args.report)
    report_base.parent.mkdir(parents=True, exist_ok=True)
    cache_root.mkdir(parents=True, exist_ok=True)
    results = {f"{engine}/{window}": {"engine": engine, "window": window, "counts": Counter(), "confusions": Counter(), "exceptions": Counter(), "times": [], "cached": 0, "rows": []}
               for engine in engines for window in windows}
    failed = Counter()
    for index, (path, truth) in enumerate(rows, 1):
        st = path.stat()
        print(f"[{index}/{len(rows)}] {path.name}", flush=True)
        for engine in engines:
            for window in windows:
                key = f"{engine}/{window}"
                dest = cache_file(cache_root, path, st, engine, window)
                started = time.perf_counter()
                try:
                    if dest.exists():
                        cached_value = json.loads(dest.read_text())
                        pred = cached_value.get("prediction")
                        elapsed = float(cached_value.get("seconds", 0.0))
                        results[key]["cached"] += 1
                    else:
                        started = time.perf_counter()
                        pred = detect(engine, path, window, extractors)
                        elapsed = time.perf_counter() - started
                        pred = pred if isinstance(pred, dict) else None
                        dest.write_text(json.dumps({"prediction": pred, "seconds": elapsed}, ensure_ascii=False))
                    metrics = related(truth, pred)
                    res = results[key]
                    for name in ("exact", "relative", "fifth", "compatible"):
                        res["counts"][name] += int(metrics[name])
                    res["counts"]["major_error"] += int(metrics["error"] == "major")
                    res["counts"]["minor_error"] += int(metrics["error"] == "minor")
                    res["counts"]["no_prediction"] += int(pred is None)
                    if pred is None or pred["camelot"] != truth["camelot"]:
                        res["confusions"][f"{truth['camelot']} → {pred['camelot'] if pred else '—'}"] += 1
                    res["times"].append(elapsed)
                    res["rows"].append({"file": str(path), "truth": truth["camelot"], "prediction": pred["camelot"] if pred else None})
                except Exception as exc:
                    failed[key] += 1
                    message = f"{type(exc).__name__}: {exc}"
                    results[key]["exceptions"][message] += 1
                    results[key]["rows"].append({"file": str(path), "truth": truth["camelot"], "error": message})

    for value in results.values():
        n = len(rows)
        value["counts"] = dict(value["counts"])
        value["confusions"] = value["confusions"].most_common(10)
        value["exceptions"] = value["exceptions"].most_common(3)
        value["mean_seconds"] = float(np.mean(value["times"])) if value["times"] else 0.0
        value["evaluated"] = sum("prediction" in row for row in value["rows"])
        del value["times"]
    payload = {"input": str(input_root), "tagged_tracks": len(rows), "engines": engines, "unavailable": errors,
               "failed": dict(failed), "results": results}
    json_path = report_base.with_suffix(".json")
    md_path = report_base.with_suffix(".md")
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n")
    lines = ["# Evaluación de motores de tonalidad", "", f"Conjunto: `{input_root}` · pistas con tag interpretable: **{len(rows)}**", "",
             "Ventana centrada: hasta 120 s. Audio decodificado por ffmpeg a pipe; el conjunto se trata como solo lectura.", "",
             "Error mayor = predicción incompatible; error menor = compatible pero no exacta. Compatible = exacta, relativa (mismo número, modo opuesto) o quinta (±1 número, mismo modo).", "",
             "## Resultados", "", "| Motor / ventana | N | Exacto | Relativo | Quinta | Compatible | Error mayor | Error menor | Sin predicción | Fallos | s/pista | Cache hits |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for key, value in results.items():
        n = value["evaluated"]
        counts = value["counts"]
        pct = lambda item: f"{100 * counts.get(item, 0) / n:.1f}%" if n else "—"
        failures = failed.get(key, 0)
        failure_pct = f"{100 * failures / n:.1f}%" if n else "—"
        lines.append(f"| {key} | {n} | {pct('exact')} | {pct('relative')} | {pct('fifth')} | {pct('compatible')} | {pct('major_error')} | {pct('minor_error')} | {pct('no_prediction')} | {failure_pct} | {value['mean_seconds']:.2f} | {value['cached']} |")
    lines += ["", "## Errores por motor (3 mensajes más frecuentes)", ""]
    for key, value in results.items():
        lines += [f"### {key}", ""] + ([f"- `{message}`: {count}" for message, count in value["exceptions"]] or ["- Sin fallos."]) + [""]
    lines += ["", "## Errores de instalación / disponibilidad", ""]
    lines += [f"- **{name}:** {error}" for name, error in errors.items()] or ["- Ninguno."]
    lines += ["", "## Confusiones más frecuentes", ""]
    for key, value in results.items():
        lines += [f"### {key}", ""] + ([f"- {pair}: {count}" for pair, count in value["confusions"]] or ["- Sin resultados."]) + [""]
    md_path.write_text("\n".join(lines) + "\n")
    print(f"Reporte: {md_path}\nJSON: {json_path}\nPistas: {len(rows)} · fallos: {sum(failed.values())}")


if __name__ == "__main__":
    main()
