import 'dart:io';

import 'package:desktop_drop/desktop_drop.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../servicios/api.dart';
import '../widgets/comunes.dart';

/// Procesar facturas (subir PDF) e historial, con explicación de cada paso.
class FacturasPantalla extends StatefulWidget {
  const FacturasPantalla({super.key, required this.api, required this.iniciarSesion});
  final Api api;
  final Future<bool> Function() iniciarSesion;

  @override
  State<FacturasPantalla> createState() => _FacturasPantallaState();
}

class _FacturasPantallaState extends State<FacturasPantalla> with SingleTickerProviderStateMixin {
  late final TabController _tabs = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _tabs.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.api.conSesion) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Cabecera(
            titulo: 'Facturas',
            descripcion: 'Aquí se procesan los PDF y se consulta el historial de lo ya registrado.',
          ),
          Aviso(
            titulo: 'Primero hay que iniciar sesión',
            mensaje: 'Las facturas llevan el nombre de quien las registra, por eso el sistema pide su usuario. '
                'Es el mismo usuario que usa en la versión web.',
            tipo: TipoAviso.aviso,
            accion: FilledButton.icon(
              onPressed: () async => widget.iniciarSesion(),
              icon: const Icon(Icons.login),
              label: const Text('Iniciar sesión'),
            ),
          ),
        ],
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Cabecera(
          titulo: 'Facturas',
          descripcion: 'Suelte los PDF aquí o búsquelos en el equipo. El sistema lee el texto, guarda la factura y '
              'cruza las líneas con el Excel importado.',
          acciones: [
            OutlinedButton.icon(
              onPressed: () => _tabs.index = 1,
              icon: const Icon(Icons.history, size: 18),
              label: const Text('Ver historial'),
            ),
          ],
        ),
        Container(
          decoration: BoxDecoration(
            color: Theme.of(context).cardColor,
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: Theme.of(context).dividerColor),
          ),
          child: TabBar(
            controller: _tabs,
            tabs: const [
              Tab(icon: Icon(Icons.upload_file), text: 'Procesar PDF'),
              Tab(icon: Icon(Icons.receipt_long), text: 'Historial'),
            ],
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          height: MediaQuery.sizeOf(context).height - 260,
          child: TabBarView(
            controller: _tabs,
            children: [
              _Procesar(api: widget.api),
              _Historial(api: widget.api),
            ],
          ),
        ),
      ],
    );
  }
}

class _Procesar extends StatefulWidget {
  const _Procesar({required this.api});
  final Api api;

  @override
  State<_Procesar> createState() => _ProcesarState();
}

class _ProcesarState extends State<_Procesar> {
  bool _arrastrando = false;
  bool _procesando = false;
  final List<_Resultado> _resultados = [];

  Future<void> _procesar(List<File> archivos) async {
    final pdfs = archivos.where((f) => f.path.toLowerCase().endsWith('.pdf')).toList();
    if (pdfs.isEmpty) {
      avisar(context, 'Solo se pueden procesar archivos PDF.', tipo: TipoAviso.aviso);
      return;
    }
    setState(() => _procesando = true);
    for (final archivo in pdfs) {
      final nombre = archivo.path.split(Platform.pathSeparator).last;
      try {
        final bytes = await archivo.readAsBytes();
        final r = await widget.api.subirFactura(bytes, nombre);
        final datos = r['data'] as Map<String, dynamic>? ?? {};
        final factura = datos['factura'] as Map<String, dynamic>? ?? {};
        final enriq = datos['enriquecimiento'] as Map<String, dynamic>? ?? {};
        if (!mounted) return;
        setState(() {
          _resultados.insert(
            0,
            _Resultado(
              archivo: nombre,
              exito: true,
              mensaje: (r['message'] ?? 'Factura procesada.').toString(),
              noFactura: (datos['noFactura'] ?? factura['noFactura'] ?? '').toString(),
              cliente: (datos['cliente'] ?? factura['cliente'] ?? '').toString(),
              servicios: (datos['totalServicios'] ?? 0) as int? ?? 0,
              vinculadas: (enriq['encontradas'] ?? 0) as int? ?? 0,
              totalLineas: (enriq['total'] ?? 0) as int? ?? 0,
              confianza: ((factura['confidence'] ?? 0) as num).toInt(),
              revisar: datos['requiereRevision'] == true || datos['extraccionVacia'] == true,
            ),
          );
        });
      } on ApiError catch (e) {
        if (!mounted) return;
        setState(() {
          _resultados.insert(
            0,
            _Resultado(archivo: nombre, exito: false, mensaje: e.mensaje),
          );
        });
      }
    }
    if (mounted) setState(() => _procesando = false);
  }

