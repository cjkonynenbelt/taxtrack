# TaxTrack

A private, mobile-first record-keeping app for self-employed sales and installation work in Canada: income (CAD and USD), mileage, vehicle and business expenses, customers, installations, recurring commissions, a tax set-aside estimate, and exports for an accountant.

**This is a record-keeping and estimation tool, not tax-filing software.** Every tax figure is an estimate. It does not decide what is deductible and its numbers are not guaranteed to match CRA requirements. Use the exports to work with a qualified Canadian tax professional.

## Where your data lives

- All records, settings and receipt photos are stored **only in the browser on the device you use** (IndexedDB).
- Nothing is sent to GitHub or any server. The GitHub repository holds the app's code only, so it is safe for the repository and the GitHub Pages site to be public.
- Consequences to know about:
  - Data does **not** sync between your phone and your computer. Each browser has its own copy.
  - Clearing the browser's site data, or removing the home-screen app on iPhone, erases it.
  - **Export & backup > Download full backup** is the only copy outside the device. Do it regularly and keep the file somewhere private (it is not encrypted). Never commit a backup file to the repository; `.gitignore` blocks the default file names.
- The optional 4-digit app lock deters casual access. It is not encryption; your phone's passcode is the real protection.

GitHub Pages can only serve static files, so it cannot act as a secure database. If you later want automatic sync between devices, that needs a separate private backend with sign-in (for example a hosted database with per-user access rules); `js/db.js` is the only file that talks to storage, so that is where it would plug in.

## Run it locally

No build step and no dependencies - it is plain HTML, CSS and JavaScript modules. It must be served over http(s) (opening `index.html` directly from disk will not work).

Windows (PowerShell):

```
powershell -ExecutionPolicy Bypass -File dev/serve.ps1 -Port 8097
```

Then open http://localhost:8097/. Any other static server works too (`npx serve`, `python -m http.server`).

## Put it on GitHub Pages

1. Create a repository on GitHub (public is fine - it contains no data).
2. Upload everything in this folder except `dev/` (or `git init`, commit, and push).
3. Repository **Settings > Pages**: deploy from branch `main`, folder `/ (root)`.
4. Open the Pages URL on your iPhone in Safari, then **Share > Add to Home Screen**. It then opens full-screen and works offline.

Data is tied to the site address. If you ever move the app to a different URL, download a backup first and restore it at the new address.

## Updating the app

- Edit files, then bump `CACHE` in `sw.js` (for example `taxtrack-v2`) so phones pick up the new version.
- Updating the code never touches saved records.

### Updating tax rates each year

Rates are data, not logic:

- `js/tax-rates.js` holds one table per tax year (federal and provincial brackets, basic personal amounts, CPP). Copy the latest block, change the year, and replace the numbers from the CRA pages linked at the top of that file.
- Or, without touching code: **Settings > Edit tax rate table** saves a custom table for the selected year on your device.
- If a year has no table yet, the estimate uses the latest one and says so.

The 2026 table was taken from canada.ca on 2026-10-01. Quebec is not modelled; Ontario surtax and health premium are not modelled.

### Updating vehicle CCA rules

`js/cca.js` holds the CCA classes and rates, the passenger-vehicle cost limit by year, the zero-emission limit and the first-year rule in `CCA_RULES`, plus the date they were last checked. Add each year's cost limit when it is announced (2026 was not confirmed on 2026-10-01, so the 2025 limit is used and flagged). The likely class comes from CRA's vehicle definitions chart; when the answers the chart needs are missing, the app says so instead of guessing.

### Updating equipment rules

`js/equip.js` holds the equipment categories, the likely CCA class for each (50, 8, 12, 46) and the rates in `EQUIP_RULES`. Items the rules cannot place get no class and the app says so. Accessories and similar items under `smallCost` ($200) are treated as likely current expenses; that cut-off is the app's own working threshold, not a CRA rule, and can be changed there.

### Updating expense guidance

`js/reference.js` holds the expense categories, warnings, documentation reminders, CRA links and the "Could I write this off?" catalogue. Edit the text there; the forms, review and reference screens all read from it.

## How the numbers are worked out

