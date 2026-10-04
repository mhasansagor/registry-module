export const MAX_BYTES = 10 * 1024 * 1024;

const MIME: Record<"pdf" | "docx", string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

// Extension, declared MIME type AND file signature must all agree - a renamed .exe is rejected.
// Browsers may send an empty / octet-stream type, so only a *conflicting* MIME type is rejected.
export function detectType(name: string, mime: string, buf: Buffer): "pdf" | "docx" | null {
  const ext = name.toLowerCase().split(".").pop();
  const mimeOk = (t: "pdf" | "docx") => !mime || mime === "application/octet-stream" || mime === MIME[t];
  if (ext === "pdf" && mimeOk("pdf") && buf.subarray(0, 5).toString() === "%PDF-") return "pdf";
  // DOCX is a ZIP (PK\x03\x04) that contains word/document.xml; entry names are stored uncompressed.
  if (ext === "docx" && mimeOk("docx") && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 && buf.includes("word/document.xml"))
    return "docx";
  return null;
}
