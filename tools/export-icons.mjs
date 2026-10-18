import fs from "node:fs/promises";
import sharp from "sharp";
const root = new URL("../", import.meta.url);
const svg = await fs.readFile(new URL("app/icon.svg", root));
await fs.mkdir(new URL("app/icons/", root), { recursive: true });
const sizes = [16, 32, 48, 180, 192, 512],
  pngs = new Map();
for (const size of sizes) {
  const png = await sharp(svg).resize(size, size).png().toBuffer();
  pngs.set(size, png);
  await fs.writeFile(new URL(`app/icons/icon-${size}.png`, root), png);
}
const mark = svg
  .toString()
  .replace(/^<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");
const mask = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" fill="#253126"/><g transform="translate(33.6 33.6) scale(.65)">${mark}</g></svg>`,
);
await fs.writeFile(new URL("artwork/icon-maskable.svg", root), mask);
await sharp(mask)
  .resize(512, 512)
  .png()
  .toFile(
    new URL("app/icons/icon-maskable-512.png", root).pathname.replace(
      /^\/([A-Za-z]:)/,
      "$1",
    ),
  );
const ico = Buffer.alloc(6 + 3 * 16);
ico.writeUInt16LE(1, 2);
ico.writeUInt16LE(3, 4);
let offset = ico.length;
for (const [i, size] of [16, 32, 48].entries()) {
  const data = pngs.get(size),
    p = 6 + i * 16;
  ico[p] = size;
  ico[p + 1] = size;
  ico.writeUInt16LE(1, p + 4);
  ico.writeUInt16LE(32, p + 6);
  ico.writeUInt32LE(data.length, p + 8);
  ico.writeUInt32LE(offset, p + 12);
  offset += data.length;
}
await fs.writeFile(
  new URL("app/icons/favicon.ico", root),
  Buffer.concat([ico, ...[16, 32, 48].map((s) => pngs.get(s))]),
);
console.log(
  "Exported 16/32/48/180/192/512 PNG, safe-area maskable PNG and multi-size ICO.",
);
