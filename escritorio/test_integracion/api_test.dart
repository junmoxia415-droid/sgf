// Pruebas del cliente HTTP contra un servidor real.
//
// Estas pruebas necesitan un servidor SGF en marcha. Por eso viven fuera de
// `test/` (que se ejecuta en cualquier equipo) y se lanzan solo cuando el
// servidor está arrancado, como hace el flujo de GitHub Actions:
//
//   SGF_BASE=http://127.0.0.1:3000 SGF_CONSOLE_TOKEN=... \
//       flutter test test_integracion/api_test.dart
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
  });

  test('el panel devuelve contadores y estado de la base de datos', () async {
    final estado = await api.panelEstado();
    expect(estado['contadores'], isA<Map>());
    expect(estado['modoBd'], isNotNull);
    expect(estado['bd'], isA<Map>());
  });

  test('sin sesión, las facturas no están accesibles', () async {
    expect(
      () => api.listarFacturas(),
      throwsA(isA<ApiError>().having((e) => e.esNoAutorizado, 'esNoAutorizado', isTrue)),
    );
  });

  test('iniciar sesión con el administrador de pruebas funciona', () async {
    await api.iniciarSesion('admin', 'Admin123!');
    expect(api.conSesion, isTrue);
    expect(api.esAdmin, isTrue);
    final lista = await api.listarFacturas();
    expect(lista['success'], isTrue);
  });

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
  });
}
