import 'dart:convert';
import 'dart:io';

/// La validación común la hace el mismo código Node usado por el servidor.
class RedesAutorizadas {
  RedesAutorizadas({required this.node, required this.script, required this.datos});
  final String node, script, datos;
  Future<List<String>> leer() async {
    if (!await Directory(datos).exists()) return [];
    return _ejecutar('leer');
  }
  Future<List<String>> guardar(List<String> redes) => _ejecutar('guardar', redes);
  Future<List<String>> _ejecutar(String accion, [List<String>? redes]) async {
    final r = await Process.run(node, [script, accion, datos, if (redes != null) jsonEncode(redes)], runInShell: false).timeout(const Duration(seconds: 15));
    if (r.exitCode != 0) throw StateError('No se pudo guardar o leer la lista. Use IPv4 con prefijo entre /24 y /32, con inicio de red correcto.');
    final doc = jsonDecode(r.stdout.toString()) as Map<String,dynamic>;
    return (doc['redes'] as List).cast<String>();
  }
}
