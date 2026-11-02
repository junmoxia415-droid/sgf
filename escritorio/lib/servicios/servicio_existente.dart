import 'dart:convert';
import 'dart:io';
import 'canal_local_seguro.dart';

class AnuncioServicio {
  const AnuncioServicio({required this.canal, required this.token, required this.pid});
  final CanalLocalSeguro canal;
  final String token;
  final int pid;
}

/// Solo acepta un anuncio autenticado con el token que vive en la carpeta
/// privada del usuario. Un ping público o un puerto abierto no prueban identidad.
class ServicioExistente {
  ServicioExistente(this.datos);
  final String datos;
  String get carpeta => '$datos${Platform.pathSeparator}control-servicio';
  File get token => File('$carpeta${Platform.pathSeparator}token.txt');
  File get anuncio => File('$carpeta${Platform.pathSeparator}anuncio.json');
  File get marcador => File('$carpeta${Platform.pathSeparator}instalado.json');
  Future<bool> configurado() async {
    final tipoCarpeta = await FileSystemEntity.type(carpeta, followLinks: false);
    if (tipoCarpeta == FileSystemEntityType.notFound) return false;
    if (tipoCarpeta != FileSystemEntityType.directory) throw StateError('La carpeta de control no es válida.');
    final tipoMarcador = await FileSystemEntity.type(marcador.path, followLinks: false);
    if (tipoMarcador == FileSystemEntityType.notFound) return false;
    if (tipoMarcador != FileSystemEntityType.file || await marcador.length() > 2048) {
      throw StateError('El indicador del servicio no es válido.');
    }
    try {
      final doc = jsonDecode(await marcador.readAsString()) as Map<String, dynamic>;
      if (doc['version'] != 1 || doc['activo'] is! bool) throw const FormatException();
      return doc['activo'] as bool;
    } catch (_) {
      throw StateError('El indicador del servicio no es válido; no se iniciará otra instancia.');
    }
  }

  Future<AnuncioServicio?> leer() async {
    if (!await configurado() || !await anuncio.exists()) return null;
    for (final archivo in [token, anuncio, marcador]) {
      if (await FileSystemEntity.type(archivo.path, followLinks: false) != FileSystemEntityType.file || await archivo.length() > 8192) {
        throw StateError('La información del servicio no es válida.');
      }
    }
    try {
      final secreto = (await token.readAsString()).trim();
      if (!RegExp(r'^[a-f0-9]{64}$').hasMatch(secreto)) throw const FormatException();
      final doc = jsonDecode(await anuncio.readAsString()) as Map<String, dynamic>;
      if (doc['version'] != 1 || doc['pid'] is! int || (doc['pid'] as int) <= 0 || doc['linea'] is! String) throw const FormatException();
      final canal = CanalLocalSeguro.desdeAnuncio(doc['linea'] as String, secreto);
      if (canal == null) throw const FormatException();
      return AnuncioServicio(canal: canal, token: secreto, pid: doc['pid'] as int);
    } catch (_) {
      throw StateError('Se rechazó el anuncio del servicio; no se enviaron credenciales.');
    }
  }
}
