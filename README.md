# Agent Tracker (Google Sheets + Apps Script)

Tracker workbook for an independent insurance agent: clients and policies, leads,
mileage, expenses, hours, carrier persistency, monthly premium and commissions,
with a phone entry app and a contact-screenshot reader.

- Requirements: [Google Doc](https://docs.google.com/document/d/1QYdmrM9DVSbyW4LJ0lSkIT8WF49XnaJEioh3SjNy4e0/edit)
- Phase plan and status: [docs/phase-0.md](docs/phase-0.md), [docs/phase-1.md](docs/phase-1.md), [docs/phase-2.md](docs/phase-2.md), [docs/phase-3.md](docs/phase-3.md), [docs/phase-4.md](docs/phase-4.md), [docs/phase-6.md](docs/phase-6.md), [docs/phase-7.md](docs/phase-7.md)
- Client setup guide (handover): [docs/client-setup-guide.md](docs/client-setup-guide.md)

## Layout

| Path                   | What                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/index.ts`         | Apps Script entry points. Every export becomes a top-level function.                                                                                                                                                                     |
| `src/config/lists.ts`  | Default dropdowns and rates (carriers, statuses, lead costs, counties, IRS rates).                                                                                                                                                       |
| `src/config/schema.ts` | Workbook layout: tabs, columns, dropdowns, formulas, Settings tables.                                                                                                                                                                    |
| `src/sheets/`          | Code that talks to Sheets: setup, edit handling (IDs, cost, status date), records, receipts, test data.                                                                                                                                  |
| `src/app/`             | Phone app: form definitions, server actions, `client.ts` + `app.html` (bundled into `dist/App.html`).                                                                                                                                    |
| `src/selftest/`        | In-Sheets integration tests, one suite per phase.                                                                                                                                                                                        |
| `src/lib/`             | Pure logic, unit-tested with Vitest.                                                                                                                                                                                                     |
| `test/`                | Unit tests.                                                                                                                                                                                                                              |
| `build.mjs`            | Bundles `src/` into `dist/Code.js` with esbuild and adds the top-level stubs.                                                                                                                                                            |
| `appsscript.json`      | Apps Script manifest (copied to `dist/`).                                                                                                                                                                                                |
| `samples/`             | The client's made-up test screenshots. Git-ignored, never committed; when present, `npm run build` copies them into the DEV script (SampleImages.html) for the Phase 4 self-test. `npx clasp run ocrSamplesJson` returns their OCR text. |

## Commands

```sh
npm install
npm run check      # typecheck + tests + build
npm run push       # check, then clasp push dist/ to Apps Script
npm run test:remote # unit tests, then push + run the in-Sheets self-test via `clasp run`
npm run deploy:app # check, push, and publish the phone app (same URL every time)
npm run template   # release build pushed to the blank TEMPLATE spreadsheet the client copies
npm run preview:app # screenshot the phone screens with fake data into .preview/
npm run open       # open the Apps Script editor
```

`test:remote` runs each suite (`runSelfTestPhase1Json`, `runSelfTestPhase2Json`, `runSelfTestPhase3Json`, `runSelfTestPhase4Json`, `runSelfTestPhase6Json`, `runSelfTestPhase7Json`) as its own
`clasp run` against a separate SELF-TEST spreadsheet that is wiped on every run;
`node scripts/remote-test.mjs phase2` runs one suite. It needs the script linked to the GCP project and a login made with
`npx clasp login --creds .secrets/client_secret.json --use-project-scopes --include-clasp-scopes`.
While the OAuth consent screen is in Testing mode, that login expires after 7 days; re-run it.

## First-time Apps Script setup

1. Turn on the Apps Script API: <https://script.google.com/home/usersettings>
2. `npx clasp login` (opens a browser; credentials go to `~/.clasprc.json`, never this repo)
3. `npx clasp create --type sheets --title "Agent Tracker (DEV)" --rootDir dist`
   This creates a new spreadsheet with a bound script and writes `.clasp.json`.
4. `npm run push`, then open the spreadsheet and reload: an **Agent Tracker** menu appears.
5. Receipts use the advanced Drive service: the Drive API must be on in the script's GCP
   project (`npx clasp enable-api drive`; needs `projectId` in `.clasp.json`).
6. `npm run deploy:app` publishes the phone app (access: only the owner).

The DEV workbook holds fake data only. The client's production workbook is created
in the client's own Google account at handover.
