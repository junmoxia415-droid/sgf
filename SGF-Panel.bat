@echo off
title SGF v4.0 - Panel de Control
cd /d "%~dp0"

:: ============================================
:: PRIORIDAD 1: .exe portable (no necesita Python)
:: ============================================
if exist "%~dp0sgf-panel.exe" (
    echo Iniciando SGF Panel de Control (.exe)...
    "%~dp0sgf-panel.exe"
    goto :fin
)

if exist "%~dp0dist\sgf-panel.exe" (
    echo Iniciando SGF Panel de Control (.exe)...
    "%~dp0dist\sgf-panel.exe"
    goto :fin
)

:: ============================================
:: PRIORIDAD 2: Python
:: ============================================
for %%p in (python python3) do (
    where %%p >nul 2>&1
    if not errorlevel 1 (
        echo Iniciando SGF Panel de Control (Python)...
        "%%p" "%~dp0launcher\sgf-launcher.py"
        goto :fin
    )
)

:: ============================================
:: NADA DISPONIBLE
:: ============================================
echo ============================================
echo   SGF v4.0 - No se pudo iniciar
echo ============================================
echo.
echo No se encontro sgf-panel.exe ni Python.
echo.
echo OPCIONES:
echo   1. Compilar el .exe:  build-exe.bat
echo   2. Instalar Python:   https://www.python.org
echo   3. Usar .bat simple:  start-servidor.bat
echo.
pause
exit /b 1

:fin
exit /b %errorlevel%
