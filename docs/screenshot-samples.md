# Contact screenshot samples (received 2026-10-22)

Six screenshots of three made-up contacts (Test Client 1-3), in `samples/` (git-ignored).
They drive the Phase 4 reader. All values below are the client's fake test values.

## The phone

Android, Samsung Contacts (One UI), dark mode. Long notes run over 2-3 screenshots
that overlap, so the reader must accept several images per contact and drop repeated
lines. The bottom bar (Favorites / Edit / Share / More) covers some lines, and the status
bar shows the music playing; both must be ignored.

## Fields in the contact card

| On screen | Example | Goes to |
|---|---|---|
| Name (top) | Test Client 1 | First / last name |
| Mobile | (405) 123-4567 | Phone |
| Home (email) | testemail1@email.com | Email |
| Home (address) | 123 Test Street / Test City, Oklahoma 73111 | Street, City, State (full name → OK), ZIP |
| Birthday | Fri, Dec 21, 1951 · **Nov 21** (no year) · Wed, Oct 21, 2026 (placeholder?) | Birthday; ask when the year is missing or not in the past |
| Parent / Child | Test Client 1 | Linked contact; meaning to confirm (see questions) |

## The notes, as the client writes them

The client does not use the suggested note template. Each note is a free list of short lines:

| Line | Meaning | Goes to |
|---|---|---|
| `Met 10.10.26` | first meeting (m.d.yy) | Client created / lead date |
| `5'6 150`, `6'5 280` | height, weight | Height, Weight |
| `Non smoker`, `Smoker w COPD` | tobacco | Smoker (+ health) |
| `Diabetic no neuropathy`, `2 stents 04`, `Right leg amputated 2010` | health history | Health conditions |
| `Born in Gainesville Tx` | birthplace | Notes |
| `Has 5k policy w AmAm from 02`, `Had 10k with MoO lapsed`, `Had 7k GI RN`, `Had 5k term NYLife` | existing / past coverage, carrier shorthand | Existing coverage |
| `Referred by Test Client 1` | referral | Referred by |
| `Ben:` then `S. Test son 1 34%`, `H. Test Husband 3` + phone | beneficiaries: relationship initial, name, share %, phone | Beneficiaries |
| `Con.` then `S Test son 3` + phone | contingent beneficiary | Beneficiaries (contingent) |
| `Combined graded`, `GTL Graded` | carrier + product | Policy carrier, product type |
| `10k for 110`, `15k for 220` | face amount for premium | Face, Premium |
| `Issued 11.25.26` | issue date | Issue date |
| `4th wed` | draft day (Social Security payment schedule) | Policy notes / draft |
| `G77788888`, `GTL7343456` | policy number | Policy # |
| `MID: 2345678987`, `Devoted advantage` | Medicare ID, plan | Medicare ID, Medicare plan |

Relationship initials seen: S. son, D. daughter, H. husband, Ne. nephew.

## Never stored: present in every long note

| Line | What it is |
|---|---|
| `Ss:123456789`, `Ss: 345678913` | SSN |
| `DL:R0123456789`, `EXP:10.10.31` | driver's license + expiry |
| `Tfcu Debit` / `1234.5678.9876.5432` / `10.10.31` / `567` / `Test client` | debit card, expiry, CVV, name on card |
| `Midfirst Bank` / `R: 34534534567` / `A: 34554334565` | bank routing + account |

The reader drops these lines, plus the lines that belong to the same block (the
expiry, CVV and cardholder lines after a card number, and the bank name before R:/A:).
They are never written to the sheet and never logged.

The phone app's text check (`sensitiveText` in `src/lib/forms.ts`) was tightened on
2026-10-22 to refuse all four kinds as written here; before that it caught only
`123-45-6789` and "SSN 123456789". Unit tests use the sample lines above, including the
normal lines that must still be accepted.

## Privacy consequence for the reader

Every long screenshot contains SSN, card and bank numbers, so whatever reads the image
sees them, even though nothing stores them. Chosen approach (Phase 4): **Google Drive's
built-in text recognition** in the agent's own Google account, with the temporary Doc
deleted permanently at once, plus rule-based reading of the lines above. No outside AI
service is involved. See [phase-4.md](phase-4.md).

## Client answers (2026-10-22)

1. "10k for 110": **$110 is the monthly premium.**
2. The 2026 birthday was used on purpose "to see what the information would flag": a
   birthday this year or later is flagged and left out.
3. The linked contacts (Parent / Child) **are the beneficiaries**: who that person is to
   the policyholder.
4. "4th wed" is the **premium draft date**; it gets its own column (Policies > Draft day).
5. Health details are **not wanted in the sheet**: "It's information for me so I know who
   they are and what they're dealing with." The Health conditions column was removed; the
   reader lists health lines for review but never saves them.
