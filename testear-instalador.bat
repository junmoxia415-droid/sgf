@echo off

echo ============================================================
echo   SGF v4.0 - Diagnostico
echo ============================================================
echo.
echo Hola. Si puedes leer esto, el .bat SI se esta ejecutando.
echo.
echo INFORMACION DEL SISTEMA:
echo.

echo - Usuario actual: %USERNAME%
echo - PC: %COMPUTERNAME%
echo - Carpeta actual: %CD%
echo - Script ubicado en: %~dp0
echo.

echo - Version de Node.js:
where node >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%v in ('node --version 2^>^&1') do echo     %%v
) else (
    echo     [NO ENCONTRADO - Node.js no esta instalado o no esta en PATH]
)
echo.

echo - Version de npm:
where npm >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%v in ('npm --version 2^>^&1') do echo     %%v
) else (
    echo     [NO ENCONTRADO]
)
echo.

echo - Existe Node.js en C:\Program Files\nodejs?
if exist "C:\Program Files\nodejs\node.exe" (
    echo     SI - C:\Program Files\nodejs\node.exe
) else (
    echo     NO
)
echo.

echo - Existe el proyecto en %~dp0server?
if exist "%~dp0server\package.json" (
    echo     SI - package.json esta presente
) else (
    echo     NO - la estructura del proyecto esta rota
)
echo.

echo - Existe el proyecto en %~dp0client?
if exist "%~dp0client\package.json" (
    echo     SI - package.json esta presente
) else (
    echo     NO - la estructura del proyecto esta rota
)
echo.

echo ============================================================
echo   Presiona cualquier tecla para cerrar esta ventana
echo ============================================================
pause >nul
