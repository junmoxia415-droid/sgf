import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/canal_local_seguro.dart';

String anuncio(int puerto, String huella, String token) {
  final mac=Hmac(sha256,utf8.encode(token)).convert(utf8.encode('SGF_TLS:$puerto:$huella')).toString();
  return '[SGF_TLS] ${jsonEncode({'puerto':puerto,'huella':huella,'mac':mac})}';
}

void main() {
  test('Solo acepta un anuncio con MAC válida y parámetros correctos', () {
    final token=List.generate(32, (_) => Random.secure().nextInt(256)).join();
    final huella='a'*64;
    final valido=anuncio(12345,huella,token);
    expect(CanalLocalSeguro.desdeAnuncio(valido,token), isNotNull);
    expect(CanalLocalSeguro.desdeAnuncio(valido,'otra-clave-no-valida-123456'), isNull);
    expect(CanalLocalSeguro.desdeAnuncio(anuncio(0,huella,token),token), isNull);
    expect(CanalLocalSeguro.desdeAnuncio(anuncio(12345,'invalido',token),token), isNull);
  });

  test('Sin canal autenticado no se envían credenciales a un servidor ajeno', () async {
    final falso=await HttpServer.bind(InternetAddress.loopbackIPv4,0);var peticiones=0;
    falso.listen((req){peticiones++;req.response.statusCode=200;req.response.close();});
    final api=Api()..exigirCanalSeguro=true..base='http://127.0.0.1:${falso.port}';
    try {
      await expectLater(api.iniciarSesion('usuario-ficticio','contraseña-ficticia'),throwsA(isA<ApiError>()));
      await Future<void>.delayed(const Duration(milliseconds: 100));expect(peticiones,0);
    } finally {await falso.close(force:true);}
  });

  final serverDir=Platform.environment['SGF_SERVER_TEST_DIR'];
  final node=Platform.environment['SGF_NODE_TEST'] ?? 'node';
  test('Una huella incorrecta bloquea el token y el cuerpo antes de enviarlos', () async {
    final fixture=File('$serverDir${Platform.pathSeparator}test${Platform.pathSeparator}fixture-control-tls.mjs');
    final proc=await Process.start(node,[fixture.path],workingDirectory:serverDir);
    final listo=Completer<List<dynamic>>();final registro=StringBuffer();
    final sub=proc.stdout.transform(utf8.decoder).transform(const LineSplitter()).listen((linea){
      if(!listo.isCompleted && linea.startsWith('[')) {try{listo.complete(jsonDecode(linea) as List<dynamic>);}catch(e){listo.completeError(e);}}
      else {registro.writeln(linea);}
    });
    final errores=StringBuffer();final err=proc.stderr.transform(utf8.decoder).listen(errores.write);
    try {
      final datos=await listo.future.timeout(const Duration(seconds: 20));
      final a=datos[0] as Map<String,dynamic>, b=datos[1] as Map<String,dynamic>;
      final aleatorio=Random.secure();final token=List.generate(32, (_) => aleatorio.nextInt(256)).join();
      final valido=CanalLocalSeguro.desdeAnuncio(anuncio(a['puerto'] as int,a['huella'] as String,token),token)!;
      final api=Api()..exigirCanalSeguro=true..configurarCanalLocal(valido)..tokenConsola=token;
      await api.iniciarSesion('cuenta-prueba','contraseña-ficticia');
      final enganoso=CanalLocalSeguro.desdeAnuncio(anuncio(b['puerto'] as int,a['huella'] as String,token),token)!;
      final apiFalsa=Api()..exigirCanalSeguro=true..configurarCanalLocal(enganoso)..tokenConsola=token;
      await expectLater(apiFalsa.iniciarSesion('cuenta-prueba','contraseña-ficticia'),throwsA(isA<ApiError>()));
      await Future<void>.delayed(const Duration(milliseconds: 250));
      expect(registro.toString(),contains('PETICION_A'));expect(registro.toString(),isNot(contains('PETICION_B')));
    } finally {
      await proc.stdin.close();
      try {await proc.exitCode.timeout(const Duration(seconds:5));} catch (_) {proc.kill();await proc.exitCode;}
      await sub.cancel();await err.cancel();
    }
  }, skip: serverDir == null ? 'Requiere SGF_SERVER_TEST_DIR y dependencias Node instaladas.' : false,
     timeout: const Timeout(Duration(minutes: 1)));
}
