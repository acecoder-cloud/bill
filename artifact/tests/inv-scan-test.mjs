// Scan the paper stock register (photo/PDF) into Inventory: review, merge into the month, re-scan, delete, staff, offline.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const DIR = new URL(".", import.meta.url).pathname;
const URL_ = "file://" + DIR + "page.html";
const browser = await chromium.launch();
let pass = 0, fail = 0;
const step = async (n, f) => { try { await f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message.split("\n").slice(0, 8).join("\n   ")); } };
const LIBS = { "pdf.js/3.11.174/pdf.min.js": "pdfjs-dist/build/pdf.min.js", "pdf.js/3.11.174/pdf.worker.min.js": "pdfjs-dist/build/pdf.worker.min.js" };
const ctx = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Kolkata" });
await ctx.clock.setFixedTime(new Date("2026-11-05T19:00:00+05:30"));
await ctx.addInitScript(() => { window.__sampleJson = (prompt, opts) => { window.__scanCalls = (window.__scanCalls || 0) + 1; window.__lastPrompt = prompt; window.__lastN = opts.images.length; return JSON.parse(localStorage.getItem("test-fixture") || "{}"); }; });
await ctx.route("https://cdnjs.cloudflare.com/ajax/libs/**", (route) => { const k = Object.keys(LIBS).find((x) => route.request().url().endsWith(x)); return k ? route.fulfill({ path: DIR + "libs/node_modules/" + LIBS[k], contentType: "text/javascript" }) : route.abort(); });
await ctx.route("https://fonts.*/**", (r) => r.abort());
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const store = async () => new Map(await page.evaluate(() => JSON.parse(localStorage.getItem("mock-store") || "[]")));
const month = async () => (await store()).get("inventory/months/list/2026-11");
const pid = (name) => page.evaluate((n) => [...INV.products.entries()].find(([, p]) => p.name === n)?.[0], name);
const row = (title) => page.locator(".scan-item", { has: page.locator("b", { hasText: title }) });
const summary = () => page.locator(".scan-fields .card").first().innerText();
const R = (sno, name, counts, extra = {}) => ({ sno, name, raw: name.toUpperCase(), stop: false, expected_delivery: null, min_level: null, monthly_use: null, counts, circled_days: [], confidence: "high", page_index: sno > 32 ? 2 : 1, ...extra });
const PAGE = { month: "2026-11", pages: [{ page_index: 1, month: "2026-11", first_sno: 1, last_sno: 32 }, { page_index: 2, month: "2026-11", first_sno: 33, last_sno: 64 }],
  rows: [
    R(1, "ADDND 1GM Tablet", { 1: "7", 2: "4", 3: "4", 4: "4" }, { raw: "ADDND 1GM STOP - TABLET", stop: true }),
    R(13, "Diaper Bag", { 1: "4", 2: "3", 3: "3", 4: "3", 5: "3" }, { min_level: "2", monthly_use: "4 PACK" }),
    R(14, "Duolin Respules", { 1: "3", 2: "?", 3: "3", 4: "5" }, { confidence: "low" }),
    R(16, "Gauze Pack", { 1: "3P", 2: "3P", 3: "3P", 4: "2P", 5: "2P" }, { raw: "GAUZE PACK 12/11/2026", expected_delivery: "12/11/2026", min_level: "2", monthly_use: "4 PACK", circled_days: [4, 5] }),
    R(17, "Gloves Box", { 1: "2P", 2: "1", 3: "1", 4: "1", 5: "1" }, { raw: "GLOVES BOX 06/11/2026", expected_delivery: "06/11/2026", circled_days: [1, 2, 3, 4, 5] }),
    R(26, "Mask Box", { 1: "480", 2: "479", 3: "479", 4: "478" }, { confidence: "medium" }),
    R(34, "NS 500ml", { 1: "25", 2: "24", 3: "23", 4: "22", 5: "21" }, { min_level: "15", monthly_use: "30 BOTTLE" }),
    R(35, "Odonil Gel Pocket", {}, { monthly_use: "30 BOTTLE" }),
    R(41, "Resodim 15mg", { 1: "5½", 2: "5", 3: "5", 4: "5" }, { raw: "RESODIM 15MG STOP", stop: true }),
    R(45, "Syringe 2ml", { 1: "96 pc", 2: "95pc", 3: "95pc", 4: "95pc", 5: "94pc" }),
    R(57, "Vim Liquid", { 1: "¾", 2: "¾", 3: "¾", 4: "¾", 5: "½" }),
    R(90, "", { 5: "10" }, { raw: "ZINC TAB", monthly_use: "30 PCS" }),
  ], unmatched_text: ["PENCIL CIRCLE - LOW STOCK"] };

