@echo off
REM Pixazo Complete Startup Script for Windows
REM Starts Pixazo API + Backend + Frontend
setlocal

echo ==================================
echo   Pixazo Complete Startup
echo ==================================
echo.

REM Check if node_modules exists
if not exist "node_modules" (
    echo Error: UI dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

if not exist "server\node_modules" (
    echo Error: Server dependencies not installed!
    echo Please run setup.bat first.
    pause
    exit /b 1
)

REM Get Pixazo path from environment or use default
if "%PIXAZO_PATH%"=="" (
    set PIXAZO_PATH=..\Pixazo
)

REM Check if Pixazo exists
if not exist "%PIXAZO_PATH%" (
    echo.
    echo Warning: Pixazo not found at %PIXAZO_PATH%
    echo.
    echo Please set PIXAZO_PATH or place Pixazo next to pixazo-music
    echo Example: set PIXAZO_PATH=C:\Pixazo
    echo.
    pause
    exit /b 1
)

REM Detect Pixazo installation type
set API_COMMAND=
if exist "%PIXAZO_PATH%\python_embeded\python.exe" (
    echo [+] Detected Windows Portable Package
    set API_COMMAND=python_embeded\python acestep\api_server.py
) else (
    echo [+] Detected Standard Installation
    set API_COMMAND=uv run pixazo-api --port 8001
)

REM Get local IP for LAN access
for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do (
    for /f "tokens=1" %%b in ("%%a") do (
        set LOCAL_IP=%%b
    )
)

echo.
echo ==================================
echo   Starting All Services...
echo ==================================
echo.

REM Start Pixazo API in new window
echo [1/3] Starting Pixazo API server...
start "Pixazo API Server" cmd /k "cd /d "%PIXAZO_PATH%" && %API_COMMAND%"

REM Wait for API to start
echo Waiting for API to initialize...
timeout /t 5 /nobreak >nul

REM Start backend in new window
echo [2/3] Starting backend server...
start "Pixazo Backend" cmd /k "cd /d "%~dp0server" && npm run dev"

REM Wait for backend to start
echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

REM Start frontend in new window
echo [3/3] Starting frontend...
start "Pixazo Frontend" cmd /k "cd /d "%~dp0" && npm run dev"

REM Wait a moment
timeout /t 2 /nobreak >nul

echo.
echo ==================================
echo   All Services Running!
echo ==================================
echo.
echo   Pixazo API:   http://localhost:8001
echo   Backend:      http://localhost:3001
echo   Frontend:     http://localhost:3000
echo.
if defined LOCAL_IP (
    echo   LAN Access:   http://%LOCAL_IP%:3000
    echo.
)
echo   Close the terminal windows to stop all services.
echo.
echo ==================================
echo.
echo Opening browser...
timeout /t 3 /nobreak >nul
start http://localhost:3000

echo.
echo Press any key to close this window (services will keep running)
pause >nul
