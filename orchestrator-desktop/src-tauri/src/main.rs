#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod java_runtime;

use java_runtime::{read_runtime_settings, spawn_core, validate_java_runtime_path, write_runtime_settings, RuntimeSettings};
use serde_json::Value;
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use uuid::Uuid;

#[derive(Clone)]
struct CoreBridge {
  child: Arc<Mutex<Option<Child>>>,
  stdin: Arc<Mutex<Option<ChildStdin>>>,
  pending: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<Value>>>>,
  lifecycle: Arc<Mutex<()>>,
}

fn core_jar_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  if let Ok(env_jar) = std::env::var("ORCHESTRATOR_CORE_JAR") {
    return Ok(PathBuf::from(env_jar));
  }

  if cfg!(debug_assertions) {
    Ok(PathBuf::from("../orchestrator-core/target/orchestrator-core-standalone.jar"))
  } else {
    let resource_dir = app
      .path()
      .resource_dir()
      .map_err(|e| format!("Erro ao obter diretório de recursos: {e}"))?;
    let jar = resource_dir.join("orchestrator-core-standalone.jar");
    if !jar.exists() {
      return Err(format!("JAR não encontrado em: {}", jar.display()));
    }
    Ok(jar)
  }
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
  fn is_alive_inner(&self) -> bool {
    if let Ok(mut guard) = self.child.lock() {
      if let Some(ref mut child) = *guard {
        return child.try_wait().ok().flatten().is_none();
      }
    }
    false
  }

  fn is_alive(&self) -> bool {
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

  fn cleanup(&self) {
    let _lifecycle = self.lifecycle.lock().unwrap();
    self.cleanup_inner();
  }

  fn ensure_started(&self, app: &tauri::AppHandle) -> Result<(), String> {
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

    thread::sleep(Duration::from_millis(300));
    if !self.is_alive_inner() {
      self.cleanup_inner();
      return Err("Core encerrou imediatamente. Verifique a versão do Java.".to_string());
    }
    Ok(())
  }

  fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
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

  fn shutdown(&self) {
    self.cleanup();
  }
}

#[tauri::command]
async fn core_request(app: tauri::AppHandle, bridge: State<'_, CoreBridge>, method: String, params: Value) -> Result<Value, String> {
  let bridge = bridge.inner().clone();
  let app_handle = app.clone();
  let resp: Value = tauri::async_runtime::spawn_blocking(move || {
    bridge.ensure_started(&app_handle)?;
    bridge.send_request(&method, params)
  })
  .await
  .map_err(|e| format!("Task falhou: {e}"))??;

  if resp.get("ok").and_then(|v: &Value| v.as_bool()).unwrap_or(false) {
    Ok(resp.get("result").cloned().unwrap_or(Value::Null))
  } else {
    let error_msg = resp
      .get("error")
      .and_then(|e: &Value| e.get("message"))
      .and_then(|m: &Value| m.as_str())
      .unwrap_or("Erro desconhecido");
    let error_code = resp
      .get("error")
      .and_then(|e: &Value| e.get("code"))
      .and_then(|c: &Value| c.as_str())
      .unwrap_or("UNKNOWN");
    Err(format!("[{}] {}", error_code, error_msg))
  }
}

#[tauri::command]
fn get_runtime_settings(app: tauri::AppHandle) -> RuntimeSettings {
  read_runtime_settings(&app)
}

#[tauri::command]
fn set_java_runtime_path(app: tauri::AppHandle, bridge: State<'_, CoreBridge>, java_path: Option<String>) -> Result<RuntimeSettings, String> {
  let java_path = java_path.and_then(|value| {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
  });
  if let Some(value) = java_path.as_deref() {
    validate_java_runtime_path(value)?;
  }
  let settings = RuntimeSettings { java_path };
  write_runtime_settings(&app, &settings)?;
  bridge.cleanup();
  Ok(settings)
}

#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;

  let paths = app
    .dialog()
    .file()
    .set_title("Selecionar pastas")
    .blocking_pick_folders();

  match paths {
    Some(list) if !list.is_empty() => {
      let joined = list.iter().map(|p| p.to_string()).collect::<Vec<_>>().join("|");
      Ok(Some(joined))
    }
    _ => Ok(None),
  }
}

#[tauri::command]
async fn select_java_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;

  let path = app
    .dialog()
    .file()
    .set_title("Selecionar pasta do Java")
    .blocking_pick_folder();

  Ok(path.map(|value| value.to_string()))
}

#[tauri::command]
async fn select_java_file(app: tauri::AppHandle) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;

  let path = app
    .dialog()
    .file()
    .set_title("Selecionar executável do Java")
    .blocking_pick_file();

  Ok(path.map(|value| value.to_string()))
}

fn main() {
  let bridge = CoreBridge {
    child: Arc::new(Mutex::new(None)),
    stdin: Arc::new(Mutex::new(None)),
    pending: Arc::new(Mutex::new(HashMap::new())),
    lifecycle: Arc::new(Mutex::new(())),
  };

  tauri::Builder::default()
    .manage(bridge)
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      core_request,
      get_runtime_settings,
      set_java_runtime_path,
      select_folder,
      select_java_folder,
      select_java_file
    ])
    .setup(|app| {
      let app_handle = app.handle().clone();
      let b = app.state::<CoreBridge>();
      let _ = b.ensure_started(&app_handle);
      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        let b = app.state::<CoreBridge>();
        b.shutdown();
      }
    });
}
