"use client";
import { useState } from "react";
import { FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { renderPdf, type PdfSpec } from "@/lib/pdf/report";

export function PdfButton({ spec, label = "Unduh PDF", variant = "outline", size = "md" }: {
  spec: PdfSpec; label?: string; variant?: "outline" | "primary" | "secondary" | "ghost"; size?: "sm" | "md";
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button variant={variant} size={size} loading={busy} tooltip="Unduh laporan ini sebagai file PDF siap cetak/kirim"
      onClick={async () => {
        setBusy(true);
        try { await renderPdf(spec); } catch { toast.error("Gagal membuat PDF. Coba lagi."); } finally { setBusy(false); }
      }}>
      <FileDown className="h-4 w-4" /> {label}
    </Button>
  );
}
