@echo off
REM ============================================
REM MONSFAMS Deployment Script (Windows)
REM ============================================

echo ============================================
echo    MONSFAMS Deployment Script
echo ============================================
echo.

REM Check if Node.js is installed
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo Node.js is not installed!
    echo Please install Node.js from: https://nodejs.org/
    pause
    exit /b 1
)

echo Node.js found:
node --version
echo.

REM Install dependencies
echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Failed to install dependencies!
    pause
    exit /b 1
)
echo.

REM Ask for admin password
set /p ADMIN_PASSWORD="Enter admin password (default: MONSFAMS): "
if "%ADMIN_PASSWORD%"=="" set ADMIN_PASSWORD=MONSFAMS

REM Ask for port
set /p PORT="Enter port number (default: 3000): "
if "%PORT%"=="" set PORT=3000

REM Ask for max file size
set /p MAX_SIZE_MB="Enter max file size in MB (default: 500): "
if "%MAX_SIZE_MB%"=="" set MAX_SIZE_MB=500

REM Calculate bytes
set /a MAX_SIZE_BYTES=%MAX_SIZE_MB% * 1024 * 1024

REM Create .env file
echo Creating .env file...
(
    echo PORT=%PORT%
    echo ADMIN_PASSWORD=%ADMIN_PASSWORD%
    echo MAX_FILE_SIZE=%MAX_SIZE_BYTES%
    echo NODE_ENV=production
) > .env

echo .env file created!
echo.

REM Install PM2
echo Installing PM2...
call npm install -g pm2
echo.

REM Start server with PM2
echo Starting server with PM2...
pm2 delete monsfams 2>nul
pm2 start server.js --name monsfams

echo.
echo ============================================
echo    MONSFAMS Deployed Successfully!
echo ============================================
echo.
echo Admin Password: %ADMIN_PASSWORD%
echo Port: %PORT%
echo Max File Size: %MAX_SIZE_MB%MB
echo.
echo Useful Commands:
echo   pm2 status          - Check server status
echo   pm2 logs monsfams   - View logs
echo   pm2 restart monsfams - Restart server
echo.
pause
