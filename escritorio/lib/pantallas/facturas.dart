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
          descripcion: 'Suelte los PDF aquí o búsquelos en el equipo. El servidor lee el texto y cruza las líneas con el Excel importado; usted revisa y decide si guarda la factura.',
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
        final r = await widget.api.subirFactura(bytes, nombre, guardar: false);
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
              revisar: datos['requiereRevision'] == true || datos['extraccionVacia'] == true,
              parteDelMes: _textoParteDelMes(datos),
              datos: datos,
              bytes: bytes,
            ),
          );
        });
      } on ApiError catch (e) {
        if (!mounted) return;
        setState(() {
          _resultados.insert(
            0,
            _Resultado(
              archivo: nombre,
              exito: false,
              mensaje: e.mensaje,
            ),
          );
        });
      }
    }
    if (mounted) setState(() => _procesando = false);
  }

  Future<void> _guardar(_Resultado resultado) async {
    final datos = resultado.datos!;
    if (datos['posibleRegistroAntiguo'] == true) {
      avisar(context, 'Hay un registro anterior con número incompleto. Revise el historial con un administrador.', tipo: TipoAviso.aviso);
      return;
    }
    if (datos['duplicadoAjeno'] == true) {
      avisar(context, 'Esta factura pertenece a otra cuenta. No se ha sustituido; consulte al administrador.', tipo: TipoAviso.aviso);
      return;
    }
    final duplicada = datos['duplicadoPropio'] == true;
    final vacia = datos['extraccionVacia'] == true;
    final seguro = await confirmar(context,
      titulo: duplicada ? '¿Sustituir la factura anterior?' : '¿Guardar esta factura?',
      mensaje: (duplicada ? (datos['registroAntiguoIdentificado'] == true ? 'Se identificó esta factura en un registro antiguo con número incompleto. Se sustituirá únicamente ese registro. ' : 'Esta factura ya existe y se sustituirán sus datos anteriores. ') : '') +
          (vacia ? 'No se detectó ningún servicio: se guardará solamente la cabecera para revisión. ' : '') +
          'Revise los datos extraídos antes de continuar.',
      textoConfirmar: duplicada ? 'Sí, sustituir' : 'Guardar factura',
      destructivo: duplicada,
    );
    if (!seguro || !mounted) return;
    setState(() => _procesando = true);
    try {
      final r = await widget.api.subirFactura(resultado.bytes!, resultado.archivo,
        guardar: true, confirmarSustitucion: duplicada, confirmarSinServicios: vacia);
      if (!mounted) return;
      setState(() { resultado.guardado = true; resultado.mensaje = (r['message'] ?? 'Factura guardada.').toString(); });
      avisar(context, 'Factura guardada.');
    } on ApiError catch (e) {
      if (mounted) avisar(context, e.mensaje, tipo: TipoAviso.error);
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }

  Future<void> _verDatos(_Resultado resultado) async {
    final factura = (resultado.datos?['factura'] as Map?) ?? {};
    final servicios = (factura['servicios'] as List?) ?? [];
    final enriq = (resultado.datos?['enriquecimiento'] as Map?) ?? {};
    final vinculadas = <String, Map>{};
    for (final linea in (enriq['lineas'] as List? ?? [])) {
      if (linea is Map) vinculadas['${linea['NUMERO']}'] = linea;
    }
    await showDialog<void>(context: context, builder: (context) => AlertDialog(
      title: const Text('Datos extraídos del PDF'),
      content: SizedBox(width: 1000, child: SingleChildScrollView(child: Column(
        crossAxisAlignment: CrossAxisAlignment.start, children: [
          Wrap(spacing: 28, runSpacing: 12, children: [
            for (final campo in <(String, String)>[
              ('Factura', 'noFactura'), ('Cliente', 'cliente'), ('Cuenta', 'cuenta'),
              ('Número de cliente', 'numeroCliente'), ('Número de cuenta', 'numeroCuenta'),
              ('Dirección', 'direccion'), ('Emisión', 'fechaEmision'), ('Vencimiento', 'fechaVencimiento'),
              ('Periodo', 'periodoConsumo'), ('Código de pago', 'codigoPago'),
              ('Moneda', 'moneda'), ('NIT', 'nit'), ('Total a pagar', 'totalPagar'),
            ]) Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [
              Text(campo.$1, style: Theme.of(context).textTheme.labelMedium),
              SelectableText('${factura[campo.$2] ?? 'No detectado'}'),
            ]),
          ]),
          const SizedBox(height: 20),
          Text('Totales extraídos', style: Theme.of(context).textTheme.titleMedium),
          Wrap(spacing: 24, runSpacing: 10, children: [
            for (final campo in <(String, String)>[('Cuota', 'cuota'), ('Consumo', 'consumo'), ('Comisión', 'comision'), ('Impuesto', 'impuesto'), ('Facturado', 'facturado'), ('Estado de cuenta', 'estadoCuenta'), ('Total servicios', 'totalServicios'), ('Descuento', 'descuento')])
              Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisSize: MainAxisSize.min, children: [Text(campo.$1, style: Theme.of(context).textTheme.labelMedium), SelectableText('${(factura['totales'] as Map?)?[campo.$2] ?? 'No detectado'}')]),
          ]),
          const SizedBox(height: 20),
          Text('Servicios extraídos (${servicios.length})', style: Theme.of(context).textTheme.titleMedium),
          if (servicios.isEmpty) const Text('No se detectaron servicios en este documento.')
          else SingleChildScrollView(scrollDirection: Axis.horizontal, child: DataTable(
            columns: [for (final titulo in ['Número', 'Titular', 'Unidad', 'Cuota', 'Consumo', 'Comisión', 'Impuesto', 'Importe']) DataColumn(label: Text(titulo))],
            rows: [for (final valor in servicios) if (valor is Map) DataRow(cells: [
              for (final dato in [valor['numero'], vinculadas['${valor['numero']}']?['NOMBRE_COMPLETO'], vinculadas['${valor['numero']}']?['UNIDAD'], valor['cuota'], valor['consumo'], valor['comision'], valor['impuesto'], valor['importe']]) DataCell(Text('${dato ?? '—'}')),
            ])],
          )),
        ],
      ))),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cerrar'))],
    ));
  }

  /// "1 de 2 del mes" a partir de lo que devuelve el servidor.
  static String? _textoParteDelMes(Map<String, dynamic> datos) {
    final p = datos['periodo'] as Map<String, dynamic>?;
    if (p == null) return null;
    final esperadas = (p['facturasPorMes'] as num?)?.toInt() ?? 0;
    final parte = (p['parte'] as num?)?.toInt();
    final cargadas = (p['cargadasEsteMes'] as num?)?.toInt() ?? 0;
    if (esperadas <= 0) return null;
    final clave = (p['clave'] ?? '').toString();
    if (parte == null) return 'Mes $clave: $cargadas de $esperadas facturas';
    return 'Mes $clave: factura $parte de $esperadas';
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
                mensaje: '1) El servidor lee el documento y cruza los servicios con el Excel. '
                    '2) Revise los datos extraídos. 3) Decida si desea guardar o descartar la factura. '
                    'Si ya existe, la sustitución requiere su confirmación.',
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
                          itemBuilder: (context, i) => _TarjetaResultado(
                            resultado: _resultados[i], procesando: _procesando,
                            onGuardar: _guardar, onVer: _verDatos,
                            onDescartar: () => setState(() => _resultados.removeAt(i)),
                          ),
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
    this.revisar = false,
    this.parteDelMes,
    this.bytes,
    this.datos,
  });

  final String archivo;
  final bool exito;
  String mensaje;
  final List<int>? bytes;
  final Map<String, dynamic>? datos;
  bool guardado = false;
  final String noFactura;
  final String cliente;
  final int servicios;
  final int vinculadas;
  final int totalLineas;
  /// "Mes 2026-09: factura 2 de 2", si el servidor lo indica.
  final String? parteDelMes;
  final bool revisar;
}

