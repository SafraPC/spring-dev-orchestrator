@echo off
setlocal
cd /d "%~dp0"
if not exist "%~dp0start.ps1" (
  echo start.ps1 ausente ao lado de start.cmd.
  exit /b 1
)
set "ORCHESTRATOR_SKIP_MVN_CLEAN="
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1"
exit /b %ERRORLEVEL%
