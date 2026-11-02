import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/redes_autorizadas.dart';

void main() {
  final node = Platform.environment['SGF_NODE_TEST'];
  final server = Platform.environment['SGF_SERVER_TEST_DIR'];
  test('Conserva la configuración anterior al rechazar una red no válida', () async {
    final dir=await Directory.systemTemp.createTemp('sgf-redes-ui-');
    final redes=RedesAutorizadas(node:node!, script:'$server/dist/scripts/redes-autorizadas.js', datos:dir.path);
    try {
      expect(await redes.leer(), isEmpty);
      expect(await redes.guardar(['203.0.113.0/24']), ['203.0.113.0/24']);
      await expectLater(redes.guardar(['0.0.0.0/0']), throwsStateError);
      expect(await redes.leer(), ['203.0.113.0/24']);
    } finally { await dir.delete(recursive:true); }
  }, skip: node==null || server==null ? 'Requiere el servidor de prueba compilado' : false);
}
