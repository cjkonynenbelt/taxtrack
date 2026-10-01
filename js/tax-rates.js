// Tax rate tables used ONLY for the "estimated amount to set aside".
//
// UPDATE EACH YEAR: copy the latest block, change the year key, and replace the
// numbers from the official sources below. Values can also be overridden per
// year from Settings > Tax rate table without editing this file.
//
// Sources (Government of Canada), retrieved 2026-10-01:
//  - Brackets:  https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html
//  - CPP:       https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html
//  - CPP2:      https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/calculating-deductions/making-deductions/second-additional-cpp-contribution-rates-maximums.html
//  - Basic personal amounts: CRA T4127 Payroll Deductions Formulas (January 2026 edition)
//
// brackets: [upper limit of bracket (null = no limit), rate]

export const RATE_SOURCES = {
  brackets: 'https://www.canada.ca/en/revenue-agency/services/tax/individuals/tax-rates-brackets/current-year.html',
  cpp: 'https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html',
};

export const PROVINCES = {
  AB: 'Alberta', BC: 'British Columbia', MB: 'Manitoba', NB: 'New Brunswick',
  NL: 'Newfoundland and Labrador', NS: 'Nova Scotia', NT: 'Northwest Territories',
  NU: 'Nunavut', ON: 'Ontario', PE: 'Prince Edward Island', QC: 'Quebec',
  SK: 'Saskatchewan', YT: 'Yukon',
};

export const RATES = {
  2026: {
    federal: {
      brackets: [[58523, 0.14], [117045, 0.205], [181440, 0.26], [258482, 0.29], [null, 0.33]],
      // Basic personal amount is reduced from max to min between these net incomes.
      bpa: { max: 16452, min: 14829, start: 181440, end: 258482 },
    },
    cpp: {
      ympe: 74600,        // maximum pensionable earnings
      yampe: 85000,       // additional maximum (CPP2 ceiling)
      exemption: 3500,
      rate: 0.0595,       // employee rate; self-employed pay double
      baseRate: 0.0495,   // part of the employee rate that is a credit rather than a deduction
      cpp2Rate: 0.04,     // employee rate; self-employed pay double
    },
    provinces: {
      AB: { brackets: [[61200, 0.08], [154259, 0.10], [185111, 0.12], [246813, 0.13], [370220, 0.14], [null, 0.15]], bpa: 22769 },
      BC: { brackets: [[50363, 0.056], [100728, 0.077], [115648, 0.105], [140430, 0.1229], [190405, 0.147], [265545, 0.168], [null, 0.205]], bpa: 13216 },
      MB: { brackets: [[47564, 0.108], [101200, 0.1275], [null, 0.174]], bpa: 15780 },
      NB: { brackets: [[52333, 0.094], [104666, 0.14], [193861, 0.16], [null, 0.195]], bpa: 13664 },
      NL: { brackets: [[44678, 0.087], [89354, 0.145], [159528, 0.158], [223340, 0.178], [285319, 0.198], [570638, 0.208], [1141275, 0.213], [null, 0.218]], bpa: 11188 },
      NS: { brackets: [[30995, 0.0879], [61991, 0.1495], [97417, 0.1667], [157124, 0.175], [null, 0.21]], bpa: 11932 },
      NT: { brackets: [[53003, 0.059], [106009, 0.086], [172346, 0.122], [null, 0.1405]], bpa: 18198 },
      NU: { brackets: [[55801, 0.04], [111602, 0.07], [181439, 0.09], [null, 0.115]], bpa: 19659 },
      // Ontario basic personal amount was not confirmed from a CRA page - verify. Surtax and health premium are not modelled.
      ON: { brackets: [[53891, 0.0505], [107785, 0.0915], [150000, 0.1116], [220000, 0.1216], [null, 0.1316]], bpa: 12989, note: 'Ontario surtax and health premium are not included, and the basic personal amount should be verified.' },
      PE: { brackets: [[33928, 0.095], [65820, 0.1347], [106890, 0.166], [142520, 0.1762], [200000, 0.19], [null, 0.20]], bpa: 15000 },
      // Quebec has its own tax system (Revenu Quebec, QPP). Not modelled.
      QC: null,
      SK: { brackets: [[54532, 0.105], [155805, 0.125], [null, 0.145]], bpa: 20381 },
      YT: { brackets: [[58523, 0.064], [117045, 0.09], [181440, 0.109], [500000, 0.128], [null, 0.15]], bpa: 16452 },
    },
  },
};

// Returns { year, usedYear, table } - falls back to the newest table we have
// when the requested year has not been published/entered yet.
export function ratesFor(year, overrides = {}) {
  if (overrides && overrides[year]) return { year, usedYear: year, table: overrides[year], custom: true };
  if (RATES[year]) return { year, usedYear: year, table: RATES[year], custom: false };
  const known = Object.keys(RATES).map(Number).sort((a, b) => a - b);
  const usedYear = known.filter(y => y <= year).pop() || known[known.length - 1];
  const o = overrides && overrides[usedYear];
  return { year, usedYear, table: o || RATES[usedYear], custom: !!o };
}
