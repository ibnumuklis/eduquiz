/** Serializable PDF spec (built on the server, rendered to PDF in the browser with jsPDF). */
export interface PdfTable { heading?: string; note?: string; head: string[]; body: (string | number | null)[][]; columnWidths?: (number | "auto")[] }
export interface PdfParagraphs { heading?: string; items: { title?: string; text: string }[] }
export interface PdfSpec {
  filename: string;
  title: string;
  subtitle?: string;
  school?: string;
  meta?: [string, string][];
  landscape?: boolean;
  sections: (PdfTable | PdfParagraphs)[];
}

const BRAND: [number, number, number] = [79, 70, 229];

function clean(v: unknown) {
  // Strip $…$ math delimiters for plain-text PDF output.
  return String(v ?? "").replace(/\$\$?([^$]+)\$\$?/g, "$1");
}

export async function renderPdf(spec: PdfSpec) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const doc = new jsPDF({ orientation: spec.landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Header band
  doc.setFillColor(...BRAND);
  doc.rect(0, 0, W, 4, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  if (spec.school) doc.text(spec.school.toUpperCase(), margin, 13);
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(doc.splitTextToSize(clean(spec.title), W - margin * 2), margin, 21);
  let y = 28;
  if (spec.subtitle) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    const lines = doc.splitTextToSize(clean(spec.subtitle), W - margin * 2);
    doc.text(lines, margin, y);
    y += lines.length * 5;
  }
  const meta: [string, string][] = [...(spec.meta ?? []), ["Dicetak", new Date().toLocaleString("id-ID", { dateStyle: "long", timeStyle: "short" })]];
  doc.setFontSize(9);
  meta.forEach(([k, v], i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = margin + col * ((W - margin * 2) / 2);
    doc.setFont("helvetica", "bold"); doc.setTextColor(100, 116, 139); doc.text(`${k}:`, x, y + 2 + row * 5);
    doc.setFont("helvetica", "normal"); doc.setTextColor(30, 41, 59); doc.text(clean(v), x + doc.getTextWidth(`${k}: `), y + 2 + row * 5);
  });
  y += Math.ceil(meta.length / 2) * 5 + 4;

  for (const section of spec.sections) {
    if (y > doc.internal.pageSize.getHeight() - 30) { doc.addPage(); y = 18; }
    if (section.heading) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...BRAND);
      doc.text(clean(section.heading), margin, y + 4);
      y += 8;
    }
    if ("head" in section) {
      if (section.note) {
        doc.setFont("helvetica", "italic"); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
        const lines = doc.splitTextToSize(clean(section.note), W - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 4 + 1;
      }
      autoTable(doc, {
        startY: y,
        head: [section.head.map(clean)],
        body: section.body.map((r) => r.map((c) => (c === null || c === undefined ? "—" : clean(c)))),
        margin: { left: margin, right: margin },
        styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [30, 41, 59] },
        headStyles: { fillColor: BRAND, textColor: 255, fontStyle: "bold" },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: Object.fromEntries((section.columnWidths ?? []).map((w, i) => [i, { cellWidth: w }])),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    } else {
      doc.setFontSize(9.5);
      for (const item of section.items) {
        const body = doc.splitTextToSize(clean(item.text), W - margin * 2);
        const need = body.length * 4.5 + (item.title ? 5 : 0) + 3;
        if (y + need > doc.internal.pageSize.getHeight() - 16) { doc.addPage(); y = 18; }
        if (item.title) { doc.setFont("helvetica", "bold"); doc.setTextColor(15, 23, 42); doc.text(clean(item.title), margin, y); y += 5; }
        doc.setFont("helvetica", "normal"); doc.setTextColor(51, 65, 85); doc.text(body, margin, y); y += body.length * 4.5 + 3;
      }
      y += 3;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const H = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(148, 163, 184);
    doc.text("Dibuat dengan EDUQUIZ — Learn. Play. Achieve.", margin, H - 8);
    doc.text(`Halaman ${i} dari ${pages}`, W - margin, H - 8, { align: "right" });
  }
  doc.save(spec.filename.endsWith(".pdf") ? spec.filename : `${spec.filename}.pdf`);
}

export function safeFilename(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "laporan";
}
