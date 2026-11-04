import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/red_segura.dart';

class ApiAnuncio extends Api {
  Map<String, dynamic> estado = {};
  @override Future<Map<String, dynamic>> panelEstadoConsola() async => estado;
}
class RedFalsa extends RedSegura {
  RedFalsa(this.identidad) : super(node:'', script:'', datos:'');
  EstadoRedSegura identidad;
  bool falla = false;
  @override Future<EstadoRedSegura> consultar() async {
    if (falla) throw StateError('error');
    return identidad;
  }
}
class ControlNavegador extends ControladorServidor {
  ControlNavegador({required super.ajustes, required super.api, required this.dir, required this.red});
  final Directory dir;
  final RedFalsa red;
  Set<String> ips = {};
  @override Directory get carpetaDatos => dir;
  @override RedSegura get redSegura => red;
  @override Future<Set<String>> ipsLocales() async => ips;
}
void main() {
  test('HTTP local solo sin identidad protegida; HTTPS usa nombres cubiertos y falla cerrado', () async {
    final dir = await Directory.systemTemp.createTemp('sgf-enlaces-');
    final api = ApiAnuncio();
    final ajustes = Ajustes()..puerto = 443;
    final red = RedFalsa(const EstadoRedSegura(activa:true, nombre:'sgf-123456abcdef.local', dns:'sgf.ejemplo.test', ip:'105.34.3.13'));
    final c = ControlNavegador(ajustes:ajustes, api:api, dir:dir, red:red)..estado = EstadoServidor.enMarcha;
    try {
      expect(await c.enlaceParaNavegador(), 'http://127.0.0.1:443');
      await Directory('${dir.path}/red-protegida').create();
      c.ips = {'105.34.3.13'};
      api.estado = {'accesoRed': {'estado':'activo', 'enlace':'https://sgf-123456abcdef.local'}};
      expect(await c.enlacesRed(), ['https://sgf.ejemplo.test', 'https://105.34.3.13', 'https://sgf-123456abcdef.local']);
      expect(await c.enlaceParaNavegador(), 'https://sgf.ejemplo.test');
      ajustes.puerto = 8443;
      api.estado = {'accesoRed': {'estado':'activo', 'enlace':'https://sgf-123456abcdef.local:8443'}};
      expect(await c.enlacesRed(), ['https://sgf.ejemplo.test:8443', 'https://105.34.3.13:8443', 'https://sgf-123456abcdef.local:8443']);
      red.identidad = const EstadoRedSegura(activa:true, nombre:'sgf-123456abcdef.local', ip:'105.34.3.13');
      c.ips = {};
      api.estado = {'accesoRed': {'estado':'activo', 'enlace':'http://sgf-123456abcdef.local:8443'}};
      expect(await c.enlacesRed(), isEmpty);
      expect(await c.enlaceParaNavegador(), isNull);
      api.estado = {'accesoRed': {'estado':'activo', 'enlace':'https://suplantador.local:8443'}};
      expect(await c.enlacesRed(), isEmpty);
      red.falla = true;
      await expectLater(c.enlaceParaNavegador(), throwsStateError);
      c.estado = EstadoServidor.detenido;
      expect(await c.enlaceParaNavegador(), isNull);
    } finally { c.dispose(); await dir.delete(recursive:true); }
  });
}
