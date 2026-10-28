// Default dropdown lists and rates, from the client's answers (2026-10-21).
// These seed the Settings tab; after setup the client edits them there.
// Items marked PROPOSED were suggested by us and still need client sign-off.

export type LineOfBusiness = 'life' | 'medicare';

export interface Carrier {
  name: string;
  /** Shorthand the client may type in contact notes; used by the screenshot reader. */
  aliases: string[];
  lines: LineOfBusiness[];
}

export const CARRIERS: Carrier[] = [
  { name: 'American Amicable', aliases: ['AmAm', 'AA'], lines: ['life'] },
  { name: 'Citizens Life (CICA)', aliases: ['CICA', 'Citizens'], lines: ['life'] },
  { name: 'Mutual of Omaha', aliases: ['MoO', 'Mutual'], lines: ['life'] },
  { name: 'Transamerica', aliases: ['Trans', 'TA'], lines: ['life'] },
  { name: 'Combined Insurance', aliases: ['Combined'], lines: ['life'] },
  { name: 'Royal Neighbors of America', aliases: ['RNA', 'Royal'], lines: ['life'] },
  { name: 'Guarantee Trust Life', aliases: ['GTL'], lines: ['life'] },
  { name: 'Corebridge Financial', aliases: ['Corebridge', 'AIG'], lines: ['life'] },
  { name: 'Foresters Financial', aliases: ['Foresters'], lines: ['life'] },
  { name: 'Devoted Health', aliases: ['Devoted'], lines: ['medicare'] },
  // From the client's commission listing (2026-10-28).
  { name: 'Aetna / CVS', aliases: ['Aetna', 'CVS'], lines: ['life'] },
  { name: 'Americo', aliases: ['Americo'], lines: ['life'] },
];

/**
 * One Policy Status field replaces "first draft status" + "active/inactive".
 * `group` drives persistency and premium-in-force calculations.
 */
export type StatusGroup = 'pending' | 'active' | 'at_risk' | 'inactive' | 'claim' | 'not_issued';

export const POLICY_STATUSES: { name: string; group: StatusGroup }[] = [
  { name: 'Pending', group: 'pending' },
  { name: 'Paid as issued', group: 'active' },
  { name: 'Insufficient funds', group: 'at_risk' },
  { name: 'Lapsed', group: 'inactive' },
  { name: 'Cancelled', group: 'inactive' },
  // A death claim ends the policy but is not a lapse: left out of persistency.
  { name: 'Deceased', group: 'claim' },
  // PROPOSED: applications that never issue.
  { name: 'Declined', group: 'not_issued' },
  { name: 'Not taken', group: 'not_issued' },
];

/** Medicare products the client sells (2026-10-28). */
export const MEDICARE_TYPES = ['Part A', 'Part B', 'Part D', 'MAPD', 'MAO', 'C-SNP', 'D-SNP'];

// Life list confirmed 2026-10-22.
export const PRODUCT_TYPES = [
  'Final expense - Level',
  'Final expense - Graded',
  'Final expense - Guaranteed issue',
  'Whole life',
  'Term',
  ...MEDICARE_TYPES.map((t) => `Medicare - ${t}`),
];

export const MEDICARE_PLAN_TYPES = ['None', ...MEDICARE_TYPES];

/** Payments per year; premiums are normalised to monthly for reporting. */
export const PAYMENT_MODES: { name: string; perYear: number }[] = [
  { name: 'Monthly', perYear: 12 },
  { name: 'Quarterly', perYear: 4 },
  { name: 'Semi-annual', perYear: 2 },
  { name: 'Annual', perYear: 1 },
];

export const SMOKER_OPTIONS = ['Non-smoker', 'Smoker'];

/** Contact notes list primary beneficiaries under "Ben:" and contingent ones under "Con.". */
export const BENEFICIARY_TYPES = ['Primary', 'Contingent'];

export interface LeadType {
  name: string;
  costPerLead: number;
  /** ISO date the cost applies from; later rows override earlier ones. */
  from: string;
  confirmed: boolean;
}

export const LEAD_TYPES: LeadType[] = [
  { name: 'Yes lead', costPerLead: 10, from: '2026-01-01', confirmed: true },
  { name: 'Survey lead', costPerLead: 23, from: '2026-01-01', confirmed: true },
  // Client (2026-10-22): "I believe the cost is 48", to confirm.
  { name: 'Mail-in lead', costPerLead: 48, from: '2026-01-01', confirmed: false },
  // PROPOSED: referrals appear in contact notes ("wants policy for sister").
  { name: 'Referral', costPerLead: 0, from: '2026-01-01', confirmed: false },
];

export const EXPENSE_CATEGORIES = ['Gas', 'Leads', 'Food', 'Misc'];

