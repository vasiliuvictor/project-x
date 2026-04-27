#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// --- Parse CLI flags ---
const args = process.argv.slice(2);
const autoMode = args.includes('--auto');

const jobUrlFlag = (() => {
  const idx = args.indexOf('--job');
  return idx !== -1 ? args[idx + 1] : null;
})();

const limitFlag = (() => {
  const idx = args.indexOf('--limit');
  if (idx === -1) return 1;
  const n = parseInt(args[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
})();

const maxStepsFlag = (() => {
  const idx = args.indexOf('--max-steps');
  if (idx === -1) return null;
  const n = parseInt(args[idx + 1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
})();

const candidateFlag = (() => {
  const idx = args.indexOf('--candidate');
  if (idx === -1) return null;
  const val = args[idx + 1]?.toLowerCase();
  if (val === 'andrei' || val === 'cristina') return val;
  console.error(`Error: --candidate must be "andrei" or "cristina".`);
  process.exit(1);
})();

const CANDIDATE_TECHNOLOGIES = {
  andrei:   ['Angular', 'Java', 'JavaScript', 'TypeScript', 'Frontend', 'Fullstack'],
  cristina: ['Database', 'Oracle', 'SQL', 'PL/SQL'],
};

const INSTRUCTIONS_PATH        = resolve(__dirname, 'assets/instructions.md');
const INSTRUCTIONS_ANDREI_PATH  = resolve(__dirname, 'assets/instructions-andrei.md');
const INSTRUCTIONS_CRISTINA_PATH = resolve(__dirname, 'assets/instructions-cristina.md');
const CV_ANDREI_PATH            = resolve(__dirname, 'resumes/CV-Andrei-Victor-Vasiliu.pdf');
const CV_CRISTINA_PATH          = resolve(__dirname, 'resumes/CV-Cristina-Vasiliu.pdf');
const APPLIED_PATH              = resolve(__dirname, 'data/applied.json');

// --- Validate assets ---
if (!existsSync(INSTRUCTIONS_PATH)) {
  console.error('Error: assets/instructions.md not found.');
  process.exit(1);
}
if (!existsSync(INSTRUCTIONS_ANDREI_PATH) || !existsSync(INSTRUCTIONS_CRISTINA_PATH)) {
  console.error('Error: candidate instruction files missing.');
  process.exit(1);
}

// --- Pre-load instruction files to eliminate Read tool round trips ---
const ANDREI_CONTENT   = readFileSync(INSTRUCTIONS_ANDREI_PATH, 'utf-8');
const CRISTINA_CONTENT = readFileSync(INSTRUCTIONS_CRISTINA_PATH, 'utf-8');

// --- Applied log helpers ---
function loadApplied() {
  if (!existsSync(APPLIED_PATH)) return [];
  try { return JSON.parse(readFileSync(APPLIED_PATH, 'utf-8')); } catch { return []; }
}

function saveApplied(records) {
  const dir = dirname(APPLIED_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(APPLIED_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

function findRecord(applied, url) {
  return applied.find(r => r.url === url);
}

function upsertRecord(applied, record) {
  const idx = applied.findIndex(r => r.url === record.url);
  const now = new Date().toISOString();
  if (idx !== -1) {
    applied[idx] = { ...applied[idx], ...record, updatedAt: now };
  } else {
    applied.push({ ...record, appliedAt: now, updatedAt: now });
  }
  return applied;
}

// --- Load jobs ---
function loadJobs() {
  const dataPath = resolve(__dirname, 'data/jobs.json');
  if (!existsSync(dataPath)) return [];
  try {
    const jobs = JSON.parse(readFileSync(dataPath, 'utf-8'));
    return Array.isArray(jobs) ? jobs : [];
  } catch { return []; }
}

// --- Filter jobs by candidate ---
function filterByCandidate(jobs, candidate) {
  if (!candidate) return jobs;
  const techs = CANDIDATE_TECHNOLOGIES[candidate].map(t => t.toLowerCase());
  return jobs.filter(j => techs.includes((j.technology ?? '').toLowerCase()));
}

// --- Pick next unapplied job ---
function pickNextJob(jobs, applied) {
  return jobs.find(j => {
    const rec = findRecord(applied, j.url);
    return !rec || rec.status === 'error';
  }) ?? null;
}

function detectMaxSteps(output) {
  return /maximum turns reached/i.test(output ?? '');
}

// --- Select candidate profile at build time (no Read tool needed) ---
function resolveCandidate(job) {
  if (candidateFlag === 'andrei') return { name: 'andrei', profile: ANDREI_CONTENT, cv: CV_ANDREI_PATH };
  if (candidateFlag === 'cristina') return { name: 'cristina', profile: CRISTINA_CONTENT, cv: CV_CRISTINA_PATH };

  // Auto-route based on job technology field or title
  const haystack = `${job.technology ?? ''} ${job.title ?? ''}`.toLowerCase();
  const andreiKeywords = ['angular', 'java', 'javascript', 'typescript', 'frontend', 'fullstack', 'full-stack', 'react', 'vue', 'mcp'];
  const cristinaKeywords = ['oracle', 'pl/sql', 'plsql', 'sql developer', 'database', 'dba', 'etl'];
  const matchesAndrei   = andreiKeywords.some(k => haystack.includes(k));
  const matchesCristina = cristinaKeywords.some(k => haystack.includes(k));

  if (matchesCristina && !matchesAndrei) return { name: 'cristina', profile: CRISTINA_CONTENT, cv: CV_CRISTINA_PATH };
  return { name: 'andrei', profile: ANDREI_CONTENT, cv: CV_ANDREI_PATH }; // default
}

// --- Build Claude prompt ---
function buildPrompt(job) {
  const candidate = resolveCandidate(job);

  const submitInstruction = autoMode
    ? 'After filling all fields, find and click the Submit / Send application / Skicka ansökan button to submit the application.'
    : 'STOP before submitting. Do NOT click any submit button. Instead, print a clear table showing every field you filled: | Field name | Value used |. The user will review and re-run with --auto when ready.';

  return `You are helping me apply for a job. Use the Playwright MCP browser tools to control a real browser.

## Job Details
Title: ${job.title}
Company: ${job.company}
URL: ${job.url}
Description: ${job.description ? job.description.substring(0, 400) : 'not available'}

## Selected Candidate Profile
Candidate: ${candidate.name}
CV path: ${candidate.cv}

${candidate.profile}

## Your Task

1. Navigate to: ${job.url}

2. Look for an Apply button. Try these in order:
   - Visible button/link with text: "Apply now", "Apply", "Ansök nu", "Ansök", "Apply for this job"
   - Any link with "apply" in the href
   Click it. If the page already IS the application form, skip this step.
   If you cannot find an Apply button and the page is not a form, stop and explain what you see.

3. Check whether the application is via EMAIL or via a WEB FORM:
   - EMAIL application: the page shows an email address to send the application to (e.g. "Send your CV to jobs@company.com", a mailto: link, or explicit instructions to email).
   - WEB FORM application: the page contains input fields to fill in directly.

   If it is an EMAIL application:
   - Extract the destination email address.
   - Compose a short subject line: "Application – ${job.title} – ${candidate.name === 'andrei' ? 'Vasiliu Andrei-Victor' : 'Vasiliu Cristina'}"
   - Write a concise email body (3 short paragraphs) following the candidate's cover letter preferences above.
   - Output ONLY the following JSON block and nothing else (no extra text before or after):
   \`\`\`json
   {"applicationEmail":"<address>","emailSubject":"<subject>","emailBody":"<body with \\n for newlines>"}
   \`\`\`
   Then stop — do not interact with the page further.

4. (Web form only) Take a snapshot to see the current form state.

5. (Web form only) Identify ALL fillable text/textarea fields visible on the page at once, then call browser_fill_form in a single call with all of them mapped to the correct values from the candidate profile above. Do not fill fields one by one.
   - For dropdowns: use browser_select_option.
   - For checkboxes/radio buttons: use browser_click.
   - For file upload fields (CV/resume): use browser_file_upload with the CV path: ${candidate.cv}
   - For cover letter / personligt brev fields: only fill if it is a plain text input or textarea. Skip rich text editors (iframe-based, TinyMCE, Quill) entirely.

6. (Web form only) For multi-step forms: after filling all fields on the current step, click Next / Continue / Nästa and repeat from step 4 until you reach the final submit step.

7. (Web form only) ${submitInstruction}

## Rules
- If you encounter a CAPTCHA: stop, describe it, and tell me to solve it in the browser window.
- If the site requires login: stop and tell me the login URL.
- Never invent personal information not present in the candidate profile above.
- Cover letter: English only, plain text fields only.
- GDPR / data processing consent checkboxes: check them.
- Optional newsletter / marketing opt-in checkboxes: leave unchecked.`;
}

const ALLOWED_TOOLS = [
  'mcp__playwright__browser_navigate',
  'mcp__playwright__browser_snapshot',
  //'mcp__playwright__browser_take_screenshot',
  'mcp__playwright__browser_click',
  'mcp__playwright__browser_fill_form',
  'mcp__playwright__browser_type',
  'mcp__playwright__browser_select_option',
  'mcp__playwright__browser_file_upload',
  'mcp__playwright__browser_wait_for',
  'mcp__playwright__browser_close',
  'mcp__playwright__browser_press_key',
  'mcp__playwright__browser_hover',
  'mcp__playwright__browser_evaluate',
].join(',');

// --- Parse email fields from Claude output if it emitted the JSON block ---
function parseEmailBlock(output) {
  const match = output.match(/```json\s*(\{[\s\S]*?\})\s*```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    if (parsed.applicationEmail) return parsed;
  } catch { /* not valid JSON */ }
  return null;
}

// --- Run Claude for one job ---
function runClaude(job) {
  const prompt = buildPrompt(job);

  if (autoMode) {
    saveApplied(upsertRecord(loadApplied(), {
      url: job.url, title: job.title, company: job.company, status: 'in_progress', mode: 'auto',
    }));
  }

  const claudeArgs = ['--print', '--model', 'claude-haiku-4-5-20251001', '--allowedTools', ALLOWED_TOOLS];
  if (maxStepsFlag) claudeArgs.push('--max-turns', String(maxStepsFlag));

  const result = spawnSync(
    'claude',
    claudeArgs,
    { input: prompt, stdio: ['pipe', 'pipe', 'inherit'], encoding: 'utf-8', env: process.env },
  );

  // Relay Claude's stdout to the terminal so the user sees it
  if (result.stdout) process.stdout.write(result.stdout);

  if (result.error) {
    console.error('Failed to launch Claude CLI:', result.error.message);
    if (autoMode) {
      saveApplied(upsertRecord(loadApplied(), {
        url: job.url, title: job.title, company: job.company, status: 'error', mode: 'auto',
      }));
    }
    return 1;
  }

  const emailFields = parseEmailBlock(result.stdout ?? '');

  if (emailFields) {
    console.log('\n  EMAIL APPLICATION DETECTED');
    console.log(`  To:      ${emailFields.applicationEmail}`);
    console.log(`  Subject: ${emailFields.emailSubject}`);
    console.log(`  Body:\n${emailFields.emailBody.split('\\n').map(l => `    ${l}`).join('\n')}`);
    if (autoMode) {
      saveApplied(upsertRecord(loadApplied(), {
        url: job.url, title: job.title, company: job.company,
        status: 'email_pending', mode: 'auto',
        applicationEmail: emailFields.applicationEmail,
        emailSubject: emailFields.emailSubject,
        emailBody: emailFields.emailBody,
      }));
      console.log('  Logged as: email_pending → data/applied.json');
    }
    return 0;
  }

  if (autoMode) {
    const hitMaxSteps = maxStepsFlag && ((result.status ?? 1) !== 0 || detectMaxSteps(result.stdout));
    const status = hitMaxSteps ? 'max_steps' : (result.status ?? 1) === 0 ? 'successful' : 'error';
    saveApplied(upsertRecord(loadApplied(), {
      url: job.url, title: job.title, company: job.company, status, mode: 'auto',
    }));
    console.log(`\n  Logged as: ${status} → data/applied.json`);
  }

  return result.status ?? 0;
}

// --- Main ---
(async () => {
  if (jobUrlFlag) {
    const applied = loadApplied();
    const existing = findRecord(applied, jobUrlFlag);
    if (existing?.status === 'successful') {
      console.log(`\n  Already successfully applied to: ${jobUrlFlag}`);
      console.log(`  Applied at: ${existing.appliedAt}`);
      console.log('  Remove or edit the entry in data/applied.json to re-apply.\n');
      process.exit(0);
    }
    const jobs = loadJobs();
    const match = jobs.find(j => j.url === jobUrlFlag);
    const job = match || { title: 'Job', company: 'Unknown', url: jobUrlFlag, description: '' };

    console.log(`\n  Applying to: ${job.title} at ${job.company}`);
    console.log(`  URL: ${job.url}`);
    console.log(`  Mode: ${autoMode ? 'AUTO (will submit)' : 'DRY RUN (will stop before submit)'}\n`);

    process.exit(runClaude(job));
  }

  // Queue mode: process up to --limit jobs
  const jobs = loadJobs();
  if (jobs.length === 0) {
    console.error('No jobs found in data/jobs.json. Run the scraper first (npm start).');
    process.exit(1);
  }

  const candidateLabel = candidateFlag ? ` [candidate: ${candidateFlag}]` : '';
  const stepsLabel = maxStepsFlag ? `  |  Max steps: ${maxStepsFlag}` : '';
  console.log(`\n  Mode: ${autoMode ? 'AUTO (will submit)' : 'DRY RUN (will stop before submit)'}${candidateLabel}  |  Limit: ${limitFlag} job(s)${stepsLabel}\n`);

  let processed = 0;
  let lastExitCode = 0;

  for (let i = 0; i < limitFlag; i++) {
    const applied = loadApplied();
    const pool = filterByCandidate(jobs, candidateFlag);
    const job = pickNextJob(pool, applied);

    if (!job) {
      console.log('  No more unapplied jobs found in the queue.\n');
      break;
    }

    console.log(`  [${i + 1}/${limitFlag}] Applying to: ${job.title} at ${job.company}`);
    console.log(`  URL: ${job.url}\n`);

    lastExitCode = runClaude(job);
    processed++;
  }

  if (processed === 0) {
    console.log('  All matching jobs have already been applied to successfully.\n');
  } else {
    console.log(`\n  Done. Processed ${processed} job(s).\n`);
  }

  process.exit(lastExitCode);
})();
