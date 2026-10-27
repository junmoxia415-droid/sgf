export type Role = "admin" | "usuario";
export type InvoiceStatus = "procesado" | "pendiente" | "error";
export type LogLevel = "info" | "warn" | "error";
export interface User {
    id: string;
    username: string;
    name: string;
    role: Role;
    passwordHash: string;
    active: boolean;
    createdAt: string;
    updatedAt: string;
}
export type SessionUser = Omit<User, "passwordHash" | "updatedAt">;
export interface ServiceRow {
    id: string;
    facturaId: string;
    numeroServicio: string;
    cuota: number;
    consumo: number;
    comision: number;
    impuesto: number;
    importe: number;
}
export interface Invoice {
    id: string;
    cliente: string;
    cuenta: string;
    numeroCliente: string;
    numeroCuenta: string;
    noFactura: string;
    fechaEmision: string;
    fechaVencimiento: string;
    periodoConsumo: string;
    codigoPago: string;
    moneda: string;
    nit: string;
    cuota: number;
    consumo: number;
    comision: number;
    impuesto: number;
    total: number;
    totalPagar: number;
    estado: InvoiceStatus;
    parser: string;
    ocrConfidence: number;
    ocrDuration: number;
    archivo: string;
    userId: string;
    createdAt: string;
    updatedAt: string;
    servicios: ServiceRow[];
}
export interface AppLog {
    id: string;
    userId: string;
    accion: string;
    entidad: string;
    entidadId: string;
    level: LogLevel;
    detalles: string;
    ipAddress: string;
    createdAt: string;
}
