// Rebuilds the live state of 05/11/2026: the Daily Routine template never loaded (bad lock path), so a saved
// notebook scan of 04/11 created one-off tasks and skipped the vitals. Opening Routine must repair it.
import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const DIR = new URL(".", import.meta.url).pathname;
const URL_ = "file://" + DIR + "page.html";
const browser = await chromium.launch();
let pass = 0, fail = 0;
const step = async (n, f) => { try { await f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message.split("\n").slice(0, 8).join("\n   ")); } };
const ctx = await browser.newContext({ ...devices["Pixel 7"], timezoneId: "Asia/Kolkata" });
await ctx.clock.setFixedTime(new Date("2026-11-05T16:00:00+05:30"));
await ctx.route("https://fonts.*/**", (r) => r.abort());
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
const store = async () => new Map(await page.evaluate(() => JSON.parse(localStorage.getItem("mock-store") || "[]")));
const sec = (name) => page.locator(".dr-sec", { has: page.getByRole("heading", { name, exact: true }) });

const SC = "scmw3eslrccu91", now = "2026-11-05T10:36:53.018Z";
const once = (id, name, section) => [`routine/tasks/list/${id}`, { archived_from: null, asNeeded: false, created_at: now, date: "2026-11-04", days: [], details: "", doer: "", from: "2026-11-04", kind: "once", name, order: 10, paused_from: null, pauses: [], reminder: false, section, slots: [], src: SC, target: 0, times: [], type: "check", unit: "" }];
const occ = (task, o) => ({ at: now, by: "", deleted: false, done: true, end: "", item: "", note: "", sched: null, slot: null, src: SC, task, text: "", time: "", value: "", ...o });
const LIVE = [
  ["routine/settings", { seeded_at: "2026-11-05T04:48:39.557Z" }],
  once("tA", "Ward boy care", "Care & hygiene"), once("tB", "Floor cleaning", "Care & hygiene"), once("tC", "Nebulizer – Morning", "Nebulizer"),
  once("tD", "Breakfast", "Oral feed"), once("tE", "Lunch", "Oral feed"), once("tF", "Physiotherapy", "Physiotherapy & therapy"),
  once("tG", "Newspaper reading and rope challenging game", "Physiotherapy & therapy"), once("tH", "Evening physiotherapy", "Physiotherapy & therapy"),
  ["routine/staff/list/sx1", { name: "Mangai", role: "family", detail: "", archived: false }], ["routine/staff/list/sx2", { name: "Parvathavarthini", role: "family", detail: "", archived: false }],
  ["routine/days/list/2026-11-04", { date: "2026-11-04", created_at: now,
    occ: { o1: occ("tA", { by: "Francis", time: "04:30", end: "05:00", note: "Bed sheet change" }), o2: occ("tB", { by: "Vaitheshwari", time: "11:00" }), o3: occ("tB", { by: "Bhuvana", time: "20:20" }),
      o4: occ("tC", { by: "Yokeshwari", item: "Duolin + Mesna" }), o5: occ("tD", { item: "Pongal", time: "09:40" }), o6: occ("tE", { item: "Foam rice", time: "14:30" }),
      o7: occ("tF", { by: "Dr Hariharan", time: "11:15", end: "11:25" }), o8: occ("tG", {}), o9: occ("tH", { time: "16:15", end: "16:25" }) },
    feed: { f0600: { time: "06:00", item: "Rice kanji", by: "Yokeshwari", given_at: "06:00", done: true, deleted: false, src: SC } },
    meds: { morning: { list: ["Tab. B-Complex"], given: [true], by: "Mangai", time: "", done: true, deleted: false, src: SC } },
    notes: { room: "Restroom issue", improvement: "Writing practice" }, notes_src: { room: SC, improvement: SC } }],
  [`routine/scans/list/${SC}`, { date: "2026-11-04", status: "saved", saved_date: "2026-11-04", page_count: 2, pages: [], pdfs: [], source: "pdf", created_at: now, created_by: "u_admin",
    result: { date: "2026-11-04", pages: [], care: [{ task: "Ward boy care", by: "Francis", time: "04:30", end: "05:00", details: "Bed sheet change", raw: "", conf: "medium", page: 1 }],
      nebulizer: { morning: { items: "Duolin + Mesna", by: "Yokeshwari", conf: "high", page: 1 }, afternoon: null, night: null },
      rt_feed: [{ time: "06:00", item: "Rice kanji", by: "Yokeshwari", conf: "high", page: 1 }], medication: { morning: null, afternoon: null, night: null },
      vitals: { morning: { temp: "97", pulse: "82", spo2: "99", bp: "110/70", sugar: "", by: "Mangai", conf: "medium", page: 2 }, afternoon: { temp: "97", pulse: "90", spo2: "98", bp: "120/70", sugar: "", by: "Gayathri", conf: "medium", page: 2 }, night: null },
      oral_feed: [{ meal: "Breakfast", item: "Pongal", time: "09:40", conf: "high", page: 2 }], output: [], doctor_comments: [], physio: [{ task: "Physiotherapy", by: "Dr Hariharan", time: "11:15", end: "11:25", details: "", raw: "", conf: "high", page: 2 }],
      visitors: [], notes: { room: "Restroom issue", improvement: "Writing practice", other: "" }, unmatched: [] } }],
];
await page.goto(URL_ + "?role=none&persist=1");   // a signed-out page writes nothing, so it cannot race the setup
await page.evaluate((s) => { localStorage.clear(); localStorage.setItem("mock-store", JSON.stringify(s)); localStorage.setItem("mock-store-t", String(9e15)); }, LIVE);
await page.goto(URL_ + "?role=admin&persist=1#routine");

