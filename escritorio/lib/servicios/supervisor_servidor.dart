import 'dart:async';
import 'controlador_servidor.dart';

/// Recupera caídas inesperadas mientras la aplicación está abierta.
/// No sustituye a un servicio de Windows anterior al inicio de sesión.
class SupervisorServidor {
  SupervisorServidor({required this.servidor, DateTime Function()? reloj}) : _reloj = reloj ?? DateTime.now;
  final ControladorServidor servidor;
  final DateTime Function() _reloj;
  Timer? _timer;
  bool _recuperando = false;
  Completer<void>? _terminado;
  bool _detenido = false;
  int _intentos = 0;
  DateTime? _reintentarDesde;
  DateTime? _funcionandoDesde;
  int get intentos => _intentos;

  void iniciar() {
    _detenido = false;
    _timer ??= Timer.periodic(const Duration(seconds: 5), (_) => comprobar());
  }

  Future<void> comprobar() async {
    if (_detenido || _recuperando || !servidor.ajustes.reiniciarEnFallo) return;
    final ahora = _reloj();
    if (servidor.estado == EstadoServidor.enMarcha) {
      _funcionandoDesde ??= ahora;
      if (ahora.difference(_funcionandoDesde!) >= const Duration(minutes: 2)) {
        _intentos = 0;
        _reintentarDesde = null;
      }
      return;
    }
    _funcionandoDesde = null;
    if (servidor.estado != EstadoServidor.fallo || _intentos >= 3 ||
        (_reintentarDesde != null && ahora.isBefore(_reintentarDesde!))) return;
    _recuperando = true;
    _terminado = Completer<void>();
    _intentos++;
    try {
      servidor.anotar('Recuperación automática: intento $_intentos de 3.');
      await servidor.arrancar();
    } catch (e) {
      servidor.anotar('No se pudo reiniciar automáticamente: $e');
    } finally {
      _recuperando = false;
      final espera = [5, 15, 60][_intentos - 1];
      _reintentarDesde = _reloj().add(Duration(seconds: espera));
      if (_intentos >= 3 && servidor.estado == EstadoServidor.fallo) {
        servidor.anotar('La recuperación automática se detuvo tras 3 intentos. Revise el error y pulse Iniciar.');
      }
      _terminado?.complete();
      _terminado = null;
    }
  }

  Future<void> detener() async {
    _detenido = true;
    _timer?.cancel();
    _timer = null;
    // Esperar al arranque en curso antes de permitir el cierre del servidor;
    // de lo contrario podría nacer un proceso después de cerrar la ventana.
    await _terminado?.future;
  }
}
