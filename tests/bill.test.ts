import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseNum, hasMismatch, normalizeExtraction, validateRows, toCsv, sumTotals, isISODate, todayISO, emptyRow,
} from "../src/lib/bill.ts";

test("parseNum handles typed input", () => {
  assert.equal(parseNum("1,250.50"), 1250.5);
  assert.equal(parseNum(" 12 "), 12);
  assert.equal(parseNum("₹85"), 85);
  assert.equal(parseNum("Rs. 40"), 40);
  assert.equal(parseNum(".5"), 0.5);
  assert.equal(parseNum("3."), 3);
  assert.equal(parseNum(""), null);
  assert.equal(parseNum("abc"), null);
  assert.equal(parseNum("1.2.3"), null);
  assert.equal(parseNum(7), 7);
  assert.equal(parseNum(null), null);
});

test("hasMismatch flags Qty × Rate ≠ Tot. Amt.", () => {
  assert.equal(hasMismatch(2, 15.5, 31), false);
  assert.equal(hasMismatch(3, 33.33, 99.99), false);
  assert.equal(hasMismatch(2, 10, 25), true);
  assert.equal(hasMismatch(null, 10, 25), false);
  assert.equal(hasMismatch(1, 1000, 1000.4), false); // 0.05% tolerance for big amounts
  assert.equal(hasMismatch(1, 1000, 1001), true);
});

test("normalizeExtraction cleans AI output", () => {
  const out = normalizeExtraction({
    bill_date: "2026-10-01",
    items: [
      { serial_no: "1", item_name: " Dolo 650 ", qty: "2", rate: "30.5", total_amount: 61 },
      { serial_no: null, item_name: "", qty: null, rate: null, total_amount: null },
      { item_name: "Syrup", qty: 1, rate: 85, total_amount: 85, bill_date: "not a date" },
      "garbage",
    ],
  });
  assert.equal(out.bill_date, "2026-10-01");
  assert.equal(out.rows.length, 2);
  assert.deepEqual(out.rows[0], { serial_no: 1, bill_date: "2026-10-01", item_name: "Dolo 650", qty: 2, rate: 30.5, total_amount: 61 });
  assert.equal(out.rows[1].bill_date, "2026-10-01");
  assert.deepEqual(normalizeExtraction(null), { bill_date: null, rows: [] });
  assert.equal(normalizeExtraction({ bill_date: "2026-02-30", items: [] }).bill_date, null);
});

test("validateRows reports problems and skips blank rows", () => {
  const ok = validateRows([
    { ...emptyRow(1), item_name: "A", qty: "2", rate: "5", total_amount: "10" },
    emptyRow(2),
  ]);
  assert.equal(ok.problems.length, 0);
  assert.deepEqual(ok.items, [{ serial_no: 1, item_name: "A", qty: 2, rate: 5, total_amount: 10 }]);

  const bad = validateRows([{ ...emptyRow(1), item_name: "", qty: "x" }]);
  assert.equal(bad.problems.length, 2);
  assert.equal(validateRows([emptyRow()]).problems[0].message, "Add at least one item.");
});

test("toCsv escapes values and blocks formula injection", () => {
  const csv = toCsv(["Item", "Amt"], [["Cough, syrup", 85], ['He said "hi"', -5], ["=HYPERLINK()", null]]);
  assert.ok(csv.startsWith("﻿Item,Amt\r\n"));
  assert.ok(csv.includes('"Cough, syrup",85'));
  assert.ok(csv.includes('"He said ""hi""",-5'));
  assert.ok(csv.includes("'=HYPERLINK(),"));
});

test("misc helpers", () => {
  assert.equal(sumTotals([10.1, 20.2, null, undefined]), 30.3);
  assert.equal(isISODate("2026-11-03"), true);
  assert.equal(isISODate("03/11/2026"), false);
  assert.equal(todayISO(new Date(2026, 0, 5)), "2026-01-05");
});
