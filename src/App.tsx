"use client";

import { type ChangeEvent, type DragEvent, useEffect, useMemo, useState } from "react";
import { generateReimbursementPdf, type PdfReceipt } from "./lib/reimbursement-pdf";
import { analyzeReceipt } from "./lib/receipt-analysis";

type Receipt = PdfReceipt & { id: string };
type Expense = { id: number; date: string; paidTo: string; description: string; cost: string; receipts: Receipt[]; analyzed?: boolean };

const blankExpense = (): Expense => ({ id: Date.now() + Math.random(), date: "", paidTo: "", description: "", cost: "", receipts: [] });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const prettyDate = (date: string) => date ? new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const shortDate = (date: string) => {
  const [, month, day] = date.split("-");
  return month && day ? `${month}/${day}` : date;
};
const formDate = (date: string) => {
  const [year, month, day] = date.split("-");
  return year && month && day ? `${month}/${day}/${year.slice(-2)}` : date;
};

const receiptExtensions = [".pdf", ".jpg", ".jpeg", ".jfif", ".png", ".webp", ".heic", ".heif", ".gif", ".bmp"];
const isSupportedReceipt = (file: File) => {
  const name = file.name.toLowerCase();
  return file.type === "application/pdf" || file.type.startsWith("image/") || receiptExtensions.some((extension) => name.endsWith(extension));
};

