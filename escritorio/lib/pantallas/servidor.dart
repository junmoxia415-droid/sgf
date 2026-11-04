import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:file_picker/file_picker.dart';

import '../servicios/api.dart';
import '../servicios/ajustes.dart';
import '../servicios/inicio_windows.dart';
import '../servicios/controlador_servidor.dart';
import '../servicios/red_segura.dart';
import '../servicios/seleccion_puerto.dart';
import '../widgets/comunes.dart';
import 'configurar_base.dart';

/// Control del servidor: iniciar / detener / reiniciar, copias de seguridad y
/// registro de lo que va pasando, con explicación de cada botón.
class ServidorPantalla extends StatefulWidget {
  const ServidorPantalla({
    super.key,
    required this.servidor,
    required this.api,
    required this.ajustes,
    required this.iniciarSesion,
    this.alCambiarBase,
    this.inicioWindows,
  });

  final ControladorServidor servidor;
  final Api api;
  final dynamic ajustes;
  final Future<bool> Function() iniciarSesion;
  final VoidCallback? alCambiarBase;
  final InicioWindows? inicioWindows;

  @override
  State<ServidorPantalla> createState() => _ServidorPantallaState();
}

class _ServidorPantallaState extends State<ServidorPantalla> {
  Map<String, dynamic>? _estado;
  bool _trabajando = false;
  late final InicioWindows _inicioWindows;
  bool? _inicioSesionWindows;
  bool _actualizandoInicio = false;
  bool? _inicioServicio;
  bool _actualizandoServicio = false;
  List<String>? _redesExtra;
  String? _errorRedesExtra;
  List<String> _enlaces = const [];
  Set<String> _ipsLocales = const {};
  String? _errorRed;
  bool _consultandoRed = false;
  EstadoRedSegura? _redSegura;
  String? _errorRedSegura;
  bool _cambiandoRedSegura = false;
  Timer? _actualizarEstado;
  late bool _ultimaMarcha;

  @override
  void initState() {
    super.initState();
    _inicioWindows = widget.inicioWindows ?? InicioWindows();
    _ultimaMarcha = widget.servidor.enMarcha;
    widget.servidor.addListener(_redibujar);
    _cargar();
    _consultarRed();
    _consultarRedSegura();
    _consultarInicio();
    _consultarServicio();
    _consultarRedesExtra();
    _actualizarEstado = Timer.periodic(const Duration(seconds: 5), (_) { if (widget.servidor.enMarcha) _cargar(); });
  }

  @override
  void dispose() {
    _actualizarEstado?.cancel();
    widget.servidor.removeListener(_redibujar);
    super.dispose();
  }

  void _redibujar() {
    if (!mounted) return;
    final enMarcha = widget.servidor.enMarcha;
    final cambio = enMarcha != _ultimaMarcha;
    _ultimaMarcha = enMarcha;
    setState(() {});
    if (cambio && enMarcha) {
      // Si se inicia desde esta misma pantalla, no exigir que el usuario
      // actualice manualmente los enlaces o la identidad.
      unawaited(_cargar());
      unawaited(_consultarRed());
      unawaited(_consultarRedSegura());
    }
  }

  Future<void> _consultarRed() async {
    if (mounted) setState(() { _consultandoRed = true; _errorRed = null; });
    try {
      final enlaces = await widget.servidor.enlacesRed();
      if (mounted) setState(() { _enlaces = enlaces; _consultandoRed = false; });
      final interfaces = await NetworkInterface.list(type: InternetAddressType.IPv4, includeLoopback: false);
      final ips = interfaces.expand((i) => i.addresses).map((a) => a.address).toSet();
      if (mounted) setState(() => _ipsLocales = ips);
    } catch (_) {
      if (mounted) setState(() { _enlaces = []; _errorRed = 'No se pudieron consultar las direcciones de red.'; });
    } finally {
      if (mounted) setState(() => _consultandoRed = false);
    }
  }

  Future<void> _consultarRedSegura() async {
    try {
      final estado = await widget.servidor.redSegura.consultar();
      if (mounted) setState(() { _redSegura = estado; _errorRedSegura = null; });
    } catch (e) {
      if (mounted) setState(() { _redSegura = null; _errorRedSegura = e.toString(); });
    }
  }

