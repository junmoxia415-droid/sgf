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
  List<Map<String, dynamic>> _filas = [];
  int _pagina = 1, _paginas = 1, _total = 0;
  bool _cargando = true;
  String? _error;
  String _termino = '';
  @override
  void initState() { super.initState(); _cargar(); }
  @override
  void dispose() { _busqueda.dispose(); super.dispose(); }

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

  @override
  Widget build(BuildContext context) {
    final columnas = <String>{for(final fila in _filas) ...fila.keys}.toList();
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      const Cabecera(titulo: 'Datos de líneas', descripcion: 'Consulte las filas importadas del Excel. Desplácese horizontalmente para ver todas las columnas.'),
      Tarjeta(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Wrap(spacing: 10, runSpacing: 10, crossAxisAlignment: WrapCrossAlignment.center, children: [
          SizedBox(width: 320, child: TextField(controller: _busqueda, decoration: const InputDecoration(labelText: 'Número, titular o unidad', prefixIcon: Icon(Icons.search)), onSubmitted: (_) { setState(() { _pagina = 1; _termino = _busqueda.text.trim(); }); _cargar(); })),
          FilledButton(onPressed: _cargando ? null : () { setState(() { _pagina = 1; _termino = _busqueda.text.trim(); }); _cargar(); }, child: const Text('Buscar')),
        ]),
        const SizedBox(height: 16),
        if (_cargando) const Center(child: CircularProgressIndicator())
        else if (_error != null) Aviso(titulo: 'No se pudieron cargar las líneas', mensaje: _error!, tipo: TipoAviso.error)
        else if (_filas.isEmpty) const Text('No hay líneas para mostrar.')
        else SingleChildScrollView(scrollDirection: Axis.horizontal, child: DataTable(
          columns: [for(final c in columnas) DataColumn(label: Text(c.replaceAll('_', ' ')))],
          rows: [for(final fila in _filas) DataRow(cells: [for(final c in columnas) DataCell(SelectableText('${fila[c] ?? '—'}'))])],
        )),
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
