import os
import argparse
import subprocess
import tempfile
from pathlib import Path
import numpy as np
from audio_features import extract_features

AUDIO_EXTS = {".aiff", ".wav", ".mp3", ".flac", ".aif"}


def list_audio_files(root):
    files = []
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix.lower() in AUDIO_EXTS:
                files.append(p)
    return sorted(files)


def build_profile(files, analysis_seconds=None, temp_dir=None, temp_format=None, temp_bitrate=None):
    feats = []
    for f in files:
        with maybe_converted(f, temp_dir, temp_format, temp_bitrate) as target:
            feats.append(extract_features(str(target), duration=analysis_seconds))
    if not feats:
        return None
    keys = list(feats[0].keys())
    profile = {}
    for k in keys:
        profile[k] = float(np.mean([x[k] for x in feats]))
    return profile


def score_track(track_feat, profile):
    if profile is None:
        return float("inf")
    return (
        0.3 * abs(track_feat["bpm"] - profile["bpm"])
        + 0.3 * abs(track_feat["energy"] - profile["energy"])
        + 0.2 * abs(track_feat["brightness"] - profile["brightness"])
        + 0.1 * abs(track_feat["bass_weight"] - profile["bass_weight"])
        + 0.1 * abs(track_feat["vocal_presence"] - profile["vocal_presence"])
    )


class TempAudio:
    def __init__(self, path):
        self.path = path

    def __enter__(self):
        return self.path

    def __exit__(self, exc_type, exc, tb):
        return False


def check_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


def convert_audio(input_path, output_path, fmt, bitrate_kbps=None):
    cmd = ["ffmpeg", "-y", "-i", str(input_path)]
    if fmt == "mp3" and bitrate_kbps:
        cmd += ["-b:a", f"{bitrate_kbps}k"]
    cmd.append(str(output_path))
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def maybe_converted(file_path, temp_dir, temp_format, temp_bitrate):
    if not temp_format:
        return TempAudio(file_path)
    if not temp_dir:
        return TempAudio(file_path)

    unique = abs(hash(str(file_path)))
    output_name = f"{file_path.stem}_{unique}.tmp.{temp_format}"
    output_path = Path(temp_dir) / output_name
    convert_audio(file_path, output_path, temp_format, temp_bitrate)
    return TempAudio(output_path)


def parse_args():
    parser = argparse.ArgumentParser(description="Clasificador de sets: warmup/peak/closing")
    parser.add_argument("--base-dj", default="data/dj_tracks", help="Ruta base con warmup/peak/closing")
    parser.add_argument("--new-pack", default="data/new_pack", help="Ruta del pack nuevo a clasificar")
    parser.add_argument("--output", default="output", help="Ruta de salida")
    parser.add_argument("--analysis-seconds", type=int, default=None, help="Analizar solo los primeros N segundos")
    parser.add_argument("--temp-format", choices=["mp3", "wav", "aiff"], default=None)
    parser.add_argument("--temp-bitrate", type=int, default=None, help="Bitrate kbps para mp3")
    return parser.parse_args()


def main():
    args = parse_args()
    base_dj = Path(args.base_dj)
    new_pack = Path(args.new_pack)
    output = Path(args.output)

    if not base_dj.exists():
        raise SystemExit(f"Base DJ no existe: {base_dj}")
    if not new_pack.exists():
        raise SystemExit(f"New pack no existe: {new_pack}")

    temp_dir = None
    if args.temp_format:
        if not check_ffmpeg():
            raise SystemExit("FFmpeg no disponible. Instala ffmpeg o desactiva conversion temporal.")
        temp_dir = tempfile.TemporaryDirectory()

    warmup_files = list_audio_files(base_dj / "warmup")
    peak_files = list_audio_files(base_dj / "peak")
    closing_files = list_audio_files(base_dj / "closing")

    profiles = {
        "warmup": build_profile(warmup_files, args.analysis_seconds, temp_dir.name if temp_dir else None, args.temp_format, args.temp_bitrate),
        "peak": build_profile(peak_files, args.analysis_seconds, temp_dir.name if temp_dir else None, args.temp_format, args.temp_bitrate),
        "closing": build_profile(closing_files, args.analysis_seconds, temp_dir.name if temp_dir else None, args.temp_format, args.temp_bitrate),
    }

    output.mkdir(parents=True, exist_ok=True)
    out_files = {
        "warmup": (output / "warmup.txt").open("w", encoding="utf-8"),
        "peak": (output / "peak.txt").open("w", encoding="utf-8"),
        "closing": (output / "closing.txt").open("w", encoding="utf-8"),
    }

    tracks = list_audio_files(new_pack)
    total = len(tracks)

    for idx, track in enumerate(tracks, start=1):
        with maybe_converted(track, temp_dir.name if temp_dir else None, args.temp_format, args.temp_bitrate) as target:
            feat = extract_features(str(target), duration=args.analysis_seconds)
        scores = {k: score_track(feat, v) for k, v in profiles.items()}
        best = min(scores, key=scores.get)
        out_files[best].write(str(track) + "\n")
        out_files[best].flush()
        print(f"[{idx}/{total}] {track.name} -> {best}")

    for f in out_files.values():
        f.close()

    if temp_dir:
        temp_dir.cleanup()


if __name__ == "__main__":
    main()
