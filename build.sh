#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

CORE_DIR="$ROOT_DIR/orchestrator-core"
DESKTOP_DIR="$ROOT_DIR/orchestrator-desktop"

JAR_PATH="$CORE_DIR/target/orchestrator-core-standalone.jar"
JAR_DEST="$DESKTOP_DIR/src-tauri/orchestrator-core-standalone.jar"

log() { printf "\n[build] %s\n" "$*"; }

require_cmd() {
  local c="$1"
  if ! command -v "$c" >/dev/null 2>&1; then
    log "ERRO: comando obrigatório não encontrado: ${c}"
    exit 1
  fi
}

log "=== Build do Orchestrator ==="

require_cmd java
require_cmd mvn
require_cmd npm

log "1. Compilando orchestrator-core (JAR)..."
(
  cd "$CORE_DIR"
  mvn -q -DskipTests clean package
)
if [[ ! -f "$JAR_PATH" ]]; then
  log "ERRO: JAR não foi gerado em $JAR_PATH"
  exit 1
fi
log "✓ JAR gerado: $JAR_PATH"

log "2. Copiando JAR para o bundle do Tauri..."
cp "$JAR_PATH" "$JAR_DEST"
log "✓ JAR copiado para: $JAR_DEST"

log "3. Buildando frontend + desktop (Tauri)..."
(
  cd "$DESKTOP_DIR"
  if [[ ! -d node_modules ]]; then
    log "  Instalando dependências..."
    npm install
  fi
  npm run build
  npm run tauri:build
)
log "✓ Build completo!"

log ""
log "Executável gerado em: $DESKTOP_DIR/src-tauri/target/release/bundle/"
log "Para macOS: .app ou .dmg"
log "Para Linux: .AppImage, .deb ou .rpm"
log "Para Windows: .exe ou .msi"
