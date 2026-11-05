import 'package:flutter/material.dart';
import 'dart:ui' show PointerDeviceKind;
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/catalogo_lineas.dart';
import 'package:sgf_escritorio/servicios/api.dart';

class ApiCatalogoFicticio extends Api {
  @override Future<Map<String,dynamic>> get(String ruta) async => {
    'success':true,
    'data':List.generate(30,(i)=>{
      'ID':'id-ficticio-$i', 'NUMERO':'550000${i.toString().padLeft(2,'0')}',
      'USUARIO_PUESTO':'Persona ficticia $i', 'UNIDAD':'Unidad de prueba',
      for(var c=0;c<20;c++) 'COLUMNA_$c':'valor $c fila $i',
    }),
    'meta':{'total':30,'totalPages':1},
  };
}
void main() {
  testWidgets('Tabla usa barras visibles en ambos sentidos y flechas, conserva los campos', (tester) async {
    tester.view.physicalSize=const Size(1040,680);tester.view.devicePixelRatio=1;
    addTearDown(tester.view.reset);
    await tester.pumpWidget(MaterialApp(home:Scaffold(body:SingleChildScrollView(child:CatalogoLineasPantalla(api:ApiCatalogoFicticio())))));
    await tester.pumpAndSettle();
    final h=tester.widget<Scrollbar>(find.byKey(const ValueKey('barra-horizontal-lineas')));
    final v=tester.widget<Scrollbar>(find.byKey(const ValueKey('barra-vertical-lineas')));
    expect(h.thumbVisibility,isTrue);expect(v.thumbVisibility,isTrue);
    expect(h.controller!.position.maxScrollExtent,greaterThan(0));
    expect(v.controller!.position.maxScrollExtent,greaterThan(0));
    final areaHorizontal=tester.getRect(find.byKey(const ValueKey('barra-horizontal-lineas')));
    final areaVertical=tester.getRect(find.byKey(const ValueKey('barra-vertical-lineas')));
    expect(areaVertical.right, closeTo(areaHorizontal.right, 1), reason:'La barra vertical debe permanecer en el borde visible de la tabla');
    expect(find.text('Número'),findsOneWidget);expect(find.text('Titular / puesto'),findsOneWidget);
    expect(find.text('Identificador'),findsOneWidget);
    expect(find.text('55000000'),findsOneWidget);expect(find.text('Persona ficticia 0'),findsOneWidget);
    await tester.dragFrom(Offset(areaVertical.right - 8, areaVertical.top + 15), const Offset(0, 80), kind: PointerDeviceKind.mouse);
    await tester.pumpAndSettle();
    expect(v.controller!.offset, greaterThan(0), reason:'La barra vertical puede arrastrarse sin mover las columnas');
    v.controller!.jumpTo(0);await tester.pumpAndSettle();
    await tester.dragFrom(Offset(areaHorizontal.left + 25, areaHorizontal.bottom - 5), const Offset(100, 0), kind: PointerDeviceKind.mouse);
    await tester.pumpAndSettle();
    expect(h.controller!.offset, greaterThan(0), reason:'La barra horizontal puede arrastrarse');
    h.controller!.jumpTo(0);await tester.pumpAndSettle();
    await tester.tap(find.byTooltip('Columnas siguientes'));await tester.pumpAndSettle();
    expect(h.controller!.offset,greaterThan(0));
    final esquina=tester.getTopLeft(find.byKey(const ValueKey('barra-horizontal-lineas')));
    await tester.dragFrom(esquina+const Offset(200,120),const Offset(0,-160));await tester.pumpAndSettle();
    expect(v.controller!.offset,greaterThan(0));
    expect(tester.takeException(),isNull);
  });
}
