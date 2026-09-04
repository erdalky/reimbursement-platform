import { PDFDocument, PDFPage, PDFFont, StandardFonts, rgb } from "pdf-lib";

export type PdfExpense = {
  date: string;
  paidTo: string;
  description: string;
  cost: string;
};

export type PdfReceipt = {
  name: string;
  file: File;
};

export type ReimbursementPdfInput = {
  name: string;
  phone: string;
  address: string;
  requestDate: string;
  expenses: PdfExpense[];
  receipts: PdfReceipt[];
};

const PAGE_WIDTH = 612;
const PAGE_HEIGHT = 792;
const EXPENSES_PER_PAGE = 6;
const BLACK = rgb(0, 0, 0);

function mmddyy(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year.slice(-2)}` : value;
}

function dollars(value: number) {
  return `$${value.toFixed(2)}`;
}

function fitText(text: string, font: PDFFont, size: number, width: number) {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let shortened = text;
  while (shortened.length > 1 && font.widthOfTextAtSize(`${shortened}…`, size) > width) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function drawLine(page: PDFPage, x1: number, y1: number, x2: number, y2: number, thickness = 1) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness, color: BLACK });
}

async function croppedLogoBytes() {
  const response = await fetch("/raindrop-education-logo.png");
  if (!response.ok) throw new Error("Logo could not be loaded.");
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return new Uint8Array(await blob.arrayBuffer());
  context.drawImage(bitmap, 0, 0);
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      const index = (y * canvas.width + x) * 4;
      const nonWhite = pixels[index + 3] > 10 && (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245);
      if (nonWhite) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  if (minX >= maxX || minY >= maxY) return new Uint8Array(await blob.arrayBuffer());
  const padding = 8;
  minX = Math.max(0, minX - padding);
  minY = Math.max(0, minY - padding);
  maxX = Math.min(canvas.width, maxX + padding);
  maxY = Math.min(canvas.height, maxY + padding);
  const cropped = document.createElement("canvas");
  cropped.width = maxX - minX;
  cropped.height = maxY - minY;
  cropped.getContext("2d")?.drawImage(canvas, minX, minY, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
  const croppedBlob = await new Promise<Blob>((resolve, reject) => {
    cropped.toBlob((value) => value ? resolve(value) : reject(new Error("Logo could not be prepared.")), "image/png");
  });
  return new Uint8Array(await croppedBlob.arrayBuffer());
}

function drawFormPage(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  logo: Awaited<ReturnType<PDFDocument["embedPng"]>>,
  input: ReimbursementPdfInput,
  shownExpenses: PdfExpense[],
  pageNumber: number,
  pageCount: number,
) {
  const margin = 34;
  const right = PAGE_WIDTH - margin;
  const total = input.expenses.reduce((sum, expense) => sum + (Number(expense.cost) || 0), 0);

  const logoWidth = 235;
  const logoHeight = logoWidth * (logo.height / logo.width);
  page.drawImage(logo, { x: margin, y: 704, width: logoWidth, height: logoHeight });

  page.drawText("Raindrop of Dallas", { x: margin, y: 657, size: 12.5, font: regular, color: BLACK });
  page.drawText("Tel:", { x: margin, y: 612, size: 12.5, font: regular, color: BLACK });
  page.drawText(input.phone, { x: 64, y: 612, size: 12.5, font: regular, color: BLACK });
  page.drawText("EIN:", { x: margin, y: 598, size: 12.5, font: regular, color: BLACK });

  page.drawText("Name/Payee:", { x: margin, y: 568, size: 12.5, font: regular, color: BLACK });
  page.drawText(fitText(input.name, regular, 12.5, 190), { x: 124, y: 568, size: 12.5, font: regular, color: BLACK });
  page.drawText("Today’s date:", { x: 392, y: 568, size: 12.5, font: regular, color: BLACK });
  page.drawText(mmddyy(input.requestDate), { x: 475, y: 568, size: 12.5, font: regular, color: BLACK });

  page.drawText("Address:", { x: margin, y: 539, size: 12.5, font: regular, color: BLACK });
  page.drawText(fitText(input.address, regular, 12.5, 465), { x: 86, y: 539, size: 12.5, font: regular, color: BLACK });

  page.drawText("Please use this form as an Expenses Reimbursement Request Form. Be sure to list expenses below along", { x: margin, y: 510, size: 11.3, font: regular, color: BLACK });
  page.drawText("with the date, description, and cost for tracking purposes.", { x: margin, y: 496, size: 11.3, font: regular, color: BLACK });
  page.drawText("Remember to attach all receipts to this form.", { x: margin, y: 482, size: 11.3, font: regular, color: BLACK });

  const tableX = margin;
  const tableWidth = right - margin;
  const col1 = tableX + 70;
  const col2 = col1 + 145;
  const col3 = col2 + 250;
  const tableTop = 462;
  const headerHeight = 38;
  const rowHeight = 42;
  const totalHeight = 42;
  const tableBottom = tableTop - headerHeight - shownExpenses.length * rowHeight - totalHeight;

  drawLine(page, tableX, tableTop, right, tableTop, 1);
  drawLine(page, tableX, tableBottom, right, tableBottom, 1);
  drawLine(page, tableX, tableTop, tableX, tableBottom, 1);
  drawLine(page, col1, tableTop, col1, tableBottom, 1);
  drawLine(page, col2, tableTop, col2, tableBottom, 1);
  drawLine(page, col3, tableTop, col3, tableBottom, 1);
  drawLine(page, right, tableTop, right, tableBottom, 1);
  drawLine(page, tableX, tableTop - headerHeight, right, tableTop - headerHeight, 1);

  const center = (text: string, left: number, width: number, size = 11.5) => left + (width - regular.widthOfTextAtSize(text, size)) / 2;
  page.drawText("DATE", { x: center("DATE", tableX, col1 - tableX), y: tableTop - 24, size: 11.5, font: regular, color: BLACK });
  page.drawText("PAID TO", { x: center("PAID TO", col1, col2 - col1), y: tableTop - 24, size: 11.5, font: regular, color: BLACK });
  page.drawText("DESCRIPTION", { x: center("DESCRIPTION", col2, col3 - col2), y: tableTop - 24, size: 11.5, font: regular, color: BLACK });
  page.drawText("COST", { x: center("COST", col3, right - col3), y: tableTop - 24, size: 11.5, font: regular, color: BLACK });

  shownExpenses.forEach((expense, index) => {
    const rowTop = tableTop - headerHeight - index * rowHeight;
    const baseline = rowTop - 26;
    drawLine(page, tableX, rowTop - rowHeight, right, rowTop - rowHeight, 1);
    page.drawText(mmddyy(expense.date).slice(0, 5), { x: tableX + 7, y: baseline, size: 11.5, font: regular, color: BLACK });
    page.drawText(fitText(expense.paidTo, regular, 11.5, col2 - col1 - 12), { x: col1 + 6, y: baseline, size: 11.5, font: regular, color: BLACK });
    page.drawText(fitText(expense.description, regular, 11.5, col3 - col2 - 12), { x: col2 + 6, y: baseline, size: 11.5, font: regular, color: BLACK });
    page.drawText(dollars(Number(expense.cost) || 0), { x: col3 + 6, y: baseline, size: 11.5, font: regular, color: BLACK });
  });

  const isFinalPage = pageNumber === pageCount;
  const totalRowTop = tableBottom + totalHeight;
  page.drawText(isFinalPage ? "TOTAL:" : "CONTINUED", { x: isFinalPage ? col3 - 48 : col3 - 72, y: totalRowTop - 27, size: 11.5, font: regular, color: BLACK });
  if (isFinalPage) page.drawText(dollars(total), { x: col3 + 6, y: totalRowTop - 27, size: 11.5, font: regular, color: BLACK });

  const certificationY = tableBottom - 27;
  if (isFinalPage) {
    page.drawText("I certify that all expenses listed above were incurred for the benefit of the Raindrop of Dallas and I am", { x: margin, y: certificationY, size: 10.8, font: regular, color: BLACK });
    page.drawText("requesting to be reimbursed for these expenses.", { x: margin, y: certificationY - 14, size: 10.8, font: regular, color: BLACK });

    const signatureY = certificationY - 67;
    page.drawText("Signature", { x: margin, y: signatureY, size: 11.5, font: bold, color: BLACK });
    page.drawText("Request by", { x: margin, y: signatureY - 14, size: 11.5, font: bold, color: BLACK });
    page.drawText(fitText(input.name, bold, 11.5, 165), { x: 124, y: signatureY - 14, size: 11.5, font: bold, color: BLACK });
    page.drawText("Signature", { x: 410, y: signatureY, size: 11.5, font: bold, color: BLACK });
    page.drawText("Approved by", { x: 410, y: signatureY - 14, size: 11.5, font: bold, color: BLACK });
  } else {
    page.drawText(`Expenses continue on page ${pageNumber + 1}.`, { x: margin, y: certificationY, size: 10.8, font: bold, color: BLACK });
  }

  if (pageCount > 1) page.drawText(`Expense page ${pageNumber} of ${pageCount}`, { x: right - 90, y: 10, size: 7.5, font: regular, color: BLACK });
}

function receiptExtension(receipt: PdfReceipt) {
  return receipt.name.toLowerCase().split(".").pop() ?? "";
}

async function rasterizeReceipt(receipt: PdfReceipt) {
  let blob: Blob = receipt.file;
  const extension = receiptExtension(receipt);
  if (["heic", "heif"].includes(extension) || ["image/heic", "image/heif"].includes(receipt.file.type)) {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: receipt.file, toType: "image/png", quality: 0.94 });
    blob = Array.isArray(converted) ? converted[0] : converted;
  }

  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`${receipt.name} could not be converted to a PDF image.`);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const pngBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => value ? resolve(value) : reject(new Error(`${receipt.name} could not be converted to PNG.`)), "image/png");
  });
  return new Uint8Array(await pngBlob.arrayBuffer());
}

async function addImageReceipt(pdf: PDFDocument, receipt: PdfReceipt, regular: PDFFont) {
  const bytes = await rasterizeReceipt(receipt);
  const image = await pdf.embedPng(bytes);
  const page = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  page.drawText(`Receipt — ${receipt.name}`, { x: 30, y: 767, size: 9, font: regular, color: BLACK });
  const maxWidth = PAGE_WIDTH - 60;
  const maxHeight = PAGE_HEIGHT - 80;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: (PAGE_WIDTH - width) / 2, y: 24 + (maxHeight - height) / 2, width, height });
}

export async function generateReimbursementPdf(input: ReimbursementPdfInput) {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await croppedLogoBytes());
  const expensePageCount = Math.max(1, Math.ceil(input.expenses.length / EXPENSES_PER_PAGE));
  for (let pageIndex = 0; pageIndex < expensePageCount; pageIndex += 1) {
    const start = pageIndex * EXPENSES_PER_PAGE;
    const shownExpenses = input.expenses.slice(start, start + EXPENSES_PER_PAGE);
    drawFormPage(pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]), regular, bold, logo, input, shownExpenses, pageIndex + 1, expensePageCount);
  }

  for (const receipt of input.receipts) {
    if (receipt.file.type === "application/pdf" || receipt.name.toLowerCase().endsWith(".pdf")) {
      const source = await PDFDocument.load(await receipt.file.arrayBuffer(), { ignoreEncryption: true });
      const pages = await pdf.copyPages(source, source.getPageIndices());
      pages.forEach((page) => pdf.addPage(page));
    } else if (receipt.file.type.startsWith("image/") || ["jpg", "jpeg", "jfif", "png", "webp", "heic", "heif", "gif", "bmp"].includes(receiptExtension(receipt))) {
      try {
        await addImageReceipt(pdf, receipt, regular);
      } catch {
        throw new Error(`${receipt.name} could not be read as an image. Try saving it as JPG, PNG, HEIC, or PDF.`);
      }
    } else {
      throw new Error(`${receipt.name} is not a supported image or PDF receipt.`);
    }
  }

  return pdf.save();
}
