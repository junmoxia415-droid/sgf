#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
SGF v4.0 - PANEL DE CONTROL
Ejecutar: SGF-Panel.bat (o sgf-panel.exe si fue compilado)

El launcher debe estar en la RAIZ del proyecto:
  sgf-refactor/
    SGF-Panel.bat        <-- este
    launcher/
      sgf-launcher.py    <-- o sgf-panel.exe
    server/
    client/
"""

import os, sys, subprocess, threading, time, socket, shutil, webbrowser
import tkinter as tk
from tkinter import ttk, scrolledtext, messagebox
from pathlib import Path
from datetime import datetime

# ---- RUTA BASE ----
if getattr(sys, 'frozen', False):
    # .exe compilado con PyInstaller
    BASE_DIR = Path(sys.executable).resolve().parent
else:
    # .py - launcher esta en launcher/, proyecto en ../ 
    BASE_DIR = Path(__file__).resolve().parent.parent

SERVER_DIR = BASE_DIR / "server"
CLIENT_DIR = BASE_DIR / "client"
PROCESS = None
LOG_LINES = []
INSTALLING = False

# ================================================================
# DETECCION DE Node.js Y npm (CORREGIDO PARA WINDOWS)
# ================================================================
NODE_DIRS = [
    r"C:\Program Files\nodejs",
    r"C:\Program Files (x86)\nodejs",
    os.path.expanduser(r"~\AppData\Roaming\npm"),
]

def _find_cmd(dir_path, name):
    """Busca name.exe, name.cmd, NAME.EXE, NAME.CMD, etc en un dir"""
    d = Path(dir_path)
    if not d.is_dir():
        return None
    for variant in [name, name.lower(), name.upper(), name.capitalize()]:
        for ext in [".exe", ".cmd", ".EXE", ".CMD", ""]:
            p = d / f"{variant}{ext}"
            if p.is_file():
                return str(p)
    return None

def find_node_detailed():
    """(node_path, node_ver, npm_path, npm_ver, error_msg)"""
    node = None
    nver = None
    npm = None
    nmver = None

    # 1. node en PATH
    n = shutil.which("node")
    if n:
        try:
            v = subprocess.run([n, "--version"], capture_output=True, text=True, timeout=5)
            if v.returncode == 0:
                node = n; nver = v.stdout.strip()
        except: pass

    # 2. buscar en rutas comunes
    if not node:
        for d in NODE_DIRS:
            found = _find_cmd(d, "node")
            if found:
                try:
                    v = subprocess.run([found, "--version"], capture_output=True, text=True, timeout=5)
                    if v.returncode == 0:
                        node = found; nver = v.stdout.strip(); break
                except: pass

    if not node:
        return (None, None, None, None,
                "Node.js no instalado.\nSi tiene node-v*.msi en la raiz, instalelo primero.")

    # 3. npm: misma carpeta que node.exe
    node_dir = str(Path(node).parent)
    npm = _find_cmd(Path(node).parent, "npm")

    # 4. npm en PATH como fallback
    if not npm:
        npm = shutil.which("npm")
    if not npm:
        npm = shutil.which("npm.cmd")

    # 5. verificar version npm
    if npm:
        try:
            v = subprocess.run([npm, "--version"], capture_output=True, text=True, timeout=5)
            if v.returncode == 0:
                nmver = v.stdout.strip()
        except: pass

    if not npm:
        # Ultimo intento: listar que hay en la carpeta de node
        pd = Path(node_dir)
        found_any = list(pd.glob("npm*"))
        if found_any:
            names = ", ".join(f.name for f in found_any[:5])
            return (node, nver, None, None,
                    f"npm no se pudo ejecutar. Archivos encontrados: {names}\n"
                    "Abra CMD como Administrador y ejecute:\n"
                    f'  set PATH={node_dir};%PATH%')
        return (node, nver, None, None,
                f"npm no encontrado en {node_dir}.\n"
                "Reinstale Node.js marcando 'Add to PATH'.")

    return (node, nver, npm, nmver, None)

def find_node():
    n, _, _, _, _ = find_node_detailed()
    return n

def find_node_installer():
    """Busca node-v*.msi o Node*.msi en raiz"""
    for pat in ["node-v*.msi", "node-v*.exe", "Node*v*.msi", "Node*v*.exe",
                "node*.msi", "node*.exe"]:
        matches = list(BASE_DIR.glob(pat))
        if matches: return str(matches[0])
    return None

def install_node_msi(path):
    try:
        log(f"Ejecutando instalador Node.js: {Path(path).name}")
        if path.lower().endswith('.msi'):
            subprocess.Popen(["msiexec", "/i", path],
                             creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
        else:
            subprocess.Popen([path],
                             creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
        return True
    except Exception as e:
        log(f"ERROR: {e}")
        return False

# ================================================================
# RED + CONFIG
# ================================================================
def check_port(port):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try: s.bind(("127.0.0.1", port)); return False
        except OSError: return True

def kill_port(port):
    try:
        r = subprocess.run(["netstat","-ano"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            if f":{port}" in line and "LISTENING" in line:
                pid = line.strip().split()[-1]
                subprocess.run(["taskkill","/F","/PID",pid], capture_output=True, timeout=5)
                time.sleep(1.5); return True
    except: pass
    return False

def read_env():
    cfg = {"host":"25","port":"1521","service":"PCELULAR","user":"pcelular",
           "http":"3000","db_type":"",
           "mssql_server":"localhost","mssql_port":"1433","mssql_db":"sgf","mssql_user":"sa"}
    f = SERVER_DIR / ".env"
    if f.exists():
        for line in open(f, encoding="utf-8"):
            line=line.strip()
            if line.startswith("#") or "=" not in line: continue
            k,_,v=line.partition("="); k=k.strip(); v=v.strip()
            if k=="ORACLE_HOST": cfg["host"]=v
            elif k=="ORACLE_PORT": cfg["port"]=v
            elif k=="ORACLE_SERVICE": cfg["service"]=v
            elif k=="ORACLE_USER": cfg["user"]=v
            elif k=="PORT": cfg["http"]=v
            elif k=="DB_TYPE": cfg["db_type"]=v
            elif k=="MSSQL_SERVER": cfg["mssql_server"]=v
            elif k=="MSSQL_PORT": cfg["mssql_port"]=v
            elif k=="MSSQL_DATABASE": cfg["mssql_db"]=v
            elif k=="MSSQL_USER": cfg["mssql_user"]=v
    return cfg

# ================================================================
# LOGGING
# ================================================================
def log(msg):
    ts=datetime.now().strftime("%H:%M:%S")
    LOG_LINES.append(f"[{ts}] {msg}")
    if len(LOG_LINES)>1000: del LOG_LINES[:-500]

def refresh_log(w):
    if not w: return
    try:
        w.configure(state="normal"); w.delete("1.0",tk.END)
        w.insert("1.0","\n".join(LOG_LINES[-50:])); w.see(tk.END)
        w.configure(state="disabled")
    except: pass

# ================================================================
# SERVIDOR
# ================================================================
def run_server(widget):
    global PROCESS
    try:
        node = find_node()
        if not node: log("ERROR: Node.js no encontrado"); return

        env = os.environ.copy()
        env["NODE_NO_WARNINGS"] = "1"
        if node:
            env["PATH"] = str(Path(node).parent) + os.pathsep + env.get("PATH","")

        cmd = [node, "dist/index.js"]
        log(f"Iniciando: {' '.join(cmd)}")

        PROCESS = subprocess.Popen(
            cmd, cwd=str(SERVER_DIR),
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
            text=True, encoding="utf-8", errors="replace", bufsize=1,
            env=env,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0
        )
        for line in iter(PROCESS.stdout.readline, ""):
            if not line: break
            line=line.strip()
            if line:
                log(line)
                if widget:
                    try: widget.after(0, lambda w=widget: refresh_log(w))
                    except: pass
        PROCESS.stdout.close(); PROCESS.wait()
    except FileNotFoundError:
        log("ERROR: Node o dependencias del servidor no disponibles.")
        log("Ejecute instalar-todo.bat para instalar SOLO produccion del servidor.")
    except Exception as e:
        log(f"ERROR: {e}")
    finally:
        PROCESS = None
        if widget:
            try: widget.after(0, lambda w=widget: refresh_log(w))
            except: pass

# ================================================================
# UI
# ================================================================
class SGFLauncher:
    def __init__(self, root):
        self.root=root
        self.root.title("SGF v4.0 - Panel de Control")
        self.root.geometry("950x680"); self.root.minsize(750,520)
        self.root.configure(bg="#f0f2f5")
        self.GREEN="#059669"; self.RED="#dc2626"; self.BLUE="#2563eb"
        self.GRAY="#6b7280"; self.DARK="#111827"; self.WHITE="#ffffff"

        self.server_running=tk.BooleanVar(value=False)
        self.status_text=tk.StringVar(value="DETENIDO")
        self.btn_start=self.btn_stop=self.btn_restart=None
        self.btn_install_node=None
        self.server_status_detail=self.conn_info=None
        self.log_output=self.verify_output=None
        self.progress_bar=self.progress_label=None
        self.env_entries={}; self.proxy_entry=None
        self.node_path=self.node_version=None
        self.npm_path=self.npm_version=None
        self.node_installer=None

        self.build_ui()
        self.root.after(500, self.auto_detect)

    def build_ui(self):
        h=tk.Frame(self.root,bg=self.DARK,height=56);h.pack(fill="x");h.pack_propagate(False)
        tk.Label(h,text="SGF v4.0 | Sistema de Gestion de Facturas | Panel de Control",
                 font=("Segoe UI",12,"bold"),bg=self.DARK,fg="white").pack(side="left",padx=16,pady=14)
        sf=tk.Frame(h,bg=self.DARK);sf.pack(side="right",padx=16,pady=14)
        self.status_dot=tk.Canvas(sf,width=12,height=12,bg=self.DARK,highlightthickness=0);self.status_dot.pack(side="left",padx=(0,5))
        self.dot=self.status_dot.create_oval(1,1,11,11,fill=self.GRAY,outline="")
        self.status_label=tk.Label(sf,textvariable=self.status_text,font=("Segoe UI",10,"bold"),bg=self.DARK,fg=self.GRAY);self.status_label.pack(side="left")

        nb=ttk.Notebook(self.root);nb.pack(fill="both",expand=True,padx=8,pady=8)
        t1=tk.Frame(nb,bg="#f0f2f5");nb.add(t1,text="  Control  ");self.build_control(t1)
        t2=tk.Frame(nb,bg="#f0f2f5");nb.add(t2,text="  Logs  ");self.build_logs(t2)
        t3=tk.Frame(nb,bg="#f0f2f5");nb.add(t3,text="  Config  ");self.build_config(t3)
        t4=tk.Frame(nb,bg="#f0f2f5");nb.add(t4,text="  Verificar  ");self.build_verify(t4)

        f=tk.Frame(self.root,bg=self.DARK,height=24);f.pack(fill="x",side="bottom")
        tk.Label(f,text="Oracle DB | ETECSA | Cliente/Servidor | v4.0",
                 font=("Segoe UI",7),bg=self.DARK,fg="#6b7280").pack(side="right",padx=10,pady=3)

    def card(self,parent,**kw):
        return tk.Frame(parent,bg=self.WHITE,bd=0,highlightbackground="#e5e7eb",highlightthickness=1,**kw)

    # ---- CONTROL ----
    def build_control(self,p):
        c1=self.card(p);c1.pack(fill="x",padx=8,pady=(8,4))
        tk.Label(c1,text="Estado del Servidor",font=("Segoe UI",12,"bold"),bg=self.WHITE,fg=self.DARK).pack(anchor="w",padx=14,pady=(10,2))
        self.server_status_detail=tk.Label(c1,text="Cargando...",font=("Segoe UI",9),bg=self.WHITE,fg=self.GRAY,justify="left",wraplength=700);self.server_status_detail.pack(anchor="w",padx=14,pady=(0,10))

        c2=self.card(p);c2.pack(fill="x",padx=8,pady=4)
        tk.Label(c2,text="Acciones",font=("Segoe UI",12,"bold"),bg=self.WHITE,fg=self.DARK).pack(anchor="w",padx=14,pady=(10,6))
        bf=tk.Frame(c2,bg=self.WHITE);bf.pack(padx=14,pady=(0,12))
        self.btn_start=tk.Button(bf,text="Iniciar Servidor",command=self.start_server,bg=self.GREEN,fg="white",font=("Segoe UI",9,"bold"),width=16,height=1,bd=0,cursor="hand2");self.btn_start.pack(side="left",padx=(0,6))
        self.btn_stop=tk.Button(bf,text="Detener",command=self.stop_server,bg=self.RED,fg="white",font=("Segoe UI",9,"bold"),width=10,height=1,bd=0,cursor="hand2",state="disabled");self.btn_stop.pack(side="left",padx=(0,6))
        self.btn_restart=tk.Button(bf,text="Reiniciar",command=self.restart_server,bg=self.BLUE,fg="white",font=("Segoe UI",9,"bold"),width=10,height=1,bd=0,cursor="hand2",state="disabled");self.btn_restart.pack(side="left")
        self.btn_install_node=tk.Button(bf,text="Instalar Node.js",command=self._install_node,bg="#d97706",fg="white",font=("Segoe UI",9,"bold"),width=15,height=1,bd=0,cursor="hand2")

        c3=self.card(p);c3.pack(fill="x",padx=8,pady=4)
        tk.Label(c3,text="Informacion de Conexion",font=("Segoe UI",12,"bold"),bg=self.WHITE,fg=self.DARK).pack(anchor="w",padx=14,pady=(10,6))
        self.conn_info=tk.Label(c3,text="",font=("Consolas",9),bg=self.WHITE,fg=self.DARK,justify="left");self.conn_info.pack(anchor="w",padx=14,pady=(0,10))
        self._refresh_conn_info()

        c4=self.card(p);c4.pack(fill="x",padx=8,pady=4)
        tk.Label(c4,text="Acceso Rapido",font=("Segoe UI",12,"bold"),bg=self.WHITE,fg=self.DARK).pack(anchor="w",padx=14,pady=(10,6))
        qf=tk.Frame(c4,bg=self.WHITE);qf.pack(padx=14,pady=(0,10))
        tk.Button(qf,text="Abrir en Navegador",command=lambda:webbrowser.open(f"http://localhost:{read_env()['http']}"),bg="#7c3aed",fg="white",font=("Segoe UI",8),width=17,bd=0,cursor="hand2").pack(side="left",padx=(0,5))
        tk.Button(qf,text="Carpeta del Proyecto",command=lambda:os.startfile(str(BASE_DIR)),bg="#374151",fg="white",font=("Segoe UI",8),width=17,bd=0,cursor="hand2").pack(side="left",padx=(0,5))
        tk.Button(qf,text="Editar .env (Oracle)",command=self._edit_env,bg="#d97706",fg="white",font=("Segoe UI",8),width=17,bd=0,cursor="hand2").pack(side="left")

    def _install_node(self):
        if self.node_installer:
            ok=install_node_msi(self.node_installer)
            if ok:
                messagebox.showinfo("Instalador Node.js",
                    "Se abrio el instalador de Node.js.\n\n"
                    "Complete la instalacion. ASEGURESE DE MARCAR:\n"
                    "  [x] Add to PATH\n\n"
                    "Luego CIERRE y VUELVA A ABRIR este Panel.")
        else:
            messagebox.showinfo("Sin instalador",
                "No se encontro node-v*.msi en la carpeta raiz.\n\n"
                "Coloque el instalador de Node.js en la misma carpeta\n"
                "donde esta este launcher (junto a server/ y client/).")

    def _edit_env(self):
        env=SERVER_DIR/".env"
        if env.exists(): os.startfile(str(env))
        else: messagebox.showwarning("No encontrado","server\\.env no existe. Verifique la ubicacion del proyecto.")

    def _refresh_conn_info(self):
        cfg=read_env()
        ni=f"v{self.node_version}" if self.node_version else "NO INSTALADO"
        if self.node_installer: ni+=f"  [Instalador: {Path(self.node_installer).name}]"
        npi=f"v{self.npm_version}" if self.npm_version else ("NO DETECTADO" if self.node_path else "-")
        dbtype=cfg.get("db_type","").upper() or "AUTO"
        text=(f"  Node.js:  {ni}\n"
              f"  npm:      {npi}\n"
              f"  HTTP:     http://localhost:{cfg['http']}\n"
              f"  BD tipo:  {dbtype}\n"
              f"  Oracle:   {cfg['host']}:{cfg['port']}/{cfg['service']} (user={cfg['user']})\n"
              f"  SQL Srv:  {cfg['mssql_server']}:{cfg['mssql_port']}/{cfg['mssql_db']} (user={cfg['mssql_user']})\n"
              f"  Proyecto: {BASE_DIR}")
        if self.conn_info: self.conn_info.configure(text=text)

    # ---- LOGS ----
    def build_logs(self,p):
        tb=tk.Frame(p,bg="#f0f2f5");tb.pack(fill="x",padx=8,pady=(8,2))
        tk.Label(tb,text="Salida del Servidor",font=("Segoe UI",12,"bold"),bg="#f0f2f5",fg=self.DARK).pack(side="left")
        fr=tk.Frame(tb,bg="#f0f2f5");fr.pack(side="right")
        tk.Button(fr,text="Limpiar",command=self._clear_logs,bg=self.GRAY,fg="white",font=("Segoe UI",8),width=8,bd=0,cursor="hand2").pack(side="left",padx=(0,4))
        tk.Button(fr,text="Copiar",command=self._copy_logs,bg="#4b5563",fg="white",font=("Segoe UI",8),width=8,bd=0,cursor="hand2").pack(side="left")
        self.log_output=scrolledtext.ScrolledText(p,wrap="word",state="disabled",font=("Consolas",9),bg="#111827",fg="#d1d5db");self.log_output.pack(fill="both",expand=True,padx=8,pady=(0,8))
        refresh_log(self.log_output)

    def _clear_logs(self):
        global LOG_LINES;LOG_LINES=[];refresh_log(self.log_output)
    def _copy_logs(self):
        self.root.clipboard_clear();self.root.clipboard_append("\n".join(LOG_LINES))

    # ---- CONFIG ----
    def build_config(self,p):
        c=self.card(p);c.pack(fill="both",expand=True,padx=8,pady=8)
        tk.Label(c,text="Configuracion (.env)",font=("Segoe UI",12,"bold"),bg=self.WHITE,fg=self.DARK).pack(anchor="w",padx=14,pady=(10,2))
        cfg=read_env()
        fields=[
            ("Puerto HTTP","http",cfg["http"]),
            ("Motor BD","db_type",cfg.get("db_type","")),
            ("Oracle Host","host",cfg["host"]),
            ("Oracle Puerto","port",cfg["port"]),
            ("Oracle Servicio","service",cfg["service"]),
            ("Oracle Usuario","user",cfg["user"]),
            ("SQL Srv Server","mssql_server",cfg["mssql_server"]),
            ("SQL Srv Puerto","mssql_port",cfg["mssql_port"]),
            ("SQL Srv Base","mssql_db",cfg["mssql_db"]),
            ("SQL Srv Usuario","mssql_user",cfg["mssql_user"]),
        ]
        self.env_entries={}
        for label,key,default in fields:
            r=tk.Frame(c,bg=self.WHITE);r.pack(fill="x",padx=14,pady=2)
            tk.Label(r,text=label+":",font=("Segoe UI",9),bg=self.WHITE,fg=self.DARK,width=16,anchor="w").pack(side="left")
            e=tk.Entry(r,font=("Consolas",9),width=40);e.insert(0,default);e.pack(side="left");self.env_entries[key]=e
        bf=tk.Frame(c,bg=self.WHITE);bf.pack(padx=14,pady=(8,10))
        tk.Button(bf,text="Guardar Configuracion",command=self.save_env,bg=self.GREEN,fg="white",font=("Segoe UI",9,"bold"),width=22,bd=0,cursor="hand2").pack(side="left",padx=(0,6))
        tk.Button(bf,text="Restaurar Valores",command=self.reset_env,bg=self.GRAY,fg="white",font=("Segoe UI",9),width=18,bd=0,cursor="hand2").pack(side="left")

        tk.Label(c,text="Configuracion de Proxy para npm",font=("Segoe UI",12,"bold"),bg=self.WHITE,fg=self.DARK).pack(anchor="w",padx=14,pady=(16,6))
        pf=tk.Frame(c,bg=self.WHITE);pf.pack(fill="x",padx=14,pady=(0,4))
        tk.Label(pf,text="Proxy HTTP:",font=("Segoe UI",9),bg=self.WHITE,fg=self.DARK,width=16,anchor="w").pack(side="left")
        self.proxy_entry=tk.Entry(pf,font=("Consolas",9),width=40);self.proxy_entry.insert(0,"http://proxy:puerto");self.proxy_entry.pack(side="left")
        pbf=tk.Frame(c,bg=self.WHITE);pbf.pack(padx=14,pady=(2,10))
        tk.Button(pbf,text="Aplicar Proxy",command=self.configure_proxy,bg=self.BLUE,fg="white",font=("Segoe UI",9),width=20,bd=0,cursor="hand2").pack(side="left",padx=(0,6))
        tk.Button(pbf,text="Quitar Proxy",command=self.remove_proxy,bg=self.RED,fg="white",font=("Segoe UI",9),width=20,bd=0,cursor="hand2").pack(side="left")

    def save_env(self):
        c=(f"# SGF v4.0\nPORT={self.env_entries['http'].get().strip()}\nHOST=0.0.0.0\n\n"
           f"DB_TYPE={self.env_entries['db_type'].get().strip()}\n\n"
           f"ORACLE_USER={self.env_entries['user'].get().strip()}\nORACLE_PASSWORD=pcelular\n"
           f"ORACLE_HOST={self.env_entries['host'].get().strip()}\nORACLE_PORT={self.env_entries['port'].get().strip()}\n"
           f"ORACLE_SERVICE={self.env_entries['service'].get().strip()}\n"
           f"ORACLE_POOL_MIN=2\nORACLE_POOL_MAX=20\nORACLE_POOL_INCREMENT=2\nORACLE_POOL_TIMEOUT=60\n\n"
           f"MSSQL_USER={self.env_entries['mssql_user'].get().strip()}\nMSSQL_PASSWORD=\n"
           f"MSSQL_SERVER={self.env_entries['mssql_server'].get().strip()}\nMSSQL_PORT={self.env_entries['mssql_port'].get().strip()}\n"
           f"MSSQL_DATABASE={self.env_entries['mssql_db'].get().strip()}\n"
           f"MSSQL_ENCRYPT=false\nMSSQL_TRUST_CERT=true\n"
           f"MSSQL_POOL_MIN=0\nMSSQL_POOL_MAX=10\nMSSQL_POOL_IDLE_MS=30000\n\n"
           f"JWT_SECRET=sgf-jwt-secret-cambiar-en-produccion\nJWT_EXPIRES_IN=8h\n\n"
           f"REQUEST_TIMEOUT_MS=30000\nMAX_FILE_SIZE_MB=10\n"
           f"LOGIN_RATE_PER_MIN=5\nLOGIN_RATE_PER_15MIN=30\n")
        (SERVER_DIR/".env").write_text(c,encoding="utf-8")
        self._refresh_conn_info();messagebox.showinfo("Guardado","Configuracion guardada.")

    def reset_env(self):
        defaults={"http":"3000","db_type":"","host":"25","port":"1521","service":"PCELULAR","user":"pcelular",
                  "mssql_server":"localhost","mssql_port":"1433","mssql_db":"sgf","mssql_user":"sa"}
        for k,e in self.env_entries.items():
            e.delete(0,tk.END);e.insert(0,defaults.get(k,""))
        self.save_env()

    def configure_proxy(self):
        p=self.proxy_entry.get().strip()
        if not p or p=="http://proxy:puerto":messagebox.showwarning("Proxy","Ingrese URL valida.");return
        npm=self.npm_path or "npm"
        try:
            subprocess.run([npm,"config","set","proxy",p],check=True,timeout=10)
            subprocess.run([npm,"config","set","https-proxy",p],check=True,timeout=10)
            messagebox.showinfo("Proxy","Configurado.")
        except Exception as e:messagebox.showerror("Error",str(e))

    def remove_proxy(self):
        npm=self.npm_path or "npm"
        try:
            subprocess.run([npm,"config","delete","proxy"],check=False,timeout=10)
            subprocess.run([npm,"config","delete","https-proxy"],check=False,timeout=10)
            messagebox.showinfo("Proxy","Eliminado.")
        except Exception as e:messagebox.showerror("Error",str(e))

    # ---- VERIFICAR ----
    def build_verify(self,p):
        c=self.card(p);c.pack(fill="both",expand=True,padx=8,pady=8)
        tk.Label(c,text="Verificacion e Instalacion",font=("Segoe UI",12,"bold"),bg=self.WHITE,fg=self.DARK).pack(anchor="w",padx=14,pady=(10,2))
        bf=tk.Frame(c,bg=self.WHITE);bf.pack(padx=14,pady=(4,6))
        tk.Button(bf,text="Verificar Sistema",command=self.run_checks,bg=self.BLUE,fg="white",font=("Segoe UI",9,"bold"),width=20,bd=0,cursor="hand2").pack(side="left",padx=(0,6))
        tk.Button(bf,text="Instalar Dependencias npm",command=self.install_deps,bg=self.GREEN,fg="white",font=("Segoe UI",9,"bold"),width=25,bd=0,cursor="hand2").pack(side="left")
        self.progress_label=tk.Label(c,text="",font=("Segoe UI",8),bg=self.WHITE,fg=self.GRAY);self.progress_label.pack(anchor="w",padx=14,pady=(0,2))
        self.progress_bar=ttk.Progressbar(c,mode="indeterminate",length=400);self.progress_bar.pack(padx=14,pady=(0,8),fill="x")
        self.verify_output=scrolledtext.ScrolledText(c,wrap="word",state="disabled",font=("Consolas",9),bg="#111827",fg="#d1d5db",height=14);self.verify_output.pack(fill="both",expand=True,padx=14,pady=(0,10))

    def vprint(self,text,color="#d1d5db"):
        try:
            self.verify_output.configure(state="normal");self.verify_output.insert(tk.END,text+"\n")
            self.verify_output.see(tk.END);self.verify_output.configure(state="disabled");self.root.update_idletasks()
        except:pass

    # ---- DETECCION ----
    def auto_detect(self):
        self.vprint("Detectando sistema...","#fbbf24")

        # 1. Verificar que las carpetas existen
        if not SERVER_DIR.is_dir():
            self.vprint(f"  [ERROR] Carpeta server NO encontrada en: {BASE_DIR}","#f87171")
            self.vprint(f"  El launcher debe estar en la RAIZ del proyecto.","#f87171")
            self.server_status_detail.configure(
                text=f"ERROR: No se encontro server/ en:\n{BASE_DIR}\n\n"
                     "El launcher debe estar en la carpeta raiz del proyecto,\n"
                     "junto a server/ y client/.", fg=self.RED)
            return

        # 2. Buscar instalador Node
        self.node_installer = find_node_installer()
        if self.node_installer:
            self.vprint(f"  [!] Instalador Node.js: {Path(self.node_installer).name}","#fbbf24")

        # 3. Detectar Node.js + npm
        np,nv,nmpath,nmver,err = find_node_detailed()
        self.node_path=np; self.node_version=nv; self.npm_path=nmpath; self.npm_version=nmver

        if np:
            self.vprint(f"  [OK] Node.js {nv}","#34d399")
            if nmver:
                self.vprint(f"  [OK] npm v{nmver}","#34d399")
            else:
                self.vprint(f"  [!] npm NO detectado junto a Node.js","#fbbf24")
                if nmpath:
                    self.vprint(f"       npm esta en: {nmpath} (pero no se pudo ejecutar)","#fbbf24")
                else:
                    self.vprint(f"       Buscando npm.cmd en: {Path(np).parent}","#fbbf24")
                    pd = Path(np).parent
                    if pd.is_dir():
                        items = list(pd.glob("npm*"))
                        if items:
                            self.vprint(f"       Archivos npm en esa carpeta: {', '.join(i.name for i in items[:6])}","#fbbf24")
                            self.vprint(f"       Esto es raro. Cierre y abra CMD como Administrador, ejecute:","#fbbf24")
                            self.vprint(f"       set PATH={pd};%PATH%","#fbbf24")
                        else:
                            self.vprint(f"       No hay archivos npm* en {pd}","#f87171")
                    self.vprint(f"       Reinstale Node.js marcando 'Add to PATH'.","#fbbf24")
        else:
            self.vprint(f"  [ERROR] {err}","#f87171")
            if self.node_installer:
                self.vprint(f"","#d1d5db")
                self.vprint(f"  >>> Presione 'Instalar Node.js' en la pestana Control <<<","#60a5fa")
                self.btn_install_node.pack(side="left",padx=(6,0))

        self._refresh_conn_info()

    # ---- VERIFICACION COMPLETA ----
    def run_checks(self):
        try:self.verify_output.configure(state="normal");self.verify_output.delete("1.0",tk.END);self.verify_output.configure(state="disabled")
        except:pass

        self.vprint("="*55,"#60a5fa");self.vprint("  VERIFICACION SGF v4.0","#60a5fa");self.vprint("="*55,"#60a5fa");self.vprint("")

        # Node + npm
        self.vprint("[1/5] Node.js + npm","#fbbf24")
        np,nv,nmpath,nmver,err=find_node_detailed()
        self.node_path=np;self.node_version=nv;self.npm_path=nmpath;self.npm_version=nmver
        self.node_installer=find_node_installer()

        if np:
            self.vprint(f"      Node.js: v{nv}","#34d399")
            if nmver: self.vprint(f"      npm:     v{nmver}","#34d399")
            else:
                self.vprint(f"      npm:     NO DETECTADO","#f87171")
                pd=Path(np).parent
                items=list(pd.glob("npm*"))
                if items: self.vprint(f"      Archivos: {', '.join(i.name for i in items[:5])}","#fbbf24")
                self.vprint(f"      Abra CMD como Admin y ejecute:","#fbbf24")
                self.vprint(f"      set PATH={pd};%PATH%","#fbbf24")
        else:
            self.vprint(f"      Node.js: NO INSTALADO","#f87171")
            if self.node_installer:
                self.vprint(f"      [!] Instalador: {Path(self.node_installer).name}","#fbbf24")

        # Archivos
        self.vprint("\n[2/5] Archivos Servidor","#fbbf24")
        ms=0
        if not SERVER_DIR.is_dir():
            self.vprint(f"      [ERROR] Carpeta server/ NO EXISTE en {BASE_DIR}","#f87171")
            self.vprint(f"      El launcher debe estar junto a server/ y client/","#f87171")
            ms=999
        else:
            server_files=["package.json","tsconfig.json",".env","src/index.ts"]
            for f in server_files:
                ok=(SERVER_DIR/f).exists()
                if not ok: ms+=1
                self.vprint(f"      [{'OK' if ok else 'FALTA'}] server/{f}","#34d399" if ok else "#f87171")

        self.vprint("\n[3/5] Archivos Cliente","#fbbf24")
        mc=0
        if not CLIENT_DIR.is_dir():
            self.vprint(f"      [ERROR] Carpeta client/ NO EXISTE","#f87171")
            mc=999
        else:
            client_files=["package.json","tsconfig.json","vite.config.ts","index.html"]
            for f in client_files:
                ok=(CLIENT_DIR/f).exists()
                if not ok: mc+=1
                self.vprint(f"      [{'OK' if ok else 'FALTA'}] client/{f}","#34d399" if ok else "#f87171")

        # Dependencias / frontend compilado
        self.vprint("\n[4/5] Dependencias","#fbbf24")
        sm=(SERVER_DIR/"node_modules").exists(); client_built=(CLIENT_DIR/"dist"/"index.html").exists()
        if sm: n=len(list((SERVER_DIR/"node_modules").iterdir()));self.vprint(f"      [OK] server/node_modules ({n} paquetes)","#34d399")
        else: self.vprint(f"      [FALTA] server/node_modules","#f87171")
        if client_built: self.vprint(f"      [OK] client/dist/index.html (frontend compilado)","#34d399")
        else: self.vprint(f"      [FALTA] client/dist/index.html","#f87171")

        # .env
        self.vprint("\n[5/5] Configuracion","#fbbf24")
        env=SERVER_DIR/".env"
        if env.exists():
            cfg=read_env()
            dbtype=cfg.get("db_type","").upper() or "AUTO"
            self.vprint(f"      [OK] HTTP:{cfg['http']} BD:{dbtype}","#34d399")
            self.vprint(f"      Oracle: {cfg['host']}:{cfg['port']}/{cfg['service']} (user={cfg['user']})","#34d399")
            self.vprint(f"      SQL Srv: {cfg['mssql_server']}:{cfg['mssql_port']}/{cfg['mssql_db']} (user={cfg['mssql_user']})","#34d399")
        else: self.vprint(f"      [FALTA] server/.env","#f87171")

        # Resumen
        self.vprint(f"\n{'='*55}","#60a5fa")
        issues=[]
        if not np: issues.append("Node.js no instalado")
        if ms>0 and ms<999: issues.append(f"Archivos en server/ faltantes")
        if mc>0 and mc<999: issues.append(f"Archivos en client/ faltantes")
        if ms>=999: issues.append("Carpeta server/ NO ENCONTRADA")
        if not sm: issues.append("npm install servidor pendiente")
        if not (CLIENT_DIR/"dist"/"index.html").exists(): issues.append("frontend compilado faltante")

        if not issues: self.vprint("  [OK] SISTEMA COMPLETO","#34d399");self.server_status_detail.configure(text="Listo para iniciar.",fg=self.GREEN)
        else: self.vprint(f"  [!] {' | '.join(issues)}","#fbbf24");self.server_status_detail.configure(text=" | ".join(issues),fg=self.RED)
        self.vprint("="*55,"#60a5fa")
        self._refresh_conn_info()

    # ---- INSTALAR DEPENDENCIAS ----
    def install_deps(self):
        global INSTALLING
        if INSTALLING: messagebox.showinfo("En progreso","Ya hay una instalacion en curso."); return

        if not find_node():
            messagebox.showerror("Sin Node.js","Node.js no instalado.\nInstale Node.js primero.")
            return

        INSTALLING=True
        try:self.verify_output.configure(state="normal");self.verify_output.delete("1.0",tk.END);self.verify_output.configure(state="disabled")
        except:pass

        self.vprint("="*55,"#60a5fa");self.vprint("  INSTALANDO DEPENDENCIAS npm","#60a5fa");self.vprint("="*55,"#60a5fa");self.vprint("")
        self.vprint("Si no hay internet, esto va a fallar.","#fbbf24")
        self.vprint("Use empaquetar-portable.bat en una PC con internet.","#fbbf24")
        self.vprint("")

        npm_cmd = self.npm_path or "npm"
        self.progress_bar.start(10)

        for name, cwd in [("SERVIDOR", SERVER_DIR), ("CLIENTE", CLIENT_DIR)]:
            self.vprint(f"--- {name} ---","#fbbf24")
            self.progress_label.configure(text=f"Instalando {name}...")
            if not (cwd/"package.json").exists():
                self.vprint(f"    [ERROR] No existe package.json","#f87171"); continue
            try:
                proc = subprocess.Popen(
                    [npm_cmd, "install", "--legacy-peer-deps", "--loglevel=verbose"],
                    cwd=str(cwd), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    text=True, encoding="utf-8", errors="replace", bufsize=1,
                    creationflags=subprocess.CREATE_NO_WINDOW if sys.platform=="win32" else 0)
                for line in iter(proc.stdout.readline, ""):
                    line = line.strip()
                    if line:
                        # Mostrar todo para que se vea el progreso real
                        self.vprint(f"    {line[:140]}", "#9ca3af")
                        self.root.update_idletasks()
                proc.wait()
                if proc.returncode == 0:
                    n = len(list((cwd/"node_modules").iterdir())) if (cwd/"node_modules").exists() else 0
                    self.vprint(f"    [OK] {n} paquetes instalados", "#34d399")
                else:
                    self.vprint(f"    [ERROR] Codigo {proc.returncode}", "#f87171")
                    self.vprint(f"    Si no hay internet, esto es normal.", "#fbbf24")
                    self.vprint(f"    Debe usar el modo OFFLINE con .zip", "#fbbf24")
            except Exception as e:
                self.vprint(f"    [ERROR] {e}", "#f87171")
            self.vprint("")

        self.progress_bar.stop()
        self.progress_label.configure(text="Instalacion completada.")
        self.vprint("="*55,"#60a5fa")
        INSTALLING = False
        self.run_checks()

    # ---- CONTROL DEL SERVIDOR ----
    def start_server(self):
        global PROCESS, LOG_LINES
        if PROCESS: messagebox.showinfo("Ya Iniciado","Servidor corriendo."); return
        if not find_node():
            if self.node_installer:
                if messagebox.askyesno("Sin Node.js","Instalar Node.js ahora?"): self._install_node()
            else: messagebox.showerror("Sin Node.js","Node.js no instalado.")
            return

        cfg=read_env(); port=int(cfg.get("http",3000))
        if check_port(port):
            if messagebox.askyesno("Puerto Ocupado",f"Puerto {port} en uso. Liberar?"):
                if kill_port(port): log(f"Puerto {port} liberado."); time.sleep(1)
                else: messagebox.showerror("Error",f"No se pudo liberar."); return
            else: return

        if not (SERVER_DIR/"node_modules").exists():
            if messagebox.askyesno("Sin dependencias","server\\node_modules no existe.\n\nSi no tiene internet, necesita los archivos .zip\n"
                                   "generados con empaquetar-portable.bat\n\nIntentar npm install de todas formas?"):
                self.install_deps()
                if not (SERVER_DIR/"node_modules").exists(): return
            else: return

        log("="*40); log("INICIANDO SGF v4.0")
        log(f"Puerto: {port} | Oracle: {cfg['host']}:{cfg['port']}/{cfg['service']}"); log("="*40)
        LOG_LINES=[]
        threading.Thread(target=run_server, args=(self.log_output,), daemon=True).start()
        self.root.after(2500, self._check_startup)
        self.btn_start.configure(state="disabled"); self.btn_stop.configure(state="normal"); self.btn_restart.configure(state="normal")

    def _check_startup(self):
        if PROCESS is None or PROCESS.poll() is not None:
            self.set_status(False)
            log("ERROR: Servidor no pudo iniciar.")
            self.server_status_detail.configure(text="ERROR: No pudo iniciar. Revise logs.", fg=self.RED); return
        cfg=read_env(); port=int(cfg.get("http",3000))
        if check_port(port):
            self.set_status(True)
            self.server_status_detail.configure(text=f"EN LINEA http://localhost:{port}\nOracle: {cfg['host']}:{cfg['port']}/{cfg['service']}", fg=self.GREEN)
        else: self.root.after(3000, self._check_startup)

    def stop_server(self):
        global PROCESS
        if not PROCESS: return
        log("Deteniendo...")
        try: PROCESS.terminate()
        except: pass
        try: PROCESS.wait(timeout=10)
        except subprocess.TimeoutExpired: PROCESS.kill(); PROCESS.wait()
        except: pass
        PROCESS=None; kill_port(int(read_env().get("http",3000)))
        log("SERVIDOR DETENIDO")
        self.set_status(False); self.server_status_detail.configure(text="Servidor detenido.", fg=self.GRAY)

    def restart_server(self):
        self.stop_server(); time.sleep(2); self.start_server()

    def set_status(self, running):
        if running:
            self.status_text.set("EN LINEA"); self.status_label.configure(fg="#34d399")
            self.status_dot.itemconfig(self.dot, fill="#34d399")
            self.btn_start.configure(state="disabled"); self.btn_stop.configure(state="normal"); self.btn_restart.configure(state="normal")
        else:
            self.status_text.set("DETENIDO"); self.status_label.configure(fg=self.GRAY)
            self.status_dot.itemconfig(self.dot, fill=self.GRAY)
            self.btn_start.configure(state="normal"); self.btn_stop.configure(state="disabled"); self.btn_restart.configure(state="disabled")

# ================================================================
def main():
    if "--server" in sys.argv:
        subprocess.run([find_node() or "node", "dist/index.js"], cwd=str(SERVER_DIR)); return
    root=tk.Tk()
    try: root.iconbitmap(str(BASE_DIR/"sgf.ico"))
    except: pass
    app=SGFLauncher(root)
    def on_close():
        global PROCESS, INSTALLING
        if INSTALLING:
            if messagebox.askyesno("Instalacion en Curso","Forzar cierre?"):
                if PROCESS:
                    try: PROCESS.terminate(); PROCESS.wait(timeout=5)
                    except: pass
                root.destroy()
        elif PROCESS:
            if messagebox.askyesno("Servidor Corriendo","Detener y cerrar?"):
                try: PROCESS.terminate(); PROCESS.wait(timeout=5)
                except: pass
            root.destroy()
        else: root.destroy()
    root.protocol("WM_DELETE_WINDOW", on_close); root.mainloop()

if __name__=="__main__": main()
