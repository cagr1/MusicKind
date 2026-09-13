import fs from "fs";
import path from "path";
import { getInstallLogPath, redactDiagnostic, ensurePythonEnv as defaultEnsurePythonEnv } from "./python-env.js";

export function createPythonInstallHandler({ projectRoot, dependencies, ensurePythonEnv = defaultEnsurePythonEnv, env = process.env } = {}) {
  const appendLog = (line, stream) => {
    const logPath = getInstallLogPath(projectRoot, env);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] [${stream}] ${redactDiagnostic(line)}\n`);
  };
  return async function installDependencyGroup(group, res) {
    const dependencyGroup = dependencies?.[group];
    if (!dependencyGroup || !Array.isArray(dependencyGroup.packages)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "group invalido" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    const send = (payload) => res.write(`data: ${JSON.stringify(payload)}\n\n`);
    let lastStderr = "";
    const onStage = (stage, message) => { appendLog(message, "stage"); send({ type: "stage", stage, message }); };
    const onOutput = (line, stream) => {
      if (stream === "stderr" && line.trim()) lastStderr = line.trim();
      appendLog(line, stream);
      send({ type: "log", line: redactDiagnostic(line), stream });
    };
    try {
      const result = await ensurePythonEnv({ projectRoot, env, packages: dependencyGroup.packages, onStage, onOutput });
      send({ type: "complete", success: true, ok: true, packages: result.packages });
    } catch (error) {
      const cause = redactDiagnostic(error?.message || String(error));
      const detail = redactDiagnostic(lastStderr);
      const message = `${cause}${detail && !cause.includes(detail) ? ` Último detalle: ${detail}` : ""}`;
      appendLog(message, "error");
      send({ type: "complete", success: false, ok: false, error: message });
    }
    res.end();
  };
}
