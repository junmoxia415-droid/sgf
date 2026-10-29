# Rotar las credenciales expuestas en el release público

**Para quién es esto:** para la persona propietaria del sistema SGF. No hace falta
saber programar para seguir los pasos 1 a 4; el 5 y el 6 los puede hacer alguien
técnico en diez minutos.

**Por qué es urgente:** el release público
`https://github.com/junmoxia415-droid/sgf/releases/tag/sgf` incluye el archivo
`server/.env` con **credenciales reales**. Cualquiera que descargue ese ZIP las
tiene, y descargarlo no requiere cuenta. Ninguna corrección de código arregla esto:
hay que cambiar las claves.

---

## 1. Qué hay que cambiar

| Qué | Dónde se usa | Riesgo si no se cambia |
|---|---|---|
| Contraseña de la base **Oracle** | `server/.env` → `DB_PASSWORD` | Cualquiera puede leer y modificar todas las facturas y líneas |
| Contraseña de **SQL Server** (si se usa) | `server/.env` → `DB_PASSWORD` | Igual |
| **`JWT_SECRET`** | `server/.env` | Cualquiera puede fabricar un token de administrador válido |
| **Token de instalación** (`SGF_INSTALL_TOKEN`) | `server/.env` | Cualquiera puede instalar/registrar equipos |
| Contraseña del **administrador** (el usuario que se creó en el asistente) | Base de datos | Acceso directo al panel |
| **Token de GitHub** compartido | Fuera del repositorio | Cualquiera puede subir cambios al repositorio |

---

## 2. Cambiar las contraseñas de las bases de datos

**En Oracle** (con un usuario administrador, desde SQL*Plus o SQL Developer):

```sql
ALTER USER NOMBRE_DEL_USUARIO IDENTIFIED BY "NuevaClaveLarga-2026";
```

**En SQL Server** (Management Studio → Seguridad → Inicios de sesión → clic derecho
→ Propiedades → Cambiar contraseña), o por SQL:

```sql
ALTER LOGIN [usuario] WITH PASSWORD = '<clave-nueva-que-elija>';
```

Regla práctica: **20 caracteres o más**, sin palabras del diccionario, distinta de
las demás. Se guarda en un gestor de contraseñas, nunca en un correo ni en un chat.

---

## 3. Generar un `JWT_SECRET` nuevo

Ese valor es una cadena aleatoria larga. Cualquiera de estas dos formas sirve:

**En Windows (PowerShell):**

```powershell
# Genera 48 bytes aleatorios en texto seguro para pegar en el .env
$bytes = New-Object byte[] 48
[System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

**En Linux o macOS:**

```bash
openssl rand -base64 48
```

El resultado se pega en `server/.env`:

```ini
JWT_SECRET=el-valor-que-acaba-de-generar
```

> Al cambiar `JWT_SECRET`, **todos los usuarios tendrán que volver a iniciar
> sesión**. Es lo esperado: invalida cualquier token que se hubiera filtrado.

---

## 4. Cambiar la contraseña del administrador

1. Abra SGF (la app de escritorio o la web) e inicie sesión como administrador.
2. Menú **Usuarios** → su usuario de administrador → **Editar**.
3. Escriba la contraseña nueva y guarde.

Desde la versión con el arreglo de sesiones, al cambiar la contraseña **se cierran
todas las sesiones abiertas de ese usuario**, incluidas las de un posible intruso.

Si no puede entrar con la cuenta de administrador, el sistema la recupera al
arrancar con `DEFAULT_ADMIN_PASSWORD` del `.env` — por eso el paso 5 también
importa.

---

## 5. Limpiar el `.env` de la carpeta de instalación

El `.env` que se distribuyó está en la carpeta de instalación del servidor. Hay que
editarlo (Bloc de notas vale) y poner los valores nuevos:

```ini
DB_HOST=...
DB_USER=...
DB_PASSWORD=LA-CLAVE-NUEVA
JWT_SECRET=EL-SECRETO-NUEVO
SGF_INSTALL_TOKEN=UN-TOKEN-NUEVO
DEFAULT_ADMIN_PASSWORD=LA-CLAVE-NUEVA-DEL-ADMIN
```

Dos detalles que se olvidan:

- El `.env` **no debe volver a subirse nunca** al repositorio. Ya está en
  `.gitignore`; el flujo de GitHub Actions comprueba en cada push que no aparezca
  ningún `.env` ni claves reales.
- Guarde una copia del `.env` en el gestor de contraseñas. Si se pierde, hay que
  reconstruirlo a mano.

---

## 6. Revocar y volver a crear el token de GitHub

1. GitHub → foto de perfil → **Settings** → **Developer settings** →
   **Personal access tokens**.
2. Busque el token que se compartió y pulse **Delete** (borrarlo es equivalente a
   revocarlo; no hace falta "regenerar").
3. Cree uno nuevo con el mínimo permiso necesario (`Contents: read and write` sobre
   ese repositorio) y guárdelo **solo** en el gestor de contraseñas o en los
   *Secrets* del repositorio.
4. Si el token se usó en algún archivo del proyecto o en un script, búsquelo y
   bórrelo: `git grep -n "ghp_"` no debe devolver nada.

---

## 7. Cerrar el grifo: que el release deje de llevar el `.env`

Cambiar las claves resuelve el daño; esto evita que vuelva a pasar:

1. Abra el release `sgf` y **borre el archivo `.env`** del paquete publicado (o
   sustituya el ZIP por uno generado sin él).
2. En el repositorio, confirme que `.gitignore` incluye `.env` (ya lo hace).
3. Genere los paquetes con el flujo de GitHub Actions: el ZIP que produce
   (`SGF-Escritorio-Portable-*.zip`) **no incluye ningún `.env`**, solo un
   `.env.example` con valores vacíos como plantilla.

---

## 8. Comprobar que quedó bien

- [ ] Entrar en la base con la **contraseña vieja** falla.
- [ ] El servidor arranca con la contraseña nueva y el panel dice "BD: OK".
- [ ] El usuario de administrador entra con la contraseña nueva; la vieja no funciona.
- [ ] Al cambiar `JWT_SECRET`, una sesión anterior deja de valer (401).
- [ ] El token de GitHub viejo ya no puede hacer push.
- [ ] `git grep -n "ghp_"` y una búsqueda de la contraseña vieja en el repositorio
      no devuelven nada.
- [ ] El release público ya no contiene `.env`.

---

## 9. Si sospecha que ya hubo acceso indebido

1. **Registros:** `SGF_LOGS` guarda quién hizo qué y cuándo. Busque accesos fuera
   del horario habitual o cargas de facturas que nadie reconoce.
2. **Facturas raras:** revise `SGF_FACTURAS` por fechas y usuarios que no
   correspondan; el campo `USER_ID` dice quién la cargó.
3. **Copias de seguridad:** antes de limpiar nada, haga una copia (menú
   **Servidor** → *Crear copia de seguridad*) y guárdela aparte.
4. Si hay indicios claros, cambie también las contraseñas de los usuarios
   normales: son dos clics por usuario en el menú **Usuarios**.

---

## Resumen en una línea

Cambie **la contraseña de la base, el `JWT_SECRET`, la del administrador y el token
de GitHub**; actualice el `.env` de la instalación; borre el `.env` del release.
Hasta que eso esté hecho, las demás mejoras de seguridad no protegen de nada,
porque las llaves están publicadas.
