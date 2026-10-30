import 'dart:convert';
import 'dart:io';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:http/io_client.dart';

/// Canal HTTPS efímero del servidor hijo, autenticado por su huella. La huella
/// se recibe por su tubería y su MAC se verifica antes de usarla. No modifica
/// certificados globales ni pretende ofrecer HTTPS a otras computadoras.
class CanalLocalSeguro {
  CanalLocalSeguro._(this.puerto, this.huella);
  final int puerto;
  final String huella;
  String get base => 'https://127.0.0.1:$puerto';

  static CanalLocalSeguro? desdeAnuncio(String linea, String token) {
    const prefijo = '[SGF_TLS] ';
    if (!linea.startsWith(prefijo) || token.length < 16) return null;
    try {
      final json = jsonDecode(linea.substring(prefijo.length)) as Map<String, dynamic>;
      final puerto = json['puerto']; final huella = json['huella']; final mac = json['mac'];
      final hex = RegExp(r'^[0-9a-f]{64}$');
      if (puerto is! int || puerto < 1 || puerto > 65535 || huella is! String || !hex.hasMatch(huella) || mac is! String || !hex.hasMatch(mac)) return null;
      final esperado = Hmac(sha256, utf8.encode(token)).convert(utf8.encode('SGF_TLS:$puerto:$huella')).toString();
      var diferencia = 0;
      for (var i = 0; i < esperado.length; i++) { diferencia |= esperado.codeUnitAt(i) ^ mac.codeUnitAt(i); }
      if (diferencia != 0) return null;
      return CanalLocalSeguro._(puerto, huella);
    } catch (_) { return null; }
  }

  http.Client crearCliente() {
    // No se confía en autoridades del sistema. Se acepta únicamente el
    // certificado exacto de este proceso y el destino local esperado.
    final cliente = HttpClient(context: SecurityContext(withTrustedRoots: false));
    cliente.findProxy = (_) => 'DIRECT';
    cliente.badCertificateCallback = (cert, host, port) {
      final ahora=DateTime.now().toUtc();
      return host=='127.0.0.1' && port==puerto &&
          cert.startValidity.toUtc().isBefore(ahora) && cert.endValidity.toUtc().isAfter(ahora) &&
          sha256.convert(cert.der).toString()==huella;
    };
    return IOClient(cliente);
  }
}
