use crate::java_runtime::{core_stderr_tail_hint, spawn_core};
use serde_json::{json, Value};
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
  session: Arc<Mutex<()>>,
}

fn trace_enabled() -> bool {
  std::env::var("ORCHESTRATOR_CORE_TRACE").unwrap_or_else(|_| "0".to_string()) == "1"
}

fn tlog(msg: &str) {
  if trace_enabled() {
    eprintln!("[core-bridge] {msg}");
  }
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

fn synthetic_ipc_error(id: &str, code: &str, message: &str) -> Value {
  json!({
    "id": id,
    "ok": false,
    "error": { "code": code, "message": message }
  })
}

fn notify_pending_drop(pending: &Mutex<HashMap<String, std::sync::mpsc::Sender<Value>>>, message: &str) {
  if let Ok(mut map) = pending.lock() {
    tlog(&format!("notificando {} requests pendentes", map.len()));
    for (id, tx) in map.drain() {
      let _ = tx.send(synthetic_ipc_error(&id, "CORE_SHUTDOWN", message));
    }
  }
}

fn start_reader_thread(app: tauri::AppHandle, stdout: std::process::ChildStdout, pending: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<Value>>>>) {
  thread::spawn(move || {
    let mut reader = BufReader::new(stdout);
    let mut raw = Vec::<u8>::new();
    loop {
      raw.clear();
      let n = match reader.read_until(b'\n', &mut raw) {
        Ok(n) => n,
        Err(e) => {
          tlog(&format!("erro lendo stdout do core: {e}"));
          break;
        }
      };
      if n == 0 {
        break;
      }
      let line = String::from_utf8_lossy(&raw).trim().to_string();
      if line.is_empty() {
        continue;
      }
      let v: Value = match serde_json::from_str(&line) {
        Ok(v) => v,
        Err(_) => {
          tlog(&format!("linha nao-JSON do core stdout: {line}"));
          continue;
        }
      };
      if v.get("event").is_some() {
        let app2 = app.clone();
        let _ = tauri::async_runtime::spawn(async move {
          let _ = app2.emit("core_event", v);
        });
        continue;
      }
      let id = v.get("id").and_then(|x| x.as_str()).map(|s| s.to_string());
      if let Some(id) = id {
        tlog(&format!("resposta recebida no reader thread: {id}"));
        if let Some(tx) = pending.lock().ok().and_then(|mut m| m.remove(&id)) {
          let _ = tx.send(v);
        }
      }
    }
  });
}

fn should_retry_after_transport_err(msg: &str) -> bool {
  msg.contains("Timeout aguardando resposta do core")
    || msg.contains("Canal do core encerrou inesperadamente")
    || msg.contains("Core não está rodando")
    || msg.contains("Core desconectado:")
}

impl CoreBridge {
  pub fn new() -> Self {
    Self {
      child: Arc::new(Mutex::new(None)),
      stdin: Arc::new(Mutex::new(None)),
      pending: Arc::new(Mutex::new(HashMap::new())),
      session: Arc::new(Mutex::new(())),
    }
  }

  pub fn ensure_started_and_send_request(
    &self,
    app: &tauri::AppHandle,
    method: &str,
    params: Value,
  ) -> Result<Value, String> {
    tlog(&format!("request recebido: {method}"));
    for attempt in 0..2 {
      let result = {
        let _g = self.session.lock().unwrap();
        self.ensure_started_under_lock(app)?;
        self.send_request_session_held(method, params.clone())
      };
      match &result {
        Ok(v) => {
          if v.get("ok").and_then(|b| b.as_bool()) != Some(false) {
            return result;
          }
          let code = v
            .get("error")
            .and_then(|e| e.get("code"))
            .and_then(|c| c.as_str())
            .unwrap_or("");
          if attempt == 0 && code == "CORE_SHUTDOWN" {
            tlog(&format!("retry {method} por CORE_SHUTDOWN"));
            continue;
          }
          return result;
        }
        Err(e) => {
          if attempt == 0 && should_retry_after_transport_err(e) {
            tlog(&format!("retry {method} por erro transporte: {e}"));
            continue;
          }
          return result;
        }
      }
    }
    Err("O core não respondeu após repetir a requisição.".to_string())
  }

  fn is_alive_inner(&self) -> bool {
    if let Ok(mut guard) = self.child.lock() {
      if let Some(ref mut child) = *guard {
        return child.try_wait().ok().flatten().is_none();
      }
    }
    false
  }

  fn cleanup_inner(&self) {
    tlog("cleanup core iniciado");
    notify_pending_drop(
      &self.pending,
      "O processo do core foi encerrado ou reiniciado. Tente de novo.",
    );
    if let Ok(mut guard) = self.stdin.lock() {
      drop(guard.take());
    }
    if let Ok(mut guard) = self.child.lock() {
      if let Some(ref mut child) = *guard {
        let _ = child.kill();
        let _ = child.wait();
      }
      *guard = None;
    }
    tlog("cleanup core finalizado");
  }

  pub fn cleanup(&self) {
    let _g = self.session.lock().unwrap();
    self.cleanup_inner();
  }

  fn ensure_started_under_lock(&self, app: &tauri::AppHandle) -> Result<(), String> {
    if self.is_alive_inner() {
      tlog("core já estava ativo");
      return Ok(());
    }
    tlog("core inativo, iniciando processo Java");
    self.cleanup_inner();
    let jar_path = core_jar_path(app)?;
    if !jar_path.exists() {
      return Err(format!("JAR não encontrado em: {}", jar_path.display()));
    }
    let (child, stdin, stdout) = spawn_core(app, &jar_path).map_err(|e| format!("Falha ao iniciar core: {e}"))?;
    tlog("processo Java spawnado");
    *self.child.lock().unwrap() = Some(child);
    *self.stdin.lock().unwrap() = Some(stdin);
    start_reader_thread(app.clone(), stdout, self.pending.clone());
    thread::sleep(Duration::from_millis(800));
    if !self.is_alive_inner() {
      tlog("core morreu logo após iniciar");
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
    tlog("core inicializado com sucesso");
    Ok(())
  }

  fn send_request_session_held(&self, method: &str, params: Value) -> Result<Value, String> {
    let id = Uuid::new_v4().to_string();
    let req = serde_json::json!({
      "id": id,
      "method": method,
      "params": params
    });
    let (tx, rx) = std::sync::mpsc::channel::<Value>();
    if !self.is_alive_inner() {
      return Err("Core não está rodando".to_string());
    }
    tlog(&format!("enviando request {method} ({id})"));
    self.pending.lock().unwrap().insert(id.clone(), tx);
    let mut guard = self.stdin.lock().unwrap();
    let stdin = guard.as_mut().ok_or_else(|| "stdin do core indisponível".to_string())?;
    if let Err(e) = stdin.write_all(format!("{}\n", req).as_bytes()) {
      drop(guard);
      self.pending.lock().ok().map(|mut m| m.remove(&id));
      self.cleanup_inner();
      return Err(format!("Core desconectado: {e}"));
    }
    stdin.flush().ok();
    drop(guard);
    match rx.recv_timeout(Duration::from_secs(45)) {
      Ok(resp) => {
        tlog(&format!("resposta ok {method} ({id})"));
        if let Some(got) = resp.get("id").and_then(|x| x.as_str()) {
          if got != id.as_str() {
            return Err("Resposta do core com id inesperado".to_string());
          }
        }
        Ok(resp)
      }
      Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
        tlog(&format!("timeout request {method} ({id})"));
        self.pending.lock().ok().map(|mut m| m.remove(&id));
        self.cleanup_inner();
        Err("Timeout aguardando resposta do core".to_string())
      }
      Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => Err(
        "Canal do core encerrou inesperadamente. Feche o app ou atualize a página de serviços.".to_string(),
      ),
    }
  }

  pub fn shutdown(&self) {
    self.cleanup();
  }
}
