import fs from "node:fs";
import pdfParse from "pdf-parse";
async function main(){
  const f = process.argv[2];
  const d = await pdfParse(Uint8Array.from(fs.readFileSync(f)));
  const lineas = d.text.split("\n");
  const n = Number(process.argv[3] || lineas.length);
  console.log(lineas.slice(0, n).map((l: string, i: number)=>`${String(i).padStart(2)}| ${l}`).join("\n"));
  console.log("... total lineas:", lineas.length);
}
main();
