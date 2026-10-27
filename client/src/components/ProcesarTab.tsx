import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, CheckCircle2, Database, FileText, Search, Upload, Zap } from "lucide-react";
import * as api from "../api/client.ts";
import { fmtMoney } from "./Mini.tsx";

type Props = { showToast: (t: "success" | "error" | "info", m: string) => void; trig: () => void };

export function ProcesarTab({ showToast, trig }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<any>(null);

  const process = async () => {
    if (!file) {
      setError("Seleccione un archivo PDF.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("Archivo supera 10 MB.");
      return;
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setError("Solo archivos PDF.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
      const b64 = btoa(binary);

      const executeUpload = async (forceDuplicate = false) => api.uploadFactura(file.name, b64, { forceDuplicate });

      let res = await executeUpload(false);
      if (!res.success && (res.data as any)?.duplicateWarning) {
        const duplicateData: any = res.data;
        const sameInvoices = duplicateData?.duplicates?.sameInvoice || [];
        const repeatedServices = duplicateData?.duplicates?.repeatedServices || [];
        const lines = [
          "Se detectaron posibles duplicados.",
          sameInvoices.length ? `- Facturas con el mismo numero: ${sameInvoices.length}` : "",
          repeatedServices.length ? `- Servicios ya vistos en otras facturas: ${repeatedServices.length}` : "",
        ].filter(Boolean);
        const detail = [
          sameInvoices[0] ? `Factura existente: ${sameInvoices[0].no_factura} · ${sameInvoices[0].cliente}` : "",
          repeatedServices[0] ? `Servicio repetido ejemplo: ${repeatedServices[0].numero_servicio} en factura ${repeatedServices[0].no_factura}` : "",
        ].filter(Boolean).join("\n");
        const proceed = confirm(`${lines.join("\n")}\n\n${detail}\n\n¿Desea continuar y reemplazar/guardar de todas formas?`);
        if (!proceed) {
          setError(lines.join(" "));
          showToast("info", "Carga cancelada por posible duplicado.");
          setLoading(false);
          return;
        }
        res = await executeUpload(true);
      }

      if (res.success) {
        const data: any = res.data;
        setResult(data);
        if ((data?.duplicateSummary?.sameInvoice?.length || 0) > 0 || (data?.duplicateSummary?.repeatedServices?.length || 0) > 0) {
          showToast("info", "Factura guardada con advertencia de duplicados. Revise el diagnostico.");
        } else {
          showToast("success", `${data?.guardados?.length || 0} servicios en CARGARARCH y ${data?.factura?.servicios?.length || 0} servicios en SGF.`);
        }
        trig();
      } else {
        setError(res.error || "Error al procesar.");
        showToast("error", res.error || "Error.");
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const factura = result?.factura;

  return (
    <motion.div key="procesar" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} transition={{ duration: 0.2 }} className="grid lg:grid-cols-2 gap-6">
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
          <Upload className="w-5 h-5 text-emerald-500" />
          Subir Factura PDF
        </h2>

        <label
          className={`border-2 border-dashed rounded-2xl p-8 text-center block cursor-pointer transition-all ${file ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-900/10" : "border-gray-200 dark:border-gray-700 hover:border-emerald-300"}`}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) setFile(f);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <input type="file" className="hidden" accept=".pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFile(f); }} />
          {file ? (
            <div className="flex flex-col items-center gap-2">
              <CheckCircle2 className="w-12 h-12 text-emerald-500" />
              <p className="font-semibold text-gray-900 dark:text-white">{file.name}</p>
              <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              <span className="text-xs text-emerald-600 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); setFile(null); }}>
                Cambiar archivo
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                <Upload className="w-7 h-7 text-gray-300" />
              </div>
              <div>
                <p className="font-semibold text-gray-700 dark:text-gray-300">Arrastre el PDF aqui</p>
                <p className="text-sm text-gray-400 mt-1">o haga clic para seleccionar</p>
              </div>
              <span className="px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-xs text-gray-500">PDF · Max 10 MB</span>
            </div>
          )}
        </label>

        <button
          onClick={process}
          disabled={loading || !file}
          className="mt-5 w-full py-3 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-200 dark:disabled:bg-gray-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 text-sm"
        >
          {loading ? (
            <>
              <Activity className="w-4 h-4 animate-spin" />
              Procesando PDF...
            </>
          ) : (
            <>
              <Zap className="w-4 h-4" />
              Procesar Factura
            </>
          )}
        </button>

        {error && <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">{error}</div>}
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
          <FileText className="w-5 h-5 text-emerald-500" />
          Resultados
        </h2>

        {result ? (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-3 gap-3">
              <InfoCard icon={Database} label="SGF_FACTURAS" value={result.sgfFacturaId ? "Guardada" : "-"} tone="indigo" />
              <InfoCard icon={CheckCircle2} label="SGF_SERVICIOS" value={String(factura?.servicios?.length || 0)} tone="emerald" />
              <InfoCard icon={CheckCircle2} label="CARGARARCH" value={String(result.guardados?.length || 0)} tone="blue" />
            </div>

            <div className={`rounded-xl border px-4 py-3 text-sm ${factura?.reviewStatus === "high" ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-900 dark:text-emerald-300" : factura?.reviewStatus === "review" ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-300" : "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900 dark:text-red-300"}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold">{factura?.reviewLabel || "Resultado del parser"}</p>
                  <p className="text-xs opacity-90 mt-1">{factura?.reviewStatus === "high" ? "La factura fue extraida con buena consistencia." : factura?.reviewStatus === "review" ? "La factura parece correcta, pero conviene revisar manualmente algunos campos." : "La extraccion tiene inconsistencias importantes y debe revisarse antes de usarla."}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs opacity-70">Confianza</p>
                  <p className="text-lg font-bold">{factura?.confidence || 0}%</p>
                </div>
              </div>
            </div>

            {((result?.duplicateSummary?.sameInvoice?.length || 0) > 0 || (result?.duplicateSummary?.repeatedServices?.length || 0) > 0) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
                <p className="font-semibold mb-1">Advertencia de duplicados</p>
                {(result?.duplicateSummary?.sameInvoice?.length || 0) > 0 && <p className="text-xs">Facturas con mismo numero detectadas: {result.duplicateSummary.sameInvoice.length}</p>}
                {(result?.duplicateSummary?.repeatedServices?.length || 0) > 0 && <p className="text-xs">Servicios ya existentes en otras facturas: {result.duplicateSummary.repeatedServices.length}</p>}
              </div>
            )}

            <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Mini label="Cliente" value={factura?.cliente} />
                <Mini label="No. Factura" value={factura?.noFactura} />
                <Mini label="No. Cliente" value={factura?.numeroCliente} />
                <Mini label="No. Cuenta" value={factura?.numeroCuenta} />
                <Mini label="Fecha Factura" value={factura?.fechaEmision} />
                <Mini label="Fecha Vencimiento" value={factura?.fechaVencimiento} />
                <Mini label="Periodo" value={factura?.periodoConsumo} />
                <Mini label="Moneda" value={factura?.moneda} />
                <Mini label="NIT" value={factura?.nit} />
                <Mini label="Codigo Pago" value={factura?.codigoPago} />
                <Mini label="Facturado" value={`$${fmtMoney(Number(factura?.totales?.facturado) || 0)}`} />
                <Mini label="Total a Pagar" value={`$${fmtMoney(Number(factura?.totales?.totalPagar || result.totalPagar) || 0)}`} />
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <InfoCard icon={Zap} label="Confianza" value={`${factura?.confidence || 0}%`} tone="emerald" />
              <InfoCard icon={FileText} label="Servicios detectados" value={String(factura?.servicios?.length || 0)} tone="indigo" />
              <InfoCard icon={Activity} label="Tiempo" value={`${factura?.processingMs || 0} ms`} tone="blue" />
            </div>

            {(factura?.diagnostics || []).length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Diagnostico del parser</h3>
                {(factura?.diagnostics || []).map((d: any, i: number) => (
                  <div key={`${d.code}-${i}`} className={`rounded-xl border px-3 py-2 text-xs ${d.level === "error" ? "bg-red-50 border-red-200 text-red-700 dark:bg-red-900/20 dark:border-red-900 dark:text-red-300" : d.level === "warn" ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-900 dark:text-amber-300" : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/20 dark:border-blue-900 dark:text-blue-300"}`}>
                    <strong className="uppercase mr-2">{d.level}</strong>{d.message}
                  </div>
                ))}
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Servicios extraidos ({factura?.servicios?.length || 0})
              </h3>
              <div className="border border-gray-100 dark:border-gray-700 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-500">Numero</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Cuota</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Consumo</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Comision</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Impuesto</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-500">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {factura?.servicios?.map((s: any, i: number) => (
                      <tr key={`${s.numero}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="px-3 py-1.5 font-mono text-gray-700 dark:text-gray-300">{s.numero}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.cuota) || 0)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.consumo) || 0)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.comision) || 0)}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">${fmtMoney(Number(s.impuesto) || 0)}</td>
                        <td className="px-3 py-1.5 text-right font-semibold text-gray-700 dark:text-gray-300">${fmtMoney(Number(s.importe) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {result.lineasEncontradas?.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                  <Search className="w-4 h-4 text-blue-500" />
                  Lineas Vinculadas ({result.lineasEncontradas.length})
                </h3>
                <div className="space-y-1">
                  {result.lineasEncontradas.map((l: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/10 rounded-lg text-xs gap-2">
                      <span className="font-mono text-blue-700 dark:text-blue-300">{l.NUMERO}</span>
                      <span className="text-blue-600 dark:text-blue-400 text-center flex-1">{l.NOMBRE} {l.APELL1}</span>
                      <span className="text-blue-500">{l.ORGANO || l.UNIDAD}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-gray-300 dark:text-gray-600">
            <FileText className="w-16 h-16 mb-4 opacity-30" />
            <p className="text-sm">Resultados apareceran aqui</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

function Mini({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="font-medium text-gray-800 dark:text-gray-200 text-sm">{value || "-"}</p>
    </div>
  );
}

function InfoCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: string; tone: "indigo" | "emerald" | "blue" }) {
  const tones = {
    indigo: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300",
    blue: "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300",
  };

  return (
    <div className={`rounded-xl p-4 ${tones[tone]}`}>
      <Icon className="w-4 h-4 mb-2 opacity-60" />
      <p className="text-xs opacity-80">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
