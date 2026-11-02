import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';

class AjustesTemporales extends Ajustes {
  AjustesTemporales(this.destino);
  final File destino;
  @override
  Future<void> guardar() async => destino.writeAsStringSync(jsonEncode({'puerto': puerto, 'urlPublica': urlPublica}));
}
class ControlTemporal extends ControladorServidor {
  ControlTemporal({required super.ajustes, required super.api, required this.dir, required this.server, required this.node, required this.ajustesFile, required this.puertoPrueba});
  final Directory dir, server;
  final String node;
  final File ajustesFile;
  final int puertoPrueba;
  @override Directory get carpetaDatos => dir;
  @override Directory get carpetaServidor => server;
  @override String get ejecutableNode => node;
  @override File get archivoAjustes => ajustesFile;
  @override int get puertoHttps => puertoPrueba;
}
void main() {
  final node=Platform.environment['SGF_NODE_TEST'];
  final serverPath=Platform.environment['SGF_SERVER_TEST_DIR'];
  test('Puerto ocupado no cambia certificados ni detiene otro proceso', () async {
    final temp=await Directory.systemTemp.createTemp('sgf-puerto-falso-');
    final socket=await ServerSocket.bind(InternetAddress.loopbackIPv4,0);
    final ajustes=AjustesTemporales(File('${temp.path}/ajustes.json'));
    final c=ControlTemporal(ajustes:ajustes,api:Api(),dir:temp,server:Directory(serverPath ?? '.'),node:node ?? 'node',ajustesFile:ajustes.destino,puertoPrueba:socket.port);
    try {
      await expectLater(c.activarHttpsRed(),throwsA(isA<StateError>()));
      expect(await Directory('${temp.path}/red-protegida').exists(),isFalse);
      expect(socket.port,greaterThan(0));
    } finally {await socket.close();c.dispose();await temp.delete(recursive:true);}
  });
  test('Activa HTTPS de SGF real conservando la identidad, y adopta el control local autenticado', () async {
    final temp=await Directory.systemTemp.createTemp('sgf-activar-https-');
    final s=await ServerSocket.bind(InternetAddress.loopbackIPv4,0);final port=s.port;await s.close();
    final ajustes=AjustesTemporales(File('${temp.path}/ajustes.json'));
    final api=Api();
    final c=ControlTemporal(ajustes:ajustes,api:api,dir:temp,server:Directory(serverPath!),node:node!,ajustesFile:ajustes.destino,puertoPrueba:port);
    try {
      final identidad=await c.activarHttpsRed();
      expect(identidad.activa,isTrue);expect(identidad.nombre,startsWith('sgf-'));
      expect(ajustes.puerto,port);expect(c.enMarcha,isTrue);
      expect((await api.panelPing())['servicio'],'sgf-consola');
      expect(await c.enlacesRed(),isEmpty,reason:'No debe ofrecer IP fuera del certificado');
      expect(await File(identidad.certificadoPublico!).exists(),isTrue);
      await c.detener();expect(c.avisoCierre,isFalse);
      expect((await c.redSegura.consultar()).huella,identidad.huella);
    } finally {if(c.enMarcha)await c.detener();c.dispose();await temp.delete(recursive:true);}
  },skip:node==null || serverPath==null ? 'Requiere Node y servidor de prueba compilado' : false);
}
