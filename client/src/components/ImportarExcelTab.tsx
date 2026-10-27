import { useState, useEffect } from "react";
import { Upload, FileSpreadsheet, CheckCircle2, XCircle, AlertTriangle, Database, RefreshCw } from "lucide-react";

type Props = {
  showToast: (type: "success" | "error" | "info", message: string) => void;
};

type AnalyzeResult = {
  sheets: Array<{ name: string; headers: string[]; rowCount: number; columnCount: number; preview: any[] }>;
  suggestedTable: string;
  mappingSuggestions: Record<string, { suggestedTable: string; mapping: Record<string, string> }>;
};

type ImportResult = {
  totalRows: number;
  importedRows: number;
  failedRows: number;
  newColumnsAdded: string[];
  table: string;
  mapping: Record<string, string>;
  errors: Array<{ row: number; error: string }>;
  warnings: string[];
  durationMs: number;
};

export function ImportarExcelTab({ showToast }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("SGF_LINEAS_IMPORTADAS");
  const [truncate, setTruncate] = useState(false);

  useEffect(() => {
    fetchTables();
  }, []);

  const fetchTables = async () => {
    try {
      const token = sessionStorage.getItem("sgf_auth_token");
      const res = await fetch("/api/import/tables", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setTables(data.data.tables || []);
    } catch {}
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setAnalysis(null);
      setResult(null);
    }
  };

  const analyze = async () => {
    if (!file) return;
    setAnalyzing(true);
    setAnalysis(null);
    try {
      const token = sessionStorage.getItem("sgf_auth_token");
      const buffer = await file.arrayBuffer();
      const res = await fetch("/api/import/analyze", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
        body: buffer,
      });
      const data = await res.json();
      if (data.success) {
        setAnalysis(data.data);
        setSelectedTable(data.data.suggestedTable || "SGF_LINEAS_IMPORTADAS");
        showToast("success", `Análisis: ${data.data.sheets.length} hojas, tabla sugerida ${data.data.suggestedTable}`);
      } else {
        showToast("error", data.error || "Error analizando");
      }
    } catch (e: any) {
      showToast("error", e.message || "Error");
    }
    setAnalyzing(false);
  };

  const importar = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    try {
      const token = sessionStorage.getItem("sgf_auth_token");
      const buffer = await file.arrayBuffer();
      const qs = new URLSearchParams({
        table: selectedTable,
        truncate: String(truncate),
      }).toString();
      const res = await fetch(`/api/import/excel?${qs}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/octet-stream" },
        body: buffer,
      });
      const data = await res.json();
      if (data.success) {
        setResult(data.data);
        showToast("success", data.message || `Importadas ${data.data.importedRows} filas`);
      } else {
        // 207 partial
        if (data.data) {
          setResult(data.data);
          showToast("info", data.message || `Importación parcial: ${data.data.importedRows} OK, ${data.data.failedRows} fallidas`);
        } else {
          showToast("error", data.error || "Error importando");
        }
      }
    } catch (e: any) {
      showToast("error", e.message || "Error");
    }
    setImporting(false);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
          Importar Excel Masivo
        </h2>

        <div className="mt-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl p-6 text-center bg-gray-50 dark:bg-gray-900/50">
          <input type="file" accept=".xlsx,.xls" onChange={handleFileChange} className="hidden" id="excel-input" />
          <label htmlFor="excel-input" className="cursor-pointer flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{file ? file.name : "Arrastra prueba.xlsx aquí o haz click para seleccionar"}</span>
            <span className="text-xs text-gray-400">Máx 20MB, formato XLSX</span>
          </label>
          {file && <div className="mt-2 text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB - {file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}</div>}
        </div>

        <div className="mt-4 flex flex-wrap gap-3 items-center">
          <button
            onClick={analyze}
            disabled={!file || analyzing || importing}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm rounded-lg flex items-center gap-2"
          >
            {analyzing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
            1. Analizar Excel
          </button>
          {analysis && (
            <>
              <select
                value={selectedTable}
                onChange={(e) => setSelectedTable(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-sm"
              >
                {tables.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="SGF_LINEAS_IMPORTADAS">SGF_LINEAS_IMPORTADAS (recomendado para prueba.xlsx)</option>
                <option value="SGF_FACTURAS">SGF_FACTURAS</option>
                <option value="SGF_SERVICIOS">SGF_SERVICIOS</option>
              </select>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={truncate} onChange={e => setTruncate(e.target.checked)} />
                Vaciar tabla antes
              </label>
              <button
                onClick={importar}
                disabled={importing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white text-sm rounded-lg flex items-center gap-2"
              >
                {importing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
                2. Importar a {selectedTable}
              </button>
            </>
          )}
        </div>
      </div>

      {analysis && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="font-bold text-gray-900 dark:text-white mb-3">Análisis</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">Tabla sugerida: <span className="font-mono font-bold text-emerald-600">{analysis.suggestedTable}</span></p>
          {analysis.sheets.map((sh, i) => (
            <div key={i} className="mb-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border">
              <div className="font-semibold text-sm">Hoja: {sh.name} - {sh.rowCount} filas, {sh.columnCount} columnas</div>
              <div className="mt-2 flex flex-wrap gap-1">
                {sh.headers.map((h, idx) => (
                  <span key={idx} className="px-2 py-0.5 bg-white dark:bg-gray-800 border rounded text-xs font-mono">{h} → {analysis.mappingSuggestions[sh.name]?.mapping[h] || "?"}</span>
                ))}
              </div>
              {sh.preview.length > 0 && (
                <div className="mt-2 text-xs">
                  <div className="font-semibold">Preview:</div>
                  <pre className="bg-white dark:bg-gray-800 p-2 rounded border overflow-x-auto text-[11px]">{JSON.stringify(sh.preview, null, 2)}</pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className={`rounded-xl shadow-sm border p-6 ${result.failedRows === 0 ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800" : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"}`}>
          <h3 className="font-bold flex items-center gap-2">
            {result.failedRows === 0 ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertTriangle className="w-5 h-5 text-amber-600" />}
            Resultado Importación
          </h3>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div className="bg-white dark:bg-gray-800 p-3 rounded border"><div className="text-2xl font-bold">{result.totalRows}</div>Total filas</div>
            <div className="bg-white dark:bg-gray-800 p-3 rounded border"><div className="text-2xl font-bold text-emerald-600">{result.importedRows}</div>Importadas</div>
            <div className="bg-white dark:bg-gray-800 p-3 rounded border"><div className="text-2xl font-bold text-red-600">{result.failedRows}</div>Fallidas</div>
            <div className="bg-white dark:bg-gray-800 p-3 rounded border"><div className="text-2xl font-bold">{result.durationMs}ms</div>Duración</div>
          </div>
          <div className="mt-3 text-sm">
            <div>Tabla: <b>{result.table}</b></div>
            {result.newColumnsAdded.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold">Columnas nuevas añadidas (ALTER TABLE):</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {result.newColumnsAdded.map((c, i) => <span key={i} className="px-2 py-0.5 bg-white dark:bg-gray-800 border rounded text-xs font-mono">{c}</span>)}
                </div>
              </div>
            )}
            {result.warnings.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold">Advertencias:</div>
                <ul className="list-disc pl-5">
                  {result.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            {result.errors.length > 0 && (
              <div className="mt-2">
                <div className="font-semibold flex items-center gap-1"><XCircle className="w-4 h-4 text-red-500" /> Errores (primeros 20):</div>
                <pre className="bg-white dark:bg-gray-800 p-2 rounded border overflow-x-auto text-xs mt-1">{JSON.stringify(result.errors, null, 2)}</pre>
              </div>
            )}
            <div className="mt-2">
              <div className="font-semibold">Mapeo usado:</div>
              <pre className="bg-white dark:bg-gray-800 p-2 rounded border overflow-x-auto text-xs mt-1">{JSON.stringify(result.mapping, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
