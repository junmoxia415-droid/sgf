import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:window_manager/window_manager.dart';

import 'servicios/ajustes.dart';
import 'servicios/api.dart';
import 'servicios/controlador_servidor.dart';
import 'servicios/reinicio_datos.dart';
import 'pantallas/asistente_inicial.dart';
import 'pantallas/acceso.dart';
import 'widgets/comunes.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Ventana de escritorio: tamano comodo para pantallas de 1366x768, titulo
  // propio y tamano minimo para que nada quede cortado.
  if (Platform.isWindows || Platform.isLinux || Platform.isMacOS) {
    await windowManager.ensureInitialized();
    const opciones = WindowOptions(
      size: Size(1360, 800),
      minimumSize: Size(1040, 680),
      center: true,
      title: 'SGF · Sistema de Gestión de Facturas',
      titleBarStyle: TitleBarStyle.normal,
    );
    unawaited(windowManager.waitUntilReadyToShow(opciones, () async {
      // Icono de la ventana (barra de tareas y Alt+Tab). En Windows el .exe ya
      // lleva el icono incrustado, pero esto lo fija tambien en tiempo de
      // ejecucion para que se vea igual en cualquier equipo.
      try {
        await windowManager.setIcon('assets/icono.png');
      } catch (_) {
        // si no se puede, se queda el icono del ejecutable
      }
      await windowManager.show();
      await windowManager.focus();
    }));
  }

  var ajustes = await Ajustes.cargar();
  final carpeta = Ajustes.carpeta;
  final marcador = File('${carpeta.parent.path}${Platform.pathSeparator}SGF-solicitud-reinicio.txt');
  final reinicioSolicitado = await marcador.exists();
  final errorReinicio = await prepararReinicioLocal(carpeta: carpeta, marcador: marcador, puerto: ajustes.puerto);
  if (errorReinicio != null) {
    runApp(MaterialApp(home: Scaffold(body: Center(child: Padding(
      padding: const EdgeInsets.all(32), child: Text(errorReinicio),
    )))));
    return;
  }
  if (reinicioSolicitado) ajustes = await Ajustes.cargar();

  // Cerrar la ventana para el servidor con orden, para que guarde la BD.
  runApp(SgfApp(ajustes: ajustes));
}

/// Atajos de teclado: Ctrl+R reinicia el servidor, Ctrl+B hace copia de
/// seguridad, F1 abre la guía. Se activan en toda la aplicación.
class _Atajos extends StatefulWidget {
  const _Atajos({required this.servidor, required this.child});
  final ControladorServidor servidor;
  final Widget child;

  @override
  State<_Atajos> createState() => _AtajosState();
}

class _AtajosState extends State<_Atajos> {
  @override
  void initState() {
    super.initState();
    HardwareKeyboard.instance.addHandler(_manejar);
  }

  @override
  void dispose() {
    HardwareKeyboard.instance.removeHandler(_manejar);
    super.dispose();
  }

  bool _manejar(KeyEvent evento) {
    if (evento is! KeyDownEvent) return false;
    final teclas = HardwareKeyboard.instance;
    if (evento.logicalKey == LogicalKeyboardKey.f1 && widget.servidor.abrirGuia != null) {
      widget.servidor.abrirGuia!();
      return true;
    }
    if (teclas.isControlPressed && evento.logicalKey == LogicalKeyboardKey.keyL && widget.servidor.iniciarSesion != null) {
      widget.servidor.iniciarSesion!();
      return true;
    }
    if (widget.servidor.api.esAdmin && teclas.isControlPressed && evento.logicalKey == LogicalKeyboardKey.keyR) {
      unawaited(widget.servidor.reiniciar());
      return true;
    }
    if (widget.servidor.api.esAdmin && teclas.isControlPressed && evento.logicalKey == LogicalKeyboardKey.keyB) {
      unawaited(() async {
        try {
          await widget.servidor.api.crearCopia();
          widget.servidor.anotar('Copia de seguridad creada con Ctrl+B.');
        } catch (e) {
          widget.servidor.anotar('No se pudo crear la copia: $e');
        }
      }());
      return true;
    }
    return false;
  }

  @override
  Widget build(BuildContext context) => widget.child;
}

class SgfApp extends StatefulWidget {
  const SgfApp({super.key, required this.ajustes});
  final Ajustes ajustes;

  @override
  State<SgfApp> createState() => _SgfAppState();
}

class _SgfAppState extends State<SgfApp> with WindowListener {
  late final ControladorServidor servidor;
  late final Api api;
  bool _arrancado = false;
  late Future<bool> _primeraVez;

