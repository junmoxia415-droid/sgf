@echo off
title SGF v4.0 - Configurar Proxy npm
color 0E

echo ============================================================
echo   CONFIGURAR PROXY PARA npm
echo ============================================================
echo.
echo Este script configura npm para usar un proxy de red.
echo.
echo Ejemplos de proxy:
echo   http://10.190.120.5:8080
echo   http://proxy.miempresa.cu:3128
echo   http://192.168.1.1:8080
echo.
echo Si no sabes cual es tu proxy, pregunta al administrador de red.
echo.

set /p PROXY="Ingrese la URL del proxy (ej: http://10.0.0.1:8080): "

if "%PROXY%"=="" (
    echo [CANCELADO] No se ingreso ningun proxy.
    pause & exit /b 0
)

echo %PROXY% | findstr /b /i /c:"http://" /c:"https://" >nul
if errorlevel 1 (
    echo [WARN] El proxy no tenia prefijo http:// o https://
    set "PROXY=http://%PROXY%"
    echo [INFO] Se usara: %PROXY%
)

echo.
echo Configurando proxy: %PROXY%
call npm config set proxy "%PROXY%"
call npm config set https-proxy "%PROXY%"

echo.
echo Verificando configuracion:
echo   Proxy:
call npm config get proxy
echo   HTTPS Proxy:
call npm config get https-proxy

echo.
echo [OK] Proxy configurado.
echo Ahora npm install deberia funcionar a traves del proxy.
echo.
echo Para probar, ejecuta: diagnostico-install.bat
echo.
pause
