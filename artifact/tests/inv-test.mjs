import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const DIR = new URL(".", import.meta.url).pathname;
const URL_ = "file://" + DIR + "page.html";
const browser = await chromium.launch();
let pass = 0, fail = 0;
const step = async (n, f) => { try { await f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message.split("\n").slice(0, 5).join("\n   ")); } };
const LIBS = { "jspdf/2.5.1/jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js", "jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js" };
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
await ctx.route("https://cdnjs.cloudflare.com/ajax/libs/**", (route) => { const k = Object.keys(LIBS).find((x) => route.request().url().endsWith(x)); return k ? route.fulfill({ path: DIR + "libs/node_modules/" + LIBS[k], contentType: "text/javascript" }) : route.abort(); });
await ctx.route("https://fonts.*/**", (r) => r.abort());
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const log = () => page.evaluate(() => window.__log);
const saves = async () => (await log()).filter((x) => x[0] === "save");
/** Bring a register cell to the middle of the screen (as a person scrolling would), then tap it. */
async function tapCell(pg, pid, day) {
  const sel = `#reg td[data-pid="${pid}"][data-day="${day}"]`;
  await pg.locator(sel).evaluate((td) => { revealInRegister(td); const r = td.getBoundingClientRect(); window.scrollBy(0, r.top - innerHeight / 3); });
  await pg.locator(sel).click();
}
await page.goto(URL_ + "?role=admin&persist=1");
await page.evaluate(() => localStorage.clear());
await page.goto(URL_ + "?role=admin&persist=1#inventory");

