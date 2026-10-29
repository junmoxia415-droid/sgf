import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../servicios/api.dart';
import '../widgets/comunes.dart';

/// Estadísticas de consumo con selección de meses.
///
/// Responde a tres preguntas de un vistazo:
///   1. Cómo va el gasto mes a mes (por defecto, los últimos 3 meses).
///   2. Qué líneas NO han consumido nada (los "ceros"), línea por línea.
///   3. Cuánto gasta cada oficial, sumando todas sus líneas.
class EstadisticasPantalla extends StatefulWidget {
  const EstadisticasPantalla({super.key, required this.api, required this.iniciarSesion});
  final Api api;
  final Future<bool> Function() iniciarSesion;

  @override
  State<EstadisticasPantalla> createState() => _EstadisticasPantallaState();
}

class _EstadisticasPantallaState extends State<EstadisticasPantalla> {
  Map<String, dynamic>? _datos;
  String? _error;
  bool _cargando = true;

  /// Meses elegidos por el usuario. Vacío = los últimos 3.
  final Set<String> _seleccion = <String>{};

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    if (!widget.api.conSesion) {
      setState(() => _cargando = false);
      return;
    }
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final q = _seleccion.isEmpty ? '' : '?periodos=${_seleccion.join(',')}';
      final respuesta = await widget.api.get('/api/estadisticas/meses$q');
      setState(() {
        _datos = respuesta['data'] as Map<String, dynamic>?;
        _cargando = false;
      });
    } catch (e) {
      setState(() {
        _error = e is ApiError ? e.mensaje : 'No se pudieron cargar las estadísticas.';
        _cargando = false;
      });
    }
  }

  void _alternarMes(String periodo) {
    setState(() {
      if (_seleccion.contains(periodo)) {
        _seleccion.remove(periodo);
      } else {
        _seleccion.add(periodo);
      }
    });
    _cargar();
  }

  void _ultimosMeses(int cuantos) {
    final disponibles = (_datos?['mesesDisponibles'] as List?)?.cast<String>() ?? const [];
    setState(() {
      _seleccion
        ..clear()
        ..addAll(disponibles.take(cuantos));
    });
    _cargar();
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.api.conSesion) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Cabecera(
            titulo: 'Estadísticas',
            descripcion: 'Consumo por meses, líneas sin consumo y gasto por oficial.',
          ),
          Aviso(
            titulo: 'Primero hay que iniciar sesión',
            mensaje: 'Las estadísticas salen de las facturas cargadas, que van asociadas a su usuario.',
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

    final datos = _datos;
    final disponibles = (datos?['mesesDisponibles'] as List?)?.cast<String>() ?? const <String>[];
    final meses = (datos?['meses'] as List?)?.cast<Map>() ?? const [];
    final lineas = (datos?['lineas'] as List?)?.cast<Map>() ?? const [];
    final oficiales = (datos?['oficiales'] as List?)?.cast<Map>() ?? const [];
    final resumen = (datos?['resumen'] as Map?)?.cast<String, dynamic>() ?? const <String, dynamic>{};

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Cabecera(
          titulo: 'Estadísticas',
          descripcion: 'Elija los meses que quiere comparar. Por defecto se muestran los tres últimos.',
          acciones: [
            OutlinedButton.icon(
              onPressed: _cargando ? null : _cargar,
              icon: const Icon(Icons.refresh),
              label: const Text('Actualizar'),
            ),
          ],
        ),
        if (_error != null) ...[
          Aviso(titulo: 'No se pudo cargar', mensaje: _error!, tipo: TipoAviso.error),
          const SizedBox(height: 16),
        ],
        if (disponibles.isEmpty && !_cargando)
          const Aviso(
            titulo: 'Todavía no hay facturas',
            mensaje: 'Importe primero el Excel de líneas y después las facturas PDF. '
                'En cuanto haya facturas, aquí aparecerá el consumo de cada mes.',
            tipo: TipoAviso.info,
          )
        else ...[
          _SelectorMeses(
            disponibles: disponibles,
            seleccionados: _seleccion.isEmpty
                ? ((datos?['mesesSeleccionados'] as List?)?.cast<String>() ?? const []).toSet()
                : _seleccion,
            alAlternar: _alternarMes,
            alElegirUltimos: _ultimosMeses,
          ),
          const SizedBox(height: 18),
          if (_cargando)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: CircularProgressIndicator()),
            )
          else ...[
            _TarjetasResumen(resumen: resumen),
            const SizedBox(height: 18),
            _GraficoMeses(meses: meses),
            const SizedBox(height: 18),
            _TablaOficiales(oficiales: oficiales, meses: meses),
            const SizedBox(height: 18),
            _TablaLineas(lineas: lineas, meses: meses),
          ],
        ],
      ],
    );
  }
}

