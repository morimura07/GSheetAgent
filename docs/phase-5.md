# Phase 5: Commissions

Goal: each policy shows the commission it has earned, the advance paid on it and what is
owed back if it lapses, and the reports total these by month, year and carrier. All of it
is live formulas, like the Phase 3 reports.

## Settings

Two new tables. They are seeded from `src/config/lists.ts` (rates in
[commission-rates.md](commission-rates.md)) and the client edits them afterwards.

- **Plans:** plan name, carrier, advance months (0 = paid as earned), "Advance only with
  bank draft" (CICA), Confirmed, "Advance limit $" (Generational Life: $1,000; blank =
  no limit) and "Flat $ a month instead of premium" (Medicare: about $36). Unchecked
  Confirmed marks a plan with an open question.
- **Commission rates:** plan, from age, to age (blank = any age), and the percent of premium
  for year 1, years 2-5, years 6-10 and years 11+. Rates can be over 100%.

A new carrier or plan means a new row in each table; nothing in the code changes.

## Policies: new columns

| Column                         | Typed or calculated | What                                                                                |
| ------------------------------ | ------------------- | ----------------------------------------------------------------------------------- |
| Plan                           | typed (dropdown)    | Settings > Plans                                                                    |
| Premium paid by                | typed (dropdown)    | Bank draft, Card or Direct bill. Only the type: no account details                  |
| Age at issue                   | calculated          | client's age on the effective date, else issue date, else application date          |
| Commission year 1              | calculated          | the plan's rate for that age, or a message (below)                                  |
| Renewal years 2-5 / 6-10 / 11+ | calculated          | the plan's renewal rates for that age                                               |
| Advance months                 | calculated          | from the plan; 0 for CICA unless paid by bank draft                                 |
| Commission paid on / month     | calculated          | the monthly premium, or the plan's flat amount a month (Medicare)                   |
| Months paid (if different)     | typed               | a correction when the estimate is wrong                                             |
| Months paid                    | calculated          | months of premium paid up to the report date (rules below)                          |
| Advance                        | calculated          | monthly premium x year-1 rate x advance months, up to the plan's advance limit      |
| Commission earned              | calculated          | year-1 rate on months 1-12 paid, then the renewal rates                             |
| Advance not yet earned         | calculated          | advance less year-1 commission earned so far, while in force: owed if it lapsed now |
| Chargeback                     | calculated          | lapsed, cancelled or death claim: the same amount (paid 2 of 9 months: 7 back)      |

**Messages in "Commission year 1"** (shown in red):

- **Check age:** the client's birthday is missing or saved without a year, and the plan's
  rate depends on age.
- **? No rate at age N:** the plan has no rate row for that age (e.g. Mutual of Omaha
  outside 45-80).
- **Check carrier: plan is X:** the plan belongs to another carrier than the policy's.
- **Unknown plan:** the plan isn't in Settings > Plans.

**Months paid**, counted from the persistency start (first draft date, else effective
date), up to the Dashboard's "As of" date:

- **Paid as issued:** every draft due so far, including this month's.
- **Insufficient funds:** the same, without the draft that failed.
- **Lapsed, cancelled or death claim:** up to the Status date, without the draft that
  failed.
- **Quarterly, semi-annual or annual:** each payment counts as 3, 6 or 12 months.

The agent types the real number in "Months paid (if different)" when a carrier statement
says otherwise.

## Reports

- **Dashboard, year figures:**
  - Commission advances;
  - Commission as earned;
  - Chargebacks;
  - Net commission;
  - Advance not yet earned (as of the report date).
- **Dashboard, month table:** the same four amounts per month.
  - An advance counts in the month the policy starts.
  - As-earned commission counts in each paid month once the advance is paid back out of
    the commission earned, renewals included.
  - A chargeback counts in the month of its Status date.
- **Carriers:** Advances, Commission earned, Chargebacks and Advance not yet earned per
  carrier, as of the report date.

## Not covered

- **Medicare:** one "Medicare" plan, any carrier, about $36 a month, until the client's
  contract gives the real amount.
- **Combined:** no rates yet.
- **Aetna's extra 18% on super preferred** (paid only if the client also places an Aetna
  Medicare Supplement): not calculated; add it by hand if it applies.
- **American Amicable return-of-premium death in year 1:** the carrier charges back all
  premium, not only the unearned months. The Chargeback column shows the unearned months.
  Type the real figure from the statement in Notes.
- **Actual payments:** the tracker estimates from dates and statuses; it doesn't read
  carrier statements.

## Checks

- **Unit tests (`test/lists.test.ts`, `test/schema.test.ts`):**
  - every plan has a known carrier and rate rows;
  - age bands don't overlap;
  - rates are between 0% and 120%;
  - the advance carriers match the client's listing;
  - spot checks against the PDFs;
  - every formula's parentheses balance.
- **`npm run test:remote` Phase 5:** 11 policies with every figure worked out by hand, as of
  9/30/2026. They cover:
  - the 9-month advance;
  - a lapse after 2 payments (7 months charged back);
  - CICA by card (no advance) and by bank draft (insufficient funds);
  - an 81-year-old's age band;
  - a policy in its third year (renewals);
  - a death claim, a pending policy and a quarterly premium;
  - a birthday without a year, and a plan from the wrong carrier.

  The test also checks the Dashboard year and month figures, the Carriers columns, a
  hand-corrected months paid, and that no cell shows a formula error. A last case adds three
  Generational Life policies for the $1,000 advance limit (paid back, lapsed, still owed).

**Added 2026-10-29:** Transamerica, GTL Heritage and Generational Life rates; the advance
limit. Then: Mutual of Omaha Living Promise, Child life, IUL and Term Life Express; all
Corebridge advances; CICA GI without renewals; mail-in leads $40; Medicare as a flat amount a
month (a last test case: no premium, 3 months x $36).

## Status

**Built 2026-10-28.** Waiting on the client for: Combined rates, the Medicare contract
commissions, and the open questions in [commission-rates.md](commission-rates.md).
