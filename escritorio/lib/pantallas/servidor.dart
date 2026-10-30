import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../servicios/api.dart';
import '../servicios/inicio_windows.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';
import 'configurar_base.dart';

/// Control del servidor: iniciar / detener / reiniciar, copias de seguridad y
/// registro de lo que va pasando, con explicación de cada botón.
class ServidorPantalla extends StatefulWidget {
  const ServidorPantalla({
    super.key,
    required this.servidor,
    required this.api,
    required this.ajustes,
    required this.iniciarSesion,
    this.alCambiarBase,
    this.inicioWindows,
  });

  final ControladorServidor servidor;
  final Api api;
  final dynamic ajustes;
  final Future<bool> Function() iniciarSesion;
  final VoidCallback? alCambiarBase;
  final InicioWindows? inicioWindows;

  @override
  State<ServidorPantalla> createState() => _ServidorPantallaState();
}

class _ServidorPantallaState extends State<ServidorPantalla> {
  Map<String, dynamic>? _estado;
  bool _trabajando = false;
  late final InicioWindows _inicioWindows;
  bool? _inicioSesionWindows;
  bool _actualizandoInicio = false;
  List<String> _enlaces = const [];
  String? _errorRed;
  bool _consultandoRed = false;

  @override
  void initState() {
    super.initState();
    _inicioWindows = widget.inicioWindows ?? InicioWindows();
    widget.servidor.addListener(_redibujar);
    _cargar();
    _consultarRed();
    _consultarInicio();
  }

  @override
  void dispose() {
    widget.servidor.removeListener(_redibujar);
    super.dispose();
  }

  void _redibujar() {
    if (mounted) setState(() {});
  }

  Future<void> _consultarRed() async {
    if (mounted) setState(() { _consultandoRed = true; _errorRed = null; });
    try {
      final enlaces = await widget.servidor.enlacesRed();
      if (mounted) setState(() => _enlaces = enlaces);
    } catch (_) {
      if (mounted) setState(() { _enlaces = []; _errorRed = 'No se pudieron consultar las direcciones de red.'; });
    } finally {
      if (mounted) setState(() => _consultandoRed = false);
    }
  }

  Future<void> _consultarInicio() async {
    if (!_inicioWindows.disponible) return;
    try {
      final activo = await _inicioWindows.activo();
      if (mounted) setState(() => _inicioSesionWindows = activo);
    } catch (_) {
      if (mounted) setState(() => _inicioSesionWindows = null);
    }
  }