/// Botones de mes: se pulsa para añadir o quitar. También hay atajos.
class _SelectorMeses extends StatelessWidget {
  const _SelectorMeses({
    required this.disponibles,
    required this.seleccionados,
    required this.alAlternar,
    required this.alElegirUltimos,
  });

  final List<String> disponibles;
  final Set<String> seleccionados;
  final void Function(String) alAlternar;
  final void Function(int) alElegirUltimos;

  static const _nombres = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ];

  /// "01/10/26 - 31/10/26" o "2026-10" -> "Octubre 2026".
  /// El periodo se guarda tal cual viene en la factura, así que hay que aceptar
  /// los dos formatos.
  static String etiqueta(String clave) {
    final iso = RegExp(r'(\d{4})-(\d{2})').firstMatch(clave);
    final latino = RegExp(r'(\d{1,2})/(\d{1,2})/(\d{2,4})').firstMatch(clave);
    int? mes;
    String? anio;
    if (iso != null) {
      anio = iso.group(1);
      mes = int.tryParse(iso.group(2)!);
    } else if (latino != null) {
      final a = latino.group(3)!;
      anio = a.length == 2 ? '20$a' : a;
      mes = int.tryParse(latino.group(2)!);
    }
    if (mes == null || anio == null || mes < 1 || mes > 12) return clave;
    final nombre = _nombres[mes - 1];
    return '${nombre[0].toUpperCase()}${nombre.substring(1)} $anio';
  }

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.calendar_month_outlined, color: tema.colorScheme.primary, size: 20),
              const SizedBox(width: 8),
              Text('Meses a comparar', style: tema.textTheme.titleSmall),
              const Spacer(),
              TextButton.icon(
                onPressed: () => alElegirUltimos(3),
                icon: const Icon(Icons.schedule, size: 18),
                label: const Text('Últimos 3'),
              ),
              const SizedBox(width: 4),
              TextButton.icon(
                onPressed: () => alElegirUltimos(6),
                icon: const Icon(Icons.schedule, size: 18),
                label: const Text('Últimos 6'),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            'Pulse un mes para añadirlo o quitarlo de la comparación.',
            style: TextStyle(fontSize: 13, color: tema.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              for (final mes in disponibles)
                FilterChip(
                  label: Text(etiqueta(mes)),
                  selected: seleccionados.contains(mes),
                  onSelected: (_) => alAlternar(mes),
                  avatar: seleccionados.contains(mes) ? const Icon(Icons.check, size: 16) : null,
                ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Cuatro cifras grandes: importe, líneas, ceros y promedio mensual.
class _TarjetasResumen extends StatelessWidget {
  const _TarjetasResumen({required this.resumen});
  final Map<String, dynamic> resumen;

  // Con separador de miles: 196.061,17 se lee mucho peor que 196,061.17
  static final _formato = NumberFormat('#,##0.00', 'en_US');
  static String _dinero(num v) => _formato.format(v);

  @override
  Widget build(BuildContext context) {
    num n(String clave) => (resumen[clave] as num?) ?? 0;
    final tarjetas = [
      ('Importe total', '${_dinero(n('importeTotal'))} CUP', Icons.payments_outlined, const Color(0xFF0E7C66)),
      ('Líneas facturadas', n('lineas').toInt().toString(), Icons.sim_card_outlined, const Color(0xFF1D6FB8)),
      ('Líneas a cero', n('lineasSinConsumo').toInt().toString(), Icons.block_outlined, const Color(0xFFB8730B)),
      ('Sin consumo los 3 meses', n('lineasSinConsumoLos3Meses').toInt().toString(), Icons.report_gmailerrorred_outlined, const Color(0xFFB3261E)),
    ];

    return LayoutBuilder(
      builder: (context, restricciones) {
        final columnas = restricciones.maxWidth > 900 ? 4 : (restricciones.maxWidth > 560 ? 2 : 1);
        final ancho = (restricciones.maxWidth - (columnas - 1) * 12) / columnas;
        return Wrap(
          spacing: 12,
          runSpacing: 12,
          children: [
            for (final t in tarjetas)
              SizedBox(
                width: ancho,
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Icon(t.$3, color: t.$4, size: 22),
                        const SizedBox(height: 10),
                        Text(t.$2, style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 2),
                        Text(t.$1, style: TextStyle(fontSize: 12.5, color: Theme.of(context).colorScheme.onSurfaceVariant)),
                      ],
                    ),
                  ),
                ),
              ),
          ],
        );
      },
    );
  }
}

