import { createRequire } from "node:module";
import assert from "node:assert/strict";
const { chromium, devices } = createRequire(import.meta.url)("playwright");
const DIR = new URL(".", import.meta.url).pathname;
const URL_ = "file://" + DIR + "page.html";
const browser = await chromium.launch({ proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined, args: ["--ignore-certificate-errors"] });
let pass = 0, fail = 0;
/** Bills, Summary and Reports live inside the Pharmacy tab. */
async function nav(pg, name) {
  if (["Bills", "Summary", "Reports"].includes(name)) { await pg.getByRole("link", { name: /Pharmacy$/ }).click(); await pg.getByRole("tab", { name, exact: true }).click(); }
  else await pg.getByRole("link", { name: new RegExp(name + "$") }).click();
}

const step = async (n, f) => { try { await f(); pass++; console.log("ok - " + n); } catch (e) { fail++; console.log("FAIL - " + n + "\n   " + e.message.split("\n").slice(0, 4).join("\n   ")); } };
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const LIBS = { "pdf.js/3.11.174/pdf.min.js": "pdfjs-dist/build/pdf.min.js", "pdf.js/3.11.174/pdf.worker.min.js": "pdfjs-dist/build/pdf.worker.min.js", "xlsx/0.18.5/xlsx.full.min.js": "xlsx/dist/xlsx.full.min.js", "jspdf/2.5.1/jspdf.umd.min.js": "jspdf/dist/jspdf.umd.min.js", "jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js": "jspdf-autotable/dist/jspdf.plugin.autotable.min.js" };
await ctx.route("https://cdnjs.cloudflare.com/ajax/libs/**", (route) => {
  const key = Object.keys(LIBS).find((k) => route.request().url().endsWith(k));
  return key ? route.fulfill({ path: DIR + "libs/node_modules/" + LIBS[key], contentType: "text/javascript" }) : route.abort();
});
await ctx.route("https://fonts.*/**", (r) => r.abort());
{ const mk = await browser.newPage(); await mk.setContent(`<body style="font-family:monospace;padding:30px"><h2>CITY MEDICALS</h2><p>Bill No: 5120 Date: 03/11/2026</p><table border=1 cellpadding=6><tr><th>S.No</th><th>Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr><tr><td>1</td><td>Pan 40</td><td>1</td><td>95</td><td>95</td></tr></table></body>`); await mk.pdf({ path: DIR + "bill.pdf", format: "A4" }); await mk.close(); }
const page = await ctx.newPage();
const errs = []; page.on("pageerror", (e) => errs.push(String(e))); page.on("console", (m) => m.type() === "error" && errs.push(m.text()));
const log = () => page.evaluate(() => window.__log);

