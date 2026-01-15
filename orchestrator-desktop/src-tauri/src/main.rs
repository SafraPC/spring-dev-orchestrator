#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{Emitter, Manager, State};
use uuid::Uuid;

struct CoreBridge {
  child: Mutex<Option<Child>>,
  stdin: Mutex<Option<ChildStdin>>,
  pending: Arc<Mutex<HashMap<String, std::sync::mpsc::Sender<Value>>>>,
}

fn state_dir(app: &tauri::AppHandle) -> PathBuf {
  let base = app
    .path()
    .app_data_dir()
    .unwrap_or_else(|_| PathBuf::from(".orchestrator/appdata"));
  base.join("spring-dev-orchestrator")
}

fn core_jar_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  if let Ok(env_jar) = std::env::var("SPRING_DEV_ORCHESTRATOR_CORE_JAR") {
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

fn spawn_core(app: &tauri::AppHandle) -> std::io::Result<(Child, ChildStdin, std::process::ChildStdout)> {
  let state = state_dir(app);
  fs::create_dir_all(&state)?;

  let jar = core_jar_path(app).map_err(|e| std::io::Error::new(std::io::ErrorKind::NotFound, e))?;
  let log_dir = state.join("desktop-logs");
  let _ = fs::create_dir_all(&log_dir);

  let stdout = Stdio::piped();
  let stdin = Stdio::piped();
  let stderr_file = fs::File::create(log_dir.join("core.stderr.log"))?;

  let mut child = Command::new("java")
    .args([
      "-jar",
      jar.to_string_lossy().as_ref(),
      "--stateDir",
      state.join("core").to_string_lossy().as_ref(),
    ])
    .stdin(stdin)
    .stdout(stdout)
    .stderr(Stdio::from(stderr_file))
    .spawn()?;

  let child_stdin = child.stdin.take().expect("stdin piped");
  let child_stdout = child.stdout.take().expect("stdout piped");
  Ok((child, child_stdin, child_stdout))
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
  fn ensure_started(&self, app: &tauri::AppHandle) -> Result<(), String> {
    if self.child.lock().unwrap().is_some() {
      return Ok(());
    }
    let jar_path = core_jar_path(app)?;
    if !jar_path.exists() {
      return Err(format!("JAR do core não encontrado em: {}. Certifique-se de que o build foi executado corretamente.", jar_path.display()));
    }
    let (child, stdin, stdout) = spawn_core(app).map_err(|e| format!("Falha ao iniciar core: {e}"))?;
    *self.child.lock().unwrap() = Some(child);
    *self.stdin.lock().unwrap() = Some(stdin);
    start_reader_thread(app.clone(), stdout, self.pending.clone());
    Ok(())
  }

  fn send_request(&self, app: &tauri::AppHandle, method: &str, params: Value) -> Result<Value, String> {
    self.ensure_started(app)?;

    let id = Uuid::new_v4().to_string();
    let req = serde_json::json!({
      "id": id,
      "method": method,
      "params": params
    });

    let (tx, rx) = std::sync::mpsc::channel::<Value>();
    self.pending.lock().unwrap().insert(req["id"].as_str().unwrap().to_string(), tx);

    let mut guard = self.stdin.lock().unwrap();
    let stdin = guard.as_mut().ok_or_else(|| "stdin do core indisponível".to_string())?;
    stdin
      .write_all(format!("{}\n", req.to_string()).as_bytes())
      .map_err(|e| format!("Falha ao escrever no core: {e}"))?;
    stdin.flush().ok();

    match rx.recv_timeout(Duration::from_secs(30)) {
      Ok(resp) => Ok(resp),
      Err(_) => Err("Timeout aguardando resposta do core".to_string()),
    }
  }
}

#[tauri::command]
fn core_request(app: tauri::AppHandle, bridge: State<'_, CoreBridge>, method: String, params: Value) -> Result<Value, String> {
  let resp = match bridge.send_request(&app, &method, params) {
    Ok(r) => r,
    Err(e) => {
      return Err(e);
    }
  };
  
  if resp.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
    Ok(resp.get("result").cloned().unwrap_or(Value::Null))
  } else {
    let error_msg = resp
      .get("error")
      .and_then(|e| e.get("message"))
      .and_then(|m| m.as_str())
      .unwrap_or("Erro desconhecido");
    let error_code = resp
      .get("error")
      .and_then(|e| e.get("code"))
      .and_then(|c| c.as_str())
      .unwrap_or("UNKNOWN");
    Err(format!("[{}] {}", error_code, error_msg))
  }
}

#[tauri::command]
async fn select_folder(app: tauri::AppHandle) -> Result<Option<String>, String> {
  use tauri_plugin_dialog::DialogExt;
  
  let path = app
    .dialog()
    .file()
    .set_title("Selecionar pasta raiz")
    .blocking_pick_folder();
  
  match path {
    Some(p) => Ok(Some(p.to_string())),
    None => Ok(None),
  }
}

fn main() {
  tauri::Builder::default()
    .manage(CoreBridge {
      child: Mutex::new(None),
      stdin: Mutex::new(None),
      pending: Arc::new(Mutex::new(HashMap::new())),
    })
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![core_request, select_folder])
    .setup(|app| {
      let app_handle = app.handle().clone();
      let bridge = app.state::<CoreBridge>();
      let _ = bridge.ensure_started(&app_handle);
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}

