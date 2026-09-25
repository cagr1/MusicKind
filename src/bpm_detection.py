"""BPM detection using file tags, Essentia Percival, then librosa."""

from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import tempfile

os.environ.setdefault(
    "NUMBA_CACHE_DIR",
    os.path.join(tempfile.gettempdir(), "musickind-numba-cache"),
)


def parse_bpm(value):
    """Parse a plausible BPM value, rounded to one decimal place."""
    try:
        bpm = float(str(value).strip())
    except (TypeError, ValueError):
        return None
    if not math.isfinite(bpm) or not 20 <= bpm <= 300:
        return None
    return round(bpm, 1)


def read_tag_bpm(path):
    """Read the first valid BPM tag from format or stream metadata."""
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format_tags:stream_tags",
             "-of", "json", str(path)],
            capture_output=True, text=True, timeout=10, check=False,
        )
        if result.returncode != 0:
            return None
        payload = json.loads(result.stdout or "{}")
        tag_sets = [payload.get("format", {}).get("tags", {})]
        tag_sets.extend(stream.get("tags", {}) for stream in payload.get("streams", []))
        for tags in tag_sets:
            for name, value in tags.items():
                if str(name).lower() in {"tbpm", "bpm", "tmpo"}:
                    bpm = parse_bpm(value)
                    if bpm is not None:
                        return bpm
    except (OSError, subprocess.SubprocessError, ValueError, TypeError, AttributeError):
        pass
    return None


def detect_bpm_essentia(path):
    """Decode a complete track and estimate its tempo with Percival."""
    import numpy as np

    decoded = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:a:0", "-vn",
         "-ac", "1", "-ar", "44100", "-f", "f32le", "pipe:1"],
        capture_output=True, timeout=120, check=True,
    )
    if not decoded.stdout:
        raise ValueError("ffmpeg devolvió audio vacío")
    samples = np.frombuffer(decoded.stdout, dtype="<f4")
    if not samples.size:
        raise ValueError("ffmpeg devolvió audio vacío")

    import essentia.standard as es

    estimate = es.PercivalBpmEstimator(sampleRate=44100)(samples)
    # Essentia versions may return BPM alone or (BPM, confidence).
    if isinstance(estimate, (tuple, list)):
        estimate = estimate[0]
    bpm = parse_bpm(estimate)
    if bpm is None:
        raise ValueError("Essentia devolvió un BPM inválido")
    return bpm


def detect_bpm_librosa(y, sr):
    """Use the existing librosa beat tracker as the final fallback."""
    import librosa
    import numpy as np

    tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
    return parse_bpm(float(np.asarray(tempo).reshape(-1)[0]))


def validate_audio_media(path):
    """Return a readable-media error when ffprobe can verify the input."""
    if not shutil.which("ffprobe"):
        return None
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "a:0",
             "-show_entries", "stream=codec_type", "-of", "json", str(path)],
            capture_output=True, text=True, timeout=10, check=False,
        )
        payload = json.loads(result.stdout or "{}")
        if result.returncode != 0 or not payload.get("streams"):
            return "No se pudo validar un flujo de audio legible"
    except (OSError, subprocess.SubprocessError, ValueError):
        return None
    return None


def resolve_bpm(path, y=None, sr=None, fallback_duration=None):
    """Resolve BPM from tags, Percival, then librosa analysis."""
    tagged = read_tag_bpm(path)
    if tagged is not None:
        return {"bpm": tagged, "bpmSource": "tag"}

    if os.environ.get("MUSIC_KIND_BPM_ENGINE", "").lower() != "librosa":
        try:
            analyzed = detect_bpm_essentia(path)
            return {"bpm": analyzed, "bpmSource": "analysis"}
        except Exception:
            pass

    load_error = None
    audio_loaded = y is not None and sr is not None
    try:
        if not audio_loaded:
            import librosa
            y, sr = librosa.load(path, sr=None, mono=True, duration=fallback_duration)
            import numpy as np
            if np.asarray(y).size == 0:
                raise ValueError("No se pudo cargar audio válido del archivo")
            audio_loaded = True
        analyzed = detect_bpm_librosa(y, sr)
        if analyzed is not None:
            return {"bpm": analyzed, "bpmSource": "analysis"}
    except Exception as exc:
        # A decoded but untrackable signal is valid media with no BPM result.
        # A decoding/load failure means the input itself could not be analyzed.
        if not audio_loaded:
            load_error = str(exc)
    if load_error:
        return {"bpm": None, "bpmSource": None, "error": load_error}
    media_error = validate_audio_media(path)
    if media_error:
        return {"bpm": None, "bpmSource": None, "error": media_error}
    return {"bpm": None, "bpmSource": None}
