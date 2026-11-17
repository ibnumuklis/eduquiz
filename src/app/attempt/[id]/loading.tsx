import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
        <p className="text-sm">Menyiapkan soal…</p>
      </div>
    </div>
  );
}
