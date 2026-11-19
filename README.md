# Misconception Detective

A fractions tutor for students in classes 5–8. Type your own fraction problem and get a verified, step-by-step explanation; practise with guided questions; and see your own activity in My progress.

- **Repository:** https://github.com/IamKishan08/misconception-detective
- **Live demo:** https://misconception-detective-612071683004.asia-south1.run.app
  *(Verified working on 2026-11-19, Cloud Run revision `misconception-detective-00003-gk9`, including a real Gemini request. See [`submission/VERIFICATION.md`](submission/VERIFICATION.md).)*
- **Submission materials:** [`submission/`](submission/) (summary, demo script, verification record, checklist, screenshots)

Educational effectiveness has **not** been validated with students. Nothing here claims learning gains.

## What the app does

Navigation: **Solve my problem** (the default), **Practise**, **My progress**. **Settings** (theme, what is stored and sent, deletion controls) is a button in the header.

### Solve my problem
Supported inputs (two fractions at a time, numbers 0–999):

| Type | Examples |
|---|---|
| Add, subtract, multiply, divide | `1/2 + 1/4`, `3/4 - 1/6`, `2/3 × 3/5`, `1/2 ÷ 3/4`, `2/3 x 3/5`, `1/2 plus 1/4`, `½ + ¼` |
| Compare | `Compare 2/3 and 3/4`, `which is smaller 2/3 or 3/4`, `2/3 vs 3/4` |
| Missing number in an equal fraction | `1/2 = ?/8`, `3/5 = 9/?` |

- The problem is read back as the app understood it before solving. Unsupported or ambiguous input (zero denominators, dividing by zero, decimals, mixed numbers, negative inputs, more than two fractions, unknown words, numbers over 999) gets a specific message and is **never silently changed**.
- **Check my working** compares your *final answer* exactly (cross-multiplication, never floating point). Equivalent answers are accepted; a correct but unsimplified answer is acknowledged as correct. The optional working box is only scanned for specific number patterns (such as `1 + 1` and `2 + 4`); the app **does not verify arbitrary working**.
- **Help me get started** gives hints and reveals one step at a time, with no wrong answer needed.
- A wrong answer is reported as an **observation** ("2/6 is smaller than 1/2, but adding can only make it bigger"). A **possible** reason is offered only when the answer matches a known pattern, labelled "not a diagnosis"; evidence is marked "final answer only" unless your working really shows it.
- Always visible: the original problem, your answer apart from the correct answer, Explain more simply, Why this step?, Show a visual, Give me a similar problem.
- Negative results use a number line; improper results use stacked whole bars; numbers too big to draw clearly get no picture rather than a misleading one.

### Practise
A short adaptive sequence (adding, comparing, equal fractions).
- A wrong answer never replaces the question. You choose Try again, Give me a hint, Explain step by step, Give me a similar problem, or continue (with the reason for the next question explained).
- Hints and the worked solution are available *before* answering, so nobody has to answer wrongly to get help. Repeated mistakes bring support automatically.
- Only a **first answer with no hint and no solution viewed** is independent evidence. Hints, viewed solutions and retries are recorded but never count towards "secure".

### My progress
Your own activity on this device only: problems from Solve my problem and Practise.
- Each item shows one outcome: **correct on your own**, **correct on a retry**, **correct with help**, **not yet correct**, or **help only, no answer**. Opening a solution is never treated as mastery.
- Topics practised (counts only), topics worth revisiting by a plain rule (latest activity was not a correct answer on your own), Practise status, and a recent-activity list where you can reopen the built-in explanation or practise a problem again.
- An honest empty state. No sample learners, no scores, no percentages. The most recent 100 items are kept.
- Earlier Practise progress is migrated (without dates) the first time history is created.

## What Gemini does, and what the engine does

| Deterministic engine (`src/engine/`) | Gemini (optional) |
|---|---|
| Parses problems, calculates every answer exactly, checks answers, writes every step, every concept explanation and every visual | Reads the student's short question and **selects** an intent and identifiers from a menu built for the current problem |
| Validates each selected identifier (does the step exist in this problem? does the concept apply? did the app itself find this possible mistake?) | Chooses between reviewed Practise explanation templates |
| Renders the chosen help from verified data and reviewed templates | **Writes no text that is ever displayed** |

Intents: explain a step, explain a concept (equal denominators, common denominator, why multiply both numbers, keep the denominator, why invert the divisor, multiply across, simplify, improper/mixed, negative results, comparing), explain more simply, show a visual, explain a possible mistake, help me start, clarification needed, out of scope.

