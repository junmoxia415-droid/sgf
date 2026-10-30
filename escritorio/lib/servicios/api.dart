import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'canal_local_seguro.dart';

/// Cliente HTTP del servidor SGF.
///
/// En el escritorio, las llamadas al proceso propio usan un canal TLS local
/// con huella verificada y un token de consola efímero. El navegador de la LAN
/// sigue usando su propio canal HTTP y sus credenciales de sesión.
class Api {
  Api();

  String base = 'http://127.0.0.1:3000';
  String? tokenConsola;
  bool exigirCanalSeguro = false;
  CanalLocalSeguro? _canalLocal;

  void configurarCanalLocal(CanalLocalSeguro canal) { _canalLocal=canal; base=canal.base; }
  void invalidarCanalLocal() { _canalLocal=null; tokenConsola=null; }
  String? _tokenSesion;
  String? usuario;
  String? rol;
  Set<String> permisos = {};
  bool tienePermiso(String permiso) => esAdmin || permisos.contains(permiso);

  /// Se dispara cuando el servidor rechaza el token que teníamos: la cuenta se
  /// desactivó o se eliminó, un administrador cambió la contraseña o la sesión
  /// caducó. La ventana principal la usa para volver al inicio de sesión con un
  /// mensaje claro, en vez de dejar la pantalla en blanco o con un error seco.
  void Function(String motivo)? alCaducarSesion;

  /// Último motivo de caducidad, para poder mostrarlo una sola vez.
  String? motivoCaducidad;

  bool get conSesion => _tokenSesion != null;
  bool get esAdmin => rol == 'admin';

  Map<String, String> get _cabeceras => {
        'Content-Type': 'application/json',
        if (tokenConsola != null) 'x-sgf-console-token': tokenConsola!,
        if (_tokenSesion != null) 'Authorization': 'Bearer $_tokenSesion',
      };

  Future<Map<String, dynamic>> _pedir(
    String metodo,
    String ruta, {
    Object? cuerpo,
    Duration espera = const Duration(seconds: 30),
    bool sinSesion = false,
  }) async {
    final uri = Uri.parse('$base$ruta');
    final canal = _canalLocal;
    if (exigirCanalSeguro && canal == null) {
      throw ApiError('El servidor local todavía no está autenticado. Compruebe que SGF esté en marcha.', 0);
    }
    if (canal != null && (uri.scheme != 'https' || uri.host != '127.0.0.1' || uri.port != canal.puerto)) {
      throw ApiError('Se rechazó un destino distinto del servidor local autenticado.', 0);
    }
    late http.Response respuesta;
    final cliente = canal?.crearCliente() ?? http.Client();
    try {
      final solicitud = http.Request(metodo, uri)..headers.addAll(_cabeceras)..followRedirects = false;
      if (sinSesion) solicitud.headers.remove('Authorization');
      if (cuerpo != null) solicitud.body = jsonEncode(cuerpo);
      final streamed = await cliente.send(solicitud).timeout(espera);
      respuesta = await http.Response.fromStream(streamed);
    } on SocketException {
      throw ApiError('No se puede conectar con el servidor. Compruebe que está iniciado.', 0);
    } on HttpException catch (e) {
      throw ApiError('Error de red: ${e.message}', 0);
    } catch (e) {
      throw ApiError('No se pudo completar la operación: $e', 0);
    } finally {
      cliente.close();
    }

    Map<String, dynamic> json;
    try {
      json = jsonDecode(utf8.decode(respuesta.bodyBytes)) as Map<String, dynamic>;
    } catch (_) {
      throw ApiError(
        respuesta.statusCode >= 400
            ? 'El servidor respondió ${respuesta.statusCode}.'
            : 'El servidor devolvió una respuesta que no se entiende.',
        respuesta.statusCode,
      );
    }

    // Sesión rechazada por el servidor: se cierra en la aplicación y se avisa.
    // No se hace en el propio login (ruta /api/auth/login) porque allí un 401
    // significa "contraseña incorrecta", no "sesión caducada".
    if (respuesta.statusCode == 401 && !sinSesion && _tokenSesion != null && !ruta.startsWith('/api/auth/login')) {
      final motivo = (json['error'] ?? '').toString();
      _tokenSesion = null;
      final quien = usuario;
      usuario = null;
      rol = null;
      permisos = {};
      motivoCaducidad = motivo.isNotEmpty ? motivo : 'La sesión ha caducado.';
      final aviso = alCaducarSesion;
      if (aviso != null) {
        aviso(quien == null ? motivoCaducidad! : 'Sesión de «$quien» cerrada: $motivoCaducidad');
      }
    }

    if (respuesta.statusCode >= 400 || json['success'] == false) {
      throw ApiError(
        (json['error'] ?? json['message'] ?? 'Error ${respuesta.statusCode}').toString(),
        respuesta.statusCode,
        datos: json['data'],
      );
    }
    return json;
  }

