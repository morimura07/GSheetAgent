# Phase 3: Calculations and dashboard

Four report tabs at the front of the workbook. Every number is a live formula over the
data tabs, so the reports update straight away, whether data comes from the phone app or
is typed into the sheet. Nothing is typed on the report tabs except two inputs on the
Dashboard.

## Inputs (Dashboard)

| Cell      | Blank means | Used for                                                     |
| --------- | ----------- | ------------------------------------------------------------ |
| **Year**  | this year   | the year figures, the month table, Lead results, Tax & hours |
| **As of** | today       | persistency, premium in force, the weekly hours table        |

Setting **As of** to a past date shows the picture on that day (for example the end of
last month).

## The tabs

**Dashboard**

- **Year figures:**
  - applications written;
  - annual premium written (monthly × 12);
  - policies issued;
  - monthly premium in force;
  - persistency at 3/6/9/12 months;
  - leads bought, lead cost, and lead cost per application;
  - hours worked and annual premium per hour;
  - miles, mileage deduction and expenses.
- **Month table:** one row per month of the year:
  - applications and monthly premium written;
  - policies issued;
  - premium in force at month end;
  - premium lost to lapses;
  - leads and lead cost;
  - hours, miles, deduction and expenses.
- **Chart:** premium written vs. in force.

**Carriers** (as of the report date)

- **One row per carrier, plus All carriers:**
  - policies written, issued, pending, in force, and lapsed/cancelled;
  - persistency at 3/6/9/12 months;
  - monthly premium in force and the average premium.
- **The same per product type**, to the right.
- New carriers and products added in Settings/Lists appear automatically.

**Lead results** (leads received in the year)

- **Per lead type:**
  - leads and cost;
  - contacted, appointment and close rates (a lead succeeds when an application is
    written);
  - cost per application;
  - monthly premium written by the clients those leads became;
  - annual premium per $1 spent on leads.

**Tax & hours**

- **Car and expenses:** miles, the mileage deduction, expenses other than gas, and the
  **total to deduct** (the two together). The client enters mileage on their 1040
  (standard mileage method, 2026-10-22), so gas is shown for their records only: the IRS
  rate already covers fuel.
- **Expenses by category.**
- **Lead cost:** the Leads tab total for comparison. The tax figures use what was
  recorded as expenses.
- **Hours:** the last 12 weeks (Monday start) up to the report date, and the year total.
  Hours by month are on the Dashboard.

## Definitions

- **Persistency N months:** take the issued policies that started at least N months
  before the report date. Persistency is the share of those that stayed in force for N
  months.
  - "Started" is the first draft date (client's choice, 2026-10-22), else the effective
    date, else the issue date (`PERSISTENCY_START` in `src/config/lists.ts`).
  - A policy stops at its Status date when it lapses or is cancelled.
  - Pending, declined/not taken, and death claims are left out.
- **Deceased** is its own status group (`claim`). It ends the policy (premium in force
  drops), but it isn't a lapse: it's left out of persistency and out of "premium lost".
- **In force on a day:** issued (has a start date on or before that day) and not lapsed,
  cancelled or claimed by then. "Insufficient funds" still counts as in force.
- **Premium written** counts applications by application date, at the monthly premium.

## Workbook changes

- **Policies:** three calculated columns at the end:
  - **Persistency start**;
  - **Months since start**;
  - **Months in force**.

  The reports count with them, and they show each policy's numbers.

- **Settings > Policy statuses:** Deceased → group `claim`. Workbooks set up before this
  keep their own Settings value; change it there.
- **Tab order:** Dashboard, Carriers, Lead results, Tax & hours, then the data tabs,
  Lists, Settings. The workbook opens on the Dashboard.

## Checks

`npm run test:remote` Phase 3 (9 cases) loads a small dataset with every expected number
worked out by hand: six policies, including a lapse, a death claim, a pending
application, an annual-pay policy and an insufficient-funds policy, plus leads, hours,
trips and expenses. The report runs as of 9/30/2026 for 2026, and the suite checks:

- every Dashboard figure;
- six months of the month table, and its totals;
- each carrier and product row;
- each lead type;
- the mileage-method totals, the categories and the weekly hours;
- that there are no formula errors, with or without data;
- that changing Year / As of moves the numbers, and a second setup keeps the inputs.

## Waiting on the client

- **Mail-in lead cost:** $48 for now (client: "I believe the cost is 48"), to confirm.
  The reports use whatever is in Settings > Lead costs.
- **Item 8:** the 76¢ IRS rate from 7/1/2026 is still marked unverified in Settings.

## Status

**Done 2026-10-22.** `npm run test:remote`: Phase 1 19/19, Phase 2 16/16, Phase 3 9/9
(221 s, the longest suite: two full setups), Phase 4 9/9; 53 unit tests. DEV workbook set
up with the report tabs. The DEV Settings still list Deceased as `inactive` (Settings are
only seeded into an empty tab); new workbooks get `claim`.
