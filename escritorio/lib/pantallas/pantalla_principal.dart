import 'dart:async';

import 'package:flutter/material.dart';

import '../servicios/ajustes.dart';
import '../servicios/api.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';
import 'ajustes_pantalla.dart';
import 'facturas.dart';
import 'importar.dart';
import 'estadisticas.dart';
import 'inicio.dart';
import 'servidor.dart';
import 'usuarios.dart';

/// Ventana principal: menú lateral con todas las áreas y una barra superior que
/// siempre dice si el servidor y la base de datos están bien.
class PantallaPrincipal extends StatefulWidget {
  const PantallaPrincipal({super.key, required this.servidor, required this.api, required this.ajustes, this.alCambiarTema});
  final ControladorServidor servidor;
  final Api api;
  final Ajustes ajustes;
  final VoidCallback? alCambiarTema;

  @override
  State<PantallaPrincipal> createState() => _PantallaPrincipalState();
}

class _PantallaPrincipalState extends State<PantallaPrincipal> {
  int _seleccion = 0;

  Api get api => widget.api;
  ControladorServidor get servidor => widget.servidor;

  @override
  void initState() {
    super.initState();
    servidor.addListener(_redibujar);
    servidor.abrirGuia = () => _irA('Ajustes y guía');
    servidor.iniciarSesion = () => unawaited(_pedirLogin());
    // Si el servidor rechaza la sesión (cuenta desactivada, contraseña cambiada
    // por un administrador o caducidad), se avisa y se pide entrar de nuevo.
    api.alCaducarSesion = (motivo) {
      if (!mounted) return;
      setState(() {
        _seleccion = 0;
        // Si estaba en el área de administración, ya no tiene permiso para estar ahí.
      });
      unawaited(_avisarSesionCerrada(motivo));
    };
  }

