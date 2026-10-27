// Pruebas del cliente HTTP contra un servidor real.
//
// En GitHub Actions se arranca el servidor (node dist/index.js) en el puerto
// 3000 y se ejecuta esta prueba: comprueba de punta a punta que la aplicación
// habla con el servidor como debe. Si no hay servidor, las pruebas se omiten
// para que `flutter test` siga funcionando en cualquier equipo.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/api.dart';

void main() {
  final api = Api()
    ..base = Platform.environment['SGF_BASE'] ?? 'http://127.0.0.1:3000'
    ..tokenConsola = Platform.environment['SGF_CONSOLE_TOKEN'];

  test('el panel responde y dice que es la consola de SGF', () async {
    final r = await api.panelPing();
    expect(r['servicio'], 'sgf-consola');
  }, skip: Platform.environment['SGF_INTEGRACION'] == null);

  test('el panel devuelve contadores y estado de la base de datos', () async {
    final estado = await api.panelEstado();
    expect(estado['contadores'], isA<Map>());
    expect(estado['modoBd'], isNotNull);
    expect(estado['bd'], isA<Map>());
  }, skip: Platform.environment['SGF_INTEGRACION'] == null);

  test('sin sesión, las facturas no están accesibles', () async {
    expect(
      () => api.listarFacturas(),
      throwsA(isA<ApiError>().having((e) => e.esNoAutorizado, 'esNoAutorizado', isTrue)),
    );
  }, skip: Platform.environment['SGF_INTEGRACION'] == null);

  test('iniciar sesión con el administrador de pruebas funciona', () async {
    await api.iniciarSesion('admin', 'Admin123!');
    expect(api.conSesion, isTrue);
    expect(api.esAdmin, isTrue);
    final lista = await api.listarFacturas();
    expect(lista['success'], isTrue);
  }, skip: Platform.environment['SGF_INTEGRACION'] == null);

  test('un error de credenciales se explica en español', () async {
    final otro = Api()..base = api.base;
    try {
      await otro.iniciarSesion('admin', 'clave-incorrecta');
      fail('debería haber fallado');
    } on ApiError catch (e) {
      expect(e.codigo, isNot(0));
      expect(e.mensaje.toLowerCase(), contains('contrasena'));
      expect(e.codigo, 401);
    }
  }, skip: Platform.environment['SGF_INTEGRACION'] == null);
}
