import contextlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path


CONVERTER_PATH = Path(__file__).parents[1] / "src" / "convert_audio.py"
SPEC = importlib.util.spec_from_file_location("convert_audio", CONVERTER_PATH)
convert_audio = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(convert_audio)


class ConverterPathTests(unittest.TestCase):
    def test_same_file_root_outputs_flat_inside_output_dir(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "track.wav"
            output = root / "out"
            source.write_bytes(b"audio")
            output.mkdir()

            result = convert_audio.output_path_for(source, output, "aiff", source)
            self.assertEqual(result, output / "track.aiff")
            self.assertEqual(convert_audio.ensure_output_inside(result, output), result.resolve())

    def test_rejects_resolved_output_outside_output_dir(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            output = root / "out"
            output.mkdir()
            outside = root / "track.aiff"
            with self.assertRaises(ValueError):
                convert_audio.ensure_output_inside(outside, output)

    def test_cli_converts_standalone_file_into_output(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            source = root / "track.wav"
            output = root / "out"
            source.write_bytes(b"audio")
            output.mkdir()

            original_argv = sys.argv
            original_check = convert_audio.check_ffmpeg
            original_convert = convert_audio.convert_audio

            def fake_convert(input_path, output_path, fmt, bitrate_kbps=None):
                output_path.write_bytes(b"converted")
                return output_path

            try:
                sys.argv = [
                    str(CONVERTER_PATH), "--input", str(source), "--output", str(output),
                    "--format", "aiff", "--relative-to", str(source),
                ]
                convert_audio.check_ffmpeg = lambda: True
                convert_audio.convert_audio = fake_convert
                stdout = io.StringIO()
                with contextlib.redirect_stdout(stdout):
                    convert_audio.main()
            finally:
                sys.argv = original_argv
                convert_audio.check_ffmpeg = original_check
                convert_audio.convert_audio = original_convert

            output_lines = stdout.getvalue().splitlines()
            json_start = output_lines.index("[")
            results = json.loads("\n".join(output_lines[json_start:]))
            self.assertTrue(results[0]["ok"])
            self.assertEqual(Path(results[0]["output"]), (output / "track.aiff").resolve())
            self.assertTrue((output / "track.aiff").exists())
            self.assertFalse((root / "out.aiff").exists())


if __name__ == "__main__":
    unittest.main()