await page.goto(URL_ + "?role=none&persist=1");
await page.evaluate((f) => { localStorage.clear(); localStorage.setItem("test-fixture", JSON.stringify(f)); }, PAGE);
await page.goto(URL_ + "?role=admin&persist=1#inventory");
await page.waitForFunction(() => INV.products.size === 89 && INV.months.get("2026-11") && !INV.seeding, null, { timeout: 60000 });

await step("Scan register: capture photos/PDF, Claude reads with the product list, nothing saved before review", async () => {
  await page.getByRole("button", { name: /Scan register/ }).click();
  await page.getByRole("heading", { name: "Scan stock register" }).waitFor();
  await page.locator("#scan-pdf").setInputFiles(DIR + "notebook.pdf");
  await page.getByRole("heading", { name: "2 pages" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Read 2 pages with Claude" }).click();
  await page.getByText("Before the first scan:").waitFor();
  await page.getByRole("button", { name: "Read 2 pages with Claude" }).click();
  await page.getByRole("heading", { name: "Check stock register" }).waitFor({ timeout: 30000 });
  const [prompt, n] = await page.evaluate(() => [window.__lastPrompt, window.__lastN]);
  assert.equal(n, 2); assert.ok(prompt.includes("16. Gauze Pack (Pack)") && prompt.includes("Expected month if the header is unreadable: 2026-11"));
  assert.equal((await month()).counts[await pid("Diaper Bag")][5], undefined, "nothing saved yet");
});
await step("review: only rows that change something; counts parsed from 3P, 96 pc, ½; differences and unreadable cells flagged", async () => {
  assert.match(await summary(), /6 counts to add · \d+ already saved · 1 differ · 1 row need a product · 1 unreadable/);
  assert.equal(await row("1 · ADDND").count(), 0, "already-saved rows hidden by default");
  const mask = row("26 · Mask Box"); assert.match(await mask.innerText(), /saved 479/);
  assert.equal(await mask.getByRole("button", { name: "Keep saved" }).getAttribute("aria-pressed"), "true");
  assert.ok(await row("16 · Gauze Pack").getByLabel("Mark low stock (pencil circle on day 4, 5)").isChecked());
  assert.ok(await row("35 · Odonil Gel Pocket").getByLabel("Set monthly use 30").isChecked(), "fills an empty field");
  assert.equal(await row("34 · NS 500ml").locator("[data-iopt]").count(), 0, "same minimum and monthly use: nothing to change");
  const duo = row("14 · Duolin"); assert.match(await duo.innerText(), /Please check[\s\S]*unreadable/);
  await duo.locator('[data-d="2"]').fill("4"); await duo.locator('[data-d="2"]').dispatchEvent("change");
  await row("ZINC TAB").locator("[data-imatch]").selectOption("__new");
  assert.match(await summary(), /8 counts to add · \d+ already saved · 1 differ/);
  await page.getByLabel("Show rows that are already saved too").check();
  await row("1 · ADDND").waitFor(); await page.getByLabel("Show rows that are already saved too").uncheck();
  await page.screenshot({ path: DIR + "v1-inv-review.png", fullPage: true });
});
await step("Save puts the counts into November 2026; saved counts that differ are kept; products updated", async () => {
  await page.getByRole("button", { name: "Save to November 2026" }).click();
  await page.getByText(/Saved the register scan to November 2026: 8 counts added, \d+ already there, 1 kept as entered, 2 products updated/).waitFor();
  const m = await month(); const c = async (n, d) => m.counts[await pid(n)]?.[d];
  assert.deepEqual([await c("Diaper Bag", 5), await c("Gauze Pack", 5), await c("Gloves Box", 5), await c("Syringe 2ml", 5), await c("Vim Liquid", 5), await c("NS 500ml", 5), await c("Duolin Respules", 2), await c("Mask Box", 4)], [3, 2, 1, 94, 0.5, 21, 4, 479]);
  assert.ok(m.flags[await pid("Gauze Pack")] && m.flags[await pid("Gloves Box")]);
  const zinc = [...(await store()).entries()].find(([k, v]) => k.startsWith("inventory/products/items/") && v.name === "ZINC TAB");
  assert.ok(zinc, "new product added"); assert.deepEqual([zinc[1].sno, zinc[1].monthly_use, zinc[1].unit], [90, 30, "Pcs"]);
  assert.equal(m.counts[zinc[0].split("/").at(-1)][5], 10);
  assert.equal((await store()).get(`inventory/products/items/${await pid("Odonil Gel Pocket")}`).monthly_use, 30);
  assert.ok(Object.values(m.src[await pid("Diaper Bag")]).every((x) => x.startsWith("sc")), "counts remember their scan");
  await page.getByRole("button", { name: "Daily register", exact: false }).waitFor();
  assert.match(await page.locator(".scan-row").first().innerText(), /November 2026 · 2 pages · 8 counts added[\s\S]*Saved/);
});
await step("re-scanning the same pages adds nothing", async () => {
  await page.getByRole("button", { name: /Scan register/ }).click();
  await page.locator("#scan-photos").setInputFiles(DIR + "sample-bill.png");
  await page.getByRole("button", { name: "Read 1 page with Claude" }).click();
  await page.getByRole("heading", { name: "Check stock register" }).waitFor({ timeout: 30000 });
  assert.match(await summary(), /\b0 counts to add · \d+ already saved · 1 differ/);   // Mask Box day 4 still differs (kept as entered)
  await page.getByRole("button", { name: "Save to November 2026" }).click();
  await page.getByText(/Saved the register scan to November 2026: 0 counts added/).waitFor();
});
await step("deleting a scan can take back only its counts", async () => {
  await page.locator(".scan-row", { hasText: "8 counts added" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete and remove its counts" }).click();
  await page.getByText("Scan and its counts removed.").waitFor();
  const m = await month(); assert.equal(m.counts[await pid("Diaper Bag")][5], null); assert.equal(m.counts[await pid("Diaper Bag")][4], 3, "earlier counts untouched");
  assert.equal(await page.locator(".scan-row").count(), 1);
});
await step("offline: pages wait as Pending reading and are read when back online", async () => {
  await ctx.setOffline(true);
  try {
    await page.getByRole("button", { name: /Scan register/ }).click();
    await page.locator("#scan-photos").setInputFiles(DIR + "sample-bill.png");
    await page.getByRole("button", { name: "Save 1 page to read later (offline)" }).click();
    await page.locator(".scan-row", { hasText: "Pending reading" }).waitFor();
  } finally { await ctx.setOffline(false); }
  await page.locator(".scan-row", { hasText: "Needs review" }).waitFor({ timeout: 20000 });
  await page.locator(".scan-row", { hasText: "Needs review" }).getByRole("button", { name: "Review" }).click();
  await page.getByRole("heading", { name: "Check stock register" }).waitFor();
  await page.getByRole("button", { name: "‹ Back" }).click();
});
await step("Staff can scan and add counts but not change products", async () => {
  await page.waitForTimeout(1500);   // let the stand-in's localStorage copy reach disk before another tab reads it
  const p2 = await ctx.newPage();
  await p2.goto(URL_ + "?role=staff&persist=1#inventory");
  await p2.locator(".scan-row", { hasText: "Needs review" }).getByRole("button", { name: "Review" }).click();
  await p2.getByRole("heading", { name: "Check stock register" }).waitFor();
  assert.equal(await p2.locator("[data-iopt]").filter({ hasNot: p2.locator("xx") }).evaluateAll((els) => els.filter((e) => !/low stock/.test(e.parentElement.textContent)).length), 0, "no product changes for Staff");
  assert.equal(await p2.locator('option[value="__new"]').count(), 0);
  await p2.close();
});
console.log(errs.length ? "Page errors:\n  " + errs.join("\n  ") : "No page errors");
console.log(`${pass}/${pass + fail} passed`);
await browser.close();
