"use client";
import { useRef, useState, useTransition } from "react";
import { BookText, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { deleteStimulus, saveStimulus } from "@/features/quizzes/actions";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { EmptyState } from "@/components/ui/feedback";
import type { Stimulus } from "@/types";

export function StimulusManager({ quizId, schoolId, stimuli, usage, open, onClose }: {
  quizId: string; schoolId: string; stimuli: Stimulus[]; usage: Record<string, number>; open: boolean; onClose: () => void;
}) {
  const [editing, setEditing] = useState<Stimulus | "new" | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  function edit(s: Stimulus | "new") {
    setEditing(s);
    setTitle(s === "new" ? "" : s.title ?? "");
    setContent(s === "new" ? "" : s.content);
    setImagePath(s === "new" ? null : s.image_path);
    setPreview(s === "new" ? null : s.image_url ?? null);
  }

  async function onImage(file: File) {
    if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) return toast.error("Gambar maks. 5 MB");
    setUploading(true);
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${schoolId}/${quizId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await createClient().storage.from("quiz-media").upload(path, file, { contentType: file.type });
    setUploading(false);
    if (error) return toast.error("Gagal mengunggah gambar");
    setImagePath(path);
    setPreview(URL.createObjectURL(file));
  }

  const save = () => start(async () => {
    const r = await saveStimulus(quizId, editing === "new" || !editing ? null : editing.id, { title, content, image_path: imagePath });
    if (r.ok) { toast.success(r.message ?? "Tersimpan"); setEditing(null); } else toast.error(r.error);
  });

  return (
    <Dialog open={open} onClose={() => { setEditing(null); onClose(); }} title="Stimulus & bacaan bersama" size="lg"
      description="Satu bacaan, grafik, atau tabel dapat dipakai beberapa soal — seperti format AKM.">
      {editing ? (
        <div className="space-y-4">
          <Field label="Judul (opsional)" htmlFor="stim-title"><Input id="stim-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Teks 1 — Sampah Plastik di Laut" /></Field>
          <Field label="Isi stimulus" htmlFor="stim-content" hint="Teks bacaan, data, atau konteks soal. Maks. 20.000 karakter.">
            <Textarea id="stim-content" rows={10} value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} />
          </Field>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && onImage(e.target.files[0])} />
          {preview ? (
            <div className="relative inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Gambar stimulus" className="max-h-48 rounded-xl border" />
              <button type="button" onClick={() => { setPreview(null); setImagePath(null); }} className="absolute -right-2 -top-2 rounded-full bg-white p-1 shadow" aria-label="Hapus gambar"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <Button variant="outline" size="sm" loading={uploading} onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" /> Tambah gambar / grafik</Button>
          )}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>Kembali</Button>
            <Button onClick={save} loading={pending || uploading} disabled={!content.trim()}>Simpan stimulus</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {stimuli.length === 0 ? (
            <EmptyState icon={BookText} title="Belum ada stimulus" description="Buat bacaan bersama, lalu pilih stimulus ini saat membuat soal." />
          ) : (
            <ul className="space-y-2">
              {stimuli.map((s) => (
                <li key={s.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3">
                  <BookText className="mt-0.5 h-5 w-5 shrink-0 text-violet-500" />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-800">{s.title || "Tanpa judul"}</p>
                    <p className="line-clamp-2 text-sm text-slate-500">{s.content}</p>
                    <p className="mt-1 text-xs text-slate-400">Dipakai {usage[s.id] ?? 0} soal</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Edit stimulus" onClick={() => edit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Hapus stimulus" disabled={pending}
                    onClick={() => start(async () => { const r = await deleteStimulus(quizId, s.id); if (r.ok) toast.success(r.message ?? "OK"); else toast.error(r.error); })}>
                    <Trash2 className="h-4 w-4 text-rose-500" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button onClick={() => edit("new")}><Plus className="h-4 w-4" /> Stimulus baru</Button>
        </div>
      )}
    </Dialog>
  );
}
