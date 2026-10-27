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
    this.temaOscuro = false,
    this.recordarSesion = true,
    this.asistenteCompletado = false,
    this.modoBd = 'sqlite',
    this.guiaVista = false,
  });

  int puerto;
  String urlPublica;
  bool arrancarAlAbrir;
  bool temaOscuro;
  bool recordarSesion;
  bool asistenteCompletado;
  String modoBd; // sqlite | oracle | mssql
  bool guiaVista;

  static Directory get carpeta {
    if (Platform.isWindows) {
      final appData = Platform.environment['APPDATA'] ?? Platform.environment['LOCALAPPDATA'] ?? '.';
      return Directory('$appData\\SGF');
    }
    final home = Platform.environment['HOME'] ?? '.';
    return Directory('$home/.config/sgf');
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
        temaOscuro: (mapa['temaOscuro'] as bool?) ?? false,
        recordarSesion: (mapa['recordarSesion'] as bool?) ?? true,
        asistenteCompletado: (mapa['asistenteCompletado'] as bool?) ?? false,
        modoBd: (mapa['modoBd'] as String?) ?? 'sqlite',
        guiaVista: (mapa['guiaVista'] as bool?) ?? false,
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
        'temaOscuro': temaOscuro,
        'recordarSesion': recordarSesion,
        'asistenteCompletado': asistenteCompletado,
        'modoBd': modoBd,
        'guiaVista': guiaVista,
      }));
    } catch (_) {
      // Si no se puede guardar, la app sigue funcionando en memoria.
    }
  }

  String get urlBaseLocal => 'http://127.0.0.1:$puerto';
}
