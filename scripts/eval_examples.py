#!/usr/bin/env python3
"""Read-only evaluation of the curated 2026 examples against outside tracks."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import random
import time
from collections import Counter
from pathlib import Path

os.environ.setdefault('NUMBA_CACHE_DIR', '/private/tmp/musickind-numba-cache')
Path(os.environ['NUMBA_CACHE_DIR']).mkdir(parents=True, exist_ok=True)
import librosa
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score, recall_score
from sklearn.model_selection import StratifiedKFold, cross_val_predict
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

EXTS = {'.aiff', '.aif', '.mp3', '.flac', '.wav', '.m4a'}
EXAMPLE_CLASSES = ['Tech house', 'house', 'Indie dance', 'minimal : deep tech', 'Afro House', 'deep house']
NEGATIVE_DIRS = ['Melodic Techno', 'Progressive House', 'Melodic House : Techno', 'Dance Pop']


def audio_files(folder):
    return sorted(p for p in Path(folder).rglob('*') if p.is_file() and p.suffix.lower() in EXTS)


def cache_path(root, backend, path):
    st = path.stat()
    digest = hashlib.sha1(f'{path}|{st.st_size}|{st.st_mtime}'.encode()).hexdigest()
    dest = root / backend / f'{digest}.npy'
    dest.parent.mkdir(parents=True, exist_ok=True)
    return dest


def center_audio(path, sr):
    y, source_sr = librosa.load(str(path), sr=sr, mono=True)
    if len(y) > 30 * sr:
        start = max(0, (len(y) - 30 * sr) // 2)
        y = y[start:start + 30 * sr]
    return y


def librosa_vector(path):
    # Match src/style_analyzer.py's 53 dimensions; analyze the centered 30 s.
    y = center_audio(path, 22050)
    sr = 22050
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=13)
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    zcr = librosa.feature.zero_crossing_rate(y)
    rms = librosa.feature.rms(y=y)
    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    beat_strength = float(np.mean(librosa.onset.onset_strength(y=y, sr=sr)))
    return np.concatenate([np.mean(mfcc, axis=1), np.std(mfcc, axis=1), np.mean(chroma, axis=1),
                           np.mean(centroid, axis=1), np.std(centroid, axis=1), np.mean(contrast, axis=1),
                           np.mean(zcr, axis=1), np.std(zcr, axis=1), np.mean(rms, axis=1),
                           np.std(rms, axis=1), [float(np.asarray(tempo).reshape(-1)[0])], [beat_strength]])


def load_transformer_models(backend, device):
    import torch
    if backend == 'clap':
        from transformers import ClapModel, ClapProcessor
        processor = ClapProcessor.from_pretrained('laion/clap-htsat-unfused')
        model = ClapModel.from_pretrained('laion/clap-htsat-unfused').to(device).eval()
    else:
        from transformers import AutoModel, Wav2Vec2FeatureExtractor
        processor = Wav2Vec2FeatureExtractor.from_pretrained('m-a-p/MERT-v1-95M', trust_remote_code=True)
        model = AutoModel.from_pretrained('m-a-p/MERT-v1-95M', trust_remote_code=True).to(device).eval()
    return torch, processor, model


def transformer_vector(path, backend, bundle, device):
    torch, processor, model = bundle
    sr = 48000 if backend == 'clap' else 24000
    y = center_audio(path, sr)
    with torch.inference_mode():
        if backend == 'clap':
            inp = processor(audios=y, sampling_rate=sr, return_tensors='pt')
            inp = {k: v.to(device) for k, v in inp.items()}
            vec = model.get_audio_features(**inp)
            vec = torch.nn.functional.normalize(vec, p=2, dim=-1)
        else:
            inp = processor(y, sampling_rate=sr, return_tensors='pt')
            inp = {k: v.to(device) for k, v in inp.items()}
            out = model(**inp, output_hidden_states=True)
            vec = out.hidden_states[-1].mean(dim=1)
            vec = torch.nn.functional.normalize(vec, p=2, dim=-1)
    return vec[0].detach().cpu().numpy().astype(np.float32)


def collect(paths, backend, cache_root, transformer_bundle, device):
    rows, elapsed, cached = [], [], 0
    for i, path in enumerate(paths, 1):
        dest = cache_path(cache_root, backend, path)
        if dest.exists():
            rows.append(np.load(dest))
            elapsed.append(0.0)
            cached += 1
        else:
            t0 = time.perf_counter()
            vec = (librosa_vector(path) if backend == 'librosa' else
                   transformer_vector(path, backend, transformer_bundle, device))
            elapsed.append(time.perf_counter() - t0)
            np.save(dest, vec)
            rows.append(vec)
        print(f'[{backend} {i}/{len(paths)}] {path.name} (cache)' if elapsed[-1] == 0 else
              f'[{backend} {i}/{len(paths)}] {path.name}', flush=True)
    return np.asarray(rows), elapsed, cached


def cos_sim(a, b):
    a = a / np.maximum(np.linalg.norm(a, axis=1, keepdims=True), 1e-12)
    b = b / np.maximum(np.linalg.norm(b, axis=1, keepdims=True), 1e-12)
    return a @ b.T


def standardized(train, query):
    mean = train.mean(axis=0)
    std = train.std(axis=0)
    std[std < 1e-8] = 1.0
    return (train - mean) / std, (query - mean) / std


def weighted_knn(train_x, train_y, query_x, k=5):
    sims = cos_sim(query_x, train_x)
    preds, top_scores = [], sims.max(axis=1)
    for row in sims:
        ids = np.argsort(row)[-min(k, len(row)):][::-1]
        weights = {}
        for j in ids:
            weights[train_y[j]] = weights.get(train_y[j], 0.0) + max(float(row[j]), 0.0)
        preds.append(max(weights, key=weights.get))
    return np.asarray(preds), top_scores


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--examples', required=True)
    ap.add_argument('--negatives', default=None, help='MUSIC BACKUP root; defaults to parent of --examples')
    ap.add_argument('--cache', default='.cache/embeddings')
    ap.add_argument('--report-dir', default='.cache/eval')
    ap.add_argument('--seed', type=int, default=42)
    args = ap.parse_args()
    examples_root = Path(args.examples).resolve()
    music_root = Path(args.negatives).resolve() if args.negatives else examples_root.parent
    cache_root = Path(args.cache)
    report_dir = Path(args.report_dir)
    timing_path = report_dir / 'extraction-times.json'
    timing_history = json.loads(timing_path.read_text()) if timing_path.exists() else {}

    example_paths, labels = [], []
    for label in EXAMPLE_CLASSES:
        files = audio_files(examples_root / label)
        example_paths.extend(files)
        labels.extend([label] * len(files))
    missing = [c for c in EXAMPLE_CLASSES if not audio_files(examples_root / c)]
    negative_pool = [p for name in NEGATIVE_DIRS for p in audio_files(music_root / name)]
    rng = random.Random(args.seed)
    negatives = sorted(rng.sample(negative_pool, min(60, len(negative_pool))))
    all_paths = example_paths + negatives
    labels = np.asarray(labels)
    if len(set(labels)) < 2:
        raise SystemExit('Se requieren al menos dos clases de ejemplos.')
    class_counts = dict(Counter(labels))
    print(f'Pistas ejemplo: {len(example_paths)} {class_counts}; negativas: {len(negatives)} (pool={len(negative_pool)})', flush=True)

    import torch
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    print(f'Dispositivo: {device}', flush=True)
    backends = {}
    results = {}
    transformer_bundles = {}
    transformer_errors = {}
    for backend in ('librosa', 'clap', 'mert'):
        try:
            bundle = None
            if backend != 'librosa':
                try:
                    bundle = load_transformer_models(backend, device)
                    transformer_bundles[backend] = bundle
                except Exception as e:
                    transformer_errors[backend] = f'{type(e).__name__}: {e}'
                    raise RuntimeError(transformer_errors[backend]) from e
            x, durations, cached = collect(all_paths, backend, cache_root, bundle, device)
            x = x.astype(np.float64, copy=False)
            this_run_seconds = float(np.mean([d for d in durations if d > 0])) if any(d > 0 for d in durations) else 0.0
            if this_run_seconds > 0:
                timing_history[backend] = this_run_seconds
            seconds_per_track = timing_history.get(backend, this_run_seconds)
            n_examples = len(example_paths)
            x_examples, x_neg = x[:n_examples], x[n_examples:]
            # Leave-one-out kNN and threshold are computed with per-fold z-score for librosa.
            loo_preds, loo_sims, loo_true = [], [], []
            for i in range(n_examples):
                keep = np.arange(n_examples) != i
                tr, q = x_examples[keep], x_examples[i:i + 1]
                if backend == 'librosa':
                    tr, q = standardized(tr, q)
                pred, sim = weighted_knn(tr, labels[keep], q)
                loo_preds.append(pred[0]); loo_sims.append(sim[0]); loo_true.append(labels[i])
            loo_preds, loo_sims, loo_true = np.asarray(loo_preds), np.asarray(loo_sims), np.asarray(loo_true)
            threshold = float(np.quantile(loo_sims, 0.05, method='linear'))
            if backend == 'librosa':
                tr_full, neg_scaled = standardized(x_examples, x_neg)
            else:
                tr_full, neg_scaled = x_examples, x_neg
            neg_pred, neg_sims = weighted_knn(tr_full, labels, neg_scaled)
            classes = list(EXAMPLE_CLASSES)
            folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=args.seed)
            clf = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000, class_weight=None))
            log_preds = cross_val_predict(clf, x_examples, labels, cv=folds)
            results[backend] = {
                'status': 'ok', 'examples': n_examples, 'negatives': len(negatives), 'negative_pool': len(negative_pool),
                'class_counts': class_counts, 'missing_classes': missing, 'cache_hits': cached,
                'knn_loo': {'accuracy': float(accuracy_score(loo_true, loo_preds)),
                            'macro_f1': float(f1_score(loo_true, loo_preds, labels=classes, average='macro', zero_division=0)),
                            'recall_by_class': dict(zip(classes, map(float, recall_score(loo_true, loo_preds, labels=classes, average=None, zero_division=0)))),
                            'confusion_matrix': confusion_matrix(loo_true, loo_preds, labels=classes).tolist()},
                'logistic_5fold': {'accuracy': float(accuracy_score(labels, log_preds)),
                                   'macro_f1': float(f1_score(labels, log_preds, labels=classes, average='macro', zero_division=0)),
                                   'recall_by_class': dict(zip(classes, map(float, recall_score(labels, log_preds, labels=classes, average=None, zero_division=0)))),
                                   'confusion_matrix': confusion_matrix(labels, log_preds, labels=classes).tolist()},
                'rejection': {'threshold': threshold, 'negative_rejected_pct': float(np.mean(neg_sims < threshold) * 100)},
                'seconds_per_track': seconds_per_track,
                'seconds_per_track_this_run': this_run_seconds,
                'cache_hits': cached, 'cache_total': len(all_paths),
            }
        except Exception as e:
            results[backend] = {'error': f'{type(e).__name__}: {e}'}
            print(f'Backend {backend} falló: {results[backend]["error"]}', flush=True)

    report = {'examples_root': str(examples_root), 'negative_root': str(music_root), 'negative_dirs': NEGATIVE_DIRS,
              'seed': args.seed, 'device': device, 'tracks': {'examples': len(example_paths), 'negative_sample': len(negatives),
              'negative_pool': len(negative_pool), 'classes': class_counts, 'missing_classes': missing}, 'backends': results}
    report_dir.mkdir(parents=True, exist_ok=True)
    timing_path.write_text(json.dumps(timing_history, indent=2) + '\n')
    (report_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    lines = ['# Evaluación de clasificación por ejemplos', '',
             f"Ejemplos: {len(example_paths)}; negativos: {len(negatives)}/{len(negative_pool)} (seed {args.seed}); clases: {class_counts}",
             f'Dispositivo: {device}. Features: ventana centrada de hasta 30 s, mono.', '',
             '| Backend / clasificador | Exactitud | Macro-F1 | Rechazo negativos | s/pista* |',
             '|---|---:|---:|---:|---:|']
    for backend, value in results.items():
        if value.get('status') != 'ok':
            lines.append(f'| {backend} | — | — | — | — |')
            lines.append(f'| Error | {value.get("error", "") } | | | |')
            continue
        for method, title in [('knn_loo', 'kNN LOO'), ('logistic_5fold', 'logística 5-fold')]:
            m = value[method]
            rej = value['rejection']['negative_rejected_pct'] if method == 'knn_loo' else None
            lines.append(f"| {backend} / {title} | {m['accuracy']:.3f} | {m['macro_f1']:.3f} | {rej:.1f}% | {value['seconds_per_track']:.2f} |" if rej is not None else
                         f"| {backend} / {title} | {m['accuracy']:.3f} | {m['macro_f1']:.3f} | — | {value['seconds_per_track']:.2f} |")
    lines += ['', '* s/pista indica extracción en frío; el JSON incluye también el tiempo de esta ejecución y los hits de caché.',
              '', f"Clases ausentes: {', '.join(missing) if missing else 'ninguna'}."]
    (report_dir / 'report.md').write_text('\n'.join(lines) + '\n')
    print('\n'.join(lines), flush=True)


if __name__ == '__main__':
    main()