await step("opening Routine loads the template without touching the scanned 04/11 day", async () => {
  await page.waitForFunction(() => ROU.settings.daily_seeded_at && !DR.seeding && !DR.relinking && drHasTemplate(), null, { timeout: 60000 });
  const s = await store(); const tasks = [...s.entries()].filter(([k]) => k.startsWith("routine/tasks/list/"));
  assert.equal(tasks.filter(([, t]) => t.kind !== "once").length, 54);
  assert.ok([...s.keys()].some((k) => k.startsWith("routine/plans/list/pmeds")) && [...s.keys()].some((k) => k.startsWith("routine/plans/list/pfeed")));
  const day = s.get("routine/days/list/2026-11-04");
  assert.equal(Object.keys(day.occ).length, 9, "scanned day kept, sample day not written over it");
  assert.equal(day.feed.f0600.by, "Yokeshwari"); assert.equal(day.notes.room, "Restroom issue");
  const staff = [...s.entries()].filter(([k]) => k.startsWith("routine/staff/list/")).map(([, v]) => v);
  assert.equal(staff.filter((x) => x.name === "Mangai").length, 1, "no duplicate Mangai"); assert.equal(staff.find((x) => x.name === "Mangai").role, "nurse");
});
await step("one-off scan rows move onto the matching routine tasks", async () => {
  const s = await store(); const t = new Map([...s.entries()].filter(([k]) => k.startsWith("routine/tasks/list/")).map(([k, v]) => [k.split("/").at(-1), v]));
  const left = [...t.values()].filter((x) => x.kind === "once").map((x) => x.name);
  assert.deepEqual(left, ["Evening physiotherapy"], "only the row with no matching task stays a one-off");
  const day = s.get("routine/days/list/2026-11-04"); const name = (o) => t.get(o.task)?.name;
  assert.deepEqual([name(day.occ.o1), day.occ.o1.sched], ["Ward boy care", "04:30"]);
  assert.deepEqual([name(day.occ.o2), day.occ.o2.sched, day.occ.o3.sched], ["Floor cleaning", "11:00", "20:00"]);
  assert.equal(name(day.occ.o8), "Newspaper reading"); assert.equal(name(day.occ.o5), "Breakfast");
  await page.getByRole("button", { name: "Previous day" }).click();
  assert.match(await sec("Oral feed").innerText(), /Pongal · 9:40 AM/);
  assert.match(await sec("Oral feed").innerText(), /Dinner/);
});
await step("opening the scan again adds the vitals it skipped; everything else is already saved", async () => {
  await page.locator(".scan-row").getByRole("button", { name: "Open" }).click();
  await page.getByRole("heading", { name: "Check before saving" }).waitFor();
  const it = (title) => page.locator(".scan-item", { has: page.locator("b", { hasText: new RegExp("^" + title + "$") }) });
  assert.match(await it("Morning vitals").innerText(), /New/);
  assert.match(await it("Ward boy care").innerText(), /Already saved/);
  assert.match(await it("Breakfast").innerText(), /Already saved/);
  await page.getByRole("button", { name: "Save to 04/11/2026" }).click();
  await page.getByText("Saved the scan to 04/11/2026: 3 added, 6 already there.").waitFor();   // both vitals slots + the nebulizer gets its 6:00 AM time
  assert.match(await sec("Vitals").innerText(), /BP\s+110\/70\s+mmHg[\s\S]*BP\s+120\/70/);
});
console.log(errs.length ? "Page errors:\n  " + errs.join("\n  ") : "No page errors");
console.log(`${pass}/${pass + fail} passed`);
await browser.close();
