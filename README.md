# Orchestrator

<p align="center">
  <strong>Professional desktop control plane for local development services.</strong>
</p>

<p align="center">
  Import Spring Boot, React, Next.js, NestJS, and Vue projects. Start faster, organize better, and keep local environments under control.
</p>

<p align="center">
  <a href="https://github.com/SafraPC/orchestrator/releases/latest">
    <img alt="Latest release" src="https://img.shields.io/badge/release-v1.0.3-0ea5e9?style=for-the-badge">
  </a>
  <a href="https://github.com/SafraPC/orchestrator/releases/latest">
    <img alt="Downloads" src="https://img.shields.io/github/downloads/SafraPC/orchestrator/total?style=for-the-badge&color=84cc16">
  </a>
  <a href="./LICENSE">
    <img alt="License" src="https://img.shields.io/badge/license-MIT-22c55e?style=for-the-badge">
  </a>
  <img alt="Platforms" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-111827?style=for-the-badge">
</p>

<p align="center">
  <img alt="Orchestrator running" src="./docs/running.png" width="92%">
</p>

---

## What It Delivers

- Centralized control for local services on macOS, Windows, and Linux.
- Clean grouping with logical containers.
- Fast start, stop, and restart flows with keyboard shortcuts.
- Live logs with search, filtering, and per-service or per-container views.
- Branch visibility for Git-based projects.
- Per-service customization: Java version, Maven wrapper, scripts, ports.
- Built-in port killer to recover stuck local ports.
- Persistent workspace state across sessions.

## Supported Stacks

| Stack | Detection |
| --- | --- |
| Spring Boot | `pom.xml` |
| Next.js | `package.json` |
| NestJS | `package.json` |
| React | `package.json` |
| Vue | `package.json` |

## Feature Tour

### Group services into containers

Organize services into logical containers (frontends, backends, full apps, sandboxes). Start or stop a whole container with one click.

<p align="center">
  <img alt="Create container" src="./docs/create-container.png" width="80%">
</p>

### Filter by technology

The tech filter narrows the service list to a single stack — useful when juggling dozens of microservices and frontends.

<p align="center">
  <img alt="Filter by tech" src="./docs/filter-by-tech.png" width="80%">
</p>

### Per-service logs

Inspect a single service with timestamps, search, line wrapping, and font size controls.

<p align="center">
  <img alt="See unique service logs" src="./docs/see-unique-service-logs.png" width="85%">
</p>

### Aggregated container logs

Switch the log panel to follow every service inside a container, color-tagged per service, in one stream.

<p align="center">
  <img alt="See container logs" src="./docs/se-container-logs.png" width="85%">
</p>

### Run or change any script

For Node-based projects, pick any script defined in `package.json`. For Spring Boot, toggle between system Maven and the project's `mvnw` wrapper directly from the service menu.

<p align="center">
  <img alt="Run or change any script" src="./docs/run-alter-any-script.png" width="80%">
</p>

### Kill stuck ports

Free a port that another process is holding without leaving the app. One click in the toolbar, type the port, done.

<p align="center">
  <img alt="Kill ports easily" src="./docs/kill-ports-easily.png" width="70%">
</p>

### Customize the experience

Zoom, font size, line wrap, Java runtime path, cache rebuild — all available from the settings panel.

<p align="center">
  <img alt="Customize yourself" src="./docs/customize-yourself.png" width="70%">
</p>

### One-shot configuration

Point Orchestrator at one or more project roots and it scans, classifies, and registers every service automatically.

<p align="center">
  <img alt="Easy configuration" src="./docs/easy-config.png" width="85%">
</p>

## Download

Releases are published for macOS, Windows, and Linux.

| Platform | Recommended package | Notes |
| --- | --- | --- |
| macOS | `.dmg` | Intel and Apple Silicon |
| Windows | `.msi` | `.exe` also available |
| Linux Debian/Ubuntu | `.deb` | Best desktop integration |
| Linux Arch | `.pkg.tar.zst` or `.AppImage` | Use distro preference |
| Linux generic | `.AppImage` | Portable fallback |

Latest release:

[`github.com/SafraPC/orchestrator/releases/latest`](https://github.com/SafraPC/orchestrator/releases/latest)

## Installation

### Desktop install

- macOS: download latest `.dmg`
- Windows: download latest `.msi`
- Linux: prefer `.deb`, then `.AppImage`

### Scripted install

Repository installers select the best release asset automatically.

Linux and macOS:

```bash
bash scripts/install/install.sh
```

Windows:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install\install.ps1
```

## Runtime Requirements

| Scenario | Required |
| --- | --- |
| Open desktop app | Java 17+ |
| Run Spring services | Project-compatible JDK and Maven or `mvnw` |
| Run JavaScript services | Project-compatible Node.js |
| Develop this repository | Java 17+, Maven, Node.js, Rust stable |

Notes:

- Windows installer prepares local Java, Maven, and Node automatically.
- macOS and Linux helper scripts now prepare local Java, Maven, and Node automatically for repo flows and scripted install flows.
- Linux desktop builds still require Tauri system packages from the official docs.
- Rust is only needed to develop or bundle this repository.

## Quick Start

1. Install the app for your platform.
2. Import one or more project folders.
3. Review detected services.
4. Group services into containers.
5. Start one service or a full container.
6. Follow logs and open local tools from the UI.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + S` | Start selected service |
| `Ctrl/Cmd + X` | Stop selected service |
| `Ctrl/Cmd + R` | Restart selected service |
| `Ctrl/Cmd + F` | Search logs |
| `Ctrl/Cmd + ,` | Open settings |
| `Ctrl/Cmd + +` / `-` / `0` | Zoom in / out / reset |

## Architecture

```text
orchestrator-core/      Java 17 orchestration engine
orchestrator-desktop/   Tauri desktop shell + React UI
```

Request flow:

1. React sends a command through Tauri.
2. Rust forwards the request to the Java core over JSON IPC.
3. The core executes the local action.
4. The UI receives responses and async log events.

IPC shapes:

```json
{"id":"uuid","method":"methodName","params":{}}
{"id":"uuid","ok":true,"result":{},"error":null}
{"event":"eventName","payload":{}}
```

## Local Development

### Start development mode

macOS and Linux:

```bash
./start.sh
```

Windows:

```powershell
.\start.ps1
```

### Build native bundles

macOS and Linux:

```bash
./build.sh
```

Windows:

```powershell
.\build.ps1
```

Generated bundles:

```text
orchestrator-desktop/src-tauri/target/release/bundle/
```

### Development notes

- `start.sh` and `build.sh` now bootstrap local Java, Maven, and Node on macOS and Linux when needed.
- `start.ps1` and `build.ps1` do the same on Windows.
- Linux desktop builds still need Tauri native packages for the distro.
- Manual build details remain in [`BUILD.md`](./BUILD.md).

Official Tauri prerequisites:

[`v2.tauri.app/start/prerequisites`](https://v2.tauri.app/start/prerequisites/)

## Data Location

| Platform | Path |
| --- | --- |
| macOS | `~/Library/Application Support/dev.safra.orchestrator/orchestrator/core` |
| Linux | `~/.local/share/dev.safra.orchestrator/orchestrator/core` |
| Windows | `%APPDATA%\dev.safra.orchestrator\orchestrator\core` |

## License

This project is available under [`LICENSE`](./LICENSE).
