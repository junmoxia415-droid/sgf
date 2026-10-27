export interface ServicioExtraido {
    numero: string;
    cuota: string;
    consumo: string;
    comision: string;
    impuesto: string;
    importe: string;
}
export interface ParserDiagnostic {
    level: "info" | "warn" | "error";
    code: string;
    message: string;
}
export interface FacturaExtraida {
    cliente: string;
    cuenta: string;
    direccion: string;
    numeroCliente: string;
    numeroCuenta: string;
    noFactura: string;
    fechaEmision: string;
    fechaVencimiento: string;
    periodoConsumo: string;
    codigoPago: string;
    moneda: string;
    nit: string;
    servicios: ServicioExtraido[];
    totalPagar: string;
    confidence: number;
    reviewStatus: "high" | "review" | "doubtful";
    reviewLabel: string;
    requiresReview: boolean;
    diagnostics: ParserDiagnostic[];
    strategies: {
        services: string;
        totals: string;
    };
    totales: {
        cuota: string;
        consumo: string;
        comision: string;
        impuesto: string;
        facturado: string;
        estadoCuenta: string;
        totalPagar: string;
        totalServicios: string;
        descuento: string;
    };
}
export interface StoredParserMeta {
    confidence?: number;
    reviewStatus?: "high" | "review" | "doubtful";
    reviewLabel?: string;
    requiresReview?: boolean;
    diagnostics?: ParserDiagnostic[];
    strategies?: {
        services: string;
        totals: string;
    };
}
export declare function packStoredFacturaText(rawText: string, meta: StoredParserMeta): string;
export declare function unpackStoredFacturaText(value: string | null | undefined): {
    meta: StoredParserMeta | null;
    text: string;
};
export declare function normalizePdfText(text: string): string;
export declare function normalizarNumero(valor: string): number;
export declare function formatearNumero(valor: number): string;
export declare function parseFacturaEtcsa(text: string): FacturaExtraida;
