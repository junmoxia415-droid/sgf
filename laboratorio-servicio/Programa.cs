using System;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;

// Laboratorio aislado: no es el servicio de producción ni arranca SGF.
sealed class PruebaServicio : ServiceBase {
    Process hijo;
    public PruebaServicio() { ServiceName="SGFLabVirtual"; CanStop=true; }
    protected override void OnStart(string[] args) {
        string dir=AppDomain.CurrentDomain.BaseDirectory;
        var p=new ProcessStartInfo(Path.Combine(dir,"node.exe"),"--no-warnings lab.mjs");
        p.WorkingDirectory=dir; p.UseShellExecute=false; p.CreateNoWindow=true;
        hijo=Process.Start(p);
        if (hijo==null) throw new Exception("No se pudo arrancar el proceso de laboratorio");
    }
    protected override void OnStop() {
        if (hijo!=null && !hijo.HasExited) {hijo.Kill(); hijo.WaitForExit(10000);}
    }
    static void Main() {Run(new PruebaServicio());}
}