  /// Explica en lenguaje claro por qué se cerró la sesión y ofrece entrar otra vez.
  Future<void> _avisarSesionCerrada(String motivo) async {
    if (!mounted) return;
    final volver = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        icon: const Icon(Icons.lock_clock, size: 32),
        title: const Text('Su sesión se ha cerrado'),
        content: SizedBox(
          width: 460,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(motivo),
              const SizedBox(height: 12),
              const Text(
                'Esto ocurre por seguridad cuando un administrador desactiva la cuenta, '
                'cambia la contraseña o cuando la sesión lleva demasiado tiempo abierta. '
                'Sus datos están guardados: solo tiene que volver a entrar.',
                style: TextStyle(fontSize: 13.5, height: 1.45),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Seguir sin entrar'),
          ),
          FilledButton.icon(
            onPressed: () => Navigator.of(context).pop(true),
            icon: const Icon(Icons.login),
            label: const Text('Iniciar sesión'),
          ),
        ],
      ),
    );
    if (volver == true) await _pedirLogin();
  }

  @override
  void dispose() {
    api.alCaducarSesion = null;
    servidor.abrirGuia = null;
    servidor.iniciarSesion = null;
    servidor.removeListener(_redibujar);
    super.dispose();
  }

  void _redibujar() {
    if (mounted) setState(() {});
  }

  List<_Area> get _areas => [
        _Area('Inicio', Icons.dashboard_outlined, Icons.dashboard, (c) => InicioPantalla(
              servidor: servidor,
              api: api,
              irA: _irA,
              iniciarSesion: _pedirLogin,
            )),
        _Area('Servidor', Icons.dns_outlined, Icons.dns, (c) => ServidorPantalla(
              servidor: servidor,
              api: api,
              ajustes: widget.ajustes,
              iniciarSesion: _pedirLogin,
            )),
        _Area('Facturas', Icons.receipt_long_outlined, Icons.receipt_long, (c) => FacturasPantalla(
              api: api,
              iniciarSesion: _pedirLogin,
            )),
        _Area('Estadísticas', Icons.insights_outlined, Icons.insights, (c) => EstadisticasPantalla(
              api: api,
              iniciarSesion: _pedirLogin,
            )),
        _Area('Importar Excel', Icons.table_chart_outlined, Icons.table_chart, (c) => ImportarPantalla(
              api: api,
              iniciarSesion: _pedirLogin,
            )),
        _Area('Usuarios', Icons.group_outlined, Icons.group, (c) => UsuariosPantalla(
              api: api,
              iniciarSesion: _pedirLogin,
            ), soloAdmin: true),
        _Area('Ajustes y guía', Icons.settings_outlined, Icons.settings, (c) => AjustesPantalla(
              ajustes: widget.ajustes,
              servidor: servidor,
              api: api,
              alCambiar: () { _redibujar(); widget.alCambiarTema?.call(); },
            )),
      ];

  void _irA(String nombre) {
    final visibles = _areas.where((a) => !a.soloAdmin || api.esAdmin).toList();
    final i = visibles.indexWhere((a) => a.nombre == nombre);
    if (i >= 0) setState(() => _seleccion = i);
  }

  Future<bool> _pedirLogin() async {
    final ok = await mostrarDialogoLogin(context, api);
    if (mounted) setState(() {});
    return ok;
  }

  @override
  Widget build(BuildContext context) {
    final ancho = MediaQuery.sizeOf(context).width;
    final extendido = ancho > 1180;
    final areas = _areas
        .where((a) => !a.soloAdmin || api.esAdmin)
        .toList();
    final indice = _seleccion.clamp(0, areas.length - 1);

    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            _BarraSuperior(
              servidor: servidor,
              api: api,
              onLogin: _pedirLogin,
              onLogout: () async {
                await api.cerrarSesion();
                if (mounted) setState(() => _seleccion = 0);
              },
              onAbrirNavegador: () => abrirEnNavegador(widget.ajustes.urlBaseLocal),
            ),
            const Divider(height: 1),
            Expanded(
              child: Row(
                children: [
                  NavigationRail(
                    extended: extendido,
                    minExtendedWidth: 220,
                    selectedIndex: indice,
                    onDestinationSelected: (i) => setState(() => _seleccion = i),
                    labelType: extendido ? NavigationRailLabelType.none : NavigationRailLabelType.all,
                    leading: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: extendido
                          ? Row(
                              children: [
                                Container(
                                  width: 38,
                                  height: 38,
                                  decoration: BoxDecoration(
                                    color: Theme.of(context).colorScheme.primary,
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: const Icon(Icons.receipt_long, color: Colors.white, size: 22),
                                ),
                                const SizedBox(width: 10),
                                const Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text('SGF', style: TextStyle(color: Colors.white, fontWeight: FontWeight.w800, fontSize: 17)),
                                    Text('Gestión de facturas', style: TextStyle(color: Color(0xFFD4E3F5), fontSize: 11)),
                                  ],
                                ),
                              ],
                            )
                          : const Icon(Icons.receipt_long, size: 26, color: Colors.white),
                    ),
                    destinations: [
                      for (final a in areas)
                        NavigationRailDestination(
                          icon: Icon(a.icono),
                          selectedIcon: Icon(a.iconoActivo),
                          label: Text(a.nombre),
                          padding: const EdgeInsets.symmetric(vertical: 6),
                        ),
                    ],
                  ),
                  const VerticalDivider(width: 1),
                  Expanded(
                    child: Container(
                      color: Theme.of(context).scaffoldBackgroundColor,
                      child: SingleChildScrollView(
                        padding: const EdgeInsets.fromLTRB(24, 22, 24, 32),
                        child: ConstrainedBox(
                          constraints: const BoxConstraints(maxWidth: 1180),
                          child: areas[indice].constructor(context),
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
    );
  }
}

class _Area {
  _Area(this.nombre, this.icono, this.iconoActivo, this.constructor, {this.soloAdmin = false});
  final String nombre;
  final IconData icono;
  final IconData iconoActivo;
  final Widget Function(BuildContext) constructor;
  final bool soloAdmin;
}

class _BarraSuperior extends StatelessWidget {
  const _BarraSuperior({
    required this.servidor,
    required this.api,
    required this.onLogin,
    required this.onLogout,
    required this.onAbrirNavegador,
  });

  final ControladorServidor servidor;
  final Api api;
  final Future<bool> Function() onLogin;
  final Future<void> Function() onLogout;
  final VoidCallback onAbrirNavegador;

  @override
  Widget build(BuildContext context) {
    final (color, texto, icono) = switch (servidor.estado) {
      EstadoServidor.enMarcha => (const Color(0xFF1B7F4B), 'Servidor en marcha', Icons.check_circle),
      EstadoServidor.arrancando => (const Color(0xFF1D6FB8), 'Iniciando…', Icons.sync),
      EstadoServidor.deteniendo => (const Color(0xFFB8730B), 'Deteniendo…', Icons.sync),
      EstadoServidor.fallo => (const Color(0xFFB3261E), 'Servidor detenido', Icons.error),
      EstadoServidor.detenido => (const Color(0xFF6B7280), 'Servidor detenido', Icons.pause_circle),
    };

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      child: Row(
        children: [
          Etiqueta(texto: texto, color: color, icono: icono),
          const SizedBox(width: 10),
          if (servidor.enMarcha)
            Etiqueta(
              texto: 'Puerto ${servidor.ajustes.puerto}',
              color: const Color(0xFF4B5563),
              icono: Icons.lan_outlined,
            ),
          const Spacer(),
          if (servidor.enMarcha)
            TextButton.icon(
              onPressed: onAbrirNavegador,
              icon: const Icon(Icons.open_in_browser, size: 18),
              label: const Text('Ver la versión web'),
            ),
          const SizedBox(width: 8),
          if (api.conSesion)
            PopupMenuButton<String>(
              tooltip: 'Sesión iniciada',
              onSelected: (v) {
                if (v == 'salir') onLogout();
              },
              itemBuilder: (context) => [
                PopupMenuItem(
                  enabled: false,
                  child: Text('${api.usuario} · ${api.esAdmin ? 'Administrador' : 'Usuario'}'),
                ),
                const PopupMenuDivider(),
                const PopupMenuItem(value: 'salir', child: Text('Cerrar sesión')),
              ],
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 16,
                    backgroundColor: Theme.of(context).colorScheme.primary.withValues(alpha: 0.15),
                    child: Icon(Icons.person, size: 18, color: Theme.of(context).colorScheme.primary),
                  ),
                  const SizedBox(width: 8),
                  Text('${api.usuario}', style: const TextStyle(fontWeight: FontWeight.w600)),
                  const Icon(Icons.arrow_drop_down),
                ],
              ),
            )
          else
            FilledButton.icon(
              onPressed: () => onLogin(),
              icon: const Icon(Icons.login, size: 18),
              label: const Text('Iniciar sesión'),
            ),
        ],
      ),
    );
  }
}

