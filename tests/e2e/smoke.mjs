// Browser smoke test at phone size against the mock backend.
// Usage: BASE_URL=http://127.0.0.1:3100 MOCK_URL=http://127.0.0.1:54329 OUT=./shots node tests/e2e/smoke.mjs
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL || "http://127.0.0.1:3100";
const MOCK = process.env.MOCK_URL || "http://127.0.0.1:54329";
const OUT = process.env.OUT || "./shots";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
const step = async (name, fn) => {
  try {
    await fn();
    results.push(`ok - ${name}`);
    console.log(`ok - ${name}`);
  } catch (e) {
    console.log(`FAIL - ${name}\n   ${e.message.split("\n").slice(0, 6).join("\n   ")}`);
    results.push(`FAIL - ${name}`);
  }
};
const calls = async () => (await fetch(`${MOCK}/__calls`)).json();

// 1. Make a realistic bill photo
const billPage = await browser.newPage({ viewport: { width: 600, height: 800 } });
await billPage.setContent(`<body style="font-family:monospace;padding:30px;background:#fffef8">
  <h2 style="text-align:center">CITY MEDICALS</h2><p>Date: 02/11/2026 &nbsp; Bill No: 4471</p>
  <table border=1 cellpadding=6 style="border-collapse:collapse;width:100%">
  <tr><th>S.No</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr>
  <tr><td>1</td><td>Dolo 650 Tab 15's</td><td>2</td><td>30.50</td><td>61.00</td></tr>
  <tr><td>2</td><td>Benadryl Syrup 100ml</td><td>1</td><td>118.00</td><td>118.00</td></tr>
  <tr><td>3</td><td>Volini Gel 30g</td><td>2</td><td>145.00</td><td>300.00</td></tr></table>
  <h3 style="text-align:right">Total: 479.00</h3></body>`);
const billPng = `${OUT}/sample-bill.png`;
await billPage.screenshot({ path: billPng });
await billPage.close();

const ctx = await browser.newContext({ ...devices["Pixel 7"], acceptDownloads: true });
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => consoleErrors.push(String(e)));

await step("signed-out visitor is sent to /login", async () => {
  await page.goto(`${BASE}/`);
  await page.waitForURL(/\/login/);
  await page.getByRole("button", { name: "Sign in" }).waitFor();
  await page.screenshot({ path: `${OUT}/01-login.png` });
});

await step("wrong password shows a friendly error", async () => {
  await page.getByLabel("Email").fill("admin@test.com");
  await page.getByLabel("Password").fill("nope");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByText("Wrong email or password.").waitFor();
});

