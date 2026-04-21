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

## What It Delivers

- Centralized control for local services.
- Clean grouping with logical containers.
- Fast start, stop, and restart flows.
- Live logs with search and monitoring.
- Branch visibility for Git-based projects.
- Persistent workspace state across sessions.

## Supported Stacks

| Stack | Detection |
| --- | --- |
| Spring Boot | `pom.xml` |
| Next.js | `package.json` |
| NestJS | `package.json` |
| React | `package.json` |
| Vue | `package.json` |

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
