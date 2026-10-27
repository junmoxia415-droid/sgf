import type {
  ApiResponse,
  AppLog,
  CargarArchRow,
  HealthData,
  InvoiceRecord,
  PaginationMeta,
  ServiceSearchResult,
  SessionUser,
  User,
} from "../types/api.ts";

const BASE = window.location.origin;
const TOKEN_KEY = "sgf_auth_token";
let token: string | null = null;

function emit(name: string, detail?: unknown) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function normalizeMeta(meta: ApiResponse["meta"]): PaginationMeta | undefined {
  if (!meta) return undefined;
  return {
    total: Number(meta.total ?? 0),
    page: Number(meta.page ?? 1),
    pageSize: Number(meta.pageSize ?? 0),
    totalPages: meta.totalPages !== undefined ? Number(meta.totalPages) : undefined,
    dbMode: meta.dbMode,
  };
}

function normalizeUser(row: any): User {
  return {
    id: String(row?.id ?? row?.ID ?? ""),
    username: String(row?.username ?? row?.USERNAME ?? ""),
    name: String(row?.name ?? row?.NAME ?? row?.nombre ?? row?.NOMBRE ?? ""),
    role: (row?.role ?? row?.ROLE ?? row?.rol ?? row?.ROL ?? "usuario") === "admin" ? "admin" : "usuario",
    active: Number(row?.active ?? row?.ACTIVE ?? row?.activo ?? row?.ACTIVO ?? 0),
    created_at: String(row?.created_at ?? row?.CREATED_AT ?? row?.creado ?? row?.CREADO ?? ""),
  };
}

function normalizeSessionUser(row: any): SessionUser {
  return {
    id: String(row?.id ?? row?.ID ?? ""),
    username: String(row?.username ?? row?.USERNAME ?? ""),
    name: String(row?.name ?? row?.NAME ?? row?.nombre ?? row?.NOMBRE ?? ""),
    role: (row?.role ?? row?.ROLE ?? row?.rol ?? row?.ROL ?? "usuario") === "admin" ? "admin" : "usuario",
    active: Boolean(row?.active ?? row?.ACTIVE ?? row?.activo ?? row?.ACTIVO ?? 0),
    createdAt: String(row?.createdAt ?? row?.created_at ?? row?.CREATED_AT ?? row?.creado ?? row?.CREADO ?? ""),
  };
}

function normalizeLog(row: any): AppLog {
  return {
    id: String(row?.id ?? row?.ID ?? ""),
    user_id: String(row?.user_id ?? row?.USER_ID ?? ""),
    accion: String(row?.accion ?? row?.ACCION ?? ""),
    entidad: String(row?.entidad ?? row?.ENTIDAD ?? ""),
    entidad_id: String(row?.entidad_id ?? row?.ENTIDAD_ID ?? ""),
    level: (row?.level ?? row?.LEVEL ?? row?.nivel ?? row?.NIVEL ?? "info") as AppLog["level"],
    detalles: String(row?.detalles ?? row?.DETALLES ?? ""),
    ip_address: String(row?.ip_address ?? row?.IP_ADDRESS ?? row?.ip ?? row?.IP ?? ""),
    created_at: String(row?.created_at ?? row?.CREATED_AT ?? row?.creado ?? row?.CREADO ?? ""),
  };
}

function normalizeService(row: any) {
  return {
    id: String(row?.id ?? row?.ID ?? ""),
    factura_id: String(row?.factura_id ?? row?.FACTURA_ID ?? ""),
    numero_servicio: String(row?.numero_servicio ?? row?.NUMERO_SERVICIO ?? ""),
    cuota: Number(row?.cuota ?? row?.CUOTA ?? 0),
    consumo: Number(row?.consumo ?? row?.CONSUMO ?? 0),
    comision: Number(row?.comision ?? row?.COMISION ?? 0),
    impuesto: Number(row?.impuesto ?? row?.IMPUESTO ?? 0),
    importe: Number(row?.importe ?? row?.IMPORTE ?? 0),
  };
}

function normalizeServiceSearch(row: any): ServiceSearchResult {
  return {
    service_id: String(row?.service_id ?? row?.SERVICE_ID ?? ""),
    factura_id: String(row?.factura_id ?? row?.FACTURA_ID ?? ""),
    numero_servicio: String(row?.numero_servicio ?? row?.NUMERO_SERVICIO ?? ""),
    cuota: Number(row?.cuota ?? row?.SERVICE_CUOTA ?? row?.CUOTA ?? 0),
    consumo: Number(row?.consumo ?? row?.SERVICE_CONSUMO ?? row?.CONSUMO ?? 0),
    comision: Number(row?.comision ?? row?.SERVICE_COMISION ?? row?.COMISION ?? 0),
    impuesto: Number(row?.impuesto ?? row?.SERVICE_IMPUESTO ?? row?.IMPUESTO ?? 0),
    importe: Number(row?.importe ?? row?.SERVICE_IMPORTE ?? row?.IMPORTE ?? 0),
    no_factura: String(row?.no_factura ?? row?.NO_FACTURA ?? ""),
    cliente: String(row?.cliente ?? row?.CLIENTE ?? ""),
    periodo_consumo: String(row?.periodo_consumo ?? row?.PERIODO_CONSUMO ?? ""),
    total_pagar: Number(row?.total_pagar ?? row?.TOTAL_PAGAR ?? 0),
    estado: (row?.estado ?? row?.ESTADO ?? "pendiente") as ServiceSearchResult["estado"],
    created_at: String(row?.created_at ?? row?.CREATED_AT ?? ""),
    confidence: row?.confidence !== undefined || row?.OCR_CONFIDENCE !== undefined ? Number(row?.confidence ?? row?.OCR_CONFIDENCE ?? 0) : undefined,
    reviewStatus: row?.reviewStatus ?? row?.review_status,
    reviewLabel: row?.reviewLabel ?? row?.review_label,
  };
}