  Future<void> _buscarArchivos() async {
    final resultado = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['pdf'],
      dialogTitle: 'Seleccione los PDF de facturas',
    );
    if (resultado == null) return;
    final archivos = resultado.files.where((f) => f.path != null).map((f) => File(f.path!)).toList();
    await _procesar(archivos);
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 5,
          child: Column(
            children: [
              DropTarget(
                onEnter: (_) => setState(() => _arrastrando = true),
                onLeave: () => setState(() => _arrastrando = false),
                onDrop: (detalle) async {
                  setState(() => _arrastrando = false);
                  final rutas = <File>[];
                  for (final item in detalle.items) {
                    if (item is DropFileItem) {
                      final ruta = item.localPath;
                      if (ruta != null) {
                        rutas.add(File(ruta));
                      } else {
                        // Sin ruta accesible: se copia el contenido.
                        final temporal = File('${Directory.systemTemp.path}${Platform.pathSeparator}${item.name}');
                        await temporal.writeAsBytes(await item.file.readAsBytes());
                        rutas.add(temporal);
                      }
                    }
                  }
                  await _procesar(rutas);
                },
                child: Container(
                  height: 240,
                  decoration: BoxDecoration(
                    color: _arrastrando
                        ? Theme.of(context).colorScheme.primary.withValues(alpha: 0.08)
                        : Theme.of(context).cardColor,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: _arrastrando ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
                      width: _arrastrando ? 2 : 1,
                    ),
                  ),
                  child: Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(Icons.file_upload_outlined,
                            size: 46,
                            color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.8)),
                        const SizedBox(height: 12),
                        Text('Arrastre aquí los PDF de facturas',
                            style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        const Text('o pulse el botón para buscarlos en el equipo',
                            style: TextStyle(fontSize: 13.5)),
                        const SizedBox(height: 16),
                        FilledButton.icon(
                          onPressed: _procesando ? null : _buscarArchivos,
                          icon: _procesando
                              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                              : const Icon(Icons.folder_open),
                          label: Text(_procesando ? 'Procesando…' : 'Elegir archivos PDF'),
                        ),
                      ],
                    ),
                  ),
                ),
              ),
              const SizedBox(height: 14),
              const Aviso(
                titulo: 'Qué ocurre al procesar un PDF',
                mensaje: '1) Se lee el texto del documento.  2) Se guarda la factura con su número, cliente e importes.  '
                    '3) Cada número de servicio se busca en el Excel de líneas para mostrar titular, unidad y cargo.  '
                    'Si un PDF ya estaba registrado, el sistema avisa en lugar de duplicarlo.',
                tipo: TipoAviso.info,
              ),
            ],
          ),
        ),
        const SizedBox(width: 16),
        Expanded(
          flex: 6,
          child: Tarjeta(
            padding: const EdgeInsets.all(0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 8),
                  child: Row(
                    children: [
                      Text('Resultado', style: Theme.of(context).textTheme.titleMedium),
                      const Spacer(),
                      if (_resultados.isNotEmpty)
                        TextButton.icon(
                          onPressed: () => setState(_resultados.clear),
                          icon: const Icon(Icons.clear_all, size: 18),
                          label: const Text('Limpiar'),
                        ),
                    ],
                  ),
                ),
                Expanded(
                  child: _resultados.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Text(
                              'Todavía no ha procesado ninguna factura en esta sesión.\n'
                              'Los resultados aparecerán aquí, con el número de factura y las líneas vinculadas.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant, height: 1.5),
                            ),
                          ),
                        )
                      : ListView.separated(
                          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                          itemCount: _resultados.length,
                          separatorBuilder: (_, _) => const SizedBox(height: 8),
                          itemBuilder: (context, i) => _TarjetaResultado(resultado: _resultados[i]),
                        ),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _Resultado {
  _Resultado({
    required this.archivo,
    required this.exito,
    required this.mensaje,
    this.noFactura = '',
    this.cliente = '',
    this.servicios = 0,
    this.vinculadas = 0,
    this.totalLineas = 0,
    this.confianza = 0,
    this.revisar = false,
  });

  final String archivo;
  final bool exito;
  final String mensaje;
  final String noFactura;
  final String cliente;
  final int servicios;
  final int vinculadas;
  final int totalLineas;
  final int confianza;
  final bool revisar;
}

class _TarjetaResultado extends StatelessWidget {
  const _TarjetaResultado({required this.resultado});
  final _Resultado resultado;

