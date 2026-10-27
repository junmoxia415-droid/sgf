/**
 * Script de prueba para el importador Excel
 *
 * Uso:
 *   npm run tsx src/scripts/test-importer.ts
 *
 * Este script prueba la funcionalidad de importación con un archivo de ejemplo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDatabase, closeDb } from '../models/database.js';
import { importExcelToSGF, analyzeExcelFile } from '../utils/excel-importer.js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_DATA_DIR = path.resolve(__dirname, '../../../server-data');
async function main() {
    console.log('[SGF-Importer-Test] Iniciando prueba...\n');
    // Inicializar base de datos
    await initDatabase();
    console.log('[SGF-Importer-Test] Base de datos inicializada.\n');
    // Buscar archivo de prueba
    const testFiles = [
        path.join(SERVER_DATA_DIR, 'prueba.xlsx'),
        path.join(SERVER_DATA_DIR, '../SGF/prueba.xlsx'),
        path.join(__dirname, '../../../../SGF/prueba.xlsx'),
        path.join(__dirname, '../../../../prueba.xlsx'),
    ];
    let filePath = null;
    for (const testPath of testFiles) {
        if (fs.existsSync(testPath)) {
            filePath = testPath;
            break;
        }
    }
    if (!filePath) {
        console.error('[SGF-Importer-Test] No se encontró el archivo prueba.xlsx');
        console.log('Buscado en:', testFiles.join(', '));
        process.exit(1);
    }
    console.log(`[SGF-Importer-Test] Archivo encontrado: ${filePath}\n`);
    // Leer el archivo
    const fileBuffer = fs.readFileSync(filePath);
    // 1. Analizar el archivo
    console.log('=== PASO 1: Analizando archivo ===\n');
    const analysis = await analyzeExcelFile(fileBuffer);
    console.log(`Hojas encontradas: ${analysis.sheets.length}`);
    for (const sheet of analysis.sheets) {
        console.log(`  - ${sheet.name}: ${sheet.rowCount} filas, ${sheet.columnCount} columnas`);
        console.log(`    Encabezados: ${sheet.headers.join(', ')}`);
    }
    console.log(`\nTabla sugerida: ${analysis.suggestedTable}\n`);
    // 2. Probar importación
    console.log('=== PASO 2: Importando datos ===\n');
    const result = await importExcelToSGF(fileBuffer, {
        userId: 'test-user',
        truncateBeforeImport: false,
    });
    console.log(`\nResultado:`);
    console.log(`  Éxito: ${result.success}`);
    console.log(`  Mensaje: ${result.message}`);
    console.log(`  Tabla: ${result.data.table}`);
    console.log(`  Filas totales: ${result.data.totalRows}`);
    console.log(`  Filas importadas: ${result.data.importedRows}`);
    console.log(`  Filas fallidas: ${result.data.failedRows}`);
    console.log(`  Columnas nuevas: ${result.data.newColumnsAdded.length > 0 ? result.data.newColumnsAdded.join(', ') : 'ninguna'}`);
    if (result.data.errors.length > 0) {
        console.log(`\n  Errores (primeros 5):`);
        for (const error of result.data.errors.slice(0, 5)) {
            console.log(`    - Fila ${error.row}: ${error.error}`);
        }
    }
    if (result.data.warnings.length > 0) {
        console.log(`\n  Advertencias:`);
        for (const warning of result.data.warnings) {
            console.log(`    - ${warning}`);
        }
    }
    console.log('\n=== PASO 3: Mapeo utilizado ===\n');
    for (const [excelCol, sgfCol] of Object.entries(result.data.mapping)) {
        console.log(`  ${excelCol} → ${sgfCol}`);
    }
    // 3. Probar con tabla específica
    console.log('\n=== PASO 4: Probar con tabla SGF_FACTURAS ===\n');
    // Crear un Excel de prueba con datos de factura
    const testFacturaData = [
        ['NO_FACTURA', 'CLIENTE', 'FECHA_EMISION', 'FECHA_VENCIMIENTO', 'TOTAL', 'ESTADO'],
        ['FACT-001', 'Cliente A', '2024-01-01', '2024-02-01', '100.50', 'procesado'],
        ['FACT-002', 'Cliente B', '2024-01-02', '2024-02-02', '200.75', 'pendiente'],
        ['FACT-003', 'Cliente C', '2024-01-03', '2024-02-03', '150.00', 'error'],
    ];
    // Note: En un entorno real, usarías la librería xlsx para crear el buffer
    // Para este test, solo mostramos cómo sería
    console.log('Datos de prueba para SGF_FACTURAS:');
    console.log(testFacturaData.map(row => row.join(' | ')).join('\n'));
    console.log('\n[SGF-Importer-Test] Prueba completada.\n');
    // Cerrar base de datos
    await closeDb();
}
main().catch(console.error);
//# sourceMappingURL=test-importer.js.map