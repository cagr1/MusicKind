#!/usr/bin/env python3
"""
Style Analyzer — compares audio files against a reference collection.
Usage: python3 style_analyzer.py --reference <dir> --input <dir> [--analysis-seconds N]
Output per input file: [PROGRESS:X/Y] Processing: filename
Final output: JSON array sorted by score desc.
"""
import sys
import json
import os
import numpy as np
from pathlib import Path
from key_detection import resolve_key
from bpm_detection import resolve_bpm

AUDIO_EXTENSIONS = {'.mp3', '.wav', '.aiff', '.aif', '.flac', '.m4a'}


def find_audio_files(directory):
    result = []
    for root, _, files in os.walk(directory):
        for f in sorted(files):
            if Path(f).suffix.lower() in AUDIO_EXTENSIONS:
                result.append(os.path.join(root, f))
    return result


def _extract_audio_features(file_path, duration=None, include_tonal=False):
    import librosa
    y, sr = librosa.load(file_path, sr=22050, mono=True, duration=duration)

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    zcr = librosa.feature.zero_crossing_rate(y)
    rms = librosa.feature.rms(y=y)
    bpm_info = resolve_bpm(file_path, y, sr)
    tempo = bpm_info["bpm"]
    tempo_value = float(tempo) if tempo is not None else 0.0
    beat_strength = float(np.mean(librosa.onset.onset_strength(y=y, sr=sr)))

    vec = np.concatenate([
        np.mean(mfcc, axis=1), np.std(mfcc, axis=1),      # 26
        np.mean(chroma, axis=1),                            # 12
        np.mean(centroid, axis=1), np.std(centroid, axis=1),  # 2
        np.mean(contrast, axis=1),                          # 7
        np.mean(zcr, axis=1), np.std(zcr, axis=1),        # 2
        np.mean(rms, axis=1), np.std(rms, axis=1),        # 2
        [tempo_value],                                      # 1
        [beat_strength]                                     # 1
    ])
    return vec, bpm_info, resolve_key(file_path) if include_tonal else None


def extract_features(file_path, duration=None):
    """Return the style vector, retaining the existing public helper contract."""
    vec, _, _ = _extract_audio_features(file_path, duration)
    return vec


def cosine_similarity(a, b):
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def fit_scaler(vectors):
    """Fit per-feature z-score parameters, protecting constant dimensions."""
    matrix = np.asarray(vectors, dtype=float)
    if matrix.ndim != 2 or matrix.shape[0] == 0:
        raise ValueError("vectors must be a non-empty 2D array")
    mean = np.mean(matrix, axis=0)
    sd = np.std(matrix, axis=0)
    sd[sd < 1e-9] = 1.0
    return mean, sd


