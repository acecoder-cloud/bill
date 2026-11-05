// Separate staff wallets: owner gives money, each staff member records on their own phone and sees only their wallet.
// The stand-in store doesn't push changes between open pages, so one page switches between the owner's and staff phones.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const DIR = new URL(".", import.meta.url).pathname;
const URL_ = "file://" + DIR + "page.html";
const browser = await chromium.launch();
let pass = 0, fail = 0;
const step = async (n, f) => { try { await f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message.split("\n").slice(0, 8).join("\n   ")); } };
const ctx = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Kolkata", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.clock.setFixedTime(new Date("2026-11-05T15:00:00+05:30"));
await ctx.addInitScript(() => { try { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); } catch {} });
await ctx.route("https://fonts.*/**", (r) => r.abort());
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const store = async () => new Map(await page.evaluate(() => JSON.parse(localStorage.getItem("mock-store") || "[]")));
const clip = () => page.evaluate(() => navigator.clipboard.readText());
let clock = Date.parse("2026-11-05T15:00:00+05:30");
const tick = async () => { clock += 60000; await ctx.clock.setFixedTime(new Date(clock)); };   // a minute passes between phones
const owner = async () => { await tick(); await page.goto(URL_ + "?role=admin&persist=1#accounts"); await page.waitForFunction(() => W.regLoaded && ACC.loaded.tx && !ACC.seeding && !W.linking && !W.setup, null, { timeout: 60000 }); await page.waitForTimeout(300); };
const staff = async (uid) => { await tick(); await page.goto(URL_ + `?role=staff&uid=${uid}&persist=1#accounts`); await page.waitForFunction(() => W.metaLoaded && ACC.loaded.tx, null, { timeout: 30000 }); await page.waitForTimeout(200); };
const card = (name) => page.locator(".wcard", { hasText: name });
const bal = async (name) => (await card(name).locator("b").innerText()).trim();
const code = async (name) => { await card(name).click(); await page.getByRole("button", { name: "Wallet settings" }).click(); return (await page.locator("#wf-code").innerText()).trim(); };

await page.goto(URL_ + "?role=none&persist=1");
await page.evaluate(() => localStorage.clear());

