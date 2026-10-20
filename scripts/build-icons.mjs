// Renders the home-screen icons from assets/icon.svg into public/icons/.
// Run with: npm run build:icons (only needed when the SVG changes).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(join(root, "assets", "icon.svg"), "utf8");
mkdirSync(join(root, "public", "icons"), { recursive: true });
for (const size of [180, 192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
  writeFileSync(join(root, "public", "icons", `icon-${size}.png`), png);
  console.log(`wrote public/icons/icon-${size}.png`);
}
