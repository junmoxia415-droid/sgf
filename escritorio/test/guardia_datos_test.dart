import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/guardia_datos.dart';
import 'package:sgf_escritorio/servicios/reinicio_datos.dart';

void main() {
  final script = Platform.environment['SGF_GUARD_TEST_SCRIPT'];
  final node = Platform.environment['SGF_NODE_TEST'] ?? 'node';
  test('El reinicio respeta un bloqueo real aunque el puerto esté libre', () async {
    final tmp = await Directory.systemTemp.createTemp('sgf-guardia-test-');
    final carpeta = Directory('${tmp.path}${Platform.pathSeparator}SGF');
    final marcador = File('${tmp.path}${Platform.pathSeparator}reinicio.txt');
    await carpeta.create(recursive: true);
    final archivo = File('${carpeta.path}${Platform.pathSeparator}facturas.db');
    await archivo.writeAsString('datos ficticios'); await marcador.writeAsString('confirmado');
    final socket = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final puerto = socket.port; await socket.close();
    Future<SoltarGuardia> adquirir(Directory d) => adquirirGuardiaDatos(carpeta: d, node: node, ejecutable: File(script!));
    SoltarGuardia? primera;
    try {
      primera = await adquirir(carpeta);
      final error = await prepararReinicioLocal(carpeta: carpeta, marcador: marcador, puerto: puerto, adquirirGuardia: adquirir);
      expect(error, contains('ya está en uso'));
      expect(await archivo.readAsString(), 'datos ficticios'); expect(await marcador.exists(), isTrue);
      await primera(); primera = null;
      expect(await prepararReinicioLocal(carpeta: carpeta, marcador: marcador, puerto: puerto, adquirirGuardia: adquirir), isNull);
      final respaldos = tmp.listSync().whereType<Directory>().where((d) => d.path.contains('SGF-respaldo-')).toList();
      expect(respaldos, hasLength(1));
      expect(await File('${respaldos.single.path}${Platform.pathSeparator}facturas.db').readAsString(), 'datos ficticios');
    } finally {
      if (primera != null) await primera();
      await tmp.delete(recursive: true);
    }
  }, skip: script == null ? 'Requiere el servidor compilado y SGF_GUARD_TEST_SCRIPT.' : false,
     timeout: const Timeout(Duration(minutes: 1)));
}
