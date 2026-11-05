import 'dart:math' as math;
import 'package:flutter/material.dart';
import '../servicios/api.dart';
import '../widgets/comunes.dart';

/// Consulta paginada de los campos guardados en el catálogo importado.
class CatalogoLineasPantalla extends StatefulWidget {
  const CatalogoLineasPantalla({super.key, required this.api});
  final Api api;
  @override
  State<CatalogoLineasPantalla> createState() => _CatalogoLineasPantallaState();
}

class _CatalogoLineasPantallaState extends State<CatalogoLineasPantalla> {
  final _busqueda = TextEditingController();
  final _horizontal = ScrollController();
  final _vertical = ScrollController();
  List<Map<String, dynamic>> _filas = [];
  int _pagina = 1, _paginas = 1, _total = 0;
  bool _cargando = true;
  String? _error;
  String _termino = '';
  @override
  void initState() { super.initState(); _cargar(); }
  @override
  void dispose() { _busqueda.dispose(); _horizontal.dispose(); _vertical.dispose(); super.dispose(); }

  Future<void> _cargar() async {
    setState(() { _cargando = true; _error = null; });
    try {
      final params = Uri(queryParameters: {'page': '$_pagina', 'pageSize':'30', 'q':_termino}).query;
      final resultado = await widget.api.get('/api/lineas/catalogo?$params');
      final meta = (resultado['meta'] as Map?) ?? {};
      final filas = ((resultado['data'] as List?) ?? []).whereType<Map>().map((m) => Map<String,dynamic>.from(m)).toList();
      if (mounted) setState(() { _filas = filas; _total = (meta['total'] as num?)?.toInt() ?? 0; _paginas = (meta['totalPages'] as num?)?.toInt() ?? 1; });
    } on ApiError catch(e) { if (mounted) setState(() => _error = e.mensaje); }
    finally { if (mounted) setState(() => _cargando = false); }
  }

  void _moverColumnas(int direccion) {
    if (!_horizontal.hasClients) return;
    final p = _horizontal.position;
    final destino = (p.pixels + direccion * p.viewportDimension * .7).clamp(0.0, p.maxScrollExtent);
    _horizontal.animateTo(destino, duration: const Duration(milliseconds: 220), curve: Curves.easeOut);
  }

  String _titulo(String campo) {
    const nombres = {'NUMERO':'Número', 'USUARIO_PUESTO':'Titular / puesto', 'UNIDAD':'Unidad', 'ASIGNACION_VOZ':'Asignación voz', 'ASIGNACION_SMS':'Asignación SMS', 'TIPO_TELEFONO':'Tipo de teléfono', 'ID':'Identificador'};
    final nombre = nombres[campo.toUpperCase()];
    if (nombre != null) return nombre;
    final texto = campo.replaceAll('_', ' ').toLowerCase();
    return texto.isEmpty ? campo : '${texto[0].toUpperCase()}${texto.substring(1)}';
  }

  double _ancho(String campo) {
    switch (campo.toUpperCase()) {
      case 'ID': return 240;
      case 'USUARIO_PUESTO': case 'UNIDAD': case 'ESTRUCTURA': return 190;
      case 'NUMERO': return 130;
      default: return 145;
    }
  }

