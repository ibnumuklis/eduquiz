import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { PwaRegister } from "@/components/pwa-register";
import { BackToTop } from "@/components/back-to-top";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EDUQUIZ — Learn. Play. Achieve.", template: "%s · EDUQUIZ" },
  description: "Platform kuis interaktif untuk sekolah: guru membuat, membagikan, dan menilai kuis; siswa belajar sambil bermain.",
  applicationName: "EDUQUIZ",
  appleWebApp: { capable: true, title: "EDUQUIZ", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-dvh font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
        <PwaRegister />
        <BackToTop />
      </body>
    </html>
  );
}
