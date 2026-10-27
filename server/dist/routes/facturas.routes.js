import { randomUUID } from "node:crypto";
import { execute, getDbMode, isOracleLegacyTablesAvailable, nowExpr, paginationExpr, query, transaction, } from "../models/database.js";
import { unpackStoredFacturaText } from "../utils/factura-parser.js";
import { sendJson, readJsonBody, requireAdmin } from "../middleware/auth.js";
import { auditLog } from "../middleware/logger.js";
function normalizeInvoice(row) {
    const estado = String(row?.ESTADO ?? row?.estado ?? "pendiente");
    const stored = unpackStoredFacturaText(row?.TEXTO_OCR ?? row?.texto_ocr ?? "");
    const confidence = Number(stored.meta?.confidence ?? row?.OCR_CONFIDENCE ?? row?.ocr_confidence ?? 0);
    const reviewStatus = stored.meta?.reviewStatus ?? (estado === "error" ? "doubtful" : estado === "pendiente" ? "review" : "high");
    const reviewLabel = stored.meta?.reviewLabel ?? (reviewStatus === "doubtful" ? "Extraccion dudosa" : reviewStatus === "review" ? "Revisar manualmente" : "Alta confianza");
    return {
        id: String(row?.ID ?? row?.id ?? ""),
        cliente: String(row?.CLIENTE ?? row?.cliente ?? ""),
        cuenta: String(row?.CUENTA ?? row?.cuenta ?? ""),
        numero_cliente: String(row?.NUMERO_CLIENTE ?? row?.numero_cliente ?? ""),
        numero_cuenta: String(row?.NUMERO_CUENTA ?? row?.numero_cuenta ?? ""),
        no_factura: String(row?.NO_FACTURA ?? row?.no_factura ?? ""),
        fecha_emision: String(row?.FECHA_EMISION ?? row?.fecha_emision ?? ""),
        fecha_vencimiento: String(row?.FECHA_VENCIMIENTO ?? row?.fecha_vencimiento ?? ""),
        periodo_consumo: String(row?.PERIODO_CONSUMO ?? row?.periodo_consumo ?? ""),
        codigo_pago: String(row?.CODIGO_PAGO ?? row?.codigo_pago ?? ""),
        moneda: String(row?.MONEDA ?? row?.moneda ?? "CUP"),
        nit: String(row?.NIT ?? row?.nit ?? ""),
        cuota: Number(row?.CUOTA ?? row?.cuota ?? 0),
        consumo: Number(row?.CONSUMO ?? row?.consumo ?? 0),
        comision: Number(row?.COMISION ?? row?.comision ?? 0),
        impuesto: Number(row?.IMPUESTO ?? row?.impuesto ?? 0),
        total: Number(row?.TOTAL ?? row?.total ?? 0),
        total_pagar: Number(row?.TOTAL_PAGAR ?? row?.total_pagar ?? 0),
        estado,
        parser: row?.PARSER ?? row?.parser,
        archivo: row?.ARCHIVO ?? row?.archivo,
        user_id: row?.USER_ID ?? row?.user_id,
        created_at: String(row?.CREATED_AT ?? row?.created_at ?? ""),
        updated_at: String(row?.UPDATED_AT ?? row?.updated_at ?? ""),
        confidence,
        reviewStatus,
        reviewLabel,
        requiresReview: stored.meta?.requiresReview ?? reviewStatus !== "high",
        diagnostics: stored.meta?.diagnostics,
        estrategias: stored.meta?.strategies,
        servicios_count: row?.SERVICIOS_COUNT !== undefined || row?.servicios_count !== undefined
            ? Number(row?.SERVICIOS_COUNT ?? row?.servicios_count ?? 0)
            : undefined,
    };
}
function normalizeService(row) {
    return {
        id: String(row?.ID ?? row?.id ?? ""),
        factura_id: String(row?.FACTURA_ID ?? row?.factura_id ?? ""),
        numero_servicio: String(row?.NUMERO_SERVICIO ?? row?.numero_servicio ?? ""),
        cuota: Number(row?.CUOTA ?? row?.cuota ?? 0),
        consumo: Number(row?.CONSUMO ?? row?.consumo ?? 0),
        comision: Number(row?.COMISION ?? row?.comision ?? 0),
        impuesto: Number(row?.IMPUESTO ?? row?.impuesto ?? 0),
        importe: Number(row?.IMPORTE ?? row?.importe ?? 0),
    };
}
function buildFilters(req, url) {
    const search = (url.searchParams.get("search") || "").trim();
    const estado = (url.searchParams.get("estado") || "").trim();
    const clauses = [];
    const params = {};
    if (req.currentUser?.role !== "admin") {
        clauses.push(`f.USER_ID = :uid`);
        params.uid = req.currentUser?.id;
    }
    if (search) {
        clauses.push(`(
      UPPER(f.CLIENTE) LIKE :s OR
      UPPER(f.NO_FACTURA) LIKE :s OR
      UPPER(f.NUMERO_CLIENTE) LIKE :s OR
      UPPER(f.NUMERO_CUENTA) LIKE :s OR
      UPPER(f.CODIGO_PAGO) LIKE :s
    )`);
        params.s = `%${search.toUpperCase()}%`;
    }
    if (estado === "review") {
        clauses.push(`f.ESTADO IN ('pendiente', 'error')`);
    }
    else if (["procesado", "pendiente", "error"].includes(estado)) {
        clauses.push(`f.ESTADO = :estado`);
        params.estado = estado;
    }
    return {
        where: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
        params,
    };
}
function pick(body, key) {
    const camel = key.replace(/_(.)/g, (_, c) => c.toUpperCase());
    const pascal = key.toUpperCase();
    return [body[key], body[camel], body[pascal]].find((value) => value !== undefined);
}
function asNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
}
function normalizeIncomingServices(body) {
    const incoming = Array.isArray(body.servicios) ? body.servicios : [];
    return incoming
        .map((item) => ({
        numero_servicio: String(item?.numero_servicio ?? item?.numeroServicio ?? item?.numero ?? "").trim(),
        cuota: asNumber(item?.cuota),
        consumo: asNumber(item?.consumo),
        comision: asNumber(item?.comision),
        impuesto: asNumber(item?.impuesto),
        importe: asNumber(item?.importe),
    }))
        .filter((item) => item.numero_servicio);
}
async function syncCargararch(noFactura, cliente, servicios) {
    if (!servicios.length)
        return;
    if (!isOracleLegacyTablesAvailable())
        return;
    const tira = `Factura ${noFactura || "SIN-NO-FACTURA"} - ${(cliente || "Cliente").slice(0, 40)}`;
    const fechaExpr = nowExpr();
    for (const servicio of servicios) {
        await execute(`INSERT INTO PCELULAR.CARGARARCH (NUMERO, CUOTA, CONSUMO, COMISION, IMPUESTO, IMPORTE, TIRA, FECHA_PARTE)
       VALUES (:n, :c, :cs, :cm, :im, :ip, :t, ${fechaExpr})`, {
            n: servicio.numero_servicio,
            c: servicio.cuota.toFixed(2),
            cs: servicio.consumo.toFixed(2),
            cm: servicio.comision.toFixed(2),
            im: servicio.impuesto.toFixed(2),
            ip: servicio.importe.toFixed(2),
            t: tira,
        });
    }
}
export async function handleGetFacturas(req, res, url) {
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 15));
    const { where, params } = buildFilters(req, url);
    const offset = (page - 1) * pageSize;
    try {
        const countRows = await query(`SELECT COUNT(*) AS CNT FROM SGF_FACTURAS f ${where}`, params);
        const total = Number(countRows[0]?.CNT || 0);
        const sql = `SELECT f.*, (SELECT COUNT(*) FROM SGF_SERVICIOS s WHERE s.FACTURA_ID = f.ID) AS SERVICIOS_COUNT
         FROM SGF_FACTURAS f ${where}
         ORDER BY f.CREATED_AT DESC
         ${paginationExpr("off", "lim")}`;
        const rows = await query(sql, { ...params, off: offset, lim: pageSize });
        return sendJson(res, 200, {
            success: true,
            data: rows.map(normalizeInvoice),
            meta: { total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), dbMode: getDbMode() },
        });
    }
    catch (error) {
        return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
    }
}
export async function handleGetFactura(req, res, facturaId) {
    try {
        const rows = await query(`SELECT * FROM SGF_FACTURAS WHERE ID = :id`, { id: facturaId });
        if (rows.length === 0)
            return sendJson(res, 404, { success: false, error: "Factura no encontrada." });
        const factura = normalizeInvoice(rows[0]);
        if (req.currentUser?.role !== "admin" && factura.user_id !== req.currentUser?.id) {
            return sendJson(res, 403, { success: false, error: "Sin permiso para ver esta factura." });
        }
        const servicios = await query(`SELECT * FROM SGF_SERVICIOS WHERE FACTURA_ID = :id ORDER BY NUMERO_SERVICIO`, { id: facturaId });
        return sendJson(res, 200, {
            success: true,
            data: {
                ...factura,
                servicios: servicios.map(normalizeService),
            },
        });
    }
    catch (error) {
        return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
    }
}
export async function handleCreateFactura(req, res) {
    let body;
    try {
        body = await readJsonBody(req, 5 * 1024 * 1024);
    }
    catch {
        return sendJson(res, 400, { success: false, error: "JSON invalido." });
    }
    const userId = req.currentUser?.id || "";
    const facturaId = randomUUID();
    const servicios = normalizeIncomingServices(body);
    try {
        const now = nowExpr();
        await transaction(async () => {
            await execute(`INSERT INTO SGF_FACTURAS (
          ID, CLIENTE, CUENTA, NUMERO_CLIENTE, NUMERO_CUENTA, NO_FACTURA,
          FECHA_EMISION, FECHA_VENCIMIENTO, PERIODO_CONSUMO, CODIGO_PAGO,
          MONEDA, NIT, CUOTA, CONSUMO, COMISION, IMPUESTO, TOTAL, TOTAL_PAGAR,
          ESTADO, PARSER, OCR_CONFIDENCE, OCR_DURATION, ARCHIVO, TEXTO_OCR, USER_ID, CREATED_AT, UPDATED_AT
        ) VALUES (
          :id, :cliente, :cuenta, :numeroCliente, :numeroCuenta, :noFactura,
          :fechaEmision, :fechaVencimiento, :periodoConsumo, :codigoPago,
          :moneda, :nit, :cuota, :consumo, :comision, :impuesto, :total, :totalPagar,
          :estado, :parser, :ocrConfidence, :ocrDuration, :archivo, :textoOcr, :userId,
          ${now}, ${now}
        )`, {
                id: facturaId,
                cliente: String(body.cliente || ""),
                cuenta: String(body.cuenta || ""),
                numeroCliente: String(body.numeroCliente || body.numero_cliente || ""),
                numeroCuenta: String(body.numeroCuenta || body.numero_cuenta || ""),
                noFactura: String(body.noFactura || body.no_factura || ""),
                fechaEmision: String(body.fechaEmision || body.fecha_emision || ""),
                fechaVencimiento: String(body.fechaVencimiento || body.fecha_vencimiento || ""),
                periodoConsumo: String(body.periodoConsumo || body.periodo_consumo || ""),
                codigoPago: String(body.codigoPago || body.codigo_pago || ""),
                moneda: String(body.moneda || "CUP"),
                nit: String(body.nit || ""),
                cuota: asNumber(body.cuota),
                consumo: asNumber(body.consumo),
                comision: asNumber(body.comision),
                impuesto: asNumber(body.impuesto),
                total: asNumber(body.total || body.totalPagar || body.total_pagar),
                totalPagar: asNumber(body.totalPagar || body.total_pagar),
                estado: String(body.estado || "pendiente"),
                parser: String(body.parser || "manual"),
                ocrConfidence: asNumber(body.ocrConfidence),
                ocrDuration: asNumber(body.ocrDuration),
                archivo: String(body.archivo || "manual"),
                textoOcr: String(body.textoOcr || ""),
                userId,
            });
            for (const item of servicios) {
                await execute(`INSERT INTO SGF_SERVICIOS (ID, FACTURA_ID, NUMERO_SERVICIO, CUOTA, CONSUMO, COMISION, IMPUESTO, IMPORTE)
           VALUES (:id, :facturaId, :numero, :cuota, :consumo, :comision, :impuesto, :importe)`, {
                    id: randomUUID(),
                    facturaId,
                    numero: item.numero_servicio,
                    cuota: item.cuota,
                    consumo: item.consumo,
                    comision: item.comision,
                    impuesto: item.impuesto,
                    importe: item.importe,
                });
            }
            if (servicios.length) {
                await syncCargararch(String(body.noFactura || body.no_factura || ""), String(body.cliente || ""), servicios);
            }
        });
        await auditLog(req, "crear_factura", "factura", facturaId, "info", `Factura ${body.noFactura || facturaId}`);
        return sendJson(res, 201, { success: true, message: "Factura creada.", data: { id: facturaId } });
    }
    catch (error) {
        return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
    }
}
export async function handleUpdateFactura(req, res, facturaId) {
    if (!requireAdmin(req, res))
        return;
    let body;
    try {
        body = await readJsonBody(req, 5 * 1024 * 1024);
    }
    catch {
        return sendJson(res, 400, { success: false, error: "JSON invalido." });
    }
    try {
        const currentRows = await query(`SELECT * FROM SGF_FACTURAS WHERE ID = :id`, { id: facturaId });
        if (currentRows.length === 0)
            return sendJson(res, 404, { success: false, error: "Factura no encontrada." });
        const current = normalizeInvoice(currentRows[0]);
        const servicios = normalizeIncomingServices(body);
        const cuotaServicios = servicios.reduce((sum, item) => sum + item.cuota, 0);
        const consumoServicios = servicios.reduce((sum, item) => sum + item.consumo, 0);
        const comisionServicios = servicios.reduce((sum, item) => sum + item.comision, 0);
        const impuestoServicios = servicios.reduce((sum, item) => sum + item.impuesto, 0);
        const importeServicios = servicios.reduce((sum, item) => sum + item.importe, 0);
        const updated = {
            cliente: String(pick(body, "cliente") ?? current.cliente),
            cuenta: String(pick(body, "cuenta") ?? current.cuenta),
            numero_cliente: String(pick(body, "numero_cliente") ?? current.numero_cliente),
            numero_cuenta: String(pick(body, "numero_cuenta") ?? current.numero_cuenta),
            no_factura: String(pick(body, "no_factura") ?? current.no_factura),
            fecha_emision: String(pick(body, "fecha_emision") ?? current.fecha_emision),
            fecha_vencimiento: String(pick(body, "fecha_vencimiento") ?? current.fecha_vencimiento),
            periodo_consumo: String(pick(body, "periodo_consumo") ?? current.periodo_consumo),
            codigo_pago: String(pick(body, "codigo_pago") ?? current.codigo_pago),
            moneda: String(pick(body, "moneda") ?? current.moneda),
            nit: String(pick(body, "nit") ?? current.nit),
            estado: String(pick(body, "estado") ?? current.estado),
            archivo: String(pick(body, "archivo") ?? current.archivo ?? ""),
            cuota: pick(body, "cuota") !== undefined ? asNumber(pick(body, "cuota")) : (servicios.length ? cuotaServicios : current.cuota),
            consumo: pick(body, "consumo") !== undefined ? asNumber(pick(body, "consumo")) : (servicios.length ? consumoServicios : current.consumo),
            comision: pick(body, "comision") !== undefined ? asNumber(pick(body, "comision")) : (servicios.length ? comisionServicios : current.comision),
            impuesto: pick(body, "impuesto") !== undefined ? asNumber(pick(body, "impuesto")) : (servicios.length ? impuestoServicios : current.impuesto),
            total: pick(body, "total") !== undefined ? asNumber(pick(body, "total")) : (servicios.length ? importeServicios : current.total),
            total_pagar: pick(body, "total_pagar") !== undefined ? asNumber(pick(body, "total_pagar")) : pick(body, "totalPagar") !== undefined ? asNumber(pick(body, "totalPagar")) : (servicios.length ? importeServicios : current.total_pagar),
        };
        await transaction(async () => {
            await execute(`UPDATE SGF_FACTURAS SET
          CLIENTE = :cliente,
          CUENTA = :cuenta,
          NUMERO_CLIENTE = :numero_cliente,
          NUMERO_CUENTA = :numero_cuenta,
          NO_FACTURA = :no_factura,
          FECHA_EMISION = :fecha_emision,
          FECHA_VENCIMIENTO = :fecha_vencimiento,
          PERIODO_CONSUMO = :periodo_consumo,
          CODIGO_PAGO = :codigo_pago,
          MONEDA = :moneda,
          NIT = :nit,
          CUOTA = :cuota,
          CONSUMO = :consumo,
          COMISION = :comision,
          IMPUESTO = :impuesto,
          TOTAL = :total,
          TOTAL_PAGAR = :total_pagar,
          ESTADO = :estado,
          ARCHIVO = :archivo,
          UPDATED_AT = ${nowExpr()}
         WHERE ID = :id`, {
                id: facturaId,
                ...updated,
            });
            if (servicios.length) {
                await execute(`DELETE FROM SGF_SERVICIOS WHERE FACTURA_ID = :id`, { id: facturaId });
                for (const servicio of servicios) {
                    await execute(`INSERT INTO SGF_SERVICIOS (ID, FACTURA_ID, NUMERO_SERVICIO, CUOTA, CONSUMO, COMISION, IMPUESTO, IMPORTE)
             VALUES (:id, :facturaId, :numero, :cuota, :consumo, :comision, :impuesto, :importe)`, {
                        id: randomUUID(),
                        facturaId,
                        numero: servicio.numero_servicio,
                        cuota: servicio.cuota,
                        consumo: servicio.consumo,
                        comision: servicio.comision,
                        impuesto: servicio.impuesto,
                        importe: servicio.importe,
                    });
                }
            }
            if (current.no_factura) {
                await execute(`DELETE FROM PCELULAR.CARGARARCH WHERE TIRA LIKE :t`, { t: `Factura ${current.no_factura}%` });
            }
            if (servicios.length) {
                await syncCargararch(updated.no_factura, updated.cliente, servicios);
            }
        });
        await auditLog(req, "editar_factura", "factura", facturaId, "info", `Factura ${updated.no_factura || facturaId} actualizada.`);
        return sendJson(res, 200, { success: true, message: "Factura actualizada." });
    }
    catch (error) {
        return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
    }
}
export async function handleDeleteFactura(req, res, facturaId) {
    if (!requireAdmin(req, res))
        return;
    try {
        const rows = await query(`SELECT ID, NO_FACTURA FROM SGF_FACTURAS WHERE ID = :id`, { id: facturaId });
        if (rows.length === 0)
            return sendJson(res, 404, { success: false, error: "Factura no encontrada." });
        const noFactura = String(rows[0]?.NO_FACTURA ?? rows[0]?.no_factura ?? "");
        await execute(`DELETE FROM SGF_SERVICIOS WHERE FACTURA_ID = :id`, { id: facturaId });
        await execute(`DELETE FROM SGF_FACTURAS WHERE ID = :id`, { id: facturaId });
        if (noFactura && isOracleLegacyTablesAvailable()) {
            try {
                await execute(`DELETE FROM PCELULAR.CARGARARCH WHERE TIRA LIKE :t`, { t: `Factura ${noFactura}%` });
            }
            catch (error) {
                console.warn(`[SGF] No se pudo limpiar PCELULAR.CARGARARCH: ${error.message}`);
            }
        }
        await auditLog(req, "eliminar_factura", "factura", facturaId, "warn", `Factura ${noFactura || facturaId} eliminada.`);
        return sendJson(res, 200, { success: true, message: "Factura eliminada." });
    }
    catch (error) {
        return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
    }
}
export async function handleFacturaStats(req, res) {
    try {
        const totalQuery = `SELECT
            COUNT(*) AS TOTAL,
            SUM(TOTAL_PAGAR) AS MONTO_TOTAL,
            AVG(TOTAL_PAGAR) AS PROMEDIO,
            SUM(CASE WHEN ESTADO = 'procesado' THEN 1 ELSE 0 END) AS PROCESADAS,
            SUM(CASE WHEN ESTADO = 'pendiente' THEN 1 ELSE 0 END) AS PENDIENTES,
            SUM(CASE WHEN ESTADO = 'error' THEN 1 ELSE 0 END) AS ERRORES,
            MAX(CREATED_AT) AS ULTIMA_FECHA
         FROM SGF_FACTURAS`;
        const stats = await query(totalQuery);
        const services = await query(`SELECT COUNT(*) AS TOTAL_SERVICIOS FROM SGF_SERVICIOS`);
        return sendJson(res, 200, {
            success: true,
            data: {
                ...(stats[0] || {}),
                TOTAL_SERVICIOS: Number(services[0]?.TOTAL_SERVICIOS || services[0]?.total_servicios || 0),
            },
        });
    }
    catch (error) {
        return sendJson(res, 503, { success: false, error: `Error: ${error.message}` });
    }
}
//# sourceMappingURL=facturas.routes.js.map