// Generates PWA icons from the EDUQUIZ mark (run: node scripts/make-icons.mjs)
import sharp from "sharp";
const mark = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f46e5"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#g)"/>
  <g transform="translate(${256 - (pad ? 150 : 180)} ${256 - (pad ? 150 : 180)}) scale(${pad ? 12.5 : 15})" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3 3 8l9 5 9-5-9-5Z"/><path d="M7 10.5v4.5c0 1.5 2.2 3 5 3s5-1.5 5-3v-4.5"/><path d="M21 8v6"/>
  </g>
</svg>`;
const out = [
  ["public/icons/icon-192.png", 192, false],
  ["public/icons/icon-512.png", 512, false],
  ["public/icons/maskable-512.png", 512, true],
  ["public/icons/apple-touch-icon.png", 180, true],
];
for (const [file, size, pad] of out) await sharp(Buffer.from(mark(pad))).resize(size, size).png().toFile(file);
console.log("icons ok");
