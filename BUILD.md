# Guia de Build do Orchestrator

Este guia explica como gerar executáveis/instaladores do Orchestrator para distribuição.

## Pré-requisitos

- **Java 21+** (JDK)
- **Maven 3.6+**
- **Node.js 18+** e **npm**
- **Rust** (instalado via `rustup` ou Homebrew)
- **Tauri CLI** (instalado automaticamente via npm)

### Instalação rápida (macOS)

```bash
# Java (via Homebrew)
brew install openjdk@21

# Maven
brew install maven

# Node.js
brew install node

# Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

## Build Completo

Execute o script de build na raiz do projeto:

```bash
./build.sh
```

Este script irá:
1. Compilar o `orchestrator-core` (gerar JAR standalone)
2. Copiar o JAR para o bundle do Tauri
3. Buildar a UI (Vite)
4. Gerar o executável/instalador (Tauri)

## Saída do Build

Após o build, os executáveis estarão em:

```
orchestrator-desktop/src-tauri/target/release/bundle/
```

### macOS
- **`.app`**: Aplicativo macOS (arraste para Applications)
- **`.dmg`**: Instalador DMG (duplo clique para instalar)

### Linux
- **`.AppImage`**: Executável portável
- **`.deb`**: Pacote Debian/Ubuntu
- **`.rpm`**: Pacote RedHat/Fedora

### Windows
- **`.exe`**: Executável Windows
- **`.msi`**: Instalador MSI

## Build Manual (Passo a Passo)

Se preferir fazer o build manualmente:

### 1. Build do Core Java

```bash
cd orchestrator-core
mvn clean package -DskipTests
```

O JAR será gerado em: `orchestrator-core/target/orchestrator-core-standalone.jar`

### 2. Copiar JAR para o Bundle

```bash
cp orchestrator-core/target/orchestrator-core-standalone.jar \
   orchestrator-desktop/src-tauri/orchestrator-core-standalone.jar
```

### 3. Build da UI

```bash
cd orchestrator-ui
npm install
npm run build
```

### 4. Build do Desktop

```bash
cd orchestrator-desktop
npm install
npm run tauri:build
```

## Variáveis de Ambiente

Durante o desenvolvimento, você pode usar a variável `SPRING_DEV_ORCHESTRATOR_CORE_JAR` para apontar para um JAR customizado:

```bash
export SPRING_DEV_ORCHESTRATOR_CORE_JAR="/caminho/para/jar/customizado.jar"
npm run tauri:dev
```

## Troubleshooting

### Erro: "JAR não encontrado"

Certifique-se de que:
1. O build do core foi executado com sucesso
2. O JAR foi copiado para `orchestrator-desktop/src-tauri/orchestrator-core-standalone.jar`
3. O arquivo existe e não está corrompido

### Erro: "Java não encontrado"

Verifique se o Java está instalado e no PATH:

```bash
java -version
which java
```

### Erro: "Rust não encontrado"

Instale o Rust:

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env
```

### Build muito lento

O primeiro build do Rust pode demorar bastante (compilando dependências). Builds subsequentes serão mais rápidos.

## Distribuição

Após o build, você pode distribuir os arquivos gerados em `orchestrator-desktop/src-tauri/target/release/bundle/`.

**Nota**: Para distribuição pública, considere:
- Assinar o aplicativo (macOS/Windows)
- Notarizar o aplicativo (macOS)
- Testar em diferentes sistemas operacionais
