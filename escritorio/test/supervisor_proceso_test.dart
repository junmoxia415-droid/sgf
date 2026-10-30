import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/supervisor_servidor.dart';

class ServidorTemporal extends ControladorServidor {
  ServidorTemporal({required super.ajustes, required super.api, required this.raiz});
  final Directory raiz;
  @override Directory get carpetaServidor => Directory('${raiz.path}${Platform.pathSeparator}servidor');
  @override Directory get carpetaDatos => Directory('${raiz.path}${Platform.pathSeparator}datos');
  @override File get archivoEnv => File('${carpetaDatos.path}${Platform.pathSeparator}.env');
}

Future<void> esperar(bool Function() condicion) async {
  for (var i = 0; i < 100; i++) {
    if (condicion()) return;
    await Future<void>.delayed(const Duration(milliseconds: 100));
  }
  throw StateError('Tiempo agotado al esperar el proceso ficticio');
}

void main() {
  test('Recuperación de un proceso Node real caído, sin borrar datos ficticios', () async {
    final tmp = await Directory.systemTemp.createTemp('sgf-supervisor-');
    final carpetaServidor = Directory('${tmp.path}${Platform.pathSeparator}servidor${Platform.pathSeparator}dist');
    final datos = Directory('${tmp.path}${Platform.pathSeparator}datos');
    await carpetaServidor.create(recursive: true); await datos.create(recursive: true);
    await File('${datos.path}${Platform.pathSeparator}.env').writeAsString('DB_TYPE=sqlite\n');
    final memoria = File('${datos.path}${Platform.pathSeparator}prueba.txt');
    await memoria.writeAsString('datos ficticios conservados');
    final pid = File('${datos.path}${Platform.pathSeparator}pid.txt');
    await File('${carpetaServidor.path}${Platform.pathSeparator}index.js').writeAsString(r'''
const http = require('http'), fs = require('fs'), path = require('path');
fs.writeFileSync(path.join(process.env.SGF_DATA_DIR, 'pid.txt'), String(process.pid));
const server=http.createServer((req,res)=>{
  if(req.url!='/api/panel/ping' && req.headers['x-sgf-console-token']!==process.env.SGF_CONSOLE_TOKEN) {res.writeHead(403);res.end('{}');return;}
  res.writeHead(200,{'content-type':'application/json'});
  if(req.url==='/api/panel/ping') res.end(JSON.stringify({data:{servicio:'sgf-consola',pid:process.pid}}));
  else if(req.url==='/api/panel/apagar') {res.end('{}');server.close(()=>process.exit(fs.existsSync(path.join(process.env.SGF_DATA_DIR,'cerrar-mal.txt')) ? 1 : 0));}
  else res.end(JSON.stringify({data:{}}));
});
server.listen(Number(process.env.PORT),'127.0.0.1');
''');
    final temporal = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final puerto = temporal.port; await temporal.close();
    final servidor = ServidorTemporal(ajustes: Ajustes(puerto: puerto), api: Api(), raiz: tmp);
    final supervisor = SupervisorServidor(servidor: servidor);
    try {
      final inicial = servidor.arrancar();
      expect(await servidor.arrancar(), isFalse, reason: 'No se lanza otro proceso durante el arranque');
      await servidor.reiniciar(); // Tampoco interrumpe un arranque en curso.
      expect(await inicial, isTrue);
      final primero = int.parse(await pid.readAsString());
      expect(Process.killPid(primero), isTrue);
      await esperar(() => servidor.estado == EstadoServidor.fallo);
      await supervisor.comprobar();
      expect(servidor.estado, EstadoServidor.enMarcha);
      expect(int.parse(await pid.readAsString()), isNot(primero));
      expect(await memoria.readAsString(), 'datos ficticios conservados');
      await File('${datos.path}${Platform.pathSeparator}cerrar-mal.txt').writeAsString('error simulado');
      await servidor.detener();
      expect(servidor.avisoCierre, isTrue);
      expect(servidor.ultimoError, contains('no se hayan guardado'));
      await supervisor.comprobar();
      expect(servidor.estado, EstadoServidor.detenido);
    } finally {
      await supervisor.detener();
      await servidor.detener(); servidor.dispose();
      await tmp.delete(recursive: true);
    }
  }, timeout: const Timeout(Duration(minutes: 1)));
}
