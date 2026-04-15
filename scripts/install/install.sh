#!/usr/bin/env bash
set -euo pipefail

REPO="${REPO:-SafraPC/spring-dev-orchestrator}"
API_URL="https://api.github.com/repos/${REPO}/releases/latest"
RELEASE_PAGE="https://github.com/${REPO}/releases/latest"
TMP_DIR="${TMPDIR:-/tmp}/spring-dev-orchestrator-install"
mkdir -p "$TMP_DIR"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[install] comando obrigatório ausente: $1"
    exit 1
  fi
}

require_cmd curl
require_cmd python3
require_cmd uname

OS="$(uname -s)"
ARCH_RAW="$(uname -m)"
case "$ARCH_RAW" in
  arm64|aarch64) ARCH="arm64" ;;
  x86_64|amd64) ARCH="x64" ;;
  *) ARCH="$ARCH_RAW" ;;
esac

echo "[install] Detectado: ${OS} ${ARCH}"
echo "[install] Buscando último release em ${REPO}"

curl_args=(-fsSL -H "Accept: application/vnd.github+json" -H "User-Agent: spring-dev-orchestrator-installer")
if [[ -n "${GITHUB_TOKEN:-}" ]]; then
  curl_args+=(-H "Authorization: Bearer ${GITHUB_TOKEN}")
fi

if ! RELEASE_JSON="$(curl "${curl_args[@]}" "$API_URL")"; then
  echo "[install] Não foi possível acessar releases/latest."
  echo "[install] Verifique repositório/release ou use GITHUB_TOKEN se for privado."
  echo "[install] Página: ${RELEASE_PAGE}"
  exit 1
fi

detect_linux_family() {
  if [[ ! -f /etc/os-release ]]; then
    echo "generic"
    return
  fi
  local id_like id
  id_like="$(grep -E '^ID_LIKE=' /etc/os-release | cut -d= -f2 | tr -d '\"' | tr '[:upper:]' '[:lower:]')"
  id="$(grep -E '^ID=' /etc/os-release | cut -d= -f2 | tr -d '\"' | tr '[:upper:]' '[:lower:]')"
  if [[ "$id" == "ubuntu" || "$id" == "debian" || "$id_like" == *"debian"* ]]; then
    echo "debian"
  elif [[ "$id" == "arch" || "$id_like" == *"arch"* ]]; then
    echo "arch"
  else
    echo "generic"
  fi
}

LINUX_FAMILY="generic"
if [[ "$OS" == "Linux" ]]; then
  LINUX_FAMILY="$(detect_linux_family)"
  echo "[install] Linux detectado: ${LINUX_FAMILY}"
fi
ASSET_LINE="$(
  python3 - <<'PY' "$OS" "$ARCH" "$LINUX_FAMILY"
import json
import sys

os_name = sys.argv[1]
arch = sys.argv[2]
linux_family = sys.argv[3]
release = json.load(sys.stdin)
assets = release.get("assets", [])

def score(name: str) -> int:
    n = name.lower()
    s = 0
    if os_name == "Darwin":
        if n.endswith(".dmg"):
            s += 100
        if n.endswith(".app"):
            s += 90
        if arch == "arm64" and ("aarch64" in n or "arm64" in n):
            s += 50
        if arch == "x64" and ("x64" in n or "x86_64" in n or "amd64" in n):
            s += 50
    elif os_name == "Linux":
        if linux_family == "debian":
            if n.endswith(".deb"):
                s += 140
            if n.endswith(".appimage"):
                s += 100
            if n.endswith(".rpm"):
                s += 60
        elif linux_family == "arch":
            if n.endswith(".appimage"):
                s += 140
            if n.endswith(".pkg.tar.zst"):
                s += 130
            if n.endswith(".deb"):
                s += 60
            if n.endswith(".rpm"):
                s += 50
        else:
            if n.endswith(".appimage"):
                s += 120
            if n.endswith(".deb"):
                s += 100
            if n.endswith(".rpm"):
                s += 90
        if arch == "arm64" and ("aarch64" in n or "arm64" in n):
            s += 50
        if arch == "x64" and ("x64" in n or "x86_64" in n or "amd64" in n):
            s += 50
        if arch == "x64" and ("arm64" not in n and "aarch64" not in n):
            s += 10
    return s

