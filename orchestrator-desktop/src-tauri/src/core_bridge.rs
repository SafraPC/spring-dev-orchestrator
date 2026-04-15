use crate::java_runtime::{core_stderr_tail_hint, spawn_core};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager};
use uuid::Uuid;

#[derive(Clone)]
pub struct CoreBridge {
  child: Arc<Mutex<Option<Child>>>,
  stdin: Arc<Mutex<Option<ChildStdin>>>,
  pending: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<Value>>>>,
  lifecycle: Arc<Mutex<()>>,
}

fn core_jar_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  if let Ok(env_jar) = std::env::var("ORCHESTRATOR_CORE_JAR") {
    return Ok(PathBuf::from(env_jar));
  }
  let jar = if cfg!(debug_assertions) {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../orchestrator-core/target/orchestrator-core-standalone.jar")
  } else {
    let resource_dir = app
      .path()
      .resource_dir()
      .map_err(|e| format!("Erro ao obter diretório de recursos: {e}"))?;
    resource_dir.join("orchestrator-core-standalone.jar")
  };
  if !jar.exists() {
    return Err(format!("JAR não encontrado em: {}", jar.display()));
  }
  Ok(dunce::simplified(&jar).to_path_buf())
}

fn start_reader_thread(app: tauri::AppHandle, stdout: std::process::ChildStdout, pending: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<Value>>>>) {
  thread::spawn(move || {
    let reader = BufReader::new(stdout);
    for line in reader.lines().flatten() {
      let v: Value = match serde_json::from_str(&line) {
        Ok(v) => v,
        Err(_) => continue,
      };
      if v.get("event").is_some() {
        let _ = app.emit("core_event", &v);
        continue;
      }
      let id = v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string());
      if let Some(id) = id {
        if let Some(tx) = pending.lock().ok().and_then(|mut m| m.remove(&id)) {
          let _ = tx.send(v);
        }
      }
    }
  });
}

impl CoreBridge {
  pub fn new() -> Self {
    Self {
      child: Arc::new(Mutex::new(None)),
      stdin: Arc::new(Mutex::new(None)),
      pending: Arc::new(Mutex::new(HashMap::new())),
      lifecycle: Arc::new(Mutex::new(())),
    }
  }

  fn is_alive_inner(&self) -> bool {
    if let Ok(mut guard) = self.child.lock() {
      if let Some(ref mut child) = *guard {
        return child.try_wait().ok().flatten().is_none();
      }
    }
    false
  }

  pub fn is_alive(&self) -> bool {
    let _lifecycle = self.lifecycle.lock().unwrap();
    self.is_alive_inner()
  }

  fn cleanup_inner(&self) {
    if let Ok(mut guard) = self.stdin.lock() {
      drop(guard.take());
    }
    if let Ok(mut pending) = self.pending.lock() {
      pending.clear();
    }
    if let Ok(mut guard) = self.child.lock() {
      if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
      }
      *guard = None;
    }
  }

  pub fn cleanup(&self) {
    let _lifecycle = self.lifecycle.lock().unwrap();
    self.cleanup_inner();
  }

  pub fn ensure_started(&self, app: &tauri::AppHandle) -> Result<(), String> {
    let _lifecycle = self.lifecycle.lock().unwrap();
    if self.is_alive_inner() {
      return Ok(());
    }
    self.cleanup_inner();
    let jar_path = core_jar_path(app)?;
    if !jar_path.exists() {
      return Err(format!("JAR não encontrado em: {}", jar_path.display()));
    }
    let (child, stdin, stdout) = spawn_core(app, &jar_path).map_err(|e| format!("Falha ao iniciar core: {e}"))?;
    *self.child.lock().unwrap() = Some(child);
    *self.stdin.lock().unwrap() = Some(stdin);
    start_reader_thread(app.clone(), stdout, self.pending.clone());
    thread::sleep(Duration::from_millis(500));
    if !self.is_alive_inner() {
      let tail = core_stderr_tail_hint(app);
      self.cleanup_inner();
      let base = "O processo Java do core encerrou ao iniciar.".to_string();
      if tail.is_empty() {
        return Err(format!(
          "{base} Instale JDK 17+ (Temurin), defina JAVA_HOME ou configure o Java nas Configurações."
        ));
      }
      return Err(format!("{base}{tail}"));
    }
    Ok(())
  }

  pub fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
    if !self.is_alive() {
      return Err("Core não está rodando".to_string());
    }
    let id = Uuid::new_v4().to_string();
    let req = serde_json::json!({
      "id": id,
      "method": method,
      "params": params
    });
    let (tx, rx) = std::sync::mpsc::channel::<Value>();
    self.pending.lock().unwrap().insert(id.clone(), tx);
    {
      let mut guard = self.stdin.lock().unwrap();
      let stdin = guard.as_mut().ok_or_else(|| "stdin do core indisponível".to_string())?;
      if let Err(e) = stdin.write_all(format!("{}\n", req).as_bytes()) {
        drop(guard);
        self.cleanup();
        return Err(format!("Core desconectado: {e}"));
      }
      stdin.flush().ok();
    }
    match rx.recv_timeout(Duration::from_secs(120)) {
      Ok(resp) => Ok(resp),
      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
        self.pending.lock().ok().map(|mut m| m.remove(&id));
        Err("Timeout aguardando resposta do core".to_string())
      }
      Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err("Core reiniciado durante a requisição".to_string()),
    }
  }

  pub fn shutdown(&self) {
    self.cleanup();
  }
}
