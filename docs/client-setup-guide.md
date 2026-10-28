# Your Agent Tracker: setup guide

Setup takes about 15 minutes. Use a **computer** for steps 1 to 5, then your phone for step 6.
Follow the steps in order. Every step tells you what you should see when it worked.

---

## 1. Before you start

1. Open **Chrome** on your computer and sign in with **rcarrizosa.csb@gmail.com**.
2. **Important:** if Chrome is signed in to other Google accounts too, open a window with
   only this account: Chrome menu **⋮ > New Incognito window**, then sign in there.
   (Several accounts at once is the most common reason setup fails.)
3. Make sure 2-step verification is on: Google Account > **Security** > **2-Step
   Verification**.

## 2. Make your copy

1. Open this link:
   https://docs.google.com/spreadsheets/d/1jJ0o1_0xdwXYY5MMFi88TGNWjBMmylTHJgWdLJZI3yY/copy
2. Click **Make a copy**. You can rename it, for example "Agent Tracker".

✅ **You should see:** your own spreadsheet opens. It's in your Google Drive. Only you can
see it; I can't open it.

## 3. Allow the tracker

1. Wait a few seconds until the **Agent Tracker** menu appears at the top (after
   **Help**). If it doesn't appear, reload the page.
2. Click **Agent Tracker > Set up workbook**.
3. Google asks for permission:
   1. Click **OK** or **Continue**, then choose your account.
   2. You'll see **"Google hasn't verified this app"**. That's normal for a private tool
      made just for you. Click **Advanced**, then **Go to Agent Tracker (unsafe)**.
   3. If there are boxes to tick, tick **all** of them. Click **Allow**.

## 4. Set up the workbook

1. Click **Agent Tracker > Set up workbook** again.
2. Wait about a minute.

✅ **You should see:** "Workbook is ready", and tabs at the bottom: Dashboard, Clients,
Policies, Leads, and so on.

## 5. Create your phone app

1. Click **Extensions > Apps Script**. A new tab opens.
2. Click the blue **Deploy** button (top right) > **New deployment**.
3. Click the gear ⚙ next to "Select type" and choose **Web app**.
4. Fill in:
   - **Description:** Phone app
   - **Execute as:** Me
   - **Who has access:** Only myself
5. Click **Deploy**. If Google asks for permission again, do the same as in step 3.
6. Click **Done** and close that tab. Don't change anything else there.

## 6. Put it on your phone

1. Back in the spreadsheet, click **Agent Tracker > Phone app link**.
2. Copy the link and email it to yourself.
3. On your phone, open the email and open the link in **Chrome**. Chrome on the phone must
   be signed in to rcarrizosa.csb@gmail.com.
4. Tap **⋮ > Add to Home screen**.

✅ **You should see:** the Agent Tracker home screen with buttons: New client, Client from
screenshots, New lead, Add expense, plus Hours and Mileage.

**Setup is done.** 🎉

---

## 7. Check your settings (5 minutes)

Open the **Settings** tab in the spreadsheet. Everything there can be changed by you at any
time. Check these:

- **Lead costs:** the price of each lead type (Yes $10, Survey $23, Mail-in $40).
- **Commission rates:** your rate for each plan, by age. Add or change rows when a carrier
  changes your rates.
- **Plans:** each plan and how many months of advance it pays (0 = paid as earned).
  **Medicare** is set to $36 a month per policy: when your Medicare contract comes, change
  the amount in the "Flat $ a month" column.
- **Carriers:** add a carrier when you start with a new one.

## 8. Using it day to day

- **On your phone:** add clients, leads, expenses (with a receipt photo), clock in/out for
  hours, and start/stop mileage trips. **Client from screenshots** reads a contact from
  phone screenshots; check the details before saving.
- **When you write a policy:** pick the **Plan**. The tracker uses it to work out your
  advance, commission earned and any chargeback.
- **When a policy changes** (paid, lapsed, cancelled): change the **Status** on the
  Policies tab and enter the **Status date**.
- **If the months paid is wrong** compared to your carrier statement: type the right number
  in **Months paid (if different)**.
- **Red text** means something needs checking, for example "Check age" (birthday has no
  year) or "Check carrier" (the plan belongs to another carrier).
- **Dashboard:** your totals for the year: sales, leads, commission, chargebacks, expenses.
- **Monthly Excel copy:** saved to your Google Drive automatically the first time you open
  the phone app each month.

The tracker never asks for and should never hold Social Security numbers, bank details or
driver's license numbers.

## Later: giving your assistant access

1. Click **Agent Tracker > Assistant workbook**, then **Open the assistant workbook**.
2. Click **Share** and add your assistant's email as **Editor**.

They only see names, phones, lead follow-ups, carrier, policy number and status. To stop
their access, remove them under **Share**.

---

## If something goes wrong

| Problem | Fix |
|---|---|
| No **Agent Tracker** menu | Reload the page and wait 10 seconds. |
| "Sorry, unable to open the file" or an error on the phone link | Chrome is signed in to more than one Google account. Use an Incognito window, or sign out of the other accounts. |
| "Authorization required" | Do step 3 again and tick all the boxes. |
| The phone link asks you to sign in | Sign in with rcarrizosa.csb@gmail.com. |
| Something else | Send me a screenshot of the screen. If I need to fix it, share the spreadsheet with me as **Editor** for that day (**Share** > my email), and remove me when I'm done. |
