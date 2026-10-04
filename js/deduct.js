// "Can I deduct this?" - a guided check, not a verdict.
//
// Each topic asks the facts the answer depends on, then returns a status, an
// estimate of the potentially deductible amount, what to keep, the limits that
// apply and the rule it is based on. Rule text and sources come from rules.js;
// nothing here states a tax rule that is not in that database.
//
// The engine is separate from the screen: evaluate(topic, answers) is pure.

import { state } from './store.js';
import { kmSummary } from './calc.js';
import { rule, cite, VALUES, yearValue } from './rules.js';
import { head } from './views.js';
import { expenseForm } from './forms.js';
import { $, $$, esc, money, num } from './util.js';

export const STATUSES = {
  green: 'Likely deductible',
  yellow: 'Potentially deductible — additional facts required',
  orange: 'Special rules apply',
  red: 'Generally not deductible',
  gray: 'Unable to determine — verify with a tax professional',
};

const yn = [['yes', 'Yes'], ['no', 'No']];
const clamp = v => Math.min(100, Math.max(0, Number(v) || 0));
const KEEP = ['Receipt or invoice', 'Date, vendor and amount', 'A note of the business purpose'];

// ---- questions shared by most topics ---------------------------------------

const Q = {
  earn: { id: 'earn', text: 'Was this paid to earn income for your business?', options: [['yes', 'Yes, only for business'], ['partly', 'Partly — it is also personal'], ['no', 'No, it was personal'], ['unsure', 'Not sure']] },
  pct: { id: 'pct', text: 'About what percentage is business use?', type: 'pct', showIf: a => a.earn === 'partly', hint: 'Use a figure you could explain and support, not a guess that feels safe.' },
  amount: { id: 'amount', text: 'How much was it?', type: 'money', optional: true, hint: 'Optional. Leave blank to skip the estimate.' },
  receipt: { id: 'receipt', text: 'Do you have the receipt or invoice?', options: yn },
};
const STD = [Q.earn, Q.pct, Q.amount, Q.receipt];

const bizPct = a => (a.earn === 'partly' ? clamp(a.pct) : 100);
function amounts(a, limitPct = 100, pct = bizPct(a)) {
  if (!(a.amount > 0)) return null;
  const business = a.amount * pct / 100;
  return { total: a.amount, pct, business, limitPct, deductible: business * limitPct / 100 };
}

// Applied to every result: no receipt, mixed use, and the standing reminders.
function finish(a, res) {
  res.limits = res.limits || [];
  res.docs = res.docs || KEEP;
  if (a.receipt === 'no' && res.status !== 'red') {
    res.limits.push('You said you have no receipt. Without a receipt or invoice the expense may be disallowed if CRA asks for support. Ask the vendor for a copy; never recreate one yourself.');
    if (res.status === 'green') res.status = 'yellow';
  }
  if (a.earn === 'partly' && res.status === 'green') res.status = 'yellow';
  if (a.earn === 'partly') res.limits.push(`Only the business share (${bizPct(a)}%) can be considered. The personal share is never a business expense.`);
  return res;
}

const personal = what => ({ status: 'red', why: [`You said this was personal. Personal ${what} are not business expenses and should not be claimed, even if paid from a business account. Record it as Personal if you want it in your books; it will never be counted.`], rules: ['expense-test'], docs: [] });
const unsure = () => ({ status: 'gray', why: ['The answer depends on whether the cost was incurred to earn business income, and that is not established. The test is the purpose of the spending, not who the vendor was. If you cannot say how it helped you earn income, treat it as personal, or record it with "Needs review" ticked and ask a tax professional.'], rules: ['expense-test'], docs: KEEP });

// A plain current expense: deductible in the year, in full when purely business.
const current = (line, ruleId, extra = {}) => ({
  questions: STD,
  evaluate: a => ({ status: 'green', why: [rule(ruleId).summary], amounts: amounts(a), line, rules: [ruleId, 'expense-test'], ...extra }),
});

// ---- topics ----------------------------------------------------------------
// name, keywords, record: [group, category] used by "Record this expense".

const veh = () => kmSummary(state.settings.year);
const vehicleRunning = {
  questions: [
    { id: 'earn', text: 'Is the vehicle used to earn business income (visiting customers, installs, prospecting)?', options: [['yes', 'Yes'], ['no', 'No, personal driving only'], ['unsure', 'Not sure']] },
    { id: 'personalToo', text: 'Is the same vehicle also driven for personal trips or commuting?', options: yn },
    { id: 'log', text: 'Do you keep a log of business trips (date, destination, purpose, km) and the odometer at the start and end of the year?', options: [['yes', 'Yes'], ['some', 'Some of it'], ['no', 'No']] },
    Q.amount, Q.receipt,
  ],
  evaluate(a) {
    const k = veh();
    const hasLog = k.bizTrips > 0 && k.total > 0;
    const pct = a.personalToo === 'no' ? 100 : hasLog ? Math.round(k.pct * 1000) / 10 : null;
    const res = {
      status: 'orange', line: 'T2125 Chart A — motor vehicle expenses', rules: ['vehicle-expenses', 'vehicle-records'],
      why: ['Running costs are claimed in proportion to business kilometres: business km ÷ total km for the year.', a.personalToo === 'no' ? 'You said the vehicle is never driven personally. CRA will expect a logbook that shows it, and driving between home and a regular workplace is personal.' : hasLog ? `Your mileage log for ${state.settings.year} currently shows ${pct}% business use (${num(k.business)} of ${num(k.total)} km)${k.totalIsWeak ? ', based on logged trips only because the year\'s odometer readings are missing, so it is probably too high' : ''}.` : 'There is no business-use percentage yet because no trips or odometer readings are recorded in the app for this year.'],
      docs: ['Receipt', 'Mileage log: date, destination, purpose, km for each business trip', 'Odometer reading at the start and end of the year'],
      limits: [], amounts: pct == null ? null : amounts(a, 100, pct),
      actions: [{ label: 'Open mileage log', href: '#/trips' }],
    };
    if (a.log !== 'yes') { res.status = 'yellow'; res.limits.push('Without a logbook the business-use percentage is an estimate CRA can reduce or deny. Start logging now; do not reconstruct trips you cannot support.'); }
    return res;
  },
};

