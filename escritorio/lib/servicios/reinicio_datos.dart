import 'dart:io';

/// Procesa la elección explícita del instalador sin borrar datos. La carpeta
/// anterior se mueve íntegramente a un respaldo con nombre único. Se reserva el
/// puerto antes de mover nada para evitar que otro SGF siga usando la base.
Future<String?> prepararReinicioLocal({required Directory carpeta, required File marcador, required int puerto}) async {
  if (!await marcador.exists()) return null;
  ServerSocket? reserva;
  try {
    reserva = await ServerSocket.bind(InternetAddress.anyIPv4, puerto, shared: false);
  } on SocketException {
    return 'No se han cambiado los datos: el puerto $puerto está ocupado. Cierre todas las ventanas de SGF o reinicie Windows y vuelva a abrir la aplicación.';
  }
  try {
    if (await carpeta.exists()) {
      final ahora = DateTime.now().toUtc().toIso8601String().replaceAll(RegExp(r'[^0-9]'), '');
      var destino = Directory('${carpeta.path}-respaldo-$ahora');
      var indice = 1;
      while (await destino.exists()) { destino = Directory('${carpeta.path}-respaldo-$ahora-${indice++}'); }
      await carpeta.rename(destino.path);
    }
    await marcador.delete();
    return null;
  } catch (e) {
    return 'No se pudo preparar el reinicio. No elimine archivos: revise la carpeta de respaldo y contacte al responsable. Detalle: $e';
  } finally {
    await reserva.close();
  }
}
