import 'dart:io';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/servicios/inicio_windows.dart';

void main() {
  test('Activa al iniciar sesión y migra el acceso antiguo sin duplicarlo', () async {
    final carpeta = await Directory.systemTemp.createTemp('sgf-inicio-');
    final acceso = File('${carpeta.path}/SGF Escritorio.lnk');
    await acceso.writeAsString('acceso ficticio');
    bool existe = false;
    final comandos = <List<String>>[];
    Future<ProcessResult> ejecutar(String programa, List<String> argumentos) async {
      comandos.add([programa, ...argumentos]);
      if (argumentos.first == 'query') return ProcessResult(1, existe ? 0 : 1, '', '');
      if (argumentos.first == 'add') { existe = true; return ProcessResult(1, 0, '', ''); }
      if (argumentos.first == 'delete') { existe = false; return ProcessResult(1, 0, '', ''); }
      return ProcessResult(1, 1, '', 'Error ficticio');
    }
    final inicio = InicioWindows(windows: true, ejecutar: ejecutar,
      ejecutable: r'C:\Program Files\SGF\sgf_escritorio.exe', carpetaInicio: () async => carpeta.path);
    try {
      expect(await inicio.activo(), isTrue); // Acceso creado por instaladores anteriores.
      await inicio.establecer(true);
      expect(await inicio.activo(), isTrue);
      expect(await acceso.exists(), isFalse);
      final agregar = comandos.firstWhere((c) => c.contains('add'));
      expect(agregar, contains('"C:\\Program Files\\SGF\\sgf_escritorio.exe"'));
      await inicio.establecer(false);
      expect(await inicio.activo(), isFalse);
    } finally { await carpeta.delete(recursive: true); }
  });

  test('Un error de Windows no se presenta como activación correcta', () async {
    final carpeta = await Directory.systemTemp.createTemp('sgf-inicio-');
    final inicio = InicioWindows(windows: true, ejecutable: r'C:\SGF\sgf_escritorio.exe',
      carpetaInicio: () async => carpeta.path,
      ejecutar: (_, argumentos) async => ProcessResult(1, 1, '', 'Acceso denegado'));
    try { await expectLater(inicio.establecer(true), throwsStateError); }
    finally { await carpeta.delete(recursive: true); }
  });

  test('Registro real de Windows aislado: activar y desactivar', () async {
    if (!Platform.isWindows) return;
    final carpeta = await Directory.systemTemp.createTemp('sgf-inicio-real-');
    final claveTemporal = r'HKCU\Software\SGF-PRUEBA-' + DateTime.now().microsecondsSinceEpoch.toString();
    Future<ProcessResult> ejecutar(String programa, List<String> argumentos) async {
      final nuevos = argumentos.map((a) => a == InicioWindows.clave ? claveTemporal : a).toList();
      return Process.run(programa, nuevos);
    }
    final inicio = InicioWindows(windows: true, ejecutable: r'C:\SGF Prueba\sgf_escritorio.exe',
      carpetaInicio: () async => carpeta.path, ejecutar: ejecutar);
    try {
      expect(await inicio.activo(), isFalse);
      await inicio.establecer(true);
      expect(await inicio.activo(), isTrue);
      final consulta = await Process.run('reg.exe', ['query', claveTemporal, '/v', InicioWindows.nombre]);
      expect('${consulta.stdout}', contains(r'C:\SGF Prueba\sgf_escritorio.exe'));
      await inicio.establecer(false);
      expect(await inicio.activo(), isFalse);
    } finally {
      await Process.run('reg.exe', ['delete', claveTemporal, '/f']);
      await carpeta.delete(recursive: true);
    }
  });

  test('No permite habilitarse fuera de Windows', () async {
    final inicio = InicioWindows(windows: false);
    expect(await inicio.activo(), isFalse);
    await expectLater(inicio.establecer(true), throwsUnsupportedError);
  });
}
