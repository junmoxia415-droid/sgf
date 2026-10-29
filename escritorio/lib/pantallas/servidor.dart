import 'dart:io';

import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';

/// Control del servidor: iniciar / detener / reiniciar, copias de seguridad y
/// registro de lo que va pasando, con explicación de cada botón.
class ServidorPantalla extends StatefulWidget {
  const ServidorPantalla({
    super.key,
    required this.servidor,
    required this.api,
    required this.ajustes,
    required this.iniciarSesion,
  });

  final ControladorServidor servidor;
  final Api api;
  final dynamic ajustes;
  final Future<bool> Function() iniciarSesion;

  @override
  State<ServidorPantalla> createState() => _ServidorPantallaState();
}

class _ServidorPantallaState extends State<ServidorPantalla> {
  Map<String, dynamic>? _estado;
  bool _trabajando = false;

  @override
  void initState() {
    super.initState();
    widget.servidor.addListener(_redibujar);
    _cargar();
  }

  @override
  void dispose() {
    widget.servidor.removeListener(_redibujar);
    super.dispose();
  }

  void _redibujar() {
    if (mounted) setState(() {});
  }

  Future<void> _cargar() async {
    if (!widget.servidor.enMarcha) return;
    try {
      final datos = await widget.api.panelEstado();
      if (mounted) setState(() => _estado = datos);
    } on ApiError {
      if (mounted) setState(() => _estado = null);
    }
  }

