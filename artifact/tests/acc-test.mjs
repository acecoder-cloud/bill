import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const DIR = new URL(".", import.meta.url).pathname;
const URL_ = "file://" + DIR + "page.html";
const browser = await chromium.launch();
let pass = 0, fail = 0;
/** Bills, Summary and Reports live inside the Pharmacy tab. */
async function nav(pg, name) {
  if (["Bills", "Summary", "Reports"].includes(name)) { await pg.getByRole("link", { name: /Pharmacy$/ }).click(); await pg.getByRole("tab", { name, exact: true }).click(); }
  else await pg.getByRole("link", { name: new RegExp(name + "$") }).click();
}

const step = async (n, f) => { try { await f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message.split("\n").slice(0, 6).join("\n   ")); } };
const LIBS = { "jspdf/2.5.1/jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js", "jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js" };
const ctx = await browser.newContext({ ...devices["Pixel 7"], permissions: ["clipboard-read", "clipboard-write"] });
await ctx.route("https://cdnjs.cloudflare.com/ajax/libs/**", (route) => { const k = Object.keys(LIBS).find((x) => route.request().url().endsWith(x)); return k ? route.fulfill({ path: DIR + "libs/node_modules/" + LIBS[k], contentType: "text/javascript" }) : route.abort(); });
await ctx.route("https://fonts.*/**", (r) => r.abort());
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const log = () => page.evaluate(() => window.__log);
const available = async () => (await page.locator("#acc-available").innerText()).trim();
const clip = () => page.evaluate(() => navigator.clipboard.readText());
const allTime = async () => { await page.getByRole("button", { name: "All time", exact: true }).click(); };
await page.goto(URL_ + "?role=admin&persist=1");
await page.evaluate(() => localStorage.clear());
await page.goto(URL_ + "?role=admin&persist=1#accounts");

await step("Accounts tab is in the main navigation and the WhatsApp ledger imports on first run", async () => {
  await page.getByRole("link", { name: "Accounts" }).waitFor();
  await page.getByText("Imported the WhatsApp ledger: 182 entries and 25 items.").waitFor({ timeout: 60000 });
  const tx = (await log()).filter((x) => x[0] === "set" && x[1].startsWith("accounts/tx/list/"));
  assert.equal(tx.length, 182);
  assert.ok(tx.every((x) => Number.isInteger(x[2].amount)), "amounts are whole rupees");
  assert.equal(tx.filter((x) => x[2].review).length, 19, "Needs review entries");
});
await step("totals match the expected figures exactly", async () => {
  await allTime();
  assert.equal(await available(), "₹5,897");
  const totals = await page.locator(".acc-totals").innerText();
  assert.match(totals, /Received\s+₹27,600/); assert.match(totals, /Spent\s+₹21,703/); assert.match(totals, /Available\s+₹5,897/);
  const cats = await page.locator(".acc-cats").innerText();
  for (const [c, v] of [["Food", "₹16,233"], ["Medical", "₹3,558"], ["Fruits & juice", "₹1,343"], ["Courier", "₹317"], ["Other", "₹252"]]) assert.match(cats, new RegExp(c.replace("&", "&") + "\\s+" + v), c);
  await page.locator("#acc-type").selectOption("received");
  await page.getByText("9 entries").waitFor();
  await page.locator("#acc-type").selectOption("all");
  await page.screenshot({ path: DIR + "c1-summary.png", fullPage: false });
});
await step("reconciliation shows the WhatsApp differences", async () => {
  await page.getByRole("button", { name: "Check balance" }).click();
  const txt = await page.locator("#main").innerText();
  assert.match(txt, /Last balance written in WhatsApp on 04\/11\/2026: ₹6,378/);
  assert.match(txt, /calculates ₹5,897/); assert.match(txt, /₹481 \(written balance too high\)/);
  const rows = await page.locator("table tbody tr").allInnerTexts();
  assert.deepEqual(rows.map((r) => r.replace(/\s+/g, " ").trim()), ["21/08–09/09 +₹116", "09/09–20/09 +₹5", "20/09–30/09 −₹480", "01/10–11/10 −₹10", "12/10–21/10 +₹128", "22/10–28/10 −₹244", "01/11–04/11 ₹0"]);
  await page.locator("#acc-actual").fill("5800");
  await page.getByRole("button", { name: "Check", exact: true }).click();
  await page.getByText("₹97 less").waitFor();
  await page.getByRole("button", { name: "Save this check" }).click();
  await page.getByText("Check saved.").waitFor();
  await page.screenshot({ path: DIR + "c2-check.png", fullPage: true });
});
const NOV_WA = ["*Available -RS: 5,897*", "", "01/11/2026 - Meals 100 rupees", "01/11/2026 - Dosai 137 rupees", "02/11/2026 - Idli 116 rupees", "02/11/2026 - Meals 100 rupees", "02/11/2026 - Idli 116 rupees",
  "03/11/2026 - Pongal & idli 176 rupees", "03/11/2026 - Meals 100 rupees", "03/11/2026 - Dosai 137 rupees", "04/11/2026 - Pongal & idli 176 rupees", "04/11/2026 - Curd rice & lemon juice & rasam rice 160 rupees", "", "*RS: 5,897*"].join("\n");
