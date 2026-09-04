export type ReceiptAnalysis = {
  date: string;
  vendor: string;
  total: string;
  extractedText: string;
};

type ProgressCallback = (message: string, progress?: number) => void;

const ignoredVendorLines = [
  /thank\s*you/i,
  /customer\s+copy/i,
  /merchant\s+copy/i,
  /receipt/i,
  /invoice/i,
  /welcome/i,
  /subtotal/i,
  /total/i,
  /amount\s+due/i,
  /balance/i,
  /tax/i,
  /cashier/i,
  /register/i,
  /transaction/i,
  /approved/i,
  /order\s*(number|no|#)/i,
  /item|quantity|\bqty\b|price/i,
  /member|rewards|points/i,
  /save\s+(money|more|today)/i,
  /survey|feedback|visit\s+us/i,
  /served\s+by|table\s+\d|guest\s+\d/i,
  /visa|mastercard|amex|discover/i,
  /^\s*(tel|phone|www|http)/i,
];

function cleanLines(text: string) {
  return text
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/[|_]+/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizeAmount(raw: string) {
  let value = raw.replace(/[^0-9,.-]/g, "").replace(/^-/, "");
  if (value.includes(",") && value.includes(".")) {
    value = value.lastIndexOf(".") > value.lastIndexOf(",") ? value.replace(/,/g, "") : value.replace(/\./g, "").replace(",", ".");
  } else if (value.includes(",")) {
    value = /,\d{2}$/.test(value) ? value.replace(/\./g, "").replace(",", ".") : value.replace(/,/g, "");
  }
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0 && amount < 100000 ? amount : null;
}

function amountsFromLine(line: string) {
  const matches = line.match(/(?:USD\s*)?\$?\s*\d{1,6}(?:[,.]\d{3})*(?:[,.]\d{2})/gi) ?? [];
  return matches.map(normalizeAmount).filter((amount): amount is number => amount !== null);
}

function extractTotal(lines: string[]) {
  const priorityPatterns = [
    /grand\s+total/i,
    /amount\s+due/i,
    /balance\s+due/i,
    /(?:^|\s)total(?:\s|:|$)/i,
  ];

  for (const pattern of priorityPatterns) {
    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const line = lines[index];
      if (/subtotal/i.test(line) || !pattern.test(line)) continue;
      const amounts = amountsFromLine(line);
      if (amounts.length) return amounts.at(-1)?.toFixed(2) ?? "";
    }
  }

  const fallback = lines.flatMap(amountsFromLine).filter((amount) => amount < 10000);
  return fallback.length ? Math.max(...fallback).toFixed(2) : "";
}

function isoDate(year: number, month: number, day: number) {
  const candidate = new Date(year, month - 1, day);
  if (candidate.getFullYear() !== year || candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return "";
  const now = new Date();
  if (candidate.getTime() > now.getTime() + 48 * 60 * 60 * 1000 || year < now.getFullYear() - 5) return "";
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function extractDate(lines: string[]) {
  const prioritized = [...lines.filter((line) => /date|purchased|transaction/i.test(line)), ...lines];
  const currentYear = new Date().getFullYear();

  for (const line of prioritized) {
    const yearFirst = line.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (yearFirst) {
      const value = isoDate(Number(yearFirst[1]), Number(yearFirst[2]), Number(yearFirst[3]));
      if (value) return value;
    }

    const monthFirst = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/);
    if (monthFirst) {
      const yearValue = Number(monthFirst[3]);
      const year = yearValue < 100 ? 2000 + yearValue : yearValue;
      const value = isoDate(year, Number(monthFirst[1]), Number(monthFirst[2]));
      if (value) return value;
    }

    const shortDate = line.match(/\b(\d{1,2})[-/.](\d{1,2})\b/);
    if (shortDate && /date|purchased|transaction/i.test(line)) {
      const value = isoDate(currentYear, Number(shortDate[1]), Number(shortDate[2]));
      if (value) return value;
    }
  }
  return "";
}

function extractVendor(lines: string[]) {
  const businessWords = /\b(club|market|mart|store|shop|restaurant|cafe|coffee|grill|kitchen|bakery|pharmacy|foods?|supply|center|company|co\.?|inc\.?|llc|ltd\.?)\b/i;
  const addressWords = /\b(st|street|rd|road|ave|avenue|blvd|boulevard|drive|dr|lane|ln|highway|hwy|suite|tx|texas)\b/i;
  const candidates = lines.slice(0, 16).map((rawLine, index) => {
    const line = rawLine.replace(/[^A-Za-z0-9&'(). -]/g, "").replace(/\s+/g, " ").trim();
    const letters = line.match(/[A-Za-z]/g)?.length ?? 0;
    const upperLetters = line.match(/[A-Z]/g)?.length ?? 0;
    const words = line.split(/\s+/).filter(Boolean).length;
    const looksLikeBrand = businessWords.test(line)
      || (index <= 3 && words <= 3 && (upperLetters / Math.max(letters, 1) >= 0.7 || /^[A-Z][A-Za-z'&.-]*(?:\s+[A-Z][A-Za-z'&.-]*)*$/.test(line)));
    const invalid = letters < 3
      || line.length < 3
      || line.length > 48
      || !looksLikeBrand
      || ignoredVendorLines.some((pattern) => pattern.test(line))
      || /^\d/.test(line)
      || /\d{3}[-.)\s]+\d{3}/.test(line)
      || /\b\d{5}(?:-\d{4})?\b/.test(line)
      || addressWords.test(line);
    if (invalid) return { line: "", score: -100 };

    let score = Math.max(0, 16 - index);
    if (line.length >= 4 && line.length <= 30) score += 4;
    if (words >= 1 && words <= 5) score += 3;
    if (businessWords.test(line)) score += 7;
    if (letters && upperLetters / letters >= 0.7) score += 5;
    if (/^[A-Z][A-Za-z'&.-]*(?:\s+[A-Z][A-Za-z'&.-]*)*$/.test(line)) score += 3;
    if (/\d/.test(line)) score -= 5;
    return { line, score };
  });

  const best = candidates.sort((first, second) => second.score - first.score)[0];
  return best && best.score >= 10 ? best.line : "";
}

async function imageForOcr(file: File) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".heic") || lowerName.endsWith(".heif")) {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: "image/png", quality: 0.92 });
    return Array.isArray(converted) ? converted[0] : converted;
  }
  return file;
}

