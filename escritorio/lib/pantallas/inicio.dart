import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';

/// Pantalla de entrada: dice en dos segundos si todo está bien y qué hacer si no.
class InicioPantalla extends StatefulWidget {
  const InicioPantalla({
    super.key,
    required this.servidor,
    required this.api,
    required this.irA,
    required this.iniciarSesion,
  });

  final ControladorServidor servidor;
  final Api api;
  final void Function(String area) irA;
  final Future<bool> Function() iniciarSesion;

  @override
  State<InicioPantalla> createState() => _InicioPantallaState();
}

class _InicioPantallaState extends State<InicioPantalla> {
  Map<String, dynamic>? _estado;
  String? _error;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _cargando = true);
    try {
      final datos = await widget.api.panelEstado();
      if (mounted) setState(() {
        _estado = datos;
        _error = null;
        _cargando = false;
      });
    } on ApiError catch (e) {
      if (mounted) setState(() {
        _error = e.esSinConexion
            ? 'El servidor no está iniciado. Puede iniciarlo ahora mismo con el botón de abajo.'
            : e.mensaje;
        _cargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final contadores = (_estado?['contadores'] ?? <String, dynamic>{}) as Map<String, dynamic>;
    final bd = (_estado?['bd'] ?? <String, dynamic>{}) as Map<String, dynamic>;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Cabecera(
          titulo: 'Bienvenido a SGF',
          descripcion: 'Gestione sus facturas y líneas de forma sencilla, segura y sin conexión.',
          acciones: [
            OutlinedButton.icon(
              onPressed: _cargando ? null : _cargar,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Actualizar'),
            ),
          ],
        ),
        if (_cargando)
          const Padding(padding: EdgeInsets.symmetric(vertical: 40), child: Center(child: CircularProgressIndicator()))
        else if (_error != null)
          Aviso(
            titulo: 'No se pudo conectar con el servidor',
            mensaje: widget.servidor.ultimoError ?? _error!,
            tipo: TipoAviso.error,
            accion: Wrap(
              spacing: 10,
              children: [
                FilledButton.icon(
                  onPressed: () async {
                    await widget.servidor.arrancar();
                    await _cargar();
                  },
                  icon: const Icon(Icons.play_arrow),
                  label: const Text('Iniciar el servidor'),
                ),
                OutlinedButton.icon(
                  onPressed: () => widget.irA('Servidor'),
                  icon: const Icon(Icons.tune),
                  label: const Text('Ver detalles'),
                ),
              ],
            ),
          )
        else ...[
          Wrap(
            spacing: 14,
            runSpacing: 14,
            children: [
              _Resumen(icono: Icons.receipt_long, titulo: 'Facturas registradas', valor: '${contadores['facturas'] ?? 0}', color: const Color(0xFF286DC5)),
              _Resumen(icono: Icons.sim_card_outlined, titulo: 'Servicios', valor: '${contadores['servicios'] ?? 0}', color: const Color(0xFF258856)),
              _Resumen(icono: Icons.table_chart_outlined, titulo: 'Líneas del Excel', valor: '${contadores['lineasExcel'] ?? 0}', color: const Color(0xFFD58A23)),
              _Resumen(icono: Icons.people_outline, titulo: 'Usuarios', valor: '${contadores['usuarios'] ?? 0}', color: const Color(0xFF6757BF)),
            ],
          ),
          const SizedBox(height: 18),
          EnColumnas(
            izquierda: Tarjeta(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Wrap(
                        spacing: 8, runSpacing: 8,
                        children: [
                          const Etiqueta(
                            texto: 'Servidor en marcha',
                            color: Color(0xFF1B7F4B),
                            icono: Icons.check_circle,
                          ),
                          Etiqueta(
                            texto: 'Base de datos: ${(_estado?['modoBd'] ?? 'sqlite').toString().toUpperCase()}',
                            color: const Color(0xFF1D6FB8),
                            icono: Icons.storage,
                          ),
                        ],
                      ),
                      const SizedBox(height: 18),
                      Wrap(
                        spacing: 34,
                        runSpacing: 20,
                        children: [
                          Dato(etiqueta: 'Facturas', valor: '${contadores['facturas'] ?? 0}', icono: Icons.receipt_long),
                          Dato(etiqueta: 'Servicios', valor: '${contadores['servicios'] ?? 0}', icono: Icons.sim_card),
                          Dato(
                            etiqueta: 'Líneas del Excel',
                            valor: '${contadores['lineasExcel'] ?? 0}',
                            icono: Icons.table_chart,
                          ),
                          Dato(etiqueta: 'Usuarios', valor: '${contadores['usuarios'] ?? 0}', icono: Icons.group),
                        ],
                      ),
                      const SizedBox(height: 18),
                      const Divider(),
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          const Icon(Icons.health_and_safety_outlined, size: 18),
                          const SizedBox(width: 8),
                          Text(
                            (bd['ok'] == true ? 'Conexión con la base de datos correcta' : 'Revisar la base de datos') +
                                (bd['ms'] != null ? ' · ${bd['ms']} ms' : ''),
                            style: const TextStyle(fontSize: 14),
                          ),
                        ],
                      ),
                      const SizedBox(height: 6),
                      Text(
                        'Tiempo en marcha: ${_textoTiempo((_estado?['uptimeSegundos'] ?? 0) as int)} · '
                        'Memoria: ${_estado?['memoriaMB'] ?? 0} MB',
                        style: TextStyle(fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                      ),
                    ],
                  ),
                ),
            derecha: Tarjeta(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('¿Qué desea hacer?', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      const Text('Elija una tarea; cada pantalla explica los pasos.',
                          style: TextStyle(fontSize: 13.5)),
                      const SizedBox(height: 14),
                      _Acceso(
                        icono: Icons.upload_file,
                        titulo: 'Procesar facturas',
                        detalle: 'Suba los PDF y el sistema los lee y guarda',
                        alPulsar: () => widget.irA('Facturas'),
                      ),
                      _Acceso(
                        icono: Icons.table_chart,
                        titulo: 'Cargar el Excel de líneas',
                        detalle: 'Titular, unidad y cargo de cada número',
                        alPulsar: () => widget.irA('Importar Excel'),
                      ),
                      if (!widget.api.conSesion)
                        _Acceso(
                          icono: Icons.login,
                          titulo: 'Iniciar sesión',
                          detalle: 'Necesario para ver y procesar facturas',
                          alPulsar: () async {
                            await widget.iniciarSesion();
                            await _cargar();
                          },
                        ),
                      _Acceso(
                        icono: Icons.dns,
                        titulo: 'Servidor y copias de seguridad',
                        detalle: 'Iniciar, detener y proteger los datos',
                        alPulsar: () => widget.irA('Servidor'),
                      ),
                    ],
                  ),
                ),
          ),
          const SizedBox(height: 16),
          Aviso(
            titulo: 'Funciona sin internet',
            mensaje: 'Todo está en este equipo: la base de datos, las facturas y las líneas del Excel. '
                'Si el equipo se apaga de golpe, la información no se pierde: la base se guarda de forma segura '
                'en cada cambio. Se recomienda crear una copia de seguridad al final de cada jornada desde «Servidor».',
            tipo: TipoAviso.info,
            accion: OutlinedButton.icon(
              onPressed: () => widget.irA('Servidor'),
              icon: const Icon(Icons.backup_outlined, size: 18),
              label: const Text('Ir a copias de seguridad'),
            ),
          ),
        ],
      ],
    );
  }

  String _textoTiempo(int segundos) {
    if (segundos < 60) return '$segundos s';
    final minutos = segundos ~/ 60;
    if (minutos < 60) return '$minutos min';
    final horas = minutos ~/ 60;
    return '${horas} h ${minutos % 60} min';
  }
}

class _Resumen extends StatelessWidget {
  const _Resumen({required this.icono, required this.titulo, required this.valor, required this.color});
  final IconData icono;
  final String titulo;
  final String valor;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return SizedBox(
      width: 210,
      child: Tarjeta(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        CircleAvatar(backgroundColor: color.withValues(alpha: 0.13), child: Icon(icono, color: color)),
        const SizedBox(height: 12),
        Text(titulo, style: tema.textTheme.bodySmall),
        const SizedBox(height: 4),
        Text(valor, style: tema.textTheme.headlineSmall),
      ])),
    );
  }
}

class _Acceso extends StatelessWidget {
  const _Acceso({required this.icono, required this.titulo, required this.detalle, required this.alPulsar});
  final IconData icono;
  final String titulo;
  final String detalle;
  final VoidCallback alPulsar;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(10),
        onTap: alPulsar,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
          child: Row(
            children: [
              Icon(icono, size: 20, color: Theme.of(context).colorScheme.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                    Text(detalle, style: const TextStyle(fontSize: 12.5)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, size: 20),
            ],
          ),
        ),
      ),
    );
  }
}
