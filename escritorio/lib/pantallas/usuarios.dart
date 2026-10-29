import 'package:flutter/material.dart';

import '../servicios/api.dart';
import '../widgets/comunes.dart';

/// Gestión de usuarios: quien puede entrar y con qué permisos.
class UsuariosPantalla extends StatefulWidget {
  const UsuariosPantalla({super.key, required this.api, required this.iniciarSesion});
  final Api api;
  final Future<bool> Function() iniciarSesion;

  @override
  State<UsuariosPantalla> createState() => _UsuariosPantallaState();
}

class _UsuariosPantallaState extends State<UsuariosPantalla> {
  List<dynamic> _usuarios = [];
  bool _cargando = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    if (!widget.api.esAdmin) {
      setState(() => _cargando = false);
      return;
    }
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final lista = await widget.api.usuarios();
      if (mounted) {
        setState(() {
          _usuarios = lista;
          _cargando = false;
        });
      }
    } on ApiError catch (e) {
      if (mounted) {
        setState(() {
          _error = e.mensaje;
          _cargando = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!widget.api.esAdmin) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Cabecera(
            titulo: 'Usuarios',
            descripcion: 'Quién puede entrar al sistema y qué puede hacer cada uno.',
          ),
          Aviso(
            titulo: widget.api.conSesion ? 'Solo el administrador puede gestionar usuarios' : 'Inicie sesión como administrador',
            mensaje: 'Crear cuentas, cambiar contraseñas y desactivar usuarios son tareas de administración.',
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
        Cabecera(
          titulo: 'Usuarios',
          descripcion: 'Cada persona debe tener su propia cuenta: así queda registrado quién procesó cada factura.',
          acciones: [
            FilledButton.icon(
              onPressed: () => _editar(null),
              icon: const Icon(Icons.person_add_alt),
              label: const Text('Nuevo usuario'),
            ),
            const SizedBox(width: 8),
            OutlinedButton.icon(
              onPressed: _cargar,
              icon: const Icon(Icons.refresh, size: 18),
              label: const Text('Actualizar'),
            ),
          ],
        ),
        if (_error != null)
          Aviso(titulo: 'No se pudo cargar la lista', mensaje: _error!, tipo: TipoAviso.error)
        else if (_cargando)
          const Center(child: Padding(padding: EdgeInsets.all(30), child: CircularProgressIndicator()))
        else
          Tarjeta(
            padding: const EdgeInsets.all(8),
            child: Column(
              children: [
                for (final u in _usuarios)
                  Builder(builder: (context) {
                    final m = u as Map<String, dynamic>;
                    final activo = m['active'] == true || m['active'] == 1 || m['activo'] == true;
                    final admin = m['role'] == 'admin';
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: admin
                            ? const Color(0xFF1D6FB8).withValues(alpha: 0.15)
                            : const Color(0xFF6B7280).withValues(alpha: 0.13),
                        child: Icon(admin ? Icons.shield : Icons.person,
                            color: admin ? const Color(0xFF1D6FB8) : const Color(0xFF6B7280)),
                      ),
                      title: Row(
                        children: [
                          Text('${m['name'] ?? m['username'] ?? ''}',
                              style: const TextStyle(fontWeight: FontWeight.w600)),
                          const SizedBox(width: 8),
                          if (admin)
                            const Etiqueta(texto: 'Administrador', color: Color(0xFF1D6FB8)),
                          if (!activo) ...[
                            const SizedBox(width: 8),
                            const Etiqueta(texto: 'Desactivado', color: Color(0xFFB3261E)),
                          ],
                        ],
                      ),
                      subtitle: Text(
                        '${m['username'] ?? ''} · creado ${ '${m['created_at'] ?? m['createdAt'] ?? ''}'.split('T').first }',
                        style: const TextStyle(fontSize: 12.5),
                      ),
                      trailing: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          IconButton(
                            tooltip: activo ? 'Desactivar (no podrá entrar)' : 'Activar',
                            onPressed: () async {
                              try {
                                await widget.api.actualizarUsuario('${m['id']}', {'active': !activo});
                                await _cargar();
                                if (!context.mounted) return;
                                avisar(context, activo ? 'Usuario desactivado.' : 'Usuario activado.');
                              } on ApiError catch (e) {
                                if (!context.mounted) return;
                                avisar(context, e.mensaje, tipo: TipoAviso.error);
                              }
                            },
                            icon: Icon(activo ? Icons.toggle_on : Icons.toggle_off,
                                color: activo ? const Color(0xFF1B7F4B) : null, size: 28),
                          ),
                          IconButton(
                            tooltip: 'Editar',
                            onPressed: () => _editar(m),
                            icon: const Icon(Icons.edit_outlined),
                          ),
                          IconButton(
                            tooltip: 'Eliminar',
                            onPressed: () async {
                              final ok = await confirmar(
                                context,
                                titulo: '¿Eliminar el usuario «${m['username']}»?',
                                mensaje: 'La cuenta desaparece para siempre y la persona ya no podrá entrar. '
                                    'Las facturas que registró se conservan.',
                                textoConfirmar: 'Eliminar',
                                destructivo: true,
                                escribirParaConfirmar: '${m['username']}',
                              );
                              if (!ok) return;
                              try {
                                await widget.api.eliminarUsuario('${m['id']}');
                                await _cargar();
                                if (!context.mounted) return;
                                avisar(context, 'Usuario eliminado.');
                              } on ApiError catch (e) {
                                if (!context.mounted) return;
                                avisar(context, e.mensaje, tipo: TipoAviso.error);
                              }
                            },
                            icon: const Icon(Icons.delete_outline),
                          ),
                        ],
                      ),
                    );
                  }),
              ],
            ),
          ),
        const SizedBox(height: 16),
        Aviso(
          titulo: 'Buena práctica',
          mensaje: 'Cree una cuenta para cada persona. Cuando alguien deja el puesto, desactívela en lugar de borrarla: '
              'así el historial de facturas sigue mostrando quién hizo cada cosa.',
          tipo: TipoAviso.info,
          accion: null,
        ),
      ],
    );
  }

  Future<void> _editar(Map<String, dynamic>? existente) async {
    final nombre = TextEditingController(text: '${existente?['name'] ?? ''}');
    final usuario = TextEditingController(text: '${existente?['username'] ?? ''}');
    final clave = TextEditingController();
    var rol = '${existente?['role'] ?? 'usuario'}';
    final permisos = ((existente?['permisos'] as List?) ?? const []).map((e) => e.toString()).toSet();
    var guardando = false;
    String? error;

    final ok = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) => AlertDialog(
          title: Text(existente == null ? 'Nuevo usuario' : 'Editar usuario'),
          content: SizedBox(
            width: 460,
            child: SingleChildScrollView(child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                TextField(
                  controller: nombre,
                  decoration: const InputDecoration(labelText: 'Nombre y apellidos'),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: usuario,
                  enabled: existente == null,
                  decoration: const InputDecoration(
                    labelText: 'Usuario para entrar',
                    helperText: 'Sin espacios. Por ejemplo: jperez',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: clave,
                  obscureText: true,
                  decoration: InputDecoration(
                    labelText: existente == null ? 'Contraseña' : 'Nueva contraseña (opcional)',
                    helperText: 'Mínimo 8 caracteres. Al cambiarla, sus sesiones abiertas se cierran.',
                  ),
                ),
                const SizedBox(height: 14),
                SegmentedButton<String>(
                  segments: const [
                    ButtonSegment(value: 'usuario', label: Text('Usuario'), icon: Icon(Icons.person, size: 16)),
                    ButtonSegment(value: 'admin', label: Text('Administrador'), icon: Icon(Icons.shield, size: 16)),
                  ],
                  selected: {rol},
                  onSelectionChanged: (v) => setState(() => rol = v.first),
                ),
                const SizedBox(height: 8),
                const Text(
                  'Un administrador puede importar Excel, gestionar usuarios y configurar la base de datos. '
                  'Un usuario normal procesa y consulta facturas.',
                  style: TextStyle(fontSize: 12.5, height: 1.4),
                ),
                if (rol == 'usuario') ...[
                  const SizedBox(height: 8),
                  const Text('Permisos adicionales', style: TextStyle(fontWeight: FontWeight.w700)),
                  for (final p in const {
                    'importar_excel': 'Importar y modificar líneas del Excel',
                    'ver_estadisticas': 'Ver estadísticas globales',
                    'editar_facturas': 'Editar o eliminar facturas desde la web (incluye las de otras personas)',
                  }.entries)
                    CheckboxListTile(
                      dense: true, contentPadding: EdgeInsets.zero, title: Text(p.value),
                      value: permisos.contains(p.key),
                      onChanged: (v) => setState(() { if (v == true) { permisos.add(p.key); } else { permisos.remove(p.key); } }),
                    ),
                ],
                if (error != null) ...[
                  const SizedBox(height: 12),
                  Aviso(titulo: 'No se pudo guardar', mensaje: error!, tipo: TipoAviso.error),
                ],
              ],
            )),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
            FilledButton(
              onPressed: guardando
                  ? null
                  : () async {
                      setState(() {
                        guardando = true;
                        error = null;
                      });
                      try {
                        if (existente == null) {
                          await widget.api.crearUsuario({
                            'username': usuario.text.trim(),
                            'password': clave.text,
                            'name': nombre.text.trim(),
                            'role': rol,
                            'permisos': permisos.toList(),
                          });
                        } else {
                          await widget.api.actualizarUsuario('${existente['id']}', {
                            'name': nombre.text.trim(),
                            'role': rol,
                            'permisos': permisos.toList(),
                            if (clave.text.isNotEmpty) 'password': clave.text,
                          });
                        }
                        if (context.mounted) Navigator.pop(context, true);
                      } on ApiError catch (e) {
                        setState(() {
                          guardando = false;
                          error = e.mensaje;
                        });
                      }
                    },
              child: Text(guardando ? 'Guardando…' : 'Guardar'),
            ),
          ],
        ),
      ),
    );

    nombre.dispose();
    usuario.dispose();
    clave.dispose();
    if (ok == true) {
      await _cargar();
      if (mounted) avisar(context, existente == null ? 'Usuario creado.' : 'Usuario actualizado.');
    }
  }
}
