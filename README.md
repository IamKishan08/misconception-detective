# Misconception Detective

A fractions tutor for classes 5–8 with two parts:

- **Solve my problem** (the default screen): type your own fraction problem, optionally add your answer and working, and get a verified step-by-step explanation. Everything is calculated exactly in the browser; no AI or API key is needed.
- **Guided practice**: a short, adaptive sequence that looks for the likely idea behind a wrong answer, checks it with a follow-up, explains it, and re-checks with new numbers. Hints and explanations are available at any time and are never counted as independent mastery.

A **Teacher view** summarises Guided practice on the current device only. **Your data** says what is stored and sent.

No deployment URL is claimed here; none has been verified for this version.

## 1. Solve my problem

Supported (two fractions at a time, numbers 0–999):

| Type | Examples |
|---|---|
| Add, subtract, multiply, divide | `1/2 + 1/4`, `3/4 - 1/6`, `2/3 × 3/5`, `1/2 ÷ 3/4`, `2/3 x 3/5`, `1/2 plus 1/4`, `½ + ¼` |
| Compare | `Compare 2/3 and 3/4`, `which is smaller 2/3 or 3/4`, `2/3 vs 3/4` |
| Missing number in an equal fraction | `1/2 = ?/8`, `3/5 = 9/?` |

Whole numbers work as fractions (`2 × 3/5`). Answers can be fractions, whole numbers, negatives or mixed numbers (`1 1/4`).

How it behaves:
- The problem is shown back as the app read it (live, before solving) with a link to edit it. Unsupported or ambiguous input gets a specific message and **is never silently changed**: zero denominators, dividing by zero, decimals, mixed numbers or negatives as *inputs*, more than two fractions, `1/2 / 3/4`, `1/2 = 2/4` (no blank), unknown words, numbers over 999.
- "**Check my working**" compares your answer exactly (cross-multiplication, never floating point). Equivalent answers are right; a correct unsimplified answer is acknowledged as correct with optional simplification. Negative and improper results are handled; bars for values above one are drawn as several whole bars and negatives use a number line.
- "**Help me get started**" gives hints and reveals one step at a time, with no wrong answer needed. The correct answer appears only after the last step.
- The original problem stays visible. Your answer and the correct answer are separate tiles.
- A wrong answer is reported as an **observation** ("your answer is smaller than 1/2, but adding can only make it bigger"). A **possible** explanation (e.g. adding tops and bottoms) is shown only if the answer matches a known pattern, labelled "not a diagnosis". Evidence is marked as "final answer only" unless your typed working actually contains it (for example `1 + 1` and `2 + 4`).
- Follow-ups inside a problem: **Explain more simply**, **Why this step?**, **Show a visual**, **Give me a similar problem** (deterministic, same kind, always solvable).
- Optional, only if a Gemini key is configured: **Ask a short question** about the current problem.

Out of scope and not present: photo upload, word problems, decimals, other subjects.

## 2. How answers and explanations are verified

[`src/engine/solver/`](src/engine/solver/) is plain TypeScript with no `eval`, no expression library and no AI:

- `parse.ts` hand-written grammar for problems and answers; `frac.ts` exact signed fractions (BigInt cross-multiplication for comparison, bounded inputs so products stay far below 2^53); `solve.ts` computes the result independently and writes the steps; `check.ts` evaluates the student's answer; `similar.ts` generates similar problems.
- Every equation in every step carries a machine-checkable claim. `verifySolution` confirms each is true, and tests check it for **all** operand combinations 0–9/1–9 for each operation plus every comparison, against floating-point results, plus the 999-bound cases.

## 3. Optional AI follow-up (Gemini)

- `POST /api/ask` receives only the problem as numbers and the typed question (≤ 200 chars). The server **re-solves the problem itself** and gives the model those verified steps; the model never calculates.
- The reply must be JSON, ≤ 450 characters, plain text, and pass `src/ai/verify.ts`: no decimals/percentages/links/markup, every fraction and number must already appear in the verified solution, and every equation it writes (`a = b`, `a + b = c`) must be exactly true. Anything else is dropped and the UI says no AI answer is available; the built-in buttons still work.
- The header badge says "Live explanations (Gemini)" only after a real, accepted model reply; otherwise "Built-in explanations".
- Kept from before: strict request schemas (unknown fields rejected), 2 kB body limit, per-IP rate limit (30/min), 6 s timeout, one retry on transient errors, per-instance budget (300 calls/hour). The API key stays on the server. Limits are per Cloud Run instance, not deployment-wide.
- Guided practice still uses `/api/interpret` and `/api/explain` as before (free-text reason classification and two short supporting sentences; digits are banned in model sentences).
- Model: `GEMINI_MODEL`, default `gemini-3.5-flash-lite`, 400-token output cap, thinking minimal.

