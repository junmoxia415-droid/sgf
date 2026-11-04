import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter/material.dart';
import 'package:sgf_escritorio/pantallas/asistente_inicial.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/inicio_windows.dart';
import 'package:sgf_escritorio/servicios/servicio_windows.dart';

void main() {
  test('La version experimental usa carpetas y marcador separados', () {
    expect(Ajustes.pruebaAislada, isTrue);
    expect(Ajustes.nombreCarpeta, 'SGF-PRUEBA-4.0.8');
    expect(Ajustes.carpeta.path.toLowerCase(), contains('sgf-prueba-4.0.8'));
    expect(Ajustes.marcadorReinicio.path.toLowerCase(), contains('sgf-prueba-4.0.8-solicitud-reinicio.txt'));
    expect(Ajustes.marcadorReinicio.path, isNot(endsWith('${Platform.pathSeparator}SGF-solicitud-reinicio.txt')));
  }, skip: !Ajustes.pruebaAislada ? 'Se ejecuta con SGF_PRUEBA_AISLADA=true' : false);

  testWidgets('El asistente de prueba solo ofrece datos locales', (tester) async {
    tester.view.physicalSize=const Size(1400,1000); tester.view.devicePixelRatio=1;
    addTearDown(tester.view.reset);
    final ajustes=Ajustes(),api=Api();
    final servidor=ControladorServidor(ajustes:ajustes,api:api);
    await tester.pumpWidget(MaterialApp(home:AsistenteInicial(servidor:servidor,api:api,ajustes:ajustes)));
    await tester.pumpAndSettle();
    expect(find.text('En este equipo (recomendado)'),findsOneWidget);
    expect(find.text('Base de datos Oracle de la empresa'),findsNothing);
    expect(find.text('Base de datos SQL Server de la empresa'),findsNothing);
    await tester.pumpWidget(const SizedBox.shrink());servidor.dispose();
  }, skip: !Ajustes.pruebaAislada);

  test('La version experimental no toca el inicio ni el servicio Windows', () async {
    var ejecuciones=0;
    final inicio=InicioWindows(windows:true, ejecutar:(p,a) async { ejecuciones++; return ProcessResult(1,0,'',''); });
    expect(inicio.disponible,isFalse);
    expect(await inicio.activo(),isFalse);
    await expectLater(inicio.establecer(true),throwsA(isA<UnsupportedError>()));
    await expectLater(inicio.establecer(false),throwsA(isA<UnsupportedError>()));
    final servicio=ServicioWindows(aplicacion:'no-usar',datos:'no-usar',windows:true);
    for (final accion in ['instalar','iniciar','detener','desactivar']) {
      await expectLater(servicio.ejecutar(accion),throwsA(isA<UnsupportedError>()));
    }
    expect(ejecuciones,0);
  }, skip: !Ajustes.pruebaAislada ? 'Se ejecuta con SGF_PRUEBA_AISLADA=true' : false);
}
