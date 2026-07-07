@echo off
title MONSFAMS SSL Setup
color 0A
echo.
echo  ====================================
echo   MONSFAMS SSL Certificate Setup
echo  ====================================
echo.
echo  This script will setup FREE SSL using Certbot (Let's Encrypt)
echo.

set /p DOMAIN="Enter your domain (e.g., monsfams.my.id): "

if "%DOMAIN%"=="" (
    echo  [ERROR] Domain is required!
    pause
    exit /b 1
)

echo.
echo  Downloading Certbot...
mkdir C:\certbot 2>nul
powershell -Command "Invoke-WebRequest -Uri 'https://github.com/certbot/certbot/releases/download/v2.10.0/certbot-beta-installer-win_amd64.exe' -OutFile 'C:\certbot\certbot-setup.exe'"

echo.
echo  Installing Certbot (will open GUI)...
start /wait C:\certbot\certbot-setup.exe

echo.
echo  ====================================
echo  IMPORTANT: During Certbot installation
echo  ====================================
echo  1. Select "Run on startup"
echo  2. Select "Create Scheduled Task"
echo  3. Choose your Windows user account
echo  4. Agree to Terms of Service
echo.
pause

echo.
echo  Requesting certificate for %DOMAIN%...
certbot certonly --manual --preferred-challenges dns -d %DOMAIN% -d *.%DOMAIN%

if %errorLevel% neq 0 (
    echo.
    echo  [ERROR] Certificate request failed!
    echo  Make sure DNS is pointing to this server:
    echo    A record: @ -> YOUR_SERVER_IP
    echo    A record: * -> YOUR_SERVER_IP
    echo.
    pause
    exit /b 1
)

echo.
echo  ====================================
echo   SSL Certificate Installed!
echo  ====================================
echo.
echo  Certificate location:
echo  C:\Certbot\live\%DOMAIN%\
echo.
echo  Now update nginx.conf with SSL settings:
echo  1. Uncomment HTTPS server block
echo  2. Replace YOUR_DOMAIN_HERE with %DOMAIN%
echo  3. Update SSL certificate paths
echo.
echo  Restart Nginx:
echo    nginx.exe -s reload
echo.
pause