const capital = (suggest, cls) => ({
  questions: [Q.earn, Q.pct, { ...Q.amount, text: 'What did it cost, before tax?' }, Q.receipt],
  evaluate(a) {
    const small = a.amount > 0 && a.amount < VALUES.toolsClass12Under.value && cls === '12';
    const rates = { 8: 20, 50: 55, 12: 100 };
    const first = a.amount > 0 ? a.amount * rates[cls] / 100 * (cls === '12' && small ? 1 : 0.5) * bizPct(a) / 100 : null;
    return {
      status: 'orange', line: 'T2125 Area A — capital cost allowance (line 9936)', rules: ['capital-vs-current', 'cca-classes', 'cca-half-year', 'mega-deduction'],
      why: [`${suggest} lasts beyond the year, so it is normally capital property rather than an expense. The cost is claimed over time as capital cost allowance (CCA), not all at once.`,
        `Suggested CCA classification: Class ${cls} (${rates[cls]}%). ${cls === '12' ? 'Tools costing under $500 each can go in Class 12; a tool costing $500 or more is usually Class 8 (20%).' : 'This is a suggestion from CRA\'s class descriptions; you can override it after reviewing.'}`],
      amounts: a.amount > 0 ? { total: a.amount, pct: bizPct(a), business: a.amount * bizPct(a) / 100, deductible: first, deductibleLabel: `Estimated first-year CCA${cls === '12' && small ? '' : ' (half-year rule)'}`, note: 'The rest stays in the class balance (UCC) and is claimed in later years.' } : null,
      limits: ['PROPOSED, NOT YET ENACTED: the Productivity Mega Deduction would allow 100% in the first year for most equipment acquired on or after September 15, 2026. It is draft legislation, individuals could not use it to create a loss, and it only changes timing. Do not time a purchase around it without professional advice.', 'A low-cost accessory may be treated as a supply; CRA sets no general dollar cut-off.'],
      docs: ['Receipt or invoice', 'Purchase date and the date you started using it', 'Description / model / serial number', 'How you worked out the business-use %'],
      actions: [{ label: 'Record under Assets & equipment', href: '#/equipment' }],
    };
  },
});

const homeFlow = what => ({
  questions: [
    { id: 'principal', text: 'Is your home work space your principal place of business (where you mainly do the work of the business)?', options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] },
    { id: 'clients', text: 'If not: do you use the space ONLY for business, and regularly meet clients or customers there?', options: yn, showIf: a => a.principal !== 'yes' },
  ],
  evaluate(a) {
    const ok = a.principal === 'yes' || a.clients === 'yes';
    if (!ok && a.principal === 'unsure' && a.clients !== 'no') return { status: 'gray', why: ['Eligibility turns on whether the space is your principal place of business. For someone who mostly works on the road, that depends on where the administrative and sales work is actually done. Ask a tax professional.'], rules: ['home-conditions'] };
    if (!ok) return { status: 'red', why: [`${what} for your home is a personal cost unless the work space meets one of CRA's two conditions, and on your answers it meets neither.`], rules: ['home-conditions'] };
    return {
      status: 'orange', line: 'T2125 Part 7 — business-use-of-home (line 9945)', rules: ['home-conditions', 'home-calculation', 'home-limit'],
      why: [`${what} can be included in business-use-of-home expenses, but only for the work-space share, and less again if the space is also used personally.`, 'It is not "10% of the house = 10% of everything": the claim is capped at your net business income before it, and the unused part carries forward.'],
      limits: [what.startsWith('Mortgage') ? 'Only the interest. Mortgage principal is never an expense.' : '', 'Claiming CCA on a home you own can affect the principal residence exemption; the app never does it.'].filter(Boolean),
      docs: ['The bills (rent, utilities, insurance, property tax, mortgage statement)', 'Work-space and total home area', 'How the space is used and by whom'],
      actions: [{ label: 'Open the home office calculator', href: '#/homeoffice' }],
    };
  },
});

