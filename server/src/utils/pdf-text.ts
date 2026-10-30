/** Reconstruye filas por posición en lugar del orden interno del PDF.
 * Conserva una copia de los bytes: pdf.js puede modificar el buffer recibido.
 */
export async function extraerTextoPdf(pdfBuffer: Buffer): Promise<string> {
  const lib = await import('pdf-parse');
  const parse: any = lib.default || lib;
  const pdfData = await parse(Uint8Array.from(pdfBuffer), {
    pagerender: async (page: any) => {
      const content = await page.getTextContent({normalizeWhitespace:false, disableCombineTextItems:true});
      const rows: Array<{y:number; items:Array<{x:number; width:number; text:string}>}> = [];
      for (const item of content.items) {
        if (typeof item.str !== 'string' || !item.str.trim() || !Array.isArray(item.transform)) continue;
        const x = Number(item.transform[4]), y = Number(item.transform[5]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        let row = rows.find(r => Math.abs(r.y-y) < 2);
        if (!row) { row = {y,items:[]}; rows.push(row); }
        const width = Number(item.width);
        row.items.push({x, width:Number.isFinite(width) ? width : 0, text:item.str});
      }
      rows.sort((a,b)=>b.y-a.y);
      return rows.map(row=>{
        const items = row.items.sort((a,b)=>a.x-b.x);
        let line = '';
        for (let index=0; index<items.length; index++) {
          const current = items[index];
          const previous = items[index-1];
          // Algunos PDF dividen una palabra o cifra en dos fragmentos que se
          // tocan visualmente (por ejemplo, "7." y "49"). Insertar un espacio
          // altera los importes y desplaza las columnas. Solo unir si las cajas
          // realmente se tocan y no hay un espacio explícito entre los textos.
          const gap = previous ? current.x - (previous.x + previous.width) : Infinity;
          const unidos = previous && previous.width > 0 && gap >= -0.75 && gap <= 0.35
            && !/\s$/.test(previous.text) && !/^\s/.test(current.text);
          if (line) line += unidos ? '' : ' ';
          line += current.text.trim();
        }
        return line;
      }).join('\n');
    },
  });
  return String(pdfData?.text || '');
}
