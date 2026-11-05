import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/inicio.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';

class ApiInicio extends Api {
  @override Future<Map<String, dynamic>> panelEstado() async => {'contadores': <String,dynamic>{}, 'bd': <String,dynamic>{}};
}
class ControlInicio extends ControladorServidor {
  ControlInicio({required super.ajustes, required super.api});
  final resultado = Completer<List<String>>();
  int consultas = 0;
  @override Future<List<String>> enlacesRed() { consultas++; return resultado.future; }
}
class ControlCambioNombre extends ControladorServidor {
  ControlCambioNombre({required super.ajustes,required super.api});
  List<String> actual=['https://sgf-123456abcdef.local'];
  @override Future<List<String>> enlacesRed() async => actual;
}
void main() {
  testWidgets('Inicio actualiza el nombre corto al anunciarse y lo retira ante conflicto', (tester) async {
    tester.view.physicalSize=const Size(1400,1000);tester.view.devicePixelRatio=1;addTearDown(tester.view.reset);
    final api=ApiInicio();await api.usarToken('falso','prueba');
    final c=ControlCambioNombre(ajustes:Ajustes(),api:api)..estado=EstadoServidor.enMarcha;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:InicioPantalla(servidor:c,api:api,irA:(_){},iniciarSesion:() async=>true)))));
    await tester.pumpAndSettle();expect(find.text('https://sgf-123456abcdef.local'),findsOneWidget);
    c.actual=['https://sgf-minint.local'];await tester.pump(const Duration(seconds:4));await tester.pumpAndSettle();
    expect(find.text('https://sgf-minint.local'),findsOneWidget);expect(find.text('https://sgf-123456abcdef.local'),findsNothing);
    c.actual=['https://sgf-123456abcdef.local'];await tester.pump(const Duration(seconds:10));await tester.pumpAndSettle();
    expect(find.text('https://sgf-minint.local'),findsNothing);expect(find.text('https://sgf-123456abcdef.local'),findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());c.dispose();
  });

  testWidgets('Carga, HTTPS y redibujado muestran estados correctos', (tester) async {
    tester.view.physicalSize = const Size(1400, 1000); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api=ApiInicio(); await api.usarToken('falso', 'prueba');
    final c=ControlInicio(ajustes:Ajustes(),api:api)..estado=EstadoServidor.enMarcha;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: InicioPantalla(
      servidor:c, api:api, irA:(_){}, iniciarSesion:() async => true,
    )))));
    await tester.pump();
    expect(find.text('Comprobando enlaces de red…'), findsOneWidget);
    expect(find.textContaining('No hay enlaces disponibles'), findsNothing);
    expect(find.textContaining('HTTP no cifra'), findsNothing);
    c.resultado.complete(['https://sgf.ejemplo.test']);
    await tester.pumpAndSettle();
    expect(find.text('https://sgf.ejemplo.test'), findsOneWidget);
    expect(find.textContaining('certificado de confianza'), findsOneWidget);
    expect(find.textContaining('HTTP no cifra'), findsNothing);
    expect(c.consultas, 1);
    await tester.pumpWidget(const SizedBox.shrink()); c.dispose();
  });
}