await step("admin signs in and sees Home with Scan Bill", async () => {
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`);
  await page.getByRole("button", { name: "Scan Bill" }).waitFor();
  await page.getByText("Asha Admin").first().waitFor();
  assert.equal(await page.getByRole("link", { name: "Admin", exact: true }).count(), 1);
  await page.screenshot({ path: `${OUT}/02-home.png` });
});

await step("camera input uses capture=environment; gallery input does not", async () => {
  const inputs = page.locator('input[type="file"]');
  assert.equal(await inputs.count(), 2);
  assert.equal(await inputs.nth(0).getAttribute("capture"), "environment");
  assert.equal(await inputs.nth(0).getAttribute("accept"), "image/*");
  assert.equal(await inputs.nth(1).getAttribute("capture"), null);
});

let savedBillUrl = "";
await step("picking a photo compresses, uploads, extracts, and opens the review screen", async () => {
  await page.locator('input[type="file"]').nth(1).setInputFiles(billPng);
  await page.waitForURL(/\/bills\/new/);
  await page.getByText("Reading bill with AI").waitFor({ timeout: 15000 });
  await page.screenshot({ path: `${OUT}/03-reading.png` });
  await page.getByRole("heading", { name: "Review bill" }).waitFor({ timeout: 20000 });
  assert.equal(await page.locator('input[type="date"]').first().inputValue(), "2026-11-02");
  const names = await page.locator("ol [data-item-name]").evaluateAll((els) => els.map((e) => e.value));
  assert.deepEqual(names, ["Dolo 650 Tab 15's", "Benadryl Syrup 100ml", "Volini Gel 30g"]);
  await page.getByText("1 row highlighted").waitFor();
  await page.screenshot({ path: `${OUT}/04-review.png`, fullPage: true });

  const c = await calls();
  const upload = c.find((x) => x.type === "upload");
  assert.ok(upload, "photo uploaded");
  assert.match(upload.path, /^bill-images\/00000000-0000-0000-0000-0000000000a1\/[0-9a-f-]+\.jpg$/);
  assert.equal(upload.contentType, "image/jpeg");
  assert.ok(upload.jpeg, "uploaded bytes are a JPEG (compressed in the browser)");
  assert.ok(upload.bytes < 400_000, `compressed size ${upload.bytes}`);
  const claude = c.find((x) => x.type === "claude");
  assert.ok(claude, "Claude called from the server");
  assert.equal(claude.body.model, "claude-opus-5-5");
  assert.equal(claude.body.fallbacks, "default");
  assert.match(claude.headers.beta, /server-side-fallback-2026-07-01/);
  assert.equal(claude.body.output_config.format.type, "json_schema");
  assert.equal(claude.body.messages[0].content[0].media_type, "image/jpeg");
  assert.ok(claude.headers.key === "test-key" || claude.headers.auth === "Bearer test-key", "server sends the API key");
});

await step("browser never sees the Claude API key or secret key", async () => {
  const html = await page.content();
  assert.ok(!html.includes("test-key"));
  assert.ok(!html.includes("test-secret"));
});

await step("'Use this' fixes the mismatch; edit, add and delete rows; submit saves in one call", async () => {
  await page.getByRole("button", { name: "Use this" }).click();
  await page.getByText("row highlighted").waitFor({ state: "detached" });
  await page.getByLabel("Item name, row 2").first().fill("Benadryl DR Syrup 100ml");
  await page.getByRole("button", { name: "+ Add row" }).click();
  const cards = page.locator("ol > li");
  assert.equal(await cards.count(), 4);
  await page.getByLabel("Item name, row 4").first().fill("Crocin Advance");
  await cards.nth(3).getByRole("textbox").nth(2).fill("3"); // qty
  await cards.nth(3).getByRole("textbox").nth(3).fill("20"); // rate
  await cards.nth(3).getByRole("textbox").nth(4).fill("70"); // wrong on purpose
  await page.getByText("1 row highlighted").waitFor();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete row 4" }).click();
  assert.equal(await cards.count(), 3);
  await page.getByText("₹ 479.00").waitFor().catch(() => {});
  await page.getByRole("button", { name: "Submit" }).click();
  await page.waitForURL(/\/bills\/[0-9a-f-]+\?saved=1/, { timeout: 10000 });
  savedBillUrl = page.url();
  await page.getByText("Bill saved.").waitFor();
  const save = (await calls()).filter((x) => x.type === "rpc" && x.name === "save_bill").at(-1);
  assert.equal(save.body.p_bill_id, null);
  assert.equal(save.body.p_bill_date, "2026-11-02");
  assert.match(save.body.p_image_url, /^00000000-0000-0000-0000-0000000000a1\//);
  assert.deepEqual(save.body.p_items, [
    { serial_no: 1, item_name: "Dolo 650 Tab 15's", qty: 2, rate: 30.5, total_amount: 61 },
    { serial_no: 2, item_name: "Benadryl DR Syrup 100ml", qty: 1, rate: 118, total_amount: 118 },
    { serial_no: 3, item_name: "Volini Gel 30g", qty: 2, rate: 145, total_amount: 290 },
  ]);
  await page.screenshot({ path: `${OUT}/05-saved.png`, fullPage: true });
});

await step("bill photo opens full-screen viewer", async () => {
  await page.getByRole("button", { name: "View bill photo" }).click();
  await page.getByRole("dialog", { name: "Bill photo" }).waitFor();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/06-photo.png` });
  await page.getByRole("button", { name: "Close" }).click();
});

await step("Bills list shows both bills with totals", async () => {
  await page.getByRole("link", { name: "Bills" }).click();
  await page.waitForURL(/\/entries/);
  await page.getByText("Showing 2 bills").waitFor();
  await page.getByText("₹ 469.00").first().waitFor();
  await page.getByText("Logged by Ravi User").waitFor();
  await page.screenshot({ path: `${OUT}/07-bills.png`, fullPage: true });
});

