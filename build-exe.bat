@echo off
title SGF v4.0 - Compilar Launcher a .EXE
color 0A

echo ============================================
echo   SGF v4.0 - COMPILAR LAUNCHER A .EXE
echo ============================================
echo.

cd /d "%~dp0"

:: Verificar Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python no encontrado.
    echo Necesitas Python 3.8+ para compilar el launcher.
    echo Descargalo de: https://www.python.org/downloads/
    pause
    exit /b 1
)

:: Verificar / instalar PyInstaller
python -c "import PyInstaller" >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] PyInstaller no encontrado. Instalando...
    pip install pyinstaller
    if %errorlevel% neq 0 (
        echo [ERROR] No se pudo instalar PyInstaller.
        echo Intenta: pip install pyinstaller
        pause
        exit /b 1
    )
    echo [OK] PyInstaller instalado.
)
echo.

echo Compilando sgf-panel.exe...
echo Esto puede tardar 1-2 minutos...
echo.

:: Compilar como un solo archivo .exe
python -m PyInstaller ^
    --onefile ^
    --windowed ^
    --name "sgf-panel" ^
    --add-data "server;server" ^
    --add-data "client;client" ^
    --hidden-import tkinter ^
    --hidden-import tkinter.ttk ^
    --hidden-import tkinter.scrolledtext ^
    --clean ^
    --noconfirm ^
    "launcher\sgf-launcher.py"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] La compilacion fallo.
    echo Si el error dice "module not found", prueba instalar:
    echo   pip install tk
    pause
    exit /b 1
)

echo.
echo ============================================
echo   COMPILACION EXITOSA
echo ============================================
echo.
echo   Ejecutable: dist\sgf-panel.exe
echo.
echo Puedes copiar este archivo a cualquier PC.
echo Solo necesita Node.js instalado, no Python.
echo.
echo Para ejecutar:
echo   1. Copia dist\sgf-panel.exe a la carpeta raiz del proyecto
echo      (donde estan server/ y client/)
echo   2. Ejecuta sgf-panel.exe
echo.
echo O simplemente usa SGF-Panel.bat que detecta el .exe
echo automaticamente.
echo.

:: Copiar el .exe a la raiz del proyecto
if exist "dist\sgf-panel.exe" (
    echo Copiando sgf-panel.exe a la raiz del proyecto...
    copy /y "dist\sgf-panel.exe" "sgf-panel.exe" >nul
    echo [OK] sgf-panel.exe copiado a la carpeta raiz.
)

echo.
pause
