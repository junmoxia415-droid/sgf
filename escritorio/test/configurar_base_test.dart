import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/configurar_base.dart';
import 'package:sgf_escritorio/pantallas/catalogo_lineas.dart';
import 'package:sgf_escritorio/servicios/api.dart';

class ApiFicticia extends Api {
  int cambios=0;
  @override
  Future<Map<String, dynamic>> get(String ruta) async {
    if (ruta=='/api/db/config') return {'success':true,'data':{'mode':'sqlite','config':{}}};
    if (ruta.startsWith('/api/lineas/catalogo')) return {'success':true,'data':[{'NUMERO':'50000001','USUARIO_PUESTO':'Persona ficticia'}],'meta':{'total':1,'totalPages':1}};
    throw StateError('Ruta de prueba inesperada');
  }
  @override
  Future<Map<String, dynamic>> post(String ruta,[Object? cuerpo]) async {
    if (ruta=='/api/db/disconnect') {cambios++;expect((cuerpo as Map)['confirmarCambio'],true);return {'success':true};}
    throw StateError('Esta prueba no llama a servicios externos');
  }
}
void main() {
  testWidgets('Cambiar SQLite pide confirmación y cancelar no cambia nada', (tester) async {
    tester.view.physicalSize=const Size(1200,900);tester.view.devicePixelRatio=1;addTearDown(tester.view.reset);
    final api=ApiFicticia();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ConfigurarBaseDialogo(api:api))));await tester.pumpAndSettle();
    expect(find.textContaining('no traslada los datos'),findsOneWidget);
    await tester.tap(find.text('Aplicar'));await tester.pumpAndSettle();
    expect(find.text('¿Cambiar la base de datos?'),findsOneWidget);expect(api.cambios,0);
    await tester.tap(find.text('Cancelar').last);await tester.pumpAndSettle();expect(api.cambios,0);
  });
  testWidgets('Catálogo muestra datos ficticios y paginación', (tester) async {
    tester.view.physicalSize=const Size(1200,900);tester.view.devicePixelRatio=1;addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: SingleChildScrollView(child:CatalogoLineasPantalla(api:ApiFicticia())))));await tester.pumpAndSettle();
    expect(find.text('Persona ficticia'),findsOneWidget);expect(find.textContaining('1 filas'),findsOneWidget);
  });
}
