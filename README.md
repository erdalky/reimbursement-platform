# Raindrop Reimbursement Automation

A client-side reimbursement application built for Raindrop of Dallas. It converts expense details and uploaded receipts into a standardized, multi-page, email-ready PDF packet.

## Project impact

The application redesigned the reimbursement workflow for a $1.2M education department within a $4M 501(c)(3) nonprofit, reducing the reported processing cycle from 15 days to 2 days.

## Features

- Upload multiple receipt images, HEIC files, or PDFs.
- Extract receipt dates, vendors, and totals with client-side OCR.
- Keep descriptions editable for manual entry and flag uncertain OCR results for review.
- Calculate reimbursement totals automatically.
- Generate dynamically paginated reimbursement forms with PDF-lib.
- Append every uploaded receipt to the same PDF packet.
- Open a pre-addressed Gmail draft in a separate browser tab.
- Process reimbursement data locally without storing receipts or form entries in a database.

## Technology

- React and TypeScript
- Vite
- Tesseract.js for OCR
- PDF.js for PDF text extraction and rendering
- PDF-lib for document generation and receipt merging
- heic2any for HEIC conversion
- Cloudflare Pages for deployment

## Project structure

```text
src/
  App.tsx                    Main form and application workflow
  main.tsx                   React entry point
  styles.css                 Responsive interface styling
  lib/
    receipt-analysis.ts      OCR and receipt field extraction
    reimbursement-pdf.ts    PDF form generation and receipt merging
public/
  _headers                   Cloudflare cache rules
  _redirects                 Cloudflare SPA routing rule
  favicon.svg                Browser icon
  raindrop-education-logo.png
index.html                   Browser entry document
vite.config.ts               Vite build configuration
```

## Run locally

Requirements: Node.js 20.19 or later.

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The deployable static site is generated in `dist/`. For Cloudflare Pages, use `npm run build` as the build command and `dist` as the output directory.

## Privacy

Receipt images and reimbursement fields are processed in the browser. They are not saved to an application database. Refreshing the page clears the current form, and generated PDFs are downloaded directly to the user's device.
