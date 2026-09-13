import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createServer } from "../src/server.js";
import { createPythonInstallHandler } from "../src/python-install.js";

function startServer(handler) {
  const server = createServer({ installHandler: handler });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function post(server, body) {
  const address = server.address();
  return fetch(`http://127.0.0.1:${address.port}/api/install-dep`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  }).then(async (response) => ({ status: response.status, text: await response.text() }));
}

test("/api/install-dep valida grupo y emite SSE real", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-install-"));
  const events = [];
  const handler = createPythonInstallHandler({
    projectRoot: root,
    dependencies: { audio: { packages: ["librosa"] } },
    ensurePythonEnv: async ({ onStage, onOutput }) => {
      onStage("preparing", "Preparando");
      onOutput("instalando", "stdout");
      return { packages: ["librosa"] };
    }
  });
  const server = await startServer(handler);
  t.after(() => server.close());
  const invalid = await post(server, { group: "invalid" });
  assert.equal(invalid.status, 400);
  assert.equal(JSON.parse(invalid.text).error, "group invalido");
  const valid = await post(server, { group: "audio" });
  for (const block of valid.text.trim().split("\n\n")) events.push(JSON.parse(block.replace(/^data: /, "")));
  assert.deepEqual(events.map((event) => event.type), ["stage", "log", "complete"]);
  assert.equal(events.at(-1).success, true);
});

test("/api/install-dep emite causa redactada y persiste log sin secretos", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "musickind-install-fail-"));
  const handler = createPythonInstallHandler({
    projectRoot: root,
    dependencies: { audio: { packages: ["librosa"] } },
    ensurePythonEnv: async ({ onOutput }) => {
      onOutput("https://user:pass@example.test/?api_key=secret", "stderr");
      throw new Error("pip fallo: Bearer token https://user:pass@example.test");
    }
  });
  const server = await startServer(handler);
  t.after(() => server.close());
  const response = await post(server, { group: "audio" });
  const complete = JSON.parse(response.text.trim().split("\n\n").at(-1).replace(/^data: /, ""));
  assert.equal(complete.success, false);
  assert.equal(complete.error.includes("user:pass"), false);
  const log = fs.readFileSync(path.join(root, ".runtime", "logs", "python-install.log"), "utf8");
  assert.equal(log.includes("user:pass"), false);
  assert.equal(log.includes("secret"), false);
});
