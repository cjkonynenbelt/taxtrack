// Knowledge centre, Tax rule updates, and the list of every rule with its source.
// Articles are plain-language introductions; the rule text and sources they
// cite are pulled from rules.js so there is one place to keep them current.

import { RULES, rule, cite, statusBadge, updates, verifiedLabel, VERIFIED, CURRENT_TAX_YEAR, STATUS } from './rules.js';
import { state } from './store.js';
import { summary } from './calc.js';
import { head } from './views.js';
import { esc, money, pct } from './util.js';

// [id, title, paragraphs, rule ids]
const ARTICLES = [
  ['deduction', 'What is a tax deduction?', ['A deduction is an amount subtracted from income before tax is calculated. A business expense is a deduction from business income.', 'It does not come back to you dollar for dollar. If your marginal rate is 25%, a $1,000 deductible expense lowers your tax by about $250. You still spent $1,000, so buying something only because it is deductible leaves you $750 worse off.'], ['deduction-basics', 'expense-test']],
  ['credit', 'What is a tax credit?', ['A credit is subtracted from the tax itself, not from income. Most are non-refundable: they can reduce tax to zero but no further. The basic personal amount is the one everybody gets. A refundable credit is paid to you even when no tax is owing.', 'A deduction is worth more at a higher marginal rate; most credits are worth the same to everyone, at the lowest bracket rate.'], ['rates-2026']],
  ['taxable-income', 'What is taxable income?', ['Total income from all sources (employment, net business income, interest and so on), less deductions such as RRSP contributions and the deductible part of CPP on self-employment. The brackets are applied to this figure.'], ['rates-2026', 'cpp-self-employed']],
  ['marginal', 'Marginal and average tax rates', ['Canada taxes income in brackets. Each rate applies only to the income inside its bracket, so moving into a higher bracket never reduces what you keep from the income below it.', 'Your marginal rate is the combined federal and provincial rate on your next dollar. It tells you what a deduction saves or what extra income costs. Your average rate is total income tax divided by total income, and is always lower.', 'Old examples that start at 15% on the first $47,630 use 2019 figures. The 2026 brackets are below.'], ['rates-2026']],
  ['net-income', 'Net business income', ['Gross business income minus deductible business expenses, CCA and any business-use-of-home claim. This is the figure that is added to your other income and taxed. The app\'s number is an estimate built from your records, not the result of a tax return.'], ['t2125', 'expense-test']],
  ['business-income', 'Business income and employment income', ['An employee is taxed on pay with few deductions, but the employer pays half of CPP and withholds tax. A self-employed person can deduct the reasonable costs of earning the income, but pays both halves of CPP, gets no tax withheld and no employer benefits.', 'The tax rates are the same. Business income is not "taxed less"; it is taxed on what is left after genuine business costs.'], ['cpp-self-employed', 'expense-test']],
  ['sole-prop', 'Sole proprietor or corporation', [], ['sole-prop-vs-corp', 't2125']],
  ['current', 'Current expenses', ['A current expense is a cost that is used up within the year: fuel, a software subscription, bank fees, advertising. It is deducted in the year it is incurred, in full if it is entirely for the business.'], ['expense-test', 'capital-vs-current', 'office']],
  ['capital', 'Capital property', ['Capital property gives a lasting benefit: a computer, tools, furniture, a vehicle. It is not deducted as an expense when bought. Its cost is recovered over several years through capital cost allowance.'], ['capital-vs-current', 'cca-basics']],
  ['cca', 'CCA (capital cost allowance)', ['Each class of property has a rate. Each year you may claim up to that rate on the balance remaining in the class. Claiming is optional, and only the business-use share is deductible.'], ['cca-basics', 'cca-classes', 'cca-half-year', 'mega-deduction', 'immediate-expensing-2021']],
  ['ucc', 'UCC (undepreciated capital cost)', ['UCC is the running balance of a CCA class: the cost of what you added, minus the CCA claimed so far, minus the proceeds of anything sold. Opening UCC plus additions minus dispositions minus CCA equals closing UCC, which becomes next year\'s opening balance.'], ['cca-basics', 'cca-disposal']],
  ['business-use', 'Business-use percentage', ['When something is used for both business and personal purposes, only the business share counts. The share has to rest on something measurable: kilometres for a vehicle, floor area and hours for a home work space, usage for a phone.', 'The app always shows three separate figures: the total paid, the business portion, and the potentially deductible amount after any limit such as the 50% rule for meals.'], ['expense-test']],
  ['vehicle', 'Vehicle expenses', ['You claim the business share of actual running costs. The share is business kilometres divided by total kilometres for the year, which is why the logbook and the odometer readings matter more than any receipt.', 'The vehicle itself is capital property, claimed through CCA with a cost ceiling for passenger vehicles.'], ['vehicle-expenses', 'vehicle-records', 'vehicle-simplified-log', 'vehicle-parking', 'vehicle-limits-2026']],
  ['home-office', 'Home office', [], ['home-conditions', 'home-calculation', 'home-limit', 'home-cca', 'home-pct-myth']],
  ['meals', 'Meals and entertainment', ['Record who was there and what the business reason was, at the time. Your own everyday lunch is personal.'], ['meals-50', 'conventions']],
  ['travel', 'Travel', ['A trip is a business trip when business is the reason for going. Meeting a client during a holiday does not turn the holiday into one. Keep the destination, dates, who you saw and which days were personal.'], ['travel', 'meals-50']],
  ['gst', 'GST/HST', ['GST/HST is separate from income tax. If you are registered you collect it on taxable sales and claim back what you pay on business purchases. If you are not registered, the GST you pay is just part of your costs.'], ['gst-small-supplier', 'gst-rates', 'gst-itc']],
  ['rrsp', 'RRSP', [], ['rrsp']],
  ['tfsa', 'TFSA', [], ['tfsa']],
  ['fhsa', 'FHSA', [], ['fhsa']],
  ['records', 'Record keeping', ['Good records are the whole game: a receipt, a date, an amount, a vendor and a business reason for every expense, and a logbook for the vehicle. An expense you cannot support may be denied even if it was genuine.'], ['records-retention', 'records-receipts', 'vehicle-records']],
  ['audits', 'CRA reviews and audits', ['CRA may ask you to support any amount on your return, usually by sending receipts and an explanation. If records are missing it can deny the expense and charge interest, and penalties apply where amounts were knowingly false.', 'The practical defence is ordinary: claim only what was for the business, keep the documents, and be able to explain each percentage you used. Nothing in this app is designed to make a claim less likely to be noticed.'], ['records-retention', 'expense-test']],
  ['instalments', 'Tax instalments', ['No tax is withheld from self-employment income, so after a year or two CRA may ask you to pay during the year in four instalments instead of all at once in April.'], ['instalments', 'filing-deadline']],
  ['capital-gains', 'Capital gains', [], ['capital-gains']],
];

