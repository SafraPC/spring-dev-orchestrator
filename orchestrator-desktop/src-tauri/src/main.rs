#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod core_bridge;
mod java_env;
mod java_runtime;

use core_bridge::CoreBridge;
use java_runtime::{read_runtime_settings, validate_java_runtime_path, write_runtime_settings, RuntimeSettings};
use serde_json::Value;
use tauri::{Manager, State};

#[tauri::command]
async fn core_request(app: tauri::AppHandle, bridge: State<'_, CoreBridge>, method: String, params: Value) -> Result<Value, String> {
  let bridge = bridge.inner().clone();
  let app_handle = app.clone();
  let resp: Value = tauri::async_runtime::spawn_blocking(move || {
    bridge.ensure_started_and_send_request(&app_handle, &method, params)
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
  let current = read_runtime_settings(&app);
  let java_path = java_path.and_then(|value| {
    let trimmed = value.trim().to_string();
    if trimmed.is_empty() { None } else { Some(trimmed) }
  });
  if current.java_path == java_path {
    return Ok(current);
  }
  if let Some(value) = java_path.as_deref() {
    validate_java_runtime_path(value)?;
  }
  let settings = RuntimeSettings { java_path };
  write_runtime_settings(&app, &settings)?;
  let bridge = bridge.inner().clone();
  let _ = tauri::async_runtime::spawn_blocking(move || {
    bridge.cleanup();
  });
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
  let bridge = CoreBridge::new();

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
    .setup(|_app| Ok(()))
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app, event| {
      if let tauri::RunEvent::Exit = event {
        let b = app.state::<CoreBridge>();
        b.shutdown();
      }
    });
}
