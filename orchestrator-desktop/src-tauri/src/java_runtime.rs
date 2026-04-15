use serde::{Deserialize, Serialize};
use std::env;
use std::ffi::OsString;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use tauri::Manager;

#[derive(Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeSettings {
  pub java_path: Option<String>,
}

struct ResolvedJavaRuntime {
  command: PathBuf,
  bin_dir: PathBuf,
  java_home: PathBuf,
}

pub fn state_dir(app: &tauri::AppHandle) -> PathBuf {
  let base = app
    .path()
    .app_data_dir()
    .unwrap_or_else(|_| PathBuf::from(".orchestrator/appdata"));
  base.join("orchestrator")
}

fn runtime_settings_path(app: &tauri::AppHandle) -> PathBuf {
  state_dir(app).join("desktop-settings.json")
}

pub fn read_runtime_settings(app: &tauri::AppHandle) -> RuntimeSettings {
  let path = runtime_settings_path(app);
  fs::read_to_string(path)
    .ok()
    .and_then(|raw| serde_json::from_str(&raw).ok())
    .unwrap_or_default()
}

pub fn write_runtime_settings(app: &tauri::AppHandle, settings: &RuntimeSettings) -> Result<(), String> {
  let state = state_dir(app);
  fs::create_dir_all(&state).map_err(|e| format!("Falha ao criar diretório de configuração: {e}"))?;
  let raw = serde_json::to_vec_pretty(settings).map_err(|e| format!("Falha ao serializar configuração: {e}"))?;
  fs::write(runtime_settings_path(app), raw).map_err(|e| format!("Falha ao salvar configuração: {e}"))
}

pub fn validate_java_runtime_path(raw: &str) -> Result<(), String> {
  resolve_java_runtime_from_path(raw).map(|_| ())
}

fn shell_path_entries() -> Vec<PathBuf> {
  if cfg!(windows) {
    return Vec::new();
  }
  let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
  let output = Command::new(&shell)
    .args(["-l", "-c", "echo $PATH"])
    .output();
  if let Ok(out) = output {
    let raw = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if !raw.is_empty() {
      return env::split_paths(&OsString::from(raw)).collect();
    }
  }
  Vec::new()
}

fn append_unique_path(entries: &mut Vec<PathBuf>, entry: PathBuf) {
  if !entries.iter().any(|existing| existing == &entry) {
    entries.push(entry);
  }
}

fn prepend_unique_path(entries: &mut Vec<PathBuf>, entry: PathBuf) {
  if !entries.iter().any(|existing| existing == &entry) {
    entries.insert(0, entry);
  }
}

fn current_path_entries() -> Vec<PathBuf> {
  let mut entries = shell_path_entries();
  let fallback = env::var_os("PATH").unwrap_or_default();
  for entry in env::split_paths(&fallback) {
    append_unique_path(&mut entries, entry);
  }
  if !cfg!(windows) {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/Users/unknown".to_string());
    for extra in [
      PathBuf::from(format!("{home}/.sdkman/candidates/java/current/bin")),
      PathBuf::from("/opt/homebrew/bin"),
      PathBuf::from("/usr/local/bin"),
    ] {
      if extra.is_dir() {
        append_unique_path(&mut entries, extra);
      }
    }
  }
  entries
}

fn java_binary_names() -> [&'static str; 2] {
  if cfg!(windows) {
    ["java.exe", "java"]
  } else {
    ["java", "java.exe"]
  }
}

fn resolve_java_home(bin_dir: &Path, fallback: &Path) -> PathBuf {
  if bin_dir.file_name().and_then(|v| v.to_str()) == Some("bin") {
    return bin_dir.parent().unwrap_or(fallback).to_path_buf();
  }
  fallback.to_path_buf()
}

