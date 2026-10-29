import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/reinicio_datos.dart';

void main() {
  test('Conservar no modifica datos; reiniciar archiva datos y quita solicitud', () async {
    final tmp = await Directory.systemTemp.createTemp('sgf-reset-test-');
    final datos = Directory('${tmp.path}/SGF');
    final marcador = File('${tmp.path}/SGF-solicitud-reinicio.txt');
    await datos.create();
    await File('${datos.path}/facturas.db').writeAsString('contenido ficticio');
    final s = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final puerto = s.port;
    try {
      expect(await prepararReinicioLocal(carpeta: datos, marcador: marcador, puerto: puerto), isNull);
      expect(await File('${datos.path}/facturas.db').readAsString(), 'contenido ficticio');
      await marcador.writeAsString('confirmado');
      expect(await prepararReinicioLocal(carpeta: datos, marcador: marcador, puerto: puerto), contains('ocupado'));
      expect(await File('${datos.path}/facturas.db').exists(), isTrue);
      await s.close();
      expect(await prepararReinicioLocal(carpeta: datos, marcador: marcador, puerto: puerto), isNull);
      expect(await datos.exists(), isFalse);
      expect(await marcador.exists(), isFalse);
      final respaldos = tmp.listSync().whereType<Directory>().where((d) => d.path.contains('SGF-respaldo-')).toList();
      expect(respaldos, hasLength(1));
      expect(await File('${respaldos.single.path}/facturas.db').readAsString(), 'contenido ficticio');
    } finally {
      await s.close();
      await tmp.delete(recursive: true);
    }
  });
}
