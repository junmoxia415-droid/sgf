import 'package:flutter/material.dart';

import '../servicios/ajustes.dart';
import '../servicios/api.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';
import 'pantalla_principal.dart';

/// Asistente de primera vez: 3 pasos en lenguaje llano.
///   1. Elegir dónde se guardan los datos (SQLite local u Oracle / SQL Server).
///   2. Comprobar que el servidor arranca.
///   3. Crear la cuenta del administrador.
class AsistenteInicial extends StatefulWidget {
  const AsistenteInicial({
    super.key,
    required this.servidor,
    required this.api,
    required this.ajustes,
    this.alCambiarTema,
    this.alTerminar,
  });

  final ControladorServidor servidor;
  final Api api;
  final Ajustes ajustes;
  final VoidCallback? alCambiarTema;
  final VoidCallback? alTerminar;

  @override
  State<AsistenteInicial> createState() => _AsistenteInicialState();
}

class _AsistenteInicialState extends State<AsistenteInicial> {
  int _paso = 0;
  String _modo = 'sqlite';

  // Oracle
  final _oHost = TextEditingController(text: '');
  final _oPuerto = TextEditingController(text: '1521');
  final _oServicio = TextEditingController(text: '');
  final _oUsuario = TextEditingController();
  final _oClave = TextEditingController();

  // SQL Server
  final _sServidor = TextEditingController();
  final _sBd = TextEditingController();
  final _sUsuario = TextEditingController();
  final _sClave = TextEditingController();

  // Administrador
  final _adminUsuario = TextEditingController(text: 'admin');
  final _adminNombre = TextEditingController(text: 'Administrador');
  final _adminClave = TextEditingController();
  final _adminClave2 = TextEditingController();

  bool _probando = false;
  bool _guardando = false;
  String? _resultadoPrueba;
  bool _pruebaOk = false;
  String? _error;

  @override
  void dispose() {
    for (final c in [
      _oHost, _oPuerto, _oServicio, _oUsuario, _oClave,
      _sServidor, _sBd, _sUsuario, _sClave,
      _adminUsuario, _adminNombre, _adminClave, _adminClave2,
    ]) {
      c.dispose();
    }
    super.dispose();
  }

  Map<String, dynamic> get _configuracion => _modo == 'oracle'
      ? {
          'type': 'oracle',
          'host': _oHost.text.trim(),
          'port': _oPuerto.text.trim(),
          'service': _oServicio.text.trim(),
          'user': _oUsuario.text.trim(),
          'password': _oClave.text,
        }
      : {
          'type': 'mssql',
          'server': _sServidor.text.trim(),
          'port': '1433',
          'database': _sBd.text.trim(),
          'user': _sUsuario.text.trim(),
          'password': _sClave.text,
        };

  Future<void> _probarConexion() async {
    setState(() {
      _probando = true;
      _resultadoPrueba = null;
    });
    try {
      final r = await widget.api.post('/api/db/test', _configuracion);
      final latencia = (r['data']?['latencyMs'] ?? 0);
      setState(() {
        _pruebaOk = true;
        _resultadoPrueba = 'Conexión correcta ($latencia ms).';
      });
    } on ApiError catch (e) {
      setState(() {
        _pruebaOk = false;
        _resultadoPrueba = 'No se pudo conectar: ${e.mensaje}';
      });
    } finally {
      if (mounted) setState(() => _probando = false);
    }
  }

