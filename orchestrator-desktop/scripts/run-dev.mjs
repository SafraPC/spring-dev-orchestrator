import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.resolve(__dirname, "..");
const root = path.resolve(desktopDir, "..");
const coreDir = path.join(root, "orchestrator-core");
const jar = path.join(coreDir, "target", "orchestrator-core-standalone.jar");
const orchDir = path.join(root, ".orchestrator");
const pidDir = path.join(orchDir, "pids");
const uiPidFile = path.join(pidDir, "ui.pid");

const win = process.platform === "win32";
const verboseLogs = process.env.ORCHESTRATOR_VERBOSE_LOGS !== "0";

function log(msg) {
  console.log(`\n[orchestrator] ${msg}`);
}

function dbg(msg) {
  if (verboseLogs) {
    console.log(`[orchestrator:debug] ${msg}`);
  }
}

function newestMatchingChildDir(root, namePrefix, testMarkerPath) {
  if (!root || !fs.existsSync(root)) return null;
  let best = null;
  let bestMt = -1;
  for (const name of fs.readdirSync(root)) {
    if (namePrefix && !name.startsWith(namePrefix)) continue;
    const full = path.join(root, name);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const marker = path.join(full, ...testMarkerPath.split("/"));
    if (!fs.existsSync(marker)) continue;
    if (st.mtimeMs >= bestMt) {
      bestMt = st.mtimeMs;
      best = full;
    }
  }
  return best;
}

const depsRoot = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "OrchestratorBuildDeps") : null;
const mvnHome = newestMatchingChildDir(depsRoot, "apache-maven-", win ? "bin/mvn.cmd" : "bin/mvn");
const nodeDir = newestMatchingChildDir(depsRoot, "node-v", win ? "npm.cmd" : "bin/npm");
const depsBin = mvnHome ? path.join(mvnHome, "bin") : null;
if (depsBin && fs.existsSync(path.join(depsBin, win ? "mvn.cmd" : "mvn"))) {
  process.env.PATH = `${depsBin}${path.delimiter}${process.env.PATH || ""}`;
  if (!process.env.MAVEN_HOME) {
    process.env.MAVEN_HOME = mvnHome;
  }
}
if (nodeDir && fs.existsSync(path.join(nodeDir, win ? "npm.cmd" : "npm"))) {
  process.env.PATH = `${nodeDir}${path.delimiter}${process.env.PATH || ""}`;
}

const mvnCmd = process.env.MAVEN_HOME
  ? path.join(process.env.MAVEN_HOME, "bin", win ? "mvn.cmd" : "mvn")
  : win
    ? "mvn.cmd"
    : "mvn";

const npmExe =
  nodeDir && fs.existsSync(path.join(nodeDir, "npm.cmd"))
    ? path.join(nodeDir, "npm.cmd")
    : win
      ? "npm.cmd"
      : "npm";

dbg(`MAVEN_HOME=${process.env.MAVEN_HOME || "(auto)"}`);
dbg(`mvnCmd=${mvnCmd}`);
dbg(`npmExe=${npmExe}`);

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (win) {
    const r = spawnSync("cmd", ["/c", `tasklist /FI "PID eq ${pid}" | find "${pid}"`], {
      encoding: "utf8",
      shell: true,
    });
    return r.status === 0;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopVite() {
  let pid;
  try {
    pid = parseInt(fs.readFileSync(uiPidFile, "utf8").trim(), 10);
  } catch {
    return;
  }
  if (!Number.isInteger(pid) || !isPidAlive(pid)) {
    try {
      fs.unlinkSync(uiPidFile);
    } catch {}
    return;
  }
  if (win) {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } else {
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
  try {
    fs.unlinkSync(uiPidFile);
  } catch {}
}

function waitForViteHttp(maxMs) {
  const url = "http://127.0.0.1:5173/";
  const deadline = Date.now() + maxMs;
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      if (Date.now() > deadline) {
        reject(new Error("Vite não respondeu em http://127.0.0.1:5173/"));
        return;
      }
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => setTimeout(tryOnce, 400));
    };
    tryOnce();
  });
}

