import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import * as api from '../api/client.ts';

export function CatalogoLineas() {
  const [texto,setTexto]=useState(''); const [q,setQ]=useState(''); const [page,setPage]=useState(1);
  const [filas,setFilas]=useState<Record<string,unknown>[]>([]); const [total,setTotal]=useState(0); const [paginas,setPaginas]=useState(1);
  const [error,setError]=useState(''); const [cargando,setCargando]=useState(true);
  useEffect(()=>{let activo=true; setCargando(true); setError(''); void api.getCatalogoLineas(page,q).then(r=>{
    if (!activo) return; if (r.success) {setFilas(r.data || []);setTotal(r.meta?.total ?? 0);setPaginas(r.meta?.totalPages ?? 1);} else setError(r.error || 'No se pudo cargar el catálogo.'); setCargando(false);
  }); return ()=>{activo=false;};},[page,q]);
  const columnas=Array.from(new Set(filas.flatMap(f=>Object.keys(f))));
  return <div className="sgf-panel"><h2>Líneas del Excel</h2><p className="sgf-subtitle">Consulte las filas y columnas guardadas. Desplácese horizontalmente para ver todos los campos.</p>
    <form className="flex flex-wrap gap-2 mb-4" onSubmit={e=>{e.preventDefault();setPage(1);setQ(texto.trim());}}><input aria-label="Buscar líneas" value={texto} onChange={e=>setTexto(e.target.value)} placeholder="Número, titular o unidad" className="flex-1 min-w-48 rounded-lg border border-gray-300 dark:border-gray-700 bg-transparent p-2"/><button className="sgf-outline"><Search size={16}/> Buscar</button></form>
    {error && <p className="sgf-error" role="alert">{error}</p>}{cargando ? <p>Cargando…</p> : <><div className="sgf-table-scroll"><table className="sgf-table"><thead><tr>{columnas.map(c=><th key={c}>{c.replace(/_/g,' ')}</th>)}</tr></thead><tbody>{filas.map((f,i)=><tr key={i}>{columnas.map(c=><td key={c}>{String(f[c] ?? '—')}</td>)}</tr>)}</tbody></table>{!filas.length && <p className="sgf-subtitle">No hay líneas para mostrar.</p>}</div><div className="flex items-center justify-between flex-wrap gap-2 mt-4 text-sm"><span>{total} filas · Página {page} de {paginas}</span><div className="flex gap-2"><button className="sgf-outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><button className="sgf-outline" disabled={page>=paginas} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div></div></>}
  </div>;
}
