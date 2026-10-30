import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';

import 'package:flutter/foundation.dart';

import 'ajustes.dart';
import 'api.dart';
import 'canal_local_seguro.dart';

/// Estado del servidor embebido.
enum EstadoServidor { detenido, arrancando, enMarcha, deteniendo, fallo }

/// Arranca, vigila y detiene el servidor SGF (Node.js) que viaja dentro de la
/// propia aplicacion.
///
/// Reglas de oro:
///  - No hace falta instalar Node en el equipo: se usa el `node.exe` incluido.
///  - El servidor acepta conexiones IPv4 de redes privadas, con inicio de sesión.
///  - La base de datos vive en una carpeta de usuario escribible.
///  - Si el proceso se cae, se avisa con el mensaje de error y se puede reiniciar
///    sin cerrar la aplicacion.
class ControladorServidor extends ChangeNotifier {
  ControladorServidor({required this.ajustes, required this.api, this.usarCanalSeguro = true}) {
    api.invalidarCanalLocal();
    api.exigirCanalSeguro = usarCanalSeguro;
  }

  final Ajustes ajustes;
  final Api api;
  /// La opción no segura existe solo para dobles aislados de prueba.
  final bool usarCanalSeguro;

  Process? _proceso;
  int _generacionProceso = 0;
  EstadoServidor estado = EstadoServidor.detenido;
  String? ultimoError;
  bool avisoCierre = false;
  String? tokenConsola;
  VoidCallback? abrirGuia;
  VoidCallback? iniciarSesion;
  final List<String> registro = [];
  final _aleatorio = Random.secure();

  bool get enMarcha => estado == EstadoServidor.enMarcha;

