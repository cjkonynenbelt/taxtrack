// Expense categories + the "Potential Business Expenses" reference.
//
// This file is DATA, not advice. It is meant to be edited when rules change:
// update wording, limits or links here and the whole app follows.
// Wording is deliberately conservative: items are flagged for review, never
// declared deductible. Rule summaries are based on CRA guide T4002 (Rev. 25)
// and the CRA "Business expenses" pages, retrieved 2026-10-01.

const CRA = 'https://www.canada.ca/en/revenue-agency/services';
export const LINKS = {
  expenses: `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses.html`,
  vehicle: `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/business-expenses/motor-vehicle-expenses.html`,
  home: `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html`,
  cca: `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships/report-business-income-expenses/claiming-capital-cost-allowance.html`,
  guide: `${CRA}/forms-publications/publications/t4002.html`,
  rates: `${CRA}/tax/individuals/tax-rates-brackets/current-year.html`,
};
const anchor = a => `${LINKS.expenses}#${a}`;

export const VERIFY = 'Verify the current CRA rules or ask your accountant before claiming.';
export const POTENTIAL = 'Potentially deductible depending on your circumstances.';

export const INCOME_TYPES = ['Monthly residual/commission', 'Installation payment', 'Sales commission', 'Bonus', 'Other business income'];
export const TRIP_PURPOSES = ['Sales meeting', 'Prospecting', 'Customer visit', 'Payment-system installation', 'Training', 'Business errand', 'Other business purpose'];

export const VEHICLE_CATEGORIES = ['Fuel', 'Insurance', 'Repairs', 'Maintenance', 'Tires', 'Oil changes', 'Registration', 'Parking', 'Tolls', 'Car washes', 'Financing interest', 'Lease payments', 'Other vehicle expenses'];

const RECEIPT = ['Receipt or invoice', 'Date', 'Amount', 'Vendor'];

// Per-category guidance shown on the expense form and in the year-end review.
//   docs   - what to keep
//   warn   - shown when the category is picked
//   review - why this category lands in "Expenses to review"
//   capital / meals / home - how the estimator treats it
export const CATEGORIES = {
  'Phone': { docs: [...RECEIPT, 'Monthly bill', 'How you worked out the business-use %'], warn: 'Enter the business-use share only. CRA guidance: the basic monthly rate of a home phone is not deductible; cell airtime is deductible only for the part that reasonably relates to earning income.', pctHint: 'Business share of use', link: anchor('telephoneandutilities') },
  'Internet': { docs: [...RECEIPT, 'Monthly bill', 'How you worked out the business-use %'], warn: 'Enter the business-use share only.', pctHint: 'Business share of use', link: anchor('telephoneandutilities') },
  'Advertising & marketing': { docs: [...RECEIPT, 'What was advertised and where'], link: anchor('advertising') },
  'Software & subscriptions': { docs: [...RECEIPT, 'What the software is used for'], link: anchor('officeexpenses') },
  'Computer/equipment': { docs: [...RECEIPT, 'Date purchased', 'Description / serial number', 'Business-use percentage'], warn: 'Equipment is usually a capital purchase claimed gradually through capital cost allowance (CCA), not as an expense in the year you buy it. Tracked separately and left out of the estimate unless you change that in Settings.', review: 'Equipment - may need capital cost allowance (CCA) treatment', capital: true, link: LINKS.cca },
  'Office supplies': { docs: RECEIPT, warn: 'Small consumables only (paper, ink, pens, postage). Furniture, calculators and similar lasting items are capital items.', link: anchor('officeexpenses') },
  'Business insurance': { docs: [...RECEIPT, 'Policy document'], link: anchor('insurance') },
  'Accounting & professional fees': { docs: [...RECEIPT, 'What the service was for'], link: anchor('legalaccountingandotherprofessionalfees') },
  'Banking/payment fees': { docs: ['Bank or processor statement', 'Date', 'Amount'], link: anchor('interestcharges') },
  'Interest on business borrowing': { docs: ['Loan statement', 'What the borrowed money was used for'], warn: 'Only interest on money borrowed to earn business income may qualify. Special limits apply to vehicle loans.', review: 'Interest - confirm the loan was for business purposes', link: anchor('interestcharges') },
  'Meals & entertainment': { docs: ['Receipt', 'Date', 'People and business involved', 'Business purpose of the meeting'], warn: 'Meals and entertainment have special limits: generally only 50% of a reasonable amount can be claimed. The estimate applies the percentage set in Settings.', review: 'Meals & entertainment - 50% limit generally applies', meals: true, link: anchor('mealsandentertainmentallowablepartonly') },
  'Travel': { docs: ['Receipts', 'Destination', 'Business purpose', 'Travel dates'], warn: 'Business travel only. Record meals while travelling under Meals & entertainment (special limit).', review: 'Travel - keep destination, dates and business purpose', link: anchor('trvl') },
  'Training/education': { docs: [...RECEIPT, 'Course description', 'How it relates to your current business'], warn: 'Training that maintains or improves skills for your existing business may qualify. Education for a new career or a degree generally does not, and conventions are limited to two per year.', review: 'Training - confirm it maintains skills for your existing business', link: LINKS.guide },
  'Licences, dues & memberships': { docs: [...RECEIPT, 'What the licence or membership is for'], link: anchor('businesstaxfeeslicencesdues') },
  'Clothing/uniforms': { docs: [...RECEIPT, 'Why the item is required for the work'], warn: 'Ordinary clothing is generally NOT deductible just because you wear it for work. Record it here only so your accountant can review it.', review: 'Clothing - ordinary clothing is generally not deductible', link: LINKS.guide },
  'Home office': { docs: ['Bills (rent, utilities, insurance)', 'Size of the work space vs. the whole home', 'How the space is used'], warn: 'Business-use-of-home expenses can be claimed only if the space is your principal place of business, or is used only to earn business income and on a regular and continuing basis to meet clients. The claim cannot create or increase a loss. Left out of the estimate unless you confirm in Settings that you qualify.', pctHint: 'Work space as % of home', review: 'Home office - confirm you meet the conditions', home: true, link: LINKS.home },
  'Other': { docs: [...RECEIPT, 'Business purpose'], review: 'Uncategorised - confirm category with accountant', link: LINKS.expenses },
};
export const OTHER_CATEGORIES = Object.keys(CATEGORIES);

