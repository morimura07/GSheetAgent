# Phase 7: Assistant workbook and handover

## Assistant workbook

A sheet can only be shared whole, so the assistant gets **a separate spreadsheet** that
holds only what they may see. The agent makes it from **Agent Tracker > Assistant
workbook** and shares it themselves (Share > the assistant's email as Editor). To stop
access, they remove the assistant there.

| Tab       | What                                                                                                           | The assistant can change                    |
| --------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Read me   | what the workbook is, last update time                                                                         | nothing                                     |
| To do     | the reminders (payments, first drafts, leads, pending, birthdays, anniversaries)                               | nothing                                     |
| Leads     | ID, date, type, name, phone, contacted, appointment set, application written, assistant notes                  | Contacted, Appointment set, Assistant notes |
| Policies  | ID, client, client phone, carrier, policy #, status, status date, first draft date, draft day, assistant notes | Assistant notes                             |
| New leads | empty rows to type new leads in                                                                                | the entry cells                             |

- **Never in it:** the agent's notes, health details, Medicare plan and ID, beneficiaries,
  premiums, face amounts, lead costs and commissions. The columns are listed in
  `src/lib/assistant.ts`. A unit test pins the lists and rejects any column marked
  `sensitive`.
- **Protection:** each tab is protected for the owner only (not warning-only). Only the
  cells in the right-hand column of the table are open.
- **Assistant notes:** a new column on Leads and Policies in the tracker. It is kept
  apart from the agent's own Notes, which the assistant never sees.

### Sync

- **When it runs:**
  - each time the agent opens the phone app, before the reminders load;
  - when the agent chooses **Agent Tracker > Assistant workbook**.
- **Steps:**
  1. **The assistant's changes are copied to the tracker.** A change is an editable cell
     that differs from what the last sync wrote. Each row keeps a hidden, protected copy
     of what was sent. So a change the agent made in the tracker in the meantime is not
     undone by a stale value in the assistant's view.
  2. **New leads are checked with the phone app's lead rules, then added.** A row with a
     problem stays, with the reason in the Problem column. A blank date means today.
  3. **Every change and new lead is logged** on the tracker's **Assistant log** tab (when,
     what, ID, field, was, now).
  4. **All tabs are rewritten from the tracker.**
- **Shown to the agent:**
  - the phone app's Reminders card says "From your assistant: 2 changes, 1 new lead";
  - a failed sync shows there too, and never blocks the app.

**Limits:**

- Nothing syncs until the agent opens the phone app or the menu item. An hourly sync
  would need one more permission ("run when you're not there"); it can be added if
  wanted.
- An edit typed during the few seconds of a sync can be overwritten.
- The edit area covers 3,000 rows of leads and of policies.

## Handover: the client's own copy

The client never gives the developer access. Instead:

1. **`npm run template`** builds the release copy into `release/dist`:
   - no test screenshots and no DEV menu items;
   - no Execution API in the manifest.

   It then pushes that copy to a blank **TEMPLATE** spreadsheet in the developer's
   account (made on the first run; `release/.clasp.json`). It holds no data.

2. Share the template with the client's email as **Viewer** and send the printed `/copy`
   link.
3. The client follows `docs/client-setup-guide.md`:
   - make a copy, then run Set up workbook and allow;
   - deploy the phone link, then add it to the home screen.

   The copy, its script and all data are theirs.

4. **First setup in a copy** sets the workbook's time zone to the script's (America/Chicago).
5. **Later updates:**
   - `npm run template` updates the template only, never the client's copy;
   - for a fix, the client adds the developer as editor for the day, then removes them.

## Checks

- **Unit tests (`test/assistant.test.ts`):**
  - the exact column lists, and that no view column is marked sensitive;
  - no notes, Medicare or money columns;
  - view rows, edit detection (only editable cells; whitespace-only changes ignored);
  - rows without an ID or sent copy are skipped;
  - new-lead rows are picked up.
- **`npm run test:remote` Phase 7:**
  - **Create:**
    - the workbook is made in Drive with the five tabs;
    - the views are filled, newest first;
    - none of the planted private values (notes, Medicare ID, beneficiary, policy note,
      premium) appears in any cell, hidden ones included.
  - **Protection:** the exact editable columns, real protection (not a warning), and the
    sent copy hidden.
  - **Sync:**
    - the assistant ticks Contacted, writes notes on a lead and a policy, edits a
      read-only cell, and types one good and one bad new lead;
    - meanwhile the agent changes another lead;
    - after the sync: 3 changes and 1 lead added; the bad row stays with its reason;
    - the agent's change and notes are untouched, and the log has 4 rows.
  - **Second sync:** nothing new.
  - **Clean-up:** the workbook is trashed, and a trashed workbook counts as none.

## Status

**Built 2026-10-22.**

- **Tests:** `npm run test:remote` Phase 1 19/19, Phase 2 16/16, Phase 3 9/9, Phase 4 9/9,
  Phase 6 4/4, Phase 7 5/5; 71 unit tests.
- **DEV:** the workbook was set up again (new Assistant notes columns), and the phone app
  redeployed (same link).
- **Template:** made by `npm run template` in the developer's account. Spreadsheet
  `1jJ0o1_0xdwXYY5MMFi88TGNWjBMmylTHJgWdLJZI3yY`, settings in `release/.clasp.json`.
- **Not tested yet:** the copy → set up → deploy flow by hand. Do a dry run with the
  template in a second Google account before sending it.
- **Handover (no call):** share the template with rcarrizosa.csb@gmail.com as Viewer, then
  send `docs/Agent Tracker - Setup Guide.pdf` (made from
  [client-setup-guide.md](client-setup-guide.md)) with a short message.
