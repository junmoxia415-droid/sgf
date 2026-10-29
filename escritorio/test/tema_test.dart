import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/main.dart' show temaSgf;
import 'package:sgf_escritorio/pantallas/pantalla_principal.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';

class AjustesPrueba extends Ajustes {
  @override
  Future<void> guardar() async {}
}
class ApiPrueba extends Api {
  @override
  Future<Map<String, dynamic>> panelEstado() async => {'contadores': <String, dynamic>{}, 'bd': <String, dynamic>{}};
  @override
  Future<Map<String, dynamic>> periodos() async => {'facturasPorMes': 2, 'meses': []};
}
class AppPrueba extends StatefulWidget {
  const AppPrueba({super.key, required this.ajustes, required this.api, required this.servidor});
  final Ajustes ajustes;
  final Api api;
  final ControladorServidor servidor;
  @override
  State<AppPrueba> createState() => _AppPruebaState();
}
class _AppPruebaState extends State<AppPrueba> {
  @override
  Widget build(BuildContext context) => MaterialApp(
    theme: temaSgf(Brightness.light), darkTheme: temaSgf(Brightness.dark),
    themeMode: widget.ajustes.temaOscuro ? ThemeMode.dark : ThemeMode.light,
    home: PantallaPrincipal(ajustes: widget.ajustes, api: widget.api, servidor: widget.servidor, alCambiarTema: () => setState(() {})),
  );
}
void main() {
  testWidgets('El tema cambia en toda la aplicación al pulsar el interruptor', (tester) async {
    tester.view.physicalSize = const Size(1400, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final ajustes = AjustesPrueba();
    final api = ApiPrueba();
    final servidor = ControladorServidor(ajustes: ajustes, api: api);
    await tester.pumpWidget(AppPrueba(ajustes: ajustes, api: api, servidor: servidor));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Ajustes y guía'));
    await tester.pumpAndSettle();
    expect(Theme.of(tester.element(find.text('Tema oscuro'))).brightness, Brightness.light);
    await tester.tap(find.text('Tema oscuro'));
    await tester.pumpAndSettle();
    expect(ajustes.temaOscuro, isTrue);
    expect(Theme.of(tester.element(find.text('Tema oscuro'))).brightness, Brightness.dark);
    await tester.pumpWidget(const SizedBox.shrink());
    servidor.dispose();
  });
  testWidgets('Inicio y ajustes caben en la ventana mínima de 1040 por 680', (tester) async {
    tester.view.physicalSize = const Size(1040, 680);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final ajustes = AjustesPrueba();
    final api = ApiPrueba();
    final servidor = ControladorServidor(ajustes: ajustes, api: api);
    await tester.pumpWidget(AppPrueba(ajustes: ajustes, api: api, servidor: servidor));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.tap(find.text('Ajustes y guía'));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(const SizedBox.shrink());
    servidor.dispose();
  });

}
