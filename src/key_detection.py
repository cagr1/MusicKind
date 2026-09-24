"""Musical key, mode, and Camelot wheel detection."""

from __future__ import annotations

import os
import json
import re
import subprocess
import tempfile

# The bundled venv may be installed read-only; keep librosa/numba's generated
# caches out of site-packages so librosa can initialize reliably.
os.environ.setdefault(
    "NUMBA_CACHE_DIR",
    os.path.join(tempfile.gettempdir(), "musickind-numba-cache"),
)

import librosa
import numpy as np


MAJOR_NOTE_NAMES = ("C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B")
MINOR_NOTE_NAMES = ("Cm", "C#m", "Dm", "Ebm", "Em", "Fm", "F#m", "Gm", "Abm", "Am", "Bbm", "Bm")

# Krumhansl-Kessler profiles, expressed from C through B.
KRUMHANSL_PROFILES = {
    "major": np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09,
                       2.52, 5.19, 2.39, 3.66, 2.29, 2.88]),
    "minor": np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53,
                       2.54, 4.75, 3.98, 2.69, 3.34, 3.17]),
}

# Camelot's A wheel is minor and B wheel is major.
CAMELOT_BY_PITCH_AND_MODE = {
    **{(pitch, "major"): f"{number}B" for pitch, number in {
        0: 8, 1: 3, 2: 10, 3: 5, 4: 12, 5: 7,
        6: 2, 7: 9, 8: 4, 9: 11, 10: 6, 11: 1,
    }.items()},
    **{(pitch, "minor"): f"{number}A" for pitch, number in {
        0: 5, 1: 12, 2: 7, 3: 2, 4: 9, 5: 4,
        6: 11, 7: 6, 8: 1, 9: 8, 10: 3, 11: 10,
    }.items()},
}


def _pearson(left: np.ndarray, right: np.ndarray) -> float:
    left_centered = left - np.mean(left)
    right_centered = right - np.mean(right)
    denominator = np.linalg.norm(left_centered) * np.linalg.norm(right_centered)
    if denominator == 0:
        return 0.0
    return float(np.dot(left_centered, right_centered) / denominator)


def detect_key(y, sr, minor_bias=0.1) -> dict[str, str]:
    """Return the best K-K key/mode match and its Camelot notation."""
    harmonic = librosa.effects.harmonic(np.asarray(y), margin=4)
    chroma = librosa.feature.chroma_stft(y=harmonic, sr=sr, n_fft=8192)
    chroma_mean = np.mean(chroma, axis=1)

    best = None
    for mode, profile in KRUMHANSL_PROFILES.items():
        for pitch_class in range(12):
            rotated_profile = np.roll(profile, pitch_class)
            raw_score = _pearson(chroma_mean, rotated_profile)
            score = raw_score
            if mode == "minor":
                score += minor_bias
            candidate = (score, pitch_class, mode)
            if best is None or candidate > best:
                best = candidate

    _, pitch_class, mode = best
    return {
        "key": (MINOR_NOTE_NAMES if mode == "minor" else MAJOR_NOTE_NAMES)[pitch_class],
        "mode": mode,
        "camelot": CAMELOT_BY_PITCH_AND_MODE[(pitch_class, mode)],
    }


def detect_key_from_file(path) -> dict[str, str]:
    """Detect a file's key from a centered, maximum 120-second excerpt."""
    duration = float(librosa.get_duration(path=path))
    offset = max(0.0, duration / 2.0 - 60.0)
    y, sr = librosa.load(
        path,
        sr=22050,
        mono=True,
        offset=offset,
        duration=120,
    )
    return detect_key(y, sr)


_PITCH_CLASSES = {
    "C": 0, "B#": 0,
    "C#": 1, "Db": 1,
    "D": 2,
    "D#": 3, "Eb": 3,
    "E": 4, "Fb": 4,
    "F": 5, "E#": 5,
    "F#": 6, "Gb": 6,
    "G": 7,
    "G#": 8, "Ab": 8,
    "A": 9,
    "A#": 10, "Bb": 10,
    "B": 11, "Cb": 11,
}


def _key_result(pitch_class, mode):
    names = MINOR_NOTE_NAMES if mode == "minor" else MAJOR_NOTE_NAMES
    return {
        "key": names[pitch_class],
        "mode": mode,
        "camelot": CAMELOT_BY_PITCH_AND_MODE[(pitch_class, mode)],
    }


def parse_key(text):
    """Normalize musical or Camelot key notation to the Back 1 contract."""
    if not isinstance(text, str):
        return None
    value = text.strip()
    if not value:
        return None

    camelot = re.fullmatch(r"(0?[1-9]|1[0-2])\s*([AB])", value, re.IGNORECASE)
    if camelot:
        number = int(camelot.group(1))
        wheel = camelot.group(2).upper()
        for (pitch_class, mode), notation in CAMELOT_BY_PITCH_AND_MODE.items():
            if notation == f"{number}{wheel}":
                return _key_result(pitch_class, mode)
        return None

    musical = re.fullmatch(
        r"([A-Ga-g])([#b]?)(?:\s*(m|min|minor|maj|major))?", value,
        re.IGNORECASE,
    )
    if not musical:
        return None

    pitch_name = musical.group(1).upper() + musical.group(2)
    pitch_class = _PITCH_CLASSES.get(pitch_name)
    if pitch_class is None:
        return None
    suffix = (musical.group(3) or "").lower()
    mode = "minor" if suffix in {"m", "min", "minor"} else "major"
    return _key_result(pitch_class, mode)


def read_tag_key(path):
    """Read a common key tag using ffprobe, returning None on any failure."""
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format_tags=TKEY,initialkey,INITIALKEY,key",
                "-of", "json", str(path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if result.returncode != 0:
            return None
        payload = json.loads(result.stdout or "{}")
        tags = payload.get("format", {}).get("tags", {})
        for name in ("TKEY", "initialkey", "INITIALKEY", "key"):
            value = tags.get(name)
            if value:
                return value
    except (OSError, subprocess.SubprocessError, ValueError, TypeError):
        pass
    return None


def resolve_key(path):
    """Resolve a key from metadata first, then from audio analysis."""
    tagged = parse_key(read_tag_key(path))
    if tagged:
        return {**tagged, "keySource": "tag"}
    try:
        analyzed = detect_key_from_file(path)
        return {**analyzed, "keySource": "analysis"}
    except Exception:
        return {"key": None, "mode": None, "camelot": None, "keySource": None}
