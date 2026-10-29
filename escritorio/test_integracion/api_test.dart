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
  final avisos = <String>[];
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

  test('la primera vez se crea la cuenta desde la configuración inicial', () async {
    // En un servidor recién creado no hay ninguna cuenta: así se crea la del
    // administrador, igual que hace el asistente de la aplicación.
    final responde = await api.requiereConfiguracionInicial();
    if (responde) {
      final r = await api.configurarPrimeraCuenta(
        usuario: 'admin',
        nombre: 'Administrador',
        clave: 'Admin123!',
      );
      expect(r['success'], isTrue);
      await api.usarToken('${(r['data'] as Map)['token']}', 'admin');
      expect(api.conSesion, isTrue);
    }
  });

  test('iniciar sesión con el administrador de pruebas funciona', () async {
    await api.iniciarSesion('admin', 'Admin123!');
    expect(api.conSesion, isTrue);
    expect(api.esAdmin, isTrue);
    final lista = await api.listarFacturas();
    expect(lista['success'], isTrue);
  });

  test('si el administrador desactiva la cuenta, la app se entera al instante', () async {
    // Un segundo cliente hace de administrador y desactiva a un usuario nuevo.
    final admin = Api()..base = api.base;
    await admin.iniciarSesion('admin', 'Admin123!');

    final operador = Api()
      ..base = api.base
      ..alCaducarSesion = ((m) => avisos.add(m));
    // Nombre único por ejecución: la prueba se puede repetir contra el mismo servidor.
    final nombre = 'temporal${DateTime.now().millisecondsSinceEpoch % 100000}';
    await admin.crearUsuario({
      'username': nombre,
      'password': 'Temporal-123!',
      'name': 'Usuario temporal',
      'role': 'usuario',
    });
    await operador.iniciarSesion(nombre, 'Temporal-123!');
    expect(operador.conSesion, isTrue);
    expect((await operador.listarFacturas())['success'], isTrue);

    final usuarios = await admin.usuarios();
    final id = usuarios.firstWhere((u) => u['username'] == nombre)['id'];
    await admin.actualizarUsuario(id as String, {'active': false});

    // La siguiente llamada tiene que fallar sin conexión a medias y avisar.
    await expectLater(
      operador.listarFacturas(),
      throwsA(isA<ApiError>().having((e) => e.esNoAutorizado, 'esNoAutorizado', isTrue)),
    );
    expect(operador.conSesion, isFalse, reason: 'la sesión local se descarta');
    expect(operador.esAdmin, isFalse);
    expect(avisos, hasLength(1));
    expect(avisos.first.toLowerCase(), contains(nombre));
    expect(avisos.first.toLowerCase(), contains('desactivado'));

    // El administrador sigue tan tranquilo.
    expect((await admin.listarFacturas())['success'], isTrue);
    await admin.eliminarUsuario(id);
    await admin.cerrarSesion();
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
