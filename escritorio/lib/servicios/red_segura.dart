import 'dart:convert';
import 'dart:io';

/// Datos públicos de la identidad LAN. La clave privada nunca sale de la carpeta protegida.
class EstadoRedSegura {
  const EstadoRedSegura({required this.activa, this.nombre, this.huella, this.caduca, this.certificadoPublico});
  final bool activa;
  final String? nombre;
  final String? huella;
  final String? caduca;
  final String? certificadoPublico;
}

class RedSegura {
  RedSegura({required this.node, required this.script, required this.datos});
  final String node;
  final String script;
  final String datos;

  Future<EstadoRedSegura> consultar() async {
    final carpeta = '$datos${Platform.pathSeparator}red-protegida';
    if (await FileSystemEntity.type(carpeta, followLinks: false) == FileSystemEntityType.notFound) {
      return const EstadoRedSegura(activa: false);
    }
    return _ejecutar('estado');
  }
  Future<EstadoRedSegura> preparar() => _ejecutar('preparar');

  Future<EstadoRedSegura> _ejecutar(String operacion) async {
    final r = await Process.run(node, [script, operacion, datos], runInShell: false)
        .timeout(const Duration(seconds: 45));
    if (r.exitCode != 0) {
      throw StateError('No se pudo preparar la identidad HTTPS. Revise los permisos, el registro y la carpeta de datos; no se activará HTTP automáticamente.');
    }
    try {
      final mapa = jsonDecode(r.stdout.toString().trim()) as Map<String, dynamic>;
      if (mapa['activo'] == false) return const EstadoRedSegura(activa: false);
      final nombre = mapa['nombre'] as String;
      final huella = mapa['huella'] as String;
      final caduca = mapa['caduca'] as String;
      if (!RegExp(r'^sgf-[a-f0-9]{12}\.local$').hasMatch(nombre) || !RegExp(r'^[a-f0-9]{64}$').hasMatch(huella)) {
        throw const FormatException('Identidad inválida');
      }
      // La ruta se fija localmente; nunca se acepta una ruta devuelta por otro proceso.
      final publico = '$datos${Platform.pathSeparator}red-protegida${Platform.pathSeparator}autoridad-publica.crt';
      if (!await File(publico).exists()) throw const FormatException('Falta el certificado público');
      return EstadoRedSegura(activa: true, nombre: nombre, huella: huella, caduca: caduca, certificadoPublico: publico);
    } catch (_) {
      throw StateError('La respuesta de identidad HTTPS no es válida. No se activará HTTP automáticamente.');
    }
  }
}
