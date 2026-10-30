import 'dart:async';
import 'dart:convert';
import 'dart:io';

typedef SoltarGuardia = Future<void> Function();
typedef AdquirirGuardia = Future<SoltarGuardia> Function(Directory carpeta);

/// Mantiene el mismo bloqueo interproceso que el servidor durante el reinicio
/// de datos. El proceso auxiliar no recibe credenciales ni abre la base real.
Future<SoltarGuardia> adquirirGuardiaDatos({
  required Directory carpeta,
  required String node,
  required File ejecutable,
}) async {
  if (!await ejecutable.exists()) throw StateError('Falta el componente de protección de datos.');
  final proceso = await Process.start(node, [ejecutable.path, '${carpeta.path}${Platform.pathSeparator}datos'], runInShell: false);
  final errores = StringBuffer();
  proceso.stderr.transform(utf8.decoder).listen(errores.write);
  try {
    final linea = await proceso.stdout.transform(utf8.decoder).transform(const LineSplitter()).first
        .timeout(const Duration(seconds: 15));
    if (linea != 'SGF_BLOQUEO_OK') throw StateError('Respuesta incorrecta del protector de datos.');
  } catch (e) {
    proceso.kill();
    try { await proceso.exitCode.timeout(const Duration(seconds: 5)); } catch (_) {}
    final detalle = errores.toString().trim();
    throw StateError(detalle.isNotEmpty ? detalle : 'No se pudo reservar la carpeta de datos: $e');
  }
  var liberado = false;
  return () async {
    if (liberado) return;
    liberado = true;
    await proceso.stdin.close();
    try {
      final salida = await proceso.exitCode.timeout(const Duration(seconds: 10));
      if (salida != 0) throw StateError('El protector de datos terminó con código $salida.');
    } on TimeoutException {
      proceso.kill();
      await proceso.exitCode;
      throw StateError('El protector de datos tardó demasiado en cerrarse.');
    }
  };
}
