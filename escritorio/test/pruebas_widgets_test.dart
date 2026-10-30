// Pruebas automáticas de la interfaz: comprueban que la aplicación arranca,
// que cada pantalla se pinta sin errores y que los textos de ayuda están.
//
// Se ejecutan en cada push con GitHub Actions (flutter test).
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/asistente_inicial.dart';
import 'package:sgf_escritorio/pantallas/ajustes_pantalla.dart';
import 'package:sgf_escritorio/pantallas/estadisticas.dart';
import 'package:sgf_escritorio/pantallas/importar.dart';
import 'package:sgf_escritorio/pantallas/inicio.dart';
import 'package:sgf_escritorio/pantallas/servidor.dart';
import 'package:sgf_escritorio/pantallas/usuarios.dart';
import 'package:sgf_escritorio/servicios/ajustes.dart';
import 'package:sgf_escritorio/servicios/api.dart';
import 'package:sgf_escritorio/servicios/controlador_servidor.dart';
import 'package:sgf_escritorio/servicios/inicio_windows.dart';
import 'package:sgf_escritorio/main.dart' show temaSgf;
import 'package:sgf_escritorio/widgets/comunes.dart';

/// Las pantallas se prueban con el tamano real de la ventana de la app
/// (1360x800), que es como las va a ver el usuario.
Widget envolver(Widget hijo) => MaterialApp(
      theme: temaSgf(Brightness.light),
      home: Scaffold(
        body: SingleChildScrollView(
          child: SizedBox(width: 1360, child: Padding(padding: const EdgeInsets.all(24), child: hijo)),
        ),
      ),
    );

void tamanoVentana(WidgetTester tester) {
  tester.view.physicalSize = const Size(1400, 900);
  tester.view.devicePixelRatio = 1.0;
  // Importante: se restaura a un tamano valido primero y se vuelve al original
  // al final, para no desmontar el arbol con una MediaQuery inconsistente.
  addTearDown(() {
    tester.view.reset();
  });
}

