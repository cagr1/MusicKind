import os
import shutil
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

import numpy as np

from src import bpm_detection


class BpmDetectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ffmpeg = shutil.which("ffmpeg")
        if not cls.ffmpeg:
            raise unittest.SkipTest("ffmpeg is required for BPM detector tests")

    def _click_track(self, directory):
        path = Path(directory) / "clicks.wav"
        sample_rate = 44100
        samples = np.zeros(sample_rate * 30, dtype=np.float32)
        interval = sample_rate * 60 / 124
        click = (np.sin(2 * np.pi * 1000 * np.arange(2205) / sample_rate) * 0.8)
        for beat in np.arange(0, len(samples), interval):
            start = int(beat)
            samples[start:start + len(click)] += click[:len(samples) - start]
        pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
        with wave.open(str(path), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(sample_rate)
            audio.writeframes(pcm.tobytes())
        return path

    def test_parse_bpm(self):
        for raw, expected in [("128", 128.0), ("127.50", 127.5),
                              ("0", None), ("abc", None), ("301", None),
                              (None, None), ("NaN", None)]:
            with self.subTest(raw=raw):
                self.assertEqual(bpm_detection.parse_bpm(raw), expected)

    def test_percival_click_track(self):
        with tempfile.TemporaryDirectory() as directory:
            path = self._click_track(directory)
            self.assertLessEqual(abs(bpm_detection.detect_bpm_essentia(path) - 124), 1)

    def test_tag_wins_and_engine_switches_to_librosa(self):
        with tempfile.TemporaryDirectory() as directory:
            wav = self._click_track(directory)
            flac = Path(directory) / "tagged.flac"
            subprocess.run(
                [self.ffmpeg, "-v", "error", "-y", "-i", str(wav),
                 "-metadata", "bpm=100", str(flac)],
                check=True, capture_output=True,
            )
            self.assertEqual(bpm_detection.resolve_bpm(flac),
                             {"bpm": 100.0, "bpmSource": "tag"})

            with mock.patch.dict(os.environ, {"MUSIC_KIND_BPM_ENGINE": "librosa"}):
                fallback = bpm_detection.resolve_bpm(wav)
            self.assertEqual(fallback["bpmSource"], "analysis")
            self.assertIsInstance(fallback["bpm"], float)

    def test_essentia_failure_falls_back_to_librosa(self):
        with tempfile.TemporaryDirectory() as directory:
            wav = self._click_track(directory)
            with mock.patch.object(bpm_detection, "detect_bpm_essentia",
                                   side_effect=RuntimeError("simulated failure")):
                result = bpm_detection.resolve_bpm(wav)
            self.assertEqual(result["bpmSource"], "analysis")
            self.assertIsInstance(result["bpm"], float)


if __name__ == "__main__":
    unittest.main()
