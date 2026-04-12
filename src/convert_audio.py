import os
import argparse
import subprocess
from pathlib import Path

AUDIO_EXTS = {".aiff", ".aif", ".wav", ".mp3", ".flac"}


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


def convert_audio(input_path, output_path, fmt, bitrate_kbps=None):
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = ["ffmpeg", "-y", "-i", str(input_path)]
    if fmt == "mp3" and bitrate_kbps:
        cmd += ["-b:a", f"{bitrate_kbps}k"]
    cmd.append(str(output_path))
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def parse_args():
    parser = argparse.ArgumentParser(description="Convertidor de audio")
    parser.add_argument("--input", required=True, help="Carpeta de entrada")
    parser.add_argument("--output", required=True, help="Carpeta de salida")
    parser.add_argument("--format", choices=["mp3", "wav", "aiff"], required=True)
    parser.add_argument("--bitrate", type=int, default=None, help="Bitrate kbps para mp3")
    return parser.parse_args()


def main():
    args = parse_args()
    input_dir = Path(args.input)
    output_dir = Path(args.output)

    if not input_dir.exists():
        raise SystemExit(f"Input no existe: {input_dir}")
    if not check_ffmpeg():
        raise SystemExit("FFmpeg no disponible. Instala ffmpeg para convertir.")

    files = list_audio_files(input_dir)
    total = len(files)
    for idx, file_path in enumerate(files, start=1):
        rel = file_path.relative_to(input_dir)
        out_path = output_dir / rel
        out_path = out_path.with_suffix(f".{args.format}")
        convert_audio(file_path, out_path, args.format, args.bitrate)
        print(f"[{idx}/{total}] {rel} -> {out_path.name}")


if __name__ == "__main__":
    main()
