export type Role = "admin" | "usuario";
export type LogLevel = "info" | "warn" | "error";
export type InvoiceStatus = "procesado" | "pendiente" | "error";

export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  active?: boolean;
  createdAt?: string;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: Role;
  active: number;
  created_at: string;
}

export interface CargarArchRow {
  NUMERO: string;
  CUOTA: string;
  CONSUMO: string;
  COMISION: string;
  IMPUESTO: string;
  IMPORTE: string;
  TIRA: string;
  FECHA_PARTE: string;
}

export interface ServiceRow {
  id?: string;
  factura_id?: string;
  numero_servicio: string;
  cuota: number;
  consumo: number;
  comision: number;
  impuesto: number;
  importe: number;
}

export interface ServiceSearchResult {
  service_id: string;
  factura_id: string;
  numero_servicio: string;
  cuota: number;
  consumo: number;
  comision: number;
  impuesto: number;
  importe: number;
  no_factura: string;
  cliente: string;
  periodo_consumo: string;
  total_pagar: number;
  estado: InvoiceStatus;
  created_at: string;
  confidence?: number;
  reviewStatus?: "high" | "review" | "doubtful";
  reviewLabel?: string;
}

export interface InvoiceRecord {
  id: string;
  cliente: string;
  cuenta: string;
  numero_cliente: string;
  numero_cuenta: string;
  no_factura: string;
  fecha_emision: string;
  fecha_vencimiento: string;
  periodo_consumo: string;
  codigo_pago: string;
  moneda: string;
  nit: string;
  cuota: number;
  consumo: number;
  comision: number;
  impuesto: number;
  total: number;
  total_pagar: number;
  estado: InvoiceStatus;
  parser?: string;
  archivo?: string;
  user_id?: string;
  created_at: string;
  updated_at?: string;
  servicios_count?: number;
  servicios?: ServiceRow[];
  confidence?: number;
  reviewStatus?: "high" | "review" | "doubtful";
  reviewLabel?: string;
  requiresReview?: boolean;
  diagnostics?: Array<{ level: "info" | "warn" | "error"; code: string; message: string }>;
}

export interface Invoice {
  id: string;
  cliente: string;
  cuenta: string;
  numero_cliente: string;
  numero_cuenta: string;
  no_factura: string;
  periodo_consumo: string;
  codigo_pago: string;
  total_pagar: number;
  moneda: string;
  estado: InvoiceStatus;
}

export interface AppLog {
  id: string;
  user_id: string;
  accion: string;
  entidad: string;
  entidad_id: string;
  level: LogLevel;
  detalles: string;
  ip_address: string;
  created_at: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
  dbMode?: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
  meta?: PaginationMeta;
}

export interface HealthData {
  service: string;
  version: string;
  status?: string;
  dbMode?: string;
  db?: { ok: boolean; msg: string; ms: number };
  oracle?: { ok: boolean; msg?: string; ms?: number };
  instanceId?: string;
  uptime: number;
  memoryMB: number;
}
