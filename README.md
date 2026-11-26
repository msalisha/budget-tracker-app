# Budget Tracker

A month-by-month budget and debt tracker that installs on an iPhone's Home Screen and works offline.

Your data is stored **on your phone only**, in the browser's storage for this app. Nothing is sent to a server, and nothing personal is kept in this repository.

## Install on iPhone

1. Open the app's address in **Safari**.
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open **Budget** from your Home Screen and tap **Import backup** to load your data.

## Backups

Tap **Backup** at the top of the app:

- **Export backup** opens the share sheet. Choose **Save to Files** (iCloud Drive is a good place) or AirDrop it.
- **Import backup** replaces everything in the app with a backup file.
- **Clear all data** removes everything from the phone.

Deleting the app from the Home Screen, or clearing Safari's website data, deletes its data, so export a backup now and then. The Backup button shows a dot when it's been more than 30 days.

## Files

- `index.html` is the whole app.
- `sw.js` keeps it working offline. Bump `VERSION` when releasing a change.
- `manifest.webmanifest` and `icons/` cover the Home Screen name and icon.
- `tests/totals.test.js` checks that the totals at the top of the Budget tab match the lines listed, on later months, after a bill is added (made-up data). Run `node tests/totals.test.js`; it needs Python 3 and Playwright.
