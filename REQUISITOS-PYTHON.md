# Requisitos Python - SGF

## ¿Para qué se usa Python?

El archivo `launcher/sgf-launcher.py` ofrece un panel gráfico de control
(Iniciar / Detener servidor, configurar .env, ver logs). Es **opcional**:
el sistema funciona perfectamente con los scripts `.bat` simples.

## Si quiere usar el panel gráfico

### 1. Instale Python 3.8+ desde https://www.python.org

En Windows marque la opción **"Add Python to PATH"** durante la instalación.

### 2. Verifique que tkinter está disponible

```bash
python -c "import tkinter; print('OK')"
```

Si falla:
- En Windows: reinstale Python y asegúrese de incluir **Tcl/Tk and IDLE**.
- En Linux: `sudo apt install python3-tk`

### 3. Ejecute el panel

```bash
python launcher/sgf-launcher.py
```

O use el acceso directo `SGF-Panel.bat`.

### 4. (Opcional) Compile el .exe

```bash
pip install pyinstaller
build-exe.bat
```

Eso genera `sgf-panel.exe` que se puede usar sin tener Python instalado.

## Si NO quiere usar el panel gráfico

Use directamente:
- `instalar-todo.bat` - primera vez
- `start-servidor.bat` - arrancar el servidor
- `start-cliente.bat` - arrancar y abrir navegador
