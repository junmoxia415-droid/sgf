import { useState } from "react";
import { AlertTriangle, FileText, Save, Upload, X } from "lucide-react";
import * as api from "../api/client.ts";

type Props = { showToast: (t: "success" | "error" | "info", m: string) => void; trig: () => void };
type Vista = { estado: string; factura: any; totalServicios: number; extraccionVacia: boolean; requiereRevision: boolean; duplicadoPropio: boolean; duplicadoAjeno: boolean; posibleRegistroAntiguo: boolean; enriquecimiento?: { encontradas: number; total: number; lineas: any[] }; };
const campos: Array<[string,string]> = [["Factura","noFactura"],["Cliente","cliente"],["Cuenta","cuenta"],["Número de cliente","numeroCliente"],["Número de cuenta","numeroCuenta"],["Dirección","direccion"],["Fecha de emisión","fechaEmision"],["Vencimiento","fechaVencimiento"],["Periodo","periodoConsumo"],["Código de pago","codigoPago"],["Moneda","moneda"],["NIT","nit"],["Total a pagar","totalPagar"]];

export function ProcesarTab({ showToast, trig }: Props) {
  const [file, setFile] = useState<File | null>(null); const [vista, setVista] = useState<Vista | null>(null);
  const [contenido, setContenido] = useState(""); const [nombre, setNombre] = useState("");
  const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [guardado, setGuardado] = useState(false);
  const elegir = (f: File | null) => { setFile(f); setVista(null); setContenido(""); setGuardado(false); setError(""); };
  const analizar = async () => {
    if (!file) return;
    if (file.size > 10*1024*1024 || !file.name.toLowerCase().endsWith('.pdf')) { setError('Seleccione un PDF de hasta 10 MB.'); return; }
    setLoading(true); setError(""); setVista(null); setGuardado(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()); let binario = "";
      for (let i=0;i<bytes.length;i++) binario += String.fromCharCode(bytes[i]);
      const b64 = btoa(binario); const r = await api.uploadFactura(file.name, b64, {accion:"analizar"});
      if (!r.success || !r.data) { setError(r.error || "No se pudo leer el PDF."); return; }
      setContenido(b64); setNombre(file.name); setVista(r.data as Vista);
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo leer el PDF.'); }
    finally { setLoading(false); }
  };
  const guardar = async () => {
    if (!vista || !contenido || guardado) return;
    if (vista.posibleRegistroAntiguo) { setError("Hay un registro anterior con número incompleto. Revise el historial con un administrador antes de guardar."); return; }
    if (vista.duplicadoAjeno) { setError("Esta factura pertenece a otra cuenta. No se ha guardado; consulte al administrador."); return; }
    if (vista.duplicadoPropio && !window.confirm('Esta factura ya existe. ¿Desea sustituir la anterior por esta lectura? Esta acción reemplaza sus datos anteriores.')) return;
    if (vista.extraccionVacia && !window.confirm('No se detectó ningún servicio. ¿Guardar solo la cabecera para revisión? No se registrarán líneas.')) return;
    if (!vista.duplicadoPropio && !vista.extraccionVacia && !window.confirm('¿Guardar esta factura y sus líneas en SGF?')) return;
    setLoading(true); setError("");
    try {
      const r = await api.uploadFactura(nombre,contenido,{accion:"guardar",confirmarSustitucion:vista.duplicadoPropio,confirmarSinServicios:vista.extraccionVacia});
      if (!r.success) { setError(r.error || 'No se pudo guardar.'); return; }
      setGuardado(true); showToast('success','Factura guardada.'); trig();
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar.'); }
    finally { setLoading(false); }
  };
  const f=vista?.factura; const vinculadas = new Map((vista?.enriquecimiento?.lineas || []).map((l:any)=>[String(l.NUMERO),l]));
  return <div className="space-y-4">
    <div className="sgf-panel"><h2 className="flex items-center gap-2"><Upload size={19}/> Analizar PDF</h2><p className="sgf-subtitle">El servidor lee el PDF y busca las líneas del Excel. Revise el resultado antes de decidir si desea guardarlo.</p>
      <label className="block rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-7 text-center cursor-pointer" onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();elegir(e.dataTransfer.files[0] || null);}}>
        <input type="file" className="hidden" accept=".pdf" onChange={e=>elegir(e.target.files?.[0] || null)}/><FileText className="mx-auto mb-2 text-blue-600"/><span className="text-sm">{file ? file.name : 'Arrastre un PDF o pulse para elegirlo'}</span>
      </label>
      <button onClick={analizar} disabled={!file || loading} className="mt-4 px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl">{loading ? 'Procesando…' : 'Analizar factura'}</button>
      {error && <p role="alert" className="sgf-error">{error}</p>}
    </div>
    {vista && <>
      <section className="sgf-panel"><div className="sgf-stats-title"><h2>Resultado de la extracción</h2><strong className={guardado ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'}>{guardado ? 'Guardada' : 'Vista previa · sin guardar'}</strong></div>
        {(vista.requiereRevision || vista.extraccionVacia || vista.duplicadoPropio || vista.duplicadoAjeno || vista.posibleRegistroAntiguo) && <div className="my-4 p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-800 text-sm"><div className="flex gap-2"><AlertTriangle size={19}/><div><strong>Revise la lectura antes de guardar</strong>{vista.extraccionVacia && <p>No se detectaron servicios. Compruebe el documento original.</p>}{vista.duplicadoPropio && <p>Ya existe una factura con este número: sustituirla requiere confirmación.</p>}{vista.duplicadoAjeno && <p>Este número pertenece a otra cuenta; no se sustituirá desde aquí.</p>}{vista.posibleRegistroAntiguo && <p>Hay un registro anterior con número incompleto. Revise el historial con un administrador antes de guardar.</p>}</div></div></div>}
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 my-5">{campos.map(([label,key])=><div key={key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"><span className="block text-xs text-gray-500 dark:text-gray-400">{label}</span><strong className="block mt-1 text-sm break-words">{String(f?.[key] ?? 'No detectado')}</strong></div>)}</div>
        <h3 className="font-semibold mt-4">Totales extraídos</h3><div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 my-3">{[["Cuota","cuota"],["Consumo","consumo"],["Comisión","comision"],["Impuesto","impuesto"],["Facturado","facturado"],["Estado de cuenta","estadoCuenta"],["Total servicios","totalServicios"],["Descuento","descuento"]].map(([label,key])=><div key={key} className="rounded-lg border border-gray-200 dark:border-gray-700 p-3"><span className="block text-xs text-gray-500 dark:text-gray-400">{label}</span><strong className="block mt-1 text-sm">{String(f?.totales?.[key] ?? 'No detectado')}</strong></div>)}</div>
        <p className="text-sm text-gray-600 dark:text-gray-300">Servicios detectados: <strong>{vista.totalServicios}</strong> · Vinculados al catálogo: <strong>{vista.enriquecimiento?.encontradas ?? 0}/{vista.enriquecimiento?.total ?? 0}</strong></p>
        {!guardado && <div className="flex flex-wrap gap-2 mt-5"><button onClick={guardar} disabled={loading || vista.duplicadoAjeno || vista.posibleRegistroAntiguo} className="inline-flex gap-2 items-center px-5 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl"><Save size={18}/> Guardar factura</button><button onClick={()=>{setVista(null);setContenido('');}} disabled={loading} className="sgf-outline"><X size={18}/> Descartar vista previa</button></div>}
      </section>
      <section className="sgf-panel"><h2>Servicios extraídos</h2><p className="sgf-subtitle">Revise todas las filas y sus importes. Los datos de titular y unidad proceden del catálogo importado.</p><div className="sgf-table-scroll"><table className="sgf-table"><thead><tr>{['Número','Titular','Unidad','Cuota','Consumo','Comisión','Impuesto','Importe'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{(f?.servicios || []).map((s:any,i:number)=>{const l:any=vinculadas.get(String(s.numero));return <tr key={`${s.numero}-${i}`}><td>{s.numero}</td><td>{l?.NOMBRE_COMPLETO || 'Sin vincular'}</td><td>{l?.UNIDAD || '—'}</td><td>{s.cuota ?? '—'}</td><td>{s.consumo ?? '—'}</td><td>{s.comision ?? '—'}</td><td>{s.impuesto ?? '—'}</td><td>{s.importe ?? '—'}</td></tr>})}</tbody></table>{vista.totalServicios===0 && <p className="sgf-subtitle">No se detectaron servicios en este documento.</p>}</div></section>
      {!!f?.diagnostics?.length && <details className="sgf-panel"><summary className="cursor-pointer font-semibold">Ver observaciones de lectura</summary><ul className="sgf-guide">{f.diagnostics.map((d:any,i:number)=><li key={i}>{d.message}</li>)}</ul></details>}
    </>}
  </div>;
}
