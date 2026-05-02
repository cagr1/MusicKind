import os
import argparse
import subprocess
from pathlib import Path

AUDIO_EXTS = {".aiff", ".aif", ".wav", ".mp3", ".flac", ".m4a"}


def list_audio_files(root):
    files = []
    for dirpath, _, filenames in os.walk(root):
        for name in filenames:
            p = Path(dirpath) / name
            if p.suffix.lower() in AUDIO_EXTS:
                files.append(p)
    return sorted(files)


def check_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except Exception:
        return False


def unique_output_path(path):
    """Return path unchanged if it doesn't exist, otherwise add (2), (3)... suffix."""
    if not path.exists():
        return path
    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 2
    while True:
        candidate = parent / f"{stem} ({counter}){suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


def convert_audio(input_path, output_path, fmt, bitrate_kbps=None):
    output_path = unique_output_path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-i", str(input_path)]
    if fmt == "mp3" and bitrate_kbps:
        cmd += ["-b:a", f"{bitrate_kbps}k"]
    cmd.append(str(output_path))
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def parse_args():
    parser = argparse.ArgumentParser(description="Convertidor de audio")
    parser.add_argument("--input", required=True, help="Archivo o carpeta de entrada")
    parser.add_argument("--output", required=True, help="Carpeta de salida")
    parser.add_argument("--format", choices=["mp3", "wav", "aiff", "flac"], required=True)
    parser.add_argument("--bitrate", type=int, default=None, help="Bitrate kbps para mp3")
    return parser.parse_args()


def main():
    args = parse_args()
    input_path = Path(args.input)
    output_dir = Path(args.output)

    if not input_path.exists():
        raise SystemExit(f"Input no existe: {input_path}")
    if not check_ffmpeg():
        raise SystemExit("FFmpeg no disponible. Instala ffmpeg para convertir.")

    # Single file or directory
    if input_path.is_file():
        if input_path.suffix.lower() not in AUDIO_EXTS:
            raise SystemExit(f"Formato no soportado: {input_path.suffix}")
        files = [input_path]
        input_dir = input_path.parent
    else:
        input_dir = input_path
        files = list_audio_files(input_dir)

    total = len(files)
    if total == 0:
        raise SystemExit("No se encontraron archivos de audio en la carpeta.")

    for idx, file_path in enumerate(files, start=1):
        if input_path.is_file():
            out_path = output_dir / file_path.name
        else:
            rel = file_path.relative_to(input_dir)
            out_path = output_dir / rel
        out_path = out_path.with_suffix(f".{args.format}")
        convert_audio(file_path, out_path, args.format, args.bitrate)
        print(f"[PROGRESS:{idx}/{total}] Processing: {file_path.name}", flush=True)


if __name__ == "__main__":
    main()
