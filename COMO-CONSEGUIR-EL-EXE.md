# Guía: conseguir el `.exe` compilado y publicado en tu repositorio

**Tu situación ahora mismo (comprobado en la API de GitHub):**

- `https://github.com/junmoxia415-droid/sgf/actions` → ejecuciones: **0**. Nunca se
  ha compilado nada.
- Releases: solo `sgf` con **`sgf-proyecto.zip`**. No hay ningún `.exe`, ni portable
  ni instalador.
- En `main` **no existe** la carpeta `.github/workflows/`, que es la que le dice a
  GitHub cómo compilar.

Traducido: el flujo de compilación **está escrito aquí, pero no está en tu
repositorio**, y además GitHub solo compila cuando ese archivo está en la rama por
defecto (`main`). Por eso no aparece ningún `.exe`.

---

## Qué tienes que hacer (un rato, una sola vez)

### Paso 1. Subir el proyecto actualizado a GitHub

Este entorno de trabajo no tiene permiso de escritura en tu repositorio (el token
que pasaste ya no sirve para eso, y no debo guardarlo). Así que los archivos tienes
que subirlos tú. Hay dos formas:

**Opción A — con Git en tu PC (recomendada)**

```bash
# 1) Descarga la carpeta del proyecto que está en este entorno de trabajo
#    (el archivo SGF-proyecto-completo.zip que te dejo al lado)
# 2) Descomprímelo y, dentro de la carpeta sgf:

git checkout -b compilacion
git add .github instalador escritorio server/src server/package.json \
        server/package-lock.json server/vendor client/src client/package.json \
        client/package-lock.json escritorio/README.md .gitignore
git commit -m "Compilacion automatica e instalador para Windows"
git push -u origin compilacion
```

**Opción B — arrastrando archivos en la web de GitHub**

1. Entra en `https://github.com/junmoxia415-droid/sgf`.
2. Botón **Add file → Upload files**.
3. Arrastra la carpeta `.github` completa (con `workflows/escritorio-windows.yml` y
   `workflows/servidor-pruebas.yml`), la carpeta `instalador` y la carpeta
   `escritorio`.
4. Abajo elige **Create a new branch** (`compilacion`) → **Propose changes**.
5. Pulsa **Compare & pull request** y **Create pull request**.

> Importante: sube la carpeta `.github` **con el punto delante**. En Windows, el
> Explorador a veces la oculta; si no la ves, escribe la ruta directamente.

### Paso 2. Unir ese cambio a `main`

En el pull request: **Merge pull request**. Es lo que "despierta" a GitHub Actions.

### Paso 3. Ver la compilación

1. Ve a la pestaña **Actions** del repositorio.
2. Verás *"Compilar e instalar SGF (Windows)"* en marcha (tarda 15–25 minutos la
   primera vez).
3. Al terminar, entra en esa ejecución → abajo, **Artifacts**:
   - `SGF-Escritorio-Setup-1.0.0.exe` ← **el instalador**
   - `SGF-Escritorio-Portable-1.0.0.zip` ← versión que no instala nada

### Paso 4. Que aparezca en Releases

**Ya está automatizado**: cada compilación correcta en `main` publica sola una
Release llamada `v1.0.0` con dos archivos dentro:

- `SGF-Escritorio-Setup-1.0.0.exe` (el instalador)
- `SGF-Escritorio-Portable-1.0.0.zip` (para probar sin instalar)

Si alguna vez quieres publicar sin recompilar (por ejemplo con un `.exe` que ya
descargaste), tienes el flujo **"Publicar Release con el instalador"** en la
pestaña Actions: le dices la versión y listo.

Y siempre queda el camino manual: **Releases → Draft a new release**, etiqueta
`v1.0.0`, y arrastras el `.exe` que descargaste de *Artifacts*.

---

## Si usas GitHub desde el móvil o sin Git instalado

1. Entra en la web de GitHub desde el navegador del PC (no la app del móvil).
2. Sigue la **Opción B** de arriba: funciona sin instalar nada.

---

## Cómo comprobar que quedó bien

- [ ] En `https://github.com/junmoxia415-droid/sgf/actions` hay ejecuciones (no "0").
- [ ] La ejecución "Compilar e instalar SGF (Windows)" está en verde.
- [ ] En `https://github.com/junmoxia415-droid/sgf/releases` aparece una release
      nueva con un archivo `.exe` de unos 80–150 MB.
- [ ] Al ejecutar el `.exe` en un PC Windows, se instala y abre SGF sin pedir Node
      ni nada más.

## Si la compilación sale en rojo

Pásame el texto del error (o el enlace de la ejecución) y lo corrijo. Los fallos
más probables y su significado:

| Mensaje | Qué significa |
|---|---|
| `Cannot find module 'typescript'` | Se subió `server/package.json` sin el `package-lock.json` |
| `Inno Setup fallo` | Falta algún archivo en `distribucion`; el propio flujo dice cuál |
| `flutter analyze` con errores | Se subió `escritorio/lib` a medias: sube la carpeta completa |
| `npm audit` falla | Apareció una dependencia nueva con fallo conocido; avísame |
