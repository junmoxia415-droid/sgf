import 'dart:convert';
import 'dart:io';

/// Ajustes locales de la aplicacion (no viajan al servidor).
///
/// Se guardan en %APPDATA%\SGF\ajustes.json (o ~/.config/sgf/ajustes.json)
/// para que el usuario pueda mover la carpeta sin tocar la instalacion.
class Ajustes {
  Ajustes({
    this.puerto = 3000,
    this.urlPublica = 'http://127.0.0.1:3000',
    this.arrancarAlAbrir = true,
    this.reiniciarEnFallo = true,
    this.temaOscuro = false,
    this.recordarSesion = true,
    this.asistenteCompletado = false,
    this.modoBd = 'sqlite',
    this.guiaVista = false,
    this.nombreDnsFijo,
  });

  int puerto;
  String urlPublica;
  bool arrancarAlAbrir;
  bool reiniciarEnFallo;
  bool temaOscuro;
  bool recordarSesion;
  bool asistenteCompletado;
  String modoBd; // sqlite | oracle | mssql
  bool guiaVista;
  String? nombreDnsFijo;

  /// El paquete experimental usa un perfil propio; nunca reutiliza SGF real.
  static const pruebaAislada = bool.fromEnvironment('SGF_PRUEBA_AISLADA');
  static String get nombreCarpeta => pruebaAislada ? 'SGF-PRUEBA-4.0.8' : 'SGF';
  static File get marcadorReinicio => File('${carpeta.parent.path}${Platform.pathSeparator}${pruebaAislada ? 'SGF-PRUEBA-4.0.8' : 'SGF'}-solicitud-reinicio.txt');

  static Directory get carpeta {
    if (Platform.isWindows) {
      final appData = Platform.environment['APPDATA'] ?? Platform.environment['LOCALAPPDATA'] ?? '.';
      return Directory('$appData\\$nombreCarpeta');
    }
    final home = Platform.environment['HOME'] ?? '.';
    return Directory('$home/.config/${pruebaAislada ? 'sgf-prueba-4.0.8' : 'sgf'}');
  }

  static File get archivo => File('${carpeta.path}${Platform.pathSeparator}ajustes.json');

  static Future<Ajustes> cargar() async {
    try {
      final f = archivo;
      if (!await f.exists()) {
        final nuevo = Ajustes();
        await nuevo.guardar();
        return nuevo;
      }
      final mapa = jsonDecode(await f.readAsString()) as Map<String, dynamic>;
      return Ajustes(
        puerto: (mapa['puerto'] as num?)?.toInt() ?? 3000,
        urlPublica: (mapa['urlPublica'] as String?) ?? 'http://127.0.0.1:3000',
        arrancarAlAbrir: (mapa['arrancarAlAbrir'] as bool?) ?? true,
        reiniciarEnFallo: (mapa['reiniciarEnFallo'] as bool?) ?? true,
        temaOscuro: (mapa['temaOscuro'] as bool?) ?? false,
        recordarSesion: (mapa['recordarSesion'] as bool?) ?? true,
        asistenteCompletado: (mapa['asistenteCompletado'] as bool?) ?? false,
        modoBd: (mapa['modoBd'] as String?) ?? 'sqlite',
        guiaVista: (mapa['guiaVista'] as bool?) ?? false,
        nombreDnsFijo: mapa['nombreDnsFijo'] as String?,
      );
    } catch (_) {
      return Ajustes();
    }
  }

  Future<void> guardar() async {
    try {
      await carpeta.create(recursive: true);
      await archivo.writeAsString(jsonEncode({
        'puerto': puerto,
        'urlPublica': urlPublica,
        'arrancarAlAbrir': arrancarAlAbrir,
        'reiniciarEnFallo': reiniciarEnFallo,
        'temaOscuro': temaOscuro,
        'recordarSesion': recordarSesion,
        'asistenteCompletado': asistenteCompletado,
        'modoBd': modoBd,
        'guiaVista': guiaVista,
        'nombreDnsFijo': nombreDnsFijo,
      }));
    } catch (_) {
      // Si no se puede guardar, la app sigue funcionando en memoria.
    }
  }

  String get urlBaseLocal => 'http://127.0.0.1:$puerto';
}
