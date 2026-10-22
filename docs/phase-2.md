# Phase 2: Phone entry app

A web page served by the workbook's Apps Script, saved to the phone home
screen (the client uses a Samsung Android phone: Chrome > ⋮ > Add to Home screen). It writes straight into the workbook.

## What is built

| Screen | Writes to | Notes |
|---|---|---|
| **New client** | Clients (+ Policies) | Optional policy section (carrier, product, face, premium, mode, application date, status). "From lead" links the lead: sets its Client ID, ticks Contacted and, with a policy, Application written; pre-fills name and phone. |
| **New lead** | Leads | Cost filled from Settings as in Phase 1. |
| **Hours** (home screen) | Hours | Clock in (optional activity), start/end break, clock out. Clocking out during a break ends the break. Hours worked = clock out − clock in − breaks. |
| **Mileage** (home screen) | Mileage | Start trip (odometer + purpose), end trip (odometer). "Add a past trip" enters both readings at once. Miles, IRS rate on the trip date and deduction are formulas. |
| **Add expense** | Expenses | Category, amount, vendor, paid with, notes, optional receipt photo or PDF. Photos are shrunk to ~1600 px JPEG on the phone, then saved to a Drive folder **Receipts - <workbook name>**; the Receipt column holds the link. |

New tabs: **Hours**, **Mileage**, **Expenses** (IDs HR-, MI-, EX-), built by
**Set up workbook** like the others and also usable by typing straight into the sheet.

Checks on every save (same rules in the app and on the server, `src/lib/forms.ts`):
required fields, phone (10 digits, stored as `(405) 555-0123`), email, real dates,
no future dates where that makes no sense, amounts ≥ 0, dropdown values must be on the
list, referred-by/lead must exist, end odometer ≥ start. Text that looks like a Social
Security number (`123-45-6789`, or "SSN 123456789") is refused.

## Access and permissions

- Deployed with access **Only myself**: only the Google account that owns the workbook
  can open it. The assistant gets access in Phase 7.
- Permissions: Sheets, the spreadsheet menu, and **Drive `drive.file`**: the script can
  only see files it created (the receipts), not the rest of Drive.
- Phone app link: **Agent Tracker > Phone app link** in the sheet, or `npm run deploy:app`.
  Redeploying keeps the same URL.

## Status

**Done 2026-10-22.** `npm run test:remote`: Phase 1 19/19 (184 s), Phase 2 16/16
(149 s); 43 unit tests. Screens checked at iPhone width with `npm run preview:app`.

Each suite now runs as its own `clasp run` so it gets its own 6-minute budget. Setup
takes ~75 s; most of that is sheet protections (3-8 s per tab).

A save from the phone takes about 5-7 s on the server (save plus refreshed screen),
with a self-test that fails above 8 s.

## Waiting on the client

- Privacy approval (open item 9) now also covers receipt photos stored in Google Drive.
- Payment methods and hours activity tags: using the proposed lists until confirmed.
- Gas vs mileage deduction (open item 7): both are recorded; Phase 3 reports decide.
