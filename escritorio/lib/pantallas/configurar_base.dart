import 'package:flutter/material.dart';
import '../servicios/api.dart';
import '../widgets/comunes.dart';

/// Configuración local posterior al asistente. No muestra contraseñas guardadas.
class ConfigurarBaseDialogo extends StatefulWidget {
  const ConfigurarBaseDialogo({super.key, required this.api});
  final Api api;
  @override
  State<ConfigurarBaseDialogo> createState() => _ConfigurarBaseDialogoState();
}

class _ConfigurarBaseDialogoState extends State<ConfigurarBaseDialogo> {
  final _host = TextEditingController();
  final _puerto = TextEditingController(text:'1521');
  final _base = TextEditingController();
  final _usuario = TextEditingController();
  final _clave = TextEditingController();
  String _tipo = 'sqlite';
  String _actual = '';
  String? _aviso;
  bool _trabajando = false, _probado = false, _inicializando = true;
  bool _cifrar = false, _confiar = true;

  @override
  void initState() { super.initState(); _cargar(); }
  @override
  void dispose() { for(final c in [_host,_puerto,_base,_usuario,_clave]) { c.dispose(); } super.dispose(); }
  Future<void> _cargar() async {
    try {
      final r=await widget.api.get('/api/db/config');
      final config=(r['data']?['config'] as Map?) ?? {};
      _actual='${r['data']?['mode'] ?? 'sqlite'}'; _tipo=_actual;
      if (_tipo == 'oracle') { _host.text='${config['oracleHost'] ?? ''}'; _puerto.text='${config['oraclePort'] ?? '1521'}'; _base.text='${config['oracleService'] ?? ''}'; _usuario.text='${config['oracleUser'] ?? ''}'; }
      if (_tipo == 'mssql') { _host.text='${config['mssqlServer'] ?? ''}'; _puerto.text='${config['mssqlPort'] ?? '1433'}'; _base.text='${config['mssqlDatabase'] ?? ''}'; _usuario.text='${config['mssqlUser'] ?? ''}'; _cifrar=config['mssqlEncrypt']==true; _confiar=config['mssqlTrustCert']==true; }
    } on ApiError catch(e) { _aviso=e.mensaje; }
    finally { if(mounted) setState(()=>_inicializando=false); }
  }
  Map<String,dynamic> get _payload => _tipo=='oracle'
      ? {'type':'oracle','host':_host.text.trim(),'port':_puerto.text.trim(),'service':_base.text.trim(),'user':_usuario.text.trim(),'password':_clave.text}
      : {'type':'mssql','server':_host.text.trim(),'port':_puerto.text.trim(),'database':_base.text.trim(),'user':_usuario.text.trim(),'password':_clave.text,'encrypt':_cifrar,'trustServerCertificate':_confiar};
  void _modificado([String? _]) { if(_probado || _aviso!=null) setState(() {_probado=false;_aviso=null;}); }
  Future<void> _probar() async {
    if([_host.text,_puerto.text,_base.text,_usuario.text].any((x)=>x.trim().isEmpty)) {setState(()=>_aviso='Complete servidor, puerto, base o servicio y usuario.');return;}
    setState(() {_trabajando=true;_aviso=null;_probado=false;});
    try { await widget.api.post('/api/db/test',_payload); if(mounted) setState(() {_probado=true;_aviso='Conexión probada. Aún no se han cambiado los datos de SGF.';}); }
    on ApiError catch(e) { if(mounted) setState(()=>_aviso='No se pudo conectar: ${e.mensaje}'); }
    finally { if(mounted) setState(()=>_trabajando=false); }
  }
  Future<void> _aplicar() async {
    if (_tipo!='sqlite' && !_probado) {setState(()=>_aviso='Primero pruebe esta conexión.');return;}
    final ok=await confirmar(context, titulo:'¿Cambiar la base de datos?',
      mensaje:'Cada base tiene sus propias cuentas y facturas. No se copiarán ni borrarán automáticamente los datos de la base anterior. '
          'Al conectar una base externa, SGF puede crear sus tablas y agregar columnas necesarias. '
          'La sesión se cerrará y necesitará una cuenta de la base elegida. Las credenciales se guardarán en la configuración local sin cifrar.',
      textoConfirmar:'Cambiar base', destructivo:true);
    if(!ok || !mounted) return;
    setState(() {_trabajando=true;_aviso=null;});
    try {
      if(_tipo=='sqlite') {await widget.api.post('/api/db/disconnect', {'confirmarCambio':true});}
      else {await widget.api.post('/api/db/connect',{..._payload,'confirmarCambio':true});}
      if(mounted) Navigator.of(context).pop(_tipo);
    } on ApiError catch(e) { if(mounted) setState(()=>_aviso=e.mensaje); }
    finally { if(mounted) setState(()=>_trabajando=false); }
  }
  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Configurar base de datos'),
    content: SizedBox(width:560, child: _inicializando ? const Center(child:CircularProgressIndicator()) : SingleChildScrollView(child:Column(crossAxisAlignment:CrossAxisAlignment.start,mainAxisSize:MainAxisSize.min,children:[
      Text('Base actual: ${_actual.toUpperCase()}. Cambiar de base no traslada los datos ni las cuentas.'), const SizedBox(height:14),
      DropdownButtonFormField<String>(initialValue:_tipo, decoration:const InputDecoration(labelText:'Base de datos'), items:const [DropdownMenuItem(value:'sqlite',child:Text('SQLite local')),DropdownMenuItem(value:'oracle',child:Text('Oracle')),DropdownMenuItem(value:'mssql',child:Text('SQL Server'))], onChanged:_trabajando?null:(v){if(v==null)return;setState(() {_tipo=v;_probado=false;_aviso=null;_puerto.text=v=='oracle'?'1521':'1433';});}),
      if(_tipo!='sqlite') ...[
        const SizedBox(height:10),
        TextField(controller:_host,onChanged:_modificado,decoration:const InputDecoration(labelText:'Servidor o dirección')),
        TextField(controller:_puerto,onChanged:_modificado,decoration:const InputDecoration(labelText:'Puerto')),
        TextField(controller:_base,onChanged:_modificado,decoration:InputDecoration(labelText:_tipo=='oracle'?'Servicio Oracle':'Nombre de la base')),
        TextField(controller:_usuario,onChanged:_modificado,decoration:const InputDecoration(labelText:'Usuario de la base')),
        TextField(controller:_clave,onChanged:_modificado,obscureText:true,decoration:const InputDecoration(labelText:'Contraseña de la base')),
        if(_tipo=='mssql') ...[
          CheckboxListTile(value:_cifrar,title:const Text('Cifrar conexión'),onChanged:_trabajando?null:(v){setState(()=>_cifrar=v??false);_modificado();}),
          CheckboxListTile(value:_confiar,title:const Text('Confiar en el certificado del servidor'),onChanged:_trabajando?null:(v){setState(()=>_confiar=v??false);_modificado();}),
        ],
        const SizedBox(height:10), OutlinedButton.icon(onPressed:_trabajando?null:_probar,icon:const Icon(Icons.network_check),label:const Text('Probar conexión')),
      ],
      if(_aviso!=null) ...[const SizedBox(height:12),Text(_aviso!)],
    ]))),
    actions:[TextButton(onPressed:_trabajando?null:()=>Navigator.pop(context),child:const Text('Cancelar')),FilledButton(onPressed:_trabajando||_inicializando?null:_aplicar,child:Text(_trabajando?'Aplicando…':'Aplicar'))],
  );
}
