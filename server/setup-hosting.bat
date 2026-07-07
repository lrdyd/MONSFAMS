@echo off
title MONSFAMS Installer
color 0A
echo.
echo  ███╗   ███╗██╗███████╗███████╗██╗ ██████╗ ███╗   ██╗
echo  ████╗ ████║██║██╔════╝██╔════╝██║██╔═══██╗████╗  ██║
echo  ██╔████╔██║██║███████╗███████╗██║██║   ██║██╔██╗ ██║
echo  ██║╚██╔╝██║██║╚════██║╚════██║██║██║   ██║██║╚██╗██║
echo  ██║ ╚═╝ ██║██║███████║███████║██║╚██████╔╝██║ ╚████║
echo  ╚═╝     ╚═╝╚═╝╚══════╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝
echo.
echo  ================================
echo   MONSFAMS Installer for Windows
echo  ================================
echo.

:: Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo  [ERROR] Please run as Administrator!
    echo  Right-click this file and select "Run as administrator"
    pause
    exit /b 1
)

setlocal enabledelayedexpansion

:: Set Installation Directory
set "INSTALL_DIR=C:\MONSFAMS"
set "NGINX_DIR=C:\nginx"

echo  [1/7] Checking Node.js...
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo.
    echo  Node.js not found! Installing...
    powershell -Command "Invoke-WebRequest -Uri 'https://nodejs.org/dist/v20.18.0/node-v20.18.0-x64.msi' -OutFile 'C:\node-setup.msi'"
    msiexec /i C:\node-setup.msi /quiet /norestart
    del C:\node-setup.msi
    echo  Node.js installed. Please RE-RUN this installer.
    pause
    exit
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo  [OK] Node.js !NODE_VERSION! detected

echo.
echo  [2/7] Downloading Nginx...
if not exist "%NGINX_DIR%" (
    powershell -Command "Invoke-WebRequest -Uri 'https://nginx.org/download/nginx-1.26.2.zip' -OutFile 'C:\nginx.zip'"
    powershell -Command "Expand-Archive -Path 'C:\nginx.zip' -DestinationPath 'C:\' -Force"
    move /y "C:\nginx-1.26.2" "%NGINX_DIR%" >nul
    del C:\nginx.zip
)
echo  [OK] Nginx ready

echo.
echo  [3/7] Installing MONSFAMS...
if exist "%INSTALL_DIR%" (
    echo  [WARNING] MONSFAMS already exists. Updating...
    cd /d "%INSTALL_DIR%\server"
) else (
    mkdir "%INSTALL_DIR%" 2>nul
    git clone https://github.com/lrdyd/MONSFAMS.git "%INSTALL_DIR%"
    cd /d "%INSTALL_DIR%\server"
)
call npm install
echo  [OK] Dependencies installed

echo.
echo  [4/7] Configuring environment...
echo.
set /p ADMIN_PASS="Enter Admin Password (default: MONSFAMS123): "
set /p PREMIUM_PASS="Enter Premium Password (default: PREMIUM123): "
set /p SERVER_DOMAIN="Enter your domain (e.g., monsfams.my.id): "

if "!ADMIN_PASS!"=="" set ADMIN_PASS=MONSFAMS123
if "!PREMIUM_PASS!"=="" set PREMIUM_PASS=PREMIUM123
if "!SERVER_DOMAIN!"=="" set SERVER_DOMAIN=localhost

(
echo PORT=3000
echo ADMIN_ID=admin
echo ADMIN_PASSWORD=!ADMIN_PASS!
echo PREMIUM_PASSWORD=!PREMIUM_PASS!
echo ALLOWED_ORIGINS=https://!SERVER_DOMAIN!
) > .env
echo  [OK] Environment configured

echo.
echo  [5/7] Configuring Nginx...
copy /y "%~dp0nginx.conf" "%NGINX_DIR%\conf\nginx.conf" >nul

:: Replace domain placeholder in nginx.conf
powershell -Command "(Get-Content '%NGINX_DIR%\conf\nginx.conf') -replace 'YOUR_DOMAIN_HERE', '%SERVER_DOMAIN%' | Set-Content '%NGINX_DIR%\conf\nginx.conf'"
echo  [OK] Nginx configured for !SERVER_DOMAIN!

echo.
echo  [6/7] Installing PM2...
call npm install -g pm2
echo  [OK] PM2 installed

echo.
echo  [7/7] Setting up startup...
pm2 start server.js --name "MONSFAMS"
pm2 save
echo  [OK] PM2 configured

:: Create startup script
(
echo @echo off
echo cd /d C:\MONSFAMS\server
echo call pm2 resurrect
echo cd C:\nginx
echo start nginx.exe
echo echo MONSFAMS Started!
) > C:\MONSFAMS\start.bat

:: Add to Windows startup
schtasks /create /tn "MONSFAMS" /tr "C:\MONSFAMS\start.bat" /sc onlogon /rl HIGHEST /f >nul 2>&1

:: Firewall rules
netsh advfirewall firewall add rule name="MONSFAMS HTTP" dir=in action=allow protocol=tcp localport=80
netsh advfirewall firewall add rule name="MONSFAMS HTTPS" dir=in action=allow protocol=tcp localport=443
netsh advfirewall firewall add rule name="MONSFAMS App" dir=in action=allow protocol=tcp localport=3000

echo.
echo.
echo  ============================================
echo   INSTALLATION COMPLETE!
echo  ============================================
echo.
echo  Domain: https://!SERVER_DOMAIN!
echo  Admin Panel: https://!SERVER_DOMAIN!/admin.html
echo.
echo  Admin ID: admin
echo  Admin Password: !ADMIN_PASS!
echo  Premium Password: !PREMIUM_PASS!
echo.
echo  IMPORTANT: Point your domain DNS to this server IP!
echo.
echo  Run these commands to start:
echo    cd C:\MONSFAMS\server ^&^& pm2 start server.js
echo    cd C:\nginx ^&^& nginx.exe
echo.
echo  Press any key to start services now...
pause >nul

:: Start services
cd /d C:\MONSFAMS\server
call pm2 start server.js --name "MONSFAMS"
cd /d C:\nginx
start nginx.exe

echo.
echo  MONSFAMS is running!
echo  Open: http://localhost
pause