await step("owner's first run: Nandhini and Dharani wallets; the ledger is in Nandhini's wallet with the same totals", async () => {
  await owner();
  await page.waitForFunction(() => ACC.settings.seeded_at && W.reg.size === 2, null, { timeout: 60000 }); await owner();
  assert.equal(await bal("Nandhini"), "₹5,897"); assert.equal(await bal("Dharani"), "₹0");
  assert.match(await card("Combined").innerText(), /₹5,897[\s\S]*Given ₹27,600 · spent ₹21,703/);
  await card("Nandhini").click(); await page.getByRole("button", { name: "All time", exact: true }).click();
  assert.match((await page.locator(".acc-totals").innerText()).replace(/\s+/g, " "), /Received ₹27,600 Spent ₹21,703 Available ₹5,897/);
});
await step("old single-ledger data moves into Nandhini's wallet with exactly the same totals (old copy kept)", async () => {
  const s = await store(); const legacy = []; const keep = [];
  for (const [k, v] of s) {
    const m = /^(wallets|walletin)\/[^/]+\/tx\/(.+)$/.exec(k);
    if (m) { const { wallet, created_by_name, ...rest } = v; legacy.push([`accounts/tx/list/${m[2]}`, rest]); }
    else if (k === "accounts/settings") { const { wallets_at, legacy_wallet, low_threshold, ...st } = v; keep.push([k, st]); }
    else if (k.startsWith("accounts/items/")) keep.push([k, v]);
  }
  const p2 = await ctx.newPage(); await p2.goto(URL_ + "?role=none&persist=1&uid=x");
  await p2.evaluate((st) => { localStorage.setItem("legacy-copy", JSON.stringify(st)); }, [...keep, ...legacy]); await p2.close();
  const fresh = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Kolkata" }); await fresh.clock.setFixedTime(new Date("2026-11-05T15:00:00+05:30"));
  const q = await fresh.newPage(); q.on("pageerror", (e) => errs.push(String(e)));
  await q.goto(URL_ + "?role=none&persist=1"); await q.evaluate((st) => { localStorage.clear(); localStorage.setItem("mock-store", JSON.stringify(st)); localStorage.setItem("mock-store-t", String(9e15)); }, [...keep, ...legacy]);
  await q.goto(URL_ + "?role=admin&persist=1#accounts");
  await q.waitForFunction(() => ACC.settings.wallets_migrated_at && !ACC.seeding, null, { timeout: 60000 });
  await q.getByText("Moved 182 ledger entries into Nandhini's wallet.", { exact: false }).waitFor();
  assert.deepEqual(await q.evaluate(() => { const k = legacyKey(); const e = walletEntries(k); return [e.filter((t) => t.type === "received").reduce((a, t) => a + t.amount, 0), e.filter((t) => t.type === "expense").reduce((a, t) => a + t.amount, 0), walletBalance(k), ACC.legacy.size]; }), [27600, 21703, 5897, 182]);
  await fresh.close();
});
await step("staff link their phones with an invite code; the owner's phone finishes the link", async () => {
  await owner(); const cn = await code("Nandhini"); const cd = await code("Dharani");
  assert.match(cn, /^[A-Z0-9]{6}$/);
  await staff("u_dharani");
  await page.getByRole("heading", { name: "Link your wallet" }).waitFor();
  await page.locator("#acc-claim-code").fill("WRONG1"); await page.getByRole("button", { name: "Link" }).click();
  await page.getByText(/Code WRONG1 sent/).waitFor();
  await owner(); await staff("u_dharani");
  await page.getByText("The code “WRONG1” didn't match.").waitFor();
  await page.locator("#acc-claim-code").fill(cd.toLowerCase()); await page.getByRole("button", { name: "Link" }).click();
  await staff("u_nandhini"); await page.locator("#acc-claim-code").fill(cn); await page.getByRole("button", { name: "Link" }).click();
  await owner();
  await page.waitForFunction(() => wallets().every((w) => w.uid), null, { timeout: 30000 });
  assert.deepEqual(await page.evaluate(() => wallets().map((w) => [w.name, w.key])), [["Nandhini", "u_nandhini"], ["Dharani", "u_dharani"]]);
  assert.equal(await bal("Nandhini"), "₹5,897", "history moved with the link");
  const s = await store(); assert.equal([...s.keys()].filter((k) => k.startsWith("wallets/u_nandhini/tx/") || k.startsWith("walletin/u_nandhini/tx/")).length, 182);
  assert.equal([...s.keys()].filter((k) => /^(wallets|walletin)\/w/.test(k)).length, 0, "nothing left under the old wallet ids");
});
await step("owner gives money to each staff member separately; each sees it with a badge", async () => {
  await owner();
  for (const [who, amt] of [["Dharani", "2000"], ["Nandhini", "1000"]]) {
    await page.getByRole("button", { name: "+ Give money" }).click();
    await page.locator("#rf-wallet").selectOption(`u_${who.toLowerCase()}`); await page.locator("#rf-amount").fill(amt);
    await page.locator("#rf-method").selectOption("Google Pay");
    await page.getByRole("button", { name: "Save money received" }).click();
    await page.getByText(new RegExp(`Gave ₹${Number(amt).toLocaleString("en-IN")} to ${who}`)).waitFor();
  }
  assert.equal(await bal("Dharani"), "₹2,000"); assert.equal(await bal("Nandhini"), "₹6,897");
  await staff("u_dharani");
  await page.getByText("💰 ₹2,000 received on 05/11/2026").waitFor();
  assert.equal(await page.locator('a[href="#accounts"] .tab-badge').innerText(), "1");
  assert.equal(await page.locator("#acc-available").innerText(), "₹2,000");
  await page.getByRole("button", { name: "OK", exact: true }).click();
  assert.equal(await page.locator('a[href="#accounts"] .tab-badge').count(), 0);
});
await step("staff see only their own wallet and cannot give money (enforced by the store's rules)", async () => {
  await staff("u_dharani");
  const txt = await page.locator("#main").innerText();
  assert.ok(!/Nandhini/.test(txt) && !/5,897|6,897/.test(txt), "no other wallet");
  assert.equal(await page.getByRole("button", { name: "+ Give money" }).count(), 0);
  const probe = await page.evaluate(async () => {
    const db = S.caps.db; const out = {};
    out.readOther = (await db.collection("wallets/u_nandhini/tx").get()).docs.length;
    out.readReg = (await db.collection("walletreg").get()).docs.length;
    out.readOldLedger = (await db.collection("accounts/tx/list").get()).docs.length;
    for (const [k, p] of [["giveSelf", "walletin/u_dharani/tx/hack"], ["writeOther", "wallets/u_nandhini/tx/hack"], ["editItems", "accounts/items/list/hack"]]) { try { await db.doc(p).set({ type: "received", amount: 99999 }); out[k] = "allowed"; } catch { out[k] = "refused"; } }
    try { await db.doc("wallets/u_dharani/tx/ok").set({ type: "expense", amount: 1, date: "2026-11-05" }); await db.doc("wallets/u_dharani/tx/ok").delete(); out.ownExpense = "allowed"; } catch { out.ownExpense = "refused"; }
    return out;
  });
  assert.deepEqual(probe, { readOther: 0, readReg: 0, readOldLedger: 0, giveSelf: "refused", writeOther: "refused", editItems: "refused", ownExpense: "allowed" });
});
await step("staff add expenses on their phone; the owner sees them as New with who added them", async () => {
  await staff("u_dharani");
  await page.getByRole("button", { name: /^Idli ₹116$/ }).click(); await page.getByText("Added Idli ₹116 for today.").waitFor();
  await page.getByRole("button", { name: "+ Add expense" }).click();
  await page.getByLabel("Item 1").fill("Glucose biscuits"); await page.getByLabel("Amount 1").fill("40");
  await page.getByLabel(/Add "Glucose biscuits" as a new item \(the owner will check it\)/).check();
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.getByText("Expense saved: ₹40. Dharani's balance ₹1,844.").waitFor();
  await owner();
  assert.equal(await bal("Dharani"), "₹1,844");
  assert.match(await card("Dharani").innerText(), /2 new/);
  await card("Dharani").click();
  const row = page.locator(".acc-row", { hasText: "Glucose biscuits" }); assert.match(await row.innerText(), /New/);
  await row.locator(".acc-row-btn").click(); assert.match(await row.innerText(), /Added by Dharani/);
  await page.getByRole("button", { name: "Items", exact: true }).click();
  await page.getByText("New items – need owner check").waitFor();
  await page.locator(".add-panel", { hasText: "Glucose biscuits" }).getByRole("button", { name: "Approve" }).click();
  await page.getByText("Glucose biscuits added to the item list.").waitFor();
  assert.ok([...(await store()).values()].some((v) => v.name === "Glucose biscuits" && v.approved_from === "Dharani"));
});
await step("owner asks a question; it shows on the staff phone until answered", async () => {
  await owner(); await card("Dharani").click(); await page.getByRole("button", { name: "Entries", exact: true }).click();
  const row = page.locator(".acc-row", { hasText: "Glucose biscuits" }); await row.locator(".acc-row-btn").click();
  await row.getByRole("button", { name: "Ask a question" }).click(); await row.locator("[data-ask] input").fill("Which shop?"); await row.getByRole("button", { name: "Send" }).click();
  await page.getByText("Question sent.").waitFor();
  await page.locator(".acc-row", { hasText: "Glucose biscuits" }).getByRole("button", { name: "Mark checked" }).click();
  await staff("u_dharani");
  await page.getByText("The owner asked about 1 entry.").waitFor();
  const r2 = page.locator(".acc-row", { hasText: "Glucose biscuits" }); await r2.locator(".acc-row-btn").click();
  await r2.locator("[data-answer] input").fill("Hospital canteen"); await r2.getByRole("button", { name: "Answer" }).click();
  await page.getByText("Answer sent.").waitFor();
  assert.equal(await page.getByText("The owner asked about").count(), 0);
  await owner(); await card("Dharani").click(); const r3 = page.locator(".acc-row", { hasText: "Glucose biscuits" }); await r3.locator(".acc-row-btn").click();
  assert.match(await r3.innerText(), /Owner asked: Which shop\?[\s\S]*Dharani answered: Hospital canteen/); assert.match(await r3.innerText(), /Checked ✓/);
});
await step("transfer between staff keeps the combined total", async () => {
  await owner(); const before = await page.evaluate(() => wallets().reduce((a, w) => a + walletBalance(w.key), 0));
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.locator('[data-tf2="from"]').selectOption("u_nandhini"); await page.locator('[data-tf2="to"]').selectOption("u_dharani");
  await page.locator("#tr-amount").fill("500"); await page.locator('[data-tf2="note"]').fill("Cash handed over"); await page.getByRole("button", { name: "Transfer", exact: true }).click();
  await page.getByText("Moved ₹500 from Nandhini to Dharani.").waitFor();
  assert.equal(await bal("Nandhini"), "₹6,397"); assert.equal(await bal("Dharani"), "₹2,344");
  assert.equal(await page.evaluate(() => wallets().reduce((a, w) => a + walletBalance(w.key), 0)), before);
});
await step("Copy for WhatsApp per wallet (name first, matching balances) and the combined summary", async () => {
  await staff("u_dharani");
  await page.getByRole("button", { name: "Copy for WhatsApp (this period)" }).click(); await page.getByText(/Copied the/).waitFor();
  const t = (await clip()).split("\n");
  assert.equal(t[0], "*Dharani*"); assert.equal(t[1], "*Available -RS: 2,344*"); assert.equal(t.at(-1), "*RS: 2,344*");
  assert.ok(t.includes("*05/11/2026 Amount received 2,000*") && t.includes("*05/11/2026 Received from Nandhini 500*") && t.includes("05/11/2026 - Idli 116 rupees"), t.join("\n"));
  await owner(); await card("Combined").click(); await page.getByRole("button", { name: "Copy combined summary" }).click(); await page.getByText("Copied the combined summary.").waitFor();
  assert.equal(await clip(), "*Wallets – 05/11/2026*\nNandhini – balance ₹6,397 · spent this period ₹1,318\nDharani – balance ₹2,344 · spent this period ₹156\n\n*Total available ₹8,741*");
});
await step("offline entries on a staff phone show Not synced yet, then sync once (no duplicates)", async () => {
  await staff("u_dharani");
  await ctx.setOffline(true);
  try {
    await page.getByRole("button", { name: /^Tea ₹43$/ }).click(); await page.getByText("Added Tea ₹43 for today.").waitFor();
    const row = page.locator(".acc-row", { hasText: "Tea" }).first(); assert.match(await row.innerText(), /Not synced yet/);
  } finally { await ctx.setOffline(false); }
  await page.waitForFunction(() => !outbox().length, null, { timeout: 15000 });
  await page.reload(); await page.waitForFunction(() => ACC.loaded.tx);
  assert.equal([...(await store()).entries()].filter(([k, v]) => k.startsWith("wallets/u_dharani/tx/") && v.lines?.[0]?.name === "Tea").length, 1);
  assert.equal(await page.locator(".acc-row", { hasText: "Not synced yet" }).count(), 0);
});
await step("an offline edit that clashes with the owner's edit keeps both versions for the owner to choose", async () => {
  await staff("u_dharani");
  await ctx.setOffline(true);
  try {
    const row = page.locator(".acc-row", { hasText: "Tea" }).first(); await row.locator(".acc-row-btn").click(); await row.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Amount 1").fill("45"); await page.getByRole("button", { name: "Save changes" }).click(); await page.getByText(/Expense updated: ₹45/).waitFor();
  } finally { /* stay offline while the owner edits */ }
  // meanwhile the owner edits the same entry (applied to the stored copy while this phone is offline)
  const tid = await page.evaluate(() => [...W.raw.get("wallets/u_dharani/tx")].find(([, v]) => v.lines?.[0]?.name === "Tea")[0]);
  await page.evaluate((id) => { const m = new Map(JSON.parse(localStorage.getItem("mock-store"))); const k = `wallets/u_dharani/tx/${id}`; const v = m.get(k);
    m.set(k, { ...v, amount: 50, lines: [{ name: "Tea", category: "Food", qty: 1, amount: 50 }], updated_at: "2026-11-05T09:40:00.000Z", updated_by_name: "Owner" });
    localStorage.setItem("mock-store", JSON.stringify([...m])); localStorage.setItem("mock-store-t", String(9e15)); window.name = ""; }, tid);
  await page.reload(); await page.waitForFunction(() => ACC.loaded.tx && outbox().length === 1, null, { timeout: 15000 });   // still offline: the edit waits on the phone
  await ctx.setOffline(false); await page.waitForFunction(() => !outbox().length, null, { timeout: 15000 });   // back online: it is sent, and the clash is noticed
  await owner(); await page.getByText("Two versions to choose from").waitFor();
  assert.match(await page.locator(".card", { hasText: "Two versions" }).innerText(), /A\) 05\/11\/2026 · Tea · ₹50[\s\S]*B\) 05\/11\/2026 · Tea · ₹45/);
  await page.getByRole("button", { name: "Keep B" }).click(); await page.getByText("Kept the version you chose.").waitFor();
  const teas = [...(await store()).entries()].filter(([k, v]) => k.startsWith("wallets/u_dharani/tx/") && v.lines?.[0]?.name === "Tea");
  assert.deepEqual(teas.map(([, v]) => v.amount), [45]);
});
await step("expenses that go below zero warn the staff member and are flagged for the owner", async () => {
  await staff("u_dharani");
  await page.getByRole("button", { name: "+ Add expense" }).click();
  await page.getByLabel("Item 1").fill("Wheelchair rent"); await page.getByLabel("Amount 1").fill("3000");
  await page.getByRole("button", { name: "Save expense" }).click();
  await page.getByText(/This takes the balance below zero/).waitFor(); await page.getByRole("button", { name: "Save anyway" }).click();
  await page.getByText(/below zero; the owner will see it flagged/).waitFor();
  await owner(); await card("Dharani").click();
  assert.match(await page.locator(".acc-row", { hasText: "Wheelchair rent" }).innerText(), /Below zero/);
  assert.match(await card("Dharani").innerText(), /⚠ Below ₹500/);
});
await step("deactivating a staff member keeps history but blocks new entries", async () => {
  await owner(); await card("Dharani").click(); await page.getByRole("button", { name: "Wallet settings" }).click();
  await page.locator('[data-wf="status"]').selectOption("inactive"); await page.getByRole("button", { name: "Save wallet" }).click(); await page.getByText("Wallet saved.").waitFor();
  await staff("u_dharani");
  await page.getByText("Your wallet is inactive.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "+ Add expense" }).count(), 0);
  assert.ok(await page.locator(".acc-row", { hasText: "Wheelchair rent" }).count() > 0, "history kept");
  await owner(); await card("Dharani").click(); await page.getByRole("button", { name: "Wallet settings" }).click();
  await page.locator('[data-wf="status"]').selectOption("active"); await page.getByRole("button", { name: "Save wallet" }).click(); await page.getByText("Wallet saved.").waitFor();
});
await step("+ Add staff creates a new wallet with its own invite code", async () => {
  await owner(); await page.getByRole("button", { name: "+ Add staff" }).click();
  await page.locator("#sf-name").fill("Priya"); await page.locator('[data-sf="opening_balance"]').fill("300"); await page.getByRole("button", { name: "Add staff" }).click();
  await page.getByText("Priya's wallet is ready.", { exact: false }).waitFor();
  assert.equal(await bal("Priya"), "₹300"); assert.match(await page.locator("#wf-code").innerText(), /^[A-Z0-9]{6}$/);
});
await step("shared phone mode: staff pick their name and enter their PIN; entries record who added them", async () => {
  await owner(); await card("Priya").click(); await page.getByRole("button", { name: "Wallet settings" }).click();
  await page.locator('[data-wf="pin"]').fill("4321"); await page.getByRole("button", { name: "Save wallet" }).click(); await page.getByText("Wallet saved.").waitFor();
  await page.locator("#acc-shared").check();
  await page.locator(".chips", { hasText: "Owner" }).getByRole("button", { name: "Priya" }).click();
  await page.locator("#acc-pin").fill("1111"); await page.getByRole("button", { name: "Switch" }).click(); await page.getByText("Wrong PIN.").waitFor();
  await page.locator("#acc-pin").fill("4321"); await page.getByRole("button", { name: "Switch" }).click();
  await page.getByText("Recording as Priya.", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "+ Give money" }).count(), 0);
  await page.getByRole("button", { name: /^Coffee ₹45$/ }).click(); await page.getByText("Added Coffee ₹45 for today.").waitFor();
  const pk = await page.evaluate(() => wallets().find((w) => w.name === "Priya").key);
  const e = [...(await store()).entries()].find(([k, v]) => k.startsWith(`wallets/${pk}/tx/`) && v.lines?.[0]?.name === "Coffee");
  assert.deepEqual([e[1].created_by_name, e[1].profile], ["Priya", true]);
  await page.locator(".chips", { hasText: "Owner" }).getByRole("button", { name: "Owner" }).click();
  await page.locator("#acc-shared").uncheck();
});
await step("filters by wallet and by who added; CSV has wallet and created-by columns", async () => {
  await owner(); await card("Combined").click(); await page.getByRole("button", { name: "Entries", exact: true }).click();
  await page.getByRole("button", { name: "All time", exact: true }).click();
  await page.locator("#acc-by").selectOption("Dharani");
  const rows = await page.locator(".acc-row").count(); assert.ok(rows >= 4, String(rows));
  await page.getByRole("button", { name: /Export entries to CSV/ }).click();
  await page.waitForFunction(() => window.__log.some((x) => x[0] === "save" && x[1].startsWith("accounts-")));
  const csv = (await page.evaluate(() => window.__lastSave)).replace(/^﻿/, "").trim().split("\r\n");
  assert.ok(csv[0].endsWith(",wallet,created_by,created_at"));
  assert.ok(csv.slice(1).every((l) => l.includes(",Dharani,")), "filtered to entries Dharani added");
  await page.locator("#acc-by").selectOption("all");
});
await step("no regressions: other tabs still open; no sideways scroll", async () => {
  await owner();
  for (const t of ["Pharmacy", "Inventory", "Routine", "Home", "Accounts"]) { await page.getByRole("link", { name: new RegExp(t + "$") }).click(); await page.waitForTimeout(150); }
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  await page.screenshot({ path: DIR + "w1-owner.png", fullPage: true });
  await staff("u_dharani"); await page.screenshot({ path: DIR + "w2-staff.png", fullPage: true });
});
console.log(errs.length ? "Page errors:\n  " + errs.join("\n  ") : "No page errors");
console.log(`${pass}/${pass + fail} passed`);
await browser.close();