export default function Home() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [recipient, setRecipient] = useState("");
  const [requestDate, setRequestDate] = useState("");
  const [expenses, setExpenses] = useState<Expense[]>([{ id: 1, date: "", paidTo: "", description: "", cost: "", receipts: [] }]);
  const [reviewing, setReviewing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("");
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStatus, setAnalysisStatus] = useState("");
  useEffect(() => () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
  }, [downloadUrl]);

  const total = useMemo(() => expenses.reduce((sum, expense) => sum + (Number(expense.cost) || 0), 0), [expenses]);
  const completeExpenses = expenses.filter((expense) => expense.date && expense.paidTo.trim() && expense.description.trim() && Number(expense.cost) > 0);
  const allReceipts = expenses.flatMap((expense) => expense.receipts);
  const expensePageCount = Math.max(1, Math.ceil(expenses.length / 6));

  function updateExpense(id: number, field: keyof Expense, value: string) {
    setExpenses((current) => current.map((expense) => expense.id === id ? { ...expense, [field]: value } : expense));
    setError("");
  }

  function removeExpense(id: number) {
    setExpenses((current) => current.length === 1 ? current : current.filter((expense) => expense.id !== id));
  }

  function addReceipts(expenseId: number, event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    const unsupported = incoming.find((file) => !isSupportedReceipt(file));
    if (unsupported) {
      setError(`${unsupported.name} could not be recognized as an image or PDF receipt.`);
      event.target.value = "";
      return;
    }
    const newReceipts = incoming.map((file, index) => ({ id: `${Date.now()}-${index}-${file.name}`, name: file.name, file }));
    setExpenses((current) => current.map((expense) => expense.id === expenseId ? { ...expense, receipts: [...expense.receipts, ...newReceipts] } : expense));
    setError("");
    event.target.value = "";
  }

  async function processAutoReceipts(incoming: File[]) {
    if (!incoming.length || analyzing) return;
    const unsupported = incoming.find((file) => !isSupportedReceipt(file));
    if (unsupported) {
      setError(`${unsupported.name} could not be recognized as an image or PDF receipt.`);
      return;
    }

    setAnalyzing(true);
    setError("");
    const created: Expense[] = [];
    let incompleteCount = 0;

    for (let index = 0; index < incoming.length; index += 1) {
      const file = incoming[index];
      const receipt: Receipt = { id: `${Date.now()}-${index}-${file.name}`, name: file.name, file };
      try {
        setAnalysisStatus(`Analyzing ${index + 1} of ${incoming.length}: ${file.name}`);
        const analysis = await analyzeReceipt(file, (message, progress) => {
          const percentage = typeof progress === "number" ? ` ${Math.round(progress * 100)}%` : "";
          setAnalysisStatus(`${message}${percentage} · ${index + 1} of ${incoming.length}`);
        });
        if (!analysis.date || !analysis.vendor || !analysis.total) incompleteCount += 1;
        created.push({
          id: Date.now() + index + Math.random(),
          date: analysis.date,
          paidTo: analysis.vendor,
          description: "",
          cost: analysis.total,
          receipts: [receipt],
          analyzed: true,
        });
      } catch {
        incompleteCount += 1;
        created.push({ ...blankExpense(), receipts: [receipt], description: "", analyzed: true });
      }
    }

    setExpenses((current) => {
      const onlyBlankRow = current.length === 1 && !current[0].date && !current[0].paidTo && !current[0].description && !current[0].cost && !current[0].receipts.length;
      return onlyBlankRow ? created : [...current, ...created];
    });
    setAnalysisStatus(`${created.length} expense${created.length === 1 ? "" : "s"} created from receipts.`);
    if (incompleteCount) setError(`Review the highlighted receipt${incompleteCount === 1 ? "" : "s"}; some fields could not be read confidently.`);
    setAnalyzing(false);
  }

  function handleAutoReceiptInput(event: ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files ?? []);
    event.target.value = "";
    void processAutoReceipts(incoming);
  }

  function handleReceiptDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    void processAutoReceipts(Array.from(event.dataTransfer.files));
  }

  function removeReceipt(expenseId: number, receiptId: string) {
    setExpenses((current) => current.map((expense) => expense.id === expenseId ? { ...expense, receipts: expense.receipts.filter((receipt) => receipt.id !== receiptId) } : expense));
  }

  function startReview() {
    if (!name.trim() || !phone.trim() || !address.trim() || !requestDate) return setError("Add the payee name, phone number, mailing address, and request date before continuing.");
    if (completeExpenses.length !== expenses.length) return setError("Complete the date, vendor, description, and cost for every expense.");
    if (expenses.some((expense) => !expense.receipts.length)) return setError("Add at least one receipt for every expense.");
    setError("");
    setReviewing(true);
  }

  const emailBody = [
    "Hello,",
    "",
    `Please find my reimbursement request for ${money.format(total)} attached.`,
    `The same PDF includes ${allReceipts.length} receipt${allReceipts.length === 1 ? "" : "s"} after the reimbursement form.`,
    "",
    ...completeExpenses.map((expense) => `• ${prettyDate(expense.date)} — ${expense.paidTo}: ${expense.description} (${money.format(Number(expense.cost))})`),
    "",
    "Thank you,",
    name,
  ].join("\n");

  function gmailHref() {
    const parameters = new URLSearchParams({
      view: "cm",
      fs: "1",
      to: recipient,
      su: `Reimbursement Request — ${name} — ${money.format(total)}`,
      body: emailBody,
    });
    return `https://mail.google.com/mail/?${parameters.toString()}`;
  }

  async function downloadPdf(prepareEmail: boolean) {
    const gmailTab = prepareEmail ? window.open(gmailHref(), "_blank") : null;
    if (gmailTab) gmailTab.opener = null;
    setGenerating(true);
    setError("");
    try {
      const bytes = await generateReimbursementPdf({ name, phone, address, requestDate, expenses: completeExpenses, receipts: allReceipts });
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
      const url = URL.createObjectURL(new Blob([arrayBuffer], { type: "application/pdf" }));
      const fileName = `Reimbursement_${name.trim().replace(/\s+/g, "_")}_${requestDate}.pdf`;
      setDownloadUrl(url);
      setDownloadName(fileName);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      if (prepareEmail && !gmailTab) setError("The PDF was downloaded, but Gmail was blocked. Allow pop-ups for this site, then use “Open Gmail now.”");
    } catch (pdfError) {
      setError(pdfError instanceof Error ? pdfError.message : "The PDF could not be created.");
      setReviewing(false);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="app-name" href="#top">Reimbursement</a>
        <div className="header-logo-crop"><img src="/raindrop-education-logo.png" alt="Raindrop Education" /></div>
      </header>

      <div className="workspace" id="top">
        <div className="page-heading"><div><h1>Reimbursement request</h1><span>Raindrop of Dallas</span></div><strong>{money.format(total)}</strong></div>

        <div className="content-grid">
          <section className="editor-card" aria-labelledby="request-details">
            <div className="section-heading">
              <h2 id="request-details">Request details</h2>
            </div>

            <div className="field-grid">
              <label className="field field-wide"><span>Name / Payee</span><input placeholder="Full name" value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className="field"><span>Phone</span><input inputMode="tel" placeholder="Phone number" value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
              <label className="field"><span>Request date</span><input type="date" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} /></label>
              <label className="field field-wide"><span>Mailing address</span><input placeholder="Street, city, state, ZIP" value={address} onChange={(event) => setAddress(event.target.value)} /></label>
            </div>

            <div className="section-heading expenses-heading">
              <h2>Expenses</h2>
              <strong>{money.format(total)}</strong>
            </div>

            <label className={`receipt-analyzer ${analyzing ? "is-analyzing" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={handleReceiptDrop}>
              <input type="file" accept="image/*,application/pdf,.pdf,.heic,.heif,.webp,.gif,.bmp,.jfif" multiple disabled={analyzing} onChange={handleAutoReceiptInput} />
              <span className="analyzer-icon">✦</span>
              <span className="analyzer-copy"><strong>{analyzing ? "Analyzing receipts…" : "Upload receipts to create expenses"}</strong><small>{analyzing ? analysisStatus : "Drop files here or click to select. Date, vendor, and total will be filled automatically."}</small></span>
              <span className="analyzer-action">{analyzing ? "Please wait" : "Choose receipts"}</span>
            </label>
            {!analyzing && analysisStatus && <p className="analysis-success">✓ {analysisStatus}</p>}

            <div className="expense-list">
              {expenses.map((expense, index) => (
                <article className="expense-card" key={expense.id}>
                  <div className="expense-grid">
                    <div className="expense-index">{index + 1}</div>
                    <label className="field compact"><span>Date</span><input type="date" value={expense.date} onChange={(event) => updateExpense(expense.id, "date", event.target.value)} /></label>
                    <label className="field compact"><span>Paid to</span><input placeholder="Vendor" value={expense.paidTo} onChange={(event) => updateExpense(expense.id, "paidTo", event.target.value)} /></label>
                    <label className="field compact description-field"><span>Description</span><input placeholder="Purpose of purchase" value={expense.description} onChange={(event) => updateExpense(expense.id, "description", event.target.value)} /></label>
                    <label className="field compact cost-field"><span>Cost</span><div className="money-input"><i>$</i><input inputMode="decimal" placeholder="0.00" value={expense.cost} onChange={(event) => updateExpense(expense.id, "cost", event.target.value.replace(/[^0-9.]/g, ""))} /></div></label>
                    <button className="remove-button" type="button" onClick={() => removeExpense(expense.id)} aria-label={`Remove expense ${index + 1}`}>×</button>
                  </div>
                  {expense.analyzed && <span className={`analysis-badge ${expense.date && expense.paidTo && expense.cost ? "complete" : "review"}`}>{expense.date && expense.paidTo && expense.cost ? "Receipt analyzed · add description" : "Review detected fields"}</span>}
                  <div className="expense-receipts">
                    <label className="row-receipt-button">+ Add supporting receipt<input type="file" accept="image/*,application/pdf,.pdf,.heic,.heif,.webp,.gif,.bmp,.jfif" multiple onChange={(event) => addReceipts(expense.id, event)} /></label>
                    {expense.receipts.length ? <ul>{expense.receipts.map((receipt) => <li key={receipt.id}><span>{receipt.name}</span><button type="button" onClick={() => removeReceipt(expense.id, receipt.id)} aria-label={`Remove ${receipt.name}`}>×</button></li>)}</ul> : <span className="receipt-empty">No receipt</span>}
                  </div>
                </article>
              ))}
            </div>
            <button className="add-button" type="button" onClick={() => setExpenses((current) => [...current, blankExpense()])}>+ Add another expense</button>
          </section>

          <aside className="summary-card">
            <div className="total-block"><span>Reimbursement total</span><strong>{money.format(total)}</strong><small>{expenses.length} expense{expenses.length === 1 ? "" : "s"}</small></div>
            <dl className="summary-details">
              <div><dt>Payee</dt><dd>{name || "—"}</dd></div>
              <div><dt>Request date</dt><dd>{prettyDate(requestDate)}</dd></div>
              <div><dt>PDF pages</dt><dd>{expensePageCount + allReceipts.length} minimum</dd></div>
              <div><dt>Receipts</dt><dd>{allReceipts.length}</dd></div>
            </dl>
            {error && <p className="error-message" role="alert">{error}</p>}
            <button className="primary-button" type="button" onClick={startReview}>Review exact PDF</button>
          </aside>
        </div>
      </div>

      {reviewing && (
        <div className="review-overlay" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="review-panel exact-review-panel">
            <div className="review-header">
              <div><p className="eyebrow">Final check</p><h2 id="review-title">Exact form preview</h2></div>
              <button className="close-button" type="button" onClick={() => setReviewing(false)} aria-label="Close review">×</button>
            </div>

            <div className="exact-preview" aria-label="Exact reimbursement PDF preview">
              <div className="preview-logo-crop"><img src="/raindrop-education-logo.png" alt="Raindrop Education" /></div>
              <p className="preview-org">Raindrop of Dallas</p>
              <p>Tel:&nbsp;&nbsp; {phone}<br />EIN:</p>
              <div className="preview-payee"><span>Name/Payee:&nbsp;&nbsp; <b>{name}</b></span><span>Today’s date: {formDate(requestDate)}</span></div>
              <p>Address: {address}</p>
              <p className="preview-instructions">Please use this form as an Expenses Reimbursement Request Form. Be sure to list expenses below along with the date, description, and cost for tracking purposes.<br />Remember to attach all receipts to this form.</p>
              <table><thead><tr><th>DATE</th><th>PAID TO</th><th>DESCRIPTION</th><th>COST</th></tr></thead><tbody>{completeExpenses.map((expense) => <tr key={expense.id}><td>{shortDate(expense.date)}</td><td>{expense.paidTo}</td><td>{expense.description}</td><td>{money.format(Number(expense.cost))}</td></tr>)}<tr className="preview-total"><td /><td /><td>TOTAL:</td><td>{money.format(total)}</td></tr></tbody></table>
              <p className="preview-certification">I certify that all expenses listed above were incurred for the benefit of the Raindrop of Dallas and I am requesting to be reimbursed for these expenses.</p>
              <div className="preview-signatures"><b>Signature<br />Request by&nbsp;&nbsp;&nbsp;&nbsp; {name}</b><b>Signature<br />Approved by</b></div>
            </div>

            <div className="receipt-confirmation"><strong>{allReceipts.length} receipt{allReceipts.length === 1 ? "" : "s"}</strong><span>will be appended after {expensePageCount} expense page{expensePageCount === 1 ? "" : "s"} inside the same PDF.</span></div>
            <label className="field"><span>Send email to</span><input type="email" placeholder="approver@example.org" value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label>
            <div className="review-actions">
              <button className="secondary-button" type="button" disabled={generating} onClick={() => downloadPdf(false)}>{generating ? "Creating PDF…" : "Download exact PDF"}</button>
              <button className="primary-action" type="button" disabled={generating} onClick={() => downloadPdf(true)}>{generating ? "Creating PDF…" : "Download PDF, then go to Gmail"}</button>
            </div>
            {downloadUrl && <div className="ready-actions"><a className="download-again" href={downloadUrl} download={downloadName}>PDF ready — download again</a><a className="gmail-direct" href={gmailHref()} target="_blank" rel="noopener noreferrer">Open Gmail now</a></div>}
            <p className="attachment-note">The blue button opens Gmail in a new tab and downloads the PDF from this form. Attach the downloaded PDF; it already contains every receipt.</p>
          </div>
        </div>
      )}
    </main>
  );
}
