@echo off
echo ============================================================
echo  CCT Web UI - First-Time Setup
echo ============================================================
echo.

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed or not in PATH.
    echo Download from https://nodejs.org ^(LTS version^)
    pause
    exit /b 1
)

echo [1/3] Installing server dependencies...
cd /d "%~dp0server"
npm install
if errorlevel 1 ( echo ERROR: npm install failed in server^. & pause & exit /b 1 )

echo.
echo [2/3] Installing UI dependencies...
cd /d "%~dp0ui"
npm install
if errorlevel 1 ( echo ERROR: npm install failed in ui^. & pause & exit /b 1 )

echo.
echo [3/3] Building frontend...
npx vite build
if errorlevel 1 ( echo ERROR: UI build failed^. & pause & exit /b 1 )

echo.
echo ============================================================
echo  Setup complete. Run start.bat to launch CCT Web UI.
echo ============================================================
pause
