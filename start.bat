@echo off
setlocal
title CCT Web UI

set "ROOT=%~dp0"
set "SERVER=%ROOT%server"
set "UI_DIST=%ROOT%ui\dist"
set "PORT=3001"
set "URL=http://localhost:%PORT%"

REM Verify the UI build exists; rebuild if missing
if not exist "%UI_DIST%\index.html" (
    echo UI build not found - building now...
    cd /d "%ROOT%ui"
    call npx vite build
    if errorlevel 1 (
        echo ERROR: Build failed. Run install.bat first.
        pause & exit /b 1
    )
)

REM Kill anything already on port 3001
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":%PORT% "') do (
    taskkill /PID %%a /F >nul 2>&1
)

REM Open browser after a short delay (runs in background)
start "" cmd /c "timeout /t 4 /nobreak >nul && start %URL%"

echo ============================================================
echo  CCT Web UI  -  %URL%
echo  Close this window to stop the server.
echo ============================================================
echo.

cd /d "%SERVER%"
npx tsx src/index.ts
