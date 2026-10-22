# Phase 4: Client from contact screenshots

The phone app's **Client from screenshots** tile turns screenshots of a phone contact
(Samsung Contacts, as the client takes them) into a filled-in **New client** form. Nothing
is saved until the agent checks the form and taps **Save client**.

## How it works

1. The agent picks the screenshots of one contact (1-6): the top of the contact and the
   notes, in any order. They are sent at full height (JPEG) so the small note text stays
   readable.
2. For each screenshot, the script uploads it to the agent's own Drive as a Google Doc,
   which makes Drive run its built-in text recognition. The script reads the text and
   **permanently deletes the Doc straight away**: it doesn't go to the trash or stay in
   Drive, and nothing is logged. The screenshots never leave the agent's Google account,
   and no AI service is involved.
3. The reader (`src/lib/contactReader.ts`) turns the text into form values:
   - **Contact card:** name, mobile, email, address (state name → code), birthday.
   - **Linked contacts** (Parent, Child, Spouse…): added as beneficiaries, as the client
     decided.
   - **Notes:**
     - `Met 10.10.26` goes to the client notes and is used as the application date.
     - `5'6 150` → height and weight.
     - Smoker / non-smoker.
     - `Has/Had 5k … AmAm` → existing coverage.
     - `Referred by …` → matched to an existing client by name, otherwise put in the
       notes.
     - `MID:` → Medicare ID; `Devoted advantage` → Medicare plan, and a Devoted policy.
   - **Policy:**
     - Carrier, by name or by the shorthand in Settings > Carriers.
     - Product: graded, level, GI, term, advantage….
     - `10k for 110` → $10,000 face, $110 **monthly** premium.
     - `Issued 11.25.26` → issue date.
     - `4th wed` → **Draft day**.
     - Policy number.
   - **Beneficiaries:**
     - Under `Ben:` as primary, under `Con.` as contingent.
     - Relationship from the initial (S. son, D. daughter, H. husband, Ne. nephew…).
     - Share % and phone.
4. The form opens pre-filled under **Check before saving**:
   - warnings (birthday without a year or not in the past, shares not adding up to 100%,
     phone numbers that aren't 10 digits, contacts that are linked rather than written
     in the notes);
   - how many private lines were left out;
   - a folded list of note lines that were **not saved**. These are health history and
     other personal notes, which the client wants kept in the contact only.
5. The usual form checks still apply on Save. An open lead with the same phone or name is
   pre-selected, so saving links it as before.

## Never stored

SSN, driver's license, card (number, expiry, CVV, name on card) and bank routing/account
lines are dropped before anything else happens, together with the lines that belong to
them. Long unrecognised digit runs (such as a card number cut off at the screen edge) are
dropped too. The same check, `findSensitive` in `src/lib/forms.ts`, refuses these values
when they are typed into any text field of the app.

## Workbook changes

- **Policies:** new **Draft day** column, e.g. "4th Wed" (Social Security schedule) or
  "3rd". The client asked for its own column.
- **Beneficiaries:** new **Type** column (Primary / Contingent). **Policy total %** now
  totals each type separately, so both should reach 100%.
- **Clients:** **Health conditions** removed. The client: "Unnecessary to include in this
  sheet."
- The phone app's policy section gained Issue date, Draft day and a beneficiary list
  (add/remove any number).

## Checks

- **Unit tests** (`test/contactReader.test.ts`) run on the exact text Drive returned for
  the client's three test contacts, with every expected value spelled out:
  - the private values must not appear anywhere in the result;
  - Test Client 3 is read in all six screenshot orders.
- **`npm run test:remote` Phase 4** runs in Google:
  - real OCR of the six sample screenshots, with no Docs left in Drive (trash included);
  - every contact read end to end, then saved, with the policy, draft day and
    beneficiaries checked in the sheet;
  - the form flags a bad phone;
  - the whole workbook is scanned for private values;
  - bad uploads are refused.

  The samples are built into the DEV script project only when `samples/` exists. Without
  that folder the OCR cases report "not tested".

- `npm run preview:app` shows the new screens (screenshots, check-contact).
- Speed: about 5-6 s per screenshot on Google's side, so a typical 2-3 screenshot contact
  takes 10-20 s.

## Waiting on the client

- **Privacy approval (open item 9):** the screenshots are read inside the agent's Google
  account (Drive OCR, deleted at once), with no outside AI service. Still worth confirming
  with the agency.

## Status

**Done 2026-10-22.** `npm run test:remote`: Phase 1 19/19 (179 s), Phase 2 16/16 (161 s),
Phase 4 9/9 (171 s); 53 unit tests. DEV workbook re-set up with the new columns; phone
app redeployed (same link). OCR took 3.3-6 s per screenshot in the test runs.