// PROPOSED: not asked yet.
export const PAYMENT_METHODS = ['Debit card', 'Credit card', 'Cash', 'Bank transfer'];

/** How the premium is paid: CICA only advances on bank draft. No account details. */
export const PREMIUM_PAID_BY = ['Bank draft', 'Card', 'Direct bill'];

// Optional activity tag on hours (client, 2026-10-22).
export const HOURS_ACTIVITIES = ['Dialing', 'Field', 'Admin', 'Other'];

export const STATES = ['OK'];

// prettier-ignore
export const OK_COUNTIES = [
  'Adair', 'Alfalfa', 'Atoka', 'Beaver', 'Beckham', 'Blaine', 'Bryan', 'Caddo', 'Canadian',
  'Carter', 'Cherokee', 'Choctaw', 'Cimarron', 'Cleveland', 'Coal', 'Comanche', 'Cotton',
  'Craig', 'Creek', 'Custer', 'Delaware', 'Dewey', 'Ellis', 'Garfield', 'Garvin', 'Grady',
  'Grant', 'Greer', 'Harmon', 'Harper', 'Haskell', 'Hughes', 'Jackson', 'Jefferson',
  'Johnston', 'Kay', 'Kingfisher', 'Kiowa', 'Latimer', 'Le Flore', 'Lincoln', 'Logan', 'Love',
  'Major', 'Marshall', 'Mayes', 'McClain', 'McCurtain', 'McIntosh', 'Murray', 'Muskogee',
  'Noble', 'Nowata', 'Okfuskee', 'Oklahoma', 'Okmulgee', 'Osage', 'Ottawa', 'Pawnee', 'Payne',
  'Pittsburg', 'Pontotoc', 'Pottawatomie', 'Pushmataha', 'Roger Mills', 'Rogers', 'Seminole',
  'Sequoyah', 'Stephens', 'Texas', 'Tillman', 'Tulsa', 'Wagoner', 'Washington', 'Washita',
  'Woods', 'Woodward',
];

/** Months after the persistency start date at which persistency is reported. */
export const PERSISTENCY_MONTHS = [3, 6, 9, 12];

/**
 * Policy dates persistency counts from, first one filled in wins. Client
 * (2026-10-22): "First draft would start persistency".
 */
export const PERSISTENCY_START = ['firstDraftDate', 'effectiveDate', 'issueDate'] as const;

export interface MileageRate {
  /** ISO date the rate applies from. */
  from: string;
  dollarsPerMile: number;
  verified: boolean;
}

export const IRS_MILEAGE_RATES: MileageRate[] = [
  { from: '2025-01-01', dollarsPerMile: 0.7, verified: true },
  { from: '2026-01-01', dollarsPerMile: 0.725, verified: true },
  // Reported mid-year change (IRB 2026-29); not yet confirmed on IRS.gov.
  { from: '2026-07-01', dollarsPerMile: 0.76, verified: false },
];

// ---- Commissions (client's listing and carrier schedules, 2026-10-28) -----------
// See docs/commission-rates.md. These seed Settings; the client edits them there.

export interface Plan {
  /** Shown in the Policies "Plan" dropdown. */
  name: string;
  carrier: string;
  /** Months of year-1 commission paid up front when the policy starts; 0 = as earned. */
  advanceMonths: number;
  /** The advance is only paid when the premium comes by bank draft (CICA). */
  bankDraftOnly: boolean;
  /** False while something about the plan is still to be confirmed by the client. */
  confirmed: boolean;
}

