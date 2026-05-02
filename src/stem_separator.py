#!/usr/bin/env python3
"""
Stem Separator — extracts vocals and/or instrumental from audio files using demucs.
Usage: python stem_separator.py --files <f1> <f2> ... --output <dir> --stems <vocals|instrumental|both> --format <wav|mp3>
Output per file: [PROGRESS:X/Y] Processing: filename
Final output: JSON array with results.
"""
import sys
import json
import os
import subprocess
import shutil
import tempfile
from pathlib import Path

AUDIO_EXTENSIONS = {'.mp3', '.wav', '.aiff', '.aif', '.flac', '.m4a'}
PYTHON_CMD = sys.executable or "python"


def check_demucs():
    try:
        result = subprocess.run(
            [PYTHON_CMD, "-m", "demucs", "--help"],
            capture_output=True, text=True, timeout=10
        )
        return result.returncode == 0
    except Exception:
        return False


def find_audio_files(directory):
    result = []
    for root, _, files in os.walk(directory):
        for f in sorted(files):
            if Path(f).suffix.lower() in AUDIO_EXTENSIONS:
                result.append(os.path.join(root, f))
    return result


def separate_file(file_path, output_dir, stems_mode, fmt):
    """
    Run demucs on one file with --two-stems vocals.
    stems_mode: "vocals" | "instrumental" | "both"
    fmt: "wav" | "mp3"
    Returns: {"ok": True, "files": [...]} or {"ok": False, "error": "..."}
    """
    song_stem = Path(file_path).stem
    ext = "mp3" if fmt == "mp3" else "wav"

    with tempfile.TemporaryDirectory() as tmp_dir:
        args = [
            PYTHON_CMD, "-m", "demucs",
            "--two-stems", "vocals",
            "-o", tmp_dir,
            file_path
        ]
        if fmt == "mp3":
            args.append("--mp3")

        result = subprocess.run(args, capture_output=True, text=True, timeout=600)

        if result.returncode != 0:
            err = (result.stderr or result.stdout or "demucs failed").strip()[-500:]
            return {"ok": False, "error": err}

        # Demucs output: tmp_dir/<model_name>/<song_stem>/vocals.ext + no_vocals.ext
        created = []
        for model_dir in sorted(Path(tmp_dir).iterdir()):
            song_dir = model_dir / song_stem
            if not song_dir.exists():
                continue

            if stems_mode in ("vocals", "both"):
                src = song_dir / f"vocals.{ext}"
                if src.exists():
                    dst = Path(output_dir) / f"{song_stem}_vocals.{ext}"
                    shutil.copy2(str(src), str(dst))
                    created.append(str(dst))

            if stems_mode in ("instrumental", "both"):
                src = song_dir / f"no_vocals.{ext}"
                if src.exists():
                    dst = Path(output_dir) / f"{song_stem}_instrumental.{ext}"
                    shutil.copy2(str(src), str(dst))
                    created.append(str(dst))

            break  # Use first model dir found

        if not created:
            return {"ok": False, "error": "No output files found from demucs"}

        return {"ok": True, "files": created}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--files", nargs="+", help="Audio files to process")
    parser.add_argument("--input", help="Directory to scan for audio files")
    parser.add_argument("--output", required=True, help="Output directory")
    parser.add_argument("--stems", choices=["vocals", "instrumental", "both"], default="both")
    parser.add_argument("--format", choices=["wav", "mp3"], default="wav")
    args = parser.parse_args()

    if not check_demucs():
        print(json.dumps([{"ok": False, "error": "demucs no instalado. Instálalo con: pip install demucs"}], indent=2))
        sys.exit(1)

    os.makedirs(args.output, exist_ok=True)

    files = list(args.files) if args.files else []
    if args.input:
        files = find_audio_files(args.input)

    if not files:
        print(json.dumps([{"ok": False, "error": "Sin archivos de audio para procesar"}], indent=2))
        sys.exit(1)

    total = len(files)
    results = []
    for i, f in enumerate(files):
        name = os.path.basename(f)
        print(f"[PROGRESS:{i+1}/{total}] Processing: {name}")
        sys.stdout.flush()
        r = separate_file(f, args.output, args.stems, args.format)
        r["file"] = f
        results.append(r)

    print(json.dumps(results, indent=2))
