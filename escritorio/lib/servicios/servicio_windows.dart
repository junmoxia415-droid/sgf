import 'dart:io';

/// Gestiona únicamente SGFServidor, con confirmación y UAC por cada cambio.
/// El script verifica la identidad del servicio y nunca modifica firewall o CA.
class ServicioWindows {
  ServicioWindows({required this.aplicacion, required this.datos, this.puerto = 443, bool? windows}) : windows = windows ?? Platform.isWindows;
  final String aplicacion;
  final String datos;
  final int puerto;
  final bool windows;

  Future<void> ejecutar(String accion) async {
    if (!windows) throw UnsupportedError('El inicio anterior a la sesión solo está disponible en Windows.');
    if (!{'instalar', 'iniciar', 'detener', 'desactivar'}.contains(accion)) throw StateError('Acción de servicio inválida.');
    final script = File('$aplicacion${Platform.pathSeparator}servicio${Platform.pathSeparator}gestionar.ps1');
    if (!await script.exists()) throw StateError('Falta el gestor del servicio. Reinstale SGF desde un paquete completo.');
    final usuario = await Process.run('whoami.exe', ['/user', '/fo', 'csv', '/nh']);
    final sid = RegExp(r'S-1-5-(?:\d+-)*\d+', caseSensitive: false).firstMatch(usuario.stdout.toString())?.group(0);
    if (usuario.exitCode != 0 || sid == null) throw StateError('No se pudo identificar el usuario de Windows.');
    // Los valores se pasan como variables de entorno y no se interpolan en un
    // comando de PowerShell. El administrador verá la solicitud normal de UAC.
    const comando = r'''
try {
  $args = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',('"'+$env:SGF_SERVICE_SCRIPT+'"'))
  $p = Start-Process -FilePath 'powershell.exe' -Verb RunAs -Wait -PassThru -ArgumentList $args
  exit $p.ExitCode
} catch { exit 1 }
''';
    final resultado = await Process.run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', comando],
      environment: {
        'SGF_SERVICE_SCRIPT': script.path,
        'SGF_SERVICE_ACTION': accion,
        'SGF_SERVICE_SOURCE': aplicacion,
        'SGF_SERVICE_DATA': datos,
        'SGF_SERVICE_USER_SID': sid,
        'SGF_SERVICE_PORT': '$puerto',
      }).timeout(const Duration(seconds: 150));
    if (resultado.exitCode != 0) {
      throw StateError('Windows no completó la operación o se canceló el permiso. No se modificaron datos existentes; revise el servicio, el puerto y los permisos.');
    }
  }
}