def score_sections(input_vec, ref_vectors_by_section):
    """Return calibrated per-section percentile scores and review metadata."""
    nonempty = {
        name: np.asarray(vectors, dtype=float)
        for name, vectors in ref_vectors_by_section.items()
        if len(vectors)
    }
    if not nonempty:
        return {}, None, "all-zero", {}
    combined = np.concatenate(list(nonempty.values()), axis=0)
    mean, sd = fit_scaler(combined)
    standardized = {name: (vectors - mean) / sd for name, vectors in nonempty.items()}
    query = (np.asarray(input_vec, dtype=float) - mean) / sd
    centroids = {name: np.mean(vectors, axis=0) for name, vectors in standardized.items()}
    distances = {
        name: np.linalg.norm(vectors - centroids[name], axis=1)
        for name, vectors in standardized.items()
    }
    pooled = np.concatenate(list(distances.values()))
    query_distances = {name: float(np.linalg.norm(query - centroids[name])) for name in nonempty}
    scores = {}
    for name, own_distances in distances.items():
        distribution = own_distances if len(own_distances) >= 5 else pooled
        scores[name] = round(float(np.mean(distribution >= query_distances[name])) * 100, 1)
    ref_counts = {name: int(len(vectors)) for name, vectors in nonempty.items()}
    highest = max(scores.values())
    if highest == 0:
        return scores, None, "all-zero", ref_counts
    leaders = [name for name, score in scores.items() if score == highest]
    if len(leaders) > 1:
        return scores, None, "tie", ref_counts
    return scores, leaders[0], None, ref_counts


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", default=None)
    parser.add_argument("--input", required=True)
    parser.add_argument("--analysis-seconds", type=float, default=None)
    parser.add_argument("--warmup", default=None)
    parser.add_argument("--peak", default=None)
    parser.add_argument("--closing", default=None)
    args = parser.parse_args()

    multi_mode = any([args.warmup, args.peak, args.closing])

    if multi_mode:
        # --- MODO MULTI-REFERENCE ---
        sections = {"warmup": args.warmup, "peak": args.peak, "closing": args.closing}
        ref_vectors_by_section = {}
        for section, dir_path in sections.items():
            if not dir_path:
                continue
            files = find_audio_files(dir_path)
            vecs = []
            for f in files:
                try:
                    vecs.append(extract_features(f, args.analysis_seconds))
                except Exception:
                    pass
            if vecs:
                ref_vectors_by_section[section] = np.asarray(vecs)

        if not ref_vectors_by_section:
            print(json.dumps([{"ok": False, "error": "Sin archivos en las carpetas de referencia"}], indent=2))
            sys.exit(1)

        input_files = find_audio_files(args.input)
        if not input_files:
            print(json.dumps([{"ok": False, "error": "Sin archivos en la carpeta de entrada"}], indent=2))
            sys.exit(1)

        total = len(input_files)
        results = []
        for i, f in enumerate(input_files):
            name = os.path.basename(f)
            print(f"[PROGRESS:{i+1}/{total}] Processing: {name}")
            sys.stdout.flush()
            try:
                vec, bpm_info, key_info = _extract_audio_features(f, args.analysis_seconds, include_tonal=True)
                scores, best, review, ref_counts = score_sections(vec, ref_vectors_by_section)
                results.append({
                    "file": f,
                    "warmup": scores.get("warmup", None),
                    "peak": scores.get("peak", None),
                    "closing": scores.get("closing", None),
                    "best": best,
                    "review": review,
                    "refCounts": ref_counts,
                    "bpm": bpm_info["bpm"],
                    "bpmSource": bpm_info["bpmSource"],
                    "camelot": key_info["camelot"],
                    "keySource": key_info["keySource"]
                })
            except Exception as e:
                results.append({
                    "file": f,
                    "warmup": None, "peak": None, "closing": None,
                    "best": None, "review": None,
                    "refCounts": {name: int(len(vectors)) for name, vectors in ref_vectors_by_section.items()},
                    "error": str(e)
                })

        results.sort(key=lambda x: (x.get(x["best"], 0) or 0) if x["best"] else 0, reverse=True)
        print(json.dumps(results, indent=2))

    else:
        # --- MODO SIMPLE (existente, sin cambios) ---
        ref_files = find_audio_files(args.reference)
        input_files = find_audio_files(args.input)

        if not ref_files:
            print(json.dumps([{"ok": False, "error": "Sin archivos de audio en la carpeta de referencia"}], indent=2))
            sys.exit(1)
        if not input_files:
            print(json.dumps([{"ok": False, "error": "Sin archivos de audio en la carpeta de input"}], indent=2))
            sys.exit(1)

        # Keep each reference vector; the calibrated score needs their distribution.
        ref_vectors = []
        for f in ref_files:
            try:
                ref_vectors.append(extract_features(f, args.analysis_seconds))
            except Exception:
                pass

        if not ref_vectors:
            print(json.dumps([{"ok": False, "error": "No se pudieron extraer features de los archivos de referencia"}], indent=2))
            sys.exit(1)

        ref_vectors_by_section = {"score": np.asarray(ref_vectors)}

        # Score each input file against the profile
        total = len(input_files)
        results = []
        for i, f in enumerate(input_files):
            name = os.path.basename(f)
            print(f"[PROGRESS:{i+1}/{total}] Processing: {name}")
            sys.stdout.flush()
            try:
                vec, bpm_info, key_info = _extract_audio_features(f, args.analysis_seconds, include_tonal=True)
                scores, _, _, _ = score_sections(vec, ref_vectors_by_section)
                score = scores["score"]
                results.append({
                    "ok": True,
                    "file": f,
                    "score": score,
                    "bpm": bpm_info["bpm"],
                    "bpmSource": bpm_info["bpmSource"],
                    "camelot": key_info["camelot"],
                    "keySource": key_info["keySource"]
                })
            except Exception as e:
                results.append({"ok": False, "file": f, "score": 0, "error": str(e)})

        results.sort(key=lambda x: x["score"], reverse=True)
        print(json.dumps(results, indent=2))
