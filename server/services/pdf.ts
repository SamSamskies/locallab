import { extractText, getDocumentProxy } from "unpdf";

export async function extractPdfText(buffer: Buffer): Promise<{
  text: string;
  totalPages: number;
}> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text, totalPages } = await extractText(pdf, { mergePages: true });

  if (!text || text.trim().length === 0) {
    throw new Error(
      "No text could be extracted from this PDF. Scanned/image-only PDFs are not supported in v1.",
    );
  }

  return { text: text.trim(), totalPages };
}