  Future<void> _activarRedSegura() async {
    final puerto = TextEditingController(text: '8443');
    final dns = TextEditingController();
    final ip = TextEditingController();
    var automatico = true;
    final opcion = await showDialog<({int? puerto, String? dns, String? ip})>(context: context, builder: (context) => StatefulBuilder(builder: (context, cambiar) => AlertDialog(
      title: const Text('Activar HTTPS para la red'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Automático prueba primero 443 y después 8443 y 9443, sin detener otros programas. También puede elegir un puerto manual. El firewall debe permitir el puerto elegido.'),
        SwitchListTile(contentPadding: EdgeInsets.zero, title: const Text('Elegir puerto automáticamente'), value: automatico, onChanged: (v) => cambiar(() => automatico = v)),
        if (!automatico) TextField(controller: puerto, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Puerto HTTPS manual')),
        const SizedBox(height: 12),
        const Text('En una red con DNS de empresa puede indicar el nombre completo de este equipo. Debe resolver a una dirección de esta PC. Si lo deja vacío se usará el nombre local de SGF, que depende de mDNS.'),
        TextField(controller: dns, decoration: const InputDecoration(labelText: 'Nombre DNS completo (opcional)', hintText: 'sgf.empresa.ejemplo')),
        const SizedBox(height: 12),
        const Text('SGF detecta las IP de esta computadora al crear la identidad. Puede indicar una IP para elegir la preferida; debe pertenecer a este equipo.'),
        TextField(controller: ip, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'IP de esta PC (opcional)', hintText: 'Ejemplo: 192.168.1.20')),
        const SizedBox(height: 12),
        const Text('SGF se detendrá brevemente. En la otra PC habrá que verificar e instalar el certificado público. No se cambiarán el firewall ni los certificados de confianza.'),
      ])),
      actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: () {
          final p=automatico ? null : int.tryParse(puerto.text.trim());
          if (!automatico && (p==null || (p!=443 && (p<1024 || p>65535)))) { avisar(context, 'Use 443 o un puerto entre 1024 y 65535.', tipo: TipoAviso.error); return; }
          final n=dns.text.trim().toLowerCase();
          final direccion=ip.text.trim();
          Navigator.pop(context, (puerto:p, dns:n.isEmpty ? null : n, ip:direccion.isEmpty ? null : direccion));
        }, child: const Text('Activar HTTPS'))],
    )));
    puerto.dispose(); dns.dispose(); ip.dispose();
    if (opcion == null || !mounted) return;
    setState(() => _cambiandoRedSegura = true);
    try {
      final seleccionado = opcion.puerto ?? await seleccionarPuertoLibre();
      final estado = await widget.servidor.activarHttpsRed(puerto: seleccionado, dns: opcion.dns, ip: opcion.ip);
      if (mounted) setState(() { _redSegura = estado; _errorRedSegura = null; });
      await _consultarRed(); await _cargar();
      if (mounted) avisar(context, 'HTTPS preparado en el puerto $seleccionado. Exporte el certificado público y configúrelo en la otra PC.');
    } catch (e) {
      await _consultarRedSegura(); await _consultarRed();
      if (mounted) avisar(context, 'No se pudo completar la activación: $e', tipo: TipoAviso.error);
    } finally { if (mounted) setState(() => _cambiandoRedSegura = false); }
  }

  Future<void> _exportarCertificado() async {
    final ruta = _redSegura?.certificadoPublico;
    if (ruta == null) return;
    try {
      final salida = await FilePicker.platform.saveFile(dialogTitle: 'Guardar certificado público de SGF',
        fileName: 'SGF-certificado-publico.crt', type: FileType.custom, allowedExtensions: ['crt']);
      if (salida == null) return;
      // Se exporta exclusivamente la autoridad pública. No sustituir archivos
      // existentes, en particular la clave privada o la base por equivocación.
      final bytes = await File(ruta).readAsBytes();
      final destino = File(salida);
      await destino.create(exclusive: true);
      await destino.writeAsBytes(bytes, flush: true);
      if (mounted) avisar(context, 'Certificado público guardado. Verifique la huella antes de confiar en él.');
    } catch (e) {
      if (mounted) avisar(context, 'No se pudo guardar el certificado público: $e', tipo: TipoAviso.error);
    }
  }

  Future<void> _consultarRedesExtra() async {
    try {
      final redes=await widget.servidor.redesAutorizadas.leer();
      if (mounted) setState(() { _redesExtra=redes; _errorRedesExtra=null; });
    } catch (_) { if (mounted) setState(() { _redesExtra=null; _errorRedesExtra='No se pudo leer la configuración de redes adicionales.'; }); }
  }

  Future<void> _editarRedesExtra() async {
    final texto=TextEditingController(text: (_redesExtra ?? []).join('\n'));
    final resultado=await showDialog<String>(context: context, builder: (context)=>AlertDialog(
      title: const Text('Redes adicionales autorizadas'),
      content: SingleChildScrollView(child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
        const Text('Escriba una red IPv4 por línea. Use /32 para una sola PC o /24 a /31 para una red. Ejemplos: 203.0.113.5/32 y 203.0.113.0/24. Solicite el rango al responsable de su red.'),
        TextField(controller:texto, maxLines:4, decoration:const InputDecoration(labelText:'Redes adicionales')),
        const SizedBox(height:12),
        const Text('Las redes adicionales solo se aceptan mediante HTTPS. Verifique el alcance con el administrador y limite también el firewall; una dirección pública puede ser accesible desde Internet.'),
      ])),
      actions:[TextButton(onPressed:()=>Navigator.pop(context),child:const Text('Cancelar')),
        FilledButton(onPressed:()=>Navigator.pop(context,texto.text),child:const Text('Continuar'))],
    ));
    texto.dispose();
    if(resultado==null || !mounted) return;
    final redes=resultado.split(RegExp(r'[\n,]')).map((s)=>s.trim()).where((s)=>s.isNotEmpty).toList();
    final ok=await confirmar(context, titulo:'¿Autorizar estas redes?', mensaje: redes.isEmpty
      ? 'Se quitarán todas las redes adicionales. Las redes privadas habituales seguirán funcionando.'
      : 'Se aceptarán conexiones HTTPS desde: ${redes.join(', ')}. Autorice únicamente direcciones de su organización y restrinja el firewall. El cambio se aplicará al reiniciar el servidor.', textoConfirmar:'Guardar');
    if(!ok || !mounted) return;
    try {
      final guardadas=await widget.servidor.redesAutorizadas.guardar(redes);
      if(mounted) setState(() { _redesExtra=guardadas; _errorRedesExtra=null; });
      if(mounted) avisar(context,'Redes guardadas. Reinicie el servidor para aplicar el cambio.');
    } catch(e) { if(mounted) avisar(context,'No se pudo guardar: $e',tipo:TipoAviso.error); }
  }

  Future<void> _consultarServicio() async {
    if (!Platform.isWindows) return;
    try {
      final activo = await widget.servidor.servicioExistente.configurado();
      if (mounted) setState(() => _inicioServicio = activo);
    } catch (_) {
      if (mounted) setState(() => _inicioServicio = null);
    }
  }

  Future<void> _cambiarServicio(bool activar) async {
    final ok = await confirmar(context,
      titulo: activar ? '¿Iniciar SGF antes de iniciar sesión?' : '¿Desactivar el inicio del servicio?',
      mensaje: activar
        ? 'Windows pedirá permiso de administrador. Se instalará un servicio con cuenta virtual restringida y archivos protegidos; se concederá a esa cuenta acceso a los datos y al certificado privado de SGF. El servidor continuará funcionando al cerrar esta ventana. No se cambian el cortafuegos ni los certificados de confianza.'
        : 'Windows pedirá permiso de administrador. Se detendrá el servicio y no se iniciará automáticamente; se conservarán los datos y el certificado. Después puede iniciar SGF desde esta ventana.',
      textoConfirmar: activar ? 'Activar servicio' : 'Desactivar servicio');
    if (!ok || !mounted) return;
    setState(() { _actualizandoServicio = true; _trabajando = true; });
    try {
      if (activar) { await widget.servidor.activarServicioWindows(); }
      else { await widget.servidor.desactivarServicioWindows(); }
      await _consultarServicio(); await _cargar();
      if (mounted) avisar(context, activar ? 'Servicio instalado y autenticado. Está configurado para iniciarse al encender el equipo.' : 'Inicio automático del servicio desactivado.');
    } catch (e) {
      await _consultarServicio();
      if (mounted) avisar(context, 'No se pudo cambiar el servicio: $e', tipo: TipoAviso.error);
    } finally {
      if (mounted) setState(() { _actualizandoServicio = false; _trabajando = false; });
    }
  }

  Future<void> _consultarInicio() async {
    if (!_inicioWindows.disponible) return;
    try {
      final activo = await _inicioWindows.activo();
      if (mounted) setState(() => _inicioSesionWindows = activo);
    } catch (_) {
      if (mounted) setState(() => _inicioSesionWindows = null);
    }
  }

  Future<void> _cambiarInicio(bool activar) async {
    setState(() => _actualizandoInicio = true);
    try {
      await _inicioWindows.establecer(activar);
      await _consultarInicio();
      if (mounted) avisar(context, activar ? 'SGF se abrirá al iniciar sesión en Windows.' : 'Inicio automático de SGF desactivado.');
    } catch (e) {
      await _consultarInicio();
      if (mounted) avisar(context, 'No se pudo cambiar el inicio: $e', tipo: TipoAviso.error);
    } finally {
      if (mounted) setState(() => _actualizandoInicio = false);
    }
  }

  Future<void> _cargar() async {
    if (!widget.servidor.enMarcha) return;
    try {
      final datos = await widget.api.panelEstado();
      if (mounted) setState(() => _estado = datos);
    } on ApiError {
      if (mounted) setState(() => _estado = null);
    }
  }

  Future<void> _accion(Future<void> Function() tarea) async {
    setState(() => _trabajando = true);
    try {
      await tarea();
    } finally {
      if (mounted) setState(() => _trabajando = false);
      await _cargar();
    }
  }

  @override
  Widget build(BuildContext context) {
    final servidor = widget.servidor;
    final enMarcha = servidor.enMarcha;
    final contadores = (_estado?['contadores'] ?? <String, dynamic>{}) as Map<String, dynamic>;
    final disco = (_estado?['disco'] ?? <String, dynamic>{}) as Map<String, dynamic>;
    final accesoRed = (_estado?['accesoRed'] as Map?) ?? {};
    final segura = _redSegura?.activa == true;
    final codigo = _estado?['codigoEnlace']?.toString() ?? '';
    String? privado(String? url) {
      if (url == null) return null;
      if (!url.startsWith('https://')) return url;
      if (!RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(codigo)) return null;
      return Uri.parse(url).replace(fragment: 'sgf=$codigo').toString();
    }
    final enlaceEstable = accesoRed['estado'] == 'activo' ? privado(accesoRed['enlace']?.toString()) : null;
    final nombreEquipo = Platform.localHostname;
    final nombreUtilizable = RegExp(r'^[A-Za-z0-9][A-Za-z0-9-]{0,62}$').hasMatch(nombreEquipo)
        && nombreEquipo.toLowerCase() != 'localhost';
    final enlaceNombre = 'http://$nombreEquipo:${widget.ajustes.puerto}';
    final enlaceDns = segura && _redSegura?.dns != null ? privado('https://${_redSegura!.dns}${widget.ajustes.puerto == 443 ? '' : ':${widget.ajustes.puerto}'}') : null;
    final ipsCertificadas = _redSegura?.ipsCertificadas ?? const <String>{};
    final enlacesIp = segura ? ipsCertificadas.where(_ipsLocales.contains).map((ip) => privado('https://$ip${widget.ajustes.puerto == 443 ? '' : ':${widget.ajustes.puerto}'}')).whereType<String>().toList() : <String>[];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Cabecera(
          titulo: 'Servidor',
          descripcion: 'Encienda y apague el motor, comparta el enlace con su red y configure el inicio de SGF.',
        ),
        EnColumnas(
          izquierda: Column(
                children: [
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            _CirculoEstado(estado: servidor.estado),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(_tituloEstado(servidor.estado),
                                      style: Theme.of(context).textTheme.titleLarge),
                                  Text(
                                    enMarcha
                                        ? 'Puerto: ${widget.ajustes.puerto} · acceso desde redes privadas autorizadas'
                                        : 'La aplicación y los datos están seguros; solo el motor está parado.',
                                    style: TextStyle(
                                        fontSize: 13, color: Theme.of(context).colorScheme.onSurfaceVariant),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        if (servidor.estado == EstadoServidor.fallo && servidor.ultimoError != null) ...[
                          const SizedBox(height: 16),
                          Aviso(
                            titulo: 'El servidor se detuvo',
                            mensaje: servidor.ultimoError!,
                            tipo: TipoAviso.error,
                          ),
                        ],
                        const SizedBox(height: 18),
                        Wrap(
                          spacing: 10,
                          runSpacing: 10,
                          children: [
                            FilledButton.icon(
                              onPressed: _trabajando || enMarcha || servidor.estado == EstadoServidor.arrancando || servidor.estado == EstadoServidor.deteniendo
                                  ? null
                                  : () => _accion(() async {
                                        final ok = await servidor.arrancar(permitirIniciarServicio: true);
                                        if (!mounted) return;
                                        avisar(context, ok ? 'Servidor iniciado correctamente.' : 'No se pudo iniciar el servidor.',
                                            tipo: ok ? TipoAviso.exito : TipoAviso.error);
                                      }),
                              icon: const Icon(Icons.play_arrow),
                              label: const Text('Iniciar'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _trabajando || !enMarcha
                                  ? null
                                  : () async {
                                      final seguro = await confirmar(
                                        context,
                                        titulo: '¿Detener el servidor?',
                                        mensaje: 'Nadie podrá consultar ni procesar facturas hasta que lo vuelva a iniciar. '
                                            'Los datos ya guardados no se pierden.',
                                        textoConfirmar: 'Sí, detener',
                                        destructivo: true,
                                      );
                                      if (!seguro) return;
                                      await _accion(() => servidor.detener());
                                    },
                              icon: const Icon(Icons.stop),
                              label: const Text('Detener'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _trabajando || !enMarcha
                                  ? null
                                  : () => _accion(() async {
                                        await servidor.reiniciar();
                                        if (!mounted) return;
                                        avisar(context, 'Servidor reiniciado.');
                                      }),
                              icon: const Icon(Icons.restart_alt),
                              label: const Text('Reiniciar'),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Conexión cifrada para la red', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      if (_errorRedSegura != null) ...[
                        Aviso(titulo: 'No se pudo comprobar HTTPS', mensaje: _errorRedSegura!, tipo: TipoAviso.error),
                        TextButton(onPressed: _consultarRedSegura, child: const Text('Volver a comprobar')),
                      ] else if (segura) ...[
                        const Text('Identidad HTTPS preparada. La otra PC debe confiar en el certificado público y usar uno de los nombres incluidos en él.'),
                        const SizedBox(height: 8),
                        const Text('Huella SHA-256 del certificado público (compárela por otro medio):', style: TextStyle(fontWeight: FontWeight.w600)),
                        SelectableText(_redSegura!.huella!, style: const TextStyle(fontFamily: 'monospace')),
                        Text('Caducidad del certificado del servidor: ${_redSegura!.caduca}'),
                        const SizedBox(height: 8),
                        OutlinedButton.icon(onPressed: _exportarCertificado, icon: const Icon(Icons.save_alt), label: const Text('Guardar certificado público')),
                        const SizedBox(height: 8),
                        const Text('En la otra PC: 1) copie solo el archivo público; 2) abra sus detalles y compruebe la huella SHA-256 por otro medio; 3) impórtelo como autoridad de confianza solo si coincide. En Firefox: Ajustes → Privacidad y seguridad → Certificados → Ver certificados → Autoridades → Importar; marque la confianza para identificar sitios web. Para Chrome o Edge en Windows: abra certmgr.msc → Entidades de certificación raíz de confianza → Certificados → Todas las tareas → Importar. Nunca comparta la clave privada. La autoridad confiable concede confianza amplia; instálela solo en equipos de confianza.', style: TextStyle(fontSize: 12.5, height: 1.4)),
                      ] else if (_redSegura == null)
                        const Text('Comprobando la identidad de red…')
                      else ...[
                        const Text('Actualmente HTTP no cifra los datos de la red. Puede activar HTTPS con un certificado propio; se le pedirá confirmación.'),
                        const SizedBox(height: 8),
                        FilledButton.icon(onPressed: _cambiandoRedSegura ? null : _activarRedSegura, icon: const Icon(Icons.lock_outline), label: Text(_cambiandoRedSegura ? 'Preparando HTTPS…' : 'Activar HTTPS')),
                      ],
                    ]),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Enlace para otras computadoras', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      const Text('En la otra PC, abra el navegador y pegue el enlace completo. El servidor debe estar en marcha y las computadoras deben poder comunicarse. El enlace es privado: compártalo solo con personas autorizadas.', style: TextStyle(fontSize: 13.5)),
                      if (!enMarcha) const Padding(padding: EdgeInsets.only(top: 8), child: Text('El servidor está detenido: el enlace no funcionará hasta iniciarlo.', style: TextStyle(color: Color(0xFFB8730B)))),
                      const SizedBox(height: 10),
                      if (segura && enMarcha && !RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(codigo))
                        Text(_estado == null
                          ? 'Preparando el enlace privado…'
                          : 'Este servidor no ha proporcionado un enlace privado. Revise que el servicio de Windows esté actualizado; no se cambiará automáticamente.'),
                      if (enlaceDns != null) ...[
                        const Text('Nombre DNS de la organización', style: TextStyle(fontWeight: FontWeight.w700)),
                        Row(children: [Expanded(child: SelectableText(enlaceDns, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                          OutlinedButton.icon(onPressed: () async { await Clipboard.setData(ClipboardData(text: enlaceDns)); if (context.mounted) avisar(context, 'Enlace HTTPS copiado.'); }, icon: const Icon(Icons.copy, size: 18), label: const Text('Copiar DNS'))]),
                        const Text('La otra PC debe resolver este nombre y confiar en el certificado público de SGF.', style: TextStyle(fontSize: 12.5)),
                        const SizedBox(height: 12),
                      ],
                      if (enlacesIp.isNotEmpty) ...[
                        const Text('Enlaces por IP de esta computadora', style: TextStyle(fontWeight: FontWeight.w700)),
                        for (final enlaceIp in enlacesIp) Row(children: [Expanded(child: SelectableText(enlaceIp, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                          OutlinedButton.icon(onPressed: () async { await Clipboard.setData(ClipboardData(text: enlaceIp)); if (context.mounted) avisar(context, 'Enlace por IP copiado.'); }, icon: const Icon(Icons.copy, size: 18), label: const Text('Copiar IP'))]),
                        const Text('Si hay varios enlaces, elija el que corresponda a la red de la otra PC. Cada IP solo es válida mientras permanezca en el certificado y en este equipo.', style: TextStyle(fontSize: 12.5)),
                        const SizedBox(height: 12),
                      ] else if (segura && ipsCertificadas.isNotEmpty && !_consultandoRed && codigo.isNotEmpty) ...[
                        const Text('Ninguna IP incluida en el certificado está activa en esta PC. No se reemplazará la identidad automáticamente.', style: TextStyle(color: Color(0xFFB8730B))),
                      ] else if (segura && ipsCertificadas.isEmpty) ...[
                        const Text('Este certificado anterior no incluye una IP. Use el nombre incluido o consulte al administrador.', style: TextStyle(fontSize: 12.5)),
                      ],
                      if (enMarcha && enlaceEstable != null) ...[
                        const Text('Nombre local automático', style: TextStyle(fontWeight: FontWeight.w700)),
                        Row(children: [
                          Expanded(child: SelectableText(enlaceEstable, style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15))),
                          OutlinedButton.icon(onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: enlaceEstable));
                            if (context.mounted) avisar(context, 'Nombre local copiado.');
                          }, icon: const Icon(Icons.copy, size: 18), label: const Text('Copiar nombre local')),
                        ]),
                        Text(segura
                          ? 'El nombre puede seguir funcionando si cambia la IP y la otra PC admite mDNS. Verifique la huella e instale el certificado público antes de iniciar sesión.'
                          : 'Este nombre puede seguir funcionando si cambia la IP, siempre que la otra PC admita mDNS. HTTP no cifra ni verifica la conexión.', style: const TextStyle(fontSize: 12.5, height: 1.4)),
                        const SizedBox(height: 12),
                      ] else if (enMarcha && accesoRed.isNotEmpty) ...[
                        Text('${accesoRed['mensaje'] ?? (segura ? 'Nombre local no disponible; revise mDNS. La dirección IP no coincide con el certificado.' : 'Nombre local no disponible; utilice el enlace por IP.')}', style: const TextStyle(fontSize: 12.5, color: Color(0xFFB8730B))),
                        const SizedBox(height: 8),
                      ],
                      if (segura) const Text('Para HTTPS use solo los enlaces indicados, incluidos en el certificado.', style: TextStyle(fontSize: 12.5))
                      else if (_consultandoRed) const Text('Buscando direcciones de red…')
                      else if (_errorRed != null) Text(_errorRed!)
                      else if (_enlaces.isEmpty) const Text('No se detectó una dirección de red privada. Conecte este equipo a la red y actualice.')
                      else for (final enlace in _enlaces)
                        Padding(padding: const EdgeInsets.only(bottom: 8), child: Row(children: [
                          Expanded(child: SelectableText(enlace, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700))),
                          OutlinedButton.icon(onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: enlace));
                            if (context.mounted) avisar(context, 'Enlace copiado. Péguelo en el navegador de la otra computadora.');
                          }, icon: const Icon(Icons.copy, size: 18), label: const Text('Copiar')),
                        ])),
                      TextButton.icon(onPressed: _consultandoRed ? null : _consultarRed, icon: const Icon(Icons.refresh, size: 18), label: const Text('Actualizar enlaces')),
                      if (!segura && nombreUtilizable && _enlaces.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        const Text('Enlace opcional por nombre del equipo', style: TextStyle(fontWeight: FontWeight.w600)),
                        Row(children: [
                          Expanded(child: SelectableText(enlaceNombre)),
                          OutlinedButton.icon(onPressed: () async {
                            await Clipboard.setData(ClipboardData(text: enlaceNombre));
                            if (context.mounted) avisar(context, 'Enlace por nombre copiado.');
                          }, icon: const Icon(Icons.copy, size: 18), label: const Text('Copiar nombre')),
                        ]),
                        const Text('Puede mantenerse aunque cambie la IP, pero solo funciona si la otra computadora puede resolver el nombre en su red.', style: TextStyle(fontSize: 12.5, height: 1.4)),
                      ],
                      const Text('Si aparecen varios enlaces, pruebe el de la red que comparten los equipos; algunos pueden pertenecer a VPN. El cortafuegos debe permitir conexiones privadas al puerto de SGF.', style: TextStyle(fontSize: 12.5, height: 1.4)),
                      const SizedBox(height: 8),
                      Text(servidor.usandoServicio
                        ? 'El servicio permanece activo al cerrar esta ventana. El nombre local requiere mDNS; el nombre de la organización requiere DNS.'
                        : segura
                          ? 'Mantenga SGF abierto: al cerrar la aplicación se detiene el servidor. El nombre local requiere mDNS; el nombre de la organización requiere DNS.'
                          : 'Mantenga SGF abierto: al cerrar la aplicación se detiene el servidor. Si su red no admite mDNS, use una IP reservada en el router como alternativa.', style: const TextStyle(fontSize: 12.5, height: 1.4)),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Redes adicionales (opcional)', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      const Text('El enlace privado HTTPS permite conectar sin configurar redes aquí. Esta opción avanzada conserva autorizaciones concretas de versiones anteriores; mantenga el cortafuegos restringido.'),
                      const SizedBox(height: 8),
                      Text(_errorRedesExtra ?? (_redesExtra == null ? 'Comprobando redes…' : _redesExtra!.isEmpty ? 'No hay redes adicionales autorizadas.' : 'Redes configuradas: ${_redesExtra!.join(', ')}')),
                      OutlinedButton.icon(onPressed: segura && _redesExtra != null ? _editarRedesExtra : null, icon: const Icon(Icons.lan_outlined), label: const Text('Configurar redes adicionales')),
                      if (!segura) const Text('Active primero HTTPS para autorizar redes adicionales.', style: TextStyle(fontSize: 12.5)),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text('Inicio automático', style: Theme.of(context).textTheme.titleMedium),
                      const SizedBox(height: 6),
                      const Text('Estas opciones no necesitan Internet y no borran los datos guardados.', style: TextStyle(fontSize: 13)),
                      if (Platform.isWindows && !Ajustes.pruebaAislada) ...[
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Iniciar el servidor antes de iniciar sesión'),
                          subtitle: Text(segura ? 'Servicio de Windows con cuenta virtual; requiere autorización de administrador.' : 'Active primero HTTPS.'),
                          value: _inicioServicio ?? false,
                          onChanged: _actualizandoServicio || _inicioServicio == null || (!segura && _inicioServicio != true) ? null : _cambiarServicio,
                        ),
                        if (_inicioServicio == null) TextButton(onPressed: _consultarServicio, child: const Text('Comprobar servicio')),
                      ],
                      if (_inicioWindows.disponible)
                        SwitchListTile(
                          contentPadding: EdgeInsets.zero,
                          title: const Text('Abrir SGF al iniciar sesión en Windows'),
                          subtitle: const Text('Para el usuario actual; Windows debe iniciar sesión primero.'),
                          value: _inicioSesionWindows ?? false,
                          onChanged: _actualizandoInicio || _inicioSesionWindows == null ? null : _cambiarInicio,
                        )
                      else Text(Ajustes.pruebaAislada ? 'El servicio y el inicio automático de Windows están desactivados en esta versión de prueba.' : 'La apertura automática al iniciar sesión está disponible en Windows.'),
                      if (_inicioWindows.disponible && _inicioSesionWindows == null)
                        TextButton(onPressed: _consultarInicio, child: const Text('No se pudo consultar el inicio; reintentar')),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Encender el servidor al abrir SGF'),
                        subtitle: const Text('Cuando se abre esta aplicación, intenta iniciar el servidor.'),
                        value: widget.ajustes.arrancarAlAbrir == true,
                        onChanged: (v) async {
                          widget.ajustes.arrancarAlAbrir = v;
                          await widget.ajustes.guardar();
                          if (mounted) setState(() {});
                        },
                      ),
                      SwitchListTile(
                        contentPadding: EdgeInsets.zero,
                        title: const Text('Recuperar el servidor si falla'),
                        subtitle: const Text('Hasta tres intentos mientras SGF está abierto; no se reinicia si lo detiene usted.'),
                        value: widget.ajustes.reiniciarEnFallo,
                        onChanged: (v) async {
                          setState(() => widget.ajustes.reiniciarEnFallo = v);
                          await widget.ajustes.guardar();
                        },
                      ),
                      if (!Platform.isWindows) const Text('El inicio del servidor antes de iniciar sesión requiere Windows.', style: TextStyle(fontSize: 12.5)),
                    ]),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Copias de seguridad', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 4),
                        const Text(
                          'Una copia es una fotografía de la base de datos en este momento. Si algún día los datos se '
                          'dañan, se puede volver a esa fotografía. Se guardan las 10 más recientes.',
                          style: TextStyle(fontSize: 13.5, height: 1.4),
                        ),
                        const SizedBox(height: 14),
                        Wrap(
                          spacing: 10,
                          children: [
                            FilledButton.tonalIcon(
                              onPressed: !enMarcha || _trabajando
                                  ? null
                                  : () => _accion(() async {
                                        try {
                                          final r = await widget.api.crearCopia();
                                          if (!mounted) return;
                                          avisar(context, (r['message'] ?? 'Copia creada.').toString());
                                        } on ApiError catch (e) {
                                          if (!mounted) return;
                                          avisar(context, e.mensaje, tipo: TipoAviso.error);
                                        }
                                      }),
                              icon: const Icon(Icons.backup_outlined),
                              label: const Text('Crear copia ahora'),
                            ),
                            OutlinedButton.icon(
                              onPressed: _abrirCarpetaDatos,
                              icon: const Icon(Icons.folder_open),
                              label: const Text('Abrir la carpeta de datos'),
                            ),
                          ],
                        ),
                        if (_estado?['ultimaCopia'] != null) ...[
                          const SizedBox(height: 12),
                          Text('Última copia: ${_estado!['ultimaCopia']}', style: const TextStyle(fontSize: 13)),
                        ],
                      ],
                    ),
                  ),
                ],
          ),
          derecha: Column(
                children: [
                  Tarjeta(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text('Dónde están los datos', style: Theme.of(context).textTheme.titleMedium),
                        const SizedBox(height: 12),
                        _Fila(etiqueta: 'Base de datos', valor: '${_estado?['modoBd'] ?? 'sqlite'}'.toUpperCase()),
                        OutlinedButton.icon(
                          onPressed: !enMarcha || _trabajando ? null : () async {
                            final modo = await showDialog<String>(context: context, builder: (_) => ConfigurarBaseDialogo(api: widget.api));
                            if (modo == null || !mounted) return;
                            widget.ajustes.modoBd = modo;
                            await widget.ajustes.guardar();
                            if (!mounted) return;
                            widget.api.limpiarSesionLocal();
                            widget.alCambiarBase?.call();
                          },
                          icon: const Icon(Icons.settings_outlined), label: const Text('Configurar base de datos'),
                        ),
                        _Fila(etiqueta: 'Archivo', valor: '${disco['carpetaDatos'] ?? servidor.carpetaDatos.path}'),
                        _Fila(etiqueta: 'Tamaño', valor: _textoBytes((disco['bytes'] ?? 0) as int)),
                        _Fila(etiqueta: 'Configuración', valor: '${disco['archivoEnv'] ?? servidor.archivoEnv.path}'),
                        _Fila(etiqueta: 'Facturas guardadas', valor: '${contadores['facturas'] ?? 0}'),
                        _Fila(etiqueta: 'Equipo', valor: '${_estado?['equipo']?['nombre'] ?? '-'}'),
                        const SizedBox(height: 12),
                        Aviso(
                          titulo: 'Acceso por red privada',
                          mensaje: segura
                              ? 'HTTPS cifra la conexión cuando el cliente confía en el certificado correcto y usa el nombre indicado. No exponga SGF a Internet.'
                              : 'Otras computadoras pueden conectarse con una cuenta. HTTP no cifra contraseñas ni datos; use solo una red confiable y no exponga el puerto en Internet.',
                          tipo: TipoAviso.aviso,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Tarjeta(
                    padding: const EdgeInsets.all(0),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Padding(
                          padding: const EdgeInsets.fromLTRB(16, 14, 8, 6),
                          child: Row(
                            children: [
                              Text('Registro de actividad', style: Theme.of(context).textTheme.titleMedium),
                              const Spacer(),
                              TextButton.icon(
                                onPressed: () => setState(() => servidor.registro.clear()),
                                icon: const Icon(Icons.delete_sweep_outlined, size: 18),
                                label: const Text('Limpiar'),
                              ),
                            ],
                          ),
                        ),
                        Container(
                          height: 240,
                          width: double.infinity,
                          margin: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                          padding: const EdgeInsets.all(10),
                          decoration: BoxDecoration(
                            color: const Color(0xFF0F1720),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: servidor.registro.isEmpty
                              ? const Text('Todavía no hay actividad.',
                                  style: TextStyle(color: Colors.white38, fontSize: 12.5))
                              : ListView.builder(
                                  itemCount: servidor.registro.length,
                                  itemBuilder: (context, i) => Padding(
                                    padding: const EdgeInsets.only(bottom: 3),
                                    child: Text(
                                      servidor.registro[i],
                                      style: const TextStyle(
                                        color: Color(0xFF9FB3C8),
                                        fontSize: 11.5,
                                        fontFamily: 'Consolas',
                                        height: 1.35,
                                      ),
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
      ],
    );
  }

  String _tituloEstado(EstadoServidor e) => switch (e) {
        EstadoServidor.enMarcha => 'El servidor está funcionando',
        EstadoServidor.arrancando => 'Iniciando el servidor…',
        EstadoServidor.deteniendo => 'Deteniendo el servidor…',
        EstadoServidor.fallo => 'El servidor no está funcionando',
        EstadoServidor.detenido => 'El servidor está detenido',
      };

  String _textoBytes(int bytes) {
    if (bytes < 1024) return '$bytes bytes';
    if (bytes < 1024 * 1024) return '${(bytes / 1024).toStringAsFixed(1)} KB';
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Future<void> _abrirCarpetaDatos() async {
    final ruta = widget.servidor.carpetaDatos.path;
    try {
      await Directory(ruta).create(recursive: true);
      if (Platform.isWindows) {
        await Process.run('explorer', [ruta]);
      } else if (Platform.isMacOS) {
        await Process.run('open', [ruta]);
      } else {
        await Process.run('xdg-open', [ruta]);
      }
    } catch (e) {
      if (!mounted) return;
      avisar(context, 'No se pudo abrir la carpeta: $ruta', tipo: TipoAviso.aviso);
    }
  }
}

class _CirculoEstado extends StatelessWidget {
  const _CirculoEstado({required this.estado});
  final EstadoServidor estado;

  @override
  Widget build(BuildContext context) {
    final (color, icono) = switch (estado) {
      EstadoServidor.enMarcha => (const Color(0xFF1B7F4B), Icons.check),
      EstadoServidor.arrancando || EstadoServidor.deteniendo => (const Color(0xFF1D6FB8), Icons.sync),
      EstadoServidor.fallo => (const Color(0xFFB3261E), Icons.close),
      EstadoServidor.detenido => (const Color(0xFF6B7280), Icons.pause),
    };
    return Container(
      width: 52,
      height: 52,
      decoration: BoxDecoration(color: color.withValues(alpha: 0.14), shape: BoxShape.circle),
      child: Icon(icono, color: color, size: 28),
    );
  }
}

class _Fila extends StatelessWidget {
  const _Fila({required this.etiqueta, required this.valor});
  final String etiqueta;
  final String valor;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(etiqueta.toUpperCase(),
              style: TextStyle(
                  fontSize: 10.5, letterSpacing: 0.5, fontWeight: FontWeight.w700,
                  color: Theme.of(context).colorScheme.onSurfaceVariant)),
          Text(valor, style: const TextStyle(fontSize: 13, fontFamily: 'Consolas')),
        ],
      ),
    );
  }
}

/// Abre la version web en el navegador del sistema.
Future<bool> abrirEnNavegador(String url) async {
  try {
    final ProcessResult resultado;
    if (Platform.isWindows) {
      resultado = await Process.run('cmd', ['/c', 'start', '', url]);
    } else if (Platform.isMacOS) {
      resultado = await Process.run('open', [url]);
    } else {
      resultado = await Process.run('xdg-open', [url]);
    }
    return resultado.exitCode == 0;
  } catch (_) {
    return false;
  }
}