function normalizeInvoice(row: any): InvoiceRecord {
  return {
    id: String(row?.id ?? row?.ID ?? ""),
    cliente: String(row?.cliente ?? row?.CLIENTE ?? ""),
    cuenta: String(row?.cuenta ?? row?.CUENTA ?? ""),
    numero_cliente: String(row?.numero_cliente ?? row?.NUMERO_CLIENTE ?? ""),
    numero_cuenta: String(row?.numero_cuenta ?? row?.NUMERO_CUENTA ?? ""),
    no_factura: String(row?.no_factura ?? row?.NO_FACTURA ?? ""),
    fecha_emision: String(row?.fecha_emision ?? row?.FECHA_EMISION ?? ""),
    fecha_vencimiento: String(row?.fecha_vencimiento ?? row?.FECHA_VENCIMIENTO ?? ""),
    periodo_consumo: String(row?.periodo_consumo ?? row?.PERIODO_CONSUMO ?? ""),
    codigo_pago: String(row?.codigo_pago ?? row?.CODIGO_PAGO ?? ""),
    moneda: String(row?.moneda ?? row?.MONEDA ?? "CUP"),
    nit: String(row?.nit ?? row?.NIT ?? ""),
    cuota: Number(row?.cuota ?? row?.CUOTA ?? 0),
    consumo: Number(row?.consumo ?? row?.CONSUMO ?? 0),
    comision: Number(row?.comision ?? row?.COMISION ?? 0),
    impuesto: Number(row?.impuesto ?? row?.IMPUESTO ?? 0),
    total: Number(row?.total ?? row?.TOTAL ?? 0),
    total_pagar: Number(row?.total_pagar ?? row?.TOTAL_PAGAR ?? 0),
    estado: (row?.estado ?? row?.ESTADO ?? "pendiente") as InvoiceRecord["estado"],
    parser: row?.parser ?? row?.PARSER,
    archivo: row?.archivo ?? row?.ARCHIVO,
    user_id: row?.user_id ?? row?.USER_ID,
    created_at: String(row?.created_at ?? row?.CREATED_AT ?? ""),
    updated_at: String(row?.updated_at ?? row?.UPDATED_AT ?? ""),
    servicios_count: row?.servicios_count !== undefined || row?.SERVICIOS_COUNT !== undefined ? Number(row?.servicios_count ?? row?.SERVICIOS_COUNT ?? 0) : undefined,
    servicios: Array.isArray(row?.servicios) ? row.servicios.map(normalizeService) : undefined,
    confidence: row?.confidence !== undefined || row?.OCR_CONFIDENCE !== undefined ? Number(row?.confidence ?? row?.OCR_CONFIDENCE ?? 0) : undefined,
    reviewStatus: row?.reviewStatus ?? row?.review_status,
    reviewLabel: row?.reviewLabel ?? row?.review_label,
    requiresReview: row?.requiresReview ?? row?.requires_review,
    diagnostics: Array.isArray(row?.diagnostics) ? row.diagnostics : undefined,
  };
}

function normalizeHealth(row: any): HealthData {
  return {
    service: String(row?.service ?? "SGF"),
    version: String(row?.version ?? "4.0.0"),
    status: String(row?.status ?? "online"),
    dbMode: row?.dbMode,
    db: row?.db,
    oracle: row?.oracle,
    instanceId: row?.instanceId,
    uptime: Number(row?.uptime ?? 0),
    memoryMB: Number(row?.memoryMB ?? 0),
  };
}

