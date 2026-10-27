@echo off
setlocal
title SGF v4.0 - Cliente
cd /d "%~dp0"

:: Verificar si servidor esta corriendo
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel% neq 0 (
    echo [ERROR] El servidor NO esta corriendo en http://localhost:3000
    echo.
    echo   Debes ejecutar primero start-servidor.bat y dejarlo abierto.
    echo   Luego ejecuta este start-cliente.bat para abrir el navegador.
    echo.
    pause
    exit /b 1
)

echo [OK] Servidor detectado en http://localhost:3000
echo Abriendo navegador...
start "" "http://localhost:3000"
echo.
echo Cliente abierto. Deja la ventana del servidor abierta.
echo Si cierras el servidor, el cliente dejara de funcionar.
echo.
endlocal
exit /b 0