  Future<void> _accion(Future<void> Function() tarea) async {
    setState(() => _trabajando = true);
    try {
      await tarea();
    } finally {
      if (mounted) setState(() => _trabajando = false);
      await _cargar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final servidor = widget.servidor;
    final enMarcha = servidor.enMarcha;
    final contadores = (_estado?['contadores'] ?? <String, dynamic>{}) as Map<String, dynamic>;
    final disco = (_estado?['disco'] ?? <String, dynamic>{}) as Map<String, dynamic>;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Cabecera(
          titulo: 'Servidor',
          descripcion: 'Aquí se enciende y se apaga el motor que guarda los datos. '
              'Mientras la aplicación está abierta, el servidor se inicia solo; estos botones son para cuando '
              'algo va mal o para hacer copias de seguridad.',
        ),
        EnColumnas(
          izquierda: Column(
                children: [
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _CirculoEstado(estado: servidor.estado),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_tituloEstado(servidor.estado),
                                      style: Theme.of(context).textTheme.titleLarge),
                                  Text(
                                    enMarcha
                                        ? 'Dirección: ${widget.ajustes.urlBaseLocal} · acceso desde redes privadas autorizadas'
                                        : 'La aplicación y los datos están seguros; solo el motor está parado.',
                                    style: TextStyle(
                                        fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (servidor.estado == EstadoServidor.fallo && servidor.ultimoError != null) ...[
                          const SizedBox(height: 16),
                          Aviso(
                            titulo: 'El servidor se detuvo',
                            mensaje: servidor.ultimoError!,
                            tipo: TipoAviso.error,
                          ),
                        ],
                        const SizedBox(height: 18),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            FilledButton.icon(
                              onPressed: _trabajando || enMarcha
                                  ? null
                                  : () => _accion(() async {
                                        final ok = await servidor.arrancar();
                                        if (!mounted) return;
                                        avisar(context, ok ? 'Servidor iniciado correctamente.' : 'No se pudo iniciar el servidor.',
                                            tipo: ok ? TipoAviso.exito : TipoAviso.error);
                                      }),
                              icon: const Icon(Icons.play_arrow),
                              label: const Text('Iniciar'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _trabajando || !enMarcha
                                  ? null
                                  : () async {
                                      final seguro = await confirmar(
                                        context,
                                        titulo: '¿Detener el servidor?',
                                        mensaje: 'Nadie podrá consultar ni procesar facturas hasta que lo vuelva a iniciar. '
                                            'Los datos ya guardados no se pierden.',
                                        textoConfirmar: 'Sí, detener',
                                        destructivo: true,
                                      );
                                      if (!seguro) return;
                                      await _accion(() => servidor.detener());
                                    },
                              icon: const Icon(Icons.stop),
                              label: const Text('Detener'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _trabajando || !enMarcha
                                  ? null
                                  : () => _accion(() async {
                                        await servidor.reiniciar();
                                        if (!mounted) return;
                                        avisar(context, 'Servidor reiniciado.');
                                      }),
                              icon: const Icon(Icons.restart_alt),
                              label: const Text('Reiniciar'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Copias de seguridad', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        const Text(
                          'Una copia es una fotografía de la base de datos en este momento. Si algún día los datos se '
                          'dañan, se puede volver a esa fotografía. Se guardan las 10 más recientes.',
                          style: TextStyle(fontSize: 13.5, height: 1.4),
                        ),
                        const SizedBox(height: 14),
                        Wrap(
                          spacing: 10,
                          children: [
                            FilledButton.tonalIcon(
                              onPressed: !enMarcha || _trabajando
                                  ? null
                                  : () => _accion(() async {
                                        try {
                                          final r = await widget.api.crearCopia();
                                          if (!mounted) return;
                                          avisar(context, (r['message'] ?? 'Copia creada.').toString());
                                        } on ApiError catch (e) {
                                          if (!mounted) return;
                                          avisar(context, e.mensaje, tipo: TipoAviso.error);
                                        }
                                      }),
                              icon: const Icon(Icons.backup_outlined),
                              label: const Text('Crear copia ahora'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _abrirCarpetaDatos,
                              icon: const Icon(Icons.folder_open),
                              label: const Text('Abrir la carpeta de datos'),
                            ),
                          ],
                        ),
                        if (_estado?['ultimaCopia'] != null) ...[
                          const SizedBox(height: 12),
                          Text('Última copia: ${_estado!['ultimaCopia']}', style: const TextStyle(fontSize: 13)),
                        ],
                      ],
                    ),
                  ),
                ],
          ),
          derecha: Column(
                children: [
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Dónde están los datos', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 12),
                        _Fila(etiqueta: 'Base de datos', valor: '${_estado?['modoBd'] ?? 'sqlite'}'.toUpperCase()),
                        _Fila(etiqueta: 'Archivo', valor: '${disco['carpetaDatos'] ?? servidor.carpetaDatos.path}'),
                        _Fila(etiqueta: 'Tamaño', valor: _textoBytes((disco['bytes'] ?? 0) as int)),
                        _Fila(etiqueta: 'Configuración', valor: '${disco['archivoEnv'] ?? servidor.archivoEnv.path}'),
                        _Fila(etiqueta: 'Facturas guardadas', valor: '${contadores['facturas'] ?? 0}'),
                        _Fila(etiqueta: 'Equipo', valor: '${_estado?['equipo']?['nombre'] ?? '-'}'),
                        const SizedBox(height: 12),
                        const Aviso(
                          titulo: 'Acceso por red privada',
                          mensaje: 'Otras computadoras de redes privadas pueden conectarse con una cuenta. '
                              'HTTP no cifra contraseñas ni datos; use solo una red confiable y no exponga el puerto en Internet.',
                          tipo: TipoAviso.aviso,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    padding: const EdgeInsets.all(0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
                          child: Row(
                            children: [
                              Text('Registro de actividad', style: Theme.of(context).textTheme.titleMedium),
                              const Spacer(),
                              TextButton.icon(
                                onPressed: () => setState(() => servidor.registro.clear()),
                                icon: const Icon(Icons.delete_sweep_outlined, size: 18),
                                label: const Text('Limpiar'),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          height: 240,
                          width: double.infinity,
                          margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F1720),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: servidor.registro.isEmpty
                              ? const Text('Todavía no hay actividad.',
                                  style: TextStyle(color: Colors.white38, fontSize: 12.5))
                              : ListView.builder(
                                  itemCount: servidor.registro.length,
                                  itemBuilder: (context, i) => Padding(
                                    padding: const EdgeInsets.only(bottom: 3),
                                    child: Text(
                                      servidor.registro[i],
                                      style: const TextStyle(
                                        color: Color(0xFF9FB3C8),
                                        fontSize: 11.5,
                                        fontFamily: 'Consolas',
                                        height: 1.35,
                                      ),
                                    ),
                                  ),
                                ),
                        ),
                      ],
                    ),
                  ),
                ],
          ),
        ),
      ],
    );
  }

  String _tituloEstado(EstadoServidor e) => switch (e) {
        EstadoServidor.enMarcha => 'El servidor está funcionando',
        EstadoServidor.arrancando => 'Iniciando el servidor…',
        EstadoServidor.deteniendo => 'Deteniendo el servidor…',
        EstadoServidor.fallo => 'El servidor no está funcionando',
        EstadoServidor.detenido => 'El servidor está detenido',
      };

  String _textoBytes(int bytes) {
    if (bytes < 1024) return '$bytes bytes';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Future<void> _abrirCarpetaDatos() async {
    final ruta = widget.servidor.carpetaDatos.path;
    try {
      await Directory(ruta).create(recursive: true);
      if (Platform.isWindows) {
        await Process.run('explorer', [ruta]);
      } else if (Platform.isMacOS) {
        await Process.run('open', [ruta]);
      } else {
        await Process.run('xdg-open', [ruta]);
      }
    } catch (e) {
      if (!mounted) return;
      avisar(context, 'No se pudo abrir la carpeta: $ruta', tipo: TipoAviso.aviso);
    }
  }
}

class _CirculoEstado extends StatelessWidget {
  const _CirculoEstado({required this.estado});
  final EstadoServidor estado;

  @override
  Widget build(BuildContext context) {
    final (color, icono) = switch (estado) {
      EstadoServidor.enMarcha => (const Color(0xFF1B7F4B), Icons.check),
      EstadoServidor.arrancando || EstadoServidor.deteniendo => (const Color(0xFF1D6FB8), Icons.sync),
      EstadoServidor.fallo => (const Color(0xFFB3261E), Icons.close),
      EstadoServidor.detenido => (const Color(0xFF6B7280), Icons.pause),
    };
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
      child: Icon(icono, color: color, size: 28),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila({required this.etiqueta, required this.valor});
  final String etiqueta;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(etiqueta.toUpperCase(),
              style: TextStyle(
                  fontSize: 10.5, letterSpacing: 0.5, fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
          Text(valor, style: const TextStyle(fontSize: 13, fontFamily: 'Consolas')),
        ],
      ),
    );
  }
}

/// Abre la version web en el navegador del sistema.
Future<void> abrirEnNavegador(String url) async {
  try {
    if (Platform.isWindows) {
      await Process.run('cmd', ['/c', 'start', '', url]);
    } else if (Platform.isMacOS) {
      await Process.run('open', [url]);
    } else {
      await Process.run('xdg-open', [url]);
    }
  } catch (_) {
    // sin navegador disponible: la app funciona igual
  }
}
