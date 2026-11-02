import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/seleccion_puerto.dart';

void main() {
  test('Omite un puerto ocupado y no detiene el servicio existente', () async {
    final ocupado = await ServerSocket.bind(InternetAddress.loopbackIPv4, 0);
    final libre = await ServerSocket.bind(InternetAddress.anyIPv4, 0);
    final siguiente = libre.port;
    await libre.close();
    try {
      expect(await puertoDisponible(ocupado.port), isFalse);
      expect(await seleccionarPuertoLibre(preferidos:[ocupado.port,siguiente]), siguiente);
      final c = await Socket.connect(InternetAddress.loopbackIPv4, ocupado.port);
      await c.close();
    } finally { await ocupado.close(); }
  });
  test('Si todas las opciones están ocupadas obtiene un puerto alternativo', () async {
    final ocupado = await ServerSocket.bind(InternetAddress.anyIPv4, 0);
    try {
      final elegido = await seleccionarPuertoLibre(preferidos:[ocupado.port]);
      expect(elegido, isNot(ocupado.port));
      expect(elegido, inInclusiveRange(1024, 65535));
    } finally { await ocupado.close(); }
  });
}