export const VEHICLE_INFO = {
  docs: ['Receipt', 'Date', 'Amount', 'Vehicle', 'Mileage log (date, destination, purpose, km)', 'Odometer at start and end of year'],
  warn: 'Vehicle running costs are generally claimed in proportion to business kilometres. CRA expects a logbook. Parking for a business stop can generally be claimed in full.',
  link: LINKS.vehicle,
};

export const LARGE_PURCHASE = 500; // flag single expenses at or above this for review

// ---- Potential Business Expenses catalogue --------------------------------
// item: [name, extra search keywords, app category, overrides]

const G = (title, base, items) => ({ title, base, items: items.map(([name, keys, category, o]) => ({ name, keys: keys || '', category, ...base, ...(o || {}) })) });

const vehicleBase = { status: POTENTIAL, pct: 'Business km ÷ total km for the year', special: 'Claimed in proportion to business use. Needs a mileage log.', docs: VEHICLE_INFO.docs, link: LINKS.vehicle, group: 'vehicle' };
const travelBase = { status: POTENTIAL, pct: '100% if the trip is entirely for business', special: 'Personal days or side trips are not business travel.', docs: CATEGORIES['Travel'].docs, link: anchor('trvl') };

export const CATALOG = [
  G('Vehicle & travel', vehicleBase, [
    ['Fuel', 'gas gasoline diesel petrol charging ev', 'Fuel'],
    ['Vehicle insurance', 'car insurance', 'Insurance'],
    ['Repairs', 'mechanic brakes windshield', 'Repairs'],
    ['Maintenance', 'service tune-up', 'Maintenance'],
    ['Oil changes', 'oil lube', 'Oil changes'],
    ['Tires', 'tire winter tires', 'Tires'],
    ['Vehicle registration', 'licence plate registry', 'Registration'],
    ['Parking', 'parkade meter', 'Parking', { pct: '100% when parking for a business stop', special: 'Business parking can generally be claimed in full, even for a mixed-use vehicle.' }],
    ['Tolls', 'toll road bridge', 'Tolls', { pct: '100% when the trip is for business' }],
    ['Car washes', 'wash detailing', 'Car washes'],
    ['Vehicle financing interest', 'car loan interest', 'Financing interest', { special: 'Interest on a passenger vehicle loan is capped by a prescribed daily limit, then prorated by business use.' }],
    ['Vehicle lease payments', 'lease', 'Lease payments', { special: 'Leasing costs for passenger vehicles are capped by a prescribed monthly limit, then prorated by business use.' }],
    ['Vehicle depreciation (CCA)', 'depreciation capital cost allowance car purchase truck', null, { special: 'The vehicle itself is not expensed. Capital cost allowance may be claimable; passenger vehicles have a prescribed cost ceiling. Have your accountant calculate it.', link: LINKS.cca }],
    ['Public transportation', 'bus train transit ctrain', 'Travel', { ...travelBase, group: 'other' }],
    ['Taxi / rideshare', 'uber lyft cab', 'Travel', { ...travelBase, group: 'other' }],
    ['Hotels / accommodation', 'hotel motel airbnb lodging', 'Travel', { ...travelBase, group: 'other' }],
    ['Airfare', 'flight plane airline', 'Travel', { ...travelBase, group: 'other' }],
    ['Rental vehicle', 'car rental', 'Travel', { ...travelBase, group: 'other' }],
  ]),
  G('Phone & communication', { status: POTENTIAL, pct: 'Your reasonable business share of use (e.g. 60%)', special: 'Only the business portion. The basic rate of a home phone line is not deductible.', docs: CATEGORIES['Phone'].docs, link: anchor('telephoneandutilities') }, [
    ['Cell phone plan', 'cellphone mobile phone bill iphone plan', 'Phone'],
    ['Long-distance business calls', 'long distance', 'Phone', { pct: '100% of the business calls' }],
    ['Internet', 'wifi home internet', 'Internet'],
    ['Business communication services', 'voip zoom teams conferencing', 'Software & subscriptions', { pct: '100% if used only for business' }],
  ]),
  G('Home office', { status: 'Only if you qualify - the app asks before counting it.', pct: 'Work space area ÷ total home area', special: CATEGORIES['Home office'].warn, docs: CATEGORIES['Home office'].docs, link: LINKS.home }, [
    ['Rent (business portion)', 'apartment', 'Home office'],
    ['Utilities / electricity / heating / water', 'power gas bill enmax hydro', 'Home office'],
    ['Home insurance', 'tenant insurance', 'Home office'],
    ['Home maintenance', 'cleaning repairs', 'Home office'],
    ['Property taxes / mortgage interest', 'mortgage', 'Home office', { special: 'Mortgage interest and property tax may be included only in proportion to the work space; mortgage principal is never an expense.' }],
  ]),
  G('Sales & marketing', { status: POTENTIAL, pct: '100% if solely for the business', special: 'None beyond being incurred to earn business income.', docs: CATEGORIES['Advertising & marketing'].docs, link: anchor('advertising') }, [
    ['Business cards', 'cards', 'Advertising & marketing'],
    ['Flyers / printing', 'brochure print', 'Advertising & marketing'],
    ['Advertising (print, online)', 'facebook ads google ads instagram', 'Advertising & marketing', { special: 'Advertising aimed mainly at a Canadian market in foreign media can be restricted.' }],
    ['Website, domain & hosting', 'domain hosting squarespace wix', 'Advertising & marketing'],
    ['CRM / sales / lead-generation software', 'crm hubspot salesforce leads', 'Software & subscriptions'],
    ['Email & marketing services', 'mailchimp email', 'Software & subscriptions'],
    ['Promotional materials', 'swag gifts promo', 'Advertising & marketing', { special: 'Gifts and entertainment-type promotion can fall under the 50% meals & entertainment limit.' }],
  ]),
  G('Technology & equipment', { status: 'Potentially claimable, usually through capital cost allowance (CCA).', pct: 'Business share of use', special: CATEGORIES['Computer/equipment'].warn, docs: CATEGORIES['Computer/equipment'].docs, link: LINKS.cca }, [
    ['Computer / laptop', 'new laptop macbook pc desktop', 'Computer/equipment'],
    ['Monitor, keyboard, mouse, printer', 'screen', 'Computer/equipment'],
    ['Phone or tablet (the device)', 'ipad iphone handset', 'Computer/equipment'],
    ['Accessories, cables, adapters, storage', 'charger usb hard drive', 'Computer/equipment', { special: 'Low-cost items may be ordinary supplies rather than capital items - ask your accountant where the line is.' }],
    ['Tools & installation equipment', 'tools drill', 'Computer/equipment'],
    ['Business software / cloud storage / security', 'microsoft 365 dropbox icloud antivirus app', 'Software & subscriptions', { status: POTENTIAL, special: 'Subscriptions are normally ordinary expenses; purchased software can be a capital item.', link: anchor('officeexpenses') }],
  ]),
  G('Professional services & banking', { status: POTENTIAL, pct: '100% if for the business', special: 'Fees to buy capital property are added to the cost of that property instead.', docs: CATEGORIES['Accounting & professional fees'].docs, link: anchor('legalaccountingandotherprofessionalfees') }, [
    ['Accountant / bookkeeper / tax preparation', 'cpa bookkeeping', 'Accounting & professional fees'],
    ['Lawyer / business consultant', 'legal', 'Accounting & professional fees'],
    ['Bank & business account fees', 'bank fee', 'Banking/payment fees', { link: anchor('interestcharges'), docs: CATEGORIES['Banking/payment fees'].docs }],
    ['Currency conversion & wire fees', 'exchange fx wire usd conversion', 'Banking/payment fees', { link: anchor('interestcharges'), docs: CATEGORIES['Banking/payment fees'].docs }],
    ['Payment processing fees', 'paypal stripe square', 'Banking/payment fees', { link: anchor('interestcharges'), docs: CATEGORIES['Banking/payment fees'].docs }],
    ['Interest on money borrowed for the business', 'loan line of credit', 'Interest on business borrowing', { special: CATEGORIES['Interest on business borrowing'].warn, link: anchor('interestcharges'), docs: CATEGORIES['Interest on business borrowing'].docs }],
  ]),
  G('Training & education', { status: POTENTIAL, pct: '100% if it qualifies', special: CATEGORIES['Training/education'].warn, docs: CATEGORIES['Training/education'].docs, link: LINKS.guide }, [
    ['Sales / industry training & courses', 'course class workshop', 'Training/education'],
    ['Certifications', 'certificate', 'Training/education'],
    ['Seminars & conferences', 'convention conference', 'Training/education', { special: 'CRA allows up to two conventions a year that relate to your business; meals included in the fee fall under the 50% limit.' }],
    ['Business books & subscriptions', 'book magazine audible', 'Training/education'],
  ]),
  G('Office expenses', { status: POTENTIAL, pct: '100% if for the business', special: CATEGORIES['Office supplies'].warn, docs: RECEIPT, link: anchor('officeexpenses') }, [
    ['Office supplies, paper, ink, pens', 'stationery notebook staples', 'Office supplies'],
    ['Postage & shipping', 'courier stamps canada post', 'Office supplies', { link: anchor('deliveryfreightandexpress') }],
  ]),
  G('Meals & entertainment', { status: 'Potentially deductible - special limit applies.', pct: 'Generally 50% of a reasonable amount', special: CATEGORIES['Meals & entertainment'].warn, docs: CATEGORIES['Meals & entertainment'].docs, link: anchor('mealsandentertainmentallowablepartonly') }, [
    ['Meal with a prospective customer', 'lunch dinner coffee prospect', 'Meals & entertainment'],
    ['Meal with an existing customer', 'lunch with customer client', 'Meals & entertainment'],
    ['Meals while travelling for business', 'food restaurant', 'Meals & entertainment'],
    ['Entertainment (tickets, events)', 'hockey game golf', 'Meals & entertainment'],
  ]),
  G('Insurance & professional costs', { status: POTENTIAL, pct: '100% if for the business', special: 'Personal and life insurance are generally not business expenses.', docs: CATEGORIES['Business insurance'].docs, link: anchor('insurance') }, [
    ['Business / liability / commercial insurance', 'liability', 'Business insurance'],
    ['Licence & business registration fees', 'business licence registration', 'Licences, dues & memberships', { link: anchor('businesstaxfeeslicencesdues') }],
    ['Professional & industry association fees', 'membership dues chamber', 'Licences, dues & memberships', { special: 'Club memberships whose main purpose is dining, recreation or sport are not deductible.', link: anchor('businesstaxfeeslicencesdues') }],
  ]),
  G('Clothing', { status: 'Generally not deductible - flag for review only.', pct: 'Not applicable', special: CATEGORIES['Clothing/uniforms'].warn, docs: CATEGORIES['Clothing/uniforms'].docs, link: LINKS.guide }, [
    ['Work clothing / uniforms', 'clothes shirt suit boots jacket', 'Clothing/uniforms'],
    ['Protective gear', 'safety gloves', 'Clothing/uniforms', { status: POTENTIAL, special: 'Protective equipment needed for the work is treated differently from ordinary clothing - ask your accountant.' }],
  ]),
];

const tokens = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1);

// "Could I write this off?" - best matches for a free-text query.
export function lookup(query) {
  const q = tokens(query);
  if (!q.length) return [];
  const scored = [];
  for (const g of CATALOG) {
    for (const item of g.items) {
      const hay = tokens(`${item.name} ${item.keys} ${item.category || ''} ${g.title}`);
      let score = 0;
      for (const t of q) {
        if (hay.includes(t)) score += 3;
        else if (hay.some(h => h.startsWith(t) || t.startsWith(h))) score += 1;
      }
      if (score > 0) scored.push({ score, item, group: g.title });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, 4);
}
