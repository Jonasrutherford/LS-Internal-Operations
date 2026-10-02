# Contributing

1. Branch off `main`: `git checkout -b your-name/what-you-are-changing`.
2. Edit files in `src/`. Never edit `dist/` by hand.
3. Run `python3 scripts/build.py && node --check dist/app.js`. If you touched `core.js`, also run the payout test.
4. Commit both `src/` and the rebuilt `dist/lucid-os.html`, then open a pull request.
5. Jonas or Carter reviews. Anything touching payout math (`payoutFor`, `periodRevenue`, `expensesIn`, `splitCents` in `core.js`) needs both partners to sign off.
6. After merge, publish `dist/lucid-os.html` (see README, Deploying).

Never commit spreadsheets, exports or anything from `data/`. Revenue and payout data stay in the app.
