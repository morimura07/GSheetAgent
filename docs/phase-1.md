# Phase 1: Core workbook

## What is built

| Tab               | Purpose                                                                                         | Automatic                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Clients**       | One row per person                                                                              | Client ID, Created, Age (flags "Check year"), Birthday this month, Lead source (from Leads)                          |
| **Policies**      | One row per policy, linked by Client ID                                                         | Policy ID, Client name, Monthly premium (from payment mode), Status date (stamped when Status changes), Status group |
| **Beneficiaries** | One row per beneficiary, linked by Policy ID                                                    | Beneficiary ID, Client name, Policy total % (red unless 100%)                                                        |
| **Leads**         | One row per lead; Client ID once an application is written                                      | Lead ID, Cost (from Settings > Lead costs on the date received)                                                      |
| **Lists**         | Plain dropdown lists (product types, counties, …)                                               | —                                                                                                                    |
| **Settings**      | Carriers, policy statuses + group, payment modes, lead costs by date, IRS mileage rates by date | —                                                                                                                    |

- All layout lives in `src/config/schema.ts`; **Agent Tracker > Set up workbook** builds or repairs the sheet from it and is safe to re-run (data is never deleted; Lists/Settings are seeded only when empty).
- Dropdowns read from Lists/Settings, so adding a carrier or lead type there updates every dropdown.
- ID, formula and Created columns are protected (warning only) to prevent accidental edits.
- Not stored: SSN, banking details, driver's license.

## Status

**Done 2026-10-22.** `npm run test:remote`: 19/19 in-Sheets checks pass (170 s; setup itself
takes ~60 s, so watch the 6-minute Apps Script limit as tests grow). The steps below are
automated in `src/selftest/phase1.ts`; kept here as a description of what is checked.

## Test script (automated)

1. `npm run push`, reload the sheet, **Agent Tracker > Set up workbook**. Authorise when asked.
2. Check tab order: Clients, Policies, Beneficiaries, Leads, Lists, Settings. Sheet1 is gone.
3. **Agent Tracker > Load test data**. Then check:
   - Clients: CL-0001..0003; Test Bravo shows **Check year** in red; Test Alpha lead source = Yes lead.
   - Policies: client names filled; the Annual $540 policy shows **$45.00** monthly; Status date = today.
   - Beneficiaries: both rows show **100%**.
   - Leads: costs $10 / $23 / $0 / $40.
4. Type a new client name on an empty Clients row: ID and Created appear.
5. On a Policies row, change Status: Status date updates to today.
6. Type `XX-1` in Policies > Client ID: rejected. Type text in a date column: rejected.
7. Change Beneficiaries share on one row to 40%: Policy total turns red.
8. Run **Set up workbook** again: nothing is lost or duplicated.

## Waiting on the client

- Product types list (using the proposed list until then).
- "15k for 120": monthly? (Payment mode column already handles any period.)
- Declined / Not taken statuses OK?
