/** Cabecera del periodo: "AAAA-MM" a partir del texto que trae la factura. */
export declare function clavePeriodo(periodo: string | null | undefined): string;
/** Cuántas facturas por mes se esperan (configurable, 2 por defecto). */
export declare function facturasPorMesConfiguradas(): number;
/**
 * Qué parte del mes es esta factura (1 = primera, 2 = segunda…).
 *
 * - Si la factura lo dice en el texto ("PRIMERA QUINCENA", "PARTE 2 DE 3",
 *   "SEGUNDA QUINCENA") se usa eso.
 * - Si no lo dice, se cuenta cuántas facturas de ese periodo tiene ya el usuario y
 *   esta pasa a ser la siguiente.
 *
 * Devuelve también las repetidas: una misma factura subida dos veces acabaría
 * contando como "segunda parte" si no se mira el número de factura.
 */
export declare function calcularParteDelPeriodo(periodo: string, noFactura: string, userId: string): Promise<{
    parte: number;
    yaExiste: boolean;
    facturasDelPeriodo: number;
}>;
/** Crea las dos columnas nuevas si la base es antigua. Se llama en cada arranque. */
export declare function asegurarColumnasPeriodo(): Promise<void>;
/** Rellena PERIODO_CLAVE/PERIODO_PARTE en las facturas antiguas que no lo tengan. */
export declare function rellenarPeriodosAntiguos(): Promise<number>;
