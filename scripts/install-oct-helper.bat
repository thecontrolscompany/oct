@echo off
setlocal

for %%I in ("%~dp0..") do set "ROOT=%%~fI"
set "SCRIPT=%ROOT%\scripts\oct-helper.ps1"
set "RUN_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "RUN_NAME=OCT Helper"
set "RUN_CMD=powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File %SCRIPT%"

reg add "%RUN_KEY%" /v "%RUN_NAME%" /t REG_SZ /d "%RUN_CMD%" /f >nul
if errorlevel 1 (
  echo ERROR: failed to install the OCT Helper startup entry.
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%SCRIPT%"

echo OCT Helper installed. It will start hidden at next logon.
exit /b 0
