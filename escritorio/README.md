# SGF Escritorio — aplicación instalable para PC sin conexión

Aplicación de escritorio (Flutter) que **incluye el servidor dentro**. El usuario
ejecuta un instalador `.exe` y abre el programa: no hay que instalar Node, ni
ejecutar archivos `.bat`, ni abrir ventanas negras.

---

## 1. Qué hace distinto a la versión web

| Antes (versión web) | Ahora (SGF Escritorio) |
|---|---|
| Abrir `start-servidor.bat` y luego el navegador | Un icono en el escritorio. El servidor se enciende solo. |
| Si el servidor se caía, había que buscar el problema en una consola | Botones **Iniciar / Detener / Reiniciar** y un registro legible en la app |
| Configurar la BD con formularios técnicos | Asistente de primera vez en 3 pasos, con explicaciones |
| Riesgo de apuntar a una BD equivocada | Por defecto, **SQLite local**; Oracle/SQL Server se prueban antes de aplicar |
| Copias de seguridad manuales (copiar archivos) | Botón **Crear copia ahora** (guarda las 10 últimas) y `Ctrl+B` |
| Errores en inglés o sin contexto | Todos los mensajes en español, con **qué hacer a continuación** |

---

## 2. Estructura del paquete

```
SGF\                                  (carpeta de instalación)
├── sgf_escritorio.exe                ← la aplicación
├── LEEME-PRIMERO.txt                 ← guía rápida
└── servidor\                         ← el motor, incluido
    ├── dist\                         ← servidor compilado
    ├── node_modules\                 ← dependencias de producción
    ├── runtime\node.exe              ← Node.js portátil (no hace falta instalar)
    └── package.json
```

Datos del usuario (**nunca se borran al desinstalar**):

```
%APPDATA%\SGF\
├── ajustes.json                      (puerto, tema, preferencias)
└── datos\
    ├── sgf-data.db                   (la base de datos)
    ├── .env                          (configuración del servidor)
    └── copia-AAAA-MM-DDTHH-MM-SS.db  (copias de seguridad)
```

---

## 3. Cómo se compila (GitHub Actions)

El flujo `.github/workflows/escritorio-windows.yml` hace todo:

1. **Servidor** (Ubuntu): `tsc`, arranque real, pruebas de seguridad y del panel.
2. **Escritorio** (Windows): `flutter analyze`, `flutter test`, `flutter build windows`,
   montaje del paquete con Node portátil y generación del instalador con Inno Setup.
3. **Integración** (Ubuntu): pruebas de la app Flutter **contra el servidor real**.

Resultado en la pestaña *Actions* → *Artifacts*:

- `SGF-Escritorio-Setup-<version>.exe` — instalador (todo dentro)
- `SGF-Escritorio-Portable-<version>.zip` — carpeta que arranca sin instalar

Para publicar una versión: `Actions` → *Compilar e instalar SGF (Windows)* →
*Run workflow* → versión (ej. `4.0.0`).

### Compilar en tu PC (opcional)

```powershell
# Requisitos: Flutter 3.47+, Visual Studio 2022 con "Desarrollo para escritorio con C++",
#             Node.js 20, Inno Setup 6
cd escritorio
flutter pub get
flutter test
flutter build windows --release

cd ..\server
npm ci --omit=dev
npx tsc

# Montaje manual: copiar escritorio\build\windows\x64\runner\Release\* a una carpeta,
# añadir servidor\dist, node_modules y runtime\node.exe, y compilar instalador\sgf.iss
```

---

## 4. Cómo se usa (lo que ve el usuario)

1. Doble clic en **SGF Escritorio**.
2. Primera vez → asistente:
   - **Dónde se guardan los datos**: “En este equipo” (recomendado) / Oracle / SQL Server.
   - **Cuenta del administrador**: usuario y contraseña (no se puede recuperar, solo cambiar).
   - **Listo**: recordatorio de los 3 pasos de trabajo.
3. Uso diario: *Facturas* → arrastrar los PDF. *Servidor* → copia de seguridad al final del día.

La guía completa está dentro de la app: **Ajustes y guía** (y `F1`).

---

### 4.1 Qué pasa si el administrador te desactiva mientras trabajas

El servidor comprueba en **cada petición** que la cuenta siga activa y que el rol
no haya cambiado. Si un administrador desactiva la cuenta, la elimina o le cambia
la contraseña, la sesión se cierra al instante (ya no hay que esperar 8 horas) y la
aplicación muestra un aviso en español:

> **Su sesión se ha cerrado** — «Usuario desactivado. Contacte con el administrador.»
> Esto ocurre por seguridad… Sus datos están guardados: solo tiene que volver a entrar.

Con el botón **Iniciar sesión** vuelve a entrar sin cerrar la aplicación. Lo mismo
ocurre si la sesión supera su tope absoluto (24 h por defecto, ajustable con
`SESSION_MAX_HOURS` en el `.env` del servidor).

