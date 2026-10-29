import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';

class ServidorTemporal extends ControladorServidor {
  ServidorTemporal({required super.ajustes, required super.api, required this.dir});
  final Directory dir;
  @override
  Directory get carpetaServidor => Directory('${dir.path}/servidor');
  @override
  Directory get carpetaDatos => Directory('${dir.path}/datos');
}

void main() {
  test('Un puerto ocupado no se confunde con el servidor propio ni se detiene', () async {
    final dir = await Directory.systemTemp.createTemp('sgf-test-');
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((request) async {
      request.response.headers.contentType = ContentType.json;
      request.response.write('{"success":true,"data":{"servicio":"sgf-consola","pid":123}}');
      await request.response.close();
    });
    final index = File('${dir.path}/servidor/dist/index.js');
    await index.parent.create(recursive: true);
    await index.writeAsString('// Prueba: nunca debe ejecutarse');
    final env = File('${dir.path}/datos/.env');
    await env.parent.create(recursive: true);
    await env.writeAsString('# aislado');
    final api = Api();
    final control = ServidorTemporal(ajustes: Ajustes(puerto: server.port), api: api, dir: dir);
    try {
      expect(await control.arrancar(), isFalse);
      expect(control.estado, EstadoServidor.fallo);
      expect(control.ultimoError, contains('ya está ocupado'));
      expect(control.enMarcha, isFalse);
      // El proceso/servidor que ya estaba en el puerto sigue atendiendo.
      final cliente = HttpClient();
      final respuesta = await (await cliente.getUrl(Uri.parse('http://127.0.0.1:${server.port}/'))).close();
      expect(respuesta.statusCode, 200);
      await respuesta.drain<void>();
      cliente.close();
    } finally {
      await control.detener();
      control.dispose();
      await server.close(force: true);
      await dir.delete(recursive: true);
    }
  });
}
