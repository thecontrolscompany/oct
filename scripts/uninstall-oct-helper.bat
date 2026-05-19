@echo off
setlocal

set "RUN_KEY=HKCU\Software\Microsoft\Windows\CurrentVersion\Run"
set "RUN_NAME=OCT Helper"

reg delete "%RUN_KEY%" /v "%RUN_NAME%" /f >nul
if errorlevel 1 (
  echo ERROR: failed to remove the OCT Helper startup entry.
  exit /b 1
)

echo OCT Helper removed.
