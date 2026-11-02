import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/servicio_existente.dart';

void main() {
  late Directory temp;
  late ServicioExistente servicio;
  final token = 'a' * 64;
  setUp(() async {
    temp = await Directory.systemTemp.createTemp('sgf-anuncio-');
    servicio = ServicioExistente(temp.path);
  });
  tearDown(() async { await temp.delete(recursive: true); });
  Future<void> crear({bool activo = true, bool falso = false}) async {
    await Directory(servicio.carpeta).create();
    await servicio.marcador.writeAsString(jsonEncode({'version': 1, 'activo': activo}));
    await servicio.token.writeAsString(token);
    const huella = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    final mac = Hmac(sha256, utf8.encode(falso ? 'otra-clave' : token)).convert(utf8.encode('SGF_TLS:12345:$huella')).toString();
    await servicio.anuncio.writeAsString(jsonEncode({'version': 1, 'pid': 123, 'linea': '[SGF_TLS] ${jsonEncode({'puerto':12345, 'huella':huella, 'mac':mac})}'}));
  }
  test('sin configuración no adopta un servidor', () async {
    expect(await servicio.configurado(), isFalse);
    expect(await servicio.leer(), isNull);
  });
  test('acepta solamente anuncio autenticado y con datos válidos', () async {
    await crear();
    final anuncio = await servicio.leer();
    expect(anuncio?.canal.puerto, 12345);
    expect(anuncio?.token, token);
    expect(anuncio?.pid, 123);
  });
  test('rechaza el anuncio falso sin exponer el token', () async {
    await crear(falso: true);
    await expectLater(servicio.leer(), throwsStateError);
  });
  test('desactivado no adopta anuncio antiguo', () async {
    await crear(activo: false);
    expect(await servicio.leer(), isNull);
  });
  test('marcador alterado falla cerrado', () async {
    await crear();
    await servicio.marcador.writeAsString('{malformado');
    await expectLater(servicio.configurado(), throwsStateError);
  });
}