  @override
  Widget build(BuildContext context) {
    final r = resultado;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: r.exito ? const Color(0xFF1B7F4B).withValues(alpha: 0.35) : const Color(0xFFB3261E).withValues(alpha: 0.4)),
        color: (r.exito ? const Color(0xFF1B7F4B) : const Color(0xFFB3261E)).withValues(alpha: 0.05),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(r.exito ? Icons.check_circle : Icons.error, color: r.exito ? const Color(0xFF1B7F4B) : const Color(0xFFB3261E), size: 20),
              const SizedBox(width: 8),
              Expanded(child: Text(r.archivo, style: const TextStyle(fontWeight: FontWeight.w700))),
              if (r.exito && r.confianza > 0)
                Etiqueta(
                  texto: 'Lectura ${r.confianza}%',
                  color: r.confianza >= 85 ? const Color(0xFF1B7F4B) : const Color(0xFFB8730B),
                ),
            ],
          ),
          const SizedBox(height: 6),
          Text(r.mensaje, style: const TextStyle(fontSize: 13.5, height: 1.4)),
          if (r.exito) ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 16,
              runSpacing: 6,
              children: [
                if (r.noFactura.isNotEmpty) _mini('Factura', r.noFactura),
                if (r.cliente.isNotEmpty) _mini('Cliente', r.cliente),
                _mini('Servicios', '${r.servicios}'),
                _mini('Líneas vinculadas', '${r.vinculadas}/${r.totalLineas}'),
              ],
            ),
          ],
          if (r.exito && r.revisar) ...[
            const SizedBox(height: 8),
            const Text(
              'Esta factura necesita una revisión manual: puede que el PDF tenga una imagen (escaneo) o un formato poco habitual.',
              style: TextStyle(fontSize: 12.5, color: Color(0xFFB8730B), height: 1.4),
            ),
          ],
        ],
      ),
    );
  }

  Widget _mini(String etiqueta, String valor) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text('$etiqueta: ', style: const TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700)),
        Text(valor, style: const TextStyle(fontSize: 12.5, fontFamily: 'Consolas')),
      ],
    );
  }
}

class _Historial extends StatefulWidget {
  const _Historial({required this.api});
  final Api api;

  @override
  State<_Historial> createState() => _HistorialState();
}

class _HistorialState extends State<_Historial> {
  final _busqueda = TextEditingController();
  List<dynamic> _facturas = [];
  Map<String, dynamic> _meta = {};
  bool _cargando = true;
  String? _error;
  int _pagina = 1;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  @override
  void dispose() {
    _busqueda.dispose();
    super.dispose();
  }

