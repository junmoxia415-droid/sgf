const META_PREFIX = "__SGF_META__";
const META_SEPARATOR = "\n__SGF_TEXT__\n";
export function packStoredFacturaText(rawText, meta) {
    return `${META_PREFIX}${JSON.stringify(meta)}${META_SEPARATOR}${rawText}`;
}
export function unpackStoredFacturaText(value) {
    const text = String(value || "");
    if (!text.startsWith(META_PREFIX)) {
        return { meta: null, text };
    }
    const splitIndex = text.indexOf(META_SEPARATOR);
    if (splitIndex === -1) {
        return { meta: null, text };
    }
    const rawMeta = text.slice(META_PREFIX.length, splitIndex);
    const rawText = text.slice(splitIndex + META_SEPARATOR.length);
    try {
        return { meta: JSON.parse(rawMeta), text: rawText };
    }
    catch {
        return { meta: null, text: rawText };
    }
}
const HEADER_LIMIT_LINES = 40;
const SERVICE_LABELS = ["servicio", "cuota", "consumo", "comision", "impuesto", "importe", "total"];
function stripAccents(text) {
    return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function cleanLine(line) {
    return line.replace(/\u00A0/g, " ").replace(/\s+/g, " ").trim();
}
function normalizedLine(line) {
    return stripAccents(cleanLine(line)).toLowerCase();
}
export function normalizePdfText(text) {
    return text
        .replace(/\u00A0/g, " ")
        .replace(/\r/g, "")
        .split("\n")
        .map(cleanLine)
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}
export function normalizarNumero(valor) {
    const limpio = String(valor || "").replace(/[^\d.,-]/g, "").trim();
    if (!limpio)
        return 0;
    const ultimoPunto = limpio.lastIndexOf(".");
    const ultimaComa = limpio.lastIndexOf(",");
    if (ultimaComa > ultimoPunto) {
        return Number(limpio.replace(/\./g, "").replace(/,/g, ".")) || 0;
    }
    return Number(limpio.replace(/,/g, "")) || 0;
}
export function formatearNumero(valor) {
    return Number.isFinite(valor) ? valor.toFixed(2) : "0.00";
}
function firstMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (!match)
            continue;
        for (let i = 1; i < match.length; i += 1) {
            if (match[i])
                return match[i].trim();
        }
    }
    return "";
}
function getLines(text) {
    return normalizePdfText(text)
        .split(/\n/)
        .map(cleanLine)
        .filter(Boolean);
}
function amountToken(token) {
    return /^-?\d[\d.,]*$/.test(token);
}
function moneyLikeToken(token) {
    return /^-?\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})$/.test(token) || /^-?\d+(?:[.,]\d{2})$/.test(token);
}
function amountValue(token) {
    return formatearNumero(normalizarNumero(token));
}
function isServiceNumber(value) {
    return /^\d{7,10}$/.test(value);
}
function parseRowLikeLine(line) {
    const tokens = cleanLine(line).split(/\s+/).filter(Boolean);
    const numericTokens = tokens.filter(amountToken);
    if (numericTokens.length < 6)
        return null;
    for (let serviceParts = 1; serviceParts <= Math.min(3, numericTokens.length - 5); serviceParts += 1) {
        const numero = numericTokens.slice(0, serviceParts).join("").replace(/\D/g, "");
        if (!isServiceNumber(numero))
            continue;
        const rest = numericTokens.slice(serviceParts, serviceParts + 5);
        if (rest.length !== 5)
            continue;
        return {
            numero,
            cuota: amountValue(rest[0]),
            consumo: amountValue(rest[1]),
            comision: amountValue(rest[2]),
            impuesto: amountValue(rest[3]),
            importe: amountValue(rest[4]),
        };
    }
    return null;
}
function getHeaderSection(lines) {
    const end = lines.findIndex((line) => /resumen por servicios|desglose de factura/i.test(normalizedLine(line)));
    return lines.slice(0, end > -1 ? end : Math.min(lines.length, HEADER_LIMIT_LINES)).join("\n");
}
function getServiceSection(lines) {
    const start = lines.findIndex((line) => normalizedLine(line).includes("resumen por servicios"));
    if (start === -1)
        return [];
    const sliced = lines.slice(start + 1);
    const end = sliced.findIndex((line) => {
        const n = normalizedLine(line);
        return n.startsWith("comisiones") || n.startsWith("pagar a:") || n.includes("codigo reeup") || n.includes("desglose de factura") || n.includes("cuenta:") && n.includes("empresas");
    });
    return end === -1 ? sliced : sliced.slice(0, end);
}
function parseColumnarSection(sectionLines, diagnostics) {
    const normalized = sectionLines.map(normalizedLine);
    const indexMap = {
        servicio: normalized.findIndex((line) => line === "servicio" || line.startsWith("servicio ")),
        cuota: normalized.findIndex((line) => line === "cuota"),
        consumo: normalized.findIndex((line) => line === "consumo"),
        comision: normalized.findIndex((line) => line === "comision"),
        impuesto: normalized.findIndex((line) => line === "impuesto"),
        importe: normalized.findIndex((line) => line === "importe"),
        total: normalized.findIndex((line) => line.startsWith("total")),
    };
    if ([indexMap.servicio, indexMap.cuota, indexMap.consumo, indexMap.comision, indexMap.impuesto, indexMap.importe].some((x) => x === -1)) {
        diagnostics.push({ level: "warn", code: "services-columnar-not-found", message: "No se detectaron todas las columnas del resumen por servicios." });
        return [];
    }
    const take = (from, to) => sectionLines
        .slice(from, to)
        .map((line) => line.replace(/\s+/g, "").trim())
        .filter((line) => line && !SERVICE_LABELS.includes(normalizedLine(line)));
    const columns = {
        servicios: take(indexMap.servicio + 1, indexMap.cuota),
        cuotas: take(indexMap.cuota + 1, indexMap.consumo),
        consumos: take(indexMap.consumo + 1, indexMap.comision),
        comisiones: take(indexMap.comision + 1, indexMap.impuesto),
        impuestos: take(indexMap.impuesto + 1, indexMap.importe),
        importes: take(indexMap.importe + 1, indexMap.total === -1 ? sectionLines.length : indexMap.total),
    };
    const max = Math.max(columns.servicios.length, columns.cuotas.length, columns.consumos.length, columns.comisiones.length, columns.impuestos.length, columns.importes.length);
    if (max === 0)
        return [];
    if (![
        columns.cuotas.length,
        columns.consumos.length,
        columns.comisiones.length,
        columns.impuestos.length,
        columns.importes.length,
    ].every((len) => len === columns.servicios.length)) {
        diagnostics.push({
            level: "warn",
            code: "services-columnar-mismatch",
            message: `Las columnas de servicios no tienen el mismo largo (${columns.servicios.length}/${columns.cuotas.length}/${columns.consumos.length}/${columns.comisiones.length}/${columns.impuestos.length}/${columns.importes.length}). Se completaron faltantes con 0.00.`,
        });
    }
    const result = [];
    const seen = new Set();
    for (let i = 0; i < max; i += 1) {
        const numero = (columns.servicios[i] || "").replace(/\D/g, "");
        if (!isServiceNumber(numero) || seen.has(numero))
            continue;
        seen.add(numero);
        result.push({
            numero,
            cuota: amountValue(columns.cuotas[i] || "0"),
            consumo: amountValue(columns.consumos[i] || "0"),
            comision: amountValue(columns.comisiones[i] || "0"),
            impuesto: amountValue(columns.impuestos[i] || "0"),
            importe: amountValue(columns.importes[i] || "0"),
        });
    }
    return result;
}
function parseRowSection(sectionLines, diagnostics) {
    const result = [];
    const seen = new Set();
    for (const line of sectionLines) {
        const parsed = parseRowLikeLine(line);
        if (!parsed)
            continue;
        if (seen.has(parsed.numero))
            continue;
        seen.add(parsed.numero);
        result.push(parsed);
    }
    if (result.length === 0) {
        diagnostics.push({ level: "warn", code: "services-row-not-found", message: "No se encontraron filas completas de servicios en formato horizontal." });
    }
    return result;
}
function sumServices(services) {
    return services.reduce((acc, item) => ({
        cuota: acc.cuota + normalizarNumero(item.cuota),
        consumo: acc.consumo + normalizarNumero(item.consumo),
        comision: acc.comision + normalizarNumero(item.comision),
        impuesto: acc.impuesto + normalizarNumero(item.impuesto),
        importe: acc.importe + normalizarNumero(item.importe),
    }), { cuota: 0, consumo: 0, comision: 0, impuesto: 0, importe: 0 });
}
function scoreServices(services) {
    const nonZero = services.reduce((acc, item) => acc + [item.cuota, item.consumo, item.comision, item.impuesto, item.importe].filter((v) => normalizarNumero(v) > 0).length, 0);
    const withImporte = services.filter((item) => normalizarNumero(item.importe) >= 0).length;
    return services.length * 10 + nonZero * 2 + withImporte;
}
function chooseBestServices(sectionLines, diagnostics) {
    const columnarDiagnostics = [];
    const rowDiagnostics = [];
    const columnar = parseColumnarSection(sectionLines, columnarDiagnostics);
    const rowBased = parseRowSection(sectionLines, rowDiagnostics);
    const best = scoreServices(columnar) >= scoreServices(rowBased)
        ? { services: columnar, strategy: "columnar", extraDiagnostics: columnarDiagnostics, altDiagnostics: rowDiagnostics }
        : { services: rowBased, strategy: "rows", extraDiagnostics: rowDiagnostics, altDiagnostics: columnarDiagnostics };
    diagnostics.push(...best.extraDiagnostics);
    diagnostics.push({ level: "info", code: "services-strategy", message: `Estrategia de servicios aplicada: ${best.strategy}. Servicios detectados: ${best.services.length}.` });
    if (best.services.length === 0) {
        diagnostics.push({ level: "error", code: "services-empty", message: "No se pudo detectar ningun servicio en la factura." });
    }
    return { services: best.services, strategy: best.strategy };
}
function parseHeaderTotals(lines) {
    for (let i = 0; i < lines.length; i += 1) {
        const values = cleanLine(lines[i]).match(/[\d.,-]+/g) || [];
        if (values.length >= 7 && values.slice(0, 7).every((v) => moneyLikeToken(v))) {
            return {
                cuota: formatearNumero(normalizarNumero(values[0] || "0")),
                consumo: formatearNumero(normalizarNumero(values[1] || "0")),
                comision: formatearNumero(normalizarNumero(values[2] || "0")),
                impuesto: formatearNumero(normalizarNumero(values[3] || "0")),
                facturado: formatearNumero(normalizarNumero(values[4] || "0")),
                estadoCuenta: formatearNumero(normalizarNumero(values[5] || "0")),
                totalPagar: formatearNumero(normalizarNumero(values[6] || "0")),
                source: `header-line-${i + 1}`,
            };
        }
    }
    return null;
}
function parseServiceSummaryTotal(sectionLines) {
    const totalLine = sectionLines.find((line) => normalizedLine(line).startsWith("total ") || normalizedLine(line) === "total");
    if (!totalLine)
        return null;
    const values = cleanLine(totalLine).match(/[\d.,-]+/g) || [];
    if (values.length < 5 || !values.slice(0, 5).every((v) => moneyLikeToken(v)))
        return null;
    return {
        cuota: formatearNumero(normalizarNumero(values[0] || "0")),
        consumo: formatearNumero(normalizarNumero(values[1] || "0")),
        comision: formatearNumero(normalizarNumero(values[2] || "0")),
        impuesto: formatearNumero(normalizarNumero(values[3] || "0")),
        totalServicios: formatearNumero(normalizarNumero(values[4] || "0")),
        source: "service-summary-total",
    };
}
function parseDiscount(lines) {
    const descuentoLine = lines.find((line) => normalizedLine(line).includes("descuento comercial"));
    const totalCuentaLine = lines.find((line) => normalizedLine(line).includes("total a la cuenta"));
    const descuento = descuentoLine ? Math.abs(normalizarNumero((descuentoLine.match(/[\d.,-]+/g) || []).at(-1) || "0")) : 0;
    const totalCuenta = totalCuentaLine ? Math.abs(normalizarNumero((totalCuentaLine.match(/[\d.,-]+/g) || []).at(-1) || "0")) : 0;
    return Math.max(descuento, totalCuenta, 0);
}
function chooseTotals(lines, services, diagnostics) {
    const serviceSum = sumServices(services);
    const header = parseHeaderTotals(lines);
    const summary = parseServiceSummaryTotal(lines);
    const descuento = parseDiscount(lines);
    let chosen = {
        cuota: formatearNumero(serviceSum.cuota),
        consumo: formatearNumero(serviceSum.consumo),
        comision: formatearNumero(serviceSum.comision),
        impuesto: formatearNumero(serviceSum.impuesto),
        facturado: formatearNumero(serviceSum.importe),
        estadoCuenta: "0.00",
        totalPagar: formatearNumero(serviceSum.importe),
        totalServicios: formatearNumero(serviceSum.importe),
        descuento: formatearNumero(descuento),
    };
    let strategy = "service-sum";
    if (header) {
        chosen = {
            ...chosen,
            cuota: header.cuota,
            consumo: header.consumo,
            comision: header.comision,
            impuesto: header.impuesto,
            facturado: header.facturado,
            estadoCuenta: header.estadoCuenta,
            totalPagar: header.totalPagar,
        };
        strategy = header.source;
    }
    if (summary) {
        chosen.totalServicios = summary.totalServicios;
        if (!header) {
            chosen.cuota = summary.cuota;
            chosen.consumo = summary.consumo;
            chosen.comision = summary.comision;
            chosen.impuesto = summary.impuesto;
            chosen.facturado = summary.totalServicios;
            chosen.totalPagar = formatearNumero(Math.max(normalizarNumero(summary.totalServicios) - descuento, 0));
            strategy = summary.source;
        }
    }
    if (descuento > 0) {
        chosen.descuento = formatearNumero(descuento);
        if (!header) {
            chosen.totalPagar = formatearNumero(Math.max(normalizarNumero(chosen.facturado) - descuento, 0));
        }
    }
    const headerVsServices = Math.abs(normalizarNumero(chosen.totalServicios) - serviceSum.importe);
    if (headerVsServices > 1) {
        diagnostics.push({
            level: "warn",
            code: "totals-mismatch-services",
            message: `La suma de servicios (${serviceSum.importe.toFixed(2)}) no coincide exactamente con el total resumido (${normalizarNumero(chosen.totalServicios).toFixed(2)}).`,
        });
    }
    const facturadoNumero = normalizarNumero(chosen.facturado);
    const expectedFacturadoFromServices = serviceSum.importe;
    const facturadoVsServicios = Math.abs(facturadoNumero - expectedFacturadoFromServices);
    const descuentoExplicaDiferencia = descuento > 0 && Math.abs(facturadoVsServicios - descuento) <= 1;
    if (facturadoVsServicios > 1 && serviceSum.importe > 0 && !descuentoExplicaDiferencia) {
        diagnostics.push({
            level: "warn",
            code: "facturado-mismatch-services",
            message: `El total facturado (${facturadoNumero.toFixed(2)}) no coincide con la suma de importes de servicios (${serviceSum.importe.toFixed(2)}).`,
        });
    }
    const expectedPayableFromServices = Math.max(normalizarNumero(chosen.totalServicios) - descuento, 0);
    const payableDiff = Math.abs(normalizarNumero(chosen.totalPagar) - expectedPayableFromServices);
    if (payableDiff > 1 && normalizarNumero(chosen.totalPagar) > 0) {
        diagnostics.push({
            level: "warn",
            code: "total-pagar-mismatch-discount",
            message: `El total a pagar (${normalizarNumero(chosen.totalPagar).toFixed(2)}) no cuadra con total servicios menos descuento (${expectedPayableFromServices.toFixed(2)}).`,
        });
    }
    diagnostics.push({ level: "info", code: "totals-strategy", message: `Estrategia de totales aplicada: ${strategy}.` });
    return { totals: chosen, strategy };
}
function computeReviewState(data, confidence) {
    const errors = data.diagnostics.filter((item) => item.level === "error").length;
    const warns = data.diagnostics.filter((item) => item.level === "warn").length;
    const missingCritical = [data.cliente, data.noFactura, data.numeroCuenta, data.codigoPago].filter((v) => !v).length;
    if (errors > 0 || data.servicios.length === 0 || confidence < 70 || missingCritical >= 2) {
        return {
            reviewStatus: "doubtful",
            reviewLabel: "Extraccion dudosa",
            requiresReview: true,
        };
    }
    if (warns > 0 || confidence < 92 || missingCritical > 0) {
        return {
            reviewStatus: "review",
            reviewLabel: "Revisar manualmente",
            requiresReview: true,
        };
    }
    return {
        reviewStatus: "high",
        reviewLabel: "Alta confianza",
        requiresReview: false,
    };
}
function computeConfidence(factura) {
    let score = 30;
    if (factura.cliente)
        score += 10;
    if (factura.noFactura)
        score += 10;
    if (factura.numeroCliente)
        score += 6;
    if (factura.numeroCuenta)
        score += 6;
    if (factura.fechaEmision)
        score += 4;
    if (factura.fechaVencimiento)
        score += 4;
    if (factura.periodoConsumo)
        score += 5;
    if (factura.codigoPago)
        score += 7;
    if (factura.nit)
        score += 5;
    score += Math.min(factura.servicios.length, 25);
    if (normalizarNumero(factura.totales.totalPagar) > 0)
        score += 6;
    score -= factura.diagnostics.filter((item) => item.level === "warn").length * 3;
    score -= factura.diagnostics.filter((item) => item.level === "error").length * 8;
    return Math.max(1, Math.min(99, score));
}
export function parseFacturaEtcsa(text) {
    const diagnostics = [];
    const lines = getLines(text);
    const headerSection = getHeaderSection(lines);
    const serviceSection = getServiceSection(lines);
    if (!headerSection)
        diagnostics.push({ level: "error", code: "header-empty", message: "No se pudo detectar la cabecera de la factura." });
    if (!serviceSection.length)
        diagnostics.push({ level: "warn", code: "service-section-empty", message: "No se detecto claramente la seccion 'Resumen por Servicios'." });
    const normalizedHeader = stripAccents(headerSection);
    const cliente = firstMatch(headerSection, [
        /cliente\s*:\s*([^\n]+?)(?=\s+cuenta\s*:|$)/i,
        /cliente\s*:\s*([^\n]+)/i,
    ]);
    const cuenta = firstMatch(headerSection, [
        /cuenta\s*:\s*([^\n]+?)(?=\s+numero\s+de\s+cliente|$)/i,
        /cuenta\s*:\s*([^\n]+)/i,
    ]) || cliente;
    const direccion = firstMatch(headerSection, [
        /direccion\s*:\s*([^\n]+)/i,
        /(CARRET\s+CTRAL[^\n]*)/i,
    ]);
    const numeroCliente = firstMatch(normalizedHeader, [
        /numero\s+de\s+cliente\s*:?\s*(\d{5,})/i,
        /no\.?\s*cliente\s*:?\s*(\d{5,})/i,
    ]);
    const numeroCuenta = firstMatch(normalizedHeader, [
        /numero\s+de\s+cuenta\s*:?\s*(\d{5,})/i,
        /no\.?\s*cuenta\s*:?\s*(\d{5,})/i,
    ]);
    const noFactura = firstMatch(normalizedHeader, [
        /no\.?\s*factura\s*:?\s*(\d{6,})/i,
        /factura\s*:?\s*(\d{6,})/i,
    ]);
    const fechaEmision = firstMatch(normalizedHeader, [
        /fecha\s+factura\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        /fecha\s+emision\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    ]);
    const fechaVencimiento = firstMatch(normalizedHeader, [
        /fecha\s+de\s+vencimiento\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        /fecha\s+vencimiento\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
        /fech\s*a\s+de\s+vencimiento\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
    ]);
    const periodoMatch = normalizedHeader.match(/periodo\s+de\s+consumo\s*:?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*[–-]\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    const periodoConsumo = periodoMatch ? `${periodoMatch[1]} - ${periodoMatch[2]}` : "";
    const codigoPago = firstMatch(normalizedHeader, [
        /codigo\s+de\s+pago\s+en\s+banco\s*:?\s*([\d\s-]{6,})/i,
        /codigo\s+de\s+pago\s*:?\s*([\d\s-]{6,})/i,
    ]).replace(/\D/g, "");
    const moneda = firstMatch(normalizedHeader, [/moneda\s*:?\s*(CUP|USD|CUC)/i]) || "CUP";
    const nit = firstMatch(normalizedHeader, [/nit\s*:?\s*(\d{8,})/i]);
    if (!cliente)
        diagnostics.push({ level: "warn", code: "field-cliente", message: "No se pudo extraer el cliente." });
    if (!numeroCliente)
        diagnostics.push({ level: "warn", code: "field-numero-cliente", message: "No se pudo extraer el numero de cliente." });
    if (!numeroCuenta)
        diagnostics.push({ level: "warn", code: "field-numero-cuenta", message: "No se pudo extraer el numero de cuenta." });
    if (!noFactura)
        diagnostics.push({ level: "warn", code: "field-no-factura", message: "No se pudo extraer el numero de factura." });
    if (!fechaEmision)
        diagnostics.push({ level: "warn", code: "field-fecha-emision", message: "No se pudo extraer la fecha de emision." });
    if (!fechaVencimiento)
        diagnostics.push({ level: "warn", code: "field-fecha-vencimiento", message: "No se pudo extraer la fecha de vencimiento." });
    if (!periodoConsumo)
        diagnostics.push({ level: "warn", code: "field-periodo", message: "No se pudo extraer el periodo de consumo." });
    if (!codigoPago)
        diagnostics.push({ level: "warn", code: "field-codigo-pago", message: "No se pudo extraer el codigo de pago." });
    if (!nit)
        diagnostics.push({ level: "warn", code: "field-nit", message: "No se pudo extraer el NIT." });
    const servicesResult = chooseBestServices(serviceSection, diagnostics);
    const totalsResult = chooseTotals(lines, servicesResult.services, diagnostics);
    const facturaBase = {
        cliente,
        cuenta,
        direccion,
        numeroCliente,
        numeroCuenta,
        noFactura,
        fechaEmision,
        fechaVencimiento,
        periodoConsumo,
        codigoPago,
        moneda,
        nit,
        servicios: servicesResult.services,
        totalPagar: totalsResult.totals.totalPagar,
        diagnostics,
        strategies: {
            services: servicesResult.strategy,
            totals: totalsResult.strategy,
        },
        totales: totalsResult.totals,
    };
    const confidence = computeConfidence(facturaBase);
    const review = computeReviewState(facturaBase, confidence);
    return {
        ...facturaBase,
        confidence,
        ...review,
    };
}
//# sourceMappingURL=factura-parser.js.map