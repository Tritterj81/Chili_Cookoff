# Soup Cook Off sign-up: setup (about 5 minutes)

Anyone with the link can sign up. No accounts needed. Every sign-up becomes a row in a Google Sheet that you can watch live.

You need: a Google account (free) and a computer.

## 1. Make the sheet
1. Go to <https://sheets.new> while signed in to Google.
2. Rename it **Soup Cook Off Sign-Ups** (click "Untitled spreadsheet" at the top left).

## 2. Add the code
1. In the sheet, click **Extensions > Apps Script**. A code editor opens in a new tab.
2. You'll see a file called `Code.gs` with a few lines of starter code. Select everything in it, delete it, and paste the full contents of `apps-script/Code.gs` from this repo.
3. Click the **+** next to "Files", choose **HTML**, and name it exactly `Index` (capital I; Google adds `.html`).
4. Select everything in that new file, delete it, and paste the full contents of `apps-script/Index.html`. It is a long file. Use select-all (Ctrl+A or Cmd+A) in the source, then copy.
5. Click the **Save** icon (or press Ctrl+S / Cmd+S).

## 3. Publish it as a link
1. Click **Deploy > New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Set:
   - Description: `Soup Cook Off`
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Click **Deploy**. Google asks you to authorize access:
   - Click **Authorize access** and choose your account.
   - If you see "Google hasn't verified this app", click **Advanced**, then **Go to (project name) (unsafe)**, then **Allow**. This is your own script, so it is safe to allow.
5. Copy the **Web app URL** (it ends in `/exec`). **This is the link you text to people.**

## 4. Try it
1. Open the link yourself. The first load takes a few seconds because it creates two tabs in your sheet: **Sign-ups** and **Totals**.
2. Sign up as a test person. Switch back to your sheet and the row is there.
3. Delete the test row in the sheet (right-click the row number > Delete row).

## Running it
- **Watch the list:** keep the sheet open (or use the Google Sheets app on your phone). Rows appear as people sign up. The **Totals** tab counts cooks per category.
- **Remove someone, or fix a duplicate:** delete their row. The page updates within a few seconds.
- **Add someone yourself:** type a row. Put a check mark (or any text) under each category they chose.
- **People can change or withdraw** their own sign-up from the same phone or browser they used. From a different device, ask them to tell you and fix the row.

## If you change the code later
Edit the file, then **Deploy > Manage deployments**, click the pencil, set Version to **New version**, and click **Deploy**. The link stays the same.

## Good to know
- Google shows a small gray bar at the top of pages like this ("This application was created by another user, not by Google"). It is Google's own notice for scripts and can't be removed.
- Keep the sheet private. The page does not need it to be shared.
