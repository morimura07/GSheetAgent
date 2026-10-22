# Phase 6: Reminders and the monthly Excel copy

## Reminders

Shown on the phone app's home screen (a **Reminders** card that loads just after the
screen opens), and in the sheet under **Agent Tracker > Reminders**. They are worked out
fresh each time from the rows, so nothing has to be ticked off: fix the row and the
reminder goes away.

| Reminder                        | When                                                                  | Gone when                            |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| **Payment**: Insufficient funds | every policy with that status (with its draft day)                    | the status changes                   |
| **To check**: first draft       | Pending policy whose first draft date is within 3 days, or has passed | status updated (e.g. Paid as issued) |
| **Lead** not contacted          | 2-30 days after it came in                                            | Contacted ticked                     |
| **Pending** application         | pending 21+ days with no first draft date                             | first draft date or status entered   |
| **Birthday**                    | within 7 days, with the age they turn                                 | the day passes                       |
| **Anniversary**                 | policy 1+ years old (persistency start), within 7 days                | the day passes                       |

Most urgent first. The rules and day counts are in `src/lib/reminders.ts`.

Nothing is emailed: an email would put client names in the inbox and needs another
Google permission. A daily or monthly summary email can be added if the client wants one.

## Monthly Excel copy

The first time the phone app opens in a new month, the script saves an **.xlsx copy of
the whole workbook** to the Drive folder **Excel copies - <workbook name>**. The home
screen shows a link to it. **Agent Tracker > Save an Excel copy now** makes one any time.

- **Contents:** values only, every tab, reports included, as they are on the day of the
  copy. It's a snapshot that opens in Excel anywhere.
  - Dates and times keep their Excel formats.
  - Headers are bold and frozen.
  - Text that starts with "=" stays text.
- **Speed:** about 4-7 s, done in the background after the home screen shows. Saves from
  the phone are not held up while it runs.
- **No new permissions:** the file is written by the script itself (`src/lib/xlsx.ts`),
  not by Google's converter, which would need web access and read access to all of Drive.
  It is saved with the same "files this app created" Drive permission as receipts.
- **Why no timer:** a timed trigger would also need a new permission and a re-approval.
  Opening the app counts as the trigger instead. If a month passes without the app being
  opened, the next opening makes the copy.

## Checks

- **Unit tests:**
  - every reminder rule (including leap-day birthdays);
  - the Excel parts (escaping, dates, times, booleans, sheet names, column letters,
    Excel day numbers).

  The writer's output was also opened with openpyxl (a Python Excel library): dates,
  times, bold frozen header and sheet names come through correctly.

- **`npm run test:remote` Phase 6:**
  - reminders from real rows, most urgent first;
  - the .xlsx is built, then unzipped in Apps Script, with every XML part parsed, one
    sheet per tab, and values and dates present;
  - the copy is saved to Drive as an Excel file (not converted);
  - housekeeping makes one copy per month only, and a new one the next month;
  - the test copies are trashed.
- `npm run preview:app`: the home screen shows the Reminders card and the Excel copy
  link.

## Status

**Done 2026-10-22.** `npm run test:remote`: Phase 1 19/19, Phase 2 16/16, Phase 3 9/9,
Phase 4 9/9, Phase 6 4/4; 64 unit tests. Phone app redeployed (same link).
