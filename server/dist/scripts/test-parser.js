import fs from "node:fs";
import path from "node:path";
import pdfParse from "pdf-parse";
import { parseFacturaEtcsa } from "../utils/factura-parser.js";
async function loadInput(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".txt") {
        return fs.readFileSync(filePath, "utf8");
    }
    if (ext === ".pdf") {
        const buffer = fs.readFileSync(filePath);
        const pdf = await pdfParse(buffer);
        return String(pdf.text || "");
    }
    throw new Error(`Formato no soportado para prueba de parser: ${ext}`);
}
async function main() {
    const input = process.argv[2];
    if (!input) {
        console.error("Uso: npm run parser:test -- <ruta-al-pdf-o-txt>");
        process.exit(1);
    }
    const filePath = path.resolve(process.cwd(), input);
    const rawText = await loadInput(filePath);
    const factura = parseFacturaEtcsa(rawText);
    console.log(JSON.stringify({
        file: filePath,
        cliente: factura.cliente,
        numeroCliente: factura.numeroCliente,
        numeroCuenta: factura.numeroCuenta,
        noFactura: factura.noFactura,
        fechaEmision: factura.fechaEmision,
        fechaVencimiento: factura.fechaVencimiento,
        periodoConsumo: factura.periodoConsumo,
        codigoPago: factura.codigoPago,
        moneda: factura.moneda,
        nit: factura.nit,
        servicios: factura.servicios.length,
        confidence: factura.confidence,
        reviewStatus: factura.reviewStatus,
        reviewLabel: factura.reviewLabel,
        requiresReview: factura.requiresReview,
        strategies: factura.strategies,
        diagnostics: factura.diagnostics,
        totals: factura.totales,
        primerosServicios: factura.servicios.slice(0, 5),
    }, null, 2));
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
//# sourceMappingURL=test-parser.js.map