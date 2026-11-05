import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const DIR = new URL(".", import.meta.url).pathname;
const URL_ = "file://" + DIR + "page.html";
const browser = await chromium.launch();
let pass = 0, fail = 0;
const step = async (n, f) => { try { await f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message.split("\n").slice(0, 8).join("\n   ")); } };
const LIBS = { "pdf.js/3.11.174/pdf.min.js": "pdfjs-dist/build/pdf.min.js", "pdf.js/3.11.174/pdf.worker.min.js": "pdfjs-dist/build/pdf.worker.min.js", "jspdf/2.5.1/jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js", "jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js" };
const NOW = new Date("2026-11-05T14:10:00+05:30");
const ctx = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Kolkata", permissions: ["clipboard-read", "clipboard-write"] });
await ctx.clock.setFixedTime(NOW);
await ctx.addInitScript(() => {
  try { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); } catch {}
  window.__sampleJson = (prompt, opts) => { window.__scanCalls = (window.__scanCalls || 0) + 1; window.__lastPrompt = prompt; window.__lastOpts = { n: opts.images.length, tier: opts.modelTier || "" }; return JSON.parse(localStorage.getItem("test-fixture") || "{}"); };
});
await ctx.route("https://cdnjs.cloudflare.com/ajax/libs/**", (route) => { const k = Object.keys(LIBS).find((x) => route.request().url().endsWith(x)); return k ? route.fulfill({ path: DIR + "libs/node_modules/" + LIBS[k], contentType: "text/javascript" }) : route.abort(); });
await ctx.route("https://fonts.*/**", (r) => r.abort());
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const clip = () => page.evaluate(() => navigator.clipboard.readText());
const store = async () => new Map(await page.evaluate(() => JSON.parse(localStorage.getItem("mock-store") || "[]")));
const day = async (d) => (await store()).get("routine/days/list/" + d);
const scans = async () => [...(await store()).entries()].filter(([k]) => k.startsWith("routine/scans/list/")).map(([k, v]) => ({ id: k.split("/").at(-1), ...v }));
const progress = () => page.locator("#dr-progress").innerText();
const sec = (name) => page.locator(".dr-sec", { has: page.getByRole("heading", { name, exact: true }) });
const item = (title) => page.locator(".scan-item", { has: page.locator("b", { hasText: new RegExp("^" + title.replace(/[()]/g, "\\$&") + "$") }) });
const setFixture = (f) => page.evaluate((x) => localStorage.setItem("test-fixture", JSON.stringify(x)), f);
const live = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => !v.deleted));

