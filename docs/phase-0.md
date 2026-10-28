# Phase 0: Setup

Goal: decisions confirmed, accounts ready, code pipeline working, so Phase 1
(core workbook) can start without blockers.

## Developer

- [x] Repo scaffold: TypeScript, esbuild bundle, Vitest, Prettier, clasp
- [x] Build adds top-level stubs so menus and triggers can call bundled functions
- [x] Client decisions captured as config in `src/config/lists.ts` (with tests)
- [x] Enable Apps Script API, `clasp login`, `clasp create` the DEV workbook (see README)
- [x] GCP project + OAuth client linked; `npm run test:remote` runs the in-Sheets tests
- [x] Confirmation message sent to the client

## Client

- [x] Reply to the confirmation message (open items below)
- [x] Google account that will own the workbook: rcarrizosa.csb@gmail.com (2-step verification: in the setup guide)
- [ ] Ask the agency/IMO and Devoted what client data may be stored in Google and sent to an AI service
- [ ] Start using the notes template on new contacts
- [x] Send 5-10 screenshots of fake test contacts: 6 received 2026-10-22 (3 contacts), see screenshot-samples.md; correct values still needed
- [x] Send commission rates: received 2026-10-28 and 2026-10-29 (Phase 5 built); Combined and the Medicare contract still to come

## Open items (blocking noted)

| #   | Item                                                                                                                     | Blocks  |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ------- |
| 1   | ~~Google Sheets accepted?~~ Decided 2026-10-21: Google Sheets                                                            | —       |
| 2   | ~~Policy Status list incl. Declined / Not taken~~ Confirmed 2026-10-22                                                   | —       |
| 3   | ~~Product types~~ Life list OK (2026-10-22); Medicare: Part A, B, D, MAPD, MAO, C-SNP, D-SNP (2026-10-28)                | —       |
| 4   | ~~"15k for 120": is $120 monthly?~~ Yes, monthly (2026-10-22)                                                            | —       |
| 5   | ~~Persistency start~~ First draft date (2026-10-22), else effective, else issue date                                     | —       |
| 6   | ~~Mail-in lead cost~~ $40 (2026-10-29)                                                                                   | —       |
| 7   | ~~Gas vs mileage~~ Client enters mileage on their 1040: standard mileage method; gas for records only                    | —       |
| 8   | 2026 IRS rate 76¢ from July 1: verify on IRS.gov (72.5¢ confirmed for Jan 1)                                             | Phase 3 |
| 9   | ~~Privacy~~ Client: "That should be no problem" (2026-10-22) for storage in their Google account, receipts and Drive OCR | —       |
| 10  | ~~Assistant's role~~ Visibility as proposed (2026-10-22): assistant workbook built                                       | —       |
| 11  | ~~Payment methods; hours tags~~ Payments OK; hours: Dialing, Field, Admin, Other                                         | —       |
