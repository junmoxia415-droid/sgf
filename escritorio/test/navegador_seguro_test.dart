import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/red_segura.dart';

class ApiAnuncio extends Api {
  Map<String, dynamic> estado = {};
  @override Future<Map<String, dynamic>> enlaceRedConsola() async => estado;
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
  Set<String> dns = {};
  @override Future<Set<String>> resolverDns(String nombre) async => dns;
  @override Future<Set<String>> ipsLocalesDns() async => ips;
  @override Directory get carpetaDatos => dir;
  @override RedSegura get redSegura => red;
  @override Future<Set<String>> ipsLocales() async => ips;
}
void main() {
  test('HTTP local solo sin identidad protegida; HTTPS usa nombres cubiertos y falla cerrado', () async {
    final dir = await Directory.systemTemp.createTemp('sgf-enlaces-');
    final api = ApiAnuncio();
    final codigo = 'A' * 43;
    final ajustes = Ajustes()..puerto = 443;
    final red = RedFalsa(const EstadoRedSegura(activa:true, nombre:'sgf-123456abcdef.local', dns:'sgf.ejemplo.test', ip:'105.34.3.13'));
    final c = ControlNavegador(ajustes:ajustes, api:api, dir:dir, red:red)..estado = EstadoServidor.enMarcha;
    try {
      expect(await c.enlaceParaNavegador(), 'http://127.0.0.1:443');
      await Directory('${dir.path}/red-protegida').create();
      c.ips = {'105.34.3.13'};
      api.estado = {'codigoEnlace': codigo, 'accesoRed': {'estado':'activo', 'enlace':'https://sgf-123456abcdef.local'}};
      expect(await c.enlacesRed(), ['https://sgf.ejemplo.test#sgf=$codigo', 'https://105.34.3.13#sgf=$codigo', 'https://sgf-123456abcdef.local#sgf=$codigo']);
      expect(await c.enlaceParaNavegador(), 'https://sgf.ejemplo.test#sgf=$codigo');
      api.estado = {'accesoDirecto': true, 'accesoRed': {'estado':'activo', 'enlace':'https://sgf-123456abcdef.local'}};
      expect(await c.enlacesRed(), ['https://sgf.ejemplo.test', 'https://105.34.3.13', 'https://sgf-123456abcdef.local']);
      expect(await c.enlaceParaNavegador(), 'https://sgf.ejemplo.test');
      ajustes.nombreDnsFijo = 'sgf.vcl.mn';
      c.dns = {'105.34.3.13'};
      expect((await c.enlacesRed()).first, 'https://sgf.vcl.mn');
      c.dns = {'198.51.100.60'};
      expect(await c.enlacesRed(), isNot(contains('https://sgf.vcl.mn')), reason:'No se ofrece un DNS que apunta a otra PC');
      c.dns = {'105.34.3.13', '198.51.100.60'};
      expect(await c.enlacesRed(), isNot(contains('https://sgf.vcl.mn')), reason:'No se ofrece DNS ambiguo');
      c.dns = {'105.34.3.13', '2001:db8::1'};
      expect(await c.enlacesRed(), isNot(contains('https://sgf.vcl.mn')), reason:'No se ofrece si AAAA apunta a otra PC');
      ajustes.nombreDnsFijo = null;
      ajustes.puerto = 8443;
      api.estado = {'codigoEnlace': codigo, 'accesoRed': {'estado':'activo', 'enlace':'https://sgf-123456abcdef.local:8443'}};
      expect(await c.enlacesRed(), ['https://sgf.ejemplo.test:8443#sgf=$codigo', 'https://105.34.3.13:8443#sgf=$codigo', 'https://sgf-123456abcdef.local:8443#sgf=$codigo']);
      red.identidad = const EstadoRedSegura(activa:true, nombre:'sgf-123456abcdef.local', ip:'105.34.3.13', ips:['105.34.3.13','192.168.8.5']);
      c.ips = {'105.34.3.13','192.168.8.5'};
      api.estado = {'codigoEnlace': codigo};
      expect(await c.enlacesRed(), ['https://105.34.3.13:8443#sgf=$codigo','https://192.168.8.5:8443#sgf=$codigo']);
      red.identidad = const EstadoRedSegura(activa:true, nombre:'sgf-123456abcdef.local', ip:'105.34.3.13');
      c.ips = {};
      api.estado = {'codigoEnlace': codigo, 'accesoRed': {'estado':'activo', 'enlace':'http://sgf-123456abcdef.local:8443'}};
      expect(await c.enlacesRed(), isEmpty);
      expect(await c.enlaceParaNavegador(), isNull);
      api.estado = {'codigoEnlace': codigo, 'accesoRed': {'estado':'activo', 'enlace':'https://suplantador.local:8443'}};
      expect(await c.enlacesRed(), isEmpty);
      api.estado = {};
      await expectLater(c.enlacesRed(), throwsStateError, reason:'No mostrar enlaces sin invitación');
      red.falla = true;
      await expectLater(c.enlaceParaNavegador(), throwsStateError);
      c.estado = EstadoServidor.detenido;
      expect(await c.enlaceParaNavegador(), isNull);
    } finally { c.dispose(); await dir.delete(recursive:true); }
  });
}