/* the 04/11 notebook (sample day), read on 05/11 */
const NOTEBOOK = {
  pages: [{ page_index: 1, date: "05/11/2026", date_confidence: "high" }, { page_index: 2, date: "05/11/2026", date_confidence: "high" }], date: "05/11/2026",
  care: [
    { task: "Ward boy care", done_by: "Francis", from: "4:30 AM", to: "5:00 AM", details: "Bed sheet change, oil applying, underpad change", confidence: "high", page_index: 1 },
    { task: "Staff nurse care", done_by: "Yokeshwari", from: "5:00 AM", to: "5:30 AM", details: "Tracheostomy care, oral care, catheter care", confidence: "high", page_index: 1 },
    { task: "Morning sleep", done_by: null, from: "5:00 AM", to: "9:20 AM", details: null, confidence: "high", page_index: 1 },
    { task: "Floor cleaning", done_by: "Vaitheshwari", from: "11:00 AM", to: null, confidence: "high", page_index: 1 },
    { task: "Restroom cleaning", done_by: "Sudha", from: "12:30 PM", to: null, confidence: "high", page_index: 1 },
    { task: "Evening care", done_by: "Selvi", from: "6:00 PM", to: null, raw: "Evng care - Selvi", confidence: "low", page_index: 1 },
    { task: "Floor cleaning", done_by: "Bhuvana", from: "8:20 PM", to: null, confidence: "high", page_index: 1 }],
  nebulizer: { morning: { items: "Duolin + Mesna", staff_nurse: "Yokeshwari", confidence: "high", page_index: 1 }, afternoon: { items: "Duolin + Mesna", staff_nurse: "Mangai", confidence: "high", page_index: 1 }, night: null },
  rt_feed: [["6:00 AM", "Rice kanji", "Yokeshwari"], ["8:00 AM", "Rice kanji", "Mangai"], ["10:00 AM", "Veg soup", "Pavadharani"], ["12:00 PM", "Egg blend", "Nandhini"], ["2:00 PM", "Rice kanji", "Gayathri"], ["4:00 PM", "Egg blend", "Nandhini"], ["6:00 PM", "Rice kanji", "Gayathri"], ["8:00 PM", "Rava kanji", "Yokeshwari"], ["10:00 PM", null, null]]
    .map(([time, feed, given_by]) => ({ time, feed, given_by, confidence: "high", page_index: 1 })),
  medication: {
    morning: { items: ["Tab. B-Complex", "Tab. Nicardia 10mg", "Tab. Prolomet XL", "Tab. Rador 20mg", "Tab. Strocit Plus 500mg", "Syp. Potassium Chloride (KCl)"], staff_nurse: "Mangai", confidence: "high", page_index: 1 },
    afternoon: { items: ["Tab. Nicardia 10mg", "Syp. Potassium Chloride (KCl)"], staff_nurse: "Gayathri", confidence: "high", page_index: 1 },
    night: { items: ["Tab. Nicardia 10mg", "Tab. Rosuvas", "Syp. Potassium Chloride (KCl)", "Tab. Dolo 650"], staff_nurse: "Yokeshwari", confidence: "medium", page_index: 1 } },
  vitals: { morning: { temp_f: 97.0, pulse: 82, spo2: 99, bp: "110/70", sugar: null, staff_nurse: "Mangai", confidence: "high", page_index: 2 },
    afternoon: { temp_f: 97.0, pulse: 90, spo2: 98, bp: "120/70", sugar: null, staff_nurse: "Gayathri", confidence: "medium", page_index: 2 }, night: null },
  oral_feed: [{ meal: "Breakfast", item: "Pongal", time: "9:40 AM", confidence: "high", page_index: 2 }, { meal: "Lunch", item: "Rasam rice", time: "2:30 PM", confidence: "high", page_index: 2 }],
  output: [],
  doctor_comments: [{ doctor: "Dr Jothi", time: "12:50 PM", comment: "Rounds", confidence: "high", page_index: 2 }, { doctor: "Dr Sushmitha", time: null, comment: "Consulting today", confidence: "high", page_index: 2 },
    { doctor: null, time: "1:30 PM", comment: "Occupational therapy 1:30 PM to 1:40 PM", confidence: "high", page_index: 2 }, { doctor: "Dr Vinothini", time: "5:05 PM", comment: "Special educator – writing practice", confidence: "high", page_index: 2 },
    { doctor: "Dr Santhosham", time: "5:25 PM", comment: "Critical care – advised to plan Friday decannulation", confidence: "medium", page_index: 2 }],
  physio: [{ task: "Physiotherapy", by: "Dr Hariharan", from: "11:15 AM", to: "11:25 AM", details: null, confidence: "high", page_index: 2 }, { task: "Chair sitting", by: null, from: "11:30 AM", to: "12:30 PM", confidence: "high", page_index: 2 },
    { task: "Newspaper reading", by: null, from: null, to: null, confidence: "high", page_index: 2 }, { task: "Occupational therapy", from: "1:30 PM", to: "1:40 PM", confidence: "high", page_index: 2 },
    { task: "Physiotherapy", by: null, from: "4:15 PM", to: "4:25 PM", confidence: "high", page_index: 2 }, { task: "Ball therapy", from: "4:35 PM", to: null, details: "5 minutes", confidence: "high", page_index: 2 },
    { task: "Chair sitting", from: "4:35 PM", to: "5:35 PM", confidence: "high", page_index: 2 }, { task: "Colouring / writing practice", by: "Dr Vinothini", from: "5:05 PM", details: "Writing practice", confidence: "medium", page_index: 2 },
    { task: "Board games", details: "Rope challenge, flipping chess", confidence: "high", page_index: 2 },
    ...["6:30 AM", "10:00 AM", "12:30 PM", "3:00 PM"].map((t) => ({ task: "Finger movements", from: t, details: "50 times", confidence: "high", page_index: 2 }))],
  visitors: [{ time: null, name: null, place: null, type: null, raw: "No visitors", confidence: "high", page_index: 2 }],
  room_issues: "Restroom issue", improvements: "Writing practice", other_discussion: null, unmatched_text: ["Room no 115"],
};
const LATER = JSON.parse(JSON.stringify(NOTEBOOK)); LATER.vitals.night = { temp_f: 98.2, pulse: 84, spo2: 98, bp: "118/74", sugar: null, staff_nurse: "Yokeshwari", confidence: "high", page_index: 2 };

