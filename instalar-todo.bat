@echo off
setlocal enabledelayedexpansion
title SGF v4.0 - Instalador
color 0A

cd /d "%~dp0"

echo ============================================================
echo   SGF v4.0 - Instalador
echo ============================================================
echo.

where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js NO esta instalado o NO esta en el PATH.
    echo Instale Node.js 18 o superior desde https://nodejs.org
    echo.
    echo ============================================================
    echo   PRESIONE UNA TECLA PARA CERRAR
    echo ============================================================
    pause
    exit /b 1
)

for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo [OK] Node.js detectado: %NODE_VER%
echo.

:: ============================================================
:: Estado del proxy
:: ============================================================
echo === Configuracion de red ===
if defined HTTP_PROXY (
    echo   [OK] HTTP_PROXY configurado en esta consola
    call npm config set proxy "%HTTP_PROXY%" >nul 2>&1
    call npm config set https-proxy "%HTTP_PROXY%" >nul 2>&1
) else if defined HTTPS_PROXY (
    echo   [OK] HTTPS_PROXY configurado en esta consola
    call npm config set proxy "%HTTPS_PROXY%" >nul 2>&1
    call npm config set https-proxy "%HTTPS_PROXY%" >nul 2>&1
) else (
    for /f "delims=" %%p in ('npm config get proxy 2^>nul') do set "NPM_PROXY=%%p"
    if defined NPM_PROXY if not "!NPM_PROXY!"=="null" if not "!NPM_PROXY!"=="" (
        echo   [OK] npm config proxy: !NPM_PROXY!
    ) else (
        echo   [INFO] Sin proxy configurado.
    )
)
echo.

:: ============================================================
:: Verificar / descargar node_modules
:: ============================================================
set "NEED_SERVER_INSTALL=0"
set "NEED_CLIENT_INSTALL=0"

if not exist "server\node_modules" (
    if exist "sgf-server-modules.zip" (
        echo [1/5] Extrayendo server\node_modules desde sgf-server-modules.zip...
        call :extraer_zip "sgf-server-modules.zip"
        if exist "server\node_modules" (
            echo   [OK] server\node_modules extraido.
        ) else (
            echo   [!] Fallo la extraccion. Se intentara npm install.
            set "NEED_SERVER_INSTALL=1"
        )
    ) else (
        set "NEED_SERVER_INSTALL=1"
    )
) else (
    echo [1/5] server\node_modules ya existe. Omitiendo.
)

if not exist "client\node_modules" (
    if exist "sgf-client-modules.zip" (
        echo [2/5] Extrayendo client\node_modules desde sgf-client-modules.zip...
        call :extraer_zip "sgf-client-modules.zip"
        if exist "client\node_modules" (
            echo   [OK] client\node_modules extraido.
        ) else (
            echo   [!] Fallo la extraccion. Se intentara npm install.
            set "NEED_CLIENT_INSTALL=1"
        )
    ) else (
        set "NEED_CLIENT_INSTALL=1"
    )
) else (
    echo [2/5] client\node_modules ya existe. Omitiendo.
)

if %NEED_SERVER_INSTALL% equ 1 (
    if not exist "server\node_modules" (
        echo.
        echo   [!] server\node_modules no existe y no hay .zip local.
        echo       Intentando descargar desde GitHub Releases...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'https://github.com/Junmoxia41/SGF/releases/download/v4.0.0/sgf-server-modules.zip' -OutFile 'sgf-server-modules.zip' -UseBasicParsing -TimeoutSec 120; Write-Host '   [OK] sgf-server-modules.zip descargado.' } catch { Write-Host '   [!] No se pudo descargar. Se hara npm install.'; exit 1 }" >nul
        if exist "sgf-server-modules.zip" (
            call :extraer_zip "sgf-server-modules.zip"
            if exist "server\node_modules" set "NEED_SERVER_INSTALL=0"
        )
    )
)
if %NEED_CLIENT_INSTALL% equ 1 (
    if not exist "client\node_modules" (
        echo   [!] client\node_modules no existe y no hay .zip local.
        echo       Intentando descargar desde GitHub Releases...
        powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri 'https://github.com/Junmoxia41/SGF/releases/download/v4.0.0/sgf-client-modules.zip' -OutFile 'sgf-client-modules.zip' -UseBasicParsing -TimeoutSec 120; Write-Host '   [OK] sgf-client-modules.zip descargado.' } catch { Write-Host '   [!] No se pudo descargar. Se hara npm install.'; exit 1 }" >nul
        if exist "sgf-client-modules.zip" (
            call :extraer_zip "sgf-client-modules.zip"
            if exist "client\node_modules" set "NEED_CLIENT_INSTALL=0"
        )
    )
)

