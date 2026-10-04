# Student Management System: Registry Module

This is my submission for the Student Registry assessment. It covers the four workflows in the brief: enrolling students, tracking fees and payments, collecting assessment submissions, and publishing marks and results.

## What it does

- **Enrolment.** Create and edit students (name, email, date of birth, programme, academic year, status). Each student gets a unique ID like `SMS-2025-0001`. You can search by name or ID and filter by programme and status.
- **Fees and payments.** A student's fee comes from their programme and is copied onto them at enrolment. You can record payments with an amount, a date and a unique reference. The outstanding balance is always worked out live from the payments.
- **Overdue balances.** Anyone who still owes money after their fee due date is flagged on the dashboard and in the student list.
- **Assessments and submissions.** Staff create assessments with a title, module and deadline. Students upload a PDF or DOCX and can replace it until the deadline. Late first submissions are accepted but marked **Late**.
- **Grades and results.** Staff enter a grade from 0 to 100 (Fail under 40, Pass 40-59, Merit 60-69, Distinction 70-100) and then publish or withhold each student's result individually. Students only ever see results that have been published.
- **Staff and student views.** A selector in the header switches between them.

## Tech stack

Next.js 16.3.8 (App Router, TypeScript), React 19, PostgreSQL 16, Prisma 5, Tailwind CSS and zod for validation. Uploaded files are saved to local disk. Tests use Node's built-in test runner through `tsx`.

A note on the version: the assessment asks for Next.js 16.3.18, but that version doesn't exist on npm. The latest stable 16.3 release I could find was 16.3.8, so that's what the project uses.

## Getting started

You'll need Node.js 20.9 or newer (Next.js 16 requires it), npm and a running PostgreSQL 16 database.

```bash
npm install
cp .env.example .env     # then set DATABASE_URL for your local PostgreSQL database
```

### Environment variables

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `UPLOAD_DIR` | Where uploaded PDF/DOCX files go (default `./uploads`, git-ignored) |
| `NEXT_PUBLIC_CURRENCY` | ISO currency code used for display (default `USD`) |

### Database

The schema is committed as a Prisma migration in `prisma/migrations`, so you can build the database from scratch:

```bash
npm run db:deploy    # applies the committed migrations
npm run db:seed      # loads demo data (this wipes existing registry data)
```

If you change `prisma/schema.prisma`, run `npx prisma migrate dev --name <change>` and commit the new migration. `npm run db:reset` drops and rebuilds everything.

### Demo data

The seed creates 2 programmes, 4 modules, 8 students, plus payments, 3 assessments, submissions and grades. I chose the data so every interesting case shows up: two overdue students, some fully paid and some part paid, all four enrolment statuses, a withdrawn student who still owes money, late submissions, and published and withheld results across Fail, Pass, Merit and Distinction.

### Running it

```bash
npm run dev    # http://localhost:3000
```

Other scripts: `npm run build`, `npm run typecheck`, `npm test` (business rules), `npm run test:api` (end-to-end API).

## Walkthrough for reviewers

1. Open the app in Staff view (the default) and look at the dashboard. Overdue balances are listed there.
2. Go to **Students** and try the search, then the programme and status filters.
3. Click **Enrol a new student**, then open that student and use **Edit student**.
4. Look at the student's fees and record a payment. Try an overpayment, a duplicate reference and a future date; each one is rejected with a clear message.
5. Open **Assessments** and create one.
6. Switch to Student view using the header selector and pick a student.
7. Submit a PDF or DOCX to an open assessment. Try a renamed `.exe` (it gets rejected), then replace your file before the deadline.
8. On an assessment whose deadline has passed, submit as a student who hasn't submitted yet and you'll see the **Late** flag.
9. Switch back to Staff view, open that assessment's marksheet and enter a grade.
10. The result will show as **Withheld**. Check as the student and it says "Not yet released".
11. As staff, click **Publish** for that student.
12. Switch to the student again. The grade and classification are now visible.

### About the roles

The Staff/Student selector is only there to make the demo easy. It is not authentication. It sets plain cookies that anyone can edit, so anyone can act as staff. The server does check the selected role on every staff route, and it limits student pages and file downloads to the selected student, but please don't treat it as a security boundary. More on that under Known limitations.

## Decisions I made

### Enrolment

- The student ID is `SMS-<academic year>-<sequence>`. The sequence comes from a per-year counter that is incremented inside the same transaction as the insert, so two enrolments at the same time can't get the same ID.
- The programme fee is copied onto the student when they enrol (`feeAmount`). If the programme's fee changes next year, existing students' balances stay as they were.
- `COMPLETED` is final. A completed student can't be reopened.
- Email must be unique and date of birth must be in the past.
- When editing, you can change name, email, date of birth, programme, academic year, status and fee due date. The student ID never changes, so it keeps the year it was created in. Fee and payment history can't be edited. Changing programme re-assigns the fee from the new programme, and it's blocked if the student already has submissions or results, or if what they've paid is more than the new fee.

