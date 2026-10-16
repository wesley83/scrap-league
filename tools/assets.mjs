import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { DOMParser } from "linkedom";

export async function verifyAssets(root, directory, { html, release } = {}) {
  const contract = JSON.parse(
    await readFile(path.join(root, "asset-contract.json"), "utf8"),
  );
  for (const name of contract.required) {
    const bytes = await readFile(path.join(directory, name));
    if (bytes.length < 20) throw Error("Required asset is empty: " + name);
    if (name.endsWith(".ttf") && bytes.readUInt32BE(0) !== 0x00010000)
      throw Error("Invalid font: " + name);
    if (
      name.endsWith("OFL.txt") &&
      !bytes.toString().includes("SIL OPEN FONT LICENSE")
    )
      throw Error("Missing font license: " + name);
  }
  for (const image of contract.images) {
    const bytes = await readFile(path.join(directory, image.path));
    const meta = await sharp(bytes).metadata();
    if (
      meta.format !== "png" ||
      meta.width !== image.width ||
      meta.height !== image.height
    )
      throw Error("Invalid required image: " + image.path);
    // Decode all pixels, not only a header that can survive a truncated file.
    await sharp(bytes).raw().toBuffer();
  }
  const ico = await readFile(path.join(directory, "icons/favicon.ico"));
  if (ico.readUInt32LE(0) !== 0x00010000 || ico.readUInt16LE(4) !== 3)
    throw Error("Invalid favicon ICO");
  for (let i = 0; i < 3; i++) {
    const at = 6 + i * 16,
      size = ico.readUInt32LE(at + 8),
      offset = ico.readUInt32LE(at + 12);
    const meta = await sharp(ico.subarray(offset, offset + size)).metadata();
    if (meta.width !== [16, 32, 48][i] || meta.height !== meta.width)
      throw Error("Invalid ICO frame");
    await sharp(ico.subarray(offset, offset + size))
      .raw()
      .toBuffer();
  }
  if (html) {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const meta = (key) =>
      doc
        .querySelector(`meta[property="${key}"],meta[name="${key}"]`)
        ?.getAttribute("content");
    for (const key of [
      "og:title",
      "og:description",
      "og:type",
      "og:url",
      "og:image",
      "og:image:width",
      "og:image:height",
      "og:image:alt",
      "twitter:card",
      "twitter:image",
      "twitter:image:alt",
    ])
      if (!meta(key)) throw Error("Missing metadata: " + key);
    const expected = new URL(
      `releases/${release}/social/og-landscape-v1.png`,
      contract.origin,
    ).href;
    if (
      meta("og:image") !== expected ||
      meta("twitter:image") !== expected ||
      meta("og:url") !== contract.origin ||
      meta("twitter:card") !== "summary_large_image"
    )
      throw Error("Social metadata targets the wrong asset or host");
    if (meta("og:image:width") !== "1726" || meta("og:image:height") !== "911")
      throw Error("Social dimensions differ");
    if (
      doc.querySelector('link[rel="canonical"]')?.getAttribute("href") !==
      contract.origin
    )
      throw Error("Missing canonical URL");
    for (const [rel, href] of [
      ["icon", "icons/favicon.ico"],
      ["apple-touch-icon", "icons/icon-180.png"],
    ])
      if (!doc.querySelector(`link[rel="${rel}"][href="${href}"]`))
        throw Error("Missing icon link: " + href);
  }
  return contract;
}