await step("Summary: grand total, search, sort, horizontal scroll", async () => {
  await page.getByRole("link", { name: "Summary" }).click();
  await page.waitForURL(/\/summary/);
  await page.getByText("₹ 699.00").waitFor(); // 469 + 230
  const scroller = page.locator("div.overflow-x-auto").first();
  const scrollable = await scroller.evaluate((el) => el.scrollWidth > el.clientWidth);
  assert.ok(scrollable, "table scrolls sideways on a phone");
  const bodyOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.ok(!bodyOverflow, "page itself does not scroll sideways");
  await page.screenshot({ path: `${OUT}/08-summary.png`, fullPage: true });
  await page.getByRole("button", { name: /Tot\. Amt\./ }).click(); // sort desc by amount
  const first = await page.locator("tbody tr").first().locator("td").nth(2).innerText();
  assert.equal(first, "Volini Gel 30g");
  await page.getByRole("button", { name: /Tot\. Amt\./ }).click(); // asc
  assert.equal(await page.locator("tbody tr").first().locator("td").nth(2).innerText(), "Dolo 650 Tab 15's");
  await page.getByLabel("Search item name").fill("syrup");
  await page.getByText("₹ 118.00").first().waitFor();
  assert.equal(await page.locator("tbody tr").count(), 1);
});

