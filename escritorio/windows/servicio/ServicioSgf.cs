using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;

// Proceso de control de servicio. Node y sus archivos se instalan en una
// carpeta protegida de escritura; la cuenta virtual no es SYSTEM.
sealed class ServicioSgf : ServiceBase {
    private Process supervisor;
    private volatile bool deteniendo;
    public ServicioSgf() {
        ServiceName = "SGFServidor";
        CanStop = true;
        CanShutdown = true;
        AutoLog = true;
    }
    protected override void OnStart(string[] args) {
        string raiz = AppDomain.CurrentDomain.BaseDirectory;
        string node = Path.Combine(raiz, "servidor", "runtime", "node.exe");
        string script = Path.Combine(raiz, "servidor", "dist", "scripts", "supervisor-servicio.js");
        string config = Path.Combine(raiz, "config-servicio.json");
        if (!File.Exists(node) || !File.Exists(script) || !File.Exists(config)) throw new InvalidOperationException("Faltan archivos protegidos del servicio.");
        var p = new ProcessStartInfo(node, "\"" + script + "\"");
        p.WorkingDirectory = Path.Combine(raiz, "servidor");
        p.EnvironmentVariables["SGF_SERVICIO_CONFIG"] = config;
        p.UseShellExecute = false;
        p.CreateNoWindow = true;
        p.RedirectStandardInput = true;
        supervisor = new Process();
        supervisor.StartInfo = p;
        supervisor.EnableRaisingEvents = true;
        supervisor.Exited += delegate {
            if (!deteniendo) Environment.Exit(supervisor.ExitCode == 0 ? 1 : supervisor.ExitCode);
        };
        if (!supervisor.Start()) throw new InvalidOperationException("No se pudo iniciar el supervisor de SGF.");
    }
    private void CerrarConOrden() {
        if (deteniendo) return;
        deteniendo = true;
        if (supervisor == null || supervisor.HasExited) return;
        try {
            supervisor.StandardInput.WriteLine("STOP");
            supervisor.StandardInput.Flush();
            if (supervisor.WaitForExit(25000) && supervisor.ExitCode == 0) return;
        } catch { /* El visor de eventos conserva el fallo del servicio. */ }
        // Último recurso exclusivamente sobre el árbol del propio servicio.
        // Si se llega aquí no se puede afirmar que SQLite se haya guardado.
        try {
            var p = Process.Start(new ProcessStartInfo("taskkill.exe", "/PID " + supervisor.Id + " /T /F") {
                UseShellExecute = false, CreateNoWindow = true
            });
            if (p != null) p.WaitForExit(5000);
        } catch { }
        throw new InvalidOperationException("No se confirmó el cierre ordenado de SGF; revise los datos y copias.");
    }
    protected override void OnStop() { CerrarConOrden(); }
    protected override void OnShutdown() { CerrarConOrden(); }
    static void Main() { Run(new ServicioSgf()); }
}
