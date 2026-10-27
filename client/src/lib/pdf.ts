let engine: any = null;

async function getEngine() {
  if (engine) return engine;
  const pdf = await import("pdfjs-dist");
  const w = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  if (pdf?.GlobalWorkerOptions) pdf.GlobalWorkerOptions.workerSrc = w.default;
  engine = pdf;
  return engine;
}

export async function extractPdfText(file: File): Promise<string> {
  const pdf = await getEngine();
  const buf = await file.arrayBuffer();
  const doc = await pdf.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it: any) => it.str || "").join(" "));
  }
  return pages.join("\n");
}

export const ALLOWED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".bmp"];
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
