import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../servicios/ajustes.dart';
import '../servicios/api.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';

/// Ajustes de la aplicación + guía de uso en lenguaje llano.
class AjustesPantalla extends StatefulWidget {
  const AjustesPantalla({
    super.key,
    required this.ajustes,
    required this.servidor,
    required this.api,
    required this.alCambiar,
  });

  final Ajustes ajustes;
  final ControladorServidor servidor;
  final Api api;
  final VoidCallback alCambiar;

  @override
  State<AjustesPantalla> createState() => _AjustesPantallaState();
}

class _AjustesPantallaState extends State<AjustesPantalla> {
  final _puerto = TextEditingController();
  // Se parte del valor habitual (2). Si el servidor no responde, el usuario ve
  // igualmente las opciones y un aviso, en vez de una tarjeta vacía.
  int _facturasPorMes = 2;
  List<dynamic> _meses = const [];
  String? _errorPeriodos;

  @override
  void initState() {
    super.initState();
    _puerto.text = '${widget.ajustes.puerto}';
    _cargarPeriodos();
  }

  Future<void> _cargarPeriodos() async {
    try {
      final datos = await widget.api.periodos();
      if (!mounted) return;
      setState(() {
        _facturasPorMes = (datos['facturasPorMes'] as num?)?.toInt() ?? _facturasPorMes;
        _meses = (datos['meses'] as List<dynamic>?) ?? const [];
        _errorPeriodos = null;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _errorPeriodos = '$e');
    }
  }

  Future<void> _guardarFacturasPorMes(int cuantas) async {
    final anterior = _facturasPorMes;
    setState(() => _facturasPorMes = cuantas);
    try {
      final r = await widget.api.guardarFacturasPorMes(cuantas);
      if (!mounted) return;
      avisar(context, (r['message'] ?? 'Guardado.').toString());
      await _cargarPeriodos();
    } catch (e) {
      if (!mounted) return;
      setState(() => _facturasPorMes = anterior);
      avisar(context, 'No se pudo guardar: $e', tipo: TipoAviso.error);
    }
  }

  /// Nombre legible del mes: "2026-09" → "septiembre de 2026".
  String _nombreMes(String clave) {
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    final partes = clave.split('-');
    if (partes.length != 2) return clave;
    final m = int.tryParse(partes[1]);
    if (m == null || m < 1 || m > 12) return clave;
    return '${meses[m - 1]} de ${partes[0]}';
  }

  @override
  void dispose() {
    _puerto.dispose();
    super.dispose();
  }

  Future<void> _guardar({bool reiniciar = false}) async {
    final nuevo = int.tryParse(_puerto.text.trim());
    if (nuevo == null || nuevo < 1024 || nuevo > 65535) {
      avisar(context, 'El puerto debe ser un número entre 1024 y 65535.', tipo: TipoAviso.aviso);
      return;
    }
    final cambiaPuerto = nuevo != widget.ajustes.puerto;
    widget.ajustes.puerto = nuevo;
    widget.ajustes.urlPublica = 'http://127.0.0.1:$nuevo';
    await widget.ajustes.guardar();
    widget.alCambiar();
    if (!mounted) return;
    if (cambiaPuerto || reiniciar) {
      final ok = await confirmar(
        context,
        titulo: 'Reiniciar el servidor para aplicar el cambio',
        mensaje: 'El puerto nuevo solo se usa cuando el servidor vuelve a arrancar. ¿Reiniciarlo ahora? '
            'Se tarda unos segundos y no se pierde ningún dato.',
        textoConfirmar: 'Reiniciar ahora',
      );
      if (ok) await widget.servidor.reiniciar();
    }
    if (mounted) avisar(context, 'Ajustes guardados.');
  }

  @override
  Widget build(BuildContext context) {
    final a = widget.ajustes;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Cabecera(
          titulo: 'Ajustes y guía',
          descripcion: 'Cómo se comporta la aplicación y un recordatorio de los pasos habituales.',
        ),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 5,
              child: Column(
                children: [
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            const Icon(Icons.calendar_month, size: 20),
                            const SizedBox(width: 8),
                            Text('Facturas por mes', style: Theme.of(context).textTheme.titleMedium),
                          ],
                        ),
                        const SizedBox(height: 6),
                        const Text(
                          'Lo habitual es cargar 2 facturas por mes (la primera y la segunda quincena). '
                          'Elija cuántas se esperan; si un mes llega otra cantidad, se avisa pero nunca se bloquea.',
                          style: TextStyle(fontSize: 13, height: 1.4),
                        ),
                        const SizedBox(height: 12),
                        if (_errorPeriodos != null)
                          Padding(
                            padding: const EdgeInsets.only(bottom: 10),
                            child: Text(
                              'No se pudo consultar el servidor, así que se muestra el valor habitual. '
                              'Al elegir una opción se intentará guardar igualmente.',
                              style: const TextStyle(fontSize: 12.5, color: Color(0xFFB8730B), height: 1.35),
                            ),
                          ),
                        ...[
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final n in [1, 2, 3, 4, 5, 6, 8, 10])
                                ChoiceChip(
                                  label: Text(n == 1 ? '1 factura' : '$n facturas'),
                                  selected: _facturasPorMes == n,
                                  onSelected: (_) => _guardarFacturasPorMes(n),
                                ),
                            ],
                          ),
                          const SizedBox(height: 10),
                          Row(
                            children: [
                              Expanded(
                                child: Text(
                                  _facturasPorMes == 1
                                      ? 'Se espera 1 factura por mes.'
                                      : 'Se esperan $_facturasPorMes facturas por mes (hasta $_facturasPorMes se aceptan sin aviso).',
                                  style: const TextStyle(fontSize: 13),
                                ),
                              ),
                              TextButton.icon(
                                onPressed: _cargarPeriodos,
                                icon: const Icon(Icons.refresh, size: 18),
                                label: const Text('Actualizar'),
                              ),
                            ],
                          ),
                          if (_meses.isNotEmpty) ...[
                            const Divider(height: 22),
                            Text('Cómo van los últimos meses', style: Theme.of(context).textTheme.titleSmall),
                            const SizedBox(height: 8),
                            for (final m in _meses.take(6))
                              Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Row(
                                  children: [
                                    Icon(
                                      m['completa'] == true ? Icons.check_circle : Icons.pending_outlined,
                                      size: 18,
                                      color: m['completa'] == true
                                          ? const Color(0xFF1B7F4B)
                                          : const Color(0xFFB8730B),
                                    ),
                                    const SizedBox(width: 8),
                                    Expanded(child: Text(_nombreMes('${m['periodo']}'), style: const TextStyle(fontSize: 13.5))),
                                    Text(
                                      '${m['facturas']} de ${m['esperadas']}',
                                      style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                                    ),
                                  ],
                                ),
                              ),
                          ],
                        ],
                        const Divider(height: 24),
                        Text('Comportamiento', style: Theme.of(context).textTheme.titleMedium),
                        SwitchListTile(
                          value: a.arrancarAlAbrir,
                          onChanged: (v) async {
                            setState(() => a.arrancarAlAbrir = v);
                            await a.guardar();
                          },
                          title: const Text('Arrancar el servidor al abrir la aplicación'),
                          subtitle: const Text('Recomendado: así el sistema está listo sin pulsar nada.'),
                          contentPadding: EdgeInsets.zero,
                        ),
                        SwitchListTile(
                          value: a.temaOscuro,
                          onChanged: (v) async {
                            setState(() => a.temaOscuro = v);
                            await a.guardar();
                            widget.alCambiar();
                          },
                          title: const Text('Tema oscuro'),
                          subtitle: const Text('Más cómodo con poca luz o pantallas brillantes.'),
                          contentPadding: EdgeInsets.zero,
                        ),
                        const Divider(height: 24),
                        Text('Puerto del servidor', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 6),
                        const Text(
                          'Solo hace falta cambiarlo si otro programa del equipo ya usa el puerto 3000. '
                          'Si la aplicación deja de conectar, mire el registro en «Servidor».',
                          style: TextStyle(fontSize: 13, height: 1.4),
                        ),
                        const SizedBox(height: 10),
                        Row(
                          children: [
                            SizedBox(
                              width: 140,
                              child: TextField(
                                controller: _puerto,
                                keyboardType: TextInputType.number,
                                inputFormatters: [FilteringTextInputFormatter.digitsOnly],
                                decoration: const InputDecoration(labelText: 'Puerto'),
                              ),
                            ),
                            const SizedBox(width: 12),
                            FilledButton.icon(
                              onPressed: () => _guardar(),
                              icon: const Icon(Icons.save_outlined, size: 18),
                              label: const Text('Guardar'),
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
                        Row(
                          children: [
                            const Icon(Icons.menu_book_outlined),
                            const SizedBox(width: 8),
                            Text('Guía rápida', style: Theme.of(context).textTheme.titleMedium),
                          ],
                        ),
                        const SizedBox(height: 12),
                        _paso('1', 'Abra la aplicación',
                            'El servidor se inicia solo. En la barra de arriba debe verse «Servidor en marcha» en verde.'),
                        _paso('2', 'Inicie sesión',
                            'Use la cuenta creada en el asistente. El administrador puede crear otras cuentas y asignar permisos.'),
                        _paso('3', 'Cargue el Excel de líneas (una vez al mes)',
                            'En «Importar Excel», elija el archivo y pulse Importar. Esto permite ver el titular de cada número.'),
                        _paso('4', 'Procese las facturas',
                            'En «Facturas», arrastre los PDF y revise los datos extraídos. Elija Guardar o Descartar; sustituir una factura exige confirmación.'),
                        _paso('5', 'Consulte los datos importados',
                            'En «Datos de líneas» puede buscar y recorrer todas las columnas del catálogo importado, con el permiso correspondiente.'),
                        _paso('6', 'Configure la base de datos',
                            'El administrador puede probar y cambiar entre SQLite, Oracle y SQL Server desde «Servidor». Cada base conserva sus propios usuarios y datos; no se migran automáticamente.'),
                        _paso('7', 'Haga una copia al terminar el día',
                            'En «Servidor», pulse «Crear copia ahora». Se guardan las 10 últimas copias.'),
                        const SizedBox(height: 6),
                        const Aviso(
                          titulo: 'Si algo va mal',
                          mensaje: '1) Mire el registro en «Servidor».  2) Pulse Reiniciar.  '
                              '3) Si sigue igual, cierre la aplicación, vuelva a abrirla y, si es necesario, '
                              'restaure una copia de seguridad con el administrador del sistema.',
                          tipo: TipoAviso.aviso,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              flex: 4,
              child: Column(
                children: [
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Sobre esta aplicación', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        _fila('Programa', 'SGF Escritorio ${const String.fromEnvironment('SGF_VERSION', defaultValue: '4.0.3')}'),
                        _fila('Motor', 'Incluido (no hace falta instalar nada más)'),
                        _fila('Datos', Ajustes.carpeta.path),
                        _fila('Escucha en', a.urlBaseLocal),
                        const SizedBox(height: 10),
                        const Text(
                          'La aplicación funciona sin internet. El servidor admite conexiones de redes privadas; los datos se guardan en la base configurada.',
                          style: TextStyle(fontSize: 13, height: 1.4),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Atajos de teclado', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 10),
                        _atajo('Ctrl + R', 'Reiniciar el servidor'),
                        _atajo('Ctrl + L', 'Iniciar sesión'),
                        _atajo('Ctrl + B', 'Crear copia de seguridad'),
                        _atajo('F1', 'Abrir esta guía'),
                        const SizedBox(height: 8),
                        const Text('Consejo: arrastre los PDF directamente sobre la pantalla de Facturas.',
                            style: TextStyle(fontSize: 12.5)),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ],
    );
  }

  Widget _paso(String numero, String titulo, String detalle) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 26,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: Theme.of(context).colorScheme.primary.withValues(alpha: 0.13),
              shape: BoxShape.circle,
            ),
            child: Text(numero,
                style: TextStyle(
                    fontWeight: FontWeight.w800,
                    fontSize: 13,
                    color: Theme.of(context).colorScheme.primary)),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                Text(detalle, style: const TextStyle(fontSize: 13, height: 1.4)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _fila(String etiqueta, String valor) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 90, child: Text(etiqueta, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600))),
          Expanded(child: Text(valor, style: const TextStyle(fontSize: 13, fontFamily: 'Consolas'))),
        ],
      ),
    );
  }

  Widget _atajo(String tecla, String accion) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(
        children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: Theme.of(context).dividerColor,
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(tecla, style: const TextStyle(fontSize: 12, fontFamily: 'Consolas', fontWeight: FontWeight.w700)),
          ),
          const SizedBox(width: 10),
          Expanded(child: Text(accion, style: const TextStyle(fontSize: 13))),
        ],
      ),
    );
  }
}