await step("periods carry closing to opening; Copy for WhatsApp matches the agreed format line for line", async () => {
  await page.getByRole("button", { name: "Periods", exact: true }).click();
  const rows = await page.locator("table.acc-periods tbody tr").allInnerTexts();
  const nums = rows.map((r) => r.split("\t").map((x) => x.trim()));
  for (let i = 0; i < nums.length - 1; i++) assert.equal(nums[i][1], nums[i + 1][4], `opening of ${nums[i][0]} = closing of ${nums[i + 1][0]}`);
  assert.match(rows[0], /01\/11–10\/11/); assert.match(rows[0], /₹7,215/); assert.match(rows[0], /₹1,318/); assert.match(rows[0], /₹5,897/);
  assert.equal(await page.locator("#acc-wa-text").innerText(), NOV_WA);
  await page.getByRole("button", { name: "Copy for WhatsApp", exact: true }).click();
  await page.getByText("Copied the 01/11/2026 – 10/11/2026 message.").waitFor();
  assert.equal(await clip(), NOV_WA);
  const lines = NOV_WA.split("\n"); assert.equal(lines[0].match(/[\d,]+/)[0], lines.at(-1).match(/[\d,]+/)[0]);
  await page.locator('[data-act="acc-period"][data-start="2026-10-21"]').click();
  const oct = await page.locator("#acc-wa-text").innerText();
  assert.ok(oct.includes("*21/10/2026 Amount received 5,000*"), oct);
  assert.ok(oct.startsWith("*Available -RS: 7,215*\n\n") && oct.endsWith("\n\n*RS: 7,215*"), oct.slice(0, 40));
  await page.screenshot({ path: DIR + "c3-periods.png", fullPage: true });
});
await step("quick-add chip adds today at the usual price; balances and WhatsApp text update instantly; Undo", async () => {
  await page.getByRole("button", { name: /^Idli ₹116$/ }).click();
  await page.getByText("Added Idli ₹116 for today.").waitFor();
  assert.equal(await available(), "₹5,781");
  await page.getByRole("button", { name: "Periods", exact: true }).click();
  await page.locator('[data-act="acc-period"][data-start="2026-11-01"]').click();
  const t = await page.locator("#acc-wa-text").innerText();
  assert.ok(t.startsWith("*Available -RS: 5,781*") && t.endsWith("*RS: 5,781*") && t.includes(`- Idli 116 rupees\n\n*RS`), t);
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByText("Removed Idli ₹116.").waitFor();
  assert.equal(await available(), "₹5,897");
});
await step("add expense with several items; usual price follows latest price; edit and delete recalculate", async () => {
  await page.getByRole("button", { name: "+ Add expense" }).click();
  await page.getByLabel("Item 1").fill("Meals");
  assert.equal(await page.getByLabel("Amount 1").inputValue(), "100");
  await page.getByRole("button", { name: "+ Another item in this expense" }).click();
  await page.getByLabel("Item 2").fill("Coffee");
  assert.equal(await page.getByLabel("Amount 2").inputValue(), "45");
  await page.getByLabel("Amount 2").fill("50");
  await page.getByText("Balance after saving: ₹5,747").waitFor();
  await page.screenshot({ path: DIR + "c4-expense-form.png", fullPage: true });
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.getByText("Expense saved: ₹150. Balance ₹5,747.").waitFor();
  assert.equal(await available(), "₹5,747");
  const saved = (await log()).filter((x) => x[0] === "set" && x[1].startsWith("accounts/tx/list/")).at(-1)[2];
  assert.equal(saved.amount, 150); assert.equal(saved.lines.length, 2); assert.equal(saved.spent_by, "Nandhini");
  await page.getByRole("button", { name: "Items", exact: true }).click();
  assert.match(await page.locator("tr", { hasText: "Coffee" }).innerText(), /₹50/);
  await page.getByRole("button", { name: "Entries", exact: true }).click();
  await page.locator(".acc-row", { hasText: "Meals & Coffee" }).locator(".acc-row-btn").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Amount 2").fill("60");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByText("Expense updated: ₹160.").waitFor();
  assert.equal(await available(), "₹5,737");
  await page.locator(".acc-row", { hasText: "Meals & Coffee" }).locator(".acc-row-btn").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText("Every balance after it changes.").waitFor();
  await page.locator('[data-act="acc-del-yes"]').click();
  await page.getByText("Deleted. Balance ₹5,897.").waitFor();
  assert.equal(await available(), "₹5,897");
});
await step("warns but still allows a negative balance", async () => {
  await page.getByRole("button", { name: "+ Add expense" }).click();
  await page.getByLabel("Item 1").fill("Lab test advance");
  await page.getByLabel("Amount 1").fill("9000");
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.getByText("This takes the balance below zero (−₹3,103). Save anyway?").waitFor();
  await page.getByRole("button", { name: "Save anyway" }).click();
  await page.getByText("Expense saved: ₹9,000.").waitFor();
  assert.equal(await available(), "−₹3,103");
  await page.locator(".acc-row", { hasText: "Lab test advance" }).first().locator(".acc-row-btn").click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.locator('[data-act="acc-del-yes"]').click();
  await page.getByText("Deleted. Balance ₹5,897.").waitFor();
});
await step("add money received (PhonePe) shows green with +", async () => {
  await page.getByRole("button", { name: "+ Add received" }).click();
  await page.locator("#rf-amount").fill("2000");
  await page.locator("#rf-method").selectOption("Google Pay");
  await page.locator("#rf-from").fill("Arun");
  await page.getByRole("button", { name: "Save money received" }).click();
  await page.getByText("Money received saved: ₹2,000. Balance ₹7,897.").waitFor();
  const row = page.locator(".acc-row.is-received", { hasText: "Money received (Google Pay) from Arun" });
  assert.match(await row.innerText(), /\+₹2,000/);
});
await step("+ Add new item: duplicate warning ignores spelling variants; new item becomes a chip and is in the picker", async () => {
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await page.getByRole("button", { name: "+ Add new item" }).click();
  for (const v of ["Idly", "IDLIY", "idli"]) { await page.locator("#if-name").fill(v); await page.getByText("This looks like Idli").waitFor(); }
  await page.locator("#if-name").fill("Banana");
  await page.locator("#if-cat").selectOption("Fruits & juice");
  await page.locator("#if-price").fill("20");
  await page.getByLabel("Show as a quick-add chip").check();
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByText("Banana added. It's now a quick-add chip.").waitFor();
  await page.getByRole("button", { name: /^Banana ₹20$/ }).waitFor();
  await page.getByRole("button", { name: "+ Add expense" }).click();
  assert.ok((await page.locator("#acc-item-list option").evaluateAll((o) => o.map((x) => x.value))).includes("Banana"));
  await page.getByLabel("Item 1").fill("Biscuit");
  await page.getByLabel('Add "Biscuit" as a new item').check();
  await page.getByLabel("Amount 1").fill("30");
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.getByText("Expense saved: ₹30.").waitFor();
  await page.getByRole("button", { name: "Items", exact: true }).click();
  assert.match(await page.locator("tr", { hasText: "Biscuit" }).innerText(), /₹30/);
});
await step("survives a reload", async () => {
  await page.reload();
  await page.getByRole("button", { name: /^Banana ₹20$/ }).waitFor();
  assert.equal((await log()).filter((x) => x[0] === "set" && x[1].startsWith("accounts/tx/")).length, 0, "no re-import after reload");
  assert.equal(await available(), "₹7,867");
});
await step("works offline: entries are kept on the phone and synced later", async () => {
  await ctx.setOffline(true);
  try {
    await page.getByRole("button", { name: /^Banana ₹20$/ }).click();
    await page.getByText("Added Banana ₹20 for today.").waitFor();
    assert.equal(await available(), "₹7,847");
    await page.getByText("1 change saved on this phone").waitFor();
  } finally { await ctx.setOffline(false); }
  await page.waitForFunction(() => window.__log.some((x) => x[0] === "set" && x[2]?.lines?.[0]?.name === "Banana"));
});
await step("search, category and Needs review filters", async () => {
  await page.getByRole("button", { name: "Entries", exact: true }).click();
  await allTime();
  await page.getByLabel("Search item or note").fill("dosai");
  await page.getByText("12 entries").waitFor();
  await page.getByLabel("Search item or note").fill("");
  await page.locator("#acc-cat").selectOption("Medical");
  await page.getByText("5 entries").waitFor();
  await page.locator("#acc-cat").selectOption("review");
  await page.getByText("19 entries").waitFor();
  await page.locator(".acc-row", { hasText: "Courier" }).first().locator(".acc-row-btn").click();
  await page.getByRole("button", { name: "Mark reviewed" }).click();
  await page.getByText("18 entries").waitFor();
  await page.locator("#acc-cat").selectOption("all");
});
await step("export CSV and period statement; import CSV", async () => {
  await page.getByRole("button", { name: /Export entries to CSV/ }).click();
  await page.waitForFunction(() => window.__log.some((x) => x[0] === "save" && x[1].startsWith("accounts-")));
  const csv = await page.evaluate(() => window.__lastSave);
  const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
  assert.equal(lines[0], "date,type,item,category,amount,qty,note,method,from,spent_by,needs_review,balance_after_day");
  assert.ok(lines.length >= 186, String(lines.length));
  await page.getByRole("button", { name: "Periods", exact: true }).click();
  const n = (await log()).filter((x) => x[0] === "save").length;
  await page.getByRole("button", { name: "Period statement (PDF)" }).click();
  await page.waitForFunction((k) => window.__log.filter((x) => x[0] === "save").length > k, n, { timeout: 30000 });
  assert.match((await log()).filter((x) => x[0] === "save").at(-1)[3], /^%PDF/);
  writeFileSync(DIR + "acc-import.csv", "date,type,item,category,amount,note\n05/11/2026,Expense,Idly,Food,116,\n05/11/2026,Received,Money received (PhonePe),Received,1000,\n31/02/2026,Expense,Bad,Food,10,\n");
  await page.locator("#acc-import-file").setInputFiles(DIR + "acc-import.csv");
  await page.getByText("2 entries: ₹1,000 received, ₹116 spent.").waitFor();
  await page.getByText("Line 4: date").waitFor();
  await page.getByRole("button", { name: "Apply import" }).click();
  await page.getByText("Imported 2 entries.").waitFor();
  assert.equal(await available(), "₹8,731");
});
await step("Home dashboard shows the available balance", async () => {
  await page.getByRole("link", { name: /Home$/ }).click();
  const card = page.locator(".dash-card", { hasText: "Accounts" });
  assert.match(await card.innerText(), /Available balance\s+₹8,731/);
  await card.getByRole("button", { name: "+ Add expense" }).click();
  await page.getByRole("heading", { name: "Add expense" }).waitFor();
  await page.getByRole("button", { name: "‹ Cancel" }).click();
});
await step("Staff can add expenses but not change accounts settings or import", async () => {
  const p2 = await ctx.newPage();
  await p2.goto(URL_ + "?role=staff&persist=1#accounts");
  await p2.getByRole("button", { name: "+ Add expense" }).waitFor();
  assert.equal(await p2.getByRole("heading", { name: "Accounts settings" }).count(), 0);
  assert.equal(await p2.getByRole("button", { name: /Import entries/ }).count(), 0);
  await p2.close();
});
await step("existing tabs still work and the page never scrolls sideways", async () => {
  for (const t of ["Bills", "Summary", "Reports", "Inventory", "Admin", "Home"]) { await nav(page, t); await page.waitForTimeout(120); }
  await page.locator(".dash").waitFor();
  await nav(page, "Pharmacy");
  await page.getByRole("button", { name: "Scan Bill" }).waitFor();
  await page.getByRole("link", { name: "Accounts", exact: true }).click();
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
});
const dark = await browser.newContext({ ...devices["Pixel 7"], colorScheme: "dark" });
await dark.route("https://fonts.*/**", (r) => r.abort());
const pd = await dark.newPage();
await step("dark theme", async () => {
  await pd.goto(URL_ + "?role=admin#accounts");
  await pd.getByText(/Imported the WhatsApp ledger/).waitFor({ timeout: 60000 });
  await pd.getByRole("button", { name: "Entries", exact: true }).click();
  await pd.screenshot({ path: DIR + "c5-dark.png" });
});
console.log(errs.length ? "Page errors:\n  " + errs.join("\n  ") : "No page errors");
console.log(`${pass}/${pass + fail} passed`);
await browser.close();
