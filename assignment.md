# Build assignment: Full Stack Intern

## The idea
Build a small web app where someone uploads a spreadsheet, builds a short report from it, and shares the report with a link. The twist: every number has to show its work. Click a number and the app explains exactly how it was calculated. Then explain how the whole thing works. We will run it, watch your demo, read your explanation, and compare submissions side by side. The strongest builders get a live walkthrough, where we ask you to change something live.

This is a good test because it looks simple and is full of real decisions. Spreadsheets arrive messy, numbers need to be right and traceable, and a shared link must show exactly what you meant to share and nothing more.

## Read this first
- We send you no files. Bring your own CSV: make one up, or use any public dataset (a few thousand rows is plenty). Make it a little messy on purpose, with blanks, bad dates, and odd values, so we can see how your app copes. Do not use personal data.
- Use any stack and any AI tools you like. A live link is welcome but not required.
- Plan for 4 to 5 hours. If you pass 5.5 hours, stop, ship what you have, and say what you cut. Cut scope before quality.
- You must be able to explain every line you submit.

## What to build: a show-your-work report builder
Your app must:

1. Have accounts. Sign-in (any simple approach). Each user sees only their own datasets and reports, and this is enforced where the data is read, not only in the screens.

2. Take a CSV upload. Parse it on the server, guess each column's type (number, date, category, or text), and show a profile: row count, missing values per column, and any rows that could not be read, with the reason. Nothing is silently dropped.

3. Build a report. A report is a list of blocks the user can add, remove, and reorder: a metric (sum, average, count, min, or max of a column, optionally split by a category), a chart (bar or line), a table (top rows by a column), and a text note. A report-level filter, such as a date range or a category, applies to every block.

4. Show its work. Every metric, chart, and table has a “How was this calculated?” panel with a plain-English description, the exact aggregation or query that ran, and how many rows were included and excluded. Compute numbers on the server so the same number appears everywhere it is shown.

5. Share by link. The owner can create a read-only link that works without sign-in, set an expiry, and revoke it instantly. A viewer sees the report as the owner built it, and must not be able to reach the raw file, other reports, or anyone else's data.

6. Handle real conditions. Loading, empty, and error states; a layout that works at phone width; keyboard use; validation on the server; clear messages for files that are too large, not a CSV, or badly encoded; no SQL built from raw user input; text from the file shown as plain text.

7. Test the risky parts. At minimum: the aggregation logic, one bad-file case, and a test that an expired or revoked link, and another user's report, cannot be opened.

8. Run on our machine in a few commands, or be live at a link you send.

Optional, pick at most one: export a report as a PDF or image, suggested charts when a file is uploaded, a “what changed” view when a shared report is edited, or comments on a report.

## Explain it
This is half of the assignment. In your README, write “How my report builder works” in two pages at most. Cover how column types are guessed and what happens to bad rows, how a number gets from the file to the screen and how you keep it consistent, how the share link works and why it is safe, what could still go wrong, and what would break first with files 100 times larger.

Then record a 3 to 4 minute demo that shows: uploading a messy CSV and reading its profile, building a report with each kind of block, opening “How was this calculated?” on two numbers, sharing the link and opening it in a private window, revoking it and showing that it stops working, and trying a bad file.

## What to send us
Email careers@bytevox.ai with a link to your repository (private is fine, share read access), your demo video, and optionally a live link. Your README should cover: what you built; how to run it in a few commands; the “How my report builder works” write-up; your decisions and trade-offs; what you cut for time; hours spent; and how you used AI, including one place it was wrong and how you caught it.

## What we look at
Whether the numbers are right and traceable. Whether ownership and sharing are enforced on the server, because we will try to open things we should not be able to open. Whether messy input is handled honestly instead of quietly dropped. Whether the screens feel finished and usable. Whether your explanation is clear enough for someone who did not write the code to follow, and whether you are honest about what is missing.

At the live walkthrough we will ask you to change something live, for example adding a median metric or a new kind of filter. A small app that is correct and honest beats a big one that is broken.

## Next step and privacy
If your submission moves forward, we will be in touch about a short live walkthrough. We keep submissions for 6 to 12 months if you are not selected, and use them only for this hiring decision.