@echo off
setlocal
cd /d "%~dp0"
set "VCVARS=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
if exist "%VCVARS%" call "%VCVARS%" >nul
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=%ProgramFiles%\PowerShell\7\pwsh.exe"
if not exist "%PS_EXE%" set "PS_EXE=%ProgramFiles(x86)%\PowerShell\7\pwsh.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell.exe"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1" %*
exit /b %ERRORLEVEL%
