import 'dart:async';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/supervisor_servidor.dart';

class ServidorFalso extends ControladorServidor {
  ServidorFalso(Ajustes ajustes) : super(ajustes: ajustes, api: Api());
  int llamadas = 0;
  bool responderBien = false;
  Completer<void>? pendiente;
  @override
  Future<bool> arrancar({bool esperar = true}) async {
    llamadas++;
    if (pendiente != null) await pendiente!.future;
    estado = responderBien ? EstadoServidor.enMarcha : EstadoServidor.fallo;
    return responderBien;
  }
}

void main() {
  test('Recupera solo fallos, limita intentos y espera entre ellos', () async {
    var ahora = DateTime(2026, 1, 1);
    final servidor = ServidorFalso(Ajustes());
    final supervisor = SupervisorServidor(servidor: servidor, reloj: () => ahora);
    await supervisor.comprobar(); expect(servidor.llamadas, 0); // detenido a propósito
    servidor.estado = EstadoServidor.fallo;
    await supervisor.comprobar(); expect(servidor.llamadas, 1);
    await supervisor.comprobar(); expect(servidor.llamadas, 1);
    ahora = ahora.add(const Duration(seconds: 5));
    await supervisor.comprobar(); expect(servidor.llamadas, 2);
    ahora = ahora.add(const Duration(seconds: 14));
    await supervisor.comprobar(); expect(servidor.llamadas, 2);
    ahora = ahora.add(const Duration(seconds: 1));
    await supervisor.comprobar(); expect(servidor.llamadas, 3);
    ahora = ahora.add(const Duration(minutes: 5));
    await supervisor.comprobar(); expect(servidor.llamadas, 3);
    expect(servidor.registro.any((x) => x.contains('se detuvo tras 3 intentos')), isTrue);
    await supervisor.detener(); servidor.dispose();
  });

  test('Se puede desactivar y reinicia el contador después de estabilidad', () async {
    var ahora = DateTime(2026, 1, 1);
    final ajustes = Ajustes(reiniciarEnFallo: false);
    final servidor = ServidorFalso(ajustes)..estado = EstadoServidor.fallo;
    final supervisor = SupervisorServidor(servidor: servidor, reloj: () => ahora);
    await supervisor.comprobar(); expect(servidor.llamadas, 0);
    ajustes.reiniciarEnFallo = true; servidor.responderBien = true;
    await supervisor.comprobar(); expect(servidor.llamadas, 1);
    await supervisor.comprobar();
    ahora = ahora.add(const Duration(minutes: 2));
    await supervisor.comprobar(); expect(supervisor.intentos, 0);
    servidor.estado = EstadoServidor.fallo;
    await supervisor.comprobar(); expect(servidor.llamadas, 2);
    await supervisor.detener(); servidor.dispose();
  });

  test('El cierre espera a la recuperación en curso y evita intentos paralelos', () async {
    final servidor = ServidorFalso(Ajustes())..estado = EstadoServidor.fallo;
    servidor.pendiente = Completer<void>();
    final supervisor = SupervisorServidor(servidor: servidor);
    final primero = supervisor.comprobar();
    await supervisor.comprobar(); expect(servidor.llamadas, 1);
    var terminado = false;
    final cierre = supervisor.detener().then((_) => terminado = true);
    await Future<void>.delayed(Duration.zero); expect(terminado, isFalse);
    servidor.pendiente!.complete(); await primero; await cierre;
    expect(terminado, isTrue);
    await supervisor.comprobar(); expect(servidor.llamadas, 1);
    servidor.dispose();
  });
}
