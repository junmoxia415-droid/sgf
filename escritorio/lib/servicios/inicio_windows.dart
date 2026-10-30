import 'dart:io';

typedef EjecutarComando = Future<ProcessResult> Function(String programa, List<String> argumentos);

/// Inicio por usuario al entrar en Windows. No equivale a un servicio que
/// arranca antes de que alguien inicie sesión.
class InicioWindows {
  InicioWindows({bool? windows, EjecutarComando? ejecutar, String? ejecutable,
      Future<String> Function()? carpetaInicio})
      : _windows = windows ?? Platform.isWindows,
        _ejecutar = ejecutar ?? ((programa, argumentos) => Process.run(programa, argumentos)),
        _ejecutable = ejecutable ?? Platform.resolvedExecutable,
        _carpetaInicioPersonalizada = carpetaInicio;

  static const clave = r'HKCU\Software\Microsoft\Windows\CurrentVersion\Run';
  static const nombre = 'SGF Escritorio';
  final bool _windows;
  final EjecutarComando _ejecutar;
  final String _ejecutable;
  final Future<String> Function()? _carpetaInicioPersonalizada;

  bool get disponible => _windows;

  Future<File> _accesoInicio() async {
    String carpeta;
    if (_carpetaInicioPersonalizada != null) {
      carpeta = await _carpetaInicioPersonalizada();
    } else {
      // Windows conoce la ubicación real, incluso con la carpeta redirigida.
      final r = await _ejecutar('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        "[Environment]::GetFolderPath('Startup')",
      ]);
      carpeta = '${r.stdout}'.trim();
      if (r.exitCode != 0 || carpeta.isEmpty) {
        throw StateError('No se pudo localizar la carpeta Inicio de Windows.');
      }
    }
    return File('$carpeta${Platform.pathSeparator}$nombre.lnk');
  }

  Future<bool> _registroExiste() async {
    final r = await _ejecutar('reg.exe', ['query', clave, '/v', nombre]);
    if (r.exitCode == 0) return true;
    final mensaje = '${r.stderr}'.toLowerCase();
    if (mensaje.contains('denied') || mensaje.contains('denegado')) {
      throw StateError('Windows denegó el acceso a la configuración de inicio.');
    }
    return false;
  }

  Future<bool> activo() async {
    if (!_windows) return false;
    final registro = await _registroExiste();
    final acceso = await _accesoInicio();
    return registro || await acceso.exists();
  }

  /// Solo cambia la entrada del usuario actual y el acceso SGF creado por el
  /// instalador. No altera otras aplicaciones ni crea un servicio de sistema.
  Future<void> establecer(bool habilitar) async {
    if (!_windows) throw UnsupportedError('Esta opción solo está disponible en Windows.');
    final acceso = await _accesoInicio();
    if (habilitar) {
      if (!_ejecutable.toLowerCase().endsWith('sgf_escritorio.exe')) {
        throw StateError('Esta opción requiere la aplicación SGF instalada en Windows.');
      }
      final r = await _ejecutar('reg.exe', ['add', clave, '/v', nombre, '/t', 'REG_SZ', '/d', '"$_ejecutable"', '/f']);
      if (r.exitCode != 0) throw StateError('Windows no pudo activar el inicio automático.');
      // El instalador anterior creaba este acceso: quitarlo evita dos ventanas.
      if (await acceso.exists()) await acceso.delete();
      if (!await _registroExiste()) throw StateError('No se pudo verificar el inicio automático.');
    } else {
      if (await _registroExiste()) {
        final r = await _ejecutar('reg.exe', ['delete', clave, '/v', nombre, '/f']);
        if (r.exitCode != 0) throw StateError('Windows no pudo desactivar el inicio automático.');
      }
      if (await acceso.exists()) await acceso.delete();
      if (await activo()) throw StateError('El inicio automático sigue activo; revise Windows.');
    }
  }
}
