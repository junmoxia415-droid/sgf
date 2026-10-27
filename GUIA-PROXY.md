# Guia rapida: configurar proxy para npm install

Si tu red tiene un proxy HTTP corporativo (tipo `http://192.105.34.1:3128`)
y `instalar-todo.bat` falla con errores tipo `EAI_AGAIN`, `ENOTFOUND`
o `ETIMEDOUT`, sigue estos pasos.

## Antes de hacer nada

NO pongas tu contrasena en ningun archivo del repositorio. Los archivos
de GitHub son publicos. La unica forma segura de usar el proxy es con
variables de entorno temporales que se borran al cerrar la consola.

## Paso 1: abre una consola (cmd.exe) en la PC

Click derecho en el menu inicio -> "Terminal (Administrador)" o
"Simbolo del sistema (Administrador)".

## Paso 2: configura el proxy en la consola

Reemplaza `TU_USUARIO` y `TU_CONTRASENA` por tus credenciales reales.
Si la contrasena tiene caracteres especiales, escapala con `^`:

```cmd
set HTTP_PROXY=http://TU_USUARIO:TU_CONTRASENA@192.105.34.1:3128
set HTTPS_PROXY=http://TU_USUARIO:TU_CONTRASENA@192.105.34.1:3128
```

Ejemplo (no uses este, es inventado):
```cmd
set HTTP_PROXY=http://airienrr:MiClaveSecreta@192.105.34.1:3128
set HTTPS_PROXY=http://airienrr:MiClaveSecreta@192.105.34.1:3128
```

## Paso 3: verifica que el proxy esta configurado

```cmd
echo %HTTP_PROXY%
```

Tiene que salir la URL completa. Si dice `ECHO is off.` o nada,
configuraste mal la variable.

## Paso 4: navega a la carpeta del proyecto y ejecuta el instalador

```cmd
cd C:\ruta\a\SGF
instalar-todo.bat
```

## Que pasa con tu contrasena

- Se queda SOLO en esa ventana de cmd, en memoria.
- Cuando cierres la ventana, se borra.
- NO queda en ningun archivo del proyecto, ni en el historial, ni
  en el registro de Windows.
- Si reinicias la PC, tienes que volver a ejecutar el paso 2.

## Si tu contrasena tiene caracteres especiales

Los caracteres que dan problemas y como escaparlos en cmd:

| Caracter | Escapar como |
|---|---|
| `@` | `^@` |
| `#` | `^#` |
| `!` | no se puede escapar, considera cambiarla temporalmente |
| `%` | `%%` |
| `&` | `^&` |
| ` ` (espacio) | `%20` |

Si tu contrasena es muy complicada, una alternativa es:
1. Cambiala temporalmente a una simple (ej: `Temporal123`)
2. Instala el sistema
3. Cambiala de vuelta

## Si despues de configurar el proxy sigue fallando

Pruebas diagnostico (cada una en la misma consola donde configuraste el proxy):

```cmd
:: 1. Pruebo si el proxy responde
curl -v http://192.105.34.1:3128

:: 2. Pruebo si npm puede salir a traves del proxy
npm config get proxy
npm ping

:: 3. Pruebo una instalacion minima
cd server
npm install --no-audit --no-fund lodash
```

Si `curl -v` da error, el proxy no esta accesible desde tu PC.
Si `npm ping` da error, npm no esta usando las variables de entorno.
Si la instalacion minima funciona, `instalar-todo.bat` deberia
funcionar tambien.

## Alternativa: .npmrc local (para usuarios avanzados)

Si prefieres no escribir las variables cada vez, puedes crear un
archivo `%USERPROFILE%\.npmrc` con este contenido:

```
proxy=http://TU_USUARIO:TU_CONTRASENA@192.105.34.1:3128
https-proxy=http://TU_USUARIO:TU_CONTRASENA@192.105.34.1:3128
strict-ssl=false
```

Este archivo:
- Solo existe en tu PC
- NO se sube a GitHub (npm lo busca solo en tu carpeta de usuario)
- Lo puedes borrar cuando quieras (`del %USERPROFILE%\.npmrc`)

Pero aun asi, NO subas este archivo al repositorio del proyecto.
Esta en una carpeta personal de Windows que no se commitea.
