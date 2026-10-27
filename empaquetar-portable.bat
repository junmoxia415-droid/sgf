@echo off
setlocal enabledelayedexpansion
title SGF v4.0 - Empaquetar para PC sin internet
color 0E

cd /d "%~dp0"

echo ============================================================
echo   SGF v4.0 - EMPAQUETAR PARA PC SIN INTERNET
echo ============================================================
echo.
echo Esta herramienta toma un sistema YA INSTALADO y COMPILADO
echo (es decir, ya corrio instalar-todo.bat) y lo empaqueta en
echo .zip para llevarlo a una PC sin internet.
echo.

where node >nul 2>&1 || (
    echo [ERROR] Node.js no instalado.
    pause & exit /b 1
)

if not exist "server\dist\index.js" (
    echo [ERROR] El backend no esta compilado. Ejecute instalar-todo.bat primero.
    pause & exit /b 1
)
if not exist "client\dist\index.html" (
    echo [ERROR] El frontend no esta compilado. Ejecute instalar-todo.bat primero.
    pause & exit /b 1
)

:: ============================================================
:: 1. ZIP con node_modules del backend
:: ============================================================
echo [1/3] Empaquetando server\node_modules...
if exist "sgf-server-modules.zip" del "sgf-server-modules.zip"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Compress-Archive -Path 'server\node_modules' -DestinationPath 'sgf-server-modules.zip' -Force" >nul
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo crear sgf-server-modules.zip
    pause & exit /b 1
)
for %%A in ("sgf-server-modules.zip") do echo   [OK] sgf-server-modules.zip (%%~zA bytes)
echo.

:: ============================================================
:: 2. ZIP con node_modules del frontend
:: ============================================================
echo [2/3] Empaquetando client\node_modules...
if exist "sgf-client-modules.zip" del "sgf-client-modules.zip"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Compress-Archive -Path 'client\node_modules' -DestinationPath 'sgf-client-modules.zip' -Force" >nul
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo crear sgf-client-modules.zip
    pause & exit /b 1
)
for %%A in ("sgf-client-modules.zip") do echo   [OK] sgf-client-modules.zip (%%~zA bytes)
echo.

:: ============================================================
:: 3. ZIP con el proyecto completo (sin node_modules)
:: ============================================================
echo [3/3] Empaquetando proyecto completo (sin node_modules)...
if exist "sgf-proyecto.zip" del "sgf-proyecto.zip"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; Compress-Archive -Path 'server','client','launcher','SGF-Panel.bat','start-servidor.bat','start-cliente.bat','instalar-todo.bat','empaquetar-portable.bat','*.md','*.txt' -DestinationPath 'sgf-proyecto.zip' -Force" >nul
if %errorlevel% neq 0 (
    echo [ERROR] No se pudo crear sgf-proyecto.zip
    pause & exit /b 1
)
for %%A in ("sgf-proyecto.zip") do echo   [OK] sgf-proyecto.zip (%%~zA bytes)
echo.

echo ============================================================
echo   EMPAQUETADO COMPLETO
echo ============================================================
echo.
echo   Archivos generados en la raiz:
echo     sgf-proyecto.zip         - Proyecto completo sin node_modules
echo     sgf-server-modules.zip   - Dependencias del backend
echo     sgf-client-modules.zip   - Dependencias del frontend
echo.
echo   PARA LLEVAR A UNA PC SIN INTERNET:
echo   1. Copie los 3 .zip a la PC destino
echo   2. Ejecute instalar-todo.bat
echo      (extrae los .zip automaticamente con extraer-node-modules.ps1)
echo   3. Ejecute start-servidor.bat
echo.
echo   Si la extraccion automatica falla, puede extraer los .zip
echo   manualmente con el Explorador de Windows. Es normal que
echo   algunos antivirus marquen archivos como sospechosos; si pasa,
echo   agregue la carpeta a las exclusiones antes de extraer.
echo   La PC destino no necesitara internet para arrancar el
echo   servidor, pero si tendra que tener Node.js instalado.
echo.
pause
endlocal
exit /b 0
