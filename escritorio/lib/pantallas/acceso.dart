import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../servicios/ajustes.dart';
import '../servicios/api.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';
import 'pantalla_principal.dart';

/// Puerta de entrada: el contenido y el menú no se muestran sin sesión válida.
class AccesoSgf extends StatefulWidget {
  const AccesoSgf({super.key, required this.servidor, required this.api, required this.ajustes, this.alCambiarTema});
  final ControladorServidor servidor;
  final Api api;
  final Ajustes ajustes;
  final VoidCallback? alCambiarTema;
  @override
  State<AccesoSgf> createState() => _AccesoSgfState();
}

class _AccesoSgfState extends State<AccesoSgf> {
  final _usuario = TextEditingController();
  final _clave = TextEditingController();
  bool _entrando = false;
  String? _error;
  @override
  void initState() { super.initState(); widget.servidor.addListener(_actualizar); }
  @override
  void dispose() { widget.servidor.removeListener(_actualizar); _usuario.dispose(); _clave.dispose(); super.dispose(); }
  void _actualizar() { if (mounted) setState(() {}); }
  Future<void> _entrar() async {
    if (_entrando) return;
    setState(() { _entrando = true; _error = null; });
    try {
      await widget.api.iniciarSesion(_usuario.text.trim(), _clave.text);
      _clave.clear();
      if (mounted) setState(() {});
    } on ApiError catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    } finally {
      if (mounted) setState(() => _entrando = false);
    }
  }
  @override
  Widget build(BuildContext context) {
    if (widget.api.conSesion) {
      return PantallaPrincipal(
        servidor: widget.servidor, api: widget.api, ajustes: widget.ajustes,
        alCambiarTema: widget.alCambiarTema,
        alCerrarSesion: (motivo) => setState(() => _error = motivo),
      );
    }
    final tema = Theme.of(context);
    return Scaffold(
      body: Center(child: SingleChildScrollView(padding: const EdgeInsets.all(24), child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 460),
        child: Tarjeta(padding: const EdgeInsets.all(32), child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Icon(Icons.receipt_long, size: 56, color: tema.colorScheme.primary),
            const SizedBox(height: 12),
            Text('Bienvenido a SGF', textAlign: TextAlign.center, style: tema.textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text('Inicie sesión para comenzar. Si necesita una cuenta, solicítela al administrador.', textAlign: TextAlign.center),
            const SizedBox(height: 22),
            if (widget.servidor.enMarcha) FutureBuilder<List<String>>(
              future: widget.servidor.enlacesRed(), builder: (context, snapshot) {
                final enlaces = snapshot.data ?? const <String>[];
                if (enlaces.isEmpty) return const SizedBox.shrink();
                return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Enlace para otras computadoras de la red:', style: TextStyle(fontWeight: FontWeight.w600)),
                  for (final enlace in enlaces) Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                    SelectableText(enlace),
                    IconButton(tooltip: 'Copiar enlace', onPressed: () => Clipboard.setData(ClipboardData(text: enlace)), icon: const Icon(Icons.copy, size: 18)),
                  ]),
                  const Text('HTTP no cifra los datos: use solo una red privada confiable.', style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 14),
                ]);
              },
            ),
            if (!widget.servidor.enMarcha) ...[
              Aviso(titulo: 'El servidor no está disponible', mensaje: widget.servidor.ultimoError ?? 'Inicie el servidor para acceder.', tipo: TipoAviso.error,
                accion: OutlinedButton.icon(onPressed: () async => widget.servidor.arrancar(), icon: const Icon(Icons.refresh), label: const Text('Intentar iniciar'))),
              const SizedBox(height: 16),
            ],
            if (_error != null) ...[Aviso(titulo: 'Inicio de sesión', mensaje: _error!, tipo: TipoAviso.aviso), const SizedBox(height: 16)],
            TextField(controller: _usuario, autofocus: true, textInputAction: TextInputAction.next, decoration: const InputDecoration(labelText: 'Usuario', prefixIcon: Icon(Icons.person_outline))),
            const SizedBox(height: 14),
            TextField(controller: _clave, obscureText: true, onSubmitted: (_) => _entrar(), decoration: const InputDecoration(labelText: 'Contraseña', prefixIcon: Icon(Icons.lock_outline))),
            const SizedBox(height: 20),
            FilledButton.icon(onPressed: _entrando ? null : _entrar, icon: const Icon(Icons.login), label: Text(_entrando ? 'Entrando…' : 'Entrar')),
          ],
        )),
      ))),
    );
  }
}
