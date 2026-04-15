import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const jar = path.join(root, "orchestrator-core", "target", "orchestrator-core-standalone.jar");
const targetContainerName = process.argv[2] || `smoke-${Date.now()}`;

if (!fs.existsSync(jar)) {
  console.error("smoke: JAR ausente. Rode mvn package em orchestrator-core.");
  process.exit(1);
}

const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-smoke-"));
const java = process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : "java";

function line(id, method, params = {}) {
  return `${JSON.stringify({ id, method, params })}\n`;
}

function runCore() {
  const child = spawn(java, ["-jar", jar, "--stateDir", stateDir], {
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const rl = readline.createInterface({ input: child.stdout });
  const pending = new Map();
  rl.on("line", (raw) => {
    let o;
    try {
      o = JSON.parse(raw);
    } catch {
      return;
    }
    if (o.event) return;
    const id = o.id;
    if (id && pending.has(id)) {
      const { resolve, reject } = pending.get(id);
      pending.delete(id);
      if (o.ok) resolve(o.result);
      else reject(new Error(o.error?.message || JSON.stringify(o.error)));
    }
  });
  child.stderr.on("data", (b) => process.stderr.write(b));
  child.on("error", (e) => {
    for (const { reject } of pending.values()) reject(e);
    pending.clear();
  });
  function ask(id, method, params) {
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(line(id, method, params), (err) => {
        if (err) {
          pending.delete(id);
          reject(err);
        }
      });
    });
  }
  return { child, ask, close: () => child.kill("SIGTERM") };
}

const { child, ask, close } = runCore();
await once(child, "spawn");

try {
  await ask("0", "listServices", {});
  const before = await ask("1", "listContainers", {});
  const created = await ask("2", "createContainer", { name: targetContainerName, description: "" });
  if (!created || typeof created !== "object" || !created.id) {
    console.error("smoke: createContainer resposta inválida", created);
    process.exit(1);
  }
  const after = await ask("3", "listContainers", {});
  const n0 = Array.isArray(before) ? before.length : 0;
  const n1 = Array.isArray(after) ? after.length : 0;
  if (n1 !== n0 + 1) {
    console.error("smoke: esperava listContainers +1", { n0, n1 });
    process.exit(1);
  }
  console.log(`smoke: OK — core abriu e criou container "${targetContainerName}"`);
} catch (e) {
  console.error("smoke: FALHA", e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  close();
  try {
    fs.rmSync(stateDir, { recursive: true, force: true });
  } catch {}
}