- **Income** counts only payments marked *Received*. USD payments are converted only with the rate, or the CAD amount, that you entered for that payment. A USD payment with neither is left out of CAD totals and flagged.
- **Business-use % of vehicle** = business km / total km. Business km come from the trip log. Total km come from the year totals you enter (odometer at start and end of year, or a total); without those the percentage only reflects logged trips and is flagged as unreliable.
- **Vehicle expenses**: each is either prorated by the business-use %, counted 100% (for example parking at a client), or personal.
- **Other expenses**: business 100%, mixed at the percentage you enter, or personal. The original amount and the business portion are both kept.
- **In the estimate only**: meals count at 50% (changeable), equipment is left out as a likely capital item, home-office costs are left out unless you confirm in Settings that you qualify.
- **Set-aside estimate** = estimated federal + provincial income tax + CPP on self-employment income, less tax you say you already paid. It applies only the basic personal amount and CPP; see the Tax estimate screen for what it leaves out.

## Mileage and GPS

- Trips can be entered by kilometres or by odometer readings (the most reliable record), or started and stopped live.
- GPS is off by default and optional per trip. A web app can read location only while it is open on screen, so if the phone locks or you switch apps the measured distance will be short; the trip is then flagged and you confirm the distance or enter the odometer. Only the distance is kept: no coordinates or routes are stored or sent anywhere.
- Automatic trip detection is not possible from a web app (no background location) and is not offered.
- Each vehicle has its own trips, odometer readings and business-use %, and its expenses use its own percentage.

## CRA and filing

The app does not file returns and never connects to the CRA or asks for CRA sign-in details. CRA accepts electronically filed personal returns only from NETFILE-certified software. **CRA / Tax filing > Prepare My Taxes** produces a package (PDF organised by T2125 section, an Excel workbook, the mileage log and CSV files) to enter into certified software or give to an accountant. `buildPackage(year)` in `js/cra.js` returns the whole package as one data object, which is where an official integration would connect if CRA ever offers one.

## Record links (no double counting)

Every record has a unique ID. Records created by another record store where they came from:

```
Installation --> Income record (payment)    sourceType: installation
             --> Trip record (travel km)     sourceType: installation
Recurring    --> Income record per month     sourceType: recurring, period: YYYY-MM
Subscription --> Expense record per payment  sourceType: subscription, period: YYYY-MM
Equipment and vehicle assets are their own records and are never also entered as expenses.
```

Linked income and trips are edited through their installation, so the payment and kilometres exist once. Recurring schedules only produce *expected* payments; they become income when you confirm receipt. The CSV exports include the record IDs and source IDs.

## Project layout

```
index.html            app shell
css/app.css           all styles (light/dark tokens at the top)
js/app.js             startup, routing, theme, year selector
js/db.js              IndexedDB storage (the only storage code)
js/store.js           state, saving, record linking, backup/restore
js/calc.js            totals, vehicle %, expense portions, tax estimate
js/tax-rates.js       yearly rate tables            <- update yearly
js/cca.js             vehicle CCA rules, classification, forecast, deduction assessment
js/assets.js          Vehicle assets & CCA screens
js/mileage.js         mileage tracker: Start/Stop trips, optional GPS, history, vehicles
js/equip.js           equipment rules, likely tax treatment, CCA, subscriptions <- update when rules change
js/equipment.js       Equipment & technology screens and report
js/cra.js             CRA / Tax filing screen and the year-end tax package
js/xlsx.js            small built-in Excel (.xlsx) writer
js/reference.js       categories + expense guidance <- update when rules change
js/forms.js           add/edit forms
js/ui.js              form builder, dialogs, receipts
js/views.js           dashboard and record lists
js/views2.js          tax estimate, year-end review, reference, export, settings
js/charts.js          SVG charts
js/export.js          CSV, PDF summary, backup file
js/pdf.js             small built-in PDF writer
js/lock.js            optional PIN lock
sw.js                 offline cache (app files only)
dev/serve.ps1         local preview server
```

## Not included

- Receipt OCR. Reading totals from photos needs a large third-party library or an online service; receipts are attached as photos and you type the details.
- Recapture or terminal loss when a vehicle or equipment is sold, automatic trip detection, direct filing with the CRA, GST/HST tracking and filing, and anything for Quebec provincial tax.

## Disclaimer

This tool provides estimates and record-keeping assistance only. It is not tax, legal, or accounting advice. Actual tax treatment depends on your circumstances and applicable CRA rules. Consult a qualified Canadian tax professional for filing advice.