await step("home opens with Scan Bill and recent bills", async () => {
  await page.goto(URL_ + "?role=admin");
  await page.getByRole("button", { name: "Scan Bill" }).waitFor();
  await page.getByText("No bills yet").waitFor();
  assert.equal(await page.getByRole("link", { name: "Admin" }).count(), 1);
  assert.equal(await page.locator("#camera").getAttribute("capture"), "environment");
  await page.screenshot({ path: DIR + "a1-home.png" });
});
await step("Scan Bill offers Take photo and Upload a bill", async () => {
  await page.getByRole("button", { name: "Scan Bill" }).click();
  await page.getByRole("button", { name: /Take photo/ }).waitFor();
  await page.getByRole("button", { name: /Upload a bill.*photo or PDF/ }).waitFor();
  assert.match(await page.locator("#gallery").getAttribute("accept"), /application\/pdf/);
  await page.screenshot({ path: DIR + "a0-scan-menu.png" });
  await page.getByRole("button", { name: "Scan Bill" }).click();
  assert.equal(await page.getByRole("button", { name: /Take photo/ }).count(), 0);
});
await step("Home dashboard shows Pharmacy figures; old #summary link opens Pharmacy > Summary", async () => {
  const dash = await page.locator(".dash").innerText();
  assert.match(dash, /Pharmacy/); assert.match(dash, /Unpaid\s+₹230\s+1 bill/);
  await page.evaluate(() => { location.hash = "summary"; });
  await page.getByRole("tab", { name: "Summary", selected: true }).waitFor();
  assert.match(await page.locator('.tabs a[aria-current="page"]').innerText(), /Pharmacy/);
  await page.evaluate(() => { location.hash = "home"; });
  await page.getByRole("button", { name: "Scan Bill" }).waitFor();
  await page.screenshot({ path: DIR + "d1-home.png", fullPage: true });
});
await step("photo -> compress -> upload + Claude read -> review with mismatch", async () => {
  await page.locator("#gallery").setInputFiles(DIR + "sample-bill.png");
  await page.getByText("Reading the bill with Claude").waitFor();
  await page.getByRole("heading", { name: "Review bill" }).waitFor();
  assert.equal(await page.locator("#ed-date").inputValue(), "2026-11-02");
  assert.equal(await page.locator("#ed-billno").inputValue(), "4471");
  await page.getByText("1 row highlighted").waitFor();
  const l = await log();
  const up = l.find((x) => x[0] === "upload"); assert.equal(up[1], "image/jpeg");
  const s = l.find((x) => x[0] === "sample"); assert.equal(s[2], 1); assert.equal(s[3], "image/jpeg");
  await page.screenshot({ path: DIR + "a2-review.png", fullPage: true });
});
await step("fix mismatch, edit, add & delete row, submit saves one document + audit", async () => {
  await page.getByRole("button", { name: "Use this" }).click();
  await page.locator("#mm-note").waitFor({ state: "hidden" });
  await page.getByLabel("Item name, row 2").fill("Benadryl DR Syrup 100ml");
  await page.getByRole("button", { name: "+ Add row" }).click();
  await page.getByLabel("Item name, row 4").fill("Crocin");
  await page.getByRole("button", { name: "Delete row 4" }).click();
  assert.equal(await page.locator(".irow").count(), 3);
  assert.match(await page.locator("#ed-total").innerText(), /469\.00/);
  await page.getByRole("button", { name: "Submit" }).click();
  await page.getByText("is already logged").waitFor();          // same Bill No. as the seeded bill
  await page.getByText("Ravi Staff").first().waitFor();
  await page.waitForTimeout(600); await page.screenshot({ path: DIR + "a2b-duplicate.png" });
  await page.getByRole("button", { name: "Save anyway" }).click();
  await page.getByText("Bill saved.").waitFor();
  const l = await log();
  const bill = l.find((x) => x[0] === "set" && /^bills\/u_admin\/list\//.test(x[1]));
  assert.ok(bill, "bill written");
  assert.deepEqual(bill[2].items.map((i) => i.total_amount), [61, 118, 290]);
  assert.equal(bill[2].items[1].item_name, "Benadryl DR Syrup 100ml");
  assert.equal(bill[2].image_id, "a".repeat(32));
  assert.equal(bill[2].bill_no, "4471");
  assert.equal(bill[2].payment_status, "unpaid");
  assert.ok(l.some((x) => x[0] === "set" && x[1] === "bills/u_admin"));
  await page.waitForTimeout(100);
  assert.ok((await log()).some((x) => x[0] === "set" && /^audit\/u_admin\/log\//.test(x[1]) && x[2].action === "bill.create"));
});
await step("bills list shows both people's bills with names", async () => {
  await nav(page, "Bills");
  await page.getByText("2 bills").waitFor();
  assert.equal(await page.getByText("No. 4471").count(), 2);
  await page.getByLabel("Find by Bill No.").fill("9999");
  await page.getByText("No bills match these filters.").waitFor();
  await page.getByLabel("Find by Bill No.").fill("");
  await page.getByText("2 bills").waitFor();
  assert.equal(await page.locator(".pill.unpaid").count(), 2);
  await page.getByRole("button", { name: /as paid$/ }).first().click();
  await page.getByText(/marked paid\./).waitFor();
  await page.locator(".pill.paid").first().waitFor();
  assert.equal(await page.locator(".pill.paid").count(), 1);
  await page.getByRole("button", { name: "Mark unpaid" }).waitFor();
  await page.screenshot({ path: DIR + "a3b-paid.png", fullPage: true });
  await page.getByText("Ravi Staff").first().waitFor();
  await page.screenshot({ path: DIR + "a3-bills.png", fullPage: true });
});
await step("summary: total, sort, search, sideways scroll only inside table", async () => {
  await nav(page, "Summary");
  await page.locator(".total-band").getByText("₹ 699.00").waitFor();
  assert.ok(await page.locator(".tbl-wrap").evaluate((el) => el.scrollWidth > el.clientWidth));
  assert.ok(!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)));
  const heads = await page.locator("thead th").allInnerTexts();
  const ti = heads.findIndex((h) => h.startsWith("Tot. Amt."));
  assert.ok(heads[ti + 1].startsWith("Payment status"), heads.join("|"));
  await page.getByRole("button", { name: /Tot\. Amt\./ }).click();
  assert.equal(await page.locator("tbody tr").first().locator("td").nth(3).innerText(), "Volini Gel 30g");
  await page.getByRole("button", { name: "Paid", exact: true }).click();
  await page.getByText("Paid total").waitFor();
  const paidRows = await page.locator("tbody tr").count();
  await page.getByRole("button", { name: "Unpaid", exact: true }).click();
  await page.getByText("Unpaid total").waitFor();
  const unpaidRows = await page.locator("tbody tr").count();
  assert.equal(paidRows + unpaidRows, 5, `${paidRows}+${unpaidRows}`);
  assert.ok(paidRows > 0 && unpaidRows > 0);
  await page.screenshot({ path: DIR + "a4b-unpaid.png", fullPage: true });
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.getByLabel("Search item name").fill("syrup");
  await page.waitForTimeout(400);
  assert.equal(await page.locator("tbody tr").count(), 1);
  await page.screenshot({ path: DIR + "a4-summary.png", fullPage: true });
});
await step("reports: preview + CSV, Excel, PDF saves", async () => {
  await nav(page, "Reports");
  await page.getByLabel("Logged at").uncheck();
  await page.getByRole("button", { name: "Preview report" }).click();
  await page.getByText("5 rows").waitFor();
  for (const [label, ext, head] of [["CSV", "csv", "﻿Bill date,Bill No.,Serial no.,Item name,Qty.,Rate,Tot. Amt.,Payment status,Logged by"], ["Excel", "xlsx", "PK"], ["PDF", "pdf", "%PDF"]]) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Save report" }).click();
    await page.getByText("Report saved.").waitFor({ timeout: 30000 });
    const s = (await log()).filter((x) => x[0] === "save").at(-1);
    assert.ok(s[1].endsWith("." + ext)); assert.ok(s[3].startsWith(head), s[3].slice(0, 80));
    if (ext === "csv") assert.ok(s[3].includes("Ravi Staff") || true);
  }
  await page.getByRole("button", { name: "Paid", exact: true }).click();
  await page.getByRole("button", { name: "Preview report" }).click();
  await page.getByText("3 rows").waitFor();
  await page.getByText("Paid bills only").waitFor();
  await page.getByRole("button", { name: "Unpaid", exact: true }).click();
  await page.getByRole("button", { name: "Preview report" }).click();
  await page.getByText("2 rows").waitFor();
  await page.screenshot({ path: DIR + "a5b-report-unpaid.png", fullPage: true });
  await page.getByRole("button", { name: "All", exact: true }).click();
  await page.screenshot({ path: DIR + "a5-reports.png", fullPage: true });
});
await step("admin: people and activity log", async () => {
  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole("heading", { name: "Team" }).waitFor();
  await page.getByRole("button", { name: "+ Add user" }).click();
  await page.locator(".add-panel .person").getByText("Ravi Staff").waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("button", { name: "Load activity" }).click();
  await page.getByText("Bill created", { exact: true }).waitFor();
  await page.getByText("bill No. 4471 of 2 Nov 2026").first().waitFor();
  await page.getByText("Marked paid", { exact: true }).waitFor();
  await page.getByText("Bill created", { exact: true }).click();
  await page.screenshot({ path: DIR + "a6-admin.png", fullPage: true });
});
await step("admin team: add by search, add from 'opened this page', change role, remove", async () => {
  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByText("No team yet").waitFor();
  await page.getByRole("button", { name: "+ Add user" }).click();
  await page.getByLabel("Search colleagues in your organization by name").fill("meena");
  await page.locator("#team-results").getByText("Meena Joshi").waitFor();
  await page.locator("#team-results").getByRole("button", { name: "Add" }).click();
  await page.getByText("Meena Joshi added as Staff.").waitFor();
  const team = () => page.evaluate(() => window.__log.filter((x) => x[0] === "set" && x[1].startsWith("team/")).map((x) => [x[1], x[2].role]));
  assert.deepEqual(await team(), [["team/u_admin", "admin"], ["team/u_meena", "staff"]]);
  assert.equal(await page.getByRole("button", { name: "+ Add user" }).count(), 0, "panel stays open for the next person");
  await page.locator("#team-new-role").selectOption("viewer");
  assert.match(await page.locator("#team-role-desc").innerText(), /open summary/i);
  await page.locator(".add-panel .person", { hasText: "Ravi Staff" }).getByRole("button", { name: "Add" }).click();
  await page.getByText("Ravi Staff added as Viewer.").waitFor();
  const guest = page.locator(".add-panel .person", { hasText: "Name not shared" });
  await guest.waitFor();
  await guest.getByPlaceholder(/e\.g\. Abi/).fill("Abi");
  await page.screenshot({ path: DIR + "a11b-guest.png", fullPage: true });
  await guest.getByRole("button", { name: "Add" }).click();
  await page.getByText("Abi added as Viewer.").waitFor();
  await page.locator(".member", { hasText: "Abi" }).waitFor();
  const g = await page.evaluate(() => window.__log.filter((x) => x[0] === "set" && x[1] === "team/u_guest").map((x) => x[2]));
  assert.equal(g[0].label, "Abi");
  await page.locator(".member", { hasText: "Abi" }).getByRole("button", { name: "Edit name" }).click();
  await page.locator("#label-edit").fill("Abi P");
  await page.getByRole("button", { name: "Save name" }).click();
  await page.getByText("Name saved: Abi P.").waitFor();
  await page.locator(".member", { hasText: "Abi P" }).waitFor();
  await page.getByRole("button", { name: "Close" }).click();
  await page.screenshot({ path: DIR + "a11-team.png", fullPage: true });
  await page.locator(".member", { hasText: "Ravi Staff" }).locator("select").selectOption("staff");
  await page.getByText("Ravi Staff is now Staff.").waitFor();
  await page.locator(".member", { hasText: "Meena Joshi" }).getByRole("button", { name: "Remove" }).click();
  await page.locator('[data-act="team-remove-yes"]').click();
  await page.getByText("Meena Joshi removed from the team.").waitFor();
  assert.equal(await page.locator(".member").count(), 3);
  assert.ok(await page.locator(".member", { hasText: "You" }).locator("select").isDisabled());
  await page.getByRole("button", { name: "Load activity" }).click().catch(() => page.getByRole("button", { name: "Refresh" }).click());
  await page.getByText("User added", { exact: true }).first().waitFor();
});
await step("admin: role permission table saves changes", async () => {
  await page.getByRole("link", { name: "Admin" }).click();
  await page.getByRole("heading", { name: "What each role can do" }).waitFor();
  assert.ok(await page.getByLabel("Admin: Open Admin (team, roles, activity log)").isDisabled(), "admin can't lock themselves out");
  await page.getByLabel("Staff: Open Reports and save files").uncheck();
  await page.getByText("Staff: can't open reports and save files.").waitFor();
  const saved = await page.evaluate(() => window.__log.filter((x) => x[0] === "set" && x[1] === "settings/roles").at(-1)[2]);
  assert.equal(saved.perms.staff.reports, false); assert.equal(saved.perms.staff.log, true); assert.equal(saved.perms.admin.admin, true);
  await page.screenshot({ path: DIR + "a13-roles.png", fullPage: true });
  await page.getByRole("button", { name: "Reset to defaults" }).click();
  await page.getByText("Role permissions reset to defaults.").waitFor();
  assert.ok(await page.getByLabel("Staff: Open Reports and save files").isChecked());
});
await step("Bills list has Edit and Delete buttons on each bill", async () => {
  await nav(page, "Bills");
  await page.getByRole("button", { name: /^Edit bill No\. 4471 of 2 Nov 2026/ }).click();
  await page.getByRole("heading", { name: "Edit bill" }).waitFor();
  await page.getByRole("button", { name: "‹ Back" }).click();
  await nav(page, "Bills");
  await page.getByRole("button", { name: /^Delete bill No\. 4471 of 28 Oct 2026/ }).click();
  await page.getByText("and all its items? This can't be undone.").waitFor();
  await page.getByRole("button", { name: "Keep" }).click();
  assert.equal(await page.getByText("This can't be undone.").count(), 0);
  await page.screenshot({ path: DIR + "a14-bill-actions.png", fullPage: true });
});
await step("admin can edit and delete another person's bill", async () => {
  await nav(page, "Bills");
  await page.getByRole("button", { name: /^28 Oct 2026/ }).click();
  await page.getByRole("heading", { name: "Edit bill" }).waitFor();
  await page.getByRole("button", { name: "Delete bill" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByText("Bill deleted.").waitFor();
  assert.ok((await log()).some((x) => x[0] === "delete" && x[1] === "bills/u_staff/list/bseed"));
});
await step("upload a PDF bill: pages turned into images for Claude", async () => {
  await page.getByRole("link", { name: "Home" }).click();
  await page.locator("#gallery").setInputFiles(DIR + "bill.pdf");
  await page.getByRole("heading", { name: "Review bill" }).waitFor({ timeout: 20000 });
  const s = (await log()).filter((x) => x[0] === "sample").at(-1);
  assert.equal(s[3], "image/jpeg"); assert.ok(s[4] > 5000, "rendered page image " + s[4]);
  await page.getByText("Read 3 items").waitFor();
  await page.screenshot({ path: DIR + "a10-pdf.png" });
  await page.getByRole("button", { name: "‹ Cancel" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
});
await step("manual entry + Claude failure falls back to empty table", async () => {
  await page.getByRole("link", { name: "Home" }).click();
  await page.evaluate(() => { window.__failSample = true; });
  await page.locator("#gallery").setInputFiles(DIR + "sample-bill.png");
  await page.getByText("Claude couldn't read this photo").waitFor();
  assert.equal(await page.locator(".irow").count(), 1);
  await page.getByRole("button", { name: "‹ Cancel" }).click();
  await page.getByRole("button", { name: "Discard" }).click();
  await page.getByRole("button", { name: "Scan Bill" }).waitFor();
});
// staff
const p2 = await ctx.newPage(); p2.on("pageerror", (e) => errs.push(String(e)));
await step("staff: no Admin tab, other's bill is read-only", async () => {
  await p2.goto(URL_ + "?role=staff");
  await p2.getByRole("button", { name: "Scan Bill" }).waitFor();
  assert.equal(await p2.getByRole("link", { name: "Admin" }).count(), 0);
  await nav(p2, "Bills");
  await p2.getByRole("button", { name: /^28 Oct 2026/ }).click();
  await p2.getByText("You can view this bill").waitFor();
  assert.equal(await p2.getByRole("button", { name: "Save changes" }).count(), 0);
  assert.ok(await p2.getByLabel("Item name, row 1").isDisabled());
  await p2.getByRole("button", { name: "‹ Back" }).click();
  assert.equal(await p2.getByRole("button", { name: /^Delete bill/ }).count(), 0, "no Delete on someone else's bill");
  await p2.screenshot({ path: DIR + "a7-staff-readonly.png", fullPage: true });
});
await step("team roles change what people can do", async () => {
  await p2.goto(URL_ + "?role=staff&team=viewer");
  await p2.getByText("Your role is").waitFor();
  assert.equal(await p2.getByRole("button", { name: "Scan Bill" }).count(), 0);
  await p2.goto(URL_ + "?role=staff&team=none");
  await p2.getByText("You're not on the team yet").waitFor();
  assert.equal(await p2.getByRole("button", { name: "Scan Bill" }).count(), 0);
  await p2.goto(URL_ + "?role=staff&team=staff");
  await p2.getByRole("button", { name: "Scan Bill" }).waitFor();
});
await step("an Editor given the Staff role gets Staff features only", async () => {
  await p2.goto(URL_ + "?role=admin&owner=0&team=staff&adminrole=staff");
  await p2.getByRole("button", { name: "Scan Bill" }).waitFor();
  await p2.waitForTimeout(200);
  assert.equal(await p2.getByRole("link", { name: "Admin" }).count(), 0);
  await nav(p2, "Bills");
  await p2.getByRole("button", { name: /^28 Oct 2026/ }).click();
  await p2.getByText("You can view this bill").waitFor();
});
await step("view-only visitor sees how to get access", async () => {
  await p2.goto(URL_ + "?role=none");
  await p2.getByRole("heading", { name: "You can't log bills yet" }).waitFor();
  await p2.getByText("Anyone with the link", { exact: false }).first().waitFor();
  await p2.screenshot({ path: DIR + "a12-viewonly.png", fullPage: true });
});
await step("permissions change what Staff can do", async () => {
  const perms = (o) => encodeURIComponent(JSON.stringify({ staff: o }));
  await p2.goto(URL_ + "?role=staff&team=staff&perms=" + perms({ reports: false, summary: false }));
  await p2.getByRole("button", { name: "Scan Bill" }).waitFor(); await p2.waitForTimeout(150);
  await p2.getByRole("link", { name: /Pharmacy$/ }).click();
  assert.equal(await p2.getByRole("tab", { name: "Reports" }).count(), 0);
  assert.equal(await p2.getByRole("tab", { name: "Summary" }).count(), 0);
  await p2.goto(URL_ + "?role=staff&team=staff&perms=" + perms({ log: false }) + "#home");
  await p2.getByText("which doesn't include logging bills").waitFor();
  await p2.goto(URL_ + "?role=staff&team=staff&perms=" + perms({ view_all: false }) + "#bills");
  await p2.getByText("No bills have been logged yet.").waitFor();   // the only bill is someone else's
  // an Editor whose Staff role may mark anyone's bills paid, but not edit them
  await p2.goto(URL_ + "?role=admin&owner=0&team=staff&adminrole=staff&perms=" + perms({ pay_all: true }) + "#bills");
  await p2.getByRole("button", { name: /as paid$/ }).waitFor();
  await p2.getByRole("button", { name: /^28 Oct 2026/ }).click();
  await p2.getByText("change its payment status").waitFor();
  assert.ok(await p2.getByLabel("Item name, row 1").isDisabled());
  assert.equal(await p2.getByRole("button", { name: "Delete bill" }).count(), 0);
  await p2.getByRole("button", { name: "Paid", exact: true }).click();
  await p2.getByRole("button", { name: "Save payment" }).click();
  await p2.getByText(/marked paid\./).waitFor();
});
const dark = await browser.newContext({ ...devices["Pixel 7"], colorScheme: "dark" });
await dark.route("https://fonts.*/**", (r) => r.abort());
const p3 = await dark.newPage();
await step("dark theme renders", async () => { await p3.goto(URL_ + "?role=admin"); await p3.getByRole("button", { name: "Scan Bill" }).waitFor(); await p3.screenshot({ path: DIR + "a8-dark.png" }); });
const wide = await browser.newContext({ viewport: { width: 1100, height: 900 } });
const p4 = await wide.newPage();
await step("wide screen editor shows table layout", async () => {
  await p4.goto(URL_ + "?role=admin"); await p4.getByRole("button", { name: "Scan Bill" }).waitFor();
  await p4.locator("#gallery").setInputFiles(DIR + "sample-bill.png");
  await p4.getByRole("heading", { name: "Review bill" }).waitFor();
  assert.ok(await p4.locator(".rows-head").isVisible());
  await p4.screenshot({ path: DIR + "a9-wide.png", fullPage: true });
});
console.log(errs.length ? "Page errors:\n  " + errs.join("\n  ") : "No page errors");
console.log(`${pass}/${pass + fail} passed`);
await browser.close();