/// Barras horizontales por mes: importe total y porcentaje de líneas a cero.
class _GraficoMeses extends StatelessWidget {
  const _GraficoMeses({required this.meses});
  final List<Map> meses;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final importes = meses.map((m) => (m['importeTotal'] as num?)?.toDouble() ?? 0).toList();
    final maximo = importes.isEmpty ? 1.0 : importes.reduce((a, b) => a > b ? a : b);
    final mayor = maximo <= 0 ? 1.0 : maximo;

    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Consumo por mes', style: tema.textTheme.titleSmall),
          const SizedBox(height: 14),
          for (final m in meses) ...[
            Row(
              children: [
                SizedBox(
                  width: 130,
                  child: Text(_SelectorMeses.etiqueta('${m['periodo']}'), style: const TextStyle(fontSize: 13.5)),
                ),
                Expanded(
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(6),
                    child: LinearProgressIndicator(
                      value: ((m['importeTotal'] as num?)?.toDouble() ?? 0) / mayor,
                      minHeight: 18,
                      backgroundColor: tema.colorScheme.surfaceContainerHighest,
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                SizedBox(
                  width: 120,
                  child: Text(
                    (m['importeTotal'] as num?)?.toStringAsFixed(2) ?? '0.00',
                    textAlign: TextAlign.right,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13.5),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Padding(
              padding: const EdgeInsets.only(left: 130, bottom: 10),
              child: Text(
                '${m['facturas']} facturas · ${m['lineas']} líneas · '
                '${m['lineasSinConsumo']} a cero (${m['porcentajeSinConsumo']}%) · '
                'media ${(m['importeMedio'] as num?)?.toStringAsFixed(2) ?? '0.00'}',
                style: TextStyle(fontSize: 12, color: tema.colorScheme.onSurfaceVariant),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

/// Tabla de oficiales: cuánto gasta cada uno cada mes.
class _TablaOficiales extends StatelessWidget {
  const _TablaOficiales({required this.oficiales, required this.meses});
  final List<Map> oficiales;
  final List<Map> meses;

  @override
  Widget build(BuildContext context) {
    if (oficiales.isEmpty) return const SizedBox.shrink();
    final tema = Theme.of(context);
    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Gasto por oficial', style: tema.textTheme.titleSmall),
          const SizedBox(height: 4),
          Text(
            'Suma de todas las líneas que tiene a su cargo cada persona.',
            style: TextStyle(fontSize: 12.5, color: tema.colorScheme.onSurfaceVariant),
          ),
          const SizedBox(height: 12),
          _Tabla(
            cabeceras: ['Oficial', 'Líneas', ...meses.map((m) => _SelectorMeses.etiqueta('${m['periodo']}')), 'Total'],
            filas: [
              for (final o in oficiales)
                [
                  o['oficial'] as String,
                  '${(o['lineas'] as num?)?.toInt() ?? 0}',
                  ...((o['importes'] as List?) ?? const []).map((v) => (v as num?)?.toStringAsFixed(2) ?? '0.00'),
                  (o['importeTotal'] as num?)?.toStringAsFixed(2) ?? '0.00',
                ],
            ],
            soloPrimeras: 25,
          ),
        ],
      ),
    );
  }
}

/// Tabla de líneas: el detalle que sirve para reclamar un consumo.
class _TablaLineas extends StatefulWidget {
  const _TablaLineas({required this.lineas, required this.meses});
  final List<Map> lineas;
  final List<Map> meses;

  @override
  State<_TablaLineas> createState() => _TablaLineasState();
}

class _TablaLineasState extends State<_TablaLineas> {
  bool _soloCeros = false;
  String _busqueda = '';

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    var filas = widget.lineas;
    if (_soloCeros) {
      filas = filas.where((l) => ((l['mesesCero'] as num?) ?? 0) > 0).toList();
    }
    if (_busqueda.trim().isNotEmpty) {
      final q = _busqueda.trim().toLowerCase();
      filas = filas
          .where((l) =>
              '${l['numero']}'.contains(q) ||
              '${l['nombre']}'.toLowerCase().contains(q) ||
              '${l['unidad']}'.toLowerCase().contains(q))
          .toList();
    }

    return Tarjeta(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text('Detalle por línea', style: tema.textTheme.titleSmall),
              const SizedBox(width: 12),
              FilterChip(
                label: Text('Solo las que tienen algún mes a cero (${widget.lineas.where((l) => ((l['mesesCero'] as num?) ?? 0) > 0).length})'),
                selected: _soloCeros,
                onSelected: (v) => setState(() => _soloCeros = v),
              ),
              const Spacer(),
              SizedBox(
                width: 240,
                child: TextField(
                  decoration: const InputDecoration(
                    isDense: true,
                    prefixIcon: Icon(Icons.search, size: 18),
                    hintText: 'Buscar número, nombre o unidad',
                  ),
                  onChanged: (v) => setState(() => _busqueda = v),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          if (filas.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 20),
              child: Text(
                _soloCeros
                    ? 'Ninguna línea ha quedado a cero en los meses elegidos.'
                    : 'No hay líneas para los meses elegidos.',
                style: TextStyle(color: tema.colorScheme.onSurfaceVariant),
              ),
            )
          else
            _Tabla(
              cabeceras: ['Número', 'Oficial', 'Unidad', ...widget.meses.map((m) => _SelectorMeses.etiqueta('${m['periodo']}')), 'Total', 'Ceros'],
              filas: [
                for (final l in filas)
                  [
                    l['numero'] as String,
                    l['nombre'] as String,
                    l['unidad'] as String,
                    ...((l['importes'] as List?) ?? const []).map((v) {
                      final numero = v as num?;
                      return numero == 0 ? '— 0' : numero?.toStringAsFixed(2) ?? '';
                    }),
                    (l['importeTotal'] as num?)?.toStringAsFixed(2) ?? '0.00',
                    '${(l['mesesCero'] as num?)?.toInt() ?? 0}',
                  ],
              ],
              soloPrimeras: 200,
              resaltarCeros: true,
            ),
        ],
      ),
    );
  }
}

/// Tabla sencilla con scroll horizontal, para que quepa cualquier número de meses.
class _Tabla extends StatelessWidget {
  const _Tabla({
    required this.cabeceras,
    required this.filas,
    this.soloPrimeras = 100,
    this.resaltarCeros = false,
  });

  final List<String> cabeceras;
  final List<List<String>> filas;
  final int soloPrimeras;
  final bool resaltarCeros;

  @override
  Widget build(BuildContext context) {
    final tema = Theme.of(context);
    final visibles = filas.take(soloPrimeras).toList();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: DataTable(
            headingRowHeight: 40,
            dataRowMinHeight: 34,
            dataRowMaxHeight: 38,
            columnSpacing: 22,
            headingTextStyle: TextStyle(fontSize: 12.5, fontWeight: FontWeight.w700, color: tema.colorScheme.onSurface),
            columns: [for (final c in cabeceras) DataColumn(label: Text(c))],
            rows: [
              for (final fila in visibles)
                DataRow(
                  cells: [
                    for (var i = 0; i < fila.length; i++)
                      DataCell(
                        Text(
                          fila[i],
                          style: TextStyle(
                            fontSize: 13,
                            // Un cero se marca en rojo: es lo que se busca al revisar
                            // las lineas que no han consumido nada.
                            color: resaltarCeros && i > 2 && fila[i].startsWith('—') ? const Color(0xFFB3261E) : null,
                            fontWeight: resaltarCeros && fila[i].startsWith('—') ? FontWeight.w600 : null,
                          ),
                        ),
                      ),
                  ],
                ),
            ],
          ),
        ),
        if (filas.length > soloPrimeras)
          Padding(
            padding: const EdgeInsets.only(top: 8),
            child: Text(
              'Se muestran las $soloPrimeras primeras filas de ${filas.length}. Use el buscador para afinar.',
              style: TextStyle(fontSize: 12, color: tema.colorScheme.onSurfaceVariant),
            ),
          ),
      ],
    );
  }
}
