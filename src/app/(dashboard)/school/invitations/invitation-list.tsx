"use client";
import { useState, useTransition } from "react";
import { Ban, Copy, Link2, Mail } from "lucide-react";
import { toast } from "sonner";
import { revokeInvitation } from "@/features/schools/actions";
import { Card, CardHeader } from "@/components/ui/card";
import { Badge, EmptyState, type BadgeTone } from "@/components/ui/feedback";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Table, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export interface InvitationRow {
  id: string;
  code: string;
  role: "school_admin" | "teacher" | "student";
  email: string | null;
  full_name: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  class: { name: string } | null;
}

const roleLabel = { school_admin: "Admin", teacher: "Guru", student: "Siswa" };

function statusOf(r: InvitationRow): [string, BadgeTone] {
  if (r.revoked_at) return ["Dicabut", "red"];
  if (r.used_count >= r.max_uses) return ["Terpakai", "slate"];
  if (new Date(r.expires_at) < new Date()) return ["Kedaluwarsa", "amber"];
  return ["Aktif", "green"];
}

export function InvitationList({ rows, baseUrl }: { rows: InvitationRow[]; baseUrl: string }) {
  const [pending, start] = useTransition();
  const [revoke, setRevoke] = useState<InvitationRow | null>(null);
  const copy = (text: string, label: string) => { navigator.clipboard.writeText(text); toast.success(`${label} disalin`); };

  return (
    <Card className="h-fit">
      <CardHeader title="Daftar undangan" description="Bagikan kode atau tautan pendaftaran kepada penerima" />
      {rows.length === 0 ? (
        <EmptyState className="m-4" icon={Mail} title="Belum ada undangan" />
      ) : (
        <Table>
          <THead><tr><TH>Kode</TH><TH>Penerima</TH><TH>Peran</TH><TH>Pemakaian</TH><TH>Status</TH><TH className="text-right">Aksi</TH></tr></THead>
          <tbody>
            {rows.map((r) => {
              const [label, tone] = statusOf(r);
              const active = label === "Aktif";
              return (
                <TR key={r.id}>
                  <TD className="font-mono font-bold tracking-widest text-slate-800">{r.code}</TD>
                  <TD>
                    <p className="text-sm text-slate-800">{r.full_name ?? r.email ?? "Kode terbuka"}</p>
                    <p className="text-xs text-slate-500">{[r.email && r.full_name ? r.email : null, r.class?.name && `Kelas ${r.class.name}`].filter(Boolean).join(" · ") || `s/d ${formatDate(r.expires_at)}`}</p>
                  </TD>
                  <TD><Badge tone="brand">{roleLabel[r.role]}</Badge></TD>
                  <TD className="text-xs">{r.used_count}/{r.max_uses}</TD>
                  <TD><Badge tone={tone}>{label}</Badge></TD>
                  <TD className="whitespace-nowrap text-right">
                    <Button variant="ghost" size="icon" aria-label="Salin kode" onClick={() => copy(r.code, "Kode")}><Copy className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Salin tautan daftar" onClick={() => copy(`${baseUrl}/register?invite=${r.code}`, "Tautan")}><Link2 className="h-4 w-4" /></Button>
                    {active && <Button variant="ghost" size="icon" aria-label="Cabut" onClick={() => setRevoke(r)}><Ban className="h-4 w-4 text-rose-500" /></Button>}
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}
      <ConfirmDialog
        open={!!revoke} onClose={() => setRevoke(null)} title={`Cabut undangan ${revoke?.code}?`}
        description="Kode tidak dapat digunakan lagi. Anggota yang sudah bergabung tidak terpengaruh."
        confirmLabel="Cabut" loading={pending}
        onConfirm={() => start(async () => { if (!revoke) return; const r = await revokeInvitation(revoke.id); if (r.ok) { toast.success(r.message ?? "OK"); setRevoke(null); } else toast.error(r.error); })}
      />
    </Card>
  );
}