## 4. Guided practice learning flow

Rules in [`src/engine/progression.ts`](src/engine/progression.ts) (MVP heuristics, not validated mastery measures):

- A wrong answer **never replaces the question**. The engine keeps a *review* step with the same question, your answer and specific feedback. You choose: **Try again**, **Give me a hint**, **Explain step by step**, or move on. The planned next question (follow-up, different item, or new numbers) is created only when you press continue, with a sentence explaining why.
- Hints (up to two, never revealing the answer) and the worked solution are available on any question *before* answering, so nobody has to submit a wrong answer to get help.
- Support is shown automatically when the engine decides it is needed: a second wrong answer to the same question, an idea matching twice, or a second unrecognised wrong answer in the family. This replaces the earlier loop where unrecognised wrong transfer answers kept returning new transfer questions with no explanation.
- Evidence rules: the first wrong answer works as before (pattern → "possible" → follow-up → "likely"); repeat answers to the same question are recorded but never strengthen a label or streak; only a **first answer with no hint, no solution and no earlier try** is `independent` and can count towards "improving" or "secure" (two in a row). Teacher view marks attempts as "help used" or "repeat answer".
- Saved progress from the previous version loads (an interrupted explanation becomes the same question again).

## 5. Stale and duplicate async work

`StudentFlow` guards each model request with a request id, an `AbortController`, a mounted flag and a check against the *latest* state (same question, same counter). Switching topic, resetting (the screen is rebuilt), leaving the view, or answering again discards the old response; loading state always recovers; repeated clicks submit once. The follow-up question box in Solve my problem has the same protections. These are covered by tests that hold the request open (see `tests/web/flows.test.tsx`), and the guard was confirmed to matter by removing it and watching those tests fail.

## 6. Interface

Calm single-column layout on phones; on desktop the form and the explanation sit side by side. Visible labels ("Top number (numerator)"), light/dark/system theme saved on the device, gentle reveal animation that is removed under `prefers-reduced-motion`, keyboard operation with visible focus, focus moved to new results/steps, and live-region announcements. Spoken text for fractions and equations ("two quarters plus one quarter equals three quarters").

The Teacher view states that it is one device only, not a class roster, and does not include Solve my problem. Made-up example learners are **hidden by default**, badged "Made-up example", and never mix with real data.

## 7. Privacy

- *Stored on this device only (localStorage):* Guided practice progress and theme. Problems typed into Solve my problem live in page memory only.
- *Sent to the server:* idea id + hint level (explanation sentences); an optional practice reason (≤ 200 chars) when the answer matches no pattern; and only with a Gemini key and when you use "Ask a short question", the problem's numbers and your question.
- *Never sent:* your answers, typed working, progress or identifiers. Solving and checking happen in the browser. The server does not log request bodies.

## 8. Run and review locally

Node 24 and npm.

```bash
npm ci
npm run dev:server        # API on :8080 (terminal 1)
npm run dev:web           # Vite dev server (terminal 2)
# or the production build:
npm run build && npm start        # http://localhost:8080, built-in explanations without a key
```

Optional Gemini: copy `.env.example` to `.env`, set `GEMINI_API_KEY`, run `node --env-file=.env dist/server/server/index.js`.

Checks:

```bash
npm run typecheck && npm run lint && npm test
npm run build
npx playwright install chromium && npm run test:e2e   # desktop + phone viewports, against the build with no key
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs all of the above including the browser tests. Docker and Cloud Run files (`Dockerfile`, `deploy.sh`) are unchanged.

## 9. Results of the last local run (Windows, Node 24)

| Check | Result |
|---|---|
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm test` (10 files) | 266 tests passed |
| `npm run build` | passed |
| `npm run test:e2e` (13 scenarios × desktop 1280×800 and Pixel 7) | 26 passed |

The browser tests include axe-core **with colour contrast** in light and dark themes on the Solve and Guided practice screens. Not done: manual screen-reader testing, testing with real students, and a live Gemini run (no key was used; the Gemini path is tested with fake model clients only).

## 10. Limitations

- Two fractions per problem, inputs up to 999, positive inputs only (answers may be negative), no mixed-number or decimal inputs.
- Possible-explanation patterns are a short fixed list (e.g. adding across, not flipping when dividing, bigger-denominator-is-bigger, adding the same number to top and bottom); no match means no explanation is offered.
- Step text is English only and fixed in code; AI text is limited to a short checked answer and is stricter than necessary (an unlisted equivalent fraction in a reply makes it fall back).
- Guided practice covers three ideas only (adding, comparing, equal fractions). Thresholds are unvalidated heuristics; no learning-gain claims are made.
- Teacher view is single-device. Rate limit, budget and cache are per instance.
- Chat-style tutoring beyond one short question, photo input and other subjects are not implemented.
