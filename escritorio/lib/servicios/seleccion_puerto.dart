import 'dart:io';

/// Probar la escucha en todas las interfaces, no solo en loopback.
/// El socket se libera antes de arrancar: el servidor debe detectar conflictos
/// posteriores y fallar cerrado, ya que otro proceso puede ganar la carrera.
Future<bool> puertoDisponible(int puerto) async {
  try {
    final socket = await ServerSocket.bind(InternetAddress.anyIPv4, puerto, shared: false);
    await socket.close();
    return true;
  } on SocketException { return false; }
}

Future<int> seleccionarPuertoLibre({List<int> preferidos = const [443, 8443, 9443]}) async {
  for (final puerto in preferidos) {
    if (puerto < 1 || puerto > 65535) throw ArgumentError('Puerto inválido');
    if (await puertoDisponible(puerto)) return puerto;
  }
  try {
    final socket = await ServerSocket.bind(InternetAddress.anyIPv4, 0, shared: false);
    final puerto = socket.port;
    await socket.close();
    if (puerto < 1024) throw StateError('No se obtuvo un puerto adecuado.');
    return puerto;
  } on SocketException { throw StateError('No se encontró un puerto disponible.'); }
}
