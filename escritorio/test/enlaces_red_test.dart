import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/servidor.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/inicio_windows.dart';

class ControlRedPrueba extends ControladorServidor {
  ControlRedPrueba({required super.ajustes, required super.api});
  @override
  Future<List<String>> enlacesRed() async => ['http://192.168.50.22:3000'];
}

void main() {
  testWidgets('El enlace de red aparece y se copia para otra PC', (tester) async {
    tester.view.physicalSize = const Size(1400, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    String? copiado;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copiado = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final ajustes = Ajustes(); final api = Api();
    final servidor = ControlRedPrueba(ajustes: ajustes, api: api);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: ServidorPantalla(
      servidor: servidor, api: api, ajustes: ajustes, iniciarSesion: () async => true,
      inicioWindows: InicioWindows(windows: false),
    )))));
    await tester.pumpAndSettle();
    expect(find.text('http://192.168.50.22:3000'), findsOneWidget);
    expect(find.text('El servidor está detenido: el enlace no funcionará hasta iniciarlo.'), findsOneWidget);
    await tester.ensureVisible(find.text('Copiar')); await tester.pumpAndSettle();
    await tester.tap(find.text('Copiar')); await tester.pumpAndSettle();
    expect(copiado, 'http://192.168.50.22:3000');
    await tester.pumpWidget(const SizedBox.shrink());
    servidor.dispose();
  });
}
