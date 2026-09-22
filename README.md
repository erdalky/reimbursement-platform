# Reimbursement Automation

A browser-based tool that turns expense details and photographed receipts into a
standardized, multi-page, email-ready PDF packet.

Staff at a nonprofit education department were reimbursing expenses by hand —
retyping receipt totals into a form, printing, scanning, and attaching each
receipt separately. This replaces that with one screen: drop in the receipts, let
OCR read them, correct anything it got wrong, and get back a single finished
packet. The reported processing cycle went from about fifteen days to two.

## Why it runs in the browser

Receipts are financial records belonging to real people. Sending them to a server
for OCR would mean storing them somewhere, securing that store, and answering for
it later — for a tool used a handful of times a week.

So nothing leaves the machine. Tesseract compiles to WebAssembly and runs in the
tab, PDF generation happens client-side, and there is no database and no backend.
The page refresh is the delete button. This was the constraint the design started
from, not a feature added at the end.

## A note on the live site

The deployed site isn't linked here. It carries information specific to one
community — internal contacts, form details, and organization-specific
configuration meant for the staff who use it — and that doesn't belong in a
public repository. This README covers the architecture and the code, which is the
part worth reading anyway.

If you're reviewing my work and want to see it running, ask me and I'll share it
directly.

## Features

- Upload multiple receipt images, HEIC files, or PDFs
- Extract dates, vendors, and totals with client-side OCR
- Flag low-confidence OCR results for review and keep every field editable
- Calculate reimbursement totals automatically
- Generate dynamically paginated reimbursement forms
- Append every uploaded receipt to the same PDF packet
- Open a pre-filled email draft in a separate tab
- Process everything locally, with no receipt or form data written to a database

## Technology

- **Frontend:** React, TypeScript, Vite
- **OCR:** Tesseract.js
- **PDF:** PDF.js for extraction and rendering, PDF-lib for generation and merging
- **Image handling:** heic2any for HEIC conversion
- **Deployment:** Cloudflare Pages

## Project structure

```text
src/
  App.tsx                    Main form and application workflow
  main.tsx                   React entry point
  styles.css                 Responsive interface styling
  lib/
    receipt-analysis.ts      OCR and receipt field extraction
    reimbursement-pdf.ts     PDF form generation and receipt merging
public/
  _headers                   Cloudflare cache rules
  _redirects                 Cloudflare SPA routing rule
  favicon.svg                Browser icon
  logo.png                   Organization mark used in the generated PDF
index.html                   Browser entry document
vite.config.ts               Vite build configuration
```

## Run locally

Requires Node.js 20.19 or later.

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

The deployable static site is generated in `dist/`. On Cloudflare Pages, use
`npm run build` as the build command and `dist` as the output directory.

## Privacy

Receipt images and form fields are processed in the browser and never written to
an application database. Refreshing the page clears the current form, and
generated PDFs are downloaded straight to the user's device.