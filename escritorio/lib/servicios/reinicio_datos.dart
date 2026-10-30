import 'dart:io';
import 'guardia_datos.dart';

/// Procesa la elección explícita del instalador sin borrar datos. Mantiene tanto
/// el puerto como el bloqueo de la carpeta hasta finalizar el traslado: otro
/// servidor que use un puerto distinto tampoco puede usar esa misma base.
Future<String?> prepararReinicioLocal({
  required Directory carpeta,
  required File marcador,
  required int puerto,
  required AdquirirGuardia adquirirGuardia,
}) async {
  if (!await marcador.exists()) return null;
  ServerSocket? reserva;
  try {
    reserva = await ServerSocket.bind(InternetAddress.anyIPv4, puerto, shared: false);
  } on SocketException {
    return 'No se han cambiado los datos: el puerto $puerto está ocupado. Cierre todas las ventanas de SGF o reinicie Windows y vuelva a abrir la aplicación.';
  }
  SoltarGuardia? soltar;
  String? resultado;
  try {
    // No seguir si no podemos verificar la exclusión, ni mover un enlace que
    // podría apuntar fuera de la carpeta que el usuario pretendía archivar.
    final directorioDatos = '${carpeta.path}${Platform.pathSeparator}datos';
    if (await FileSystemEntity.type(carpeta.path, followLinks: false) == FileSystemEntityType.link ||
        await FileSystemEntity.type(directorioDatos, followLinks: false) == FileSystemEntityType.link) {
      throw StateError('La carpeta de datos es un enlace; el reinicio automático no puede archivarla con seguridad.');
    }
    soltar = await adquirirGuardia(carpeta);
    if (await carpeta.exists()) {
      final ahora = DateTime.now().toUtc().toIso8601String().replaceAll(RegExp(r'[^0-9]'), '');
      var destino = Directory('${carpeta.path}-respaldo-$ahora');
      var indice = 1;
      while (await destino.exists()) { destino = Directory('${carpeta.path}-respaldo-$ahora-${indice++}'); }
      await carpeta.rename(destino.path);
    }
    await marcador.delete();
  } catch (e) {
    resultado = 'No se pudo preparar el reinicio. No elimine archivos: revise la carpeta de respaldo y contacte al responsable. Detalle: $e';
  } finally {
    try { await soltar?.call(); } catch (e) {
      resultado ??= 'Los datos se archivaron, pero no se pudo cerrar el protector de datos. Cierre SGF y vuelva a abrirlo. Detalle: $e';
    }
    await reserva.close();
  }
  return resultado;
}