### 4.2 Si una factura choca con otra (error 409)

Solo hay **un caso** en el que el servidor rechaza una factura:

- **el número de factura ya lo ha cargado otro usuario.** Un usuario normal no
  puede reemplazar facturas ajenas; un administrador sí, y queda registrado.

Todo lo demás **no** bloquea:

- reenviar la misma factura **la sustituye** (así se corrige una que se mandó mal);
- que las mismas líneas aparezcan en otra factura del mismo mes es lo normal
  (primera y segunda quincena) y solo se avisa;
- que aparezcan en facturas de otros meses también es normal y solo se avisa.

### 4.3 Facturas por mes (2 por defecto, configurable)

Cada mes se facturan las mismas líneas, y a veces en varias facturas (lo habitual,
dos: primera y segunda quincena). El servidor lleva la cuenta:

- **`FACTURAS_POR_MES`** (por defecto **2**) dice cuántas se esperan. Se cambia
  desde **Ajustes y guía → Facturas por mes** (1, 2, 3, 4, 5, 6, 8 o 10) y se
  aplica al instante, sin reiniciar.
- Cada factura se guarda con su **periodo normalizado** (`2026-09`) y su **parte**
  (`1`, `2`…), así que se puede saber qué meses están completos.
- Si llega **una factura más de las esperadas**, se carga igual y se avisa. Nunca
  se bloquea una factura legítima.
- Si llega **una menos**, el panel de periodos la marca como pendiente.

### Corregir una factura mal enviada

Basta con volver a cargarla: la nueva **sustituye** a la anterior, en una sola
operación y sin dejar restos. El resultado lo dice («se ha SUSTITUIDO por esta
versión»). Solo hay un caso que se rechaza: intentar reemplazar una factura cargada
por **otro usuario**, que solo puede hacerlo un administrador.

## 5. Seguridad del modelo de escritorio

- El servidor escucha **solo en `127.0.0.1`**: ninguna otra computadora de la red
  puede alcanzarlo, ni siquiera con la IP y el puerto.
- El panel de control (`/api/panel/*`) responde únicamente a peticiones de este
  equipo y exige el **token de consola**, que la app genera en cada arranque
  (32 bytes aleatorios) y pasa al proceso por variable de entorno.
- Ese token permite administrar la **base de datos**, pero **no** da acceso a las
  facturas de nadie: para verlas hay que iniciar sesión como usuario.
- Las rutas `/api/db/*` y `/api/import/*` siguen exigiendo administrador (ver
  `AUDITORIA-SGF.md` §9). El único acceso extra es el del instalador local.
- La base SQLite se guarda de forma **atómica** (archivo temporal + rename): un
  corte de luz no la corrompe.
- `server/.env` y los datos **nunca** se empaquetan en el instalador; se generan
  en el equipo del usuario, con un `JWT_SECRET` aleatorio.

---

## 6. Qué falta para una 1.1

- Firma digital del `.exe` (evita el aviso de SmartScreen).
- Actualizaciones automáticas (por ejemplo con `package_info` + descarga del ZIP).
- Restaurar una copia desde la propia app (hoy se hace copiando el archivo).
- Envío de la factura procesada a la impresora o exportación a PDF/Excel.
- Modo “varios puestos”: un solo equipo con el servidor y otros en la red local
  (requiere cambiar `HOST` y añadir autenticación por certificado o VPN).

---

## 7. Pruebas: qué se comprueba y dónde

| Comprobación | Archivo | Dónde se ejecuta |
|---|---|---|
| Interfaz: las 7 pantallas se pintan, los textos de ayuda están, la confirmación destructiva exige escribir la palabra y, si el servidor rechaza la sesión, la app avisa y ofrece entrar de nuevo | `escritorio/test/pruebas_widgets_test.dart` (10 pruebas) | Windows y Linux (GitHub Actions) |
| Cliente HTTP contra el servidor real: panel, login, permisos y **expulsión al desactivar la cuenta** | `escritorio/test_integracion/api_test.dart` (6 pruebas, **necesita servidor**) | Trabajo `integracion` |
| Servidor: tipos, arranque real, rutas cerradas, panel | `.github/workflows/escritorio-windows.yml` → trabajo `servidor` | Ubuntu |
| Secretos: que no haya `.env` ni claves versionadas | `.github/workflows/servidor-pruebas.yml` | Ubuntu |

En local:

```bash
cd escritorio
flutter analyze          # debe dar 0 errores
flutter test test/       # 10 pruebas de interfaz (no necesita servidor)

# integración (con el servidor arrancado en el puerto 3000)
SGF_BASE=http://127.0.0.1:3000 SGF_CONSOLE_TOKEN=<token> \
  flutter test test_integracion/api_test.dart
```

Si ves `Package file_picker ... does not provide an inline implementation`, es un
aviso conocido de esa dependencia: no rompe nada y no aparece en las versiones
compiladas.