async function runOcr(image: Blob, onProgress?: ProgressCallback) {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng", undefined, {
    logger: (message) => {
      if (message.status === "recognizing text") onProgress?.("Reading receipt text", message.progress);
    },
  });
  try {
    const result = await worker.recognize(image);
    return result.data.text;
  } finally {
    await worker.terminate();
  }
}

async function pdfText(file: File, onProgress?: ProgressCallback) {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
  const document = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages = Math.min(document.numPages, 2);
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pages; pageNumber += 1) {
    onProgress?.(`Reading PDF page ${pageNumber} of ${pages}`);
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => {
      if (!("str" in item)) return "";
      return `${item.str}${"hasEOL" in item && item.hasEOL ? "\n" : " "}`;
    }).join("");
    pageTexts.push(text);
  }

  const extracted = pageTexts.join("\n").trim();
  if (extracted.length >= 30) return extracted;

  const firstPage = await document.getPage(1);
  const viewport = firstPage.getViewport({ scale: 2 });
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext("2d");
  if (!context) return extracted;
  await firstPage.render({ canvas, canvasContext: context, viewport }).promise;
  const image = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob: Blob | null) => blob ? resolve(blob) : reject(new Error("The PDF receipt could not be rendered.")), "image/png"));
  return runOcr(image, onProgress);
}

export async function analyzeReceipt(file: File, onProgress?: ProgressCallback): Promise<ReceiptAnalysis> {
  onProgress?.("Preparing receipt");
  const text = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
    ? await pdfText(file, onProgress)
    : await runOcr(await imageForOcr(file), onProgress);
  const lines = cleanLines(text);
  return {
    date: extractDate(lines),
    vendor: extractVendor(lines),
    total: extractTotal(lines),
    extractedText: text,
  };
}
