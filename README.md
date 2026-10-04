# TaxTrack

A private, mobile-first record-keeping app for a self-employed person in Canada. It is set up for commission-based sales and installation work in Alberta: income (CAD and USD), expenses with receipts, mileage, vehicles and equipment (CCA), business-use-of-home, GST/HST, reminders, a guided "Can I deduct this?" check, a tax estimate, and exports for an accountant.

**This is a record-keeping and estimation tool, not tax-filing software and not tax advice.** Every tax figure is an estimate. The app never files anything, never connects to the CRA and never asks for CRA sign-in details.

## Principles

- Accuracy over aggressive tax optimisation. The app never suggests spending money because something is deductible, and never helps disguise a personal expense.
- Government sources first: CRA, then Finance Canada and the Government of Canada, then Alberta, then legislation. Videos and blogs are never a source.
- Current law, proposed law and CRA guidance are labelled separately. Proposed rules are shown for information and never used in a calculation.
- Three figures are always kept apart: the total paid, the business portion, and the potentially deductible amount after limits.

## Where your data lives

- All records, settings and receipt photos are stored **only in the browser on the device you use** (IndexedDB). Nothing is sent to GitHub or any server. The repository holds code only, so it can be public.
- There are no accounts and no AI service. Receipt reading (OCR) runs on the device; the Tesseract.js library is downloaded from a public CDN the first time you scan, but the photo itself is not uploaded.
- Data does not sync between devices. Clearing the browser's site data, or deleting the home-screen app on iPhone, erases it. **Export & backup > Download full backup** is the only copy outside the device; keep it somewhere private (it is not encrypted). `.gitignore` blocks the default backup and export file names.
- **Settings > Erase all data** deletes everything on the device.
- The optional 4-digit app lock deters casual access. It is not encryption.

## Run it locally

No build step and no dependencies: plain HTML, CSS and JavaScript modules. It must be served over http(s).

```
powershell -ExecutionPolicy Bypass -File dev/serve.ps1 -Port 8097
```

Then open http://localhost:8097/. Any static server works (`npx serve`, `python -m http.server`).

## Hosting on GitHub Pages

The repository root is the site. In the repository's **Settings > Pages**, deploy from branch `main`, folder `/ (root)`. `dev/` is only the local preview server and does not need to be published.

To update the live app: commit, push to `main`, and bump `CACHE` in `sw.js` so installed copies pick up the new files. Updating the code never touches saved records, which are tied to the site address.

## Keeping the tax rules current

Tax rules are data, in two files. Nothing else needs editing when a rule changes.

- **`js/rules.js`** is the tax-rules database. Each rule has a summary, source, URL, date verified, tax year, jurisdiction, status (`law`, `proposed`, `guidance`, `historical`) and confidence. `VALUES` holds the numbers calculations use (vehicle limits, meals limit, GST threshold and rates, RRSP/TFSA/FHSA limits), each tied to its rule. `deadlines(taxYear)` derives the dated tasks. To change a rule: edit the entry, set `verified` to the day you checked the source, and add a `change` note so it appears under **Tax rule updates**.
- **`js/tax-rates.js`** holds one table per tax year: federal and provincial brackets, basic personal amounts, CPP. Copy the latest block for a new year. A table can also be overridden on the device under **Settings > Edit tax rate table**.

The app does not check the internet for rule changes. The "verified" date shown beside every rule says how fresh it is.

Rules were last verified against canada.ca on 2026-10-04. Known limits of that check:

- The **Productivity Mega Deduction** (announced 2026-09-15) is draft legislation, labelled PROPOSED / NOT YET ENACTED, and not used in any calculation. Its exclusion of certain Class 10 and 10.1 vehicles was read from a summary of the draft and should be confirmed.
- First-year CCA: CRA's Accelerated Investment Incentive page predates Budget 2025. The app uses the half-year rule unless you choose the full first-year rate on an asset.
- CRA had not yet published its dated deadline page for the 2026 tax year; the 2027 dates follow the standing rules.
- Quebec is not modelled. Ontario surtax and health premium are not modelled.

## How the numbers are worked out

