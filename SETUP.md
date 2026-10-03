# Soup Cook Off sign-up: setup (about 5 minutes)

Anyone with the link can sign up. No accounts needed. Every soup becomes a row in a Google Sheet that you can watch live.

You need: a Google account (free) and a computer.

## 1. Make the sheet
1. Go to <https://sheets.new> while signed in to Google.
2. Rename it **Soup Cook Off Sign-Ups** (click "Untitled spreadsheet" at the top left).

## 2. Add the code
1. In the sheet, click **Extensions > Apps Script**. A code editor opens in a new tab.
2. You'll see a file called `Code.gs` with a few lines of starter code. Select everything in it, delete it, and paste the full contents of `apps-script/SoupCookOff.gs` from this repo. This one file holds everything, so there is nothing else to paste. It is long; use select-all (Ctrl+A or Cmd+A) in the source, then copy.
3. Click the **Save** icon (or press Ctrl+S / Cmd+S).

(`Code.gs` and `Index.html` in the same folder are the same program split into two files, if you ever want to edit the page. You don't need them for setup.)

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
1. Open the link yourself. The first load takes a few seconds because it creates three tabs in your sheet: **Sign-ups**, **Totals** and **Organizers**.
2. Sign up as a test cook. Switch back to your sheet and the rows are there.
3. Delete the test rows in the sheet (right-click the row number > Delete row).

## How the tasting stays blind
- The public page only receives **soup names and counts**. Cook names are never sent to it, so nobody can find them by looking at the page.
- Each cook's own name comes back only to that cook's browser, so they can change or withdraw their sign-up.
- Cook names are visible in two places only: the **Sign-ups** tab of your sheet, and the organizer view described next.

## Organizers
The page can show the full roster (cooks, categories, soups, times) to organizers. It needs a passcode, and the list of organizers lives in your sheet.

- **Open the Organizers tab.** It starts with one row for you and a random passcode.
- **To add an organizer,** add a row: their name, and a passcode (4 or more characters). Tell them the passcode.
- **To remove an organizer,** delete their row. They are signed out on the next refresh.
- **To use it,** open the sign-up link, scroll to the bottom, tap **Organizer sign-in**, and enter a passcode. The page remembers you on that device until you tap **Sign out**.
- In that view you can **Edit** a soup (cook, category, soup name), **Remove** a soup, and **Copy list** (soups grouped by category, with cook names).
- Anyone who can open the spreadsheet can read the passcodes, so share the sheet only with organizers.
- 30 wrong passcodes in ten minutes pause organizer sign-in for a while. The sheet itself still works.

## Running it
- **Watch the list:** keep the sheet open (or use the Google Sheets app on your phone). Rows appear as people sign up. The **Totals** tab counts soups and cooks per category.
- **Remove a soup or a whole cook:** delete the row in the sheet, or use **Remove** in the organizer view. The page updates within a few seconds.
- **Add a soup yourself:** type a row on the Sign-ups tab: the cook's name, the category (pick it from the dropdown), and the soup name. A row missing any of the three is ignored.
- **Cooks can change or withdraw** their own sign-up from the same phone or browser they used. From a different device, ask them to tell you and fix the rows.
- **One cook, several soups:** each soup is its own row. A cook can enter more than one soup in the same category.

## If you already set up an earlier version
Paste the new `SoupCookOff.gs` over the old `Code.gs`, and delete the old `Index` file, then do the steps under "If you change the code later". The sheet keeps your old tabs as backups named "Old sign-ups ..." and "Old totals ...", and makes fresh **Sign-ups**, **Totals** and **Organizers** tabs. Old sign-ups are not carried over, so copy any real ones across by hand.

## If you change the code later
Edit the file, then **Deploy > Manage deployments**, click the pencil, set Version to **New version**, and click **Deploy**. The link stays the same.

## Good to know
- Google shows a small gray bar at the top of pages like this ("This application was created by another user, not by Google"). It is Google's own notice for scripts and can't be removed.
- The `preview.html` file in this repo is a demo of the page that runs only in a browser, with sample soups. It is not the live sign-up.

## On a phone
The page works like an app on a phone: a bottom bar switches between **Sign up**, **Soups** and (once an organizer signs in) **Organizer**. For an app icon, open the link on the phone and use Share > **Add to Home Screen** (iPhone) or the browser menu > **Add to Home screen** (Android).