const TOPICS = [
  // Vehicle
  { id: 'fuel', name: 'Gas / fuel', keys: 'gasoline diesel petrol fill charging electricity ev', record: ['vehicle', 'Fuel'], ...vehicleRunning },
  { id: 'repair', name: 'Vehicle repairs & maintenance', keys: 'truck repair mechanic brakes oil change tires tune service car wash', record: ['vehicle', 'Repairs'], ...vehicleRunning },
  { id: 'vinsurance', name: 'Vehicle insurance & registration', keys: 'car insurance registration licence plate', record: ['vehicle', 'Insurance'], ...vehicleRunning },
  {
    id: 'parking', name: 'Parking & tolls', keys: 'parkade meter toll road bridge', record: ['vehicle', 'Parking'],
    questions: [{ id: 'where', text: 'What was it for?', options: [['stop', 'A business stop (customer, install, meeting)'], ['regular', 'Parking where I normally work'], ['personal', 'A personal trip']] }, Q.amount, Q.receipt],
    evaluate: a => (a.where === 'stop'
      ? { status: 'green', why: ['Parking and tolls for a business stop are claimed in full. They are not reduced by the vehicle\'s business-use percentage.'], amounts: amounts({ ...a, earn: 'yes' }), line: 'T2125 Chart A — business parking fees', rules: ['vehicle-parking'], docs: ['Receipt', 'Where you were and why'] }
      : { status: 'red', why: [a.where === 'regular' ? 'Parking at your regular place of work is a personal commuting cost.' : 'Parking and tolls on a personal trip are personal.'], rules: ['vehicle-parking'] }),
  },
  {
    id: 'mileage', name: 'Mileage / kilometres driven', keys: 'km per kilometre rate driving distance',
    questions: [{ id: 'log', text: 'Do you log each business trip with the date, destination, purpose and kilometres?', options: yn }],
    evaluate: a => ({
      status: a.log === 'yes' ? 'orange' : 'yellow', line: 'T2125 Chart A — motor vehicle expenses', rules: ['vehicle-records', 'vehicle-expenses'],
      why: ['A self-employed person does not deduct a per-kilometre rate. You deduct your actual vehicle costs multiplied by business km ÷ total km. The cents-per-km figures you may have seen are limits on allowances employers pay employees.', 'So kilometres are not an expense on their own; they are the evidence that sets your business-use percentage.'],
      limits: a.log === 'yes' ? [] : ['No log means no supportable percentage. Start one today.'],
      docs: ['Logbook: date, destination, purpose, km', 'Odometer at the start and end of the year'],
      actions: [{ label: 'Add a business trip', href: '#/trips' }],
    }),
  },
  {
    id: 'vehicle', name: 'Buying a vehicle', keys: 'truck car van suv pickup purchase new used',
    questions: [{ id: 'earn', text: 'Will the vehicle be used to earn business income?', options: [['yes', 'Yes'], ['no', 'No'], ['unsure', 'Not sure']] }, { id: 'pct', text: 'About what percentage of its kilometres will be business?', type: 'pct' }, { ...Q.amount, text: 'Price before tax?' }],
    evaluate(a) {
      const lim = yearValue(VALUES.vehicle.passengerCcaLimit, state.settings.year);
      const capped = a.amount > lim.value;
      const base = Math.min(a.amount || 0, lim.value);
      return {
        status: 'orange', line: 'T2125 Area A — CCA (Class 10 or 10.1)', rules: ['cca-basics', 'vehicle-limits-2026', 'mega-deduction'],
        why: ['A vehicle is capital property. The purchase price is never a current expense; it is claimed gradually as CCA at 30% of the declining balance, and only the business-use share is deductible.', `A passenger vehicle costing more than $${num(lim.value)} before tax (${lim.year}) goes in Class 10.1 and CCA is calculated on $${num(lim.value)}, not the price paid.${capped ? ' Your price is above that limit.' : ''}`],
        amounts: a.amount > 0 ? { total: a.amount, pct: clamp(a.pct), business: a.amount * clamp(a.pct) / 100, deductible: base * 0.30 * 0.5 * clamp(a.pct) / 100, deductibleLabel: 'Estimated first-year CCA (half-year rule)', note: 'Assumes a passenger vehicle. Trucks and vans used mainly to carry goods or equipment can be classed differently.' } : null,
        limits: ['PROPOSED, NOT YET ENACTED: the Productivity Mega Deduction excludes certain Class 10 and 10.1 vehicles. Do not assume a vehicle qualifies.', 'Selling it later can create recapture (income).', 'Buying a vehicle costs real money; the deduction returns only a fraction of it, over years.'],
        docs: ['Bill of sale', 'Proof of payment', 'Mileage log', 'Odometer at purchase and each year-end'],
        actions: [{ label: 'Assess it under Vehicle assets & CCA', href: '#/assets' }],
      };
    },
  },
  {
    id: 'vpayment', name: 'Vehicle payment (loan or lease)', keys: 'car payment financing monthly truck payment',
    questions: [{ id: 'kind', text: 'Is it a loan or a lease?', options: [['loan', 'Loan / financing'], ['lease', 'Lease']] }],
    evaluate(a) {
      const y = state.settings.year, v = VALUES.vehicle;
      return a.kind === 'loan'
        ? { status: 'orange', line: 'T2125 Chart A — interest', rules: ['vehicle-limits-2026', 'vehicle-expenses'], why: ['The payment itself is not deductible. The principal part repays the loan; the cost of the vehicle is claimed through CCA instead.', `Only the interest part counts, up to $${yearValue(v.interestPerMonth, y).value} a month for a passenger vehicle, and then only the business-use share.`], docs: ['Loan agreement', 'Annual interest statement from the lender', 'Mileage log'], actions: [{ label: 'Record loan interest', record: ['vehicle', 'Financing interest'] }] }
        : { status: 'orange', line: 'T2125 Chart A — leasing costs', rules: ['vehicle-limits-2026', 'vehicle-expenses'], why: [`Lease payments are deductible up to a limit of $${num(yearValue(v.leasePerMonth, y).value)} a month before tax for a passenger vehicle, then by business-use share. Expensive vehicles are limited further by a formula on form T2125 Chart C.`], docs: ['Lease agreement', 'Payment records', 'Mileage log'], actions: [{ label: 'Record a lease payment', record: ['vehicle', 'Lease payments'] }] };
    },
  },
  // Phone, internet
  {
    id: 'phone', name: 'Cell phone / phone bill', keys: 'mobile cellphone iphone plan data telus rogers bell',
    record: ['other', 'Phone'],
    questions: [{ id: 'what', text: 'Is this the monthly service, or buying the phone itself?', options: [['service', 'Monthly plan / bill'], ['device', 'The phone itself']] }, { id: 'earn', text: 'Is the phone used to earn business income?', options: [['yes', 'Yes, only for business'], ['partly', 'Yes, and personally too'], ['no', 'No'], ['unsure', 'Not sure']] }, Q.pct, { ...Q.amount, text: 'How much? (monthly bill, or price of the phone)' }, Q.receipt],
    evaluate(a) {
      if (a.what === 'device') return { ...capital('A phone', '8').evaluate(a), why: ['The phone itself is equipment, not part of the monthly bill. It is normally capital property claimed through CCA.', 'Suggested CCA classification: Class 8 (20%). Some treat a smartphone as computer equipment (Class 50). Review and override if your accountant says otherwise.'] };
      const am = amounts(a);
      return { status: a.earn === 'partly' ? 'yellow' : 'green', line: 'T2125 line 9220 — utilities (telephone)', rules: ['phone-utilities', 'expense-test'], why: ['The business share of a cell plan is deductible. Almost everyone also uses their phone personally, so 100% is hard to support unless you have a second line used only for business.'], amounts: am && { ...am, note: `That is ${money(am.deductible * 12)} over 12 months at this bill.` }, docs: ['Monthly bills', 'How you worked out the business-use % (for example a sample month of calls and data)'], actions: [{ label: 'Open the phone & internet calculator', href: '#/phone' }] };
    },
  },
  {
    id: 'internet', name: 'Internet', keys: 'wifi home internet shaw',
    record: ['other', 'Internet'], questions: STD,
    evaluate: a => ({ status: a.earn === 'partly' ? 'yellow' : 'green', line: 'T2125 line 9220 — utilities', rules: ['phone-utilities'], why: ['The business share of internet is deductible. Home internet is shared with the household, so choose a percentage you can explain. If you claim business-use-of-home, do not also claim the same bill there.'], amounts: amounts(a), docs: ['Monthly bills', 'How you worked out the business-use %'], actions: [{ label: 'Open the phone & internet calculator', href: '#/phone' }] }),
  },
  // Meals, travel
  {
    id: 'meals', name: 'Meals / restaurant / coffee with a client', keys: 'lunch dinner food coffee restaurant drinks alcohol entertainment tickets golf',
    record: ['other', 'Meals & entertainment'],
    questions: [
      { id: 'who', text: 'What was the meal?', options: [['client', 'With a client, customer or prospect'], ['trip', 'My own meal while travelling away for business'], ['own', 'My own everyday lunch or coffee']] },
      { id: 'purpose', text: 'Can you record who was there and what business was discussed?', options: yn, showIf: a => a.who === 'client' },
      Q.amount, Q.receipt,
    ],
    evaluate(a) {
      if (a.who === 'own') return { status: 'red', why: ['Your own everyday meals are a personal expense, even on a working day.'], rules: ['meals-50', 'expense-test'] };
      const res = { status: 'orange', line: 'T2125 line 8523 — meals and entertainment (allowable part only)', rules: ['meals-50'], why: [`At most ${VALUES.mealsPct.value}% of a reasonable amount is deductible. Alcohol is treated the same way as food. Entertainment such as event tickets has the same limit.`], amounts: amounts({ ...a, earn: 'yes' }, VALUES.mealsPct.value), docs: ['Receipt', 'Date and place', 'Names of the people and their business', 'What business was discussed'], limits: [] };
      if (a.who === 'client' && a.purpose === 'no') { res.status = 'yellow'; res.limits.push('Without a record of who attended and why, the claim is weak. Do not add a business purpose after the fact that was not real.'); }
      return res;
    },
  },
  {
    id: 'travel', name: 'Travel (flights, hotel, taxi)', keys: 'hotel airbnb accommodation flight airfare uber taxi transit trip rental car',
    record: ['other', 'Travel'],
    questions: [
      { id: 'main', text: 'What was the main reason for the trip?', options: [['business', 'Business (customer, install, training)'], ['mixed', 'Business with personal days added'], ['personal', 'Personal — but I did some business while there']] },
      { id: 'pct', text: 'About what share of the trip days were business days?', type: 'pct', showIf: a => a.main === 'mixed' },
      Q.amount, Q.receipt,
    ],
    evaluate(a) {
      if (a.main === 'personal') return { status: 'red', why: ['A personal trip does not become a business trip because you met a client during it. The travel and accommodation are personal.', 'Costs that exist only because of the business activity (for example a taxi to the client meeting) may be considered on their own.'], rules: ['travel', 'expense-test'], docs: KEEP };
      const pct = a.main === 'mixed' ? clamp(a.pct) : 100;
      return { status: a.main === 'mixed' ? 'yellow' : 'green', line: 'T2125 line 9200 — travel', rules: ['travel', 'meals-50'], why: ['Transportation and accommodation for a business trip are deductible.', a.main === 'mixed' ? 'Costs of the personal days (extra hotel nights, personal side trips) are not. The transportation there and back needs a reasonable split.' : 'Meals on the trip are recorded separately and fall under the 50% limit.'], amounts: amounts(a, 100, pct), limits: ['Record meals separately under Meals & entertainment.'], docs: ['Receipts', 'Destination and dates', 'Business reason: who you saw or what you attended', 'Which days were personal'] };
    },
  },
  // Home
  { id: 'homeoffice', name: 'Home office', keys: 'work from home workspace office at home', ...homeFlow('A share of home costs') },
  {
    id: 'rent', name: 'Rent', keys: 'lease office space apartment',
    questions: [{ id: 'kind', text: 'Rent for what?', options: [['commercial', 'An office, shop or storage space for the business'], ['home', 'My home']] }, { ...homeFlow('Rent').questions[0], showIf: a => a.kind === 'home' }, { ...homeFlow('Rent').questions[1], showIf: a => a.kind === 'home' && a.principal !== 'yes' }, { ...Q.amount, showIf: a => a.kind === 'commercial' }],
    evaluate: a => (a.kind === 'commercial' ? { status: 'green', line: 'T2125 line 8910 — rent', rules: ['expense-test'], why: ['Rent for property used in the business is deductible.'], amounts: amounts({ ...a, earn: 'yes' }), docs: ['Lease', 'Payment records'] } : homeFlow('Rent').evaluate(a)),
  },
  { id: 'mortgage', name: 'Mortgage interest', keys: 'mortgage payment house', ...homeFlow('Mortgage interest') },
  { id: 'utilities', name: 'Home utilities (heat, power, water)', keys: 'electricity enmax gas bill heating water property tax home insurance', ...homeFlow('Heat, electricity, water, property tax and home insurance') },
  // Equipment
  { id: 'computer', name: 'Computer / laptop', keys: 'new laptop macbook desktop pc monitor tablet ipad', ...capital('A computer', '50') },
  { id: 'printer', name: 'Printer / scanner', keys: 'printer scanner', ...capital('A printer', '50') },
  { id: 'camera', name: 'Camera', keys: 'camera lens', ...capital('A camera', '8') },
  { id: 'furniture', name: 'Office chair / desk / furniture', keys: 'office chair desk filing cabinet shelf', ...capital('Furniture', '8') },
  { id: 'tools', name: 'Tools', keys: 'tool drill installation tools', ...capital('A tool', '12') },
  { id: 'equipment', name: 'Equipment (other)', keys: 'machinery terminal hardware device', ...capital('Equipment', '8') },
  // Straightforward current expenses
  { id: 'software', name: 'Software subscription', keys: 'saas app subscription microsoft 365 dropbox crm hosting domain website', record: ['other', 'Software & subscriptions'], ...current('T2125 line 8810 — office expenses', 'expense-test', { limits: ['Software you buy outright (not a subscription) can be capital property (Class 12).'] }) },
  { id: 'ads', name: 'Advertising (Facebook ads, Google ads)', keys: 'facebook ads google ads instagram marketing flyers promotion sponsor', record: ['other', 'Advertising & marketing'], ...current('T2125 line 8521 — advertising', 'advertising') },
  { id: 'cards', name: 'Business cards & printing', keys: 'business cards flyers brochures printing', record: ['other', 'Advertising & marketing'], ...current('T2125 line 8521 — advertising', 'advertising') },
  { id: 'supplies', name: 'Office supplies', keys: 'paper ink pens stationery postage stamps', record: ['other', 'Office supplies'], ...current('T2125 line 8811 — office stationery and supplies', 'office') },
  { id: 'bank', name: 'Bank fees / Square fees / Stripe fees', keys: 'bank fees square stripe paypal payment processing merchant fees wire', record: ['other', 'Banking/payment fees'], ...current('T2125 line 8710 — interest and bank charges', 'interest-bank', { limits: ['Fees on a personal account are deductible only for the business transactions. A separate business account makes this simple.'] }) },
  {
    id: 'accounting', name: 'Accounting & legal fees', keys: 'accountant bookkeeper tax preparation lawyer legal consulting professional fees',
    record: ['other', 'Accounting & professional fees'],
    questions: [{ id: 'cap', text: 'Was the fee for buying a capital asset (for example legal fees on a property or vehicle purchase)?', options: yn }, Q.earn, Q.pct, Q.amount, Q.receipt],
    evaluate: a => (a.cap === 'yes'
      ? { status: 'orange', why: ['Fees to acquire capital property are added to the cost of that property and claimed through CCA, not deducted as professional fees.'], rules: ['professional-fees'], line: 'Added to the capital cost of the asset' }
      : { status: 'green', why: [rule('professional-fees').summary], amounts: amounts(a), line: 'T2125 line 8860 — professional fees', rules: ['professional-fees'], limits: ['The part of a tax-preparation fee for your personal (non-business) return is not a business expense.'] }),
  },
  {
    id: 'insurance', name: 'Insurance', keys: 'liability premium policy life insurance disability',
    questions: [{ id: 'kind', text: 'What kind of insurance?', options: [['business', 'Business / liability / equipment'], ['vehicle', 'Vehicle'], ['home', 'Home or tenant'], ['life', 'Life, disability or health']] }, { ...Q.amount, showIf: a => a.kind === 'business' }, { ...Q.receipt, showIf: a => a.kind === 'business' }],
    evaluate(a) {
      if (a.kind === 'business') return { status: 'green', why: [rule('insurance').summary], amounts: amounts({ ...a, earn: 'yes' }), line: 'T2125 line 8690 — insurance', rules: ['insurance'], docs: ['Policy', 'Premium receipt'], actions: [{ label: 'Record this expense', record: ['other', 'Business insurance'] }] };
      if (a.kind === 'vehicle') return { status: 'orange', why: ['Vehicle insurance is a motor vehicle expense, claimed in proportion to business kilometres.'], rules: ['vehicle-expenses'], line: 'T2125 Chart A', actions: [{ label: 'Record vehicle insurance', record: ['vehicle', 'Insurance'] }] };
      if (a.kind === 'home') return { status: 'orange', why: ['Home insurance is only claimable as part of business-use-of-home, if you meet the conditions.'], rules: ['home-conditions'], actions: [{ label: 'Open the home office calculator', href: '#/homeoffice' }] };
      return { status: 'red', why: ['Life insurance premiums are generally not deductible, and personal disability or health premiums are not ordinary business expenses. A private health services plan has its own rules; ask a tax professional.'], rules: ['insurance'] };
    },
  },
  {
    id: 'interest', name: 'Interest', keys: 'loan line of credit credit card interest borrowing',
    questions: [{ id: 'use', text: 'What was the money borrowed for?', options: [['business', 'To run or buy things for the business'], ['vehicle', 'To buy a vehicle'], ['personal', 'Personal spending'], ['mixed', 'A mix']] }, Q.amount],
    evaluate(a) {
      if (a.use === 'personal') return { status: 'red', why: ['Interest on personal borrowing is not deductible.'], rules: ['interest-bank'] };
      if (a.use === 'vehicle') return TOPICS.find(t => t.id === 'vpayment').evaluate({ kind: 'loan' });
      return { status: a.use === 'mixed' ? 'yellow' : 'green', why: [rule('interest-bank').summary], amounts: a.use === 'mixed' ? null : amounts({ ...a, earn: 'yes' }), line: 'T2125 line 8710 — interest and bank charges', rules: ['interest-bank'], limits: a.use === 'mixed' ? ['Only interest on the part of the borrowing used for the business counts. On a mixed card or line of credit you need to be able to trace it.'] : [], docs: ['Loan or card statements', 'What the borrowed money was spent on'], actions: [{ label: 'Record this expense', record: ['other', 'Interest on business borrowing'] }] };
    },
  },
  {
    id: 'training', name: 'Training & courses', keys: 'course class workshop seminar conference convention certification books education',
    record: ['other', 'Training/education'],
    questions: [{ id: 'kind', text: 'What is the training for?', options: [['maintain', 'Keeping up or improving skills for my current business'], ['new', 'Qualifying for a new line of work, or a degree'], ['convention', 'A convention or conference']] }, Q.amount, Q.receipt],
    evaluate(a) {
      if (a.kind === 'new') return { status: 'red', why: ['Training that gives you a new qualification or prepares you for a different business is a capital or personal cost, not a current business expense. Tuition may qualify for the personal tuition credit instead.'], rules: ['expense-test'] };
      if (a.kind === 'convention') return { status: 'orange', why: [rule('conventions').summary], amounts: amounts({ ...a, earn: 'yes' }), line: 'T2125 line 9270 — other expenses', rules: ['conventions', 'meals-50'], docs: ['Registration receipt', 'Agenda showing the link to your business'] };
      return { status: 'green', why: ['Training that maintains, updates or upgrades skills you already use in the business is a current expense.'], amounts: amounts({ ...a, earn: 'yes' }), line: 'T2125 line 9270 — other expenses', rules: ['expense-test'], docs: ['Receipt', 'Course description', 'How it relates to your current work'] };
    },
  },
  {
    id: 'dues', name: 'Memberships & professional dues', keys: 'membership association chamber licence license club gym golf',
    record: ['other', 'Licences, dues & memberships'],
    questions: [{ id: 'kind', text: 'What kind of membership?', options: [['trade', 'Trade, professional or business association, or a licence'], ['club', 'A club mainly for dining, recreation or sport (gym, golf)']] }, Q.amount, Q.receipt],
    evaluate: a => (a.kind === 'club' ? { status: 'red', why: ['Dues and initiation fees for a club whose main purpose is dining, recreation or sport are not deductible, even if you take clients there.'], rules: ['dues'] } : { status: 'green', why: [rule('dues').summary], amounts: amounts({ ...a, earn: 'yes' }), line: 'T2125 line 8760 — business taxes, licences and memberships', rules: ['dues'] }),
  },
  {
    id: 'clothing', name: 'Clothing / work boots', keys: 'clothes boots uniform suit shirt jacket shoes safety',
    record: ['other', 'Clothing/uniforms'],
    questions: [{ id: 'kind', text: 'What is it?', options: [['ordinary', 'Ordinary clothing I could also wear outside work'], ['protective', 'Protective gear the work requires (safety boots, hi-vis, gloves)'], ['branded', 'Clothing with the business name or logo on it']] }, Q.amount, Q.receipt],
    evaluate(a) {
      if (a.kind === 'ordinary') return { status: 'red', why: ['Ordinary clothing is a personal expense, even if you bought it for work and only wear it there.'], rules: ['clothing'] };
      return { status: 'gray', why: [a.kind === 'protective' ? 'Protective equipment needed to do the work safely is different from ordinary clothing, but CRA\'s pages for the self-employed do not set out a clear rule.' : 'Branded clothing may be an advertising or supply cost, but it is not clearly addressed by CRA.', 'Record it with a note of why the work requires it and confirm the treatment with a tax professional.'], amounts: null, rules: ['clothing'], docs: ['Receipt', 'Why the work requires it'], actions: [{ label: 'Record it for review', record: ['other', 'Clothing/uniforms'] }] };
    },
  },
  {
    id: 'gifts', name: 'Gifts to clients', keys: 'gift present client appreciation gift card bottle wine tickets',
    questions: [{ id: 'kind', text: 'What was the gift?', options: [['food', 'Food, drinks, or tickets to an event'], ['item', 'A reasonable item (not food or entertainment)'], ['family', 'A gift for family or friends']] }, Q.amount, Q.receipt],
    evaluate(a) {
      if (a.kind === 'family') return personal('gifts');
      if (a.kind === 'food') return { status: 'orange', why: ['Gifts of food, beverages or entertainment (tickets) are treated as meals and entertainment: at most 50% is deductible.'], amounts: amounts({ ...a, earn: 'yes' }, VALUES.mealsPct.value), line: 'T2125 line 8523 — meals and entertainment', rules: ['meals-50'], docs: ['Receipt', 'Who received it and the business relationship'], actions: [{ label: 'Record this expense', record: ['other', 'Meals & entertainment'] }] };
      return { status: 'yellow', why: ['A reasonable gift to a client made to earn or keep business can be a promotion expense. CRA gives no specific rule for the self-employed, so it rests on the general tests: incurred to earn income, and reasonable.'], amounts: amounts({ ...a, earn: 'yes' }), line: 'T2125 line 8521 — advertising / promotion', rules: ['expense-test'], docs: ['Receipt', 'Who received it and why'], actions: [{ label: 'Record this expense', record: ['other', 'Advertising & marketing'] }] };
    },
  },
  { id: 'contractor', name: 'Contractors & wages', keys: 'subcontractor helper employee salary wages pay family spouse child', record: ['other', 'Contractors & wages'], ...current('T2125 line 9060 (salaries) or 8360 (subcontracts)', 'salaries-family', { limits: ['Paying a family member has conditions: real work, a reasonable amount, actually paid, and documented.', 'Employees require payroll deductions and T4 slips.'] }) },
];

