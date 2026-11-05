import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/servidor.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/inicio_windows.dart';
import 'package:sgf_escritorio/servicios/red_segura.dart';

class ApiNombrePrueba extends Api {
  @override
  Future<Map<String, dynamic>> panelEstado() async => {
    'accesoRed': {'estado': 'activo', 'enlace': 'http://sgf-123456abcdef.local:3000'},
  };
}

class ControlRedPrueba extends ControladorServidor {
  ControlRedPrueba({required super.ajustes, required super.api});
  @override
  Future<List<String>> enlacesRed() async => ['http://192.168.50.22:3000'];
}

class ApiEnlaceHttps extends Api {
  final codigo = 'Z' * 43;
  @override Future<Map<String, dynamic>> panelEstado() async => {'codigoEnlace':codigo, 'accesoDirecto':true, 'accesoRed':{'estado':'activo','enlace':'https://sgf-123456abcdef.local'}};
}
class RedEnlacePrueba extends RedSegura {
  RedEnlacePrueba() : super(node:'',script:'',datos:'');
  @override Future<EstadoRedSegura> consultar() async => const EstadoRedSegura(activa:true, nombre:'sgf-123456abcdef.local', dns:'sgf.ejemplo.test', huella:'abc', caduca:'prueba', certificadoPublico:'prueba');
}
class ControlEnlaceHttps extends ControlRedPrueba {
  ControlEnlaceHttps({required super.ajustes,required super.api});
  @override RedSegura get redSegura => RedEnlacePrueba();
  void encender() { estado=EstadoServidor.enMarcha; notifyListeners(); }
}

class ControlNombreFijo extends ControlEnlaceHttps {
  ControlNombreFijo({required super.ajustes,required super.api});
  @override Future<void> guardarNombreDnsFijo(String nombre) async { ajustes.nombreDnsFijo=nombre.trim().toLowerCase(); }
  @override Future<List<String>> enlacesRed() async => ajustes.nombreDnsFijo == null ? [] : ['https://${ajustes.nombreDnsFijo}'];
}

void main() {
  testWidgets('Configura nombre fijo y advierte si el certificado no lo cubre', (tester) async {
    tester.view.physicalSize=const Size(1040,680);tester.view.devicePixelRatio=1;addTearDown(tester.view.reset);
    final ajustes=Ajustes(puerto:443), api=ApiEnlaceHttps();
    final servidor=ControlNombreFijo(ajustes:ajustes,api:api)..estado=EstadoServidor.enMarcha;
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:ServidorPantalla(
      servidor:servidor,api:api,ajustes:ajustes,iniciarSesion:() async=>true,inicioWindows:InicioWindows(windows:false),
    )))));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Configurar nombre DNS fijo'));await tester.pumpAndSettle();
    await tester.tap(find.text('Configurar nombre DNS fijo'));await tester.pumpAndSettle();
    expect(find.textContaining('SGF no crea ni modifica'),findsOneWidget);
    await tester.enterText(find.byType(TextField).last,'sgf.vcl.mn');
    await tester.tap(find.text('Guardar nombre'));await tester.pumpAndSettle();
    expect(ajustes.nombreDnsFijo,'sgf.vcl.mn');
    expect(find.text('https://sgf.vcl.mn'),findsOneWidget);
    expect(find.textContaining('certificado actual no cubre este nombre'),findsOneWidget);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink());servidor.dispose();
  });

  testWidgets('Al arrancar, el enlace aparece sin pulsar Actualizar', (tester) async {
    tester.view.physicalSize = const Size(1400, 1200); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    final ajustes=Ajustes(puerto:443), api=ApiEnlaceHttps();
    final servidor=ControlEnlaceHttps(ajustes:ajustes,api:api);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: ServidorPantalla(
      servidor:servidor, api:api, ajustes:ajustes, iniciarSesion:() async=>true, inicioWindows:InicioWindows(windows:false),
    )))));
    await tester.pumpAndSettle();
    final enlace='https://sgf.ejemplo.test';
    expect(find.text(enlace),findsNothing);
    servidor.encender();
    await tester.pumpAndSettle();
    expect(find.text(enlace),findsOneWidget);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink()); servidor.dispose();
  });

  testWidgets('Muestra y copia el enlace corto desde Servidor', (tester) async {
    tester.view.physicalSize = const Size(1400, 1200); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    String? copiado;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copiado = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final ajustes = Ajustes(puerto:443); final api = ApiEnlaceHttps();
    final servidor = ControlEnlaceHttps(ajustes:ajustes,api:api)..estado=EstadoServidor.enMarcha;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: ServidorPantalla(
      servidor:servidor, api:api, ajustes:ajustes, iniciarSesion:() async=>true, inicioWindows:InicioWindows(windows:false),
    )))));
    await tester.pumpAndSettle();
    final enlace='https://sgf.ejemplo.test';
    expect(find.text(enlace),findsOneWidget);
    await tester.ensureVisible(find.text('Copiar DNS')); await tester.pumpAndSettle();
    await tester.tap(find.text('Copiar DNS')); await tester.pumpAndSettle();
    expect(copiado,enlace);
    expect(tester.takeException(),isNull);
    await tester.pumpWidget(const SizedBox.shrink()); servidor.dispose();
  });

  testWidgets('El nombre local anunciado aparece y se copia', (tester) async {
    tester.view.physicalSize = const Size(1400, 1200); tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.reset);
    String? copiado;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, (call) async {
      if (call.method == 'Clipboard.setData') copiado = (call.arguments as Map)['text'] as String?;
      return null;
    });
    addTearDown(() => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(SystemChannels.platform, null));
    final ajustes = Ajustes(); final api = ApiNombrePrueba();
    final servidor = ControlRedPrueba(ajustes: ajustes, api: api)..estado = EstadoServidor.enMarcha;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child: ServidorPantalla(
      servidor: servidor, api: api, ajustes: ajustes, iniciarSesion: () async => true,
      inicioWindows: InicioWindows(windows: false),
    )))));
    await tester.pumpAndSettle();
    expect(find.text('http://sgf-123456abcdef.local:3000'), findsOneWidget);
    await tester.ensureVisible(find.text('Copiar nombre local')); await tester.pumpAndSettle();
    await tester.tap(find.text('Copiar nombre local')); await tester.pumpAndSettle();
    expect(copiado, 'http://sgf-123456abcdef.local:3000');
    await tester.pumpWidget(const SizedBox.shrink()); servidor.dispose();
  });

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