  Future<void> _conectar() async {
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      await widget.api.post('/api/db/connect', _configuracion);
      widget.ajustes.modoBd = _modo;
      await widget.ajustes.guardar();
      await widget.servidor.reiniciar();
      if (mounted) setState(() => _paso = 2);
    } on ApiError catch (e) {
      setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _guardando = false);
    }
  }

  Future<void> _crearAdmin() async {
    final usuario = _adminUsuario.text.trim();
    final nombre = _adminNombre.text.trim();
    if (usuario.length < 3) {
      setState(() => _error = 'El usuario debe tener al menos 3 caracteres.');
      return;
    }
    if (nombre.length < 2) {
      setState(() => _error = 'Escriba el nombre de la persona.');
      return;
    }
    // El servidor exige 8: se avisa aquí para no dar el viaje en balde.
    if (_adminClave.text.length < 8) {
      setState(() => _error = 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (_adminClave.text != _adminClave2.text) {
      setState(() => _error = 'Las dos contraseñas no coinciden.');
      return;
    }
    setState(() {
      _guardando = true;
      _error = null;
    });
    try {
      // Ruta de configuración inicial: NO pide sesión, porque todavía no hay
      // ninguna cuenta (antes se llamaba a /api/users, que exige ser
      // administrador, y por eso salía "Token no proporcionado").
      final respuesta = await widget.api.configurarPrimeraCuenta(
        usuario: usuario,
        nombre: nombre,
        clave: _adminClave.text,
      );
      final token = '${(respuesta['data'] as Map?)?['token'] ?? ''}';
      if (token.isNotEmpty) {
        await widget.api.usarToken(token, usuario);
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _guardando = false;
          _error = e.codigo == 409
              ? 'Ya existe una cuenta en este equipo. Inicie sesión con ella.'
              : e.mensaje;
        });
      }
      return;
    }

    widget.ajustes
      ..asistenteCompletado = true
      ..modoBd = _modo;
    await widget.ajustes.guardar();

    if (!mounted) return;
    setState(() => _paso = 3);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 980),
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Container(
                        width: 46,
                        height: 46,
                        decoration: BoxDecoration(
                          color: Theme.of(context).colorScheme.primary,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: const Icon(Icons.receipt_long, color: Colors.white),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text('Bienvenido a SGF', style: Theme.of(context).textTheme.headlineSmall),
                            const Text('Vamos a dejar el sistema listo en tres pasos. No hace falta saber informática.',
                                style: TextStyle(fontSize: 14)),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),
                  _Indicador(paso: _paso),
                  const SizedBox(height: 20),
                  if (_paso == 0) _pasoDatos(),
                  if (_paso == 1) _pasoAdministrador(),
                  if (_paso == 2) _pasoListo(),
                  if (_paso == 3) _pasoFinal(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _pasoDatos() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Paso 1 · ¿Dónde se guardan los datos?', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        const Text(
          'Si no está seguro, deje la primera opción: funciona de inmediato y sin configurar nada. '
          'Siempre se puede cambiar más adelante.',
          style: TextStyle(fontSize: 14),
        ),
        const SizedBox(height: 18),
        _Opcion(
          seleccionada: _modo == 'sqlite',
          icono: Icons.computer,
          titulo: 'En este equipo (recomendado)',
          detalle: 'Los datos se guardan en este ordenador. No necesita internet ni un servidor de base de datos. '
              'Es la opción para trabajar sin conexión.',
          alPulsar: () => setState(() => _modo = 'sqlite'),
        ),
        _Opcion(
          seleccionada: _modo == 'oracle',
          icono: Icons.storage,
          titulo: 'Base de datos Oracle de la empresa',
          detalle: 'Los datos se guardan en el servidor central. Necesita la dirección, el usuario y la contraseña '
              'que le haya dado el administrador de la base de datos.',
          alPulsar: () => setState(() => _modo = 'oracle'),
        ),
        _Opcion(
          seleccionada: _modo == 'mssql',
          icono: Icons.dns,
          titulo: 'Base de datos SQL Server de la empresa',
          detalle: 'Igual que la anterior, pero con SQL Server.',
          alPulsar: () => setState(() => _modo = 'mssql'),
        ),
        if (_modo != 'sqlite') ...[
          const SizedBox(height: 8),
          Tarjeta(
            child: Column(
              children: [
                if (_modo == 'oracle') ...[
                  _campo(_oHost, 'Servidor (IP o nombre)', ayuda: 'Ejemplo: 10.0.0.15'),
                  _campo(_oPuerto, 'Puerto', ayuda: 'Normalmente 1521'),
                  _campo(_oServicio, 'Servicio / SID', ayuda: 'Ejemplo: ORCL'),
                ] else ...[
                  _campo(_sServidor, 'Servidor (IP o nombre)', ayuda: 'Ejemplo: 10.0.0.20'),
                  _campo(_sBd, 'Base de datos', ayuda: 'Ejemplo: SGF'),
                ],
                _campo(_modo == 'oracle' ? _oUsuario : _sUsuario, 'Usuario'),
                _campo(_modo == 'oracle' ? _oClave : _sClave, 'Contraseña', oculto: true),
                const SizedBox(height: 6),
                Row(
                  children: [
                    OutlinedButton.icon(
                      onPressed: _probando ? null : _probarConexion,
                      icon: _probando
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                          : const Icon(Icons.wifi_tethering, size: 18),
                      label: Text(_probando ? 'Probando…' : 'Probar conexión'),
                    ),
                  ],
                ),
                if (_resultadoPrueba != null) ...[
                  const SizedBox(height: 12),
                  Aviso(
                    titulo: _pruebaOk ? 'Conexión correcta' : 'No se pudo conectar',
                    mensaje: _resultadoPrueba!,
                    tipo: _pruebaOk ? TipoAviso.exito : TipoAviso.error,
                  ),
                ],
              ],
            ),
          ),
        ],
        if (_error != null) ...[
          const SizedBox(height: 12),
          Aviso(titulo: 'Aviso', mensaje: _error!, tipo: TipoAviso.error),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            const Spacer(),
            FilledButton.icon(
              onPressed: _guardando
                  ? null
                  : () async {
                      if (_modo == 'sqlite') {
                        widget.ajustes.modoBd = 'sqlite';
                        await widget.ajustes.guardar();
                        setState(() => _paso = 1);
                      } else {
                        await _conectar();
                      }
                    },
              icon: _guardando
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.arrow_forward),
              label: Text(_guardando ? 'Conectando…' : 'Continuar'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _pasoAdministrador() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Paso 2 · Cuenta del administrador', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 6),
        const Text(
          'Esta cuenta sirve para entrar al sistema, importar el Excel de líneas y crear las cuentas del resto del personal. '
          'Esta es la cuenta con la que entrará siempre. Anote la contraseña en un lugar seguro.',
          style: TextStyle(fontSize: 14),
        ),
        const SizedBox(height: 18),
        Tarjeta(
          child: Column(
            children: [
              _campo(_adminNombre, 'Nombre y apellidos'),
              _campo(_adminUsuario, 'Usuario para entrar', ayuda: 'Por ejemplo: admin'),
              _campo(_adminClave, 'Contraseña', ayuda: 'Al menos 6 caracteres', oculto: true),
              _campo(_adminClave2, 'Repita la contraseña', oculto: true),
            ],
          ),
        ),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Aviso(titulo: 'No se pudo continuar', mensaje: _error!, tipo: TipoAviso.error),
        ],
        const SizedBox(height: 18),
        Row(
          children: [
            TextButton.icon(
              onPressed: () => setState(() => _paso = 0),
              icon: const Icon(Icons.arrow_back),
              label: const Text('Atrás'),
            ),
            const Spacer(),
            FilledButton.icon(
              onPressed: _guardando ? null : _crearAdmin,
              icon: _guardando
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.check),
              label: Text(_guardando ? 'Creando…' : 'Crear la cuenta y terminar'),
            ),
          ],
        ),
      ],
    );
  }

  Widget _pasoListo() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Paso 2 · Cuenta del administrador', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 14),
        const Aviso(
          titulo: 'Conexión a la base de datos configurada',
          mensaje: 'El servidor se ha reiniciado con la nueva base de datos. Ahora cree la cuenta del administrador.',
          tipo: TipoAviso.exito,
        ),
        const SizedBox(height: 14),
        FilledButton(onPressed: () => setState(() => _paso = 1), child: const Text('Continuar')),
      ],
    );
  }

  Widget _pasoFinal() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Paso 3 · Todo listo', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 12),
        const Aviso(
          titulo: 'La instalación ha terminado',
          mensaje: 'Ya puede usar el sistema. La próxima vez, abra esta misma aplicación: el servidor se inicia solo '
              'y todo estará donde lo dejó.',
          tipo: TipoAviso.exito,
        ),
        const SizedBox(height: 18),
        _recordatorio('Cargue el Excel de líneas', 'Menú «Importar Excel». Así verá el titular de cada número de teléfono.'),
        _recordatorio('Procese las facturas', 'Menú «Facturas». Arrastre los PDF y el sistema los guarda.'),
        _recordatorio('Haga una copia al final del día', 'Menú «Servidor» → «Crear copia ahora».'),
        const SizedBox(height: 18),
        FilledButton.icon(
          onPressed: () {
            if (widget.alTerminar != null) { widget.alTerminar!(); return; }
            Navigator.of(context).pushAndRemoveUntil(
              MaterialPageRoute(
                builder: (_) => PantallaPrincipal(
                  servidor: widget.servidor,
                  api: widget.api,
                  ajustes: widget.ajustes,
                  alCambiarTema: widget.alCambiarTema,
                ),
              ),
              (r) => false,
            );
          },
          icon: const Icon(Icons.play_arrow),
          label: const Text('Empezar a trabajar'),
        ),
      ],
    );
  }

  Widget _recordatorio(String titulo, String detalle) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Icon(Icons.check_circle_outline, color: Color(0xFF1B7F4B), size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(titulo, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14.5)),
                Text(detalle, style: const TextStyle(fontSize: 13)),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _campo(TextEditingController c, String etiqueta, {String? ayuda, bool oculto = false}) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: TextField(
        controller: c,
        obscureText: oculto,
        decoration: InputDecoration(labelText: etiqueta, helperText: ayuda),
      ),
    );
  }
}

