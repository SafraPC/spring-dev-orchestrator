$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$CoreDir = Join-Path $Root "orchestrator-core"
$DesktopDir = Join-Path $Root "orchestrator-desktop"
$JarPath = Join-Path $CoreDir "target\orchestrator-core-standalone.jar"
$JarDest = Join-Path $DesktopDir "src-tauri\orchestrator-core-standalone.jar"

$Deps = Join-Path $env:LOCALAPPDATA "OrchestratorBuildDeps"
$LocalMvnBin = Join-Path $Deps "apache-maven-3.9.9\bin"
$LocalNode = Join-Path $Deps "node-v20.18.3-win-x64"
if (Test-Path (Join-Path $LocalMvnBin "mvn.cmd")) {
  if ($env:Path -notlike "*$LocalMvnBin*") {
    $env:Path = "$LocalMvnBin;$env:Path"
  }
  if (-not $env:MAVEN_HOME) {
    $env:MAVEN_HOME = Join-Path $Deps "apache-maven-3.9.9"
  }
}
if (Test-Path (Join-Path $LocalNode "npm.cmd")) {
  if ($env:Path -notlike "*$LocalNode*") {
    $env:Path = "$LocalNode;$env:Path"
  }
}
$LocalCargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
if (Test-Path (Join-Path $LocalCargoBin "cargo.exe")) {
  if ($env:Path -notlike "*$LocalCargoBin*") {
    $env:Path = "$LocalCargoBin;$env:Path"
  }
}

function Resolve-Mvn {
  $g = Get-Command mvn -ErrorAction SilentlyContinue
  if ($g) {
    return $g.Source
  }
  if ($env:MAVEN_HOME) {
    $p = Join-Path $env:MAVEN_HOME "bin\mvn.cmd"
    if (Test-Path $p) {
      return $p
    }
  }
  foreach ($p in @(
      "$env:ProgramFiles\Apache\maven\bin\mvn.cmd",
      "$env:USERPROFILE\scoop\apps\maven\current\bin\mvn.cmd"
    )) {
    if (Test-Path $p) {
      return $p
    }
  }
  $chocoLib = "$env:ProgramData\chocolatey\lib\maven"
  if (Test-Path $chocoLib) {
    $found = Get-ChildItem -Path $chocoLib -Filter "mvn.cmd" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($found) {
      return $found.FullName
    }
  }
  return $null
}

function Resolve-Npm {
  $g = Get-Command npm -ErrorAction SilentlyContinue
  if ($g) {
    return $g.Source
  }
  foreach ($p in @(
      "$env:ProgramFiles\nodejs\npm.cmd",
      "${env:ProgramFiles(x86)}\nodejs\npm.cmd"
    )) {
    if (Test-Path $p) {
      return $p
    }
  }
  $fnmNpm = Join-Path $env:USERPROFILE ".fnm\aliases\default\npm.cmd"
  if (Test-Path $fnmNpm) {
    return $fnmNpm
  }
  return $null
}

function Resolve-Cargo {
  $g = Get-Command cargo -ErrorAction SilentlyContinue
  if ($g) {
    return $g.Source
  }
  $c = Join-Path $env:USERPROFILE ".cargo\bin\cargo.exe"
  if (Test-Path $c) {
    return $c
  }
  return $null
}

function Require-Java {
  if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
    throw "java nao encontrado no PATH. Instale JDK 17+."
  }
}

Write-Host ""
Write-Host "[build] === Build do Orchestrator ==="

Require-Java

$Mvn = Resolve-Mvn
if (-not $Mvn) {
  throw "mvn nao encontrado. Adicione Maven ao PATH ou defina MAVEN_HOME (ex.: C:\apache-maven-3.9.9)."
}
Write-Host "[build] Maven: $Mvn"

$Npm = Resolve-Npm
if (-not $Npm) {
  throw "npm nao encontrado. Instale Node.js LTS ou adicione ao PATH."
}
Write-Host "[build] npm: $Npm"

$Cargo = Resolve-Cargo
if (-not $Cargo) {
  throw "cargo nao encontrado. Instale Rust (rustup) ou abra um terminal onde cargo funcione."
}
Write-Host "[build] cargo: $Cargo"
$cargoBin = Split-Path -Parent $Cargo
if ($env:Path -notlike "*$cargoBin*") {
  $env:Path = "$cargoBin;$env:Path"
}

Write-Host "[build] 1. Compilando orchestrator-core (JAR)..."
Push-Location $CoreDir
try {
  & $Mvn -q -DskipTests clean package
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}
if (-not (Test-Path $JarPath)) {
  throw "JAR nao foi gerado em $JarPath"
}
Write-Host "[build] OK JAR: $JarPath"

Write-Host "[build] 2. Copiando JAR para o bundle do Tauri..."
Copy-Item -Path $JarPath -Destination $JarDest -Force
Write-Host "[build] OK copiado para: $JarDest"

Write-Host "[build] 3. Buildando frontend + desktop (Tauri)..."
Push-Location $DesktopDir
try {
  if (-not (Test-Path "node_modules")) {
    Write-Host "[build] npm install..."
    & $Npm install
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
  & $Npm run build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
  & $Npm run tauri:build
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
} finally {
  Pop-Location
}

$Bundle = Join-Path $DesktopDir "src-tauri\target\release\bundle\"
Write-Host ""
Write-Host "[build] Build completo."
Write-Host "[build] Instaladores em: $Bundle"
