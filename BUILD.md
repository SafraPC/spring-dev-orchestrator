# Build do Orchestrator

## Pré-requisitos

- **Java 17+** (JDK)
- **Maven 3.6+**
- **Node.js 18+** e **npm**
- **Rust** (`rustup` ou `brew install rust`)

## Build completo

```bash
./build.sh
```

Etapas:
1. Compila `orchestrator-core` (JAR standalone via Maven)
2. Copia JAR para o bundle Tauri
3. Builda frontend (Vite)
4. Gera executável nativo (Tauri)

## Build manual

### 1. Core Java

```bash
cd orchestrator-core
mvn clean package -DskipTests
```

JAR: `orchestrator-core/target/orchestrator-core-standalone.jar`

### 2. Copiar JAR

```bash
cp orchestrator-core/target/orchestrator-core-standalone.jar \
   orchestrator-desktop/src-tauri/orchestrator-core-standalone.jar
```

### 3. Frontend + Desktop

```bash
cd orchestrator-desktop
npm install
npm run build
npm run tauri:build
```

## Saída

```
orchestrator-desktop/src-tauri/target/release/bundle/
├── macos/    → .app
└── dmg/      → .dmg
```

## Variáveis de ambiente

| Variável | Uso |
|----------|-----|
| `SPRING_DEV_ORCHESTRATOR_CORE_JAR` | JAR customizado para dev (`npm run tauri:dev`) |

## Troubleshooting

- **JAR não encontrado**: execute `mvn clean package -DskipTests` no core
- **Java não encontrado**: verifique `java -version` e PATH
- **Rust não encontrado**: `brew install rust` ou `rustup`
- **Build lento**: primeiro build Rust compila todas as deps; subsequentes são rápidos
