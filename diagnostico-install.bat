@echo off
setlocal enabledelayedexpansion
title SGF v4.0 - Diagnostico
color 0B

cd /d "%~dp0"

echo ============================================================
echo   SGF v4.0 - Diagnostico
echo ============================================================
echo.
echo   Este script muestra info del sistema y prueba npm install
echo   del backend para ver el error EXACTO si algo falla.
echo.

where node >nul 2>&1 || (
    echo [ERROR] Node.js no instalado.
    echo   Descarguelo de https://nodejs.org (version 18 o superior).
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version 2^>^&1') do set "NODE_VER=%%v"
echo [INFO] Node.js: %NODE_VER%

for /f "delims=" %%v in ('npm --version 2^>^&1') do set "NPM_VER=%%v"
echo [INFO] npm: %NPM_VER%

for /f "delims=" %%v in ('npm config get registry 2^>^&1') do set "NPM_REGISTRY=%%v"
echo [INFO] Registry: %NPM_REGISTRY%

for /f "delims=" %%v in ('npm config get proxy 2^>nul') do set "NPM_PROXY=%%v"
if not "!NPM_PROXY!"=="" if not "!NPM_PROXY!"=="null" (
    echo [INFO] Proxy configurado en npm: !NPM_PROXY!
) else (
    echo [INFO] Sin proxy configurado en npm
)

if defined HTTP_PROXY (
    echo [INFO] HTTP_PROXY: %HTTP_PROXY%
) else (
    echo [INFO] HTTP_PROXY no definido
)
echo.

echo === Estructura del proyecto ===
if exist "server\package.json" (echo   [OK] server\package.json) else (echo   [FALTA] server\package.json)
if exist "client\package.json" (echo   [OK] client\package.json) else (echo   [FALTA] client\package.json)
if exist "server\node_modules" (echo   [OK] server\node_modules) else (echo   [INFO] server\node_modules no existe)
if exist "client\node_modules" (echo   [OK] client\node_modules) else (echo   [INFO] client\node_modules no existe)
if exist "server\dist\index.js" (echo   [OK] server\dist\index.js) else (echo   [INFO] server\dist\index.js no existe)
if exist "client\dist\index.html" (echo   [OK] client\dist\index.html) else (echo   [INFO] client\dist\index.html no existe)
echo.

echo === Probando npm install del backend (puede tardar 1-3 min) ===
cd /d "%~dp0server"
if not exist "node_modules" (
    call npm install --no-audit --no-fund --loglevel=error
    if %errorlevel% neq 0 (
        echo.
        echo === ERROR REAL DE NPM ===
        echo   El error de arriba es el que tiene que resolver.
        echo.
        echo   Si dice 407 Proxy Authentication Required:
        echo     1. Cierre esta ventana
        echo     2. Configure el proxy en la consola antes de correr
        echo        instalar-todo.bat. Vea GUIA-PROXY.md.
        echo.
        echo   Si dice ENOTFOUND o EAI_AGAIN:
        echo     No hay conexion a internet. Verifique su red o proxy.
        echo.
        echo   Si dice EACCES o EPERM:
        echo     Permisos. Cierre y reabra esta ventana como Administrador.
    ) else (
        echo   [OK] npm install del backend funciono
    )
) else (
    echo   [!] node_modules ya existe, omitiendo prueba
)
echo.

cd /d "%~dp0"
echo ============================================================
echo   DIAGNOSTICO TERMINADO
echo ============================================================
echo.
pause
