# Spring Dev Orchestrator

Aplicação **desktop nativa** para orquestrar múltiplos microsserviços Spring Boot: iniciar/parar/reiniciar, acompanhar logs em tempo real, organizar em containers e gerenciar configurações — tudo numa única UI.

## Arquitetura (2 módulos)

```
spring-dev-orchestrator/
├── orchestrator-core/      Java 17 — lógica de negócio, fat JAR standalone
└── orchestrator-desktop/   Tauri (Rust) + React/Vite/Tailwind — frontend e desktop
```

- **Core**: processo Java que recebe comandos via stdin/stdout (JSON IPC). Escaneia projetos, gerencia processos, persiste estado.
- **Desktop**: app Tauri que embarca o frontend React e spawna o core como processo filho.

## Pré-requisitos

- Java 17+ (JDK)
- Maven 3.6+
- Node.js 18+ e npm
- Rust (via `rustup` ou Homebrew)

## Dev (modo desenvolvimento)

```bash
./start.sh
```

Compila o core, inicia o Vite dev server e abre o Tauri em modo dev.

## Build (executável nativo)

```bash
./build.sh
```

Gera:
- **macOS**: `.app` / `.dmg` em `orchestrator-desktop/src-tauri/target/release/bundle/`
- **Linux**: `.AppImage` / `.deb` / `.rpm`
- **Windows**: `.exe` / `.msi`

## Funcionalidades

- Scan automático de projetos Spring Boot (busca `pom.xml`)
- Start/stop/restart individual ou em lote
- Containers (agrupamento lógico de serviços)
- Logs em tempo real com busca, cópia e highlight por nível
- Detecção automática de porta (properties/yml)
- Atalhos de teclado: Ctrl+S (start), Ctrl+X (stop), Ctrl+R (restart), Ctrl+F (buscar logs)
- Status bar com contagem de serviços
- Toast notifications
- Uptime e port links clicáveis