const ruleBlock = id => { const x = rule(id); return x ? `<div class="rule"><h3>${esc(x.title)}</h3><p>${esc(x.summary)}</p>${x.note ? `<p class="muted">${esc(x.note)}</p>` : ''}${cite(id)}${x.links ? `<p class="cite">${Object.entries(x.links).map(([l, u]) => `<a href="${u}" target="_blank" rel="noopener">${esc(l)}</a>`).join(' &middot; ')}</p>` : ''}</div>` : ''; };

export function learn(root, id) {
  const art = ARTICLES.find(a => a[0] === id);
  if (!art) {
    root.innerHTML = `
      ${head('Knowledge centre', '', `Canadian tax concepts in plain language. Tax year ${CURRENT_TAX_YEAR}; rules last verified ${verifiedLabel(VERIFIED)}.`)}
      <div class="menu">${ARTICLES.map(([aid, title, , ids]) => `<a class="row" href="#/learn/${aid}"><span class="row-main"><span class="row-title">${esc(title)}</span><span class="row-sub">${ids.some(i => rule(i).status === 'proposed') ? 'Includes a proposed rule &middot; ' : ''}${[...new Set(ids.map(i => rule(i).source))].join(', ')}</span></span><span class="row-amt">&rsaquo;</span></a>`).join('')}</div>
      <div class="btn-list"><a class="btn" href="#/updates">Tax rule updates</a><a class="btn" href="#/sources">All rules and sources</a></div>
      <p class="muted">General information, not advice for your situation. Government sources come first; where a video or article disagrees with CRA, CRA is what the app follows.</p>`;
    return;
  }
  const [aid, title, paras, ids] = art;
  const t = summary(state.settings.year).tax;
  root.innerHTML = `
    <p><a href="#/learn">&larr; Knowledge centre</a></p>
    ${head(title)}
    <article class="article">${paras.map(p => `<p>${esc(p)}</p>`).join('')}
      ${aid === 'marginal' && t.totalIncome > 0 ? `<p class="callout">On your current ${state.settings.year} estimate: marginal rate about ${pct(t.marginal)}, average rate about ${pct(t.average)} on ${money(t.totalIncome)} of income. Income tax only; CPP is extra. <a href="#/tax">Tax estimate</a></p>` : ''}
      ${ids.map(ruleBlock).join('')}</article>`;
}

