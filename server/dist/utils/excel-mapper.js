/**
 * excel-mapper.ts - Mapeo inteligente de columnas Excel -> tablas SGF
 * Soporta prueba.xlsx (25 columnas de líneas telefónicas) y facturas.
 */
const COLUMN_PATTERNS = {
    // SGF_LINEAS_IMPORTADAS / prueba.xlsx
    NUMERO: [/^n[úu]mero$/i, /^numero$/i, /^no[._\s]?telefono/i, /^telefono$/i],
    ASIGNACION_VOZ: [/asignaci[óo]n.*voz/i, /voz/i],
    ASIGNACION_SMS: [/asignaci[óo]n.*sms/i, /sms/i],
    TIPO_TELEFONO: [/tipo.*tel[eé]fono/i, /tipo.*telefono/i],
    ESTRUCTURA: [/estructura/i],
    PROVINCIA: [/provincia/i],
    MUNICIPIO: [/municipio/i],
    ORGANO: [/[óo]rgano/i, /organo/i],
    UNIDAD: [/unidad/i],
    UBICACION: [/ubicaci[óo]n/i, /ubicacion/i],
    CARGO: [/cargo/i],
    USUARIO_PUESTO: [/usuario.*puesto/i, /usuario/i, /puesto/i],
    GRADO: [/grado/i],
    ESTADO: [/estado/i],
    MARCA: [/marca/i],
    MODELO: [/modelo/i],
    TARJETA_SD: [/tarjeta.*sd/i, /sd/i],
    PUBLICO: [/p[úu]blico/i, /publico/i],
    ESTUCHE: [/estuche/i],
    PIN: [/^pin$/i],
    PUK: [/^puk$/i],
    IMEI: [/imei/i],
    MMS: [/^mms$/i],
    INTERNET: [/internet/i],
    FECHA_ACTUALIZACION: [/fecha.*actualizaci[óo]n/i, /fecha.*actualizacion/i, /actualizacion/i],
    // SGF_FACTURAS
    NO_FACTURA: [/no[._\s]?factura/i, /nro[._\s]?factura/i, /factura/i],
    CLIENTE: [/cliente/i, /nombre[._\s]?cliente/i, /razon[._\s]?social/i],
    CUENTA: [/cuenta/i],
    NUMERO_CLIENTE: [/numero[._\s]?cliente/i],
    NUMERO_CUENTA: [/numero[._\s]?cuenta/i],
    FECHA_EMISION: [/fecha[._\s]?emision/i, /emision/i],
    FECHA_VENCIMIENTO: [/vencimiento/i],
    PERIODO_CONSUMO: [/periodo/i, /consumo/i],
    CODIGO_PAGO: [/codigo[._\s]?pago/i],
    TOTAL: [/total/i, /importe/i, /monto/i],
    // SGF_SERVICIOS
    NUMERO_SERVICIO: [/numero[._\s]?servicio/i, /no[._\s]?servicio/i, /servicio/i],
    // SGF_USUARIOS
    USERNAME: [/username/i, /usuario/i, /login/i],
    NAME: [/name/i, /nombre/i, /nombre[._\s]?completo/i],
    ROLE: [/role/i, /rol/i],
};
const TABLE_HINTS = {
    SGF_LINEAS_IMPORTADAS: ["NUMERO", "PROVINCIA", "MUNICIPIO", "ORGANO", "UNIDAD", "CARGO", "GRADO", "IMEI", "PIN", "PUK"],
    PCELULAR_LINEA_TELEFONICA: ["NUMERO", "ASIGNACIONVOZ", "ASIGNACIONSMS", "PIN", "PUK"],
    PCELULAR_PERSONA: ["INDENTID", "NOMBRE", "APELL1"],
    PCELULAR_TELEFONO_ASIGNADO: ["IMEI", "MARCA", "MODELO"],
    PCELULAR_PROVINCIA: ["PROVINCIA_D", "COD_PROVINCIA"],
    PCELULAR_MUNICIPIO: ["NOMBRE_M", "COD_MUNICIPIO"],
    PCELULAR_ORGANO: ["ORGANO", "COD_ORGANO"],
    PCELULAR_UNIDAD: ["UNIDAD", "COD_UNIDAD"],
    PCELULAR_CARGO: ["CARGO", "COD_CARGO"],
    PCELULAR_GRADO: ["GRADO_D", "COD_GRADO"],
    SGF_FACTURAS: ["NO_FACTURA", "CLIENTE", "TOTAL", "FECHA_EMISION"],
    SGF_SERVICIOS: ["NUMERO_SERVICIO", "FACTURA_ID", "IMPORTE"],
    SGF_USUARIOS: ["USERNAME", "NAME", "PASSWORD_HASH"],
};
function normalizeHeader(h) {
    return h
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "_")
        .replace(/__+/g, "_")
        .replace(/^_|_$/g, "")
        .toUpperCase();
}
export function suggestColumnMapping(excelHeaders) {
    const mapping = {};
    for (const header of excelHeaders) {
        const norm = normalizeHeader(header);
        // Direct match
        if (COLUMN_PATTERNS[norm]) {
            mapping[header] = norm;
            continue;
        }
        // Pattern match
        let found = false;
        for (const [col, patterns] of Object.entries(COLUMN_PATTERNS)) {
            for (const pat of patterns) {
                if (pat.test(header) || pat.test(norm)) {
                    mapping[header] = col;
                    found = true;
                    break;
                }
            }
            if (found)
                break;
        }
        if (!found) {
            // Fallback: use normalized header as column name (will trigger ALTER TABLE)
            mapping[header] = norm;
        }
    }
    return mapping;
}
export function suggestTable(excelHeaders) {
    const normHeaders = excelHeaders.map(normalizeHeader);
    let bestTable = "SGF_LINEAS_IMPORTADAS";
    let bestScore = 0;
    for (const [table, hints] of Object.entries(TABLE_HINTS)) {
        let score = 0;
        for (const hint of hints) {
            if (normHeaders.includes(hint) || normHeaders.some(h => h.includes(hint) || hint.includes(h))) {
                score++;
            }
        }
        if (score > bestScore) {
            bestScore = score;
            bestTable = table;
        }
    }
    // Heurística especial para prueba.xlsx: si tiene PROVINCIA, MUNICIPIO, ORGANO, UNIDAD, etc., es LINEAS_IMPORTADAS
    const hasLineasMarkers = ["PROVINCIA", "MUNICIPIO", "ORGANO", "UNIDAD", "IMEI", "PIN", "PUK"].filter(m => normHeaders.includes(m) || normHeaders.some(h => h.includes(m))).length;
    if (hasLineasMarkers >= 3) {
        return "SGF_LINEAS_IMPORTADAS";
    }
    // Si tiene NO_FACTURA y CLIENTE, es facturas
    if (normHeaders.includes("NO_FACTURA") && normHeaders.includes("CLIENTE")) {
        return "SGF_FACTURAS";
    }
    return bestTable;
}
export function inferColumnType(values) {
    const sample = values.filter(v => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 20);
    if (sample.length === 0)
        return { type: "TEXT", maxLength: 255 };
    // Check if all numbers
    const allNumbers = sample.every(v => !isNaN(Number(v)));
    if (allNumbers) {
        const hasDecimal = sample.some(v => String(v).includes('.') || String(v).includes(','));
        if (hasDecimal)
            return { type: "DECIMAL" };
        return { type: "INTEGER" };
    }
    // Check max length
    const maxLen = Math.max(...sample.map(v => String(v).length));
    if (maxLen > 500)
        return { type: "TEXT" };
    if (maxLen > 255)
        return { type: "VARCHAR", maxLength: 500 };
    return { type: "VARCHAR", maxLength: 255 };
}
//# sourceMappingURL=excel-mapper.js.map