export function setAuthToken(next: string | null) {
  token = next;
  try {
    if (next) sessionStorage.setItem(TOKEN_KEY, next);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function getAuthToken() {
  if (token) return token;
  try {
    token = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    token = null;
  }
  return token;
}

async function req<T = unknown>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = {};
  const authToken = getAuthToken();
  if (authToken) headers.Authorization = `Bearer ${authToken}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  try {
    const response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (response.status === 204) {
      emit("sgf:server-online");
      return { success: true };
    }

    const payload = await response.json().catch(() => ({ success: response.ok }));

    if (response.ok) emit("sgf:server-online");

    if (response.status === 401) {
      setAuthToken(null);
      emit("sgf:session-expired");
    }

    return {
      success: Boolean(payload.success ?? response.ok),
      message: payload.message,
      error: payload.error,
      data: payload.data,
      meta: normalizeMeta(payload.meta),
    } as ApiResponse<T>;
  } catch (error: any) {
    if (error?.name === "TypeError") {
      emit("sgf:server-offline");
      setAuthToken(null);
      return { success: false, error: "Servidor no disponible." };
    }
    return { success: false, error: `Error: ${error?.message || "desconocido"}` };
  }
}

export async function healthCheck() {
  const response = await req<HealthData>("GET", "/api/health");
  if (response.success && response.data) response.data = normalizeHealth(response.data);
  return response;
}

export async function login(username: string, password: string, machineId: string) {
  const response = await req<{ user: SessionUser; token: string; sessionId: string }>("POST", "/api/auth/login", {
    username,
    password,
    machineId,
  });
  if (response.success && response.data) {
    response.data = { ...response.data, user: normalizeSessionUser((response.data as any).user) };
  }
  return response;
}

export async function logout() {
  const response = await req("POST", "/api/auth/logout");
  setAuthToken(null);
  return response;
}

export async function verifySession() {
  const response = await req<SessionUser>("GET", "/api/auth/me");
  if (response.success && response.data) response.data = normalizeSessionUser(response.data);
  return response;
}

export async function getFacturas(params: { page?: number; pageSize?: number; search?: string; estado?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.search) q.set("search", params.search);
  if (params.estado && params.estado !== "all") q.set("estado", params.estado);
  const response = await req<InvoiceRecord[]>("GET", `/api/facturas${q.toString() ? `?${q.toString()}` : ""}`);
  if (response.success && Array.isArray(response.data)) response.data = response.data.map(normalizeInvoice);
  return response;
}

export async function getFactura(id: string) {
  const response = await req<InvoiceRecord>("GET", `/api/facturas/${encodeURIComponent(id)}`);
  if (response.success && response.data) response.data = normalizeInvoice(response.data);
  return response;
}

export async function searchServicios(params: { numero?: string; page?: number; pageSize?: number } = {}) {
  const q = new URLSearchParams();
  if (params.numero) q.set("numero", params.numero);
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  const response = await req<ServiceSearchResult[]>("GET", `/api/services/search${q.toString() ? `?${q.toString()}` : ""}`);
  if (response.success && Array.isArray(response.data)) response.data = response.data.map(normalizeServiceSearch);
  return response;
}

export const createFactura = (data: unknown) => req("POST", "/api/facturas", data);
export const updateFactura = (id: string, data: unknown) => req("PUT", `/api/facturas/${encodeURIComponent(id)}`, data);
export const updateInvoice = updateFactura;
export const deleteFactura = (id: string) => req("DELETE", `/api/facturas/${encodeURIComponent(id)}`);
export const getFacturaStats = () => req<Record<string, unknown>>("GET", "/api/facturas/stats");
export const uploadFactura = (filename: string, base64: string, options?: { forceDuplicate?: boolean }) => req("POST", "/api/facturas/upload", { filename, file: base64, forceDuplicate: options?.forceDuplicate });

// --- Migracion desde SQLite local ---
export type SqliteMigrationInfo = {
  currentMode: string;
  sqlitePath: string;
  sqliteExists: boolean;
  sqliteInfo: { usuarios: number; sesiones: number; facturas: number; servicios: number; logs: number } | null;
};

export async function getMigrateStatus() {
  return req<SqliteMigrationInfo>("GET", "/api/db/migrate/status");
}

export async function migrateFromSqlite() {
  return req<{ copied: { usuarios: number; facturas: number; servicios: number; logs: number; sesiones: number }; errorCount: number }>(
    "POST",
    "/api/db/migrate/from-sqlite",
  );
}

export async function getUsers() {
  const response = await req<User[]>("GET", "/api/users");
  if (response.success && Array.isArray(response.data)) response.data = response.data.map(normalizeUser);
  return response;
}

export async function createUser(data: unknown) {
  const response = await req<User>("POST", "/api/users", data);
  if (response.success && response.data) response.data = normalizeUser(response.data);
  return response;
}

export const updateUser = (id: string, data: unknown) => req("PUT", `/api/users/${encodeURIComponent(id)}`, data);
export const deleteUser = (id: string) => req("DELETE", `/api/users/${encodeURIComponent(id)}`);

export async function getLogs(params: { page?: number; pageSize?: number; level?: string } = {}) {
  const q = new URLSearchParams();
  if (params.page) q.set("page", String(params.page));
  if (params.pageSize) q.set("pageSize", String(params.pageSize));
  if (params.level && params.level !== "all") q.set("level", params.level);
  const response = await req<AppLog[]>("GET", `/api/logs${q.toString() ? `?${q.toString()}` : ""}`);
  if (response.success && Array.isArray(response.data)) response.data = response.data.map(normalizeLog);
  return response;
}

export const clearLogs = () => req("DELETE", "/api/logs");
