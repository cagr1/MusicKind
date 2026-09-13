import { spawn as defaultSpawn } from "child_process";
import { StringDecoder } from "string_decoder";

export function runBpmAnalyzer(
  pythonCommand,
  analyzerPath,
  filePath,
  { spawnImpl = defaultSpawn, timeoutMs = 30000, timeoutGraceMs = 1000, env = process.env } = {}
) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(pythonCommand, [analyzerPath, "--files", filePath, "--analysis-seconds", "90"], { env });
    } catch (error) {
      reject(error);
      return;
    }

    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeoutId;
    let graceTimeoutId;
    let timedOut = false;
    let closed = false;
    const stdoutDecoder = new StringDecoder("utf8");
    const stderrDecoder = new StringDecoder("utf8");

    const timeoutError = () => new Error(`BPM analyzer timeout after ${timeoutMs}ms`);

    const kill = (signal) => {
      try {
        if (child.kill(signal) === false) {
          return new Error(`BPM analyzer timeout after ${timeoutMs}ms; no se pudo terminar el proceso con ${signal}`);
        }
      } catch (error) {
        return new Error(`BPM analyzer timeout after ${timeoutMs}ms; no se pudo terminar el proceso con ${signal}: ${error.message}`);
      }
      return null;
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      clearTimeout(graceTimeoutId);
      child.stdout?.removeListener("data", onStdout);
      child.stderr?.removeListener("data", onStderr);
      child.removeListener("error", onError);
      child.removeListener("close", onClose);
    };

    const settle = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };

    const onStdout = (data) => { stdout += typeof data === "string" ? data : stdoutDecoder.write(data); };
    const onStderr = (data) => { stderr += typeof data === "string" ? data : stderrDecoder.write(data); };
    const onError = (error) => settle(reject, error);
    const onClose = (code) => {
      closed = true;
      stdout += stdoutDecoder.end();
      stderr += stderrDecoder.end();
      if (timedOut) {
        settle(reject, timeoutError());
        return;
      }
      settle(resolve, { code: code ?? child.exitCode, stdout, stderr });
    };

    child.stdout?.on("data", onStdout);
    child.stderr?.on("data", onStderr);
    child.once("error", onError);
    child.once("close", onClose);

    timeoutId = setTimeout(() => {
      timedOut = true;
      const termError = kill("SIGTERM");
      if (termError) {
        settle(reject, termError);
        return;
      }

      graceTimeoutId = setTimeout(() => {
        if (closed || settled) return;
        const killError = kill("SIGKILL");
        if (killError) settle(reject, killError);
      }, timeoutGraceMs);
    }, timeoutMs);
  });
}