function waitChildSpawned(child, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("Timeout ao criar processo Vite")), ms);
    child.once("error", (err) => {
      clearTimeout(t);
      reject(err);
    });
    child.once("spawn", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

function waitViteHttpOrChildExit(child, httpMs) {
  return new Promise((resolve, reject) => {
    const onExit = (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Vite encerrou antes de ficar pronto (exit ${code})`));
      }
    };
    child.once("exit", onExit);
    waitForViteHttp(httpMs)
      .then(() => {
        child.off("exit", onExit);
        resolve();
      })
      .catch((e) => {
        child.off("exit", onExit);
        reject(e);
      });
  });
}

async function ensureViteRunning() {
  fs.mkdirSync(orchDir, { recursive: true });
  fs.mkdirSync(pidDir, { recursive: true });
  fs.mkdirSync(path.join(desktopDir, "dist"), { recursive: true });

  let existingPid;
  try {
    existingPid = parseInt(fs.readFileSync(uiPidFile, "utf8").trim(), 10);
  } catch {
    existingPid = NaN;
  }
  if (Number.isInteger(existingPid) && isPidAlive(existingPid)) {
    log(`UI já está rodando (PID ${existingPid}).`);
    log("Verificando http://127.0.0.1:5173/ ...");
    await waitForViteHttp(90_000);
    log("Vite OK.");
    return;
  }
  if (fs.existsSync(uiPidFile)) {
    try {
      fs.unlinkSync(uiPidFile);
    } catch {}
  }

  if (!fs.existsSync(path.join(desktopDir, "node_modules"))) {
    log("Instalando dependências (npm install)...");
    const inst = spawnSync(npmExe, ["install"], {
      cwd: desktopDir,
      stdio: "inherit",
      shell: win,
      env: process.env,
    });
    if (inst.error || (inst.status !== 0 && inst.status !== null)) {
      console.error(inst.error || `[dev] npm install falhou (exit ${inst.status})`);
      process.exit(inst.status ?? 1);
    }
  }

  log("Iniciando frontend (Vite) em segundo plano...");
  const vite = spawn(npmExe, ["run", "dev", "--", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
    cwd: desktopDir,
    stdio: verboseLogs ? "inherit" : "ignore",
    env: process.env,
    windowsHide: true,
    shell: win,
  });
  await waitChildSpawned(vite, 20_000);
  if (!vite.pid) {
    console.error("[dev] Vite sem PID.");
    process.exit(1);
  }
  vite.unref();
  fs.writeFileSync(uiPidFile, String(vite.pid), "utf8");
  log(`UI PID ${vite.pid}.`);

  log("Aguardando Vite responder em http://127.0.0.1:5173/ ...");
  await waitViteHttpOrChildExit(vite, 90_000);
  log("Vite OK. Seguindo para Tauri.");
}

log("Buildando orchestrator-core (jar standalone)...");
const mvnGoals =
  process.env.ORCHESTRATOR_SKIP_MVN_CLEAN === "1"
    ? ["-q", "-DskipTests", "package"]
    : ["-q", "-DskipTests", "clean", "package"];
log(
  mvnGoals.includes("clean")
    ? "Maven: clean package (JAR sempre alinhado ao código; ORCHESTRATOR_SKIP_MVN_CLEAN=1 pula clean)."
    : "Maven: package sem clean (ORCHESTRATOR_SKIP_MVN_CLEAN=1).",
);
let build = spawnSync(mvnCmd, mvnGoals, {
  cwd: coreDir,
  stdio: "inherit",
  shell: win,
  env: process.env,
});
if ((build.error || (build.status !== 0 && build.status !== null)) && mvnGoals.includes("clean")) {
  log("Maven clean falhou (provavel arquivo em uso). Tentando package sem clean...");
  build = spawnSync(mvnCmd, ["-q", "-DskipTests", "package"], {
    cwd: coreDir,
    stdio: "inherit",
    shell: win,
    env: process.env,
  });
}
if (build.error || (build.status !== 0 && build.status !== null)) {
  console.error(build.error || `[dev] Maven falhou (exit ${build.status}). Feche instancias abertas do Orchestrator/Tauri e tente novamente.`);
  process.exit(build.status ?? 1);
}
if (!fs.existsSync(jar)) {
  console.error(`[dev] JAR ausente: ${jar}`);
  process.exit(1);
}
log(`Jar em ${jar}`);

process.env.ORCHESTRATOR_CORE_JAR = jar;
if (!process.env.ORCHESTRATOR_CORE_TRACE) {
  process.env.ORCHESTRATOR_CORE_TRACE = verboseLogs ? "1" : "0";
}
if (!process.env.RUST_LOG) {
  process.env.RUST_LOG = "info";
}

try {
  await ensureViteRunning();
} catch (e) {
  console.error(`[dev] ${e instanceof Error ? e.message : String(e)}`);
  stopVite();
  process.exit(1);
}

if (process.env.ORCHESTRATOR_DEV_STOP_AFTER_VITE === "1") {
  log("ORCHESTRATOR_DEV_STOP_AFTER_VITE=1 — Vite OK, encerrando sem Tauri.");
  stopVite();
  process.exit(0);
}

const onStop = () => {
  log("Encerrando processos...");
  stopVite();
};
process.on("SIGINT", () => {
  onStop();
  process.exit(130);
});
process.on("SIGTERM", onStop);

log("Abrindo Desktop (Tauri dev)...");
let code = 1;
try {
  const tauri = spawnSync(npmExe, ["run", "tauri:dev"], {
    cwd: desktopDir,
    stdio: "inherit",
    shell: win,
    env: process.env,
  });
  code = tauri.status ?? 1;
} finally {
  onStop();
}
process.exit(code === null ? 1 : code);