  @override
  void initState() {
    super.initState();
    windowManager.addListener(this);
    unawaited(windowManager.setPreventClose(true));
    api = Api();
    servidor = ControladorServidor(ajustes: widget.ajustes, api: api);
    // Al abrir la aplicacion se arranca el servidor automaticamente
    // (a menos que el usuario lo haya desactivado en Ajustes).
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (widget.ajustes.arrancarAlAbrir) {
        await servidor.arrancar();
      } else {
        await servidor.comprobarSiYaEstaArriba();
      }
      _primeraVez = servidor.esPrimeraVez();
      if (mounted) setState(() => _arrancado = true);
    });
  }

  @override
  void onWindowClose() async {
    await servidor.detener();
    await windowManager.destroy();
  }

  @override
  void dispose() {
    windowManager.removeListener(this);
    servidor.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SGF · Sistema de Gestión de Facturas',
      debugShowCheckedModeBanner: false,
      theme: temaSgf(Brightness.light),
      darkTheme: temaSgf(Brightness.dark),
      themeMode: widget.ajustes.temaOscuro ? ThemeMode.dark : ThemeMode.light,
      locale: const Locale('es', 'ES'),
      supportedLocales: const [Locale('es', 'ES'), Locale('en', 'US')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      builder: (context, child) => _Atajos(servidor: servidor, child: child ?? const SizedBox.shrink()),
      home: !_arrancado
          ? const PantallaCarga(mensaje: 'Preparando el sistema…')
          : FutureBuilder<bool>(
              future: _primeraVez,
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const PantallaCarga(mensaje: 'Comprobando la instalación…');
                }
                if (snapshot.data == true) {
                  return AsistenteInicial(
                    servidor: servidor,
                    api: api,
                    ajustes: widget.ajustes,
                    alCambiarTema: () => setState(() {}),
                    alTerminar: () => setState(() => _primeraVez = Future.value(false)),
                  );
                }
                return AccesoSgf(servidor: servidor, api: api, ajustes: widget.ajustes, alCambiarTema: () => setState(() {}), alComprobarInstalacion: () => setState(() => _primeraVez = servidor.esPrimeraVez()));
              },
            ),
    );
  }
}

/// Tema visual de la aplicacion: alto contraste, letra grande y controles
/// amplios, pensado para pantallas de 1366x768 y para uso sin experiencia previa.
ThemeData temaSgf(Brightness brillo) {
  final oscuro = brillo == Brightness.dark;
  final base = ColorScheme.fromSeed(
    seedColor: const Color(0xFF276BC5),
    brightness: brillo,
  );
  final fondo = oscuro ? const Color(0xFF101A2A) : const Color(0xFFF4F8FD);
  final superficie = oscuro ? const Color(0xFF182128) : Colors.white;

  return ThemeData(
    useMaterial3: true,
    colorScheme: base,
    scaffoldBackgroundColor: fondo,
    fontFamily: Platform.isWindows ? 'Segoe UI' : null,
    visualDensity: VisualDensity.comfortable,
    textTheme: const TextTheme(
      bodyMedium: TextStyle(fontSize: 15, height: 1.45),
      bodySmall: TextStyle(fontSize: 13, height: 1.4),
      titleMedium: TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
      titleLarge: TextStyle(fontSize: 21, fontWeight: FontWeight.w700),
      headlineSmall: TextStyle(fontSize: 26, fontWeight: FontWeight.w700),
    ),
    cardTheme: CardThemeData(
      color: superficie,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(14),
        side: BorderSide(color: oscuro ? const Color(0xFF2A3742) : const Color(0xFFE2E8ED)),
      ),
      margin: EdgeInsets.zero,
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 20),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        minimumSize: const Size(0, 48),
        padding: const EdgeInsets.symmetric(horizontal: 18),
        textStyle: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: oscuro ? const Color(0xFF121A20) : Colors.white,
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 16),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
      hintStyle: TextStyle(fontSize: 14, color: oscuro ? Colors.white38 : Colors.black38),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: oscuro ? const Color(0xFF102238) : const Color(0xFF19344F),
      indicatorColor: const Color(0xFF2B70C8),
      selectedIconTheme: const IconThemeData(color: Colors.white),
      unselectedIconTheme: const IconThemeData(color: Color(0xFFD4E3F5)),
      selectedLabelTextStyle: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Colors.white),
      unselectedLabelTextStyle: const TextStyle(fontSize: 13, color: Color(0xFFD4E3F5)),
    ),
    dividerTheme: DividerThemeData(
      color: oscuro ? const Color(0xFF2A3742) : const Color(0xFFE2E8ED),
      thickness: 1,
      space: 1,
    ),
    snackBarTheme: SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      contentTextStyle: const TextStyle(fontSize: 15),
    ),
  );
}
