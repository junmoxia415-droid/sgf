/**
 * enriquecimiento.ts - Vincula los numeros de servicio de una factura con los
 * datos de la linea telefonica.
 *
 * Hasta ahora solo se consultaba PCELULAR.LINEA_TELEFONICA (Oracle), asi que en
 * SQLite / SQL Server, o en una instalacion donde el Excel es la unica fuente,
 * el resultado SIEMPRE era vacio: el Excel importado a SGF_LINEAS_IMPORTADAS
 * no se usaba para nada. Ahora:
 *
 *   1. Se intenta primero la fuente maestra (PCELULAR.* en Oracle).
 *   2. Lo que no aparezca alli (o si Oracle no esta disponible) se busca en
 *      SGF_LINEAS_IMPORTADAS, es decir, en el Excel que sube el usuario.
 *
 * Cada linea devuelta indica su origen en el campo FUENTE para que la interfaz
 * pueda distinguir los datos del sistema de los del Excel.
 */
export type FuenteLinea = "PCELULAR" | "EXCEL";
export interface LineaVinculada {
    NUMERO: string;
    NOMBRE?: string;
    APELL1?: string;
    APELL2?: string;
    NOMBRE_COMPLETO?: string;
    ORGANO?: string;
    UNIDAD?: string;
    PROVINCIA?: string;
    MUNICIPIO?: string;
    CARGO?: string;
    GRADO?: string;
    ESTADO?: string;
    MARCA?: string;
    MODELO?: string;
    IMEI?: string;
    IDENTID?: string;
    ACTUALIZADO?: string;
    FUENTE: FuenteLinea;
}
export interface ResultadoEnriquecimiento {
    fuente: FuenteLinea | "NINGUNA";
    total: number;
    encontradas: number;
    sinVincular: string[];
    lineas: LineaVinculada[];
}
/** Deja solo digitos: el Excel a veces trae espacios, guiones o "+". */
export declare function normalizarNumeroLinea(valor: unknown): string;
/**
 * Devuelve los datos de las lineas indicadas, con su origen.
 * Oracle tiene prioridad; el Excel cubre lo que falte.
 */
export declare function enriquecerLineasFactura(numeros: Array<string | undefined>, max?: number): Promise<ResultadoEnriquecimiento>;
/**
 * Busqueda libre de lineas (para el buscador de la interfaz). Devuelve primero
 * las de Oracle y luego las del Excel, sin duplicar numeros.
 */
export declare function buscarLineas(termino: string, limite?: number): Promise<{
    lineas: LineaVinculada[];
    fuentes: {
        pcelular: number;
        excel: number;
    };
}>;