  Future<void> _cargar({int? pagina}) async {
    setState(() {
      _cargando = true;
      _error = null;
      if (pagina != null) _pagina = pagina;
    });
    try {
      final r = await widget.api.listarFacturas(pagina: _pagina, busqueda: _busqueda.text.trim());
      if (!mounted) return;
      setState(() {
        _facturas = (r['data'] as List<dynamic>?) ?? [];
        _meta = (r['meta'] as Map<String, dynamic>?) ?? {};
        _cargando = false;
      });
    } on ApiError catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.mensaje;
        _cargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final total = (_meta['total'] ?? 0) as num;
    final totalPaginas = (_meta['totalPages'] ?? 1) as num;
    final formato = NumberFormat.currency(locale: 'es_ES', symbol: '', decimalDigits: 2);

    return Tarjeta(
      padding: const EdgeInsets.all(12),
      child: Column(
        children: [
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _busqueda,
                  onSubmitted: (_) => _cargar(pagina: 1),
                  decoration: InputDecoration(
                    hintText: 'Buscar por número de factura, cliente o cuenta…',
                    prefixIcon: const Icon(Icons.search),
                    suffixIcon: IconButton(
                      icon: const Icon(Icons.clear),
                      onPressed: () {
                        _busqueda.clear();
                        _cargar(pagina: 1);
                      },
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 10),
              FilledButton.icon(
                onPressed: () => _cargar(pagina: 1),
                icon: const Icon(Icons.refresh, size: 18),
                label: const Text('Buscar'),
              ),
            ],
          ),
          const SizedBox(height: 10),
          Expanded(
            child: _cargando
                ? const Center(child: CircularProgressIndicator())
                : _error != null
                    ? Center(child: Aviso(titulo: 'No se pudo cargar', mensaje: _error!, tipo: TipoAviso.error))
                    : _facturas.isEmpty
                        ? Center(
                            child: Text('No hay facturas registradas todavía.',
                                style: TextStyle(color: Theme.of(context).colorScheme.onSurfaceVariant)))
                        : ListView.separated(
                            itemCount: _facturas.length,
                            separatorBuilder: (_, _) => const Divider(height: 1),
                            itemBuilder: (context, i) {
                              final f = _facturas[i] as Map<String, dynamic>;
                              final revisar = f['requiresReview'] == true;
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: revisar
                                      ? const Color(0xFFB8730B).withValues(alpha: 0.15)
                                      : const Color(0xFF1B7F4B).withValues(alpha: 0.13),
                                  child: Icon(revisar ? Icons.help_outline : Icons.receipt_long,
                                      color: revisar ? const Color(0xFFB8730B) : const Color(0xFF1B7F4B)),
                                ),
                                title: Text(
                                  '${f['no_factura'] ?? '(sin número)'}  ·  ${f['cliente'] ?? ''}',
                                  style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5),
                                ),
                                subtitle: Text(
                                  'Cuenta ${f['cuenta'] ?? '-'} · ${f['periodo_consumo'] ?? 'sin periodo'} · '
                                  '${f['servicios_count'] ?? 0} servicios · ${f['reviewLabel'] ?? ''}',
                                  style: const TextStyle(fontSize: 12.5),
                                ),
                                trailing: Column(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  crossAxisAlignment: CrossAxisAlignment.end,
                                  children: [
                                    Text('${formato.format((f['total_pagar'] ?? 0) as num)} ${f['moneda'] ?? ''}',
                                        style: const TextStyle(fontWeight: FontWeight.w700)),
                                    Text('${f['created_at'] ?? ''}'.split('T').first,
                                        style: const TextStyle(fontSize: 11.5)),
                                  ],
                                ),
                                onTap: () => _verDetalle(f),
                              );
                            },
                          ),
          ),
          const Divider(),
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
            child: Row(
              children: [
                Text('$total facturas en total', style: const TextStyle(fontSize: 13)),
                const Spacer(),
                IconButton(
                  onPressed: _pagina > 1 ? () => _cargar(pagina: _pagina - 1) : null,
                  icon: const Icon(Icons.chevron_left),
                  tooltip: 'Página anterior',
                ),
                Text('Página $_pagina de $totalPaginas', style: const TextStyle(fontSize: 13)),
                IconButton(
                  onPressed: _pagina < totalPaginas ? () => _cargar(pagina: _pagina + 1) : null,
                  icon: const Icon(Icons.chevron_right),
                  tooltip: 'Página siguiente',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _verDetalle(Map<String, dynamic> resumen) async {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Factura ${resumen['no_factura'] ?? ''}'),
        content: SizedBox(
          width: 560,
          child: FutureBuilder<Map<String, dynamic>>(
            future: widget.api.detalleFactura('${resumen['id']}'),
            builder: (context, snapshot) {
              if (snapshot.connectionState != ConnectionState.done) {
                return const SizedBox(height: 120, child: Center(child: CircularProgressIndicator()));
              }
              if (snapshot.hasError) {
                return Aviso(titulo: 'No se pudo abrir', mensaje: '${snapshot.error}', tipo: TipoAviso.error);
              }
              final datos = snapshot.data?['data'] as Map<String, dynamic>? ?? {};
              final factura = datos['factura'] as Map<String, dynamic>? ?? datos;
              final servicios = (datos['servicios'] as List<dynamic>?) ?? [];
              return SingleChildScrollView(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 26,
                      runSpacing: 8,
                      children: [
                        if (factura['cliente'] != null) _campo('Cliente', '${factura['cliente']}'),
                        if (factura['cuenta'] != null) _campo('Cuenta', '${factura['cuenta']}'),
                        if (factura['periodo_consumo'] != null) _campo('Periodo', '${factura['periodo_consumo']}'),
                        _campo('Total a pagar', '${factura['total_pagar'] ?? factura['totalPagar'] ?? '-'}'),
                        _campo('Lectura', '${resumen['confidence'] ?? '-'}%'),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text('Servicios (${servicios.length})', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (servicios.isEmpty)
                      const Text('Esta factura no tiene líneas de servicio guardadas.', style: TextStyle(fontSize: 13.5))
                    else
                      ...servicios.take(60).map((s) {
                        final m = s as Map<String, dynamic>;
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 4),
                          child: Text(
                            '${m['numero_servicio'] ?? m['numeroServicio'] ?? ''}   ·   importe ${m['importe'] ?? '-'}',
                            style: const TextStyle(fontSize: 13, fontFamily: 'Consolas'),
                          ),
                        );
                      }),
                  ],
                ),
              );
            },
          ),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
      ),
    );
  }

  Widget _campo(String etiqueta, String valor) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(etiqueta.toUpperCase(),
            style: const TextStyle(fontSize: 10.5, letterSpacing: 0.5, fontWeight: FontWeight.w700)),
        Text(valor, style: const TextStyle(fontSize: 14, fontFamily: 'Consolas')),
      ],
    );
  }
}
