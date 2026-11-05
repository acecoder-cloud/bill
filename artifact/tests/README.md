# Browser tests for the claude.ai page

`mock-claude.js` stands in for the claude.ai features the page uses (storage, Claude, uploads, downloads, people),
so the page can be driven in Chromium outside claude.ai.

```bash
bash build.sh            # wraps ../bill-log.html with the stand-in into page.html
node test.mjs            # bills, summary, reports, team, roles (22 checks)
node inv-test.mjs        # inventory (16 checks)
node acc-test.mjs        # accounts (17 checks, including the WhatsApp-ledger totals)
node rou-test.mjs        # routine / visitors (15 checks, including the visitor-log totals and WhatsApp text)
node dr-test.mjs         # daily routine (17 checks: sample day 42 of 64, WhatsApp text, overdue, add task, updates; clock pinned to 05/11/2026 2:10 PM IST)
```

Needs Playwright with Chromium, `sample-bill.png` next to the scripts, and the report/PDF libraries
(`npm i --prefix libs xlsx@0.18.5 jspdf@2.5.1 jspdf-autotable@3.8.2 pdfjs-dist@3.11.174`), which the tests serve
in place of cdnjs.
