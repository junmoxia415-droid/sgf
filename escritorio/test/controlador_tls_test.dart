import 'dart:io';
import 'dart:math';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';

class ServidorSeguroTemporal extends ControladorServidor {
  ServidorSeguroTemporal({required super.ajustes,required super.api,required this.server,required this.datos});
  final Directory server, datos;
  @override Directory get carpetaServidor => server;
  @override Directory get carpetaDatos => datos;
  @override File get archivoEnv => File('${datos.path}${Platform.pathSeparator}.env');
}
void main() {
  final serverDir=Platform.environment['SGF_SERVER_TEST_DIR'];
  test('El controlador real usa TLS local y conserva HTTP para la red', () async {
    final tmp=await Directory.systemTemp.createTemp('sgf-control-tls-');
    final datos=Directory('${tmp.path}${Platform.pathSeparator}SGF${Platform.pathSeparator}datos');await datos.create(recursive:true);
    final rng=Random.secure();final secreto=List.generate(32, (_) => rng.nextInt(256)).join();
    await File('${datos.path}${Platform.pathSeparator}.env').writeAsString('DB_TYPE=sqlite\nJWT_SECRET=$secreto\n');
    final socket=await ServerSocket.bind(InternetAddress.loopbackIPv4,0);final puerto=socket.port;await socket.close();
    final api=Api();final servidor=ServidorSeguroTemporal(ajustes:Ajustes(puerto:puerto),api:api,server:Directory(serverDir!),datos:datos);
    try {
      expect(await servidor.arrancar(),isTrue,reason:servidor.registro.join('\n'));
      expect(api.base,startsWith('https://127.0.0.1:'));
      expect((await api.panelPing())['servicio'],'sgf-consola');
      await api.configurarPrimeraCuenta(usuario:'administrador_ficticio',nombre:'Prueba',clave:'  para-pruebas-seguro-987654321  ');
      await expectLater(api.iniciarSesion('administrador_ficticio','para-pruebas-incorrecta'),throwsA(isA<ApiError>().having((e)=>e.codigo,'estado',401)));
      await api.iniciarSesion('administrador_ficticio','  para-pruebas-seguro-987654321  ');
      expect(api.esAdmin,isTrue);
      await api.post('/api/users', {'username':'operador_ficticio','name':'Operador','password':'para-pruebas-usuario-123','role':'usuario'});
      await api.iniciarSesion('operador_ficticio','para-pruebas-usuario-123');
      expect(api.esAdmin,isFalse);
      await servidor.reiniciar();
      expect(servidor.enMarcha,isTrue,reason:'Un usuario normal no debe impedir la verificación de consola al reiniciar.');
      final cliente=HttpClient();
      try {
        final req=await cliente.getUrl(Uri.parse('http://127.0.0.1:$puerto/api/health'));
        final res=await req.close();expect(res.statusCode,200);await res.drain<void>();
      } finally {cliente.close(force:true);}
      await servidor.detener();expect(servidor.avisoCierre,isFalse);
      await expectLater(api.iniciarSesion('cuenta','para-pruebas-seguro'),throwsA(isA<ApiError>()));
    } finally {
      await servidor.detener();servidor.dispose();await tmp.delete(recursive:true);
    }
  }, skip:serverDir == null ? 'Requiere SGF_SERVER_TEST_DIR y servidor compilado.' : false,
     timeout:const Timeout(Duration(minutes:1)));

  test('Configuración ambigua no abre otra base y se comunica en pantalla', () async {
    final tmp=await Directory.systemTemp.createTemp('sgf-base-invalida-');
    final datos=Directory('${tmp.path}${Platform.pathSeparator}SGF${Platform.pathSeparator}datos');await datos.create(recursive:true);
    final fichero=File('${datos.path}${Platform.pathSeparator}sgf-data.db');await fichero.writeAsString('datos ficticios');
    await File('${datos.path}${Platform.pathSeparator}.env').writeAsString('DB_TYPE=invalido\n');
    final socket=await ServerSocket.bind(InternetAddress.loopbackIPv4,0);final puerto=socket.port;await socket.close();
    final servidor=ServidorSeguroTemporal(ajustes:Ajustes(puerto:puerto),api:Api(),server:Directory(serverDir!),datos:datos);
    try {
      expect(await servidor.arrancar(),isFalse);
      for (var i=0;i<30 && !(servidor.ultimoError ?? '').contains('configuración de base');i++) { await Future<void>.delayed(const Duration(milliseconds:100)); }
      expect(servidor.ultimoError,contains('configuración de base'));
      expect(await fichero.readAsString(),'datos ficticios');
    } finally { await servidor.detener();servidor.dispose();await tmp.delete(recursive:true); }
  }, skip:serverDir == null ? 'Requiere SGF_SERVER_TEST_DIR y servidor compilado.' : false,
     timeout:const Timeout(Duration(minutes:1)));
}
