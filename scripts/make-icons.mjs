// Renders public/icons/icon.svg into the PNG sizes the PWA needs. Run: node scripts/make-icons.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright"); // uses the globally installed Playwright
import { readFileSync } from "node:fs";

const svg = readFileSync(new URL("../public/icons/icon.svg", import.meta.url), "utf8");
const out = (name) => new URL(`../public/icons/${name}`, import.meta.url).pathname;
const browser = await chromium.launch();
const page = await browser.newPage();

async function render(size, file, { maskable = false, opaque = false } = {}) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need the artwork inside the central 80% "safe zone" on a full-bleed background.
  const inner = maskable ? svg.replace('rx="112"', 'rx="0"') : svg;
  const pad = maskable ? size * 0.1 : 0;
  const bg = maskable || opaque ? "#0f766e" : "transparent";
  await page.setContent(`<html><body style="margin:0;background:${bg}">
    <div style="width:${size}px;height:${size}px;box-sizing:border-box;padding:${pad}px">
      ${maskable ? inner.replace('<rect width="512" height="512" rx="0" fill="#0f766e"/>', "") : inner.replace("<svg ", '<svg width="100%" height="100%" ')}
    </div></body></html>`);
  if (maskable) await page.$eval("svg", (el) => { el.setAttribute("width", "100%"); el.setAttribute("height", "100%"); });
  await page.screenshot({ path: out(file), omitBackground: bg === "transparent", clip: { x: 0, y: 0, width: size, height: size } });
}

await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(512, "icon-maskable-512.png", { maskable: true });
await render(180, "apple-touch-icon.png", { opaque: true });
await render(32, "favicon-32.png");
await browser.close();
console.log("icons written");
