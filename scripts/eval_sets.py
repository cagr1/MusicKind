#!/usr/bin/env python3
"""Read-only five-partition evaluation of the old cosine and calibrated set scores."""
import argparse
import hashlib
import json
import random
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from style_analyzer import cosine_similarity, extract_features, score_sections

AUDIO_EXTENSIONS = {".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a"}
SECTIONS = {"deep house": "deep house", "Tech house": "Tech house", "minimal : deep tech": "minimal : deep tech"}


def audio_files(folder):
    return sorted(p for p in folder.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTENSIONS)


def cached_vector(path, cache_root, duration):
    stat = path.stat()
    key = hashlib.sha256(f"{path}:{stat.st_size}:{stat.st_mtime_ns}:{duration}".encode()).hexdigest()
    cache = cache_root / f"{key}.npy"
    if cache.exists():
        return np.load(cache)
    vector = extract_features(str(path), duration)
    cache_root.mkdir(parents=True, exist_ok=True)
    np.save(cache, vector)
    return vector


def cosine_scores(query, refs_by_section):
    scores = {}
    for section, refs in refs_by_section.items():
        center = np.mean(refs, axis=0)
        scores[section] = round(max(0.0, min(1.0, cosine_similarity(query, center))) * 100, 1)
    return scores, max(scores, key=scores.get)


def metrics(rows, section_names):
    n = len(rows)
    correct = sum(row["predicted"] == row["actual"] for row in rows) / n
    decided = [row for row in rows if row["predicted"] is not None]
    correct_scores = [row["scores"].get(row["actual"], 0.0) for row in rows]
    other_scores = [row["scores"].get(name, 0.0) for row in rows for name in section_names if name != row["actual"]]
    all_scores = [row["scores"].get(name, 0.0) for row in rows for name in section_names]
    return {
        "best_accuracy_pct": round(correct * 100, 1),
        "review_pct": round(sum(row["predicted"] is None for row in rows) / n * 100, 1),
        "decided_accuracy_pct": round(sum(row["predicted"] == row["actual"] for row in decided) / len(decided) * 100, 1) if decided else "—",
        "mean_correct_section_score": round(float(np.mean(correct_scores)), 1),
        "mean_other_section_score": round(float(np.mean(other_scores)), 1),
        "score_stddev": round(float(np.std(all_scores)), 1),
        "scores_ge_90_pct": round(float(np.mean(np.asarray(all_scores) >= 90)) * 100, 1),
        "evaluated_inputs": n,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path("/Volumes/Mac Backup/MUSIC BACKUP/2026"))
    parser.add_argument("--cache", type=Path, default=ROOT / ".cache/eval/sets")
    parser.add_argument("--report", type=Path, default=ROOT / ".cache/eval/sets-report.md")
    args = parser.parse_args()
    folders = {name: args.root / folder for name, folder in SECTIONS.items()}
    files = {name: audio_files(path) for name, path in folders.items()}
    if any(not paths for paths in files.values()):
        raise SystemExit("No audio found in one or more required section folders: " + str({k: len(v) for k, v in files.items()}))
    rng = random.Random(42)
    tech_sample = rng.sample(files["Tech house"], min(20, len(files["Tech house"])))
    files["Tech house"] = sorted(tech_sample)
    print("Audio per section after fixed Tech house sample:", {k: len(v) for k, v in files.items()}, flush=True)
    vectors = {}
    all_files = [(section, path) for section, paths in files.items() for path in paths]
    for index, (section, path) in enumerate(all_files, 1):
        print(f"[PROGRESS:{index}/{len(all_files)}] Processing: {path.name}", flush=True)
        try:
            vectors[(section, path)] = cached_vector(path, args.cache, 30)
        except Exception as exc:
            print(f"SKIP {path}: {exc}", file=sys.stderr, flush=True)
    available = {name: [p for p in paths if (name, p) in vectors] for name, paths in files.items()}
    if any(len(paths) < 2 for paths in available.values()):
        raise SystemExit("Need at least two successfully analyzed tracks per section: " + str({k: len(v) for k, v in available.items()}))

    rows_old, rows_new = [], []
    for fold in range(5):
        fold_rng = random.Random(42 + fold)
        refs, probes = {}, {}
        for section, paths in available.items():
            shuffled = list(paths)
            fold_rng.shuffle(shuffled)
            ref_count = max(1, min(len(shuffled) - 1, round(len(shuffled) * 0.6)))
            refs[section] = np.asarray([vectors[(section, p)] for p in shuffled[:ref_count]])
            probes[section] = shuffled[ref_count:]
        for actual, paths in probes.items():
            for path in paths:
                query = vectors[(actual, path)]
                old_scores, old_best = cosine_scores(query, refs)
                new_scores, new_best, review_reason, _ref_counts = score_sections(query, refs)
                rows_old.append({"actual": actual, "predicted": old_best, "scores": old_scores})
                rows_new.append({"actual": actual, "predicted": new_best, "scores": new_scores, "review_reason": review_reason})

    old, new = metrics(rows_old, list(files)), metrics(rows_new, list(files))
    lines = ["# Set score evaluation", "", "- Dataset: `" + str(args.root) + "` (read-only)",
             "- Features: `extract_features`, `--analysis-seconds 30`; cache keyed by path, size, mtime, duration.",
             "- Fixed Tech house sample: 20 tracks, seed 42.", "- Five 60/40 partitions, seeds 42–46.",
             "- Tracks analyzed: " + str({k: len(v) for k, v in available.items()}), "",
             "| Metric | Old cosine | New percentile |", "|---|---:|---:|"]
    labels = [("best_accuracy_pct", "Best accuracy (%)"), ("review_pct", "Por revisar (%)"),
              ("decided_accuracy_pct", "Accuracy on decided (%)"), ("mean_correct_section_score", "Mean score, correct section"),
              ("mean_other_section_score", "Mean score, other sections"), ("score_stddev", "Score standard deviation"),
              ("scores_ge_90_pct", "Scores ≥ 90 (%)"), ("evaluated_inputs", "Evaluated inputs")]
    lines += [f"| {label} | {'—' if key in ('review_pct', 'decided_accuracy_pct') else old[key]} | {new[key]} |" for key, label in labels]
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines), flush=True)
    print(f"Report written: {args.report}", flush=True)


if __name__ == "__main__":
    main()
