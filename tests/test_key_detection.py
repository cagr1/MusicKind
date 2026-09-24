#!/usr/bin/env python3
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("NUMBA_CACHE_DIR", "/tmp/musickind-numba-cache")

import librosa
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from key_detection import (  # noqa: E402
    CAMELOT_BY_PITCH_AND_MODE,
    detect_key,
    parse_key,
    resolve_key,
)


SR = 22050


def triad(root, mode):
    intervals = (0, 3, 7) if mode == "minor" else (0, 4, 7)
    t = np.arange(SR * 6) / SR
    signal = np.zeros_like(t)
    for interval in intervals:
        frequency = 440 * 2 ** ((root + interval - 9) / 12)
        for harmonic, amplitude in ((1, 1.0), (2, 0.35), (3, 0.15)):
            signal += amplitude * np.sin(2 * np.pi * frequency * harmonic * t)
    return signal / np.max(np.abs(signal))


class KeyDetectionTests(unittest.TestCase):
    def test_synthetic_keys(self):
        self.assertEqual(detect_key(triad(9, "minor"), SR, minor_bias=0.0)["camelot"], "8A")
        self.assertEqual(detect_key(triad(0, "major"), SR, minor_bias=0.0)["camelot"], "8B")
        self.assertEqual(detect_key(triad(6, "minor"), SR, minor_bias=0.0)["camelot"], "11A")

    def test_minor_bias_resolves_ambiguous_relative_major_minor(self):
        ambiguous = (triad(0, "major") + triad(9, "minor")) / 2
        self.assertEqual(detect_key(ambiguous, SR, minor_bias=0.1)["camelot"], "8A")

    def test_all_camelot_entries(self):
        expected = {
            "1A": (8, "minor"), "1B": (11, "major"),
            "2A": (3, "minor"), "2B": (6, "major"),
            "3A": (10, "minor"), "3B": (1, "major"),
            "4A": (5, "minor"), "4B": (8, "major"),
            "5A": (0, "minor"), "5B": (3, "major"),
            "6A": (7, "minor"), "6B": (10, "major"),
            "7A": (2, "minor"), "7B": (5, "major"),
            "8A": (9, "minor"), "8B": (0, "major"),
            "9A": (4, "minor"), "9B": (7, "major"),
            "10A": (11, "minor"), "10B": (2, "major"),
            "11A": (6, "minor"), "11B": (9, "major"),
            "12A": (1, "minor"), "12B": (4, "major"),
        }
        for camelot, pitch_mode in expected.items():
            self.assertEqual(CAMELOT_BY_PITCH_AND_MODE[pitch_mode], camelot)

    def test_corrupt_file_has_json_error_without_traceback_on_stdout(self):
        with tempfile.TemporaryDirectory() as directory:
            corrupt = Path(directory) / "corrupt.wav"
            corrupt.write_bytes(b"not audio")
            python = Path(__file__).resolve().parents[1] / "src" / "bpm_analyzer.py"
            result = subprocess.run(
                [sys.executable, str(python), "--files", str(corrupt)],
                capture_output=True, text=True, check=True,
            )
        self.assertNotIn("Traceback", result.stdout)
        payload = json.loads(result.stdout.split("\n", 1)[1])
        self.assertFalse(payload[0]["ok"])
        self.assertIn("error", payload[0])

    def test_parse_key(self):
        expected = {
            "Am": ("Am", "minor", "8A"),
            "Amin": ("Am", "minor", "8A"),
            "A minor": ("Am", "minor", "8A"),
            "A Minor": ("Am", "minor", "8A"),
            "A": ("A", "major", "11B"),
            "Amaj": ("A", "major", "11B"),
            "A major": ("A", "major", "11B"),
            "F#m": ("F#m", "minor", "11A"),
            "Gbm": ("F#m", "minor", "11A"),
            "Dbm": ("C#m", "minor", "12A"),
            "C#maj": ("Db", "major", "3B"),
            "Bb": ("Bb", "major", "6B"),
            "8A": ("Am", "minor", "8A"),
            "08A": ("Am", "minor", "8A"),
            "12B": ("E", "major", "12B"),
        }
        for value, result in expected.items():
            self.assertEqual(parse_key(value), {
                "key": result[0], "mode": result[1], "camelot": result[2],
            })
        for value in ("", "xyz", "13A", None):
            self.assertIsNone(parse_key(value))

    def test_resolve_key_from_analysis_and_tag(self):
        if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
            self.skipTest("ffmpeg/ffprobe no disponible")

        with tempfile.TemporaryDirectory() as directory:
            wav = Path(directory) / "synthetic.wav"
            flac = Path(directory) / "tagged.flac"
            import soundfile as sf

            sf.write(wav, triad(9, "minor"), SR)
            analyzed = resolve_key(wav)
            self.assertEqual(analyzed["keySource"], "analysis")
            self.assertEqual(analyzed["camelot"], "8A")

            subprocess.run(
                ["ffmpeg", "-y", "-v", "error", "-i", str(wav),
                 "-metadata", "initialkey=Am", str(flac)],
                check=True,
            )
            tagged = resolve_key(flac)
            self.assertEqual(tagged["keySource"], "tag")
            self.assertEqual(tagged["camelot"], "8A")


if __name__ == "__main__":
    unittest.main()
