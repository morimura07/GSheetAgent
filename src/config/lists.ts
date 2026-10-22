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
];

/**
 * One Policy Status field replaces "first draft status" + "active/inactive".
 * `group` drives persistency and premium-in-force calculations.
 */
export type StatusGroup = 'pending' | 'active' | 'at_risk' | 'inactive' | 'not_issued';

export const POLICY_STATUSES: { name: string; group: StatusGroup }[] = [
  { name: 'Pending', group: 'pending' },
  { name: 'Paid as issued', group: 'active' },
  { name: 'Insufficient funds', group: 'at_risk' },
  { name: 'Lapsed', group: 'inactive' },
  { name: 'Cancelled', group: 'inactive' },
  { name: 'Deceased', group: 'inactive' },
  // PROPOSED: applications that never issue.
  { name: 'Declined', group: 'not_issued' },
  { name: 'Not taken', group: 'not_issued' },
];

// PROPOSED: the client has not listed product types yet.
export const PRODUCT_TYPES = [
  'Final expense - Level',
  'Final expense - Graded',
  'Final expense - Guaranteed issue',
  'Whole life',
  'Term',
  'Medicare Advantage',
  'Medicare Supplement',
  'Medicare Part D',
];

export const MEDICARE_PLAN_TYPES = ['None', 'Advantage', 'Supplement', 'Part D'];

/** Payments per year; premiums are normalised to monthly for reporting. */
export const PAYMENT_MODES: { name: string; perYear: number }[] = [
  { name: 'Monthly', perYear: 12 },
  { name: 'Quarterly', perYear: 4 },
  { name: 'Semi-annual', perYear: 2 },
  { name: 'Annual', perYear: 1 },
];

export const SMOKER_OPTIONS = ['Non-smoker', 'Smoker'];

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
  // Client: "unsure, I believe 40 right now".
  { name: 'Mail-in lead', costPerLead: 40, from: '2026-01-01', confirmed: false },
  // PROPOSED: referrals appear in contact notes ("wants policy for sister").
  { name: 'Referral', costPerLead: 0, from: '2026-01-01', confirmed: false },
];

export const EXPENSE_CATEGORIES = ['Gas', 'Leads', 'Food', 'Misc'];

// PROPOSED: not asked yet.
export const PAYMENT_METHODS = ['Debit card', 'Credit card', 'Cash', 'Bank transfer'];

// PROPOSED optional activity tag on hours; client did not comment.
export const HOURS_ACTIVITIES = ['Dialing', 'Appointments', 'Travel', 'Admin', 'Training'];

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

/** OPEN QUESTION: effective date (recommended) or issue date. */
export const PERSISTENCY_START: 'effectiveDate' | 'issueDate' = 'effectiveDate';

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
