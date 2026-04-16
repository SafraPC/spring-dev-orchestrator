@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0start.ps1" (
  echo start.ps1 ausente ao lado de start.cmd.
  exit /b 1
)
set "ORCHESTRATOR_SKIP_MVN_CLEAN="
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not exist "%PS_EXE%" set "PS_EXE=%ProgramFiles(x86)%\PowerShell\7\pwsh.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
exit /b %ERRORLEVEL%
