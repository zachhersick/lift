// Renders the icons from assets/icon.svg: the home-screen icons in
// public/icons/, and the iOS app icon and launch splash in ios/. The App
// Store refuses icons with an alpha channel, so those are written as RGB.
// Run with: npm run build:icons (only needed when the SVG changes).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "assets", "icon.svg"), "utf8");
const render = (source, width) => new Resvg(source, { fitTo: { mode: "width", value: width } }).render();

mkdirSync(join(root, "public", "icons"), { recursive: true });
for (const size of [180, 192, 512]) {
  writeFileSync(join(root, "public", "icons", `icon-${size}.png`), render(svg, size).asPng());
  console.log(`wrote public/icons/icon-${size}.png`);
}

// An opaque RGB PNG from rendered RGBA pixels.
const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (bytes) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function rgbPng(image) {
  const { width, height, pixels } = image;
  const rows = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    rows[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x++) {
      const from = (y * width + x) * 4;
      const to = y * (width * 3 + 1) + 1 + x * 3;
      rows[to] = pixels[from];
      rows[to + 1] = pixels[from + 1];
      rows[to + 2] = pixels[from + 2];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

const assets = join(root, "ios", "App", "App", "Assets.xcassets");
if (existsSync(assets)) {
  writeFileSync(join(assets, "AppIcon.appiconset", "AppIcon-512@2x.png"), rgbPng(render(svg, 1024)));
  console.log("wrote the iOS app icon");
  // The launch screen: the icon, rounded, on the app's dark background.
  const icon = render(svg, 560).asPng().toString("base64");
  const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="2732" height="2732"><rect width="2732" height="2732" fill="#07080a"/><clipPath id="r"><rect x="1086" y="1086" width="560" height="560" rx="126"/></clipPath><image x="1086" y="1086" width="560" height="560" clip-path="url(#r)" href="data:image/png;base64,${icon}"/></svg>`;
  const png = rgbPng(render(splash, 2732));
  for (const name of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) writeFileSync(join(assets, "Splash.imageset", name), png);
  console.log("wrote the iOS launch splash");
}
