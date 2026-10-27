import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  CheckCircle2,
  Database,
  Plug,
  RefreshCcw,
  Server,
  XCircle,
  Database as DatabaseIcon,
  HardDrive,
  ArrowRightLeft,
} from "lucide-react";
import { getAuthToken } from "../api/client.ts";

type Props = {
  onClose: () => void;
  showToast: (t: "success" | "error" | "info", m: string) => void;
};

type DbType = "oracle" | "mssql" | "sqlite";

type TestResult = {
  success: boolean;
  message: string;
  data: {
    type?: DbType;
    host?: string;
    server?: string;
    port?: string;
    service?: string;
    database?: string;
    user?: string;
    latencyMs: number;
    tables: string[];
  };
};

type SqliteInfo = {
  usuarios: number;
  sesiones: number;
  facturas: number;
  servicios: number;
  logs: number;
};

export function DbConfigPanel({ onClose, showToast }: Props) {
  const [dbType, setDbType] = useState<DbType>("oracle");

  // Formularios por motor
  const [oracleForm, setOracleForm] = useState({ host: "25", port: "1521", service: "PCELULAR", user: "pcelular", password: "pcelular" });
  const [mssqlForm, setMssqlForm] = useState({ server: "localhost", port: "1433", database: "sgf", user: "sa", password: "", encrypt: false, trustServerCertificate: true });
  const [currentMode, setCurrentMode] = useState<DbType>("sqlite");
  const [currentDbType, setCurrentDbType] = useState<string>("");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [connecting, setConnecting] = useState(false);

  // Migracion
  const [migrateStatus, setMigrateStatus] = useState<SqliteInfo | null>(null);
  const [sqliteAvailable, setSqliteAvailable] = useState(false);
  const [migrating, setMigrating] = useState(false);

  useEffect(() => {
    void refreshConfig();
  }, []);

  async function refreshConfig() {
    try {
      const res = await fetch("/api/db/config", { headers: { Authorization: `Bearer ${getAuthToken()}` } });
      const data = await res.json();
      if (data.success) {
        setCurrentMode((data.data.mode || "sqlite") as DbType);
        setCurrentDbType(String(data.data.config?.dbType || ""));
        setOracleForm((prev) => ({
          ...prev,
          host: data.data.config.oracleHost || prev.host,
          port: data.data.config.oraclePort || prev.port,
          service: data.data.config.oracleService || prev.service,
          user: data.data.config.oracleUser || prev.user,
        }));
        setMssqlForm((prev) => ({
          ...prev,
          server: data.data.config.mssqlServer || prev.server,
          port: data.data.config.mssqlPort || prev.port,
          database: data.data.config.mssqlDatabase || prev.database,
          user: data.data.config.mssqlUser || prev.user,
          encrypt: data.data.config.mssqlEncrypt ?? prev.encrypt,
          trustServerCertificate: data.data.config.mssqlTrustCert ?? prev.trustServerCertificate,
        }));
      }
    } catch {
      // ignore
    }
    await refreshMigrate();
  }

  async function refreshMigrate() {
    try {
      const res = await fetch("/api/db/migrate/status", { headers: { Authorization: `Bearer ${getAuthToken()}` } });
      const data = await res.json();
      if (data.success) {
        setSqliteAvailable(Boolean(data.data.sqliteExists));
        if (data.data.sqliteInfo && typeof data.data.sqliteInfo.usuarios === "number") {
          setMigrateStatus(data.data.sqliteInfo);
        } else {
          setMigrateStatus(null);
        }
      }
    } catch {
      // ignore
    }
  }

  const testDb = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = dbType === "mssql" ? { type: "mssql", ...mssqlForm } : { type: "oracle", ...oracleForm };
      const res = await fetch("/api/db/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setTestResult(data);
      if (data.success) {
        showToast("success", `Conexion ${dbType.toUpperCase()} valida (${data.data.latencyMs ?? 0}ms).`);
      } else {
        showToast("error", data.message || "No se pudo validar la conexion.");
      }
    } catch (error: any) {
      showToast("error", error.message || "Error probando conexion.");
    }
    setTesting(false);
  };

  const connectDb = async () => {
    setConnecting(true);
    try {
      const payload = dbType === "mssql" ? { type: "mssql", ...mssqlForm } : { type: "oracle", ...oracleForm };
      const res = await fetch("/api/db/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken()}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message || "Conexion aplicada. Debe iniciar sesion nuevamente.");
        onClose();
        window.dispatchEvent(new CustomEvent("sgf:session-expired"));
        window.setTimeout(() => window.location.reload(), 500);
      } else {
        showToast("error", data.error || data.message || "No se pudo conectar.");
      }
    } catch (error: any) {
      showToast("error", error.message || `Error conectando a ${dbType.toUpperCase()}.`);
    }
    setConnecting(false);
  };

  const migrate = async () => {
    if (!confirm("Esto copiara usuarios, facturas, servicios y logs desde la base SQLite local a la BD actual. Continuar?")) return;
    setMigrating(true);
    try {
      const res = await fetch("/api/db/migrate/from-sqlite", {
        method: "POST",
        headers: { Authorization: `Bearer ${getAuthToken()}` },
      });
      const data = await res.json();
      if (data.success) {
        showToast("success", data.message || "Migracion completada.");
        await refreshMigrate();
      } else {
        showToast("error", data.error || "Migracion fallida.");
      }
    } catch (error: any) {
      showToast("error", error.message || "Error durante la migracion.");
    }
    setMigrating(false);
  };

  const motorActivo: DbType = currentDbType === "mssql" || currentDbType === "oracle" ? (currentDbType as DbType) : currentMode;
  const canMigrate = sqliteAvailable && migrateStatus !== null && motorActivo !== "sqlite" &&
    (migrateStatus.usuarios + migrateStatus.facturas + migrateStatus.servicios) > 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 20 }} onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-800 overflow-hidden max-h-[90vh] flex flex-col">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <Database className="w-5 h-5 text-indigo-600 dark:text-indigo-300" />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">Base de Datos</h2>
              <p className="text-xs text-gray-400">Motor activo: <span className="font-mono uppercase">{motorActivo}</span></p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Selector de motor */}
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white mb-3 text-sm">1. Selecciona el motor de BD</h3>
            <div className="grid grid-cols-3 gap-2">
              <MotorCard icon={<HardDrive className="w-5 h-5" />} label="SQLite local" sub="Archivo .db" active={dbType === "sqlite"} onClick={() => setDbType("sqlite")} disabled={true} note="Solo lectura" />
              <MotorCard icon={<Server className="w-5 h-5" />} label="SQL Server" sub="Microsoft" active={dbType === "mssql"} onClick={() => setDbType("mssql")} />
              <MotorCard icon={<DatabaseIcon className="w-5 h-5" />} label="Oracle" sub="ETECSA" active={dbType === "oracle"} onClick={() => setDbType("oracle")} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              El motor SQLite local se usa solo como respaldo de emergencia. La seleccion actual
              es <b>{dbType === "mssql" ? "SQL Server" : dbType === "oracle" ? "Oracle" : "(ninguno, solo lectura)"}</b>.
            </p>
          </div>

          {/* Formularios segun motor */}
          {dbType === "mssql" && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/60 dark:to-indigo-950/60 rounded-xl p-5 border border-blue-100 dark:border-blue-900/70">
              <h3 className="font-bold text-gray-900 dark:text-white mb-1 text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-blue-600 dark:text-blue-300" />
                2. Conexion SQL Server
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-300 mb-4">Ingrese las credenciales del servidor SQL Server. Las tablas SGF_* se crearan automaticamente si no existen.</p>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <Input value={mssqlForm.server} onChange={(server) => setMssqlForm({ ...mssqlForm, server })} placeholder="Servidor / IP" />
                <Input value={mssqlForm.port} onChange={(port) => setMssqlForm({ ...mssqlForm, port })} placeholder="Puerto (1433)" />
                <Input value={mssqlForm.database} onChange={(database) => setMssqlForm({ ...mssqlForm, database })} placeholder="Base de datos" />
                <Input value={mssqlForm.user} onChange={(user) => setMssqlForm({ ...mssqlForm, user })} placeholder="Usuario (sa)" />
                <Input type="password" value={mssqlForm.password} onChange={(password) => setMssqlForm({ ...mssqlForm, password })} placeholder="Password" className="col-span-2" />
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-2 text-xs text-gray-600 dark:text-gray-300">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={mssqlForm.encrypt} onChange={(e) => setMssqlForm({ ...mssqlForm, encrypt: e.target.checked })} />
                  Cifrado TLS (Azure)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={mssqlForm.trustServerCertificate} onChange={(e) => setMssqlForm({ ...mssqlForm, trustServerCertificate: e.target.checked })} />
                  Confiar certificado (recomendado en LAN)
                </label>
              </div>
            </div>
          )}

          {dbType === "oracle" && (
            <div className="bg-gradient-to-br from-orange-50 to-red-50 dark:from-orange-950/60 dark:to-red-950/60 rounded-xl p-5 border border-orange-100 dark:border-orange-900/70">
              <h3 className="font-bold text-gray-900 dark:text-white mb-1 text-sm flex items-center gap-2">
                <DatabaseIcon className="w-4 h-4 text-orange-600 dark:text-orange-300" />
                2. Conexion Oracle
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-300 mb-4">Ingrese credenciales Oracle. Tablas SGF_* se crearan automaticamente.</p>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                <Input value={oracleForm.host} onChange={(host) => setOracleForm({ ...oracleForm, host })} placeholder="Host" />
                <Input value={oracleForm.port} onChange={(port) => setOracleForm({ ...oracleForm, port })} placeholder="Puerto" />
                <Input value={oracleForm.service} onChange={(service) => setOracleForm({ ...oracleForm, service })} placeholder="Servicio" />
                <Input value={oracleForm.user} onChange={(user) => setOracleForm({ ...oracleForm, user })} placeholder="Usuario" />
                <Input type="password" value={oracleForm.password} onChange={(password) => setOracleForm({ ...oracleForm, password })} placeholder="Password" />
              </div>
            </div>
          )}

          {dbType === "sqlite" && (
            <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-5 border border-gray-200 dark:border-gray-700">
              <h3 className="font-bold text-gray-700 dark:text-gray-300 mb-1 text-sm">SQLite local</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                El motor SQLite local se activa automaticamente cuando ni Oracle ni SQL Server estan disponibles.
                No requiere configuracion: usa el archivo <code className="bg-gray-200 dark:bg-gray-700 px-1 rounded">server-data/sgf-data.db</code>.
              </p>
            </div>
          )}

          {/* Botones de prueba y conexion */}
          {dbType !== "sqlite" && (
            <div className="flex flex-wrap gap-2">
              <button onClick={testDb} disabled={testing || connecting} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm rounded-lg font-medium flex items-center gap-2 transition-colors">
                {testing ? <><Activity className="w-4 h-4 animate-spin" />Probando...</> : <><RefreshCcw className="w-4 h-4" />3. Probar Conexion</>}
              </button>

              {testResult?.success && (
                <button onClick={connectDb} disabled={connecting || testing} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm rounded-lg font-medium flex items-center gap-2 transition-colors">
                  {connecting ? <><Activity className="w-4 h-4 animate-spin" />Conectando...</> : <><Plug className="w-4 h-4" />4. Conectarse y Reiniciar</>}
                </button>
              )}
            </div>
          )}

          {testResult && (
            <div className={`p-4 rounded-lg text-sm ${testResult.success ? "bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" : "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300"}`}>
              <div className="flex items-center gap-2 mb-2 font-semibold">
                {testResult.success ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                {testResult.message}
              </div>
              {testResult.success && testResult.data.tables && testResult.data.tables.length > 0 && (
                <div>
                  <p className="text-xs mb-1 opacity-80">Tablas detectadas:</p>
                  <div className="flex flex-wrap gap-1">
                    {testResult.data.tables.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-white dark:bg-gray-800 rounded text-xs font-mono border border-emerald-100 dark:border-emerald-900/60">
                        {t}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Migracion desde SQLite */}
          {canMigrate && migrateStatus && (
            <div className="bg-amber-50 dark:bg-amber-950/40 rounded-xl p-5 border border-amber-200 dark:border-amber-900/70">
              <h3 className="font-bold text-gray-900 dark:text-white mb-2 text-sm flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-amber-600 dark:text-amber-300" />
                Migrar datos desde SQLite local
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300 mb-3">
                Se encontraron datos en la BD SQLite local. Puedes copiarlos a la BD actual.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 text-xs">
                <div className="bg-white dark:bg-gray-800 rounded p-2 border border-amber-100 dark:border-amber-900/40"><div className="text-amber-700 dark:text-amber-300 font-bold text-lg">{migrateStatus.usuarios}</div>Usuarios</div>
                <div className="bg-white dark:bg-gray-800 rounded p-2 border border-amber-100 dark:border-amber-900/40"><div className="text-amber-700 dark:text-amber-300 font-bold text-lg">{migrateStatus.facturas}</div>Facturas</div>
                <div className="bg-white dark:bg-gray-800 rounded p-2 border border-amber-100 dark:border-amber-900/40"><div className="text-amber-700 dark:text-amber-300 font-bold text-lg">{migrateStatus.servicios}</div>Servicios</div>
                <div className="bg-white dark:bg-gray-800 rounded p-2 border border-amber-100 dark:border-amber-900/40"><div className="text-amber-700 dark:text-amber-300 font-bold text-lg">{migrateStatus.logs}</div>Logs</div>
                <div className="bg-white dark:bg-gray-800 rounded p-2 border border-amber-100 dark:border-amber-900/40"><div className="text-amber-700 dark:text-amber-300 font-bold text-lg">{migrateStatus.sesiones}</div>Sesiones</div>
              </div>
              <button onClick={migrate} disabled={migrating} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-300 text-white text-sm rounded-lg font-medium flex items-center gap-2 transition-colors">
                {migrating ? <><Activity className="w-4 h-4 animate-spin" />Migrando...</> : <><ArrowRightLeft className="w-4 h-4" />Migrar todo a {motorActivo.toUpperCase()}</>}
              </button>
            </div>
          )}

          {sqliteAvailable && motorActivo === "sqlite" && migrateStatus && (migrateStatus.usuarios + migrateStatus.facturas) > 0 && (
            <div className="bg-gray-50 dark:bg-gray-800/40 rounded-xl p-4 border border-gray-200 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
              <p>La BD SQLite local tiene {migrateStatus.usuarios} usuarios, {migrateStatus.facturas} facturas, {migrateStatus.servicios} servicios. Conectese a SQL Server u Oracle para poder migrarlos.</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function MotorCard({ icon, label, sub, active, onClick, disabled, note }: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  note?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`p-3 rounded-lg border-2 transition-all text-left ${
        active
          ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 shadow-sm"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <div className={`mb-1 ${active ? "text-indigo-600 dark:text-indigo-300" : "text-gray-400"}`}>{icon}</div>
      <div className="font-semibold text-sm text-gray-900 dark:text-white">{label}</div>
      <div className="text-xs text-gray-500 dark:text-gray-400">{sub}</div>
      {note && <div className="text-[10px] text-amber-600 dark:text-amber-300 mt-1">{note}</div>}
    </button>
  );
}

function Input({ value, onChange, placeholder, type = "text", className = "" }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
  className?: string;
}) {
  return (
    <input
      className={`px-2.5 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm ${className}`}
      placeholder={placeholder}
      value={value}
      type={type}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
