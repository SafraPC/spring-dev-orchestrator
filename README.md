# Orchestrator

<p align="center">Desktop orchestration for local Spring and JavaScript projects, including React, Next.js, NestJS, and Vue.</p>

<p align="center">
  <a href="https://github.com/SafraPC/orchestrator/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/github/v/release/SafraPC/orchestrator?display_name=release">
  </a>
  <a href="https://github.com/SafraPC/orchestrator/releases/latest">
    <img alt="Total downloads" src="https://img.shields.io/github/downloads/SafraPC/orchestrator/total">
  </a>
  <a href="./LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/SafraPC/orchestrator">
  </a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-1f6feb">
</p>

<p align="center">
  <a href="https://github.com/SafraPC/orchestrator/releases/latest">
    <img alt="Download for macOS, Windows, and Linux" src="https://img.shields.io/badge/Download-macOS%20%7C%20Windows%20%7C%20Linux-2ea44f?style=for-the-badge">
  </a>
</p>

> Import project folders, detect runnable services, group them into logical containers, and control the full local development lifecycle from a single desktop application.

No Docker required.

## Download

Prebuilt installers are published with every release.

**Download for macOS, Windows, and Linux:** [Latest release](https://github.com/SafraPC/orchestrator/releases/latest)

| Platform | Recommended package | Fallbacks |
| --- | --- | --- |
| macOS (Intel and Apple Silicon) | `.dmg` | - |
| Windows | `.msi` | `.exe` |
| Linux (Ubuntu and Debian) | `.deb` | `.AppImage`, `.rpm` |
| Linux (Arch) | `.AppImage` | `.pkg.tar.zst` |
| Linux (generic) | `.AppImage` | `.deb`, `.rpm` |

Repository-based installs can use `scripts/install/install.sh` or `scripts/install/install.ps1` to select the latest compatible asset automatically.

Linux one-line install:

```bash
curl -fsSL https://github.com/SafraPC/orchestrator/releases/latest/download/install.sh | bash
```

## Requirements

Orchestrator has two different requirement sets: one for using the released app, and one for developing this repository.

| Scenario | Required | Optional |
| --- | --- | --- |
| Use the released desktop app | Java 17+ in `PATH` | `JAVA_HOME` configured |
| Run Spring services | JDK compatible with each service | Maven or `mvnw` |
| Run Next.js, NestJS, React, or Vue services | Node.js compatible with each project | `nvm`, `fnm`, or Volta |
| Develop this repository | Java 17+, Maven, Node.js 18+, Rust stable | OS-specific Tauri dependencies |

- End users do not need Rust to use the released app.
- End users do not need Maven or Node.js unless imported services depend on them.
- The desktop app launches the bundled core with the system `java` command.
- If `java` is not available in `PATH`, the app will not start.
- `JAVA_HOME` is the recommended default JDK for Spring services.
- Windows installers handle `WebView2` automatically on supported systems.
- On Linux, prefer `.deb` or `.rpm` because Tauri relies on system `WebKitGTK` libraries.

## Java Setup

**Recommended JDK:** [Eclipse Temurin 17](https://adoptium.net/temurin/releases/?version=17)

Use Java 17 or newer.
Prefer a JDK, not only a JRE.
App startup requires `java` in `PATH`.
Spring services use `JAVA_HOME` by default.
When multiple JDKs are detected, the app can switch versions per service.

Verify:

```bash
java -version
```

<details>
<summary>macOS</summary>

```bash
brew install --cask temurin@17
echo 'export JAVA_HOME=$(/usr/libexec/java_home -v 17)' >> ~/.zshrc
echo 'export PATH="$JAVA_HOME/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
java -version && echo $JAVA_HOME
```

If you use `bash`, replace `~/.zshrc` with `~/.bash_profile` or `~/.bashrc`.

</details>

<details>
<summary>Windows</summary>

```powershell
winget install EclipseAdoptium.Temurin.17.JDK
java -version
echo $env:JAVA_HOME
where.exe java
```

If `JAVA_HOME` is empty, create it in `System Properties` -> `Environment Variables` and add `%JAVA_HOME%\bin` to `Path`.

</details>

<details>
<summary>Linux</summary>

Recommended for multiple JDKs: SDKMAN.

```bash
curl -s "https://get.sdkman.io" | bash
source "$HOME/.sdkman/bin/sdkman-init.sh"
sdk install java 17-tem
sdk default java 17-tem
java -version && echo $JAVA_HOME
```

Ubuntu and Debian alternative:

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk
export JAVA_HOME=$(dirname "$(dirname "$(readlink -f "$(command -v java)")")")
export PATH="$JAVA_HOME/bin:$PATH"
java -version && echo $JAVA_HOME
```

Prefer `.deb` on Debian and Ubuntu.
Prefer distro packages over `.AppImage` when possible.

</details>

## Installation

If you skipped the download section, use one of the options below.

### Desktop installers

- macOS: [Download the latest `.dmg`](https://github.com/SafraPC/orchestrator/releases/latest)
- Windows: [Download the latest `.msi`](https://github.com/SafraPC/orchestrator/releases/latest)
- Linux: [Download the latest `.deb` or `.AppImage`](https://github.com/SafraPC/orchestrator/releases/latest)

### Linux install with curl

This is the simplest Linux path for Debian, Ubuntu, Arch, and generic distributions.

```bash
curl -fsSL https://github.com/SafraPC/orchestrator/releases/latest/download/install.sh | bash
```

### Security prompts

- Windows: `SmartScreen` warnings will continue until the installer is code-signed with a trusted certificate.
- Ubuntu and Debian: a standalone `.deb` downloaded from the browser is not the same as installing from a signed APT repository, so software centers may still show an unknown source warning.
- Linux CLI installation is recommended when you want to avoid the GUI installer path for the downloaded `.deb`.

## Why Orchestrator

- Centralizes local service operations in one desktop app.
- Reduces repetitive terminal work during daily development.
- Organizes services by logical containers instead of shell sessions.
- Streams logs in real time with search and filtering.
- Preserves workspace and runtime state between sessions.

## Feature Overview

| Area | Capabilities |
| --- | --- |
| Discovery | Import folders, scan roots, auto-detect runnable projects |
| Service lifecycle | Start, stop, restart, and operate services in batch |
| Organization | Group services into logical containers and filter views |
| Observability | Follow live logs, search log output, monitor grouped services |
| Developer actions | Open a service folder, terminal, or editor directly |
| Persistence | Keep imported roots, runtime state, and container assignments |

## Supported Project Types

The orchestrator supports Spring services and common JavaScript projects discovered through `pom.xml` and `package.json`.

| Project type | Detection strategy |
| --- | --- |
| Spring Boot | `pom.xml` scan |
| Next.js | `package.json` dependency detection |
| NestJS | `package.json` dependency detection |
| React | `package.json` dependency detection |
| Vue | `package.json` dependency detection |

## Quick Start

1. Download the latest release for your platform.
2. Open the app and import one or more project folders.
3. Review detected services and organize them into containers.
4. Start a single service or an entire container.
5. Follow live logs and use quick actions to open the folder, terminal, or editor.

### Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + S` | Start selected service |
| `Ctrl/Cmd + X` | Stop selected service |
| `Ctrl/Cmd + R` | Restart selected service |
| `Ctrl/Cmd + F` | Search logs |

## Architecture

```text
orchestrator-core/      Java 17 orchestration engine
orchestrator-desktop/   Tauri desktop application
```

Request flow:

1. React UI sends a command through Tauri.
2. Rust forwards the request to the Java core over JSON IPC.
3. The core executes the local action and returns a response.
4. The UI receives responses and async log events.

<details>
<summary>IPC message shapes</summary>

```json
{"id":"uuid","method":"methodName","params":{}}
{"id":"uuid","ok":true,"result":{},"error":null}
{"event":"eventName","payload":{}}
```

</details>

## Local Development

### Prerequisites

| Tool | Version | Download |
| --- | --- | --- |
| Java | 17+ JDK | [Temurin 17](https://adoptium.net/temurin/releases/?version=17) |
| Maven | 3.6+ | [maven.apache.org/download.cgi](https://maven.apache.org/download.cgi) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Rust | Stable | [rustup.rs](https://rustup.rs/) |

### Development Setup

No project-specific Rust version is pinned.
Use the current stable toolchain.

Install Rust on macOS and Linux:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustc --version
```

Install Rust on Windows from [rustup.rs](https://rustup.rs/), then verify with `rustc --version`.

Platform-specific notes:

- macOS: run `xcode-select --install`
- Windows: install Visual Studio Build Tools with `Desktop development with C++`
- Linux: install the Tauri system packages for your distro

Debian and Ubuntu example:

```bash
sudo apt update
sudo apt install -y libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Other Linux distributions should follow the official Tauri prerequisites: [v2.tauri.app/start/prerequisites](https://v2.tauri.app/start/prerequisites/)

### Start development mode

```bash
./start.sh
```

### Build native bundles

```bash
./build.sh
```

Generated artifacts are written to `orchestrator-desktop/src-tauri/target/release/bundle/`.

For manual build steps and troubleshooting, see [`BUILD.md`](./BUILD.md).

## Data Persistence

The application stores its state in the operating system data directory.

### Stored files

| File | Purpose |
| --- | --- |
| `workspace.json` | Imported roots, services, containers, removed services |
| `runtime.json` | Process state, status, and timestamps |

### Default locations

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/dev.safra.orchestrator/orchestrator/core` |
| Linux | `~/.local/share/dev.safra.orchestrator/orchestrator/core` |
| Windows | `%APPDATA%\dev.safra.orchestrator\orchestrator\core` |

## License

This project is available under the terms described in [`LICENSE`](./LICENSE).