  /// Direcciones privadas que pueden usarse en otros equipos. Algunas pueden
  /// pertenecer a VPN u otros adaptadores: el usuario elige la de su red.
  Future<List<String>> enlacesRed() async {
    final interfaces = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false);
    final direcciones = <String>{};
    for (final interfaz in interfaces) {
      for (final direccion in interfaz.addresses) {
        final p = direccion.address.split('.').map(int.tryParse).toList();
        if (p.length != 4 || p.any((n) => n == null)) continue;
        if (p[0] == 10 || (p[0] == 192 && p[1] == 168) ||
            (p[0] == 172 && p[1]! >= 16 && p[1]! <= 31) || (p[0] == 169 && p[1] == 254)) {
          direcciones.add('http://${direccion.address}:${ajustes.puerto}');
        }
      }
    }
    return direcciones.toList()..sort();
  }


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

  String get ejecutableNode {
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

  /// Contraseña inicial legible pero impredecible: 4 grupos de 4 caracteres
  /// (sin los que se confunden al copiar: 0/O, 1/l/I). Se genera en cada
  /// instalación, así que no hay ninguna contraseña "de fábrica" común.
  String _generarClaveInicial() {
    const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    final grupos = <String>[];
    for (var g = 0; g < 4; g++) {
      var grupo = '';
      for (var i = 0; i < 4; i++) {
        grupo += alfabeto[_aleatorio.nextInt(alfabeto.length)];
      }
      grupos.add(grupo);
    }
    return grupos.join('-');
  }

  /// Deja la contraseña inicial a la vista del usuario, en el escritorio, y la
  /// genera una sola vez. Así no se pierde y no hay que adivinarla.
  Future<void> _guardarClaveDeFabricacion(String clave) async {
    try {
      final escritorio = await _carpetaEscritorio();
      if (escritorio == null) return;
      final nota = File('${escritorio.path}${Platform.pathSeparator}CONTRASENA INICIAL DE SGF.txt');
      if (await nota.exists()) return;
      await nota.writeAsString(
        'SGF Escritorio\n'
        '================\n\n'
        'Clave local de recuperación de configuración: $clave\n\n'
        'Esta NO es una cuenta de usuario ni sirve para iniciar sesión.\n'
        'La cuenta de administrador y su contraseña se crean en el asistente.\n'
        'Guarde este archivo en un lugar seguro y no comparta esta clave.\n',
      );
      anotar('Contraseña inicial escrita en: ${nota.path}');
    } catch (_) {
      // Si no se puede escribir en el escritorio, no pasa nada: la clave sigue
      // en el archivo de configuración del equipo.
    }
  }

  Future<Directory?> _carpetaEscritorio() async {
    try {
      if (Platform.isWindows) {
        final perfil = Platform.environment['USERPROFILE'];
        if (perfil != null) return Directory('$perfil\\Desktop');
        final publico = Platform.environment['PUBLIC'];
        if (publico != null) return Directory('$publico\\Desktop');
        return null;
      }
      final casa = Platform.environment['HOME'];
      if (casa == null) return null;
      final candidatos = ['$casa/Desktop', '$casa/Escritorio', casa];
      for (final c in candidatos) {
        if (await Directory(c).exists()) return Directory(c);
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  Future<void> _asegurarEnv() async {
    await carpetaDatos.create(recursive: true);
    if (!await archivoEnv.exists()) {
      final secreto = _generarToken();
      // La contraseña del administrador se genera al azar en cada instalación y
      // se guarda SOLO en este equipo (.env + acceso directo en el escritorio).
      // Antes era una contraseña fija escrita en el código, igual en todas las
      // instalaciones: cualquiera que leyera el repositorio podía entrar.
      final claveInicial = _generarClaveInicial();
      await archivoEnv.writeAsString('''
# Configuracion del servidor SGF (generada por la aplicacion)
DB_TYPE=${ajustes.modoBd}
PORT=${ajustes.puerto}
HOST=127.0.0.1
JWT_SECRET=$secreto
JWT_EXPIRES_IN=8h
DEFAULT_ADMIN_USER=admin
DEFAULT_ADMIN_PASSWORD=$claveInicial
MAX_FILE_SIZE_MB=25
LOGIN_RATE_PER_MIN=10
LOGIN_RATE_PER_15MIN=40
''');
      await _guardarClaveDeFabricacion(claveInicial);
      anotar('Creada la configuración inicial (${archivoEnv.path}).');
      anotar('Clave local de recuperación guardada en el escritorio. La cuenta se crea en el asistente.');
    }
  }

  /// Arranca el servidor. Devuelve true si ha quedado en marcha.
  Future<bool> arrancar({bool esperar = true}) async {
    if (estado == EstadoServidor.arrancando || estado == EstadoServidor.enMarcha) return enMarcha;

    // Reservar el arranque antes de cualquier espera para impedir dos inicios
    // simultáneos sobre la misma base de datos.
    estado = EstadoServidor.arrancando;
    ultimoError = null;
    notifyListeners();
    try {
      await _asegurarEnv();
    } catch (e) {
      estado = EstadoServidor.fallo;
      ultimoError = 'No se pudo preparar la configuración local: $e';
      anotar(ultimoError!);
      return false;
    }
    anotar('Iniciando el servidor en el puerto ${ajustes.puerto}…');

    final principal = '${carpetaServidor.path}${Platform.pathSeparator}dist${Platform.pathSeparator}index.js';
    if (!File(principal).existsSync()) {
      estado = EstadoServidor.fallo;
      ultimoError = 'No se encuentra el servidor en ${carpetaServidor.path}. Reinstale la aplicación.';
      anotar(ultimoError!);
      return false;
    }

    // No reutilizar ni detener un proceso ajeno: puede ser otra instancia de
    // SGF o una aplicación distinta. Compartir la base sería inseguro.
    try {
      final socket = await Socket.connect('127.0.0.1', ajustes.puerto,
          timeout: const Duration(seconds: 1));
      socket.destroy();
      estado = EstadoServidor.fallo;
      ultimoError = 'El puerto ${ajustes.puerto} ya está ocupado. Cierre otra ventana de SGF y vuelva a intentar. Si continúa, reinicie Windows. Cambie el puerto solo si lo usa otro programa, no otra instancia de SGF. No se han borrado sus datos.';
      anotar(ultimoError!);
      return false;
    } on SocketException {
      // Puerto libre.
    } on TimeoutException {
      // El arranque informará del problema si no puede enlazar el puerto.
    }

    tokenConsola = _generarToken();
    api.invalidarCanalLocal();
    api.base = ajustes.urlBaseLocal;
    // En modo seguro no se envía el token hasta verificar la huella recibida
    // por la tubería de este proceso. Nunca se confía solo en un ping público.
    if (!usarCanalSeguro) api.tokenConsola = tokenConsola;

    try {
      final generacion = ++_generacionProceso;
      _proceso = await Process.start(
        ejecutableNode,
        [principal],
        workingDirectory: carpetaServidor.path,
        environment: {
          'NODE_ENV': 'production',
          'SGF_DATA_DIR': carpetaDatos.path,
          'SGF_ENV_FILE': archivoEnv.path,
          'SGF_CONSOLE_TOKEN': tokenConsola!,
          if (usarCanalSeguro) 'SGF_CONTROL_TLS': '1',
          'PORT': '${ajustes.puerto}',
          'HOST': '0.0.0.0',
        },
        runInShell: false,
      );

      final iniciado = _proceso!;
      final tokenDelProceso = tokenConsola!;
      iniciado.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((linea) {
        final t = linea.trim();
        // La tubería puede entregar las últimas líneas después del evento de
        // salida. No aceptar mensajes de un proceso anterior si ya hay otro.
        if (generacion != _generacionProceso || (_proceso != iniciado && !(_proceso == null && estado == EstadoServidor.fallo))) return;
        if (t == '[SGF_PUERTO_OCUPADO]') {
          ultimoError = 'El puerto ${ajustes.puerto} ya está ocupado por otra aplicación. SGF no la ha detenido ni ha cambiado el cortafuegos. Revise el conflicto antes de volver a iniciar.';
          anotar(ultimoError!);
          notifyListeners();
          return;
        }
        if (t.startsWith('[SGF_DB_ERROR] ')) {
          final detalle = t.substring('[SGF_DB_ERROR] '.length);
          final motor = detalle.endsWith(':oracle') ? 'Oracle' : detalle.endsWith(':mssql') ? 'SQL Server' : null;
          ultimoError = motor == null
              ? 'La configuración de base de datos es ambigua o inválida. Seleccione DB_TYPE en la configuración local y vuelva a iniciar. No se ha cambiado ni borrado ninguna base.'
              : 'No se pudo conectar a $motor. SGF no cambió a SQLite ni abrió otra base. Revise la conexión y vuelva a iniciar; no se han borrado los datos.';
          anotar(ultimoError!);
          notifyListeners();
          return;
        }
        if (usarCanalSeguro && t.startsWith('[SGF_TLS] ')) {
          final canal = CanalLocalSeguro.desdeAnuncio(t, tokenDelProceso);
          if (canal == null) {
            anotar('Se rechazó un anuncio local no autenticado.');
          } else if (estado == EstadoServidor.arrancando) {
            api.configurarCanalLocal(canal);
            api.tokenConsola = tokenDelProceso;
            anotar('Canal local cifrado y autenticado preparado.');
          }
          return;
        }
        if (t.isNotEmpty) anotar(t);
      });
      iniciado.stderr.transform(utf8.decoder).transform(const LineSplitter()).listen((linea) {
        if (_proceso != iniciado) return;
        final t = linea.trim();
        if (t.isNotEmpty) anotar('⚠ $t');
      });

      unawaited(iniciado.exitCode.then((codigo) {
        if (_proceso != iniciado) return;
        api.invalidarCanalLocal();
        tokenConsola = null;
        if (estado != EstadoServidor.deteniendo) {
          estado = EstadoServidor.fallo;
          ultimoError ??= 'El servidor se ha detenido inesperadamente (código $codigo).';
          anotar(ultimoError!);
        } else {
          estado = EstadoServidor.detenido;
        }
        _proceso = null;
        notifyListeners();
      }));

      // En modo seguro nunca declarar éxito antes de autenticar el canal.
      if (esperar || usarCanalSeguro) {
        final arriba = await _esperarRespuesta();
        if (!arriba) {
          await detener();
          estado = EstadoServidor.fallo;
          ultimoError ??= 'El servidor no respondió correctamente. Revise el puerto y el registro en «Servidor».';
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
      if (_proceso == null || estado == EstadoServidor.fallo) return false;
      try {
        final r = await api.panelPing();
        if (r['servicio'] == 'sgf-consola' && r['pid'] == _proceso?.pid) {
          // Ping es público: comprobar también el token en una ruta protegida.
          await api.panelEstadoConsola();
          if (_proceso != null && r['pid'] == _proceso!.pid) return true;
        }
      } catch (_) {
        // todavia arrancando
      }
    }
    return false;
  }

  /// Detiene el servidor con orden (SIGTERM), para que guarde la base de datos.
  Future<void> detener() async {
    if (_proceso == null) {
      api.invalidarCanalLocal();
      tokenConsola = null;
      estado = EstadoServidor.detenido;
      notifyListeners();
      return;
    }
    avisoCierre = false;
    estado = EstadoServidor.deteniendo;
    notifyListeners();
    anotar('Deteniendo el servidor…');
    final proceso = _proceso!;
    try {
      // En Windows taskkill /F saltaba el guardado de SQLite. Pedimos primero
      // un cierre ordenado por la consola local, y esperamos al proceso propio.
      await api.apagarServidor();
      final salida = await proceso.exitCode.timeout(const Duration(seconds: 12), onTimeout: () => -999);
      if (salida == -999) throw TimeoutException('El servidor no terminó el cierre ordenado.');
      if (salida != 0) {
        avisoCierre = true;
        ultimoError = 'El servidor informó un error al cerrar (código $salida). Es posible que los últimos cambios no se hayan guardado; revise el registro, el espacio y los permisos antes de continuar.';
        anotar(ultimoError!);
      }
    } catch (e) {
      avisoCierre = true;
      ultimoError = 'No se confirmó el guardado al cerrar. Los últimos cambios podrían no haberse guardado; revise el registro y las copias de seguridad.';
      anotar('No se pudo cerrar con orden: $e. Se intentará detener el proceso.');
      try {
        if (Platform.isWindows) {
          await Process.run('taskkill', ['/PID', '${proceso.pid}', '/T', '/F']);
        } else {
          proceso.kill(ProcessSignal.sigterm);
          await proceso.exitCode.timeout(const Duration(seconds: 10), onTimeout: () {
            proceso.kill(ProcessSignal.sigkill);
            return -1;
          });
        }
      } catch (error) { anotar('Aviso al detener: $error'); }
    }
    _proceso = null;
    api.invalidarCanalLocal();
    tokenConsola = null;
    estado = EstadoServidor.detenido;
    anotar('Servidor detenido.');
    notifyListeners();
  }

  Future<void> reiniciar() async {
    if (estado == EstadoServidor.arrancando || estado == EstadoServidor.deteniendo) {
      anotar('Espere a que termine el inicio o cierre antes de reiniciar.');
      return;
    }
    await detener();
    await Future.delayed(const Duration(milliseconds: 600));
    await arrancar();
  }

  /// No se adopta un servidor anterior sin su token: evita confundir un ping
  /// público con el control real de otro proceso.
  Future<void> comprobarSiYaEstaArriba() async {
    api.invalidarCanalLocal();
    api.base = ajustes.urlBaseLocal;
    estado = EstadoServidor.detenido;
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
