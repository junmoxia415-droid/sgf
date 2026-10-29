import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/acceso.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';

class ApiFalsa extends Api {
  @override
  Future<void> iniciarSesion(String usuario, String clave) async {
    if (clave != 'para-pruebas-123') throw ApiError('Datos incorrectos', 401);
    await usarToken('token-temporal', usuario);
    rol = 'usuario';
  }
}
void main() {
  testWidgets('Sin sesión no se muestra Inicio ni el menú de usuarios; al entrar sí se abre Inicio', (tester) async {
    tester.view.physicalSize = const Size(1400, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final api = ApiFalsa();
    final ajustes = Ajustes();
    final servidor = ControladorServidor(ajustes: ajustes, api: api);
    servidor.estado = EstadoServidor.enMarcha;
    await tester.pumpWidget(MaterialApp(home: AccesoSgf(servidor: servidor, api: api, ajustes: ajustes)));
    expect(find.text('Usuarios'), findsNothing);
    expect(find.text('Procesar y consultar facturas'), findsNothing);
    await tester.enterText(find.widgetWithText(TextField, 'Usuario'), 'persona');
    await tester.enterText(find.widgetWithText(TextField, 'Contraseña'), 'para-pruebas-123');
    await tester.tap(find.text('Entrar'));
    await tester.pumpAndSettle();
    expect(find.text('Procesar y consultar facturas'), findsOneWidget);
    expect(find.text('Usuarios'), findsNothing);
    expect(find.text('Servidor'), findsNothing);
    expect(find.text('Importar Excel'), findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());
    servidor.dispose();
  });
}
