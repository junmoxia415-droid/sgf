import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import 'ajustes.dart';
import 'api.dart';

/// Estado del servidor embebido.
enum EstadoServidor { detenido, arrancando, enMarcha, deteniendo, fallo }

/// Arranca, vigila y detiene el servidor SGF (Node.js) que viaja dentro de la
/// propia aplicacion.
///
/// Reglas de oro:
///  - No hace falta instalar Node en el equipo: se usa el `node.exe` incluido.
///  - El servidor escucha SOLO en 127.0.0.1 (nadie de la red puede entrar).
///  - La base de datos vive en una carpeta de usuario escribible.
///  - Si el proceso se cae, se avisa con el mensaje de error y se puede reiniciar
///    sin cerrar la aplicacion.
class ControladorServidor extends ChangeNotifier {
  ControladorServidor({required this.ajustes, required this.api});

  final Ajustes ajustes;
  final Api api;

  Process? _proceso;
  EstadoServidor estado = EstadoServidor.detenido;
  String? ultimoError;
  String? tokenConsola;
  final List<String> registro = [];
  final _aleatorio = Random.secure();

  bool get enMarcha => estado == EstadoServidor.enMarcha;

  /// Carpeta donde se instala todo: junto al .exe (instalador) o la carpeta del
  /// proyecto (desarrollo). Se sube por el arbol buscando `servidor/dist/index.js`.
  Directory get carpetaAplicacion {
    var dir = File(Platform.resolvedExecutable).parent;
    for (var i = 0; i < 6; i++) {
      if (File('${dir.path}${Platform.pathSeparator}servidor${Platform.pathSeparator}dist${Platform.pathSeparator}index.js').existsSync()) {
        return dir;
      }
      final padre = dir.parent;
      if (padre.path == dir.path) break;
      dir = padre;
    }
    return File(Platform.resolvedExecutable).parent;
  }

  Directory get carpetaServidor => Directory('${carpetaAplicacion.path}${Platform.pathSeparator}servidor');
  Directory get carpetaDatos =>
      Directory('${Ajustes.carpeta.path}${Platform.pathSeparator}datos');
  File get archivoEnv => File('${carpetaDatos.path}${Platform.pathSeparator}.env');

  String get _ejecutableNode {
    final nombre = Platform.isWindows ? 'node.exe' : 'node';
    final incluido = '${carpetaServidor.path}${Platform.pathSeparator}runtime${Platform.pathSeparator}$nombre';
    if (File(incluido).existsSync()) return incluido;
    return nombre; // desarrollo: el node del sistema
  }

  bool get nodeDisponible {
    if (Platform.isWindows) {
      return File('${carpetaServidor.path}${Platform.pathSeparator}runtime${Platform.pathSeparator}node.exe').existsSync();
    }
    return true;
  }

  void anotar(String texto) {
    final hora = DateTime.now().toIso8601String().substring(11, 19);
    registro.insert(0, '[$hora] $texto');
    if (registro.length > 300) registro.removeLast();
    notifyListeners();
  }

