# Phase 0: Setup

Goal: decisions confirmed, accounts ready, code pipeline working, so Phase 1
(core workbook) can start without blockers.

## Developer

- [x] Repo scaffold: TypeScript, esbuild bundle, Vitest, Prettier, clasp
- [x] Build adds top-level stubs so menus and triggers can call bundled functions
- [x] Client decisions captured as config in `src/config/lists.ts` (with tests)
- [x] Confirmation message drafted: `docs/client-confirmation.md`
- [x] Enable Apps Script API, `clasp login`, `clasp create` the DEV workbook (see README)
- [x] GCP project + OAuth client linked; `npm run test:remote` runs the in-Sheets tests
- [ ] Send the confirmation message to the client

## Client

- [ ] Reply to the confirmation message (open items below)
- [ ] Create or choose the Google account that will own the workbook; turn on 2-step verification
- [ ] Ask the agency/IMO and Devoted what client data may be stored in Google and sent to an AI service
- [ ] Start using the notes template on new contacts
- [x] Send 5-10 screenshots of fake test contacts: 6 received 2026-10-22 (3 contacts), see screenshot-samples.md; correct values still needed
- [ ] Send commission rates when available (needed for Phase 5)

## Open items (blocking noted)

| # | Item | Blocks |
|---|---|---|
| 1 | ~~Google Sheets accepted?~~ Decided 2026-10-21: Google Sheets | — |
| 2 | Policy Status list incl. proposed Declined / Not taken | Phase 1 |
| 3 | Product types list | Phase 1 (can start with proposed list) |
| 4 | ~~"15k for 120": is $120 monthly?~~ Yes, monthly (2026-10-22) | — |
| 5 | Persistency counted from effective date or issue date | Phase 3 |
| 6 | Mail-in lead cost ($40?) | Phase 3 |
| 7 | Gas vs IRS mileage rate (cannot deduct both) | Phase 3 |
| 8 | 2026 IRS rate 76¢ from July 1: verify on IRS.gov (72.5¢ confirmed for Jan 1) | Phase 3 |
| 9 | Privacy: storage in Google (incl. receipt photos in Drive); screenshots are read with Drive OCR in the same account, no outside AI | Phases 2, 4, 7 |
| 10 | Assistant's role: entry only, or follow-ups too | Phase 7 |
| 11 | Payment methods for expenses; activity tag on hours wanted? | Phase 2 (defaults OK) |
