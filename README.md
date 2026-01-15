# spring-dev-orchestrator

Aplicação **desktop** para desenvolvimento local que orquestra múltiplos microsserviços Spring Boot: iniciar/parar/reiniciar, acompanhar logs em tempo real e gerenciar configurações de execução a partir de uma única UI.

## Estrutura (monorepo)

```
spring-dev-orchestrator/
├── orchestrator-core/        (Java 21 + Spring Boot WebFlux)
├── orchestrator-ui/          (React + Vite + Tailwind)
└── orchestrator-desktop/     (Tauri)
```

## Status do repositório

- `orchestrator-core`: base funcional (API + WebSocket + start/stop/restart + logs em arquivo).
- `orchestrator-ui`: scaffolding (dashboard + logs) — sem lógica de processos no frontend.
- `orchestrator-desktop`: scaffolding (Tauri) — inicia o core automaticamente.

## Rodando apenas o core (sem UI / sem Tauri)

Pré-requisitos:

- Java **21**
- Maven (`mvn`)

Suba o servidor:

```bash
cd orchestrator-core
mvn spring-boot:run
```

O core sobe por padrão em `http://localhost:5174`.

## Configuração de serviços (`services.yaml`)

O core lê e persiste o arquivo `orchestrator-core/services.yaml`. Se não existir, ele cria um exemplo com um serviço “dummy” que gera logs para demonstrar start/stop/logs.

Campos mínimos por serviço:

- `name`
- `path`
- `command` (lista de strings)
- `logFile`

## API (resumo)

Base: `http://localhost:5174/api`

- `GET /services`: lista serviços
- `POST /services/{name}/start`: inicia
- `POST /services/{name}/stop`: para (SIGTERM -> SIGKILL)
- `POST /services/{name}/restart`: reinicia
- `POST /services/start-all`: inicia todos
- `POST /services/stop-all`: para todos

Logs via WebSocket (stream):

- `ws://localhost:5174/ws/logs?service={name}`

## Rodando a UI (opcional)

Pré-requisitos:

- Node.js 18+ (recomendado 20+)

```bash
cd orchestrator-ui
npm install
npm run dev
```

A UI roda em `http://localhost:5173` e chama o core em `http://localhost:5174`.

Se o core estiver em outra porta/host, configure a UI via variável:

- `VITE_CORE_URL` (ex: `http://localhost:5174`) — veja `orchestrator-ui/env.example`

## Rodando o app Desktop (Tauri)

Pré-requisitos:

- Toolchain Rust (para Tauri)
- Node.js

Em modo dev:

- Suba o core (ou deixe o desktop subir automaticamente)
- Suba a UI com `npm run dev` em `orchestrator-ui`
- Rode o Tauri:

```bash
cd orchestrator-desktop
npm install
npm run tauri:dev
```

O desktop tenta iniciar o core via Maven (default). Para customizar o comando do core:

- `SPRING_DEV_ORCHESTRATOR_CORE_EXEC`: executável a ser chamado no startup do desktop.

## Start rápido (script)

Existe um script na raiz para subir tudo de uma vez:

```bash
chmod +x start.sh
./start.sh
```

Ele faz:

- inicia `orchestrator-core`
- chama `POST /api/services/start-all`
- inicia `orchestrator-ui`
- abre o desktop (`tauri dev`)
  Ao fechar o Desktop (ou pressionar Ctrl+C no terminal), o script faz cleanup e encerra core/UI/serviços.

## Gerar Executável/Instalador

Para gerar um executável standalone (sem precisar rodar o código ou start.sh):

```bash
./build.sh
```

Este script irá:
1. Compilar o `orchestrator-core` (JAR standalone)
2. Buildar a UI (Vite)
3. Gerar o executável/instalador (Tauri)

Os executáveis serão gerados em:
- **macOS**: `.app` ou `.dmg` em `orchestrator-desktop/src-tauri/target/release/bundle/`
- **Linux**: `.AppImage`, `.deb` ou `.rpm`
- **Windows**: `.exe` ou `.msi`

Para mais detalhes, consulte [BUILD.md](./BUILD.md).