export const COMMON = ['fuel', 'phone', 'meals', 'computer', 'parking', 'homeoffice', 'software', 'ads', 'travel', 'vpayment', 'clothing', 'insurance'];
export const topics = () => TOPICS;

const tokens = s => s.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(t => t.length > 1);
export function search(query) {
  const q = tokens(query);
  if (!q.length) return [];
  // A word in the topic's name counts for more than a keyword, and between
  // equal matches the more specific (shorter) name wins: "interest" finds
  // Interest before Mortgage interest.
  return TOPICS.map(t => {
    const name = tokens(t.name), keys = tokens(t.keys);
    let score = 0;
    for (const w of q) score += name.includes(w) ? 5 : keys.includes(w) ? 3 : [...name, ...keys].some(h => h.startsWith(w) || w.startsWith(h)) ? 1 : 0;
    return { t, score, size: name.length };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score || a.size - b.size).slice(0, 5).map(x => x.t);
}

// Questions still to ask, in order. Stops early when the purpose answer settles it.
export function pending(topic, a) {
  const settled = a.earn === 'no' || a.earn === 'unsure';
  const visible = [];
  for (const q of topic.questions) {
    if (q.showIf && !q.showIf(a)) continue;
    visible.push(q);
    if (q.id === 'earn' && settled) break;
    if (a[q.id] === undefined) break;
  }
  const last = visible[visible.length - 1];
  return { visible, done: !last || a[last.id] !== undefined };
}

export function evaluate(topic, a) {
  const res = a.earn === 'no' ? personal('costs') : a.earn === 'unsure' ? unsure() : topic.evaluate(a);
  return finish(a, { ...res });
}

// ---- screen ----------------------------------------------------------------

const st = { q: '', id: null, a: {} };
const PERSONAL_HINT = /\b(personal|even though|anyway|get away|nobody|no one will|hide|fake|backdate|make it look|pretend)\b/i;

function resultHtml(topic, res) {
  const am = res.amounts;
  const conf = res.rules.map(rule).filter(Boolean).some(x => x.confidence !== 'high') || res.status === 'gray' ? 'Medium — part of this rests on guidance that should be confirmed' : 'High — taken directly from the cited government source';
  const actions = [...(res.actions || [])];
  if (topic.record && res.status !== 'red' && !actions.some(x => x.record)) actions.unshift({ label: 'Record this expense', record: topic.record });
  return `<section class="verdict ${res.status}">
      <p class="verdict-label">${esc(STATUSES[res.status])}</p>
      ${res.why.map(w => `<p>${esc(w)}</p>`).join('')}
    </section>
    ${am ? `<section class="panel"><h2>Estimate</h2>
      <div class="line"><span>Total expense</span><span>${money(am.total)}</span></div>
      <div class="line"><span>Business portion (${num(am.pct, am.pct % 1 ? 1 : 0)}%)</span><span>${money(am.business)}</span></div>
      <div class="line total"><span>${esc(am.deductibleLabel || `Potentially deductible${am.limitPct < 100 ? ` (${am.limitPct}% limit)` : ''}`)}</span><span>${money(am.deductible)}</span></div>
      <p class="muted">${am.note ? `${esc(am.note)} ` : ''}A deduction lowers taxable income; it is not a refund of this amount. At a 25% marginal rate, ${money(am.deductible)} of deduction reduces tax by about ${money(am.deductible * 0.25)}.</p></section>` : ''}
    <section class="panel">
      <dl class="dl">
        ${res.line ? `<dt>CRA category</dt><dd>${esc(res.line)}</dd>` : ''}
        ${res.limits && res.limits.length ? `<dt>Important limitations</dt><dd><ul class="plain">${res.limits.map(l => `<li>${esc(l)}</li>`).join('')}</ul></dd>` : ''}
        ${res.docs && res.docs.length ? `<dt>Records to keep</dt><dd>${res.docs.map(esc).join(' &middot; ')}</dd>` : ''}
        <dt>Confidence</dt><dd>${conf}</dd>
        <dt>Source</dt><dd>${res.rules.map(cite).join('')}</dd>
      </dl>
      ${actions.length ? `<div class="btn-list">${actions.map((x, i) => x.href ? `<a class="btn${i ? '' : ' primary'}" href="${x.href}">${esc(x.label)}</a>` : `<button class="btn${i ? '' : ' primary'}" data-record="${esc(x.record.join('|'))}">${esc(x.label)}</button>`).join('')}</div>` : ''}
      <p class="muted">Based on what you entered and the guidance cited. The final treatment depends on your full circumstances.</p>
    </section>`;
}

function questionHtml(q, a) {
  const v = a[q.id];
  const body = q.type === 'money' || q.type === 'pct'
    ? `<div class="q-input"><input type="text" inputmode="decimal" data-q="${q.id}" value="${v ?? ''}" placeholder="${q.type === 'pct' ? 'e.g. 70' : '0.00'}" aria-label="${esc(q.text)}"><span>${q.type === 'pct' ? '%' : '$'}</span>
        <button class="btn" data-next="${q.id}">${v === undefined ? (q.optional ? 'Skip / continue' : 'Continue') : 'Update'}</button></div>`
    : `<div class="q-opts">${q.options.map(([val, label]) => `<button class="q-opt${v === val ? ' on' : ''}" data-q="${q.id}" data-v="${val}">${esc(label)}</button>`).join('')}</div>`;
  return `<div class="q"><p class="q-text">${esc(q.text)}</p>${q.hint ? `<p class="muted">${esc(q.hint)}</p>` : ''}${body}</div>`;
}

export function deduct(root, param) {
  if (param && TOPICS.some(t => t.id === param) && st.id !== param) { st.id = param; st.a = {}; }
  const topic = TOPICS.find(t => t.id === st.id);
  const chip = t => `<button class="pill" data-topic="${t.id}">${esc(t.name)}</button>`;
  if (!topic) {
    const hits = search(st.q);
    root.innerHTML = `
      ${head('Can I deduct this?', '', 'Answer a few questions and see how an expense may be treated, what to keep, and where the rule comes from.')}
      <input type="search" class="search big" placeholder="e.g. gas, phone bill, new laptop, lunch with a client" value="${esc(st.q)}" aria-label="What did you spend money on?">
      <div data-hits>${st.q.trim() ? (hits.length ? `<div class="pills">${hits.map(chip).join('')}</div>` : `<section class="verdict gray"><p class="verdict-label">${STATUSES.gray}</p><p>Nothing in the app's rule set matches "${esc(st.q)}". That does not mean it cannot be a business expense. The general test is whether it was a reasonable cost incurred to earn business income. Record it under Other with a clear business purpose and "Needs review" ticked, and ask a tax professional.</p>${cite('expense-test')}</section>`) : ''}
        ${PERSONAL_HINT.test(st.q) ? `<section class="verdict red"><p class="verdict-label">Do not claim personal spending</p><p>If something was personal, it is not a business expense, whatever it was or how it was paid for. Claim only the part that was genuinely for the business, keep the real receipt, and never invent a business purpose, change a date or inflate an amount. False claims can lead to penalties on top of the tax.</p></section>` : ''}</div>
      <h2 class="section-title">Common questions</h2>
      <div class="pills">${COMMON.map(id => chip(TOPICS.find(t => t.id === id))).join('')}</div>
      <details class="review-group"><summary>All topics <span>${TOPICS.length}</span></summary><div class="pills">${TOPICS.map(chip).join('')}</div></details>
      <section class="note"><p><strong>A deduction is not a refund.</strong> ${esc(rule('deduction-basics').summary)}</p><p>Never buy something because it is deductible.</p>${cite('deduction-basics')}</section>`;
    const input = $('.search', root);
    input.addEventListener('input', () => { st.q = input.value; const pos = input.selectionStart; deduct(root); const el = $('.search', root); el.focus(); el.setSelectionRange(pos, pos); });
  } else {
    const { visible, done } = pending(topic, st.a);
    root.innerHTML = `
      <p><button class="link-back" data-back>&larr; All topics</button></p>
      ${head(topic.name, '<button class="btn small" data-reset>Start over</button>', 'Potentially. Let\'s check the facts it depends on.')}
      <section class="panel qs">${visible.map(q => questionHtml(q, st.a)).join('')}</section>
      ${done ? resultHtml(topic, evaluate(topic, st.a)) : '<p class="muted">Answer the question above to continue. No answer is shown until the facts it depends on are in.</p>'}`;
  }
  root.onclick = e => {
    const t = e.target.closest('[data-topic]');
    if (t) { st.id = t.dataset.topic; st.a = {}; deduct(root); window.scrollTo(0, 0); return; }
    if (e.target.closest('[data-back]')) { st.id = null; st.a = {}; if (location.hash !== '#/deduct') location.hash = '#/deduct'; else deduct(root); return; }
    if (e.target.closest('[data-reset]')) { st.a = {}; deduct(root); return; }
    const opt = e.target.closest('.q-opt');
    if (opt) { st.a[opt.dataset.q] = opt.dataset.v; deduct(root); return; }
    const next = e.target.closest('[data-next]');
    if (next) {
      const raw = $(`input[data-q="${next.dataset.next}"]`, root).value.replace(/[,\s$%]/g, '');
      st.a[next.dataset.next] = raw === '' || !Number.isFinite(Number(raw)) ? null : Number(raw);
      deduct(root); return;
    }
    const rec = e.target.closest('[data-record]');
    if (rec) { const [group, category] = rec.dataset.record.split('|'); expenseForm({ group, category, amount: st.a.amount > 0 && topic.id !== 'phone' ? st.a.amount : undefined }); }
  };
  $$('input[data-q]', root).forEach(el => el.addEventListener('keydown', e => { if (e.key === 'Enter') $(`[data-next="${el.dataset.q}"]`, root).click(); }));
}
