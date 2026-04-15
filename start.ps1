$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root

$Deps = Join-Path $env:LOCALAPPDATA "OrchestratorBuildDeps"
$mvnDirItem =
  Get-ChildItem -LiteralPath $Deps -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "apache-maven-*" -and (Test-Path (Join-Path $_.FullName "bin\mvn.cmd")) } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$LocalMvnBin =
  if ($mvnDirItem) { Join-Path $mvnDirItem.FullName "bin" }
  else { Join-Path $Deps "apache-maven-3.9.9\bin" }
$nodeDirItem =
  Get-ChildItem -LiteralPath $Deps -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like "node-v*" -and (Test-Path (Join-Path $_.FullName "npm.cmd")) } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
$LocalNode =
  if ($nodeDirItem) { $nodeDirItem.FullName }
  else { Join-Path $Deps "node-v20.18.3-win-x64" }
if (Test-Path (Join-Path $LocalMvnBin "mvn.cmd")) {
  if ($env:Path -notlike "*$LocalMvnBin*") {
    $env:Path = "$LocalMvnBin;$env:Path"
  }
  if (-not $env:MAVEN_HOME) {
    $env:MAVEN_HOME = Split-Path $LocalMvnBin -Parent
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

$NodeExe = Join-Path $LocalNode "node.exe"
if (-not (Test-Path $NodeExe)) {
  $g = Get-Command node -ErrorAction SilentlyContinue
  if (-not $g) {
    throw "node nao encontrado. Instale Node.js LTS ou use OrchestratorBuildDeps em $LocalNode"
  }
  $NodeExe = $g.Source
}

$env:ORCHESTRATOR_VERBOSE_LOGS = "1"

& $NodeExe "$Root\orchestrator-desktop\scripts\run-dev.mjs"
exit $LASTEXITCODE
