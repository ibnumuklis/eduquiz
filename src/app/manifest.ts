import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "EDUQUIZ — Learn. Play. Achieve.",
    short_name: "EDUQUIZ",
    description: "Kuis interaktif untuk sekolah: latihan, ujian, dan analisis ketuntasan.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f7fb",
    theme_color: "#4f46e5",
    lang: "id",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Gabung kuis dengan kode", url: "/student/join" },
      { name: "Kuis saya (guru)", url: "/teacher/quizzes" },
    ],
  };
}