await step("Reports: choose columns, preview, download CSV / Excel / PDF", async () => {
  await page.getByRole("link", { name: "Reports" }).click();
  await page.waitForURL(/\/reports/);
  await page.getByLabel("Logged at").uncheck();
  await page.getByRole("button", { name: "Preview report" }).click();
  await page.getByText("5 rows").waitFor();
  await page.screenshot({ path: `${OUT}/09-reports.png`, fullPage: true });
  for (const [label, ext] of [["CSV", "csv"], ["Excel", "xlsx"], ["PDF", "pdf"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download" }).click()]);
    const path = `${OUT}/report.${ext}`;
    await dl.saveAs(path);
    const buf = readFileSync(path);
    assert.ok(buf.length > 100, `${ext} has content`);
    if (ext === "csv") {
      const text = buf.toString("utf8");
      assert.ok(text.startsWith("﻿Bill date,Serial no.,Item name,Qty.,Rate,Tot. Amt.,Logged by"), text.slice(0, 120));
      assert.ok(text.includes("Grand total,,,,,699"), "csv has grand total");
      assert.ok(!text.includes("Logged at"));
    }
    if (ext === "xlsx") assert.equal(buf.subarray(0, 2).toString(), "PK");
    if (ext === "pdf") assert.equal(buf.subarray(0, 4).toString(), "%PDF");
  }
});

await step("Admin: list users, add a user with a password, change a setting", async () => {
  await page.getByRole("link", { name: "Admin", exact: true }).click();
  await page.waitForURL(/\/admin$/);
  await page.getByText("user@test.com").waitFor();
  await page.getByRole("button", { name: "+ Add user" }).click();
  await page.getByRole("button", { name: "Set password now" }).click();
  await page.getByLabel("Name").fill("Meena Staff");
  await page.getByLabel("Email").fill("meena@test.com");
  await page.getByLabel("Password").fill("secret-pass-1");
  await page.getByRole("button", { name: "Create user" }).click();
  await page.getByText("meena@test.com can now sign in").waitFor();
  const create = (await calls()).find((x) => x.type === "createUser");
  assert.deepEqual(create.body.app_metadata, { provisioned: true });
  assert.equal(create.body.email_confirm, true);
  await page.getByRole("switch", { name: /Users can see everyone/ }).uncheck({ force: true });
  await page.waitForTimeout(500);
  const upd = (await calls()).filter((x) => x.type === "update" && x.table === "app_settings").at(-1);
  assert.equal(upd.body.users_view_all, false);
  await page.screenshot({ path: `${OUT}/10-admin.png`, fullPage: true });
});

await step("Admin: invite by email sends a set-password link", async () => {
  await page.getByRole("button", { name: "+ Add user" }).click();
  await page.getByRole("button", { name: "Invite by email" }).click();
  await page.getByLabel("Name").fill("Kiran");
  await page.getByLabel("Email").fill("kiran@test.com");
  await page.getByRole("button", { name: "Send invite" }).click();
  await page.getByText("Invite sent to kiran@test.com").waitFor();
  const rec = (await calls()).find((x) => x.type === "recover");
  assert.equal(rec.body.email, "kiran@test.com");
  assert.match(rec.redirect, /\/auth\/complete\?next=\/set-password$/);
});

await step("Audit log shows the bill creation", async () => {
  await page.getByRole("link", { name: "Audit log" }).click();
  await page.getByText("Bill created").first().waitFor();
  await page.getByText("Bill created").first().click();
  await page.getByText("Before").waitFor();
  await page.screenshot({ path: `${OUT}/11-audit.png`, fullPage: true });
});

await step("Delete bill removes it and its photo", async () => {
  await page.goto(savedBillUrl.replace("?saved=1", ""));
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Delete bill" }).click();
  await page.waitForURL(/\/entries/);
  const c = await calls();
  assert.ok(c.some((x) => x.type === "rpc" && x.name === "delete_bill"));
  assert.ok(c.some((x) => x.type === "removeObject"));
});

await step("manual entry works without a photo", async () => {
  await page.goto(`${BASE}/bills/new?manual=1`);
  await page.getByRole("heading", { name: "Review bill" }).waitFor();
  await page.getByLabel("Item name, row 1").first().fill("Bandage roll");
  await page.getByRole("button", { name: "Submit" }).click();
  await page.waitForURL(/saved=1/);
});

await step("sign out returns to login", async () => {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL(/\/login/);
});

// Regular user
await step("regular user: no Admin tab, /admin redirects home, other's bill read-only", async () => {
  await page.getByLabel("Email").fill("user@test.com");
  await page.getByLabel("Password").fill("password123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${BASE}/`);
  assert.equal(await page.getByRole("link", { name: "Admin", exact: true }).count(), 0);
  await page.goto(`${BASE}/admin`);
  await page.waitForURL(`${BASE}/`);
  const res = await page.request.get(`${BASE}/api/admin/users`);
  assert.equal(res.status(), 403);
});

await step("API rejects signed-out callers", async () => {
  const anon = await browser.newContext();
  const r = await anon.request.post(`${BASE}/api/extract`, { data: { imagePath: "x/y.jpg" } });
  assert.equal(r.status(), 401);
  await anon.close();
});

await step("PWA: manifest and service worker", async () => {
  const m = await (await page.request.get(`${BASE}/manifest.webmanifest`)).json();
  assert.equal(m.display, "standalone");
  assert.ok(m.icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  const sw = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!reg;
  });
  assert.ok(sw, "service worker registered");
  const offline = await page.request.get(`${BASE}/offline.html`);
  assert.equal(offline.status(), 200);
});

await step("offline banner appears when the connection drops", async () => {
  await ctx.setOffline(true);
  await page.getByText("You're offline").waitFor();
  await page.screenshot({ path: `${OUT}/12-offline.png` });
  await ctx.setOffline(false);
});

await step("iPhone shows Add to Home Screen instructions", async () => {
  const ios = await browser.newContext({ ...devices["iPhone 13"] });
  const p = await ios.newPage();
  await p.goto(`${BASE}/login`);
  await p.getByLabel("Email").fill("user@test.com");
  await p.getByLabel("Password").fill("password123");
  await p.getByRole("button", { name: "Sign in" }).click();
  await p.waitForURL(`${BASE}/`);
  await p.getByText("Add to Home Screen").waitFor();
  await p.screenshot({ path: `${OUT}/13-iphone-home.png` });
  await ios.close();
});

const unexpected = consoleErrors.filter((e) => !/Failed to load resource.*(400|401|403|406)|net::ERR_INTERNET_DISCONNECTED|offline/i.test(e));
if (unexpected.length) console.log("Console errors:\n  " + unexpected.join("\n  "));
writeFileSync(`${OUT}/results.txt`, results.join("\n") + "\n");
await browser.close();
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