// ---- tax rule updates ------------------------------------------------------

export function updatesView(root) {
  const list = updates();
  root.innerHTML = `
    ${head('Tax rule updates', '', `What is new, changed, proposed or expired in the rules this app uses. Checked ${verifiedLabel(VERIFIED)}.`)}
    ${list.map(x => `<section class="panel update">
      <p class="update-top"><span class="badge ${x.change.type.toLowerCase()}">${x.change.type}</span> ${statusBadge(x.status)} <span class="muted">${verifiedLabel(x.change.date)}</span></p>
      <h3>${esc(x.title)}</h3><p>${esc(x.change.note)}</p>
      ${x.status === 'proposed' ? `<p>${esc(x.summary)}</p><p class="muted">${esc(x.note || '')}</p>` : ''}
      ${cite(x.id)}</section>`).join('')}
    <section class="note"><p><strong>Law</strong> is enacted and in force. <strong>Proposed</strong> has been announced or drafted but not passed, and may change or never pass; the app does not calculate with proposed rules. <strong>CRA guidance</strong> is how CRA explains or administers the law.</p>
      <p>This list is updated when the app is updated. It does not check the internet by itself, so a rule can change before the app catches up. The "verified" date on each rule tells you how fresh it is.</p></section>
    <div class="btn-list"><a class="btn" href="#/sources">All rules and sources</a></div>`;
}

export function sources(root) {
  const groups = Object.keys(STATUS).map(k => [k, RULES.filter(x => x.status === k)]).filter(g => g[1].length);
  root.innerHTML = `
    <p><a href="#/learn">&larr; Knowledge centre</a></p>
    ${head('Rules and sources', '', `${RULES.length} rules. Every tax figure and statement in the app traces to one of these.`)}
    ${groups.map(([k, list]) => `<h2 class="section-title">${statusBadge(k)} ${list.length}</h2>
      <div class="table-wrap"><table class="table sources"><thead><tr><th>Rule</th><th>Jurisdiction</th><th>Tax year</th><th>Verified</th><th>Confidence</th></tr></thead><tbody>
      ${list.map(x => `<tr><td><a href="${x.url}" target="_blank" rel="noopener">${esc(x.title)}</a><br><small>${esc(x.source)}</small></td><td>${esc(x.jurisdiction)}</td><td>${x.taxYear}</td><td>${verifiedLabel(x.verified)}</td><td>${x.confidence}</td></tr>`).join('')}
      </tbody></table></div>`).join('')}
    <p class="muted">Income tax brackets and CPP amounts for every province are in the yearly rate table (Settings &rsaquo; Edit tax rate table), taken from the same CRA pages.</p>`;
}
