import { useCallback, useEffect, useState } from "react";
import { BarChart3, CalendarDays, RefreshCw } from "lucide-react";
import * as api from "../api/client.ts";

type Mes = { periodo: string; etiqueta: string; facturas: number; lineas: number; lineasSinConsumo: number; porcentajeSinConsumo: number; importeTotal: number };
type Linea = { numero: string; nombre: string; unidad: string; importes: number[]; mesesCero: number; importeTotal: number };
type Oficial = { oficial: string; unidad: string; lineas: number; importes: number[]; importeTotal: number };
type Datos = { mesesDisponibles: string[]; mesesSeleccionados: string[]; meses: Mes[]; lineas: Linea[]; oficiales: Oficial[]; resumen: { importeTotal: number; lineas: number; lineasSinConsumo: number; lineasSinConsumoLos3Meses: number } };
const dinero = (n: number) => new Intl.NumberFormat("es-ES", {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(n) || 0);
const etiqueta = (mes: string) => { const m = /^(\d{4})-(\d{2})$/.exec(mes); return m ? new Intl.DateTimeFormat("es", {month:"long",year:"numeric",timeZone:"UTC"}).format(new Date(Date.UTC(+m[1], +m[2]-1))) : mes; };

export function EstadisticasTab() {
  const [datos, setDatos] = useState<Datos | null>(null); const [seleccion, setSeleccion] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true); const [error, setError] = useState(""); const [soloCero, setSoloCero] = useState(false);
  const cargar = useCallback(async () => {
    setCargando(true); setError(""); const r = await api.getEstadisticasMeses(seleccion);
    if (r.success && r.data) setDatos(r.data as Datos); else setError(r.error || "No se pudieron cargar las estadísticas.");
    setCargando(false);
  }, [seleccion]);
  useEffect(() => { void cargar(); }, [cargar]);
  const elegidos = seleccion.length ? seleccion : datos?.mesesSeleccionados || [];
  const alternar = (m: string) => setSeleccion(elegidos.includes(m) ? elegidos.filter(x => x !== m) : [...elegidos, m]);
  const maximo = Math.max(1, ...(datos?.meses || []).map(m => Number(m.importeTotal)));
  const lineas = (datos?.lineas || []).filter(l => !soloCero || l.mesesCero > 0);
  return <div className="sgf-stats">
    <section className="sgf-panel"><div className="sgf-stats-title"><h2><CalendarDays size={19}/> Meses a comparar</h2><button className="sgf-outline" onClick={() => void cargar()} disabled={cargando}><RefreshCw size={16}/> Actualizar</button></div>
      <p className="sgf-subtitle">Por defecto se muestran los tres últimos meses. Pulse para elegir otros.</p>
      {!!datos?.mesesDisponibles.length && <div className="sgf-chips">{datos.mesesDisponibles.map(m => <button key={m} className={elegidos.includes(m) ? "active" : ""} onClick={() => alternar(m)} aria-pressed={elegidos.includes(m)}>{etiqueta(m)}</button>)}<button onClick={() => setSeleccion([])}>Últimos 3</button></div>}
      {error && <p role="alert" className="sgf-error">{error}</p>}{cargando && <p className="sgf-subtitle">Cargando estadísticas…</p>}
      {!cargando && !error && datos?.mesesDisponibles.length === 0 && <p className="sgf-subtitle">Todavía no hay facturas. Importe el Excel de líneas y después cargue los PDF.</p>}
    </section>
    {!cargando && !error && datos && datos.meses.length > 0 && <>
      <div className="sgf-stat-grid">{[["Importe total",`${dinero(datos.resumen.importeTotal)} CUP`],["Líneas facturadas",datos.resumen.lineas],["Líneas a cero",datos.resumen.lineasSinConsumo],["Sin consumo en los meses seleccionados",datos.resumen.lineasSinConsumoLos3Meses]].map(([k,v]) => <div className="sgf-panel" key={k}><small>{k}</small><strong>{v}</strong></div>)}</div>
      <section className="sgf-panel"><h2><BarChart3 size={19}/> Consumo por mes</h2><div className="sgf-bars">{datos.meses.map(m => <div key={m.periodo}><div className="sgf-bar-label"><strong>{m.etiqueta || etiqueta(m.periodo)}</strong><strong>{dinero(m.importeTotal)} CUP</strong></div><div className="sgf-bar"><span style={{width:`${Math.max(0, Number(m.importeTotal))/maximo*100}%`}}/></div><p>{m.facturas} facturas · {m.lineas} líneas · {m.lineasSinConsumo} a cero ({m.porcentajeSinConsumo} %)</p></div>)}</div></section>
      {datos.oficiales.length > 0 && <section className="sgf-panel"><h2>Gasto por oficial</h2><p className="sgf-subtitle">Suma de todas las líneas asignadas a cada persona.</p><div className="sgf-table-scroll"><table className="sgf-table"><thead><tr><th>Oficial</th><th>Unidad</th><th>Líneas</th>{datos.meses.map(m => <th key={m.periodo}>{m.etiqueta}</th>)}<th>Total</th></tr></thead><tbody>{datos.oficiales.map((o,i) => <tr key={`${o.oficial}-${i}`}><td>{o.oficial}</td><td>{o.unidad || "—"}</td><td>{o.lineas}</td>{o.importes.map((v,j) => <td key={j}>{dinero(v)}</td>)}<td>{dinero(o.importeTotal)}</td></tr>)}</tbody></table></div></section>}
      <section className="sgf-panel"><div className="sgf-stats-title"><h2>Detalle por línea</h2><label className="sgf-filter"><input type="checkbox" checked={soloCero} onChange={e => setSoloCero(e.target.checked)}/> Solo líneas con meses a cero</label></div><p className="sgf-subtitle">Datos de las facturas cruzados con el Excel importado.</p><div className="sgf-table-scroll"><table className="sgf-table"><thead><tr><th>Número</th><th>Nombre</th><th>Unidad</th>{datos.meses.map(m => <th key={m.periodo}>{m.etiqueta}</th>)}<th>Meses a cero</th><th>Total</th></tr></thead><tbody>{lineas.map(l => <tr key={l.numero}><td>{l.numero}</td><td>{l.nombre}</td><td>{l.unidad || "—"}</td>{l.importes.map((v,j) => <td key={j}>{dinero(v)}</td>)}<td>{l.mesesCero}</td><td>{dinero(l.importeTotal)}</td></tr>)}</tbody></table>{!lineas.length && <p className="sgf-subtitle">No hay líneas que mostrar.</p>}</div></section>
    </>}
  </div>;
}
