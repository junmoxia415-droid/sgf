using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;

// Envoltorio experimental de la VM; NO instalar en el equipo del usuario.
sealed class ServicioEnsayoSgf : ServiceBase {
    Process hijo;
    public ServicioEnsayoSgf() { ServiceName="SGFLabSgf"; CanStop=true; }
    protected override void OnStart(string[] args) {
        string dir=AppDomain.CurrentDomain.BaseDirectory;
        var p=new ProcessStartInfo(Path.Combine(dir,"node.exe"),"--no-warnings lab-sgf.mjs");
        p.WorkingDirectory=dir; p.UseShellExecute=false; p.CreateNoWindow=true;
        p.RedirectStandardInput=true;
        hijo=Process.Start(p);
        if (hijo==null) throw new Exception("No se pudo arrancar el proceso de laboratorio");
    }
    protected override void OnStop() {
        if (hijo!=null && !hijo.HasExited) {
            try {hijo.StandardInput.WriteLine("STOP");hijo.StandardInput.Flush();} catch {}
            if (!hijo.WaitForExit(20000)) {hijo.Kill();hijo.WaitForExit(10000);}
        }
    }
    static void Main() {Run(new ServicioEnsayoSgf());}
}
