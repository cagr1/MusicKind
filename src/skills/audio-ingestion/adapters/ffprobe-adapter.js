import { spawn } from "child_process";

export function createFFprobeAdapter(options = {}) {
  const ffprobePath = options.ffprobePath || "ffprobe";

  return {
    name: "ffprobe",
    async probeAudio(filePath) {
      const raw = await runFFprobe(ffprobePath, filePath);
      const data = JSON.parse(raw);

      const format = data?.format || {};
      const audioStream = (data?.streams || []).find((stream) => stream.codec_type === "audio") || {};

      return {
        durationSeconds: toNumberOrNull(format.duration),
        formatName: format.format_name || null,
        codecName: audioStream.codec_name || null,
        sampleRate: toNumberOrNull(audioStream.sample_rate),
        bitrate: toNumberOrNull(format.bit_rate)
      };
    }
  };
}

function runFFprobe(ffprobePath, filePath) {
  return new Promise((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-show_streams",
      "-show_format",
      "-print_format",
      "json",
      filePath
    ];

    const child = spawn(ffprobePath, args);
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(new Error(`Unable to start ffprobe: ${err.message}`));
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr || `ffprobe failed with exit code ${code}`));
    });
  });
}

function toNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
