# Lucid OS: notes for Claude

- Single-page Claude artifact. Source in `src/`, built by `python3 scripts/build.py` into `dist/lucid-os.html`.
- Live artifact: https://claude.ai/artifact/Whr8uTA7z4by3d8wvt1VcU. Publish updates to that URL; omit `capabilities` on republish so the stored declaration (db with a `source` owner-write rule, user with profile scope, mcp ClickUp `clickup_filter_tasks` + `clickup_get_workspace_hierarchy`, downloads, sample) carries forward.
- Rendering: views are template-string functions registered on `VIEWS`; `render()` rebuilds `#main`. Events are delegated in `onClick`/`onChange` via `data-act`. Modals live in `#modal`.
- Writes go through `upsertItem`, `saveEntry`, `saveFin`, `saveConfig`; each writes an audit row. Keep that.
- After any change to `core.js` payout math, run `node tests/payouts.test.js` (needs `data/` seed; see README).
- Style: plain copy, no em dashes, colors only via CSS tokens.
