import 'dart:io';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../widgets/comunes.dart';

/// Importación del Excel de líneas (titular, unidad, cargo de cada número).
class ImportarPantalla extends StatefulWidget {
  const ImportarPantalla({super.key, required this.api, required this.iniciarSesion});
  final Api api;
  final Future<bool> Function() iniciarSesion;

  @override
  State<ImportarPantalla> createState() => _ImportarPantallaState();
}

class _ImportarPantallaState extends State<ImportarPantalla> {
  File? _archivo;
  String _tabla = 'SGF_LINEAS_IMPORTADAS';
  bool _reemplazar = false;
  bool _subiendo = false;
  Map<String, dynamic>? _resultado;
  String? _error;

  static const _tablas = {
    'SGF_LINEAS_IMPORTADAS': 'Líneas de teléfono (recomendado)',
    'SGF_FACTURAS': 'Facturas (¡cuidado: puede borrar el historial!)',
  };

  Future<void> _elegirArchivo() async {
    final r = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['xlsx', 'xls'],
      dialogTitle: 'Seleccione el Excel de líneas',
    );
    if (r == null || r.files.single.path == null) return;
    setState(() {
      _archivo = File(r.files.single.path!);
      _resultado = null;
      _error = null;
    });
  }

  Future<void> _importar() async {
    if (_archivo == null) return;

    if (_reemplazar) {
      final seguro = await confirmar(
        context,
        titulo: '¿Reemplazar todo el contenido de la tabla?',
        mensaje: 'Se borrarán TODAS las filas actuales de «${_tablas[_tabla]}» antes de cargar el Excel. '
            'Esto no se puede deshacer. Úselo solo cuando quiera empezar de cero.',
        textoConfirmar: 'Sí, borrar y cargar',
        destructivo: true,
        escribirParaConfirmar: 'REEMPLAZAR',
      );
      if (!seguro) return;
    }

    setState(() {
      _subiendo = true;
      _error = null;
      _resultado = null;
    });
    try {
      final bytes = await _archivo!.readAsBytes();
      final real = await widget.api.importarExcel(bytes, _tabla, truncar: _reemplazar);
      final datos = (real['data'] as Map<String, dynamic>?) ?? {};
      setState(() => _resultado = datos);
      if (mounted) {
        avisar(context, (real['message'] ?? 'Importación completada.').toString());
      }
    } on ApiError catch (e) {
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _subiendo = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.api.esAdmin) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Cabecera(
            titulo: 'Importar Excel',
            descripcion: 'Carga de la relación de líneas (titular, unidad, cargo) para cruzar con las facturas.',
          ),
          Aviso(
            titulo: widget.api.conSesion ? 'Esta tarea es solo para administradores' : 'Inicie sesión como administrador',
            mensaje: 'Importar un Excel cambia datos de todo el sistema, por eso está reservado al administrador. '
                'Si necesita cargar el Excel, pida a un administrador que lo haga.',
            tipo: TipoAviso.aviso,
            accion: widget.api.conSesion
                ? null
                : FilledButton.icon(
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
        const Cabecera(
          titulo: 'Importar Excel de líneas',
          descripcion: 'Cargue el archivo con una fila por número de teléfono. Después, al procesar una factura, '
              'el sistema mostrará el titular, la unidad y el cargo de cada línea.',
        ),
        EnColumnas(
          izquierda: Column(
                children: [
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('1. Elija el archivo', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        Container(
                          width: double.infinity,
                          padding: const EdgeInsets.all(16),
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: _archivo != null ? const Color(0xFF1B7F4B) : Theme.of(context).dividerColor,
                              style: BorderStyle.solid,
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(_archivo != null ? Icons.description : Icons.upload_file,
                                  color: _archivo != null ? const Color(0xFF1B7F4B) : null),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Text(
                                  _archivo == null
                                      ? 'Ningún archivo seleccionado (.xlsx o .xls)'
                                      : _archivo!.path.split(Platform.pathSeparator).last,
                                  style: const TextStyle(fontSize: 14),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              OutlinedButton(
                                onPressed: _subiendo ? null : _elegirArchivo,
                                child: Text(_archivo == null ? 'Buscar…' : 'Cambiar'),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text('2. ¿Dónde se guarda?', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        ..._tablas.entries.map(
                          (e) => RadioListTile<String>(
                            value: e.key,
                            groupValue: _tabla,
                            onChanged: _subiendo ? null : (v) => setState(() => _tabla = v!),
                            title: Text(e.value, style: const TextStyle(fontSize: 14)),
                            subtitle: Text(e.key, style: const TextStyle(fontSize: 11.5, fontFamily: 'Consolas')),
                            contentPadding: EdgeInsets.zero,
                            dense: true,
                          ),
                        ),
                        const SizedBox(height: 10),
                        SwitchListTile(
                          value: _reemplazar,
                          onChanged: _subiendo ? null : (v) => setState(() => _reemplazar = v),
                          title: const Text('Borrar lo anterior antes de cargar', style: TextStyle(fontSize: 14)),
                          subtitle: const Text(
                            'Normalmente NO hace falta: si no lo activa, las filas del Excel se añaden y actualizan.',
                            style: TextStyle(fontSize: 12.5),
                          ),
                          contentPadding: EdgeInsets.zero,
                        ),
                        const SizedBox(height: 12),
                        SizedBox(
                          width: double.infinity,
                          child: FilledButton.icon(
                            onPressed: _archivo == null || _subiendo ? null : _importar,
                            icon: _subiendo
                                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                                : const Icon(Icons.cloud_upload),
                            label: Text(_subiendo ? 'Importando…' : 'Importar ahora'),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
          ),
          derecha: Column(
                children: [
                  if (_error != null)
                    Aviso(titulo: 'No se pudo importar', mensaje: _error!, tipo: TipoAviso.error),
                  if (_resultado != null)
                    Tarjeta(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              const Icon(Icons.check_circle, color: Color(0xFF1B7F4B)),
                              const SizedBox(width: 8),
                              Text('Importación terminada', style: Theme.of(context).textTheme.titleMedium),
                            ],
                          ),
                          const SizedBox(height: 14),
                          _dato('Filas importadas', '${_resultado!['importedRows'] ?? _resultado!['imported'] ?? 0}'),
                          _dato('Filas fallidas', '${_resultado!['failedRows'] ?? _resultado!['failed'] ?? 0}'),
                          _dato('Columnas nuevas', '${(_resultado!['addedColumns'] as List?)?.length ?? 0}'),
                          if ((_resultado!['errors'] as List?)?.isNotEmpty == true) ...[
                            const SizedBox(height: 10),
                            Aviso(
                              titulo: 'Algunas filas no se cargaron',
                              mensaje: '${(_resultado!['errors'] as List).take(5).join('\n')}',
                              tipo: TipoAviso.aviso,
                            ),
                          ],
                        ],
                      ),
                    ),
                  const SizedBox(height: 14),
                  const Aviso(
                    titulo: 'Qué columnas se leen',
                    mensaje: 'El sistema reconoce el número de teléfono (Número / Servicio), el titular '
                        '(Usuario/Puesto), el Órgano, la Unidad y el Cargo. Las demás columnas se guardan tal cual, '
                        'así que no hace falta recortar el archivo.',
                    tipo: TipoAviso.info,
                  ),
                ],
          ),
        ),
      ],
    );
  }

  Widget _dato(String etiqueta, String valor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(
        children: [
          Expanded(child: Text(etiqueta, style: const TextStyle(fontSize: 14))),
          Text(valor, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
        ],
      ),
    );
  }
}
