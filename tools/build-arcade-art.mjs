// Code-native vector artwork; independent social inventory remains asset-contract.json.
import fs from "node:fs/promises";
import sharp from "sharp";
const car = (x, y, a, color, n, scale = 1) =>
  `<g transform="translate(${x} ${y}) rotate(${a}) scale(${scale})"><g fill="#142b31"><rect x="-55" y="-42" width="30" height="18" rx="5"/><rect x="25" y="-42" width="30" height="18" rx="5"/><rect x="-55" y="24" width="30" height="18" rx="5"/><rect x="25" y="24" width="30" height="18" rx="5"/></g><rect x="-76" y="-34" width="152" height="68" rx="13" fill="${color}" stroke="#172d32" stroke-width="5"/><path d="M-70-5H70V5H-70Z" fill="#fff0d2"/><path d="M12-27H35V27H12ZM-48-24H-30V24H-48Z" fill="#214d57"/><path d="M66-24h6v12h-6Zm0 36h6v12h-6Z" fill="#fff2ce"/><text x="-2" y="1" transform="rotate(90)" dominant-baseline="middle" text-anchor="middle" font-family="Arial,sans-serif" font-weight="900" font-size="30" fill="#172e36">${n}</text></g>`;
for (const square of [false, true]) {
  const w = square ? 1254 : 1726,
    h = square ? 1254 : 911;
  const title = square
    ? `<text x="70" y="145" font-size="110">SCRAP LEAGUE</text><text x="74" y="208" font-size="27" letter-spacing="5" fill="#ffd34e">SMALL CARS. BIG RIVALRIES.</text>`
    : `<text x="80" y="230" font-size="134">SCRAP</text><text x="80" y="365" font-size="134" fill="#ffd34e">LEAGUE</text><text x="86" y="440" font-size="28" letter-spacing="3">SMALL CARS.</text><text x="86" y="485" font-size="28" letter-spacing="3">BIG RIVALRIES.</text>`;
  const scene = square
    ? `translate(140 335) scale(1.13)`
    : `translate(820 140) scale(.92)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#18343b"/><g font-family="Arial,sans-serif" font-weight="900" fill="#f7f0df">${title}</g><g transform="${scene}"><rect x="-55" y="-30" width="900" height="700" rx="24" fill="#b9b39a"/><path d="M160 115H620Q745 115 745 240V420Q745 545 620 545H160Q35 545 35 420V240Q35 115 160 115Z" fill="none" stroke="#8f9481" stroke-width="124"/><path d="M160 115H620Q745 115 745 240V420Q745 545 620 545H160Q35 545 35 420V240Q35 115 160 115Z" fill="none" stroke="#e4dcca" stroke-width="112"/><path d="M160 115H620Q745 115 745 240V420Q745 545 620 545H160Q35 545 35 420V240Q35 115 160 115Z" fill="none" stroke="#d9775d" stroke-width="112" stroke-dasharray="22 22"/><path d="M160 115H620Q745 115 745 240V420Q745 545 620 545H160Q35 545 35 420V240Q35 115 160 115Z" fill="none" stroke="#34464d" stroke-width="97"/><g fill="#427a78"><rect x="205" y="280" width="140" height="55" rx="3"/><rect x="450" y="365" width="110" height="45" rx="3"/></g><g fill="#ba7757"><rect x="435" y="235" width="75" height="38" rx="3"/></g><g fill="#16363c"><circle cx="220" cy="430" r="12"/><circle cx="247" cy="430" r="12"/><circle cx="274" cy="430" r="12"/></g>${car(480, 115, 0, "#ffd34e", "04", 1.08)}${car(270, 115, 0, "#e6e8d9", "12", 0.9)}${car(720, 470, 105, "#ed7a59", "07", 0.9)}${car(130, 540, 180, "#a9d7cc", "21", 0.9)}</g><g fill="#f7f0df" font-family="Arial,sans-serif"><text x="${square ? 74 : 86}" y="${square ? 1135 : 710}" font-size="${square ? 30 : 32}" font-weight="700">RACE. BUILD. REPEAT.</text><text x="${square ? 74 : 86}" y="${square ? 1183 : 765}" font-size="${square ? 23 : 23}" fill="#c6d9cc">12 circuits + your own track workshop</text></g></svg>`;
  const name = square ? "square" : "landscape";
  await fs.writeFile(`artwork/arcade-${name}.svg`, svg);
  await sharp(Buffer.from(svg)).png().toFile(`app/social/og-${name}-v1.png`);
}
console.log("Exported both arcade social images from retained SVG sources.");