  Future<Map<String, dynamic>> get(String ruta) => _pedir('GET', ruta);
  Future<Map<String, dynamic>> post(String ruta, [Object? cuerpo]) => _pedir('POST', ruta, cuerpo: cuerpo ?? {});
  Future<Map<String, dynamic>> put(String ruta, Object cuerpo) => _pedir('PUT', ruta, cuerpo: cuerpo);
  Future<Map<String, dynamic>> delete(String ruta) => _pedir('DELETE', ruta);

  // ── Sesión ────────────────────────────────────────────────────────────────
  Future<void> iniciarSesion(String usuario, String clave) async {
    final r = await post('/api/auth/login', {
      'username': usuario,
      'password': clave,
      'machineId': 'sgf-escritorio',
    });
    final datos = r['data'] as Map<String, dynamic>;
    _tokenSesion = datos['token'] as String?;
    this.usuario = (datos['user']?['username'] ?? usuario).toString();
    rol = (datos['user']?['role'] ?? 'usuario').toString();
    permisos = ((datos['user']?['permisos'] as List?) ?? const []).map((e) => e.toString()).toSet();
  }

  /// ¿Falta configurar la aplicación? (todavía no hay ninguna cuenta)
  Future<bool> requiereConfiguracionInicial() async {
    try {
      final r = await get('/api/setup/estado');
      return ((r['data'] as Map?)?['requiereConfiguracion'] ?? false) == true;
    } catch (_) {
      return false;
    }
  }

  /// Crea la cuenta de administrador la primera vez.
  ///
  /// Va por /api/setup/admin, que NO pide sesión: en una instalación nueva no hay
  /// ninguna cuenta con la que iniciarla (antes se llamaba a /api/users y el
  /// servidor respondía "Token no proporcionado").
  Future<Map<String, dynamic>> configurarPrimeraCuenta({
    required String usuario,
    required String nombre,
    required String clave,
  }) =>
      post('/api/setup/admin', {'username': usuario, 'name': nombre, 'password': clave});

  /// Deja la sesión lista con el token que devuelve la configuración inicial.
  Future<void> usarToken(String token, String usuario) async {
    _tokenSesion = token;
    this.usuario = usuario;
    rol = 'admin';
    permisos = {};
  }

  void limpiarSesionLocal() {
    _tokenSesion = null; usuario = null; rol = null; permisos = {}; motivoCaducidad = null;
  }

  Future<void> cerrarSesion() async {
    try {
      if (_tokenSesion != null) await post('/api/auth/logout');
    } catch (_) {
      // da igual: se borra la sesión local igualmente
    }
    _tokenSesion = null;
    usuario = null;
    rol = null;
    permisos = {};
    motivoCaducidad = null;
  }

