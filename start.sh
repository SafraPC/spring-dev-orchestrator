#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CORE_DIR="$ROOT_DIR/orchestrator-core"
DESKTOP_DIR="$ROOT_DIR/orchestrator-desktop"

ORCH_DIR="$ROOT_DIR/.orchestrator"
PID_DIR="$ORCH_DIR/pids"
mkdir -p "$PID_DIR"

UI_PID_FILE="$PID_DIR/ui.pid"

log() { printf "\n[orchestrator] %s\n" "$*"; }

require_cmd() {
  local c="$1"
  if ! command -v "$c" >/dev/null 2>&1; then
    log "ERRO: comando obrigatório não encontrado: ${c}"
    exit 1
  fi
}

ensure_rust_with_brew() {
  if command -v cargo >/dev/null 2>&1; then
    return 0
  fi

  if ! command -v brew >/dev/null 2>&1; then
    log "ERRO: Rust (cargo) não encontrado e Homebrew (brew) não está instalado."
    exit 1
  fi

  if [[ "$(uname -s)" == "Darwin" ]]; then
    if ! xcode-select -p >/dev/null 2>&1; then
      log "ERRO: Xcode Command Line Tools não encontrado."
      log "Rode: xcode-select --install"
      exit 1
    fi
  fi

  log "Instalando Rust via Homebrew..."
  brew install rust || true

  if ! command -v cargo >/dev/null 2>&1; then
    log "ERRO: não consegui instalar cargo via brew."
    exit 1
  fi
}

is_pid_alive() {
  local pid="$1"
  [[ -n "${pid:-}" ]] && kill -0 "$pid" 2>/dev/null
}

build_core() {
  log "Buildando orchestrator-core (jar standalone)..."
  (
    cd "$CORE_DIR"
    mvn -q -DskipTests package
  )
  log "Jar gerado em orchestrator-core/target/orchestrator-core-standalone.jar"
}

start_ui() {
  if [[ -f "$UI_PID_FILE" ]]; then
    local existing
    existing="$(cat "$UI_PID_FILE" 2>/dev/null || true)"
    if is_pid_alive "$existing"; then
      log "UI já está rodando (PID $existing)."
      return 0
    fi
  fi

  log "Iniciando frontend (Vite)..."
  (
    cd "$DESKTOP_DIR"
    if [[ ! -d node_modules ]]; then
      log "Instalando dependências (npm install)..."
      npm install
    fi
    mkdir -p "$DESKTOP_DIR/dist"
    nohup npm run dev -- --host localhost --port 5173 > "$ORCH_DIR/ui.console.log" 2>&1 &
    echo $! > "$UI_PID_FILE"
  )
  log "UI iniciada (PID $(cat "$UI_PID_FILE"))."
}

cleanup() {
  log "Encerrando processos..."

  if [[ -f "$UI_PID_FILE" ]]; then
    local pid
    pid="$(cat "$UI_PID_FILE" 2>/dev/null || true)"
    if is_pid_alive "$pid"; then
      log "Parando UI (PID $pid)..."
      kill "$pid" 2>/dev/null || true
    fi
  fi
}

trap cleanup EXIT INT TERM

require_cmd java
require_cmd mvn
require_cmd npm
ensure_rust_with_brew

build_core
start_ui

log "Abrindo Desktop (Tauri dev)..."
(
  cd "$DESKTOP_DIR"
  if [[ ! -d node_modules ]]; then
    log "Instalando dependências do Desktop (npm install)..."
    npm install
  fi
  SPRING_DEV_ORCHESTRATOR_CORE_JAR="$ROOT_DIR/orchestrator-core/target/orchestrator-core-standalone.jar" npm run tauri:dev
)