  @override
  Widget build(BuildContext context) {
    final columnas = <String>{for(final fila in _filas) ...fila.keys}.toList();
    const orden = ['NUMERO', 'USUARIO_PUESTO', 'UNIDAD', 'ESTRUCTURA', 'PROVINCIA', 'MUNICIPIO', 'ASIGNACION_VOZ', 'ASIGNACION_SMS', 'TIPO_TELEFONO'];
    int prioridad(String clave) {
      final indice = orden.indexOf(clave.toUpperCase());
      return indice >= 0 ? indice : clave.toUpperCase() == 'ID' ? 9999 : 100;
    }
    columnas.sort((a,b) { final p = prioridad(a).compareTo(prioridad(b)); return p != 0 ? p : a.compareTo(b); });
    final altura = math.min(520.0, math.max(260.0, MediaQuery.sizeOf(context).height * .52));
    final colores = Theme.of(context).colorScheme;
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      const Cabecera(titulo: 'Datos de líneas', descripcion: 'Busque por número, titular o unidad y consulte los datos importados.'),
      Tarjeta(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
          SizedBox(width: 320, child: TextField(controller: _busqueda, decoration: const InputDecoration(labelText: 'Número, titular o unidad', prefixIcon: Icon(Icons.search)), onSubmitted: (_) { setState(() { _pagina = 1; _termino = _busqueda.text.trim(); }); _cargar(); })),
          FilledButton(onPressed: _cargando ? null : () { setState(() { _pagina = 1; _termino = _busqueda.text.trim(); }); _cargar(); }, child: const Text('Buscar')),
        ]),
        const SizedBox(height: 16),
        if (_cargando) const Center(child: CircularProgressIndicator())
        else if (_error != null) Aviso(titulo: 'No se pudieron cargar las líneas', mensaje: _error!, tipo: TipoAviso.error)
        else if (_filas.isEmpty) const Text('No hay líneas para mostrar.')
        else ...[
          Row(children: [
            Icon(Icons.table_chart_outlined, size: 18, color: colores.primary),
            const SizedBox(width: 8),
            Expanded(child: Text('Use las barras o las flechas para ver más filas y columnas.', style: Theme.of(context).textTheme.bodySmall)),
            IconButton(tooltip: 'Columnas anteriores', onPressed: () => _moverColumnas(-1), icon: const Icon(Icons.chevron_left)),
            IconButton(tooltip: 'Columnas siguientes', onPressed: () => _moverColumnas(1), icon: const Icon(Icons.chevron_right)),
          ]),
          Container(
            decoration: BoxDecoration(border: Border.all(color: colores.outlineVariant), borderRadius: BorderRadius.circular(10)),
            clipBehavior: Clip.antiAlias,
            child: SizedBox(height: altura, child: Scrollbar(
              key: const ValueKey('barra-vertical-lineas'),
              controller: _vertical, thumbVisibility: true, trackVisibility: true, interactive: true, thickness: 10,
              notificationPredicate: (n) => n.metrics.axis == Axis.vertical,
              child: Scrollbar(
                key: const ValueKey('barra-horizontal-lineas'),
                controller: _horizontal, thumbVisibility: true, trackVisibility: true, interactive: true, thickness: 10,
                scrollbarOrientation: ScrollbarOrientation.bottom,
                notificationPredicate: (n) => n.metrics.axis == Axis.horizontal,
                child: SingleChildScrollView(
                  controller: _horizontal, scrollDirection: Axis.horizontal,
                  child: SizedBox(height: altura - 12, child: SingleChildScrollView(
                    controller: _vertical,
                    child: SelectionArea(child: DataTable(
                      horizontalMargin: 16, columnSpacing: 22, headingRowHeight: 48,
                      dataRowMinHeight: 54, dataRowMaxHeight: 66,
                      headingRowColor: WidgetStatePropertyAll(colores.primaryContainer.withValues(alpha: .45)),
                      headingTextStyle: TextStyle(color: colores.onSurface, fontWeight: FontWeight.w700, fontSize: 12),
                      columns: [for(final c in columnas) DataColumn(label: SizedBox(width: _ancho(c), child: Text(_titulo(c), overflow: TextOverflow.ellipsis)))],
                      rows: [for(var i=0; i<_filas.length; i++) DataRow(
                        color: WidgetStatePropertyAll(i.isEven ? colores.surface : colores.surfaceContainerHighest.withValues(alpha: .35)),
                        cells: [for(final c in columnas) DataCell(SizedBox(width: _ancho(c), child: Text('${_filas[i][c] ?? '—'}', maxLines: 2, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 13))))],
                      )],
                    )),
                  )),
                ),
              ),
            )),
          ),
        ],
        const SizedBox(height: 14),
        Wrap(spacing: 10, runSpacing: 8, crossAxisAlignment: WrapCrossAlignment.center, children: [
          Text('$_total filas · Página $_pagina de $_paginas'),
          OutlinedButton(onPressed: _cargando || _pagina <= 1 ? null : () {setState(() => _pagina--); _cargar();}, child: const Text('Anterior')),
          OutlinedButton(onPressed: _cargando || _pagina >= _paginas ? null : () {setState(() => _pagina++); _cargar();}, child: const Text('Siguiente')),
        ]),
      ])),
    ]);
  }
}
