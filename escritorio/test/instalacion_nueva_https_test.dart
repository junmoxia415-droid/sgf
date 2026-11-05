import 'dart:convert';
import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/seleccion_puerto.dart';

class AjustesFicticios extends Ajustes {
  AjustesFicticios(this.file, {this.fallar = false});
  final File file;
  final bool fallar;
  @override Future<void> guardar() async {
    if (!fallar) await file.writeAsString(jsonEncode({'puerto':puerto,'urlPublica':urlPublica}));
  }
}
class ServidorNuevo extends ControladorServidor {
  ServidorNuevo({required super.ajustes,required super.api,required this.datos,required this.server,required this.node,required this.file,required this.preferidos}) : super(httpsEnInstalacionNueva:true);
  final Directory datos,server;
  final String node;
  final File file;
  final List<int> preferidos;
  @override Directory get carpetaDatos => datos;
  @override Directory get carpetaServidor => server;
  @override String get ejecutableNode => node;
  @override File get archivoAjustes => file;
  @override Future<int> seleccionarPuertoInicial() => seleccionarPuertoLibre(preferidos:preferidos);
}
void main() {
  final node=Platform.environment['SGF_NODE_TEST'];
  final server=Platform.environment['SGF_SERVER_TEST_DIR'];
  final skip=node==null || server==null ? 'Requiere Node y servidor de prueba compilado' : false;
  test('Instalación nueva activa HTTPS y evita el puerto ocupado sin detenerlo', () async {
    final tmp=await Directory.systemTemp.createTemp('sgf-instalacion-nueva-');
    final ocupado=await ServerSocket.bind(InternetAddress.anyIPv4,0);
    final libre=await ServerSocket.bind(InternetAddress.anyIPv4,0);final puerto=libre.port;await libre.close();
    final data=Directory('${tmp.path}/datos');final f=File('${tmp.path}/ajustes.json');
    final ajustes=AjustesFicticios(f);final api=Api();
    final c=ServidorNuevo(ajustes:ajustes,api:api,datos:data,server:Directory(server!),node:node!,file:f,preferidos:[ocupado.port,puerto]);
    try {
      expect(await c.arrancar(),isTrue,reason:c.registro.join('\n'));
      expect(c.ajustes.puerto,puerto);expect(ocupado.port,isPositive);
      expect((await c.redSegura.consultar()).activa,isTrue);
      expect((await api.panelPing())['servicio'],'sgf-consola');
      final enlaces=await c.enlacesRed();
      for(final enlace in enlaces){expect(Uri.parse(enlace).scheme,'https');expect(Uri.parse(enlace).fragment,isEmpty);}
      final plano=HttpClient();
      try { await expectLater(plano.getUrl(Uri.parse('http://127.0.0.1:$puerto/api/health')).then((r)=>r.close()),throwsA(anything)); }
      finally {plano.close(force:true);}
      await c.detener();expect(c.avisoCierre,isFalse);
    } finally {if(c.enMarcha)await c.detener();c.dispose();await ocupado.close();await tmp.delete(recursive:true);}
  },skip:skip,timeout:const Timeout(Duration(minutes:1)));
  test('Una carpeta de datos existente no se migra a HTTPS automáticamente', () async {
    final tmp=await Directory.systemTemp.createTemp('sgf-existente-');final data=Directory('${tmp.path}/datos');await data.create();
    final nota=File('${data.path}/documento.txt');await nota.writeAsString('datos ficticios intactos');
    await File('${data.path}/.env').writeAsString('DB_TYPE=sqlite\nJWT_SECRET=secreto-solo-para-pruebas-123456\n');
    final socket=await ServerSocket.bind(InternetAddress.loopbackIPv4,0);final puerto=socket.port;await socket.close();
    final f=File('${tmp.path}/ajustes.json');final ajustes=AjustesFicticios(f)..puerto=puerto;final api=Api();
    final c=ServidorNuevo(ajustes:ajustes,api:api,datos:data,server:Directory(server!),node:node!,file:f,preferidos:[8443]);
    try {
      expect(await c.arrancar(),isTrue,reason:c.registro.join('\n'));
      expect(await Directory('${data.path}/red-protegida').exists(),isFalse);
      expect(ajustes.puerto,puerto);expect(await nota.readAsString(),'datos ficticios intactos');
      await c.detener();expect(c.avisoCierre,isFalse);
    } finally {if(c.enMarcha)await c.detener();c.dispose();await tmp.delete(recursive:true);}
  },skip:skip,timeout:const Timeout(Duration(minutes:1)));
  test('Si el puerto HTTPS no se guarda, no inicia ni vuelve a HTTP', () async {
    final tmp=await Directory.systemTemp.createTemp('sgf-fallo-ajustes-');final data=Directory('${tmp.path}/datos');final f=File('${tmp.path}/ajustes.json');
    final s=await ServerSocket.bind(InternetAddress.anyIPv4,0);final puerto=s.port;await s.close();
    final ajustes=AjustesFicticios(f,fallar:true);final api=Api();
    final c=ServidorNuevo(ajustes:ajustes,api:api,datos:data,server:Directory(server!),node:node!,file:f,preferidos:[puerto]);
    try {
      expect(await c.arrancar(),isFalse);expect(c.enMarcha,isFalse);
      expect(await Directory('${data.path}/red-protegida').exists(),isTrue);
      expect(await puertoDisponible(puerto),isTrue);
    } finally {if(c.enMarcha)await c.detener();c.dispose();await tmp.delete(recursive:true);}
  },skip:skip,timeout:const Timeout(Duration(minutes:1)));
}
