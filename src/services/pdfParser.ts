import "./pdfCompatibility";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "../workers/pdf.worker?worker&url";
import type { SourcePage } from "../types";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function parsePdf(data: ArrayBuffer): Promise<SourcePage[]> {
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: SourcePage[] = [];
  for (let index = 1; index <= pdf.numPages; index += 1) {
    const page = await pdf.getPage(index);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    pages.push({ pageNumber: index, text, charCount: text.length });
  }
  return pages;
}
