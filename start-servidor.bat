@echo off
setlocal
title SGF v4.0 - Servidor Central
cd /d "%~dp0"

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js NO esta instalado.
    pause & exit /b 1
)

:: Verificar si puerto 3000 ya esta en uso
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul
if %errorlevel% equ 0 (
    echo [ADVERTENCIA] El puerto 3000 ya esta en uso.
    echo   El servidor ya esta corriendo.
    echo   Si quieres reiniciarlo, cierra la ventana del servidor o ejecuta:
    echo     taskkill /F /IM node.exe
    echo.
    echo   Ahora puedes ejecutar start-cliente.bat para abrir el cliente.
    pause
    exit /b 0
)

cd /d "%~dp0server"

if not exist "dist\index.js" (
    echo [ERROR] Falta server\dist\index.js. Ejecute instalar-todo.bat
    pause & exit /b 1
)

if not exist "node_modules" (
    echo [!] Falta server\node_modules. Intentando recuperar...
    if exist "..\sgf-server-modules.zip" (
        powershell -NoProfile -ExecutionPolicy Bypass -File "..\extraer-node-modules.ps1" -ZipPath "..\sgf-server-modules.zip" -Destino ".." 2>nul
    )
    if not exist "node_modules" (
        echo [ERROR] No se pudieron obtener dependencias. Ejecute instalar-todo.bat
        pause & exit /b 1
    )
)

echo.
echo   ============================================================
echo     SGF v4.0 - Servidor Central
echo   ============================================================
echo.
echo   Servidor iniciando en http://localhost:3000
echo   Para usar la app, ejecuta ahora start-cliente.bat en otra ventana
echo   Para detener: Ctrl+C
echo.
node dist\index.js
echo.
echo   Servidor detenido.
pause
endlocal
exit /b 0