await page.goto(URL_ + "?role=admin&persist=1");
await page.evaluate(() => localStorage.clear());
await page.goto(URL_ + "?role=admin&persist=1#routine");
await page.waitForFunction(() => ROU.settings.daily_seeded_at && !DR.seeding && ROU.settings.seeded_at, null, { timeout: 60000 });
await setFixture(NOTEBOOK);

await step("Scan notebook is on the Routine tab and the day page; photos and camera pages can be reordered, deleted and retaken", async () => {
  await page.locator(".row-between", { has: page.getByRole("heading", { name: "Routine" }) }).getByRole("button", { name: /Scan notebook/ }).waitFor();
  await page.locator("#dr-me").fill("Nandhini"); await page.locator("#dr-me").dispatchEvent("change");
  await page.locator('section.card [data-act="scan-open-capture"]').click();
  await page.getByRole("heading", { name: "Scan notebook" }).waitFor();
  for (const b of ["Take photo", "Upload photos", "Upload PDF"]) await page.getByRole("button", { name: new RegExp(b) }).waitFor();
  await page.locator("#scan-photos").setInputFiles([DIR + "sample-bill.png", DIR + "sample-bill.png"]);
  await page.getByRole("heading", { name: "2 pages" }).waitFor();
  await page.locator('[data-act="scan-cam"]').click().catch(() => {});
  await page.locator("#scan-cam").setInputFiles(DIR + "sample-bill.png");
  await page.getByRole("heading", { name: "3 pages" }).waitFor();
  await page.getByRole("button", { name: /Add another page/ }).waitFor();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  const sizes = () => page.evaluate(() => DR.scan.pages.map((p) => p.url));
  const before = await sizes();
  await page.getByRole("button", { name: "Move page 3 earlier" }).click();
  assert.deepEqual(await sizes(), [before[0], before[2], before[1]]);
  await page.getByRole("button", { name: "Delete page 2" }).click();
  await page.getByRole("heading", { name: "2 pages" }).waitFor();
  await page.getByRole("button", { name: "Retake page 1" }).click().catch(() => {});
  await page.locator("#scan-cam").setInputFiles(DIR + "sample-bill.png");
  await page.waitForFunction((u) => DR.scan.pages[0].url !== u, before[0]);
  const prep = await page.evaluate(async () => { const b = DR.scan.pages[0].blob; const im = await createImageBitmap(b); return [b.type, Math.max(im.width, im.height)]; });
  assert.equal(prep[0], "image/jpeg"); assert.ok(prep[1] <= 2000, String(prep[1]));
});
await step("one-time notice, then Claude reads the pages; nothing is saved before review", async () => {
  await page.getByRole("button", { name: "Read 2 pages with Claude" }).click();
  await page.getByText("Before the first scan:").waitFor();
  await page.getByRole("button", { name: "Read 2 pages with Claude" }).click();
  await page.getByRole("heading", { name: "Check before saving" }).waitFor({ timeout: 30000 });
  const call = await page.evaluate(() => [window.__lastOpts, window.__lastPrompt]);
  assert.equal(call[0].n, 2);
  for (const ref of ["Mangai", "Tab. Rosuvas", "Rice kanji", "Ward boy care", "Adaikkammai", "Return null, never guess".slice(0, 0)]) assert.ok(call[1].includes(ref), ref);
  assert.equal(await day("2026-11-05"), undefined, "the day is untouched until Save");
  const s = (await scans())[0]; assert.equal(s.status, "review"); assert.equal(s.pages.length, 2);
  assert.equal(await page.locator("#scan-date").inputValue(), "2026-11-05");
  await page.screenshot({ path: DIR + "s1-review.png", fullPage: true });
});
await step("review: confidence marks, new names, medicines not in the plan, unmatched text", async () => {
  const ev = item("Evening care");
  assert.match(await ev.innerText(), /Please check/);
  await ev.getByText("“Selvi” isn't in the staff list.").waitFor();
  await ev.locator("[data-rmatch]").selectOption("Sudha");
  assert.equal(await item("Evening care").locator('[data-k="by"]').inputValue(), "Sudha");
  assert.match(await item("Afternoon vitals").innerText(), /Check/);
  const night = item("Night medicines");
  await night.getByText("Not in current plan: Tab. Dolo 650 (Night)").waitFor();
  await night.locator('[data-name="Tab. Dolo 650"]').uncheck();
  await page.getByText("Notebook says: “No visitors”. No visitors will be added.").waitFor();
  await item("Written on the page").locator('[data-k="assign"]').selectOption("other");
  assert.match(await page.locator(".scan-fields .card").first().innerText(), /\b4[0-9] to add · 0 already saved · 0 differ/);
});
await step("Save puts everything in place: matches the 04/11 sample day (42 of 64)", async () => {
  const visitsBefore = await page.evaluate(() => ROU.visits.size);
  await page.getByRole("button", { name: "Save to 05/11/2026" }).click();
  await page.getByText(/Saved the scan to 05\/11\/2026: \d+ added, 0 already there/).waitFor();
  assert.equal(await progress(), "42 of 64 done");
  const d = await day("2026-11-05");
  const vit = (slot) => Object.fromEntries(Object.values(d.occ).filter((o) => o.slot === slot).map((o) => [o.task, [o.value, o.by]]));
  const id = async (n) => (await page.evaluate((x) => [...DR.tasks.entries()].find(([, t]) => t.name === x)[0], n));
  const m = vit("morning"), a = vit("afternoon");
  assert.deepEqual([m[await id("Temperature")], m[await id("Pulse")], m[await id("SpO2")], m[await id("BP")]], [["97", "Mangai"], ["82", "Mangai"], ["99", "Mangai"], ["110/70", "Mangai"]]);
  assert.deepEqual([a[await id("Temperature")], a[await id("Pulse")], a[await id("SpO2")], a[await id("BP")]], [["97", "Gayathri"], ["90", "Gayathri"], ["98", "Gayathri"], ["120/70", "Gayathri"]]);
  assert.equal(Object.keys(live(d.feed)).length, 8); assert.equal(Object.keys(live(d.doctors)).length, 5);
  assert.deepEqual([d.notes.room, d.notes.improvement, d.notes.other], ["Restroom issue", "Writing practice", "Room no 115"]);
  assert.deepEqual(d.meds.night.list, ["Tab. Nicardia 10mg", "Tab. Rosuvas", "Syp. Potassium Chloride (KCl)"]);
  assert.equal(await page.evaluate(() => ROU.visits.size), visitsBefore, "no visitors added");
  assert.ok(Object.values(d.occ).every((o) => o.src), "every value remembers its scan");
  assert.equal(await sec("RT feed").getByText("📷").count(), 8);
  await page.getByText("Notebook scans").waitFor(); assert.match(await page.locator(".scan-row").first().innerText(), /2 pages[\s\S]*Saved/);
  await page.getByRole("button", { name: "Copy for WhatsApp" }).click(); await page.getByText(/Copied the 05\/11\/2026 routine/).waitFor();
  const wa = await clip(); for (const l of ["BP – 110/70 mmHg (Morning, S/N Mangai)", "6:00 AM – Rice kanji ✅ (S/N Yokeshwari)", "Room issues – Restroom issue", "Evening care – 6:00 PM ✅ (Sudha)"]) assert.ok(wa.includes(l), l);
  await page.screenshot({ path: DIR + "s2-day.png", fullPage: true });
});
await step("re-scan the later notebook: only the night vitals are added; a hand edit is not overwritten", async () => {
  await sec("RT feed").getByRole("button", { name: "6:00 AM feed given. Edit" }).click();
  await page.locator('#dr-edit-form [data-ev="by"]').fill("Nandhini");
  await page.locator("#dr-edit-form").getByRole("button", { name: "Save" }).click();
  await sec("RT feed").getByText(/Rice kanji\s+Nandhini/).first().waitFor();
  const before = await day("2026-11-05");
  await setFixture(LATER);
  await page.locator('section.card [data-act="scan-open-capture"]').click();
  await page.locator("#scan-pdf").setInputFiles(DIR + "notebook.pdf");
  await page.getByRole("heading", { name: "2 pages" }).waitFor({ timeout: 20000 });
  await page.getByRole("button", { name: "Read 2 pages with Claude" }).click();
  await page.getByRole("heading", { name: "Check before saving" }).waitFor({ timeout: 30000 });
  assert.match(await page.locator(".scan-fields .card").first().innerText(), /1 to add · \d+ already saved · 2 differ/);
  const f6 = item("6:00 AM feed");
  assert.match(await f6.innerText(), /Saved \(entered by hand\): Rice kanji · Nandhini/);
  assert.equal(await f6.getByRole("button", { name: "Keep saved" }).getAttribute("aria-pressed"), "true");
  assert.equal(await item("Evening care").locator('[data-k="by"]').inputValue(), "Sudha", "the Selvi → Sudha match is remembered");
  await item("Night medicines").getByText("Not in current plan: Tab. Dolo 650 (Night)").waitFor();
  await page.getByRole("button", { name: "Save to 05/11/2026" }).click();
  await page.getByText(/Saved the scan to 05\/11\/2026: 1 added, \d+ already there, 2 kept as entered/).waitFor();
  assert.equal(await progress(), "46 of 64 done");
  const after = await day("2026-11-05");
  const added = Object.keys(after.occ).filter((k) => !before.occ[k]);
  assert.equal(added.length, 4, "night T, PR, SpO2, BP");
  assert.ok(added.every((k) => after.occ[k].slot === "night"));
  for (const k of Object.keys(before.occ)) assert.deepEqual(after.occ[k], before.occ[k], "unchanged " + k);
  assert.deepEqual(after.feed, before.feed); assert.deepEqual(after.doctors, before.doctors); assert.deepEqual(after.notes, before.notes); assert.deepEqual(after.meds, before.meds);
  assert.equal(after.feed.f0600.by, "Nandhini");
  assert.equal(await page.locator(".scan-row").count(), 2);
  const pdfScan = (await scans()).find((s) => s.source === "pdf"); assert.equal(pdfScan.pdfs.length, 1, "original PDF kept");
});
await step("deleting a scan keeps its values unless asked; 'remove values' takes back only that scan's values", async () => {
  await page.locator(".scan-row", { hasText: "PDF" }).getByRole("button", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete and remove its values" }).click();
  await page.getByText("Scan and its values removed.").waitFor();
  assert.equal(await progress(), "42 of 64 done");
  assert.equal((await day("2026-11-05")).feed.f0600.by, "Nandhini");
  assert.equal(await page.locator(".scan-row").count(), 1);
});
await step("offline capture is saved as Pending reading and read automatically when back online", async () => {
  await setFixture(NOTEBOOK);
  await ctx.setOffline(true);
  try {
    await page.locator('section.card [data-act="scan-open-capture"]').click();
    await page.locator("#scan-photos").setInputFiles(DIR + "sample-bill.png");
    await page.getByRole("button", { name: "Save 1 page to read later (offline)" }).click();
    await page.getByText("Saved 1 page as Pending reading.", { exact: false }).waitFor();
    await page.locator(".scan-row", { hasText: "Pending reading" }).waitFor();
    await page.getByText("1 pending").first().waitFor();
    assert.equal(await page.evaluate(() => window.__scanCalls), 2, "not read while offline");
  } finally { await ctx.setOffline(false); }
  await page.locator(".scan-row", { hasText: "Needs review" }).waitFor({ timeout: 20000 });
  await page.locator(".scan-row", { hasText: "Needs review" }).getByRole("button", { name: "Review" }).click();
  assert.match(await page.locator(".scan-fields .card").first().innerText(), /\b0 to add · \d+ already saved · 2 differ/);   // the hand-edited 6 AM feed and Dolo 650 stay as saved
  await page.getByRole("button", { name: "Save to 05/11/2026" }).click();
  await page.getByText(/Saved the scan to 05\/11\/2026: 0 added/).waitFor();
  assert.equal(await progress(), "42 of 64 done", "repeat scan adds nothing");
});
await step("Change date and Discard: nothing is saved", async () => {
  await setFixture({ ...NOTEBOOK, date: "04/11/26", pages: [{ page_index: 1, date: "04/11/26" }, { page_index: 2, date: "05/11/26" }] });
  await page.locator('section.card [data-act="scan-open-capture"]').click();
  await page.locator("#scan-photos").setInputFiles(DIR + "sample-bill.png");
  await page.getByRole("button", { name: "Read 1 page with Claude" }).click();
  await page.getByRole("heading", { name: "Check before saving" }).waitFor({ timeout: 30000 });
  assert.equal(await page.locator("#scan-date").inputValue(), "2026-11-04");
  await page.getByText("Pages show different dates: 04/11/2026, 05/11/2026").waitFor();
  assert.match(await item("Morning vitals").innerText(), /Already saved/, "04/11 already has these values");
  await page.locator("#scan-date").fill("2026-11-06"); await page.locator("#scan-date").dispatchEvent("change");
  await page.getByRole("button", { name: "Save to 06/11/2026" }).waitFor();
  assert.match(await item("Morning vitals").innerText(), /New/);
  await page.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("button", { name: "Discard", exact: true }).last().click();
  await page.getByText("Scan deleted. Saved values stay.").waitFor();
  assert.equal(await day("2026-11-06"), undefined);
});
await step("settings: model choice is used; Scan notebook can be turned off", async () => {
  await page.locator('[data-act="dr-view"][data-v="manage"]').click();
  await page.getByRole("button", { name: "Scanning" }).click();
  await page.getByText("there is no API key to store").waitFor();
  await page.locator('[data-scanset="scan_model"]').selectOption("complex");
  await page.waitForFunction(() => ROU.settings.scan_model === "complex");
  await page.locator('[data-scanset="scan_enabled"]').uncheck();
  await page.waitForFunction(() => ROU.settings.scan_enabled === false);
  assert.equal(await page.locator('[data-act="scan-open-capture"]').count(), 0);
  await page.locator('[data-scanset="scan_enabled"]').check();
  await page.locator('[data-act="dr-view"][data-v="day"]').click();
  await page.locator('.scan-row').first().getByRole("button", { name: "Re-read" }).click();
  await page.getByRole("heading", { name: "Check before saving" }).waitFor({ timeout: 30000 });
  assert.equal(await page.evaluate(() => window.__lastOpts.tier), "complex");
  await page.getByRole("button", { name: "‹ Back" }).click();
});
await step("scans and values survive a reload; printable sheet includes the scanned pages", async () => {
  await page.reload();
  await page.locator(".scan-row").first().waitFor();
  assert.equal(await page.locator(".scan-row").count(), 2);
  assert.equal(await progress(), "42 of 64 done");
  const n = (await page.evaluate(() => window.__log)).filter((x) => x[0] === "save").length;
  await page.evaluate(async () => { const b = await scanPageBlobs([...DR.scans.keys()][0]).catch(() => []); window.__appendixPages = b.length; });
  await page.getByRole("button", { name: "Printable daily sheet (PDF)" }).click();
  await page.waitForFunction((k) => window.__log.filter((x) => x[0] === "save").length > k, n, { timeout: 30000 });
  assert.match((await page.evaluate(() => window.__log)).filter((x) => x[0] === "save").at(-1)[3], /^%PDF/);
});
await step("Staff can scan; no regressions in other tabs", async () => {
  const p2 = await ctx.newPage();
  await p2.goto(URL_ + "?role=staff&persist=1#routine");
  await p2.locator('section.card [data-act="scan-open-capture"]').waitFor();
  await p2.close();
  for (const t of ["Pharmacy", "Inventory", "Accounts", "Home", "Routine"]) { await page.getByRole("link", { name: new RegExp(t + "$") }).click(); await page.waitForTimeout(150); }
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
});
console.log(errs.length ? "Page errors:\n  " + errs.join("\n  ") : "No page errors");
console.log(`${pass}/${pass + fail} passed`);
await browser.close();