class _TarjetaResultado extends StatelessWidget {
  const _TarjetaResultado({required this.resultado, required this.procesando, required this.onGuardar, required this.onVer, required this.onDescartar});
  final _Resultado resultado;
  final bool procesando;
  final Future<void> Function(_Resultado resultado) onGuardar;
  final Future<void> Function(_Resultado resultado) onVer;
  final VoidCallback onDescartar;

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
              if (r.exito)
                Etiqueta(texto: r.guardado ? 'Guardada' : 'Sin guardar', color: r.guardado ? const Color(0xFF1B7F4B) : const Color(0xFF1D6FB8)),
            ],
          ),
          const SizedBox(height: 6),
          Text(r.mensaje, style: const TextStyle(fontSize: 13.5, height: 1.4)),
          if (r.parteDelMes != null) ...[
            const SizedBox(height: 6),
            Row(
              children: [
                const Icon(Icons.calendar_month, size: 16, color: Color(0xFF4B5563)),
                const SizedBox(width: 6),
                Text(r.parteDelMes!, style: const TextStyle(fontSize: 12.5, color: Color(0xFF4B5563))),
              ],
            ),
          ],
          if (r.exito && r.datos != null) ...[
            const SizedBox(height: 8),
            if (r.datos!['duplicadoPropio'] == true && !r.guardado)
              Text(r.datos!['registroAntiguoIdentificado'] == true ? 'Factura identificada en un registro antiguo con número incompleto. Se sustituirá solo con su confirmación.' : 'Esta factura ya existe. Solo se sustituirá si lo confirma.', style: const TextStyle(color: Color(0xFFB8730B))),
            if (r.datos!['posibleRegistroAntiguo'] == true)
              const Text('Existe un registro antiguo con número incompleto. Revise el historial antes de guardar.', style: TextStyle(color: Color(0xFFB3261E))),
            if (r.datos!['duplicadoAjeno'] == true)
              const Text('Este número pertenece a otra cuenta; consulte al administrador.', style: TextStyle(color: Color(0xFFB3261E))),
            Wrap(spacing: 8, runSpacing: 8, children: [
              OutlinedButton.icon(onPressed: () => onVer(r), icon: const Icon(Icons.table_chart_outlined), label: const Text('Ver datos')),
              if (!r.guardado) FilledButton.icon(onPressed: procesando || r.datos!['duplicadoAjeno'] == true || r.datos!['posibleRegistroAntiguo'] == true ? null : () => onGuardar(r), icon: const Icon(Icons.save_outlined), label: const Text('Guardar factura')),
              if (!r.guardado) TextButton(onPressed: procesando ? null : onDescartar, child: const Text('Descartar')),
            ]),
          ],
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
            ObservacionesExtraccion(
              diagnosticos: ((r.datos?['factura'] as Map?)?['diagnostics'] as List?) ?? const [],
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

/// Muestra las causas de revisión antes de guardar, no solo un aviso genérico.
class ObservacionesExtraccion extends StatelessWidget {
  const ObservacionesExtraccion({super.key, required this.diagnosticos});
  final List<dynamic> diagnosticos;

  @override
  Widget build(BuildContext context) {
    final avisos = diagnosticos.whereType<Map>().where((d) =>
      (d['level'] == 'warn' || d['level'] == 'error') &&
      (d['message']?.toString().trim().isNotEmpty ?? false));
    const estilo = TextStyle(fontSize: 12.5, color: Color(0xFFB8730B), height: 1.4);
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Text('Esta factura necesita revisión manual antes de guardarla.', style: estilo),
      for (final aviso in avisos) Text('• ${aviso['message']}', style: estilo),
    ]);
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
                        if (factura['numero_cliente'] != null) _campo('Número de cliente', '${factura['numero_cliente']}'),
                        if (factura['numero_cuenta'] != null) _campo('Número de cuenta', '${factura['numero_cuenta']}'),
                        if (factura['fecha_emision'] != null) _campo('Emisión', '${factura['fecha_emision']}'),
                        if (factura['fecha_vencimiento'] != null) _campo('Vencimiento', '${factura['fecha_vencimiento']}'),
                        if (factura['codigo_pago'] != null) _campo('Código de pago', '${factura['codigo_pago']}'),
                        if (factura['moneda'] != null) _campo('Moneda', '${factura['moneda']}'),
                        if (factura['nit'] != null) _campo('NIT', '${factura['nit']}'),
                      ],
                    ),
                    const SizedBox(height: 14),
                    Text('Servicios (${servicios.length})', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    if (servicios.isEmpty)
                      const Text('Esta factura no tiene líneas de servicio guardadas.', style: TextStyle(fontSize: 13.5))
                    else
                      SingleChildScrollView(scrollDirection: Axis.horizontal, child: DataTable(
                        columns: [for (final titulo in ['Número', 'Cuota', 'Consumo', 'Comisión', 'Impuesto', 'Importe']) DataColumn(label: Text(titulo))],
                        rows: [for (final s in servicios) if (s is Map) DataRow(cells: [
                          for (final valor in [s['numero_servicio'] ?? s['numeroServicio'], s['cuota'], s['consumo'], s['comision'], s['impuesto'], s['importe']]) DataCell(SelectableText('${valor ?? '—'}')),
                        ])],
                      )),
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
