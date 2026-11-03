// JSON schema Claude must follow when reading a bill (structured outputs).
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] };

export const EXTRACT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["is_bill", "bill_date", "items"],
  properties: {
    is_bill: { type: "boolean", description: "false if the photo is not a bill/invoice/receipt" },
    bill_date: {
      anyOf: [{ type: "string", description: "Bill date as YYYY-MM-DD" }, { type: "null" }],
    },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["serial_no", "item_name", "qty", "rate", "total_amount"],
        properties: {
          serial_no: { anyOf: [{ type: "integer" }, { type: "null" }] },
          item_name: { type: "string" },
          qty: nullableNumber,
          rate: nullableNumber,
          total_amount: nullableNumber,
        },
      },
    },
  },
} as const;

export const EXTRACT_PROMPT = `You are reading a photo of a pharmacy bill (invoice / cash memo), usually from India.

Extract every purchased line item, top to bottom, exactly as printed:
- serial_no: the S.No./Sr. printed on the line (null if none).
- item_name: the product name as printed, including strength/pack (e.g. "Dolo 650 Tab 15's"). Do not include batch no., expiry, HSN or MRP in the name.
- qty: the quantity purchased (number; use the strips/units actually billed).
- rate: the per-unit rate charged (number, no currency symbols or commas).
- total_amount: the line amount / Tot. Amt. / Amount column for that line (number).
- bill_date: the date of the bill as YYYY-MM-DD. Indian bills write dates day-first (03/11/26 = 2026-11-03). null if no date is visible.

Rules:
- Copy numbers exactly as printed; do not "fix" totals so they match qty × rate.
- Use null for any value you cannot read with confidence instead of guessing.
- Skip subtotal, discount, GST/tax summary, round-off, and grand-total lines.
- If the image is not a bill, set is_bill to false and return no items.`;
