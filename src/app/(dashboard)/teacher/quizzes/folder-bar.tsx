"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Folder, FolderPlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createFolder, deleteFolder, moveQuizToFolder } from "@/features/quizzes/actions";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function FolderBar({ folders, active, counts, hrefFor }: {
  folders: { id: string; name: string }[]; active: string; counts: Record<string, number>; hrefFor: Record<string, string>;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [del, setDel] = useState<{ id: string; name: string } | null>(null);
  const [pending, start] = useTransition();
  const chip = (key: string, label: string) => (
    <Link key={key} href={hrefFor[key]} className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition",
      active === key ? "border-brand-500 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-brand-200")}>
      {key !== "" && key !== "none" && <Folder className="h-3.5 w-3.5" />}{label}{counts[key] !== undefined && <span className="opacity-70">{counts[key]}</span>}
    </Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
      {chip("", "Semua")}
      {folders.map((f) => (
        <span key={f.id} className="group inline-flex items-center">
          {chip(f.id, f.name)}
          {active === f.id && (
            <button onClick={() => setDel(f)} className="ml-1 rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500" aria-label={`Hapus folder ${f.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
          )}
        </span>
      ))}
      {folders.length > 0 && chip("none", "Tanpa folder")}
      {adding ? (
        <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); start(async () => {
          const r = await createFolder(name);
          if (r.ok) { toast.success(r.message ?? "OK"); setAdding(false); setName(""); router.refresh(); } else toast.error(r.error);
        }); }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="Nama folder" className="h-8 w-40" aria-label="Nama folder" />
          <Button size="sm" type="submit" loading={pending} disabled={!name.trim()}>Buat</Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Batal</Button>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setAdding(true)}><FolderPlus className="h-4 w-4" /> Folder baru</Button>
      )}
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title={`Hapus folder "${del?.name}"?`} loading={pending}
        description="Kuis di dalamnya tidak ikut terhapus, hanya dikeluarkan dari folder." confirmLabel="Hapus folder"
        onConfirm={() => start(async () => { if (!del) return; const r = await deleteFolder(del.id); if (r.ok) { toast.success(r.message ?? "OK"); setDel(null); router.push("/teacher/quizzes"); } else toast.error(r.error); })} />
    </div>
  );
}

export function MoveToFolder({ quizId, folderId, folders }: { quizId: string; folderId: string | null; folders: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  if (!folders.length) return null;
  return (
    <Select value={folderId ?? ""} disabled={pending} aria-label="Pindahkan ke folder" className="h-8 w-36 text-xs"
      onChange={(e) => { const v = e.target.value || null; start(async () => { const r = await moveQuizToFolder(quizId, v); if (r.ok) toast.success(r.message ?? "OK"); else toast.error(r.error); }); }}>
      <option value="">Tanpa folder</option>
      {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
    </Select>
  );
}