Why this design: free-text model prose cannot be reliably verified (an earlier approach checked numbers and equations but accepted false sentences like "Add the denominators when adding fractions"). Now arbitrary model prose cannot reach the screen: the reply must match a strict schema, each id is re-validated server-side *and* in the browser, and only engine-rendered content is shown.

The interface always says who chose the help:
- **AI-selected help:** Gemini chose it and the choice was validated. The content is still built in.
- **Built-in help (AI was not available):** AI was tried but failed or was rejected; the app matched the question itself.
- **Built-in help (no AI used):** no key is configured.

The header badge says "AI-selected help (Gemini)" only after an accepted reply. A rejected or failed reply marks the AI as *failing*, never as working.

### Failure handling (server)
Failures are classified as missing key, authentication, quota/billing, unavailable model, timeout, malformed output, rejected output, provider error, or budget. Only a category is logged (never keys, prompts or student text) and the browser shows one simple message. Authentication, quota and bad-request errors are **never retried**; only 5xx/network errors get one retry. Kept: strict request schemas, 2 kB body limit, per-IP rate limit (30/min), 6 s timeout, 200-token output cap, per-instance budget (300 calls/hour). Limits are per Cloud Run instance, not deployment-wide.

### Configuration and live check
Environment variables: `GEMINI_API_KEY` (secret), `GEMINI_MODEL` (default `gemini-3.5-flash-lite`), `PORT`. The key stays server-side. Model availability was checked against the provider's own model list, not assumed.

`npm run smoke:gemini` makes seven real calls through the same service (auth, model, structured output, acceptance) and prints only selections and categories.

## Privacy
- **Stored on this device only (localStorage):** Practise progress, My progress history (problem numbers, your numeric answer, flags; max 100 items) and theme. Typed working and AI questions are never stored.
- **Sent to the server only when needed:** idea id and hint level (Practise explanations); a practice reason (≤ 200 chars) when an answer matches no pattern; and, only with a Gemini key and when you use "Ask about this problem", the problem's numbers, your question (≤ 200 chars) and ids of mistakes the app found. Solving, checking, steps and My progress happen in the browser.
- **Never sent:** your answers, working, progress or history. The server does not log request bodies.
- Settings can delete history, practice progress, or everything, each with a confirmation.

## Run locally

Requires Node 24 and npm.

```bash
npm ci
npm run build && npm start              # http://localhost:8080 (built-in help without a key)
# development (two terminals):
npm run dev:server
npm run dev:web
```

Optional Gemini: copy `.env.example` to `.env`, set `GEMINI_API_KEY` (never commit it), then `node --env-file=.env dist/server/server/index.js`. Check the connection with `npm run smoke:gemini`.

```bash
npm run typecheck && npm run lint && npm test
npm run build
npx playwright install chromium && npm run test:e2e   # desktop + phone viewports
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of these.

## Deploy (Cloud Run)

`deploy.sh` builds the `Dockerfile` with Cloud Build and deploys `misconception-detective` to `asia-south1` (public, 0–3 instances, 512 MiB). If a Secret Manager secret named `gemini-api-key` exists it is attached as `GEMINI_API_KEY`.

```bash
gcloud auth login
printf '%s' "$GEMINI_API_KEY" | gcloud secrets versions add gemini-api-key --data-file=-   # or `secrets create` the first time
PROJECT_ID=your-project ./deploy.sh
```

Grant the runtime service account `roles/secretmanager.secretAccessor` on the secret. Update a key by adding a secret version and redeploying (the service reads `latest`).

## Validation (last local run, 2026-11-19, Windows 11, Node 24.22.2)

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | clean |
| `npm test` | 348 tests in 13 files passed |
| `npm run build` | passed |
| `npm run test:e2e` | 26 passed (13 scenarios × desktop 1280×800 and Pixel 7) |
| `npm run smoke:gemini` (live) | 7/7 selections accepted on `gemini-3.5-flash-lite` |

Browser tests include axe-core **with colour contrast** in light and dark themes on Solve, My progress, Practise and Settings. Details and limits are in [`submission/VERIFICATION.md`](submission/VERIFICATION.md).

## Limitations
- Two fractions per problem, inputs up to 999, positive inputs only (answers may be negative); no decimals or mixed-number inputs.
- Possible-reason patterns are a short fixed list; no match means none is offered. Working is not verified beyond specific number patterns.
- Gemini's role is deliberately narrow (selecting help). It does not answer open-ended questions, and off-topic questions are declined.
- Step and concept text is English only and fixed in code.
- Practise covers three ideas; its thresholds are unvalidated heuristics. My progress counts activity; it is not a mastery measure.
- One device, no accounts, no teacher or class view. Rate limits, budget and cache are per instance.
- Not tested with real students or with screen-reader software; only automated accessibility checks were run.