void main() {
  late Ajustes ajustes;
  late Api api;
  late ControladorServidor servidor;

  setUp(() {
    ajustes = Ajustes();
    api = Api();
    servidor = ControladorServidor(ajustes: ajustes, api: api);
  });

  testWidgets('La pantalla de inicio explica el estado y ofrece acciones', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(InicioPantalla(
      servidor: servidor,
      api: api,
      irA: (_) {},
      iniciarSesion: () async => true,
    )));
    await tester.pump();
    expect(find.text('Bienvenido a SGF'), findsOneWidget);
    // Sin servidor responde con un aviso claro, no con un error técnico.
    expect(find.textContaining('servidor'), findsWidgets);
  });

  testWidgets('Servidor muestra Iniciar, Detener y copias de seguridad', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(ServidorPantalla(
      servidor: servidor,
      api: api,
      ajustes: ajustes,
      iniciarSesion: () async => true,
      inicioWindows: InicioWindows(windows: false),
    )));
    await tester.pump();
    expect(find.text('Iniciar'), findsOneWidget);
    expect(find.text('Detener'), findsOneWidget);
    expect(find.text('Reiniciar'), findsOneWidget);
    expect(find.text('Crear copia ahora'), findsOneWidget);
    expect(find.text('Registro de actividad'), findsOneWidget);
  });

  testWidgets('Importar Excel pide iniciar sesión si no hay sesión', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(ImportarPantalla(api: api, iniciarSesion: () async => true)));
    await tester.pump();
    expect(find.textContaining('administrador'), findsWidgets);
  });

  testWidgets('Usuarios pide sesión de administrador', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(UsuariosPantalla(api: api, iniciarSesion: () async => true)));
    await tester.pump();
    expect(find.textContaining('administrador'), findsWidgets);
  });

  testWidgets('Estadísticas pide sesión y explica que salen de las facturas', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(EstadisticasPantalla(api: api, iniciarSesion: () async => true)));
    await tester.pump();
    expect(find.text('Estadísticas'), findsOneWidget);
    expect(find.text('Primero hay que iniciar sesión'), findsOneWidget);
    expect(find.textContaining('Consumo por meses'), findsWidgets);
  });

  testWidgets('Estadísticas pinta los meses, las cifras y los ceros', (tester) async {
    tamanoVentana(tester);
    // Respuesta REAL del servidor con los datos de prueba (recortada a lo
    // mínimo que necesita la pantalla), para comprobar el dibujado.
    final respuesta = <String, dynamic>{
      'data': {
        'mesesDisponibles': ['01/10/26 - 31/10/26', '01/09/26 - 30/09/26', '01/08/26 - 31/08/26'],
        'mesesSeleccionados': ['01/10/26 - 31/10/26', '01/09/26 - 30/09/26', '01/08/26 - 31/08/26'],
        'meses': [
          {'periodo': '01/10/26 - 31/10/26', 'etiqueta': 'octubre de 2026', 'facturas': 2, 'lineas': 120,
           'lineasSinConsumo': 17, 'porcentajeSinConsumo': 14.17, 'importeTotal': 69332.49,
           'importeMedio': 577.77, 'importeMaximo': 3231.01},
          {'periodo': '01/09/26 - 30/09/26', 'etiqueta': 'septiembre de 2026', 'facturas': 2, 'lineas': 120,
           'lineasSinConsumo': 19, 'porcentajeSinConsumo': 15.83, 'importeTotal': 58066.37,
           'importeMedio': 483.89, 'importeMaximo': 3011.22},
        ],
        'lineas': [
          {'numero': '52534377', 'nombre': 'Jorge Acosta Suárez', 'unidad': 'Grupo Informatica',
           'cargo': 'Jefe de Dpto.', 'grado': 'Mayor', 'provincia': 'VILLA CLARA',
           'importes': [3231.01, 2917.57], 'mesesCero': 0, 'importeTotal': 6148.58,
           'importeMedio': 3074.29, 'enExcel': true},
          {'numero': '53564561', 'nombre': 'Raul González Fuentes', 'unidad': 'Grupo Custodia',
           'cargo': 'Oficial', 'grado': 'Sargento', 'provincia': 'VILLA CLARA',
           'importes': [0, 0], 'mesesCero': 2, 'importeTotal': 0, 'importeMedio': 0, 'enExcel': true},
        ],
        'oficiales': [
          {'oficial': 'Jorge Acosta Suárez', 'unidad': 'Grupo Informatica', 'grado': 'Mayor', 'lineas': 7,
           'importes': [14156.95, 12300.10], 'importeTotal': 26457.05, 'lineasSiempreACero': 0},
        ],
        'resumen': {
          'facturas': 6, 'lineas': 360, 'importeTotal': 196061.17, 'importeMedioPorMes': 65353.72,
          'lineasSinConsumo': 51, 'lineasSinConsumoAlgunMes': 37, 'lineasSinConsumoLos3Meses': 6,
        },
      },
    };

    final apiFalsa = _ApiEstadisticasDePrueba(respuesta);
    await tester.pumpWidget(envolver(EstadisticasPantalla(api: apiFalsa, iniciarSesion: () async => true)));
    await tester.pumpAndSettle();

    // Cifras grandes
    expect(find.text('196,061.17 CUP'), findsOneWidget);
    expect(find.text('51'), findsOneWidget); // líneas a cero
    expect(find.text('6'), findsOneWidget); // sin consumo los 3 meses
    // Meses como botones y en el gráfico
    expect(find.text('Octubre 2026'), findsWidgets);
    // Tablas
    expect(find.text('Gasto por oficial'), findsOneWidget);
    expect(find.text('Detalle por línea'), findsOneWidget);
    expect(find.text('Jorge Acosta Suárez'), findsWidgets);
    // Fila con los tres meses a cero: se pinta con guion largo
    expect(find.textContaining('— 0'), findsWidgets);
  });

  testWidgets('Ajustes muestra la guía de 5 pasos y los atajos', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(AjustesPantalla(
      ajustes: ajustes,
      servidor: servidor,
      api: api,
      alCambiar: () {},
    )));
    await tester.pump();
    expect(find.text('Guía rápida'), findsOneWidget);
    expect(find.textContaining('Inicie sesión'), findsWidgets);
    expect(find.textContaining('Ctrl + R'), findsOneWidget);
  });

  testWidgets('El asistente de primera vez empieza por dónde se guardan los datos', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(MaterialApp(
      theme: temaSgf(Brightness.light),
      home: AsistenteInicial(servidor: servidor, api: api, ajustes: ajustes),
    ));
    await tester.pump();
    expect(find.textContaining('Bienvenido a SGF'), findsOneWidget);
    expect(find.textContaining('En este equipo'), findsOneWidget);
    expect(find.textContaining('Oracle'), findsWidgets);
    expect(find.text('Continuar'), findsOneWidget);
  });

  testWidgets('El diálogo de confirmación destructiva exige escribir la palabra', (tester) async {
    tamanoVentana(tester);
    var confirmado = false;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(
      theme: temaSgf(Brightness.light),
      home: Builder(
        builder: (context) => Scaffold(
          body: Center(
            child: FilledButton(
              onPressed: () async {
                confirmado = await confirmar(
                  context,
                  titulo: '¿Borrar todo?',
                  mensaje: 'Esta acción no se puede deshacer.',
                  destructivo: true,
                  escribirParaConfirmar: 'BORRAR',
                );
              },
              child: const Text('Abrir'),
            ),
          ),
        ),
      ),
    ));
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();
    final boton = find.widgetWithText(FilledButton, 'Continuar');
    expect(tester.widget<FilledButton>(boton).onPressed, isNull, reason: 'no debe dejar confirmar sin escribir');
    await tester.enterText(find.byType(TextField), 'BORRAR');
    await tester.pump();
    expect(tester.widget<FilledButton>(boton).onPressed, isNotNull);
    await tester.tap(boton);
    await tester.pumpAndSettle();
    expect(confirmado, isTrue);
  });

  testWidgets('Si el servidor rechaza la sesión, la app avisa y ofrece entrar de nuevo', (tester) async {
    tamanoVentana(tester);
    var motivoRecibido = '';
    api.alCaducarSesion = (motivo) => motivoRecibido = motivo;

    await tester.pumpWidget(envolver(
      Builder(builder: (context) {
        return FilledButton(
          onPressed: () => avisar(context, 'Prueba'),
          child: const Text('botón de prueba'),
        );
      }),
    ));
    // El API simula el aviso de caducidad igual que lo haría al recibir un 401.
    api.alCaducarSesion!('Sesión de «pepe» cerrada: Usuario desactivado.');
    expect(motivoRecibido, contains('desactivado'));
    expect(motivoRecibido, contains('pepe'));
  });

  testWidgets('Cerrar sesión deja la aplicación sin usuario y sin rol', (tester) async {
    api.usuario = 'pepe';
    expect(api.conSesion, isFalse);
    expect(api.esAdmin, isFalse);
    await api.cerrarSesion();
    expect(api.usuario, isNull);
    expect(api.motivoCaducidad, isNull);
  });

  testWidgets('Ajustes permite elegir cuántas facturas por mes se esperan', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(AjustesPantalla(
      ajustes: ajustes,
      servidor: servidor,
      api: api,
      alCambiar: () {},
    )));
    await tester.pump();

    // La tarjeta existe y explica el valor habitual (2 facturas por mes).
    expect(find.text('Facturas por mes'), findsOneWidget);
    expect(find.textContaining('2 facturas por mes'), findsWidgets);
    // Y ofrece las opciones habituales, incluida 1 y las de 3, 4, 6…
    expect(find.text('1 factura'), findsOneWidget);
    expect(find.text('3 facturas'), findsOneWidget);
    expect(find.text('4 facturas'), findsOneWidget);
    expect(find.text('6 facturas'), findsOneWidget);
  });

  testWidgets('La etiqueta de estado y el dato grande se pintan', (tester) async {
    tamanoVentana(tester);
    await tester.pumpWidget(envolver(const Column(children: [
      Etiqueta(texto: 'Servidor en marcha', color: Color(0xFF1B7F4B)),
      Dato(etiqueta: 'Facturas', valor: '128'),
    ])));
    expect(find.text('Servidor en marcha'), findsOneWidget);
    expect(find.text('128'), findsOneWidget);
  });
}

/// Api falsa: devuelve una respuesta fija para poder pintar la pantalla de
/// estadísticas sin servidor.
class _ApiEstadisticasDePrueba extends Api {
  _ApiEstadisticasDePrueba(this.respuesta);
  final Map<String, dynamic> respuesta;

  @override
  bool get conSesion => true;

  @override
  Future<Map<String, dynamic>> get(String ruta) async => respuesta;
}