best = None
for a in assets:
    name = a.get("name", "")
    url = a.get("browser_download_url", "")
    s = score(name)
    if s == 0:
        continue
    if best is None or s > best[0]:
        best = (s, name, url)

if best is None:
    sys.exit(1)

print(f"{best[1]}|{best[2]}")
PY
)" || {
  echo "[install] Não achei asset compatível no release."
  echo "[install] Abra: ${RELEASE_PAGE}"
  exit 1
}

ASSET_NAME="${ASSET_LINE%%|*}"
ASSET_URL="${ASSET_LINE#*|}"
ASSET_PATH="$TMP_DIR/$ASSET_NAME"

echo "[install] Baixando: ${ASSET_NAME}"
curl "${curl_args[@]}" "$ASSET_URL" -o "$ASSET_PATH"

install_macos() {
  local dmg="$1"
  require_cmd hdiutil
  local mount_point
  mount_point="$(hdiutil attach "$dmg" -nobrowse -quiet | awk 'END{print $3}')"
  local app_path
  app_path="$(python3 - <<'PY' "$mount_point"
from pathlib import Path
import sys
p = Path(sys.argv[1])
apps = sorted(p.glob("*.app"))
if not apps:
    raise SystemExit(1)
print(apps[0])
PY
)"
  local target="/Applications"
  if [ ! -w "$target" ]; then
    target="$HOME/Applications"
    mkdir -p "$target"
  fi
  echo "[install] Instalando em: $target"
  cp -R "$app_path" "$target/"
  hdiutil detach "$mount_point" -quiet || true
  echo "[install] Concluído (macOS)."
  echo "[install] Dados persistentes: ~/Library/Application Support/dev.safra.spring-dev-orchestrator/spring-dev-orchestrator/core"
}

install_linux() {
  local file="$1"
  local lower="${file,,}"
  if [[ "$lower" == *.appimage ]]; then
    mkdir -p "$HOME/.local/bin"
    local target="$HOME/.local/bin/orchestrator"
    cp "$file" "$target"
    chmod +x "$target"
    mkdir -p "$HOME/.local/share/applications"
    cat > "$HOME/.local/share/applications/orchestrator.desktop" <<EOF
[Desktop Entry]
Name=Orchestrator
Exec=$target
Type=Application
Terminal=false
Categories=Development;
EOF
    echo "[install] Concluído com AppImage."
  elif [[ "$lower" == *.deb ]]; then
    if command -v apt >/dev/null 2>&1; then
      sudo apt install -y "$file"
      echo "[install] Concluído com DEB."
    else
      echo "[install] DEB baixado em: $file"
      echo "[install] Instale manualmente com seu gerenciador."
    fi
  elif [[ "$lower" == *.rpm ]]; then
    if command -v dnf >/dev/null 2>&1; then
      sudo dnf install -y "$file"
      echo "[install] Concluído com RPM."
    elif command -v yum >/dev/null 2>&1; then
      sudo yum install -y "$file"
      echo "[install] Concluído com RPM."
    else
      echo "[install] RPM baixado em: $file"
      echo "[install] Instale manualmente com seu gerenciador."
    fi
  elif [[ "$lower" == *.pkg.tar.zst ]]; then
    if command -v pacman >/dev/null 2>&1; then
      sudo pacman -U --noconfirm "$file"
      echo "[install] Concluído com pacote Arch."
    else
      echo "[install] Pacote Arch baixado em: $file"
      echo "[install] Instale manualmente com pacman -U."
    fi
  else
    echo "[install] Formato Linux não suportado: $file"
    exit 1
  fi
  echo "[install] Dados persistentes: ~/.local/share/dev.safra.spring-dev-orchestrator/spring-dev-orchestrator/core"
}

case "$OS" in
  Darwin)
    install_macos "$ASSET_PATH"
    ;;
  Linux)
    install_linux "$ASSET_PATH"
    ;;
  *)
    echo "[install] Sistema não suportado por este script: $OS"
    echo "[install] Use o instalador de releases: https://github.com/${REPO}/releases/latest"
    exit 1
    ;;
esac
