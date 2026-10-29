/** Reconstruye filas por posición en lugar del orden interno del PDF.
 * Conserva una copia de los bytes: pdf.js puede modificar el buffer recibido.
 */
export async function extraerTextoPdf(pdfBuffer: Buffer): Promise<string> {
  const lib = await import('pdf-parse');
  const parse: any = lib.default || lib;
  const pdfData = await parse(Uint8Array.from(pdfBuffer), {
    pagerender: async (page: any) => {
      const content = await page.getTextContent({normalizeWhitespace:false, disableCombineTextItems:true});
      const rows: Array<{y:number; items:Array<{x:number; text:string}>}> = [];
      for (const item of content.items) {
        if (typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform)) continue;
        const x = Number(item.transform[4]), y = Number(item.transform[5]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        let row = rows.find(r => Math.abs(r.y-y) < 2);
        if (!row) { row = {y,items:[]}; rows.push(row); }
        row.items.push({x,text:item.str});
      }
      rows.sort((a,b)=>b.y-a.y);
      return rows.map(row=>row.items.sort((a,b)=>a.x-b.x).map(i=>i.text.trim()).join(' ')).join('\n');
    },
  });
  return String(pdfData?.text || '');
}