/// Diálogo de inicio de sesión, con explicación y ayuda sobre las cuentas.
Future<bool> mostrarDialogoLogin(BuildContext context, Api api) async {
  final usuario = TextEditingController();
  final clave = TextEditingController();
  String? error;
  var cargando = false;

  final ok = await showDialog<bool>(
    context: context,
    barrierDismissible: false,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) => AlertDialog(
        title: const Row(
          children: [
            Icon(Icons.lock_outline),
            SizedBox(width: 10),
            Text('Iniciar sesión'),
          ],
        ),
        content: SizedBox(
          width: 430,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                'Entre con su usuario del sistema de facturas. '
                'La primera vez, el administrador es «admin» con la contraseña que se indicó al instalar.',
                style: TextStyle(fontSize: 14, height: 1.4),
              ),
              const SizedBox(height: 18),
              TextField(
                controller: usuario,
                autofocus: true,
                textInputAction: TextInputAction.next,
                decoration: const InputDecoration(labelText: 'Usuario', prefixIcon: Icon(Icons.person_outline)),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: clave,
                obscureText: true,
                onSubmitted: (_) async {},
                decoration: const InputDecoration(labelText: 'Contraseña', prefixIcon: Icon(Icons.key_outlined)),
              ),
              if (error != null) ...[
                const SizedBox(height: 14),
                Aviso(titulo: 'No se pudo entrar', mensaje: error!, tipo: TipoAviso.error),
              ],
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
          FilledButton.icon(
            onPressed: cargando
                ? null
                : () async {
                    setState(() {
                      cargando = true;
                      error = null;
                    });
                    try {
                      await api.iniciarSesion(usuario.text.trim(), clave.text);
                      if (context.mounted) Navigator.pop(context, true);
                    } on ApiError catch (e) {
                      setState(() {
                        cargando = false;
                        error = e.esSinConexion
                            ? 'El servidor no responde. Vaya a «Servidor» y pulse Iniciar.'
                            : e.mensaje;
                      });
                    }
                  },
            icon: cargando
                ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.login, size: 18),
            label: Text(cargando ? 'Entrando…' : 'Entrar'),
          ),
        ],
      ),
    ),
  );
  usuario.dispose();
  clave.dispose();
  return ok ?? false;
}