fn resolve_java_runtime_from_path(raw: &str) -> Result<ResolvedJavaRuntime, String> {
  let trimmed = raw.trim();
  if trimmed.is_empty() {
    return Err("Caminho do Java vazio nas Configurações.".to_string());
  }
  let input = PathBuf::from(trimmed);
  if input.is_file() {
    let file_name = input
      .file_name()
      .and_then(|v| v.to_str())
      .unwrap_or_default()
      .to_ascii_lowercase();
    if !java_binary_names().iter().any(|name| *name == file_name) {
      return Err(format!("Caminho do Java inválido nas Configurações: {}", input.display()));
    }
    let bin_dir = input
      .parent()
      .ok_or_else(|| format!("Caminho do Java inválido nas Configurações: {}", input.display()))?
      .to_path_buf();
    let java_home = resolve_java_home(&bin_dir, &bin_dir);
    return Ok(ResolvedJavaRuntime {
      command: input,
      bin_dir,
      java_home,
    });
  }
  if input.is_dir() {
    for name in java_binary_names() {
      for candidate in [input.join("bin").join(name), input.join(name)] {
        if candidate.is_file() {
          let bin_dir = candidate
            .parent()
            .ok_or_else(|| format!("Caminho do Java inválido nas Configurações: {}", input.display()))?
            .to_path_buf();
          let java_home = resolve_java_home(&bin_dir, &input);
          return Ok(ResolvedJavaRuntime {
            command: candidate,
            bin_dir,
            java_home,
          });
        }
      }
    }
  }
  Err(format!("Caminho do Java inválido nas Configurações: {}", input.display()))
}

fn configured_java_runtime(app: &tauri::AppHandle) -> Result<Option<ResolvedJavaRuntime>, String> {
  match read_runtime_settings(app).java_path {
    Some(path) => resolve_java_runtime_from_path(&path).map(Some),
    None => Ok(None),
  }
}

fn join_path_entries(entries: &[PathBuf]) -> Result<OsString, String> {
  env::join_paths(entries).map_err(|e| format!("Falha ao montar PATH: {e}"))
}

fn java_missing_message() -> String {
  "Java não encontrado no PATH. Configure a pasta do Java ou o executável nas Configurações.".to_string()
}

fn java_command_name() -> &'static str {
  if cfg!(windows) { "java.exe" } else { "java" }
}

fn prepare_java_launch(app: &tauri::AppHandle) -> Result<(OsString, OsString, Option<PathBuf>), String> {
  let mut path_entries = current_path_entries();
  let runtime = configured_java_runtime(app)?;
  let command = runtime
    .as_ref()
    .map(|value| value.command.clone().into_os_string())
    .unwrap_or_else(|| OsString::from(java_command_name()));
  let java_home = runtime.as_ref().map(|value| value.java_home.clone());
  if let Some(value) = runtime {
    prepend_unique_path(&mut path_entries, value.bin_dir);
  }
  let path = join_path_entries(&path_entries)?;
  Ok((command, path, java_home))
}

fn java_startup_error(message: String) -> std::io::Error {
  std::io::Error::new(std::io::ErrorKind::NotFound, message)
}

fn apply_java_env(command: &mut Command, path: &OsString, java_home: Option<&PathBuf>) {
  command.env("PATH", path);
  if let Some(value) = java_home {
    command.env("JAVA_HOME", value);
  }
}

fn java_check_status(command: &OsString, path: &OsString, java_home: Option<&PathBuf>) -> std::io::Result<()> {
  let mut check = Command::new(command);
  check.arg("-version").stdout(Stdio::null()).stderr(Stdio::null());
  apply_java_env(&mut check, path, java_home);
  check.status().map(|_| ())
}

pub fn spawn_core(app: &tauri::AppHandle, jar: &Path) -> std::io::Result<(Child, ChildStdin, ChildStdout)> {
  let state = state_dir(app);
  fs::create_dir_all(&state)?;

  let log_dir = state.join("desktop-logs");
  let _ = fs::create_dir_all(&log_dir);

  let stdout = Stdio::piped();
  let stdin = Stdio::piped();
  let stderr_file = fs::File::create(log_dir.join("core.stderr.log"))?;

  let (java_command, path, java_home) = prepare_java_launch(app).map_err(java_startup_error)?;
  if java_check_status(&java_command, &path, java_home.as_ref()).is_err() {
    return Err(java_startup_error(java_missing_message()));
  }

  let mut command = Command::new(&java_command);
  command
    .args([
      "-jar",
      jar.to_string_lossy().as_ref(),
      "--stateDir",
      state.join("core").to_string_lossy().as_ref(),
    ])
    .stdin(stdin)
    .stdout(stdout)
    .stderr(Stdio::from(stderr_file));
  apply_java_env(&mut command, &path, java_home.as_ref());

  let mut child = command.spawn()?;
  let child_stdin = child.stdin.take().expect("stdin piped");
  let child_stdout = child.stdout.take().expect("stdout piped");
  Ok((child, child_stdin, child_stdout))
}
