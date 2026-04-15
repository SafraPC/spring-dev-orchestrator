# Spring Dev Orchestrator

Aplicação desktop para orquestrar microsserviços.
Foco em produtividade local.
Sem Docker obrigatório.

## O que é a aplicação

O Orchestrator centraliza operações de serviços.
Você importa pastas de projetos.
O app detecta serviços.
Depois controla ciclo de vida.

Principais objetivos:
- iniciar, parar e reiniciar serviços rápido
- agrupar serviços por container lógico
- acompanhar logs em tempo real
- manter estado persistente entre reinicializações

## Como funciona

Arquitetura em dois módulos:

```
spring-dev-orchestrator/
├── orchestrator-core/      Java 17 (motor de orquestração)
└── orchestrator-desktop/   Tauri + React (aplicação desktop)
```

Fluxo:
- UI envia comando para o Core
- Core executa ação local
- UI recebe resposta e eventos

## Funcionalidades principais

- descoberta de serviços por varredura de pastas
- start/stop/restart individual ou em lote
- containers lógicos para organização
- logs em tempo real com busca
- links de porta e status por serviço
- abertura de pasta, terminal e editor
- filtros por tecnologia e texto

## Manual de uso

### 1) Importar projetos

- clique em importar pasta
- selecione uma ou mais pastas
- aguarde varredura concluir

### 2) Organizar containers

- crie containers por contexto
- mova serviços para containers
- use abas para filtrar visão

### 3) Operar serviços

- use botão play para iniciar
- use botão stop para parar
- use restart para reiniciar
- use ações em lote quando necessário

### 4) Acompanhar logs

- selecione serviço na tabela
- abra painel de logs
- filtre texto no campo de busca

### 5) Atalhos úteis

- `Ctrl/Cmd + S` inicia serviço selecionado
- `Ctrl/Cmd + X` para serviço selecionado
- `Ctrl/Cmd + R` reinicia serviço selecionado
- `Ctrl/Cmd + F` busca no log

## Instalação

Sem clonar projeto.
Sem build manual local.
Use links diretos.

### Instalação automática por sistema

Pré-condição:
- existe release publicada com assets nativos
- para repositório privado, exporte `GITHUB_TOKEN`

**macOS (Intel/Apple Silicon)**

- Script automático: [instalar no macOS](https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.sh)
- Comando 1 linha:

```bash
curl -fsSL https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.sh | bash
```

**Linux Ubuntu / Debian**

- Script automático: [instalar no Linux](https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.sh)
- Comando 1 linha:

```bash
curl -fsSL https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.sh | bash
```

Prioridade de pacote no Ubuntu/Debian:
- `.deb` (preferencial)
- `.AppImage` (fallback)

**Linux Arch**

- Script automático: [instalar no Arch](https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.sh)
- Comando 1 linha:

```bash
curl -fsSL https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.sh | bash
```

Prioridade de pacote no Arch:
- `.AppImage` (preferencial)
- `.pkg.tar.zst` (se publicado)

**Windows**

- Script automático: [instalar no Windows](https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.ps1)
- Comando PowerShell:

```powershell
irm https://raw.githubusercontent.com/SafraPC/spring-dev-orchestrator/main/scripts/install/install.ps1 | iex
```

Prioridade de pacote no Windows:
- `.msi` (preferencial)
- `.exe` (fallback)

### Downloads diretos por release

- Página de release: [baixar última versão](https://github.com/SafraPC/spring-dev-orchestrator/releases/latest)

## Persistência e storage

O app salva estado no diretório de dados do sistema.
Assim não perde configuração ao fechar.

Locais padrão:
- macOS: `~/Library/Application Support/dev.safra.spring-dev-orchestrator/spring-dev-orchestrator/core`
- Linux: `~/.local/share/dev.safra.spring-dev-orchestrator/spring-dev-orchestrator/core`
- Windows: `%APPDATA%\\dev.safra.spring-dev-orchestrator\\spring-dev-orchestrator\\core`

Arquivos persistidos:
- `workspace.json`
- `runtime.json`
- logs internos do Orchestrator

## Para desenvolvimento local

Pré-requisitos:
- Java 17+
- Maven
- Node.js 18+
- Rust

Modo dev:

```bash
./start.sh
```

Build nativo:

```bash
./build.sh
```

Saídas:
- macOS: `.app` e `.dmg`
- Linux: `.AppImage`, `.deb`, `.rpm`
- Windows: `.msi` e/ou `.exe`
