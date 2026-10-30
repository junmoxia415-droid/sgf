import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sgf_escritorio/pantallas/facturas.dart';

void main() {
  testWidgets('Muestra las causas que requieren revisión antes de guardar', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: Scaffold(body: ObservacionesExtraccion(
      diagnosticos: [
        {'level': 'warn', 'message': 'La suma no coincide con el total impreso.'},
        {'level': 'warn', 'message': 'Se conservó un número de servicio repetido.'},
        {'level': 'info', 'message': 'Información técnica.'},
      ],
    ))));
    expect(find.textContaining('necesita revisión manual'), findsOneWidget);
    expect(find.textContaining('La suma no coincide con el total impreso.'), findsOneWidget);
    expect(find.textContaining('Se conservó un número de servicio repetido.'), findsOneWidget);
    expect(find.textContaining('Información técnica.'), findsNothing);
  });
}
