# Job Application — Candidate Router

This file is the entry point. Before filling any application form, read the job title, company description, and required skills, then load the correct candidate profile below.

---

## Candidate Selection Rules

### Load `instructions-andrei.md` when the job posting contains any of:
- Angular, AngularJS, Angular 2+
- TypeScript, RxJS
- Java, Spring Boot, Spring Framework
- Frontend developer / engineer
- Full-stack developer / engineer
- JavaScript (if paired with a framework like Angular/React/Vue)
- MCP, Model Context Protocol, AI tooling

**CV to attach:** `assets/cv-andrei.pdf`

---

### Load `instructions-cristina.md` when the job posting contains any of:
- Oracle, Oracle DB, Oracle Database
- PL/SQL, PLSQL
- SQL Developer, Database Developer, Database Engineer
- Stored procedures, stored functions, triggers
- ETL, data import, data pipeline (database-focused)
- DBA, database administrator (junior/mid)
- Fintech / banking (database-focused roles)

**CV to attach:** `assets/cv-cristina.pdf`

---

## Conflict / Ambiguity Rules

| Situation | Action |
|-----------|--------|
| Job mentions both Angular **and** Oracle/PL/SQL | Load **both** profiles; pick the one whose experience best matches the seniority and primary focus of the role |
| Job is generic "Software Developer" with no clear stack | Load **Andrei** (broader tech stack, more years of experience) |
| Job is database-heavy but mentions Java | Load **Cristina** if PL/SQL is the primary requirement; load **Andrei** if Java backend is the primary requirement |
| Job posting is in Swedish | Write the cover letter in Swedish, regardless of which candidate is selected |
| Job posting is in English | Write the cover letter in English |

---

## After loading the correct profile

Follow all instructions in that profile file exactly:
- Use the personal information, email, phone, and LinkedIn from that file
- Attach the CV file specified in that file
- Apply the cover letter tone, length, and skills emphasis from that file
- Use the years-of-experience values from that file when filling numeric fields
- Do NOT mix contact details or CV files between candidates