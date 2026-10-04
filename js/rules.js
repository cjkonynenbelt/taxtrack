// The tax-rules database. Every rule, limit and deadline the app shows or
// calculates with lives here, with where it came from and when it was checked.
// Nothing in this file is advice; it is a dated summary of public sources.
//
// TO UPDATE A RULE: edit its entry, set `verified` to the date you checked the
// source, and add a `change` note if the rule is new or different. The screens
// (Can I deduct this?, Learn, Rule updates, reminders, calculators) all read
// from here, so nothing else needs editing. Income tax brackets and CPP have
// their own yearly table in tax-rates.js.
//
// Source hierarchy (highest first): CRA > Government of Canada / Finance Canada
// > Alberta > legislation > professional sources. Videos and blogs are never a
// source here.
//
// status:     law       enacted and in force
//             proposed  announced or in draft legislation, NOT enacted
//             guidance  CRA administrative position or general explanation
//             historical no longer applies (kept so old information is recognisable)
// confidence: high   read directly from the government page on `verified`
//             medium summarised from the page, or a detail was not shown on it
//             low    needs professional confirmation before relying on it

const CRA = 'https://www.canada.ca/en/revenue-agency/services';
const FIN = 'https://www.canada.ca/en/department-finance';
const BIZ = `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships`;

export const VERIFIED = '2026-10-04';
export const CURRENT_TAX_YEAR = 2026;

export const STATUS = {
  law: { label: 'Law', cls: 'law' },
  proposed: { label: 'Proposed — not yet enacted', cls: 'proposed' },
  guidance: { label: 'CRA guidance', cls: 'guidance' },
  historical: { label: 'Historical', cls: 'historical' },
};

const r = (id, o) => ({ id, jurisdiction: 'Canada (federal)', taxYear: 2026, status: 'guidance', confidence: 'high', verified: VERIFIED, source: 'CRA', ...o });

export const RULES = [
  // ---- the basics ----------------------------------------------------------
  r('deduction-basics', {
    title: 'A deduction lowers taxable income, not tax dollar-for-dollar',
    summary: 'A business expense reduces net business income. The tax saved is the expense multiplied by your marginal rate, so a $1,000 deductible expense is not a $1,000 refund. You are still out the money you spent.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('expense-test', {
    title: 'What counts as a business expense',
    summary: 'You can deduct a reasonable current expense you paid or will have to pay to earn business income. Personal expenses cannot be deducted. For something used both ways, only the business part can be claimed. If you claim a GST/HST input tax credit on an expense, the expense is reduced by that credit.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('capital-vs-current', {
    title: 'Current expense or capital property',
    summary: 'Something with a lasting benefit (equipment, furniture, a vehicle) is capital property. Its cost is not deducted in one go as an expense; it is claimed over time as capital cost allowance (CCA). CRA lists calculators, filing cabinets, chairs and desks as capital items, not office expenses.',
    url: `${BIZ}/business-expenses.html`,
  }),

  // ---- vehicles -------------------------------------------------------------
  r('vehicle-records', {
    title: 'Vehicle logbook',
    summary: 'For each business trip record the date, destination, purpose and kilometres driven. Record the odometer reading of each vehicle at the start and end of the fiscal period. If you change vehicles, record the dates and the odometer readings when you buy, sell or trade.',
    url: `${BIZ}/business-expenses/motor-vehicle-expenses/motor-vehicle-records.html`,
  }),
  r('vehicle-simplified-log', {
    title: 'Simplified logbook',
    summary: 'After one full 12-month logbook (the base year), a three-month sample logbook can be used in later years if business use stays within 10 percentage points of the base year. Keep the base-year logbook for six years after the last year it is used.',
    url: `${BIZ}/business-expenses/motor-vehicle-expenses/motor-vehicle-records.html`,
  }),
  r('vehicle-expenses', {
    title: 'Deductible motor vehicle expenses',
    summary: 'Licence and registration fees, fuel and oil, electricity for zero-emission vehicles, insurance, interest on money borrowed to buy the vehicle, maintenance and repairs, and leasing costs. When the vehicle is used for both business and personal driving, these are claimed in proportion to business kilometres.',
    url: `${BIZ}/business-expenses/motor-vehicle-expenses/deductible-expenses.html`,
  }),
  r('vehicle-parking', {
    title: 'Business parking and supplementary business insurance',
    summary: 'Form T2125 Chart A adds business parking fees and supplementary business insurance after the business-use proration, so they are not reduced by the business-use percentage. Parking at your regular place of work, and parking on personal trips, is not business parking.',
    url: `${CRA}/forms-publications/publications/t4002.html`,
    source: 'CRA guide T4002 / form T2125 Chart A',
    confidence: 'medium',
    note: 'Taken from the layout of T2125 Chart A; the CRA web page checked on this date does not spell it out.',
  }),
  r('vehicle-limits-2026', {
    title: '2026 automobile deduction limits',
    summary: 'Class 10.1 passenger-vehicle CCA ceiling: $39,000 before tax (up from $38,000) for vehicles acquired on or after January 1, 2026. Zero-emission passenger vehicles (Class 54): $61,000. Deductible lease cost: $1,100 a month before tax. Deductible loan interest: $350 a month for new automobile loans.',
    source: 'Department of Finance Canada', status: 'law',
    url: `${FIN}/news/2026/01/government-announces-the-2026-automobile-deduction-limits-and-expense-benefit-rates-for-businesses.html`,
    change: { type: 'CHANGED', date: '2026-01-14', note: 'Passenger-vehicle CCA ceiling raised to $39,000 for 2026. Lease and interest limits unchanged.' },
  }),

  // ---- home -----------------------------------------------------------------
  r('home-conditions', {
    title: 'Business-use-of-home: who can claim',
    summary: 'You can deduct home expenses only if the work space is your principal place of business, OR you use the space only to earn business income and use it on a regular and ongoing basis to meet clients, customers or patients. One of the two is enough.',
    url: `${BIZ}/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html`,
  }),
  r('home-calculation', {
    title: 'Business-use-of-home: how much',
    summary: 'Use a reasonable basis, such as work-space area divided by total home area. If the space is also used personally, reduce it by the hours used for business out of 24. Eligible costs include heat, electricity, home insurance, cleaning materials, property taxes, mortgage interest and rent. Mortgage principal is never an expense.',
    url: `${BIZ}/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html`,
  }),
  r('home-limit', {
    title: 'Business-use-of-home cannot create a loss',
    summary: 'The deduction cannot be more than net business income before it. It cannot create or increase a loss. The unused part can be carried forward to a later year in which you still meet the conditions.',
    url: `${BIZ}/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html`,
  }),
  r('home-cca', {
    title: 'Claiming CCA on your home',
    summary: 'CCA can be claimed on the business part of a home you own, but doing so can cause recapture and affect the principal residence exemption when you sell. The app never claims it; ask your accountant.',
    url: `${BIZ}/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html`,
    confidence: 'medium',
  }),

  // ---- meals, travel, other categories ----------------------------------------
  r('meals-50', {
    title: 'Meals and entertainment: 50% limit',
    summary: 'The most you can deduct is 50% of the lesser of the amount paid and an amount that is reasonable. This also applies to meals while travelling and at conventions. Narrow exceptions allow 100% (for example up to six staff events a year open to all employees); long-haul truck drivers get 80%.',
    url: `${BIZ}/business-expenses.html`, status: 'law',
  }),
  r('travel', {
    title: 'Travel',
    summary: 'Travel expenses to earn business income are deductible: public transportation fares, hotel accommodation and meals. Meals on the trip fall under the 50% limit. The personal part of a trip is not deductible.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('advertising', {
    title: 'Advertising',
    summary: 'Advertising in Canadian newspapers, television and radio is deductible. Advertising directed mainly at a Canadian market through a foreign broadcaster is not deductible. Periodical advertising is 100% deductible when at least 80% of the editorial content is original, otherwise 50%. CRA says these restrictions do not apply to advertising on foreign websites.',
    url: `${BIZ}/business-expenses.html`,
    confidence: 'medium',
    note: 'The foreign-website point comes from CRA guidance on internet advertising, not from the page fetched on this date.',
  }),
  r('dues', {
    title: 'Licences, dues and memberships',
    summary: 'Annual licence fees, business taxes and dues to a trade or commercial association are deductible. Club dues (including initiation fees) are not deductible if the main purpose of the club is dining, recreation or sport.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('insurance', {
    title: 'Insurance',
    summary: 'Ordinary commercial insurance premiums on buildings, machinery and equipment used in the business are deductible. Life insurance premiums generally are not. Vehicle insurance is claimed with motor vehicle expenses; home insurance with business-use-of-home.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('interest-bank', {
    title: 'Interest and bank charges',
    summary: 'Interest on money borrowed to run the business is deductible, as are business bank and payment-processing charges. Interest on personal borrowing and on overdue income tax is not. A penalty for paying a loan off early is treated as prepaid interest and deducted over the remaining original term. Fees to arrange financing are deducted 20% a year over five years.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('professional-fees', {
    title: 'Legal, accounting and professional fees',
    summary: 'Fees for outside professional advice, bookkeeping and preparing tax returns for the business are deductible. Fees to buy capital property are added to the cost of that property instead.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('office', {
    title: 'Office expenses and supplies',
    summary: 'Small items such as pens, pencils, paper clips, stationery and stamps are office expenses. Calculators, filing cabinets, chairs and desks are capital items.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('phone-utilities', {
    title: 'Telephone and utilities',
    summary: 'Telephone and utility costs are deductible when incurred to earn income. CRA guidance: the basic monthly rate of a home telephone is not deductible, but business long-distance calls are. Cell phone and internet costs are claimed for the part that reasonably relates to earning business income. Utilities for a home work space go under business-use-of-home.',
    url: `${BIZ}/business-expenses.html`,
    confidence: 'medium',
    note: 'The home-telephone point is from guide T4002.',
  }),
  r('salaries-family', {
    title: 'Paying a family member',
    summary: 'A salary paid to your child or spouse is deductible only if you actually pay it, the work is necessary for earning business income, and the amount is reasonable for the work and what you would pay someone else. You must keep documents and make payroll deductions where required.',
    url: `${BIZ}/business-expenses.html`,
  }),
  r('conventions', {
    title: 'Conventions',
    summary: 'You can deduct the cost of going to up to two conventions a year that relate to your business. If the fee includes meals without a breakdown, $50 a day is treated as meals and falls under the 50% limit.',
    url: `${CRA}/forms-publications/publications/t4002.html`, source: 'CRA guide T4002',
    confidence: 'medium', note: 'From guide T4002; not shown on the web page fetched on this date.',
  }),
  r('clothing', {
    title: 'Clothing',
    summary: 'Ordinary clothing is a personal expense even when you buy it for work. CRA lists no general clothing deduction for self-employed people. Protective equipment required for the work may be treated differently; confirm with a tax professional.',
    url: `${BIZ}/business-expenses.html`, confidence: 'medium',
    note: 'CRA\'s business-expenses pages do not address clothing directly; this reflects the general rule that personal expenses are not deductible.',
  }),

  // ---- CCA ------------------------------------------------------------------
  r('cca-basics', {
    title: 'Capital cost allowance (CCA)',
    summary: 'CCA is the yearly deduction for depreciable property. Property is grouped in classes, each with a rate applied to the undepreciated capital cost (UCC), the balance left after earlier claims. You may claim any amount from zero to the maximum. Only the business-use share of CCA is deductible when the property is also used personally.',
    url: `${BIZ}/report-business-income-expenses/claiming-capital-cost-allowance.html`, status: 'law',
  }),
  r('cca-classes', {
    title: 'Common CCA classes',
    summary: 'Class 8 (20%): furniture and equipment not in another class. Class 10 (30%): motor vehicles and some passenger vehicles. Class 10.1 (30%): passenger vehicles costing more than the yearly limit. Class 12 (100%): tools costing under $500, application software. Class 50 (55%): computers and systems software. Class 46 (30%): data network infrastructure. Class 54 (30%): zero-emission passenger vehicles. Class 14.1 (5%): goodwill and similar intangibles.',
    url: `${BIZ}/report-business-income-expenses/claiming-capital-cost-allowance/classes.html`, status: 'law',
  }),
  r('cca-half-year', {
    title: 'First-year CCA: half-year rule and incentives',
    summary: 'Normally only half of a net addition counts for CCA in the year the property becomes available for use. The Accelerated Investment Incentive suspends the half-year rule and enhances the first-year claim for eligible property acquired after November 20, 2018 and available for use before 2028; it was being phased down for 2024 to 2027. Budget 2025 proposed reinstating the full incentive and immediate expensing for some classes (including computers). The app uses the half-year rule unless you choose otherwise.',
    url: `${BIZ}/report-business-income-expenses/claiming-capital-cost-allowance/accelerated-investment-incentive.html`,
    confidence: 'medium',
    note: 'CRA\'s incentive page was last modified 2025-07-21 and does not yet reflect Budget 2025. Which first-year rule applies to a 2026 purchase should be confirmed with a tax professional.',
  }),
  r('cca-disposal', {
    title: 'Selling or scrapping depreciable property',
    summary: 'On a disposition the class balance is reduced by the lesser of the sale proceeds and the original capital cost. A negative balance at year-end is recapture, which is income. A positive balance with no property left in the class is a terminal loss, which is deductible. Neither applies to Class 10.1 vehicles, which have their own rule.',
    url: `${BIZ}/report-business-income-expenses/claiming-capital-cost-allowance.html`, status: 'law', confidence: 'medium',
  }),
  r('mega-deduction', {
    title: 'Productivity Mega Deduction',
    status: 'proposed', source: 'Department of Finance Canada', confidence: 'medium',
    summary: 'Announced September 15, 2026 with draft legislation. It would allow 100% of the cost of most depreciable property acquired on or after September 15, 2026 to be deducted in the year it becomes available for use, permanently. Excluded: buildings in Classes 1 and 3, Classes 14 and 14.1 (franchises, licences, goodwill), Class 51, certain vehicles in Classes 10 and 10.1, and property under Schedules V and VI. Used property qualifies only if neither you nor a non-arm\'s-length person owned it before and it was not acquired on a tax-deferred rollover. Individuals and partnerships of individuals could not use it to create or increase a loss. It changes when the cost is deducted, not how much in total.',
    url: `${FIN}/news/2026/09/government-of-canada-introduces-new-productivity-mega-deduction-to-boost-canadas-advantage-as-the-most-competitive-g7-country-for-new-business-inve.html`,
    links: { 'Draft legislative proposals': `${FIN}/corporate/laws-regulations/draft-legislation/2026/09-itaitr-lirrir.html` },
    note: 'Not law. Draft legislation can change before it is passed, and may not pass. The draft appears to exclude Class 10 and 10.1 passenger vehicles that are used or were assembled outside Canada; read the draft or ask a tax professional before relying on the vehicle rules. Property acquired before September 15, 2026 stays under the existing first-year rules.',
    change: { type: 'PROPOSED', date: '2026-09-15', note: 'Draft legislation released. Would allow 100% first-year CCA for most depreciable property acquired on or after September 15, 2026. Not enacted.' },
  }),
  r('immediate-expensing-2021', {
    title: 'Temporary immediate expensing for small businesses (2021 measure)',
    status: 'historical', source: 'Department of Finance Canada',
    summary: 'Allowed up to $1.5 million a year of eligible property to be fully expensed. For individuals and Canadian partnerships it applied to property that became available for use before 2025, so it does not apply to 2026 purchases.',
    url: `${BIZ}/report-business-income-expenses/claiming-capital-cost-allowance.html`, confidence: 'medium',
    change: { type: 'EXPIRED', date: '2024-12-31', note: 'No longer available to individuals for property that became available for use after 2024.' },
  }),

  // ---- GST/HST --------------------------------------------------------------
  r('gst-small-supplier', {
    title: 'GST/HST: when you must register',
    summary: 'You are a small supplier, and registration is optional, while your worldwide taxable supplies are $30,000 or less over four consecutive calendar quarters and in any single quarter. Go over $30,000 in one quarter and you must charge GST/HST from the sale that put you over. Go over across four quarters and you stop being a small supplier at the end of the month after that quarter, and must register within 29 days. You can register voluntarily.',
    url: `${CRA}/tax/businesses/topics/gst-hst-businesses/when-register-charge.html`, status: 'law',
    note: 'Zero-rated supplies (which can include some services supplied to non-residents) still count toward the $30,000. Whether your commissions from a U.S. company are zero-rated depends on the facts; ask a tax professional.',
  }),
  r('gst-rates', {
    title: 'GST/HST rates by province',
    summary: 'Alberta, British Columbia, Manitoba, Saskatchewan, Quebec and the territories: 5% GST. Ontario: 13% HST. New Brunswick, Newfoundland and Labrador, Prince Edward Island: 15% HST. Nova Scotia: 14% HST. Alberta has no provincial sales tax.',
    url: `${CRA}/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html`, status: 'law', confidence: 'medium',
    note: 'Rates are from CRA\'s rate table as known when this file was written; the rate page was not re-fetched on the verified date.',
  }),
  r('gst-itc', {
    title: 'GST/HST: input tax credits',
    summary: 'A registrant can claim back the GST/HST paid on purchases used in commercial activities. No credit for personal purchases or club dues for recreation, dining or sport. Meals and entertainment credits are limited to the allowable part. Receipts must show the supplier and date (under $100), plus the tax and the supplier\'s registration number ($100 to $499.99), plus your name, a description and terms ($500 and over). Most registrants have four years to claim.',
    url: `${CRA}/tax/businesses/topics/gst-hst-businesses/complete-file-input-tax-credit.html`, status: 'law',
  }),

  // ---- deadlines and payments -------------------------------------------------
  r('filing-deadline', {
    title: 'Filing and payment deadlines for the self-employed',
    summary: 'If you or your spouse or common-law partner carried on a business, your return is due June 15 of the following year, but any balance owing is still due April 30. For the 2025 tax year CRA lists June 15, 2026 and April 30, 2026. The same rule gives June 15, 2027 and April 30, 2027 for the 2026 tax year.',
    url: `${CRA}/tax/individuals/topics/important-dates-individuals.html`, status: 'law',
    note: 'CRA had not yet published its dated page for the 2026 tax year when this was checked. A deadline that falls on a weekend or holiday moves to the next business day.',
  }),
  r('instalments', {
    title: 'Quarterly tax instalments',
    summary: 'You may have to pay instalments if your net tax owing is more than $3,000 ($1,800 in Quebec) in the current year and in either of the two previous years. Due dates are March 15, June 15, September 15 and December 15. Late or short instalments attract interest. CRA sends instalment reminders when it thinks they apply.',
    url: `${CRA}/payments/payments-cra/individual-payments/income-tax-instalments.html`, status: 'law',
  }),
  r('records-retention', {
    title: 'How long to keep records',
    summary: 'Keep records and supporting documents for six years from the end of the last tax year they relate to. Records for long-term property should be kept until six years after you dispose of it. You need written CRA permission (form T137) to destroy records earlier.',
    url: `${CRA}/tax/businesses/topics/keeping-records/where-keep-your-records-long-request-permission-destroy-them-early.html`, status: 'law',
  }),
  r('records-receipts', {
    title: 'Receipts and electronic records',
    summary: 'Keep the original receipt or invoice for each expense. CRA accepts electronic images of paper documents when they are accurate, complete and readable. A credit card statement alone usually does not show what was bought. This app keeps photos on your device only; it is not a certified records system, so keep the originals too.',
    url: `${CRA}/tax/businesses/topics/keeping-records.html`, confidence: 'medium',
  }),

  // ---- personal tax context -------------------------------------------------
  r('rates-2026', {
    title: '2026 federal and Alberta income tax brackets',
    summary: 'Federal: 14% up to $58,523; 20.5% to $117,045; 26% to $181,440; 29% to $258,482; 33% above. Alberta: 8% up to $61,200; 10% to $154,259; 12% to $185,111; 13% to $246,813; 14% to $370,220; 15% above. Rates apply only to the income inside each bracket.',
    url: `${CRA}/tax/individuals/tax-rates-brackets/current-year.html`, status: 'law', jurisdiction: 'Canada and Alberta',
    change: { type: 'CHANGED', date: '2026-01-01', note: 'Lowest federal rate is 14% for 2026 (15% before July 2025). Alberta has an 8% bracket on the first $61,200. Older examples using 15% and a $47,630 first bracket are out of date.' },
  }),
  r('cpp-self-employed', {
    title: 'CPP on self-employment income',
    summary: 'Self-employed people pay both the employee and employer halves: 11.9% on net earnings between $3,500 and $74,600 for 2026, plus 8% on earnings between $74,600 and $85,000 (CPP2). Half is deductible and part earns a credit. This is why business income is not simply "taxed less" than employment income.',
    url: `${CRA}/tax/businesses/topics/payroll/payroll-deductions-contributions/canada-pension-plan-cpp/cpp-contribution-rates-maximums-exemptions.html`, status: 'law',
    verified: '2026-10-01',
  }),
  r('rrsp', {
    title: 'RRSP',
    summary: 'Contributions are deductible. Your limit is 18% of the previous year\'s earned income up to the yearly dollar limit ($33,810 for 2026; $35,390 for 2027), plus unused room, less any pension adjustment. Contributions in the first 60 days of a year can be deducted for the previous year, so the 2026 deadline is March 1, 2027. Withdrawals are taxable. Your actual room is on your CRA notice of assessment.',
    url: `${CRA}/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html`, status: 'law',
  }),
  r('tfsa', {
    title: 'TFSA',
    summary: 'The 2026 TFSA dollar limit is $7,000. Contributions are not deductible; growth and withdrawals are not taxed. Unused room carries forward.',
    url: `${CRA}/tax/registered-plans-administrators/pspa/mp-rrsp-dpsp-tfsa-limits-ympe.html`, status: 'law',
  }),
  r('fhsa', {
    title: 'FHSA',
    summary: 'First home savings account: $8,000 of participation room in the year you open your first one, a $40,000 lifetime limit, and unused room carries forward. Contributions are deductible and qualifying withdrawals to buy a first home are not taxed. The contribution deadline is December 31; there is no 60-day grace period like the RRSP.',
    url: `${CRA}/tax/individuals/topics/first-home-savings-account/contributing-your-fhsa.html`, status: 'law',
  }),
  r('capital-gains', {
    title: 'Capital gains inclusion rate',
    summary: 'One-half of a capital gain is taxable. The increase to two-thirds on gains over $250,000 that was proposed in Budget 2024 was cancelled and never became law. Any source saying 66.7% is describing a proposal that did not happen.',
    source: 'Department of Finance Canada / CRA', status: 'law',
    url: 'https://www.canada.ca/en/revenue-agency/news/newsroom/tax-tips/tax-tips-2025/update-cra-administration-proposed-capital-gains-taxation-changes.html',
    change: { type: 'EXPIRED', date: '2025-03-21', note: 'The proposed increase in the capital gains inclusion rate was cancelled. The rate remains one-half.' },
  }),
  r('sole-prop-vs-corp', {
    title: 'Sole proprietor or corporation',
    summary: 'A sole proprietor reports business income on form T2125 with the personal return and pays personal tax and both halves of CPP on it. A corporation is a separate taxpayer that files its own return, can leave income inside the company, and costs more to run. Which is better depends on income, how much you need to take out, and liability; it is a decision for you and an accountant.',
    url: `${CRA}/tax/businesses/topics/sole-proprietorships-partnerships.html`, confidence: 'medium',
  }),
  r('t2125', {
    title: 'Form T2125',
    summary: 'Self-employed people report business income and expenses on form T2125, Statement of Business or Professional Activities, filed with the personal return. Motor vehicle expenses go in Chart A, CCA in Area A, and business-use-of-home in Part 7.',
    url: `${CRA}/forms-publications/forms/t2125.html`,
  }),
  r('home-pct-myth', {
    title: '"You can claim 20 to 25% of your home without raising eyebrows"',
    status: 'historical', source: 'CRA', confidence: 'high',
    summary: 'There is no safe percentage. CRA asks for a reasonable basis such as the actual work-space area over the total home area, reduced for personal use of the space, and only if you meet the conditions. A percentage picked because it seems unlikely to be questioned is not a basis.',
    url: `${BIZ}/report-business-income-expenses/completing-form-t2125/business-use-home-expenses.html`,
  }),
];

const BY_ID = Object.fromEntries(RULES.map(x => [x.id, x]));
export const rule = id => BY_ID[id] || null;

// ---- numbers the calculations use ------------------------------------------
// Keep every figure next to the rule it belongs to (the `rule` id), so a number
// can never be shown without its source.

export const VALUES = {
  mealsPct: { value: 50, rule: 'meals-50' },
  retentionYears: { value: 6, rule: 'records-retention' },
  instalmentThreshold: { value: 3000, rule: 'instalments' },
  instalmentDates: { value: ['03-15', '06-15', '09-15', '12-15'], rule: 'instalments' },
  gstThreshold: { value: 30000, rule: 'gst-small-supplier' },
  // Rate of GST or HST charged in each province (percent).
  gstRate: { value: { AB: 5, BC: 5, MB: 5, SK: 5, QC: 5, NT: 5, NU: 5, YT: 5, ON: 13, NB: 15, NL: 15, PE: 15, NS: 14 }, rule: 'gst-rates' },
  // By year the vehicle was acquired / lease or loan started. Before tax.
  vehicle: {
    rule: 'vehicle-limits-2026',
    passengerCcaLimit: { 2024: 37000, 2025: 38000, 2026: 39000 },
    zevCcaLimit: { 2023: 61000, 2024: 61000, 2025: 61000, 2026: 61000 },
    leasePerMonth: { 2024: 1050, 2025: 1100, 2026: 1100 },
    interestPerMonth: { 2024: 350, 2025: 350, 2026: 350 },
  },
  registered: {
    rrsp: { limit: { 2025: 32490, 2026: 33810, 2027: 35390 }, pctOfEarned: 18, rule: 'rrsp' },
    tfsa: { limit: { 2025: 7000, 2026: 7000 }, rule: 'tfsa' },
    fhsa: { annual: 8000, lifetime: 40000, rule: 'fhsa' },
  },
  toolsClass12Under: { value: 500, rule: 'cca-classes' },
};