  Future<void> _cambiarInicio(bool activar) async {
    setState(() => _actualizandoInicio = true);
    try {
      await _inicioWindows.establecer(activar);
      await _consultarInicio();
      if (mounted) avisar(context, activar ? 'SGF se abrirá al iniciar sesión en Windows.' : 'Inicio automático de SGF desactivado.');
    } catch (e) {
      await _consultarInicio();
      if (mounted) avisar(context, 'No se pudo cambiar el inicio: $e', tipo: TipoAviso.error);
    } finally {
      if (mounted) setState(() => _actualizandoInicio = false);
    }
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
    final nombreEquipo = Platform.localHostname;
    final nombreUtilizable = RegExp(r'^[A-Za-z0-9][A-Za-z0-9-]{0,62}$').hasMatch(nombreEquipo)
        && nombreEquipo.toLowerCase() != 'localhost';
    final enlaceNombre = 'http://$nombreEquipo:${widget.ajustes.puerto}';

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Cabecera(
          titulo: 'Servidor',
          descripcion: 'Encienda y apague el motor, comparta el enlace con su red y configure el inicio de SGF.',
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
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Enlace para otras computadoras', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      const Text('En la otra PC, abra el navegador y pegue uno de estos enlaces. Debe estar en la misma red y el servidor debe estar en marcha.', style: TextStyle(fontSize: 13.5)),
                      if (!enMarcha) const Padding(padding: EdgeInsets.only(top: 8), child: Text('El servidor está detenido: el enlace no funcionará hasta iniciarlo.', style: TextStyle(color: Color(0xFFB8730B)))),
                      const SizedBox(height: 10),
                      if (_consultandoRed) const Text('Buscando direcciones de red…')
                      else if (_errorRed != null) Text(_errorRed!)
                      else if (_enlaces.isEmpty) const Text('No se detectó una dirección de red privada. Conecte este equipo a la red y actualice.')
                      else for (final enlace in _enlaces)
                        Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(children: [
                          Expanded(child: SelectableText(enlace, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
                          OutlinedButton.icon(onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: enlace));
                            if (context.mounted) avisar(context, 'Enlace copiado. Péguelo en el navegador de la otra computadora.');
                          }, icon: const Icon(Icons.copy, size: 18), label: const Text('Copiar')),
                        ])),
                      TextButton.icon(onPressed: _consultandoRed ? null : _consultarRed, icon: const Icon(Icons.refresh, size: 18), label: const Text('Actualizar enlaces')),
                      if (nombreUtilizable && _enlaces.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        const Text('Enlace opcional por nombre del equipo', style: TextStyle(fontWeight: FontWeight.w600)),
                        Row(children: [
                          Expanded(child: SelectableText(enlaceNombre)),
                          OutlinedButton.icon(onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: enlaceNombre));
                            if (context.mounted) avisar(context, 'Enlace por nombre copiado.');
                          }, icon: const Icon(Icons.copy, size: 18), label: const Text('Copiar nombre')),
                        ]),
                        const Text('Puede mantenerse aunque cambie la IP, pero solo funciona si la otra computadora puede resolver el nombre en su red.', style: TextStyle(fontSize: 12.5, height: 1.4)),
                      ],
                      const Text('Si aparecen varios enlaces, pruebe el de la red que comparten los equipos; algunos pueden pertenecer a VPN. El cortafuegos debe permitir conexiones privadas al puerto de SGF.', style: TextStyle(fontSize: 12.5, height: 1.4)),
                      const SizedBox(height: 8),
                      const Text('Mantenga SGF abierto en este equipo: al cerrar la aplicación se detiene el servidor. La dirección IP puede cambiar después de reiniciar. Para conservar el mismo enlace, reserve esta IP en el router o configure una IP fija con el administrador de red.', style: TextStyle(fontSize: 12.5, height: 1.4)),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Inicio automático', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      const Text('Estas opciones no necesitan Internet y no cambian los datos guardados.', style: TextStyle(fontSize: 13)),
                      if (_inicioWindows.disponible)
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Abrir SGF al iniciar sesión en Windows'),
                          subtitle: const Text('Para el usuario actual; Windows debe iniciar sesión primero.'),
                          value: _inicioSesionWindows ?? false,
                          onChanged: _actualizandoInicio || _inicioSesionWindows == null ? null : _cambiarInicio,
                        )
                      else const Text('La apertura automática al iniciar sesión está disponible en Windows.'),
                      if (_inicioWindows.disponible && _inicioSesionWindows == null)
                        TextButton(onPressed: _consultarInicio, child: const Text('No se pudo consultar el inicio; reintentar')),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Encender el servidor al abrir SGF'),
                        subtitle: const Text('Cuando se abre esta aplicación, intenta iniciar el servidor.'),
                        value: widget.ajustes.arrancarAlAbrir == true,
                        onChanged: (v) async {
                          widget.ajustes.arrancarAlAbrir = v;
                          await widget.ajustes.guardar();
                          if (mounted) setState(() {});
                        },
                      ),
                      const Text('El inicio del servidor antes de iniciar sesión en Windows todavía no está disponible en esta versión.', style: TextStyle(fontSize: 12.5, color: Color(0xFFB8730B))),
                    ]),
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
                        OutlinedButton.icon(
                          onPressed: !enMarcha || _trabajando ? null : () async {
                            final modo = await showDialog<String>(context: context, builder: (_) => ConfigurarBaseDialogo(api: widget.api));
                            if (modo == null || !mounted) return;
                            widget.ajustes.modoBd = modo;
                            await widget.ajustes.guardar();
                            if (!mounted) return;
                            widget.api.limpiarSesionLocal();
                            widget.alCambiarBase?.call();
                          },
                          icon: const Icon(Icons.settings_outlined), label: const Text('Configurar base de datos'),
                        ),
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
