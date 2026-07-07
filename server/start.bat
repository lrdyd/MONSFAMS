@echo off
title MONSFAMS - Quick Start
color 0A
mode con:cols=70 lines=25

:menu
cls
echo.
echo   ███╗   ███╗██╗███████╗███████╗██╗ ██████╗ ███╗   ██╗
echo   ████╗ ████║██║██╔════╝██╔════╝██║██╔═══██╗████╗  ██║
echo   ██╔████╔██║██║███████╗███████╗██║██║   ██║██╔██╗ ██║
echo   ██║╚██╔╝██║██║╚════██║╚════██║██║██║   ██║██║╚██╗██║
echo   ██║ ╚═╝ ██║██║███████║███████║██║╚██████╔╝██║ ╚████║
echo   ╚═╝     ╚═╝╚═╝╚══════╝╚══════╝╚═╝ ╚═════╝ ╚═╝  ╚═══╝
echo.
echo   ═══════════════════════════════════════════
echo    MONSFAMS Control Panel
echo   ═══════════════════════════════════════════
echo.
echo   [1] Start MONSFAMS
echo   [2] Stop MONSFAMS
echo   [3] Restart MONSFAMS
echo   [4] View Logs
echo   [5] Check Status
echo   [6] Setup SSL Certificate
echo   [7] Open in Browser
echo   [8] Open Admin Panel
echo   [0] Exit
echo.
set /p choice="Select option: "

if "%choice%"=="1" goto start
if "%choice%"=="2" goto stop
if "%choice%"=="3" goto restart
if "%choice%"=="4" goto logs
if "%choice%"=="5" goto status
if "%choice%"=="6" goto ssl
if "%choice%"=="7" goto open
if "%choice%"=="8" goto admin
if "%choice%"=="0" exit

goto menu

:start
echo.
echo  Starting MONSFAMS services...
cd /d C:\MONSFAMS\server
call pm2 start server.js --name "MONSFAMS"
cd /d C:\nginx
start nginx.exe
echo.
echo  [OK] MONSFAMS started!
echo.
pause
goto menu

:stop
echo.
echo  Stopping MONSFAMS services...
taskkill /F /IM nginx.exe 2>nul
cd /d C:\MONSFAMS\server
call pm2 stop MONSFAMS
echo.
echo  [OK] MONSFAMS stopped!
echo.
pause
goto menu

:restart
echo.
echo  Restarting MONSFAMS services...
taskkill /F /IM nginx.exe 2>nul
cd /d C:\MONSFAMS\server
call pm2 restart MONSFAMS
cd /d C:\nginx
start nginx.exe
echo.
echo  [OK] MONSFAMS restarted!
echo.
pause
goto menu

:logs
echo.
echo  MONSFAMS Logs (Ctrl+C to exit)
echo  ======================================
cd /d C:\MONSFAMS\server
call pm2 logs MONSFAMS --lines 50 --nostream
pause
goto menu

:status
echo.
echo  Service Status:
echo  ===============
echo.
cd /d C:\MONSFAMS\server
call pm2 status
echo.
netstat -ano | findstr ":3000 :80 :443" | findstr "LISTENING"
echo.
pause
goto menu

:ssl
echo.
echo  Opening SSL setup...
start setup-ssl.bat
goto menu

:open
echo.
echo  Opening MONSFAMS in browser...
start http://localhost
goto menu

:admin
echo.
echo  Opening Admin Panel in browser...
start http://localhost/admin.html
goto menu