// Latest known figure at or before `year`; `assumed` when the year itself is missing.
export function yearValue(table, year) {
  if (table[year] != null) return { value: table[year], year, assumed: false };
  const known = Object.keys(table).map(Number).sort((a, b) => a - b);
  const used = known.filter(y => y <= year).pop() || known[0];
  return { value: table[used], year: used, assumed: true };
}

// Deadlines for one tax year, derived from the standing rules. Dates that land
// on a weekend move to the next Monday (statutory holidays are not modelled).
const nextBusinessDay = iso => {
  const d = new Date(`${iso}T12:00:00`);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
export function deadlines(taxYear) {
  const y1 = taxYear + 1;
  const leap = (y1 % 4 === 0 && y1 % 100 !== 0) || y1 % 400 === 0;
  return [
    ...VALUES.instalmentDates.value.map((md, i) => ({ key: `inst-${i + 1}`, date: nextBusinessDay(`${taxYear}-${md}`), title: `Tax instalment ${i + 1} of 4 for ${taxYear}`, detail: 'Only if CRA has asked you to pay instalments, or your net tax owing is over $3,000 this year and in 2025 or 2024.', rule: 'instalments', conditional: 'instalments' })),
    { key: 'fhsa', date: `${taxYear}-12-31`, title: `FHSA contribution deadline for ${taxYear}`, detail: 'No 60-day grace period.', rule: 'fhsa', conditional: 'optional' },
    { key: 'odo-end', date: `${taxYear}-12-31`, title: `Record each vehicle's year-end odometer`, detail: 'CRA expects the reading at the start and end of the fiscal period.', rule: 'vehicle-records' },
    { key: 'rrsp', date: nextBusinessDay(leap ? `${y1}-02-29` : `${y1}-03-01`), title: `RRSP contribution deadline for ${taxYear}`, detail: '60 days after year-end.', rule: 'rrsp', conditional: 'optional' },
    { key: 'pay', date: nextBusinessDay(`${y1}-04-30`), title: `Balance owing for ${taxYear} is due`, detail: 'Interest starts after this date even though self-employed returns are not due until June 15.', rule: 'filing-deadline' },
    { key: 'file', date: nextBusinessDay(`${y1}-06-15`), title: `${taxYear} return due (self-employed)`, detail: 'Applies to you and your spouse or common-law partner.', rule: 'filing-deadline' },
  ];
}

// ---- small rendering helpers (shared by every screen that cites a rule) -----

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const escHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const verifiedLabel = iso => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}, ${iso.slice(0, 4)}`;

export const statusBadge = status => `<span class="badge ${STATUS[status].cls}">${escHtml(status === 'proposed' ? 'PROPOSED / NOT YET ENACTED' : STATUS[status].label)}</span>`;

// One line: "CRA · verified Oct 4, 2026 · tax year 2026 · [Law]" with a link to the source.
export function cite(id) {
  const x = rule(id);
  if (!x) return '';
  return `<p class="cite">${statusBadge(x.status)} <a href="${x.url}" target="_blank" rel="noopener">${escHtml(x.source)}</a> &middot; verified ${verifiedLabel(x.verified)} &middot; tax year ${x.taxYear} &middot; confidence ${x.confidence}</p>`;
}

// Rules that are new, changed, proposed or expired - newest first.
export const updates = () => RULES.filter(x => x.change).sort((a, b) => b.change.date.localeCompare(a.change.date));