// prettier-ignore
export const PLANS: Plan[] = [
  { name: 'Aetna FE Level', carrier: 'Aetna / CVS', advanceMonths: 0, bankDraftOnly: false, confirmed: true },
  { name: 'Aetna FE Modified', carrier: 'Aetna / CVS', advanceMonths: 0, bankDraftOnly: false, confirmed: true },
  { name: 'AmAm Level', carrier: 'American Amicable', advanceMonths: 9, bankDraftOnly: false, confirmed: true },
  { name: 'AmAm ROP / Graded', carrier: 'American Amicable', advanceMonths: 9, bankDraftOnly: false, confirmed: true },
  { name: 'Americo Eagle Select 1', carrier: 'Americo', advanceMonths: 9, bankDraftOnly: false, confirmed: true },
  { name: 'Americo Eagle Select 2', carrier: 'Americo', advanceMonths: 9, bankDraftOnly: false, confirmed: true },
  { name: 'Americo Eagle Select 3', carrier: 'Americo', advanceMonths: 9, bankDraftOnly: false, confirmed: true },
  { name: 'CICA Level', carrier: 'Citizens Life (CICA)', advanceMonths: 6, bankDraftOnly: true, confirmed: true },
  // Renewal rate not given yet.
  { name: 'CICA Guaranteed issue', carrier: 'Citizens Life (CICA)', advanceMonths: 6, bankDraftOnly: true, confirmed: false },
  { name: 'Corebridge SIWL', carrier: 'Corebridge Financial', advanceMonths: 9, bankDraftOnly: false, confirmed: true },
  // The client's summary advances Corebridge level only; their rates say GIWL and graded too.
  { name: 'Corebridge GIWL', carrier: 'Corebridge Financial', advanceMonths: 9, bankDraftOnly: false, confirmed: false },
  { name: 'Corebridge Graded', carrier: 'Corebridge Financial', advanceMonths: 9, bankDraftOnly: false, confirmed: false },
  // Rates given for ages 45-80 only; graded renewals not given yet.
  { name: 'MoO Level', carrier: 'Mutual of Omaha', advanceMonths: 9, bankDraftOnly: false, confirmed: false },
  { name: 'MoO Graded', carrier: 'Mutual of Omaha', advanceMonths: 9, bankDraftOnly: false, confirmed: false },
  { name: 'RNA SIWL', carrier: 'Royal Neighbors of America', advanceMonths: 0, bankDraftOnly: false, confirmed: true },
  { name: 'RNA Graded', carrier: 'Royal Neighbors of America', advanceMonths: 0, bankDraftOnly: false, confirmed: true },
  { name: 'RNA Guaranteed issue', carrier: 'Royal Neighbors of America', advanceMonths: 0, bankDraftOnly: false, confirmed: true },
];

/** Percent of premium by policy year, for issue ages fromAge-toAge (null = any age). */
export interface CommissionRate {
  plan: string;
  fromAge: number | null;
  toAge: number | null;
  year1: number;
  years2to5: number | null;
  years6to10: number | null;
  years11on: number | null;
}

/** Renewals default to: years 6-10 as years 2-5, nothing from year 11. */
function rate(
  plan: string,
  ages: [number, number] | null,
  year1: number,
  years2to5: number | null = null,
  years6to10: number | null = years2to5,
  years11on: number | null = years2to5 === null ? null : 0,
): CommissionRate {
  const [fromAge, toAge] = ages ?? [null, null];
  return { plan, fromAge, toAge, year1, years2to5, years6to10, years11on };
}

export const COMMISSION_RATES: CommissionRate[] = [
  rate('Aetna FE Level', [40, 89], 1.075, 0.065, 0.05, 0.02),
  rate('Aetna FE Modified', [40, 75], 0.975, 0.065, 0.05, 0.02),
  rate('AmAm Level', [0, 79], 1.1, 0.065),
  rate('AmAm Level', [80, 85], 0.75, 0.045),
  rate('AmAm ROP / Graded', [0, 79], 0.95, 0.0475),
  rate('AmAm ROP / Graded', [80, 85], 0.75, 0.045),
  rate('Americo Eagle Select 1', [40, 59], 0.95, 0.01),
  rate('Americo Eagle Select 1', [60, 80], 1.05, 0.01),
  rate('Americo Eagle Select 1', [81, 85], 0.95, 0.01),
  rate('Americo Eagle Select 2', [40, 59], 0.95, 0),
  rate('Americo Eagle Select 2', [60, 80], 1.05, 0),
  rate('Americo Eagle Select 2', [81, 85], 0.95, 0),
  rate('Americo Eagle Select 3', [40, 59], 0.5, 0),
  rate('Americo Eagle Select 3', [60, 75], 0.6, 0),
  rate('CICA Level', null, 1, 0.01),
  rate('CICA Guaranteed issue', null, 0.55),
  rate('Corebridge SIWL', null, 0.97, 0.04, 0.0175),
  rate('Corebridge GIWL', null, 0.55, 0),
  rate('Corebridge Graded', null, 0.57, 0),
  rate('MoO Level', [45, 80], 1.1, 0.045, 0.025),
  rate('MoO Graded', [45, 80], 0.775),
  rate('RNA SIWL', [50, 75], 1.05, 0.0425, 0.0225),
  rate('RNA SIWL', [76, 80], 0.9, 0.0425, 0.0225),
  rate('RNA SIWL', [81, 85], 0.7, 0.0225, 0.013),
  rate('RNA Graded', [50, 75], 0.675, 0.0425, 0.0225),
  rate('RNA Graded', [76, 80], 0.575, 0.0425, 0.0225),
  rate('RNA Graded', [81, 85], 0.475, 0.0225, 0.013),
  rate('RNA Guaranteed issue', [50, 75], 0.23, 0.029, 0.009),
  rate('RNA Guaranteed issue', [76, 80], 0.185, 0.029, 0.009),
];
