# Job Application with Claude — Quick Guide

## How it works

`apply.js` picks a job from scraped results (or a URL you provide), builds a prompt, and fires Claude Code CLI with Playwright MCP to fill the application form in a real browser — using your CV and `assets/instructions.md` as the source of truth.

---

## Prerequisites

1. **Claude Code CLI** installed and authenticated (`claude --version` should work)
2. **Playwright MCP** configured in Claude Code (browser automation)
3. Your CV placed at `assets/cv.pdf`
4. `assets/instructions.md` filled in (already done — sourced from your resume)

---

## Setup (one time)

```bash
# 1. Place CVs
cp "path/to/andrei-cv.pdf" assets/cv-andrei.pdf
cp "path/to/cristina-cv.pdf" assets/cv-cristina.pdf

# 2. Start the scraper to populate jobs (optional — you can also use --job)
npm start
```

---

## Running an application

### Option A — Pick from scraped jobs (interactive)
```bash
node apply.js
```
Shows up to 30 scraped jobs. Type the number, press Enter. Claude opens the browser and fills the form.

### Option B — Target a specific job URL directly
```bash
node apply.js --job https://example.com/jobs/123
```

---

## Dry run vs. auto-submit

| Mode | Command | What happens |
|------|---------|--------------|
| **Dry run** (default) | `node apply.js` | Claude fills everything, then **stops** and prints a table of every field + value for your review |
| **Auto-submit** | `node apply.js --auto` | Claude fills everything and **clicks Submit** automatically |

**Recommended flow:** always dry-run first, verify the table, then re-run with `--auto`.

```bash
# Step 1 — review
node apply.js --job <url>

# Step 2 — submit after you're happy
node apply.js --job <url> --auto
```

---

## Application tracking

Every `--auto` run is logged to `data/applied.json` with one of three statuses:

| Status | Meaning |
|--------|---------|
| `in_progress` | Claude launched but hasn't finished yet (or crashed mid-run) |
| `successful` | Claude exited cleanly after submitting |
| `error` | Claude exited with a non-zero code |

**Duplicate protection:** if a URL already has status `successful`, the script skips it automatically:
- In list mode — already-applied jobs are hidden from the picker
- In `--job <url>` mode — prints a message and exits without launching Claude

Dry runs (`node apply.js` without `--auto`) are never written to `applied.json` since nothing was actually submitted.

To re-apply or reset a job, edit `data/applied.json` directly and remove or change the entry.

---

## What Claude handles automatically

- Navigating to the Apply button and opening the form
- Multi-step forms (clicks Next / Nästa between pages)
- Language matching — writes cover letter in Swedish or English based on the posting
- GDPR consent checkboxes — checked automatically
- Marketing/newsletter opt-ins — left unchecked
- Years of experience fields — calculated from CV dates

## What requires manual action

| Situation | What to do |
|-----------|-----------|
| **CAPTCHA** | Claude stops and takes a screenshot — solve it in the browser window, then tell Claude to continue |
| **Login required** | Claude tells you the login URL — log in manually, then re-run |
| **File upload (CV)** | Claude highlights the upload field — upload `assets/cv.pdf` manually in the browser |

---

## File reference

```
assets/
  instructions.md           ← candidate router (keyword → profile)
  instructions-andrei.md    ← Andrei's profile, cover letter prefs, experience
  instructions-cristina.md  ← Cristina's profile, cover letter prefs, experience
resumes/
  CV Andrei Victor Vasiliu.pdf  ← Andrei's CV
  CV_Cristina_Vasiliu.pdf       ← Cristina's CV
apply.js                        ← the launcher script
data/
  jobs.json                     ← scraped jobs (populated by npm start)
  applied.json                  ← application log (auto-created on first --auto run)
```

---

## Updating your instructions

Edit `assets/instructions.md` any time to change salary preference, tone, skills to emphasise, etc. Changes take effect on the next `node apply.js` run — no restart needed.