import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/pantalla_principal.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/widgets/comunes.dart';

class ApiVisual extends Api {
  @override Future<Map<String, dynamic>> panelEstado() async => {'contadores': <String, dynamic>{}, 'bd': <String, dynamic>{}};
  @override Future<List<dynamic>> usuarios() async => [
    {'name':'Usuario de prueba', 'username':'prueba', 'role':'admin', 'active':true},
  ];
  @override Future<Map<String, dynamic>> get(String ruta) async => ruta.startsWith('/api/estadisticas')
      ? {'data': {'mesesDisponibles': <String>[]}}
      : {'data': <dynamic>[], 'meta': {'total':0, 'totalPages':1}};
}
class ControlVisual extends ControladorServidor {
  ControlVisual({required super.ajustes, required super.api});
  @override Future<List<String>> enlacesRed() async => ['https://sgf.ejemplo.test'];
}

void main() {
  for (final size in [const Size(1920, 1080), const Size(1040, 680)]) {
    testWidgets('Áreas alineadas arriba y sin desbordes en $size', (tester) async {
      tester.view.physicalSize = size;
      tester.view.devicePixelRatio = 1;
      addTearDown(tester.view.reset);
      final api = ApiVisual(); await api.usarToken('ficticio', 'Prueba');
      final ajustes = Ajustes();
      final servidor = ControlVisual(ajustes: ajustes, api: api)..estado = EstadoServidor.enMarcha;
      await tester.pumpWidget(MaterialApp(home: PantallaPrincipal(servidor: servidor, api: api, ajustes: ajustes)));
      await tester.pumpAndSettle();
      for (final nombre in ['Importar Excel', 'Datos de líneas', 'Usuarios', 'Estadísticas']) {
        final opcion = find.descendant(of: find.byType(NavigationRail), matching: find.text(nombre));
        await tester.ensureVisible(opcion); await tester.pumpAndSettle();
        await tester.tap(opcion); await tester.pumpAndSettle();
        expect(tester.takeException(), isNull, reason: '$nombre no debe desbordarse');
        final cabecera = find.byType(Cabecera);
        expect(cabecera, findsOneWidget);
        final contenido = find.ancestor(of: cabecera, matching: find.byType(SingleChildScrollView)).first;
        expect(tester.getTopLeft(cabecera).dy - tester.getTopLeft(contenido).dy, closeTo(22, 1), reason: '$nombre debe comenzar arriba');
        if (nombre == 'Datos de líneas') {
          // El catálogo en vacío ocupa el ancho útil, no solo el del buscador.
          expect(tester.getSize(find.byType(Card).last).width, greaterThan(size.width == 1920 ? 1000 : 700));
        }
      }
      await tester.pumpWidget(const SizedBox.shrink()); servidor.dispose();
    });
  }
}
