import JSZip from "jszip";
import type { SourceSlide } from "../types";

export async function parsePptx(data: ArrayBuffer): Promise<SourceSlide[]> {
  const zip = await JSZip.loadAsync(data);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const aNumber = Number(a.match(/slide(\d+)\.xml/)?.[1] || 0);
      const bNumber = Number(b.match(/slide(\d+)\.xml/)?.[1] || 0);
      return aNumber - bNumber;
    });
  const slides: SourceSlide[] = [];
  for (const slideFile of slideFiles) {
    const xml = await zip.file(slideFile)?.async("string");
    if (!xml) continue;
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "application/xml");
    const text = Array.from(doc.getElementsByTagName("a:t"))
      .map((node) => node.textContent || "")
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const slideNumber = Number(slideFile.match(/slide(\d+)\.xml/)?.[1] || slides.length + 1);
    slides.push({ slideNumber, text, charCount: text.length });
  }
  return slides;
}