### Fees and payments

- Money is stored as integer minor units, not floats.
- Outstanding balance is the fee minus the sum of payments, calculated whenever it's read. That way it can't drift out of sync.
- A student is overdue when the outstanding balance is above zero and the due date has passed. They show up on the dashboard (sorted by days overdue) and with a badge in the student list. Withdrawn students who still owe money stay flagged, since the Registry usually still has to chase the debt or formally waive it.
- A payment is rejected if it's more than the outstanding balance, zero or negative, dated in the future, has more than 2 decimal places, or reuses a reference. Payments dated "now" are always fine. I allow a 30-second tolerance for clock differences between browser and server, but no real grace window beyond that. Duplicate references are caught in the application and also enforced by a unique index. Recording a payment runs in a Serializable transaction, so two clerks can't overpay at the same time.

### Submissions

- Only students on the module's programme with status Enrolled can submit.
- Each student gets one submission per assessment, enforced by a database unique constraint. Resubmitting before the deadline replaces the file and deletes the old one.
- After the deadline, a first submission is still accepted and marked Late, but an existing submission can't be replaced. Otherwise someone could keep resubmitting and reset the late flag.
- Files must be PDF or DOCX, up to 10 MB. The extension, the declared MIME type (if the browser sends one) and the file signature all have to agree. A DOCX must also contain `word/document.xml`.

### Marksheet and results

- Grades are whole numbers from 0 to 100. Distinction is 70 and above, Merit 60 and above, Pass 40 and above, anything else is a Fail.
- Results are published or withheld one student at a time. There's no "publish all" button on purpose, because it would also release results that staff are holding back deliberately.
- If you change a grade that's already published, it goes back to withheld automatically. A student should never see a mark that staff have since changed without publishing it again.
- Students only get published rows from the database. Unpublished and ungraded results both show "Not yet released", so nothing leaks.
- Withdrawn students are left off marksheets, and the grades API refuses to grade them too, not just the UI.

## How the code is organised

- API routes live in `src/app/api/**`. They validate with zod and go through one `handle()` wrapper that turns validation, permission and unique-constraint errors into `{ error }` JSON with the right status code. The UI shows those messages inline.
- Business rules shared by the routes and the tests live in `src/lib`: `util.ts` (classification and balances), `validation.ts` and `upload.ts`.
- Pages are server components that read from Prisma directly. Changes go through the API routes, followed by `router.refresh()`.
- Staff-only routes call `requireStaff()`. Uploads use the student from the session, and file downloads check ownership.

## Known limitations

These are the things I'd tackle next.

- The role toggle is a plain cookie and isn't secure. A real version would use proper auth (Auth.js, for example) with roles on a user table.
- Uploads sit on local disk. In production I'd use object storage like S3 or R2 with signed URLs and virus scanning.
- Deadlines are parsed in the server's timezone. A real deployment should store and show an explicit institution timezone.
- The dashboard does its aggregation in application code. That's fine at this size, but with thousands of students I'd move the balance query into SQL.
- The student list has no pagination. Again, fine at this scale.
- I haven't tested concurrency yet (two clerks paying at once), and there's no UI-level test for the publish/withhold toggle. Those would be my next tests.

## Testing

**Business rules: `npm test`.** Runs on Node's test runner through `tsx` and needs no database. It covers grade classification at the boundaries (0, 39, 40, 59, 60, 69, 70, 100), grade validation (rejects -1, 100.1, 101 and empty), payment validation, fee and overdue calculation, and upload type detection (spoofed extensions, conflicting MIME types, ZIPs that aren't Word files).

**End-to-end API: `npm run test:api`.** 34 checks against a running instance and the real database:

```bash
npm run dev          # in one terminal
npm run test:api     # in another (set SMOKE_BASE to target a different URL)
```

It goes through the real HTTP routes: enrolment with auto ID and duplicate email, search and filters, payment validation and the live balance, student-versus-staff permissions, PDF and DOCX uploads (including a renamed executable), resubmission before the deadline, late submission and the blocked late resubmission, grade entry and range checks, and what the student sees when a result is published or withheld. It creates two student records and deletes them (and their files) afterwards, so the demo data is left alone. The two suites complement each other: the rules are unit-tested, then confirmed again through the API, transactions and unique constraints.

## AI usage

I used AI tools as an assistant while building this, mainly to talk through implementation approaches, review the Prisma data model, spot validation edge cases, debug, and review code structure and docs. I reviewed, changed and tested everything it suggested before using it, and I checked the final business rules and product decisions myself.

The decisions that mattered most were:

- generating student IDs inside a transaction
- copying the programme fee onto each student
- blocking overpayments
- how overdue balances are calculated
- one submission per student per assessment
- how late submissions are handled
- grade classification
- publishing results per student
- making sure students never get unpublished results