class _Indicador extends StatelessWidget {
  const _Indicador({required this.paso});
  final int paso;

  @override
  Widget build(BuildContext context) {
    final pasos = ['Datos', 'Administrador', 'Listo'];
    final actual = paso >= 2 ? 2 : paso;
    return Row(
      children: [
        for (var i = 0; i < pasos.length; i++) ...[
          Container(
            width: 26,
            height: 26,
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: i <= actual
                  ? Theme.of(context).colorScheme.primary
                  : Theme.of(context).dividerColor,
              shape: BoxShape.circle,
            ),
            child: i < actual
                ? const Icon(Icons.check, size: 15, color: Colors.white)
                : Text('${i + 1}',
                    style: TextStyle(
                      color: i <= actual ? Colors.white : null,
                      fontWeight: FontWeight.w700,
                      fontSize: 12.5,
                    )),
          ),
          const SizedBox(width: 8),
          Text(pasos[i],
              style: TextStyle(
                fontWeight: i == actual ? FontWeight.w700 : FontWeight.w500,
                fontSize: 13.5,
              )),
          if (i < pasos.length - 1)
            Expanded(
              child: Container(
                height: 2,
                margin: const EdgeInsets.symmetric(horizontal: 12),
                color: i < actual ? Theme.of(context).colorScheme.primary : Theme.of(context).dividerColor,
              ),
            ),
        ],
      ],
    );
  }
}

class _Opcion extends StatelessWidget {
  const _Opcion({
    required this.seleccionada,
    required this.icono,
    required this.titulo,
    required this.detalle,
    required this.alPulsar,
  });

  final bool seleccionada;
  final IconData icono;
  final String titulo;
  final String detalle;
  final VoidCallback alPulsar;

  @override
  Widget build(BuildContext context) {
    final color = Theme.of(context).colorScheme.primary;
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: InkWell(
        borderRadius: BorderRadius.circular(12),
        onTap: alPulsar,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            color: seleccionada ? color.withValues(alpha: 0.06) : Theme.of(context).cardColor,
            border: Border.all(color: seleccionada ? color : Theme.of(context).dividerColor, width: seleccionada ? 2 : 1),
          ),
          child: Row(
            children: [
              Icon(icono, color: seleccionada ? color : null, size: 24),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(titulo, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15)),
                    const SizedBox(height: 2),
                    Text(detalle, style: const TextStyle(fontSize: 13, height: 1.4)),
                  ],
                ),
              ),
              if (seleccionada) Icon(Icons.check_circle, color: color),
            ],
          ),
        ),
      ),
    );
  }
}