:: ============================================================
:: npm install si hace falta
:: ============================================================
if %NEED_SERVER_INSTALL% equ 1 (
    echo.
    echo [3/5] Instalando dependencias del BACKEND con npm install...
    cd /d "%~dp0server"
    if not exist "package.json" (
        echo [ERROR] No se encontro server\package.json
        pause & exit /b 1
    )
    call npm install --no-audit --no-fund --loglevel=error
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Fallo npm install del backend.
        echo.
        echo   Si el error es 407 Proxy Authentication Required:
        echo     1. Cierre esta ventana
        echo     2. Configure HTTP_PROXY y HTTPS_PROXY con usuario y
        echo        contrasena del proxy. Vea GUIA-PROXY.md.
        echo     3. Vuelva a ejecutar este script en la misma consola.
        echo.
        echo   Para ver el error EXACTO:
        echo     cd server
        echo     npm install
        echo.
        pause & exit /b 1
    )
    echo   [OK] server\node_modules instalado.
) else (
    echo [3/5] Backend OK (node_modules listo).
)
cd /d "%~dp0"
echo.

:: ============================================================
:: Verificar dist/ del backend
:: ============================================================
if not exist "server\dist\index.js" (
    echo [4/5] No existe server\dist\index.js. Intentando compilar...
    cd /d "%~dp0server"
    if not exist "node_modules\.bin\tsc.cmd" (
        if not exist "node_modules\typescript" (
            echo   [!] typescript no esta. Instalando solo typescript...
            call npm install --no-audit --no-fund typescript@^5.9.0
        )
    )
    call npx --no-install tsc
    cd /d "%~dp0"
    if not exist "server\dist\index.js" (
        echo [ERROR] No se pudo compilar el backend.
        echo   Vea GUIA-PROXY.md si es problema de red.
        pause & exit /b 1
    )
    echo   [OK] Backend compilado.
) else (
    echo [4/5] server\dist\index.js ya existe.
)
echo.

:: ============================================================
:: Verificar dist/ del frontend
:: ============================================================
if not exist "client\dist\index.html" (
    echo [5/5] No existe client\dist\index.html. Intentando compilar...
    cd /d "%~dp0client"
    call npx --no-install vite build
    cd /d "%~dp0"
    if not exist "client\dist\index.html" (
        echo [ERROR] No se pudo compilar el frontend.
        pause & exit /b 1
    )
    echo   [OK] Frontend compilado.
) else (
    echo [5/5] client\dist\index.html ya existe.
)
echo.

echo ============================================================
echo   INSTALACION COMPLETA
echo ============================================================
echo.
echo   [OK] Backend compilado   = server\dist
echo   [OK] Frontend compilado  = client\dist
echo   [OK] Dependencias        = server\node_modules
echo                              client\node_modules
echo.
echo   Para iniciar el servidor:
echo     start-servidor.bat
echo     (luego abre http://localhost:3000)
echo.
echo ============================================================
echo   PRESIONE UNA TECLA PARA CERRAR
echo ============================================================
pause
endlocal
exit /b 0

:: ============================================================
:: Funcion: extrae un .zip de forma robusta (tolerante a errores)
:: Args: %1 = ruta del zip
:: ============================================================
:extraer_zip
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0extraer-node-modules.ps1" -ZipPath "%~1" 2>nul
goto :eof