- **Income** counts only payments marked received. USD is converted only with the rate, or the CAD amount, you entered.
- **Vehicle business use** = business km ÷ total km, per vehicle. Business km come from the trip log; total km from the year's odometer readings. Without odometer readings the percentage only reflects logged trips and is flagged.
- **Vehicle expenses** are prorated by that percentage, counted in full (business parking), or personal.
- **Other expenses** are business, mixed at your percentage, or personal. Meals count at 50%.
- **Equipment and vehicles** are capital property: `js/equip.js` and `js/cca.js` suggest a CCA class you can override, and **Assets & CCA** shows opening UCC, additions, dispositions, CCA and closing UCC. Each asset's balance is tracked separately; CRA pools a class, so recapture and terminal loss on a sale are shown as "possible".
- **Business-use-of-home** needs one of CRA's two conditions, uses area (and hours, for a shared space), and is capped at net business income before the claim; the rest carries forward.
- **GST/HST**: the app asks whether you are registered. If you are, it estimates tax collected less input tax credits from the amounts typed on records. GST on capital purchases is left out because it follows a primary-use rule.
- **Tax estimate** = federal + provincial income tax + CPP on self-employment income, with only the basic personal amount, CPP, and any RRSP/FHSA/other deductions you enter.

## Record links (no double counting)

```
Installation --> Income record (payment)    sourceType: installation
             --> Trip record (travel km)     sourceType: installation
Recurring    --> Income record per month     sourceType: recurring
Subscription --> Expense record per payment  sourceType: subscription
Equipment and vehicle assets are their own records, never also entered as expenses.
```

## Project layout

```
index.html            app shell
css/app.css           all styles; colour and spacing tokens at the top
sw.js                 offline cache (app files only)       <- bump CACHE on every change

Data and rules
js/rules.js           tax-rules database with sources      <- update when rules change
js/tax-rates.js       yearly bracket and CPP tables        <- update yearly
js/reference.js       expense categories and per-category guidance
js/db.js              IndexedDB (the only storage code)
js/store.js           state, saving, record linking, backup/restore

Calculations (no screens)
js/calc.js            totals, vehicle %, expense portions, home office, tax estimate
js/cca.js             vehicle classification, CCA schedule, purchase assessment
js/equip.js           equipment treatment, CCA schedule, subscriptions

Screens
js/app.js             startup, routing, navigation, theme, year selector
js/dashboard.js       dashboard, quick-add sheet, business profile
js/views.js           income, expenses, customers, installations, recurring, months
js/views2.js          tax estimate, year-end checklist, export, settings
js/forms.js           add/edit forms
js/mileage.js         trip log, Start/Stop trips, vehicles and odometers
js/assets.js          vehicle assets
js/equipment.js       equipment and subscriptions
js/ccaview.js         Assets & CCA schedule by class
js/deduct.js          "Can I deduct this?" (topics, questions, evaluation, screen)
js/home.js            home office and phone & internet calculators
js/gst.js             GST/HST
js/reminders.js       reminder centre, smart checks, calendar export
js/learn.js           knowledge centre, tax rule updates, sources
js/scan.js            receipt scanner and review queue
js/cra.js             year-end tax package (PDF, Excel)
js/export.js          CSV files, PDF summary, backup

Shared
js/ui.js              form builder, dialogs, receipts
js/charts.js  js/pdf.js  js/xlsx.js  js/lock.js  js/util.js
dev/serve.ps1         local preview server
```

## Not included

- Push notifications. A static web app cannot send them; **Reminders > Add dates to calendar** exports the deadlines so the phone's calendar can.
- Sync between devices, accounts, or cloud storage.
- More than one business profile. Records are not tagged per business.
- Corporations and partnerships: the estimates assume a sole proprietor.
- Reading PDF receipts (photos are read; PDFs are attached only). Automatic trip detection. Filing with the CRA or filing a GST/HST return.
- Pooled CCA classes, the vehicle lease-cost formula (T2125 Chart C), and the daily vehicle-interest limit calculation.

## Disclaimer

This tool provides estimates and record-keeping assistance only. It is not tax, legal, or accounting advice. Actual tax treatment depends on your circumstances and applicable CRA rules. Consult a qualified Canadian tax professional for filing advice.