  // ── Panel (solo este equipo) ──────────────────────────────────────────────
  Future<Map<String, dynamic>> panelEstado() async => (await get('/api/panel/estado'))['data'] as Map<String, dynamic>;
  /// Verificación del proceso hijo: el token local no debe mezclarse con una
  /// sesión de usuario, que puede ser normal o haber caducado.
  Future<Map<String, dynamic>> panelEstadoConsola() async =>
      (await _pedir('GET', '/api/panel/estado', sinSesion: true))['data'] as Map<String, dynamic>;
  Future<Map<String, dynamic>> panelBienvenida() async =>
      (await get('/api/panel/bienvenida'))['data'] as Map<String, dynamic>;
  Future<Map<String, dynamic>> panelPing() async => (await get('/api/panel/ping'))['data'] as Map<String, dynamic>;
  Future<void> apagarServidor() async => _pedir('POST', '/api/panel/apagar', cuerpo: {}, sinSesion: true, espera: const Duration(seconds: 5));
  Future<Map<String, dynamic>> crearCopia() async => await post('/api/panel/copia');

  // ── Facturas por mes ──────────────────────────────────────────────────────
  /// Cuántas facturas por mes se esperan y cómo va cada mes.
  Future<Map<String, dynamic>> periodos() async =>
      (await get('/api/panel/periodos'))['data'] as Map<String, dynamic>;

  /// Cambia cuántas facturas se esperan por mes (1, 2, 3, 4, 6…).
  Future<Map<String, dynamic>> guardarFacturasPorMes(int cuantas) =>
      post('/api/panel/periodos', {'facturasPorMes': cuantas});

  // ── Facturas ──────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> listarFacturas({int pagina = 1, int porPagina = 15, String? busqueda}) async {
    final q = <String>['page=$pagina', 'pageSize=$porPagina', if ((busqueda ?? '').isNotEmpty) 'search=${Uri.encodeComponent(busqueda!)}'];
    return (await get('/api/facturas?${q.join('&')}'));
  }

  Future<Map<String, dynamic>> detalleFactura(String id) async =>
      (await get('/api/facturas/${Uri.encodeComponent(id)}'));

  Future<Map<String, dynamic>> subirFactura(List<int> bytes, String nombre, {required bool guardar, bool confirmarSustitucion = false, bool confirmarSinServicios = false}) async {
    final b64 = base64Encode(bytes);
    return (await _pedir('POST', '/api/facturas/upload',
        cuerpo: {'file': b64, 'filename': nombre, 'accion': guardar ? 'guardar' : 'analizar', 'confirmarSustitucion': confirmarSustitucion, 'confirmarSinServicios': confirmarSinServicios},
        espera: const Duration(minutes: 2)));
  }

  Future<Map<String, dynamic>> buscarLineas(String termino) async =>
      (await get('/api/lineas?q=${Uri.encodeComponent(termino)}'));

  Future<Map<String, dynamic>> estadisticas() async => (await get('/api/facturas/stats'))['data'] as Map<String, dynamic>;

  // ── Usuarios ──────────────────────────────────────────────────────────────
  Future<List<dynamic>> usuarios() async => (await get('/api/users'))['data'] as List<dynamic>;
  Future<Map<String, dynamic>> crearUsuario(Map<String, dynamic> datos) => post('/api/users', datos);
  Future<Map<String, dynamic>> actualizarUsuario(String id, Map<String, dynamic> datos) => put('/api/users/$id', datos);
  Future<Map<String, dynamic>> eliminarUsuario(String id) => delete('/api/users/$id');

  // ── Importación de Excel ──────────────────────────────────────────────────
  Future<Map<String, dynamic>> importarExcel(List<int> bytes, String tabla, {bool truncar = false}) async {
    final b64 = base64Encode(bytes);
    return (await _pedir('POST', '/api/import/excel?table=$tabla&batchSize=500&truncate=$truncar',
        cuerpo: {'file': b64, 'filename': 'importacion.xlsx'},
        espera: const Duration(minutes: 5)));
  }

  Future<Map<String, dynamic>> tablasImportables() async => (await get('/api/import/tables'))['data'] as Map<String, dynamic>;
}

class ApiError implements Exception {
  ApiError(this.mensaje, this.codigo, {this.datos});
  final String mensaje;
  final int codigo;
  final Object? datos;

  bool get esSinConexion => codigo == 0;
  bool get esNoAutorizado => codigo == 401;
  bool get esSinPermiso => codigo == 403;

  @override
  String toString() => mensaje;
}
