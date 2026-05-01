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

AUDIO_EXTENSIONS = {'.mp3', '.wav', '.aiff', '.aif', '.flac', '.m4a'}


def find_audio_files(directory):
    result = []
    for root, _, files in os.walk(directory):
        for f in sorted(files):
            if Path(f).suffix.lower() in AUDIO_EXTENSIONS:
                result.append(os.path.join(root, f))
    return result


def extract_features(file_path, duration=None):
    import librosa
    y, sr = librosa.load(file_path, sr=22050, mono=True, duration=duration)

    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    zcr = librosa.feature.zero_crossing_rate(y)
    rms = librosa.feature.rms(y=y)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    beat_strength = float(np.mean(librosa.onset.onset_strength(y=y, sr=sr)))

    vec = np.concatenate([
        np.mean(mfcc, axis=1), np.std(mfcc, axis=1),      # 26
        np.mean(chroma, axis=1),                            # 12
        np.mean(centroid, axis=1), np.std(centroid, axis=1),  # 2
        np.mean(contrast, axis=1),                          # 7
        np.mean(zcr, axis=1), np.std(zcr, axis=1),        # 2
        np.mean(rms, axis=1), np.std(rms, axis=1),        # 2
        [float(tempo)],                                     # 1
        [beat_strength]                                     # 1
    ])
    return vec


def cosine_similarity(a, b):
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


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
        profiles = {}
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
                profiles[section] = np.mean(vecs, axis=0)

        if not profiles:
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
                vec = extract_features(f, args.analysis_seconds)
                scores = {}
                for section, profile in profiles.items():
                    sim = cosine_similarity(vec, profile)
                    scores[section] = round(max(0.0, min(1.0, sim)) * 100, 1)
                best = max(scores, key=scores.get) if scores else None
                results.append({
                    "file": f,
                    "warmup": scores.get("warmup", None),
                    "peak": scores.get("peak", None),
                    "closing": scores.get("closing", None),
                    "best": best
                })
            except Exception as e:
                results.append({
                    "file": f,
                    "warmup": None, "peak": None, "closing": None,
                    "best": None, "error": str(e)
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

        # Build reference profile (mean feature vector across all reference files)
        ref_vectors = []
        for f in ref_files:
            try:
                ref_vectors.append(extract_features(f, args.analysis_seconds))
            except Exception:
                pass

        if not ref_vectors:
            print(json.dumps([{"ok": False, "error": "No se pudieron extraer features de los archivos de referencia"}], indent=2))
            sys.exit(1)

        profile = np.mean(ref_vectors, axis=0)

        # Score each input file against the profile
        total = len(input_files)
        results = []
        for i, f in enumerate(input_files):
            name = os.path.basename(f)
            print(f"[PROGRESS:{i+1}/{total}] Processing: {name}")
            sys.stdout.flush()
            try:
                vec = extract_features(f, args.analysis_seconds)
                sim = cosine_similarity(vec, profile)
                score = round(max(0.0, min(1.0, sim)) * 100, 1)
                results.append({"ok": True, "file": f, "score": score})
            except Exception as e:
                results.append({"ok": False, "file": f, "score": 0, "error": str(e)})

        results.sort(key=lambda x: x["score"], reverse=True)
        print(json.dumps(results, indent=2))
