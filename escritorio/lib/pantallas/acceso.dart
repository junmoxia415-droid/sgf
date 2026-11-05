import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../servicios/ajustes.dart';
import '../servicios/api.dart';
import '../servicios/controlador_servidor.dart';
import '../widgets/comunes.dart';
import 'pantalla_principal.dart';

/// Puerta de entrada: el contenido y el menú no se muestran sin sesión válida.
class AccesoSgf extends StatefulWidget {
  const AccesoSgf({super.key, required this.servidor, required this.api, required this.ajustes, this.alCambiarTema, this.alComprobarInstalacion});
  final ControladorServidor servidor;
  final Api api;
  final Ajustes ajustes;
  final VoidCallback? alCambiarTema;
  final VoidCallback? alComprobarInstalacion;
  @override
  State<AccesoSgf> createState() => _AccesoSgfState();
}

class _AccesoSgfState extends State<AccesoSgf> {
  final _usuario = TextEditingController();
  final _clave = TextEditingController();
  bool _entrando = false;
  String? _error;
  Future<List<String>>? _enlaces;
  bool? _ultimaMarcha;
  Timer? _revisarNombre;
  int _intentosNombre = 0;
  Future<List<String>> _enlacesActuales() {
    if (_enlaces == null || _ultimaMarcha != widget.servidor.enMarcha) {
      if (_ultimaMarcha != widget.servidor.enMarcha) _intentosNombre = 0;
      _ultimaMarcha = widget.servidor.enMarcha;
      _enlaces = widget.servidor.enlacesRed().then((enlaces) {
        final esperandoAlias = enlaces.any((e) => RegExp(r'^https://sgf-[a-f0-9]{12}\.local(?::\d+)?$').hasMatch(e));
        final tieneAlias = enlaces.any((e) => Uri.tryParse(e)?.host == 'sgf-minint.local');
        if (tieneAlias) _intentosNombre = 0;
        if (mounted && widget.servidor.enMarcha && (tieneAlias || (esperandoAlias && _intentosNombre < 6)) && _revisarNombre == null) {
          if (!tieneAlias) _intentosNombre++;
          _revisarNombre = Timer(Duration(seconds: tieneAlias ? 10 : 4), () {
            _revisarNombre = null;
            if (mounted && widget.servidor.enMarcha) setState(() => _enlaces = null);
          });
        }
        return enlaces;
      });
    }
    return _enlaces!;
  }
  @override
  void initState() { super.initState(); widget.servidor.addListener(_actualizar); }
  @override
  void dispose() { _revisarNombre?.cancel(); widget.servidor.removeListener(_actualizar); _usuario.dispose(); _clave.dispose(); super.dispose(); }
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
    if (!widget.servidor.enMarcha) { _enlaces = null; _ultimaMarcha = false; }
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
            Align(alignment: Alignment.centerRight, child: IconButton(
              tooltip: widget.ajustes.temaOscuro ? 'Activar tema claro' : 'Activar tema oscuro',
              onPressed: () async {
                widget.ajustes.temaOscuro = !widget.ajustes.temaOscuro;
                await widget.ajustes.guardar();
                if (mounted) { widget.alCambiarTema?.call(); setState(() {}); }
              },
              icon: Icon(widget.ajustes.temaOscuro ? Icons.light_mode_outlined : Icons.dark_mode_outlined),
            )),
            Icon(Icons.receipt_long, size: 56, color: tema.colorScheme.primary),
            const SizedBox(height: 12),
            Text('Bienvenido a SGF', textAlign: TextAlign.center, style: tema.textTheme.headlineSmall),
            const SizedBox(height: 8),
            const Text('Inicie sesión para comenzar. Si necesita una cuenta, solicítela al administrador.', textAlign: TextAlign.center),
            const SizedBox(height: 22),
            if (widget.servidor.enMarcha) FutureBuilder<List<String>>(
              future: _enlacesActuales(), builder: (context, snapshot) {
                final enlaces = snapshot.data ?? const <String>[];
                if (snapshot.connectionState != ConnectionState.done || snapshot.hasError || enlaces.isEmpty) return const SizedBox.shrink();
                return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  const Text('Enlace para otras computadoras de la red:', style: TextStyle(fontWeight: FontWeight.w600)),
                  for (final enlace in enlaces) Wrap(crossAxisAlignment: WrapCrossAlignment.center, children: [
                    SelectableText(enlace),
                    IconButton(tooltip: 'Copiar enlace', onPressed: () => Clipboard.setData(ClipboardData(text: enlace)), icon: const Icon(Icons.copy, size: 18)),
                  ]),
                  if (enlaces.any((e) => e.startsWith('http://')))
                    const Text('HTTP no cifra los datos: use solo una red privada confiable.', style: TextStyle(fontSize: 12))
                  else
                    const Text('HTTPS requiere confianza en el certificado y que el nombre coincida. Una advertencia indica que no se ha podido verificar la identidad.', style: TextStyle(fontSize: 12)),
                  const SizedBox(height: 14),
                ]);
              },
            ),
            if (!widget.servidor.enMarcha) ...[
              Aviso(titulo: 'El servidor no está disponible', mensaje: widget.servidor.ultimoError ?? 'Inicie el servidor para acceder.', tipo: TipoAviso.error,
                accion: OutlinedButton.icon(onPressed: () async {
                  final ok = await widget.servidor.arrancar();
                  if (ok && mounted) widget.alComprobarInstalacion?.call();
                }, icon: const Icon(Icons.refresh), label: const Text('Intentar iniciar'))),
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