await step("Inventory tab is in the main navigation and the 89-item register loads on first run", async () => {
  await page.getByRole("link", { name: /Inventory/ }).waitFor();
  await page.getByText("Loaded the November 2026 register: 89 products.").waitFor({ timeout: 15000 });
  await page.getByText("87 products").waitFor();            // Active filter: 89 minus 2 stopped
  const products = (await log()).filter((x) => x[0] === "set" && x[1].startsWith("inventory/products/items/"));
  assert.equal(products.length, 89);
  const gauze = products.find((x) => x[2].name === "Gauze Pack")[2];
  assert.deepEqual([gauze.sno, gauze.category, gauze.unit, gauze.min_level, gauze.monthly_use, gauze.expected_delivery, gauze.status], [16, "Consumables", "Pack", 2, 4, "2026-11-12", "active"]);
  const month = (await log()).find((x) => x[0] === "set" && x[1] === "inventory/months/list/2026-11")[2];
  assert.deepEqual(month.counts.p088, { 1: 0.25, 2: 0.25, 3: 0.25 });     // Micropore: 4 Nov not recorded
  assert.deepEqual(month.counts.p041, { 1: 5.5, 2: 5, 3: 5, 4: 5 });
  assert.equal(month.counts.p018, undefined);                              // Himalaya: no counts
  await page.screenshot({ path: DIR + "i1-list.png", fullPage: false });
});
await step("ordered items show their expected delivery; stopped items and low stock show correctly", async () => {
  for (const [n, d] of [["Gauze Pack", "12 Nov 2026"], ["Gloves Box", "6 Nov 2026"], ["Syringe 50ml", "11 Nov 2026"], ["Micropore", "5 Nov 2026"]]) {
    const card = page.locator(".inv-card", { hasText: n }).first();
    assert.match(await card.innerText(), new RegExp("On order · expected " + d), n);
    assert.doesNotMatch(await card.innerText(), /Expir/i, n);
  }
  assert.match(await page.locator(".inv-card", { hasText: "Gloves Box" }).innerText(), /Low stock/);
  assert.match(await page.locator(".inv-card", { hasText: "Gauze Pack" }).innerText(), /Low stock/);  // 2 <= min 2
  assert.match(await page.locator(".inv-card", { hasText: "Room Spray" }).innerText(), /Marked low/);
  assert.match(await page.locator(".inv-card", { hasText: "Micropore" }).innerText(), /0.25/);
  await page.getByRole("button", { name: "Stopped", exact: true }).click();
  await page.getByText("2 products").waitFor();
  assert.ok(await page.locator(".inv-card.is-stopped", { hasText: "ADDND 1GM Tablet" }).count());
  assert.ok(await page.locator(".inv-card.is-stopped", { hasText: "Resodim 15mg" }).count());
  await page.getByRole("button", { name: "Active", exact: true }).click();
  const badge = await page.locator(".tab-badge").innerText();
  assert.ok(Number(badge) >= 6, "badge " + badge);
});
await step("search, category, low-only, expiring filter and sort", async () => {
  await page.getByLabel("Search by name").fill("syringe");
  await page.getByText("3 products").waitFor();
  await page.getByLabel("Search by name").fill("");
  await page.getByText("87 products").waitFor();
  await page.locator("#inv-cat").selectOption("Stationery");
  await page.getByText("8 products").waitFor();
  await page.locator("#inv-cat").selectOption("all");
  await page.getByRole("button", { name: "On order", exact: true }).click();
  await page.getByText("4 products").waitFor();
  await page.getByRole("button", { name: "On order", exact: true }).click();
  await page.getByRole("button", { name: "Low stock only" }).click();
  const lowNames = await page.locator(".inv-card b").allInnerTexts();
  assert.ok(lowNames.includes("Gloves Box") && lowNames.includes("Room Spray") && !lowNames.includes("Battery"), lowNames.join("|"));
  await page.getByRole("button", { name: "Low stock only" }).click();
  await page.locator("#inv-sort").selectOption("due");
  assert.equal(await page.locator(".inv-card b").first().innerText(), "Micropore");   // due 05/11, first to arrive
  await page.locator("#inv-sort").selectOption("sno");
});
await step("register grid: copy yesterday, tap a cell, low highlight updates instantly", async () => {
  await page.getByRole("button", { name: "Daily register" }).click();
  await page.getByText("Current Stock November 01.11.2026 – 30.11.2026").waitFor();
  assert.equal(await page.locator("#reg thead th").count(), 4 + 30);
  await page.locator("#inv-day").selectOption("5");
  await page.getByRole("button", { name: "Copy day 4 → day 5" }).click();
  await page.getByText(/Copied \d+ counts to day 5/).waitFor();
  const cell = page.locator('#reg td[data-pid="p009"][data-day="5"]');   // Battery, min 4
  assert.equal(await cell.innerText(), "8");
  assert.ok(!(await cell.getAttribute("class")).includes("low"));
  await tapCell(page, "p009", 5);
  await page.locator("#inv-cell-input").fill("3");
  await page.getByRole("button", { name: "Save & next ↓" }).click();
  await page.locator('#reg td[data-pid="p009"][data-day="5"].low').waitFor();
  assert.equal(await page.locator('#reg td[data-pid="p009"][data-day="5"]').innerText(), "3");
  // Save & next moved to the next item (Betadine) on the same day; enter a fraction
  assert.match(await page.locator("#inv-cellbar").innerText(), /Betadine Solution/);
  await page.locator("#inv-cell-input").fill("1/2");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator('#reg td[data-pid="p010"][data-day="5"]').innerText(), "0.5");
  await page.locator("#inv-cell-input").fill("abc");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByText("Enter a number like 5").waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  const upd = (await log()).filter((x) => x[0] === "update" && x[1] === "inventory/months/list/2026-11");
  assert.deepEqual(upd.at(-1)[2], { counts: { p010: { 5: 0.5 } } });     // one cell per write, merged
  await page.screenshot({ path: DIR + "i2-register.png" });
  // the list now shows Battery as low with its latest count
  await page.getByRole("button", { name: /Stock list/ }).click();
  assert.match(await page.locator(".inv-card", { hasText: "Battery" }).innerText(), /Low stock/);
});
await step("reorder list suggests monthly use minus current stock", async () => {
  await page.getByRole("button", { name: /Reorder/ }).click();
  const row = page.locator("tr", { hasText: "Gloves Box" });
  assert.match(await row.innerText(), /8\s*Box/);          // 9 - 1
  const bat = page.locator("tr", { hasText: "Battery" });
  assert.match(await bat.innerText(), /7\s*Pcs/);          // 10 - 3
  assert.equal(await page.locator("tr", { hasText: "Resodim" }).count(), 0);
});
await step("+ Add Product: duplicate warning, new category, S.No 90, appears in list and grid", async () => {
  await page.getByRole("button", { name: "+ Add Product" }).click();
  await page.getByLabel("Name *").fill("gauze pack");
  await page.getByText("already exists").waitFor();
  await page.getByLabel("Name *").fill("Cotton Roll 500g");
  await page.locator("#pf-category").selectOption("__new");
  await page.getByLabel("New category name").fill("Dressings");
  await page.locator("#pf-unit").selectOption("Roll");
  await page.getByLabel("Minimum level").fill("2");
  await page.getByLabel("Monthly use").fill("5");
  await page.getByLabel("Opening stock").fill("1.5");
  await page.getByLabel("Expected delivery (if ordered)").fill("2026-11-20");
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByText("Cotton Roll 500g added as S.No 90.").waitFor();
  const card = page.locator(".inv-card", { hasText: "Cotton Roll 500g" });
  assert.match(await card.innerText(), /Low stock/); assert.match(await card.innerText(), /On order · expected 20 Nov 2026/); assert.match(await card.innerText(), /1.5/);
  await page.getByRole("button", { name: "Daily register" }).click();
  await page.locator("#reg tr", { hasText: "Cotton Roll 500g" }).waitFor();
  assert.equal(await page.locator('#reg tr:has-text("Cotton Roll 500g") td.cell.low').count(), 1);
});
await step("edit, archive (with confirmation) and restore a product", async () => {
  await page.getByRole("button", { name: /Stock list/ }).click();
  if (!(await page.getByRole("button", { name: "Edit" }).count())) await page.locator(".inv-card", { hasText: "Cotton Roll 500g" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Minimum level").fill("1");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Cotton Roll 500g saved.").waitFor();
  assert.doesNotMatch(await page.locator(".inv-card", { hasText: "Cotton Roll 500g" }).innerText(), /Low stock/);
  await page.getByRole("button", { name: "Mark delivered" }).click();
  await page.getByText("Cotton Roll 500g marked delivered.").waitFor();
  assert.doesNotMatch(await page.locator(".inv-card", { hasText: "Cotton Roll 500g" }).innerText(), /On order/);
  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByText("It's archived, so its counts stay").waitFor();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await page.getByText("Product archived.").waitFor();
  assert.equal(await page.locator(".inv-card", { hasText: "Cotton Roll 500g" }).count(), 0);
  await page.getByRole("button", { name: "Archived" }).click();
  await page.locator(".inv-card", { hasText: "Cotton Roll 500g" }).click();
  await page.getByRole("button", { name: "Restore" }).click();
  await page.getByText("Product restored.").waitFor();
  await page.getByRole("button", { name: "Archived" }).click();
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await page.locator(".inv-card", { hasText: "Cotton Roll 500g" }).waitFor();
});
await step("survives a reload", async () => {
  await page.reload();
  await page.locator(".inv-card", { hasText: "Cotton Roll 500g" }).waitFor();
  assert.equal((await log()).filter((x) => x[0] === "set" && x[1].startsWith("inventory/products/")).length, 0, "no re-seeding after reload");
  await page.getByRole("button", { name: "Daily register" }).click();
  await page.locator("#inv-day").selectOption("5");
  assert.equal(await page.locator('#reg td[data-pid="p009"][data-day="5"]').innerText(), "3");
});
await step("offline: counts are kept on the phone and synced when back online", async () => {
  await ctx.setOffline(true);
  try {
  await tapCell(page, "p015", 5);   // Easy Bath
  await page.locator("#inv-cell-input").fill("41");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.equal(await page.locator('#reg td[data-pid="p015"][data-day="5"]').innerText(), "41");
  assert.equal((await log()).filter((x) => x[0] === "update" && JSON.stringify(x[2]).includes('"p015"')).length, 0, "nothing sent while offline");
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("pbl-inv-outbox")).length), 1);
  await page.getByRole("button", { name: /Stock list/ }).click();
  await page.getByText("1 change saved on this phone").waitFor();
  } finally { await ctx.setOffline(false); }
  await page.waitForFunction(() => window.__log.some((x) => x[0] === "update" && JSON.stringify(x[2]).includes('"p015"')));
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("pbl-inv-outbox")).length), 0);
});
await step("export register CSV (items x days) and printable PDF", async () => {
  await page.getByRole("button", { name: "Daily register" }).click();
  await page.getByRole("button", { name: /Register CSV/ }).click();
  await page.getByText("File saved.").waitFor();
  const csv = (await saves()).at(-1);
  assert.equal(csv[1], "stock-register-2026-11.csv");
  const text = await page.evaluate(() => window.__lastSave);
  const lines = text.replace(/^﻿/, "").split("\r\n");
  assert.equal(lines[0], "Current Stock November 01.11.2026 – 30.11.2026");
  assert.equal(lines[1], "S.No,Stock Name,Category,Unit,Minimum Level,Monthly Use," + Array.from({ length: 30 }, (_, i) => i + 1).join(",") + ",Expected Delivery,Status,Notes");
  assert.ok(lines.find((l) => l.startsWith("16,Gauze Pack")).includes(",12/11/2026,"));
  assert.ok(lines.find((l) => l.startsWith("17,Gloves Box,Consumables,Box,6,9,2,1,1,1,1,")), "Gloves row");
  assert.ok(lines.find((l) => l.startsWith("1,ADDND 1GM Tablet")).includes(",STOP,"));
  assert.ok(lines.find((l) => l.startsWith("9,Battery")).includes(",8,8,8,8,3,"));
  const before = (await saves()).length;
  await page.getByRole("button", { name: "Printable register (PDF)" }).click();
  await page.waitForFunction((n) => window.__log.filter((x) => x[0] === "save").length > n, before, { timeout: 30000 });
  assert.match((await saves()).at(-1)[3], /^%PDF/);
});
await step("import CSV updates matching products and adds new ones", async () => {
  const csv = "name,min_level,monthly_use,5,expiry\nTooth Brush,2,3,0,15/11/2026\nNew Ointment,1,2,4,\n,,,,\n";
  writeFileSync(DIR + "import.csv", csv);
  await page.locator("#inv-import-file").setInputFiles(DIR + "import.csv");
  await page.getByText("1 product to update, 1 new, 2 counts for November 2026.").waitFor();
  await page.getByRole("button", { name: "Apply import" }).click();
  await page.getByText("Import done: 1 updated, 1 added, 2 counts.").waitFor();
  await page.getByRole("button", { name: /Stock list/ }).click();
  const tb = await page.locator(".inv-card", { hasText: "Tooth Brush" }).innerText();
  assert.match(tb, /Min 2/); assert.match(tb, /Low stock/); assert.match(tb, /On order · expected 15 Nov 2026/);
  await page.locator(".inv-card", { hasText: "New Ointment" }).waitFor();
});
await step("optional billing link subtracts billed quantities (off by default)", async () => {
  assert.ok(!(await page.getByLabel(/Subtract billed quantities/).isChecked()));
  await page.getByLabel(/Subtract billed quantities/).check();
  await page.getByText("Billed quantities will now be subtracted").waitFor();
  await page.getByRole("link", { name: "Home" }).click();
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page.getByLabel("Item name, row 1").fill("Easy Bath");
  await page.getByLabel("Qty, row 1").fill("2");
  await page.getByLabel("Rate, row 1").fill("50");
  await page.getByLabel("Tot. Amt., row 1").fill("100");
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByText("Stock reduced for 1 item.").waitFor();
  const today = new Date(); const d = today.getDate();
  const u = (await log()).filter((x) => x[0] === "update" && x[1] === "inventory/months/list/2026-11").at(-1)[2];
  assert.ok(u.counts.p015[d] != null, JSON.stringify(u));
});
await step("permissions: Staff can count but not add products", async () => {
  const p2 = await ctx.newPage();
  await p2.goto(URL_ + "?role=staff&persist=1#inventory");
  await p2.locator(".inv-card").first().waitFor();
  assert.equal(await p2.getByRole("button", { name: "+ Add Product" }).count(), 0);
  await p2.getByRole("button", { name: "Daily register" }).click();
  await tapCell(p2, "p002", 4);
  await p2.locator("#inv-cell-input").waitFor();
  await p2.close();
});
await step("existing billing screens still work", async () => {
  for (const t of ["Bills", "Summary", "Reports", "Admin", "Home"]) { await page.getByRole("link", { name: t, exact: true }).click(); await page.waitForTimeout(150); }
  await page.getByRole("button", { name: "Scan Bill" }).waitFor();
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "no sideways page scroll");
});
const wide = await browser.newContext({ viewport: { width: 1200, height: 900 }, colorScheme: "dark" });
await wide.route("https://fonts.*/**", (r) => r.abort());
const pw = await wide.newPage();
await step("dark theme and wide screen register", async () => {
  await pw.goto(URL_ + "?role=admin#inventory");
  await pw.getByText(/Loaded the November 2026 register/).waitFor({ timeout: 15000 });
  await pw.getByRole("button", { name: "Daily register" }).click();
  await pw.screenshot({ path: DIR + "i3-register-wide-dark.png" });
});
console.log(errs.length ? "Page errors:\n  " + errs.join("\n  ") : "No page errors");
console.log(`${pass}/${pass + fail} passed`);
await browser.close();