  String _generarToken() {
    final bytes = List<int>.generate(32, (_) => _aleatorio.nextInt(256));
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  Future<void> _asegurarEnv() async {
    await carpetaDatos.create(recursive: true);
    if (!await archivoEnv.exists()) {
      final secreto = _generarToken();
      await archivoEnv.writeAsString('''
# Configuracion del servidor SGF (generada por la aplicacion)
DB_TYPE=${ajustes.modoBd}
PORT=${ajustes.puerto}
HOST=127.0.0.1
JWT_SECRET=$secreto
JWT_EXPIRES_IN=8h
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASSWORD=Admin123!
MAX_FILE_SIZE_MB=25
LOGIN_RATE_PER_MIN=60
LOGIN_RATE_PER_15MIN=300
''');
      anotar('Creada la configuración inicial (${archivoEnv.path}).');
    }
  }

  /// Arranca el servidor. Devuelve true si ha quedado en marcha.
  Future<bool> arrancar({bool esperar = true}) async {
    if (estado == EstadoServidor.arrancando || estado == EstadoServidor.enMarcha) return enMarcha;

    await _asegurarEnv();
    estado = EstadoServidor.arrancando;
    ultimoError = null;
    notifyListeners();
    anotar('Iniciando el servidor en el puerto ${ajustes.puerto}…');

    final principal = '${carpetaServidor.path}${Platform.pathSeparator}dist${Platform.pathSeparator}index.js';
    if (!File(principal).existsSync()) {
      estado = EstadoServidor.fallo;
      ultimoError = 'No se encuentra el servidor en ${carpetaServidor.path}. Reinstale la aplicación.';
      anotar(ultimoError!);
      return false;
    }

    tokenConsola = _generarToken();
    api
      ..base = ajustes.urlBaseLocal
      ..tokenConsola = tokenConsola;

    try {
      _proceso = await Process.start(
        _ejecutableNode,
        [principal],
        workingDirectory: carpetaServidor.path,
        environment: {
          'NODE_ENV': 'production',
          'SGF_DATA_DIR': carpetaDatos.path,
          'SGF_ENV_FILE': archivoEnv.path,
          'SGF_CONSOLE_TOKEN': tokenConsola!,
          'PORT': '${ajustes.puerto}',
          'HOST': '127.0.0.1',
        },
        runInShell: false,
      );

      _proceso!.stdout.transform(utf8.decoder).listen((linea) {
        final t = linea.trim();
        if (t.isNotEmpty) anotar(t);
      });
      _proceso!.stderr.transform(utf8.decoder).listen((linea) {
        final t = linea.trim();
        if (t.isNotEmpty) anotar('⚠ $t');
      });

      unawaited(_proceso!.exitCode.then((codigo) {
        if (estado != EstadoServidor.deteniendo) {
          estado = EstadoServidor.fallo;
          ultimoError = 'El servidor se ha detenido inesperadamente (código $codigo).';
          anotar(ultimoError!);
        } else {
          estado = EstadoServidor.detenido;
        }
        _proceso = null;
        notifyListeners();
      }));

      if (esperar) {
        final arriba = await _esperarRespuesta();
        if (!arriba) {
          estado = EstadoServidor.fallo;
          ultimoError ??= 'El servidor no respondió en 25 segundos. Revise el registro.';
          anotar(ultimoError!);
          return false;
        }
      }

      estado = EstadoServidor.enMarcha;
      anotar('Servidor en marcha: ${ajustes.urlBaseLocal}');
      notifyListeners();
      return true;
    } catch (e) {
      estado = EstadoServidor.fallo;
      ultimoError = 'No se pudo iniciar el servidor: $e';
      anotar(ultimoError!);
      return false;
    }
  }

  Future<bool> _esperarRespuesta() async {
    for (var i = 0; i < 50; i++) {
      await Future.delayed(const Duration(milliseconds: 500));
      try {
        final r = await api.panelPing();
        if (r['servicio'] == 'sgf-consola') return true;
      } catch (_) {
        // todavia arrancando
      }
    }
    return false;
  }

  /// Detiene el servidor con orden (SIGTERM), para que guarde la base de datos.
  Future<void> detener() async {
    if (_proceso == null) {
      estado = EstadoServidor.detenido;
      notifyListeners();
      return;
    }
    estado = EstadoServidor.deteniendo;
    notifyListeners();
    anotar('Deteniendo el servidor…');
    try {
      if (Platform.isWindows) {
        // En Windows no hay SIGTERM: se cierra el arbol de procesos.
        await Process.run('taskkill', ['/PID', '${_proceso!.pid}', '/T', '/F']);
      } else {
        _proceso!.kill(ProcessSignal.sigterm);
        await _proceso!.exitCode.timeout(const Duration(seconds: 10), onTimeout: () {
          _proceso!.kill(ProcessSignal.sigkill);
          return -1;
        });
      }
    } catch (e) {
      anotar('Aviso al detener: $e');
    }
    _proceso = null;
    estado = EstadoServidor.detenido;
    anotar('Servidor detenido.');
    notifyListeners();
  }

  Future<void> reiniciar() async {
    await detener();
    await Future.delayed(const Duration(milliseconds: 600));
    await arrancar();
  }

  /// Si el servidor ya estaba arrancado de antes (por ejemplo tras reiniciar la
  /// aplicacion), se reutiliza en lugar de abrir un segundo proceso.
  Future<void> comprobarSiYaEstaArriba() async {
    api.base = ajustes.urlBaseLocal;
    try {
      await api.panelPing();
      estado = EstadoServidor.enMarcha;
      anotar('Se encontró un servidor ya en marcha en ${ajustes.urlBaseLocal}.');
    } catch (_) {
      estado = EstadoServidor.detenido;
    }
    notifyListeners();
  }

  Future<bool> esPrimeraVez() async {
    try {
      final datos = await api.panelBienvenida();
      return datos['primeraVez'] == true;
    } catch (_) {
      return false;
    }
  }

  @override
  void dispose() {
    super.dispose();
  }
}
