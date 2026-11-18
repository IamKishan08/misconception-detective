# Misconception Detective

An adaptive fractions assistant for classes 5–8. When a student gets a fraction question wrong, it spots the **likely faulty idea** behind the answer, **checks it with a targeted follow-up question**, explains it with **fraction bars whose sizes come from exact arithmetic**, then checks the idea again with **new numbers**. Teachers get the learners grouped by likely misconception, with the actual answers behind each grouping and a suggested reteach activity.

**Live app:** LIVE_URL_PLACEHOLDER
**Repository:** https://github.com/IamKishan08/misconception-detective

## 1. Vertical and challenge

**Vertical:** AI for Education.
**Challenge (as recorded):** make learning accessible, personalised, interactive and effective; adapt to each learner, assist educators, and increase engagement.

The app targets one well-known classroom problem: a wrong fraction answer is usually not random. It often comes from a specific, fixable idea, such as "add the tops and add the bottoms". Marking the answer wrong does not fix that idea. The app separates *which idea* from *which answer*, checks before it labels, and gives the teacher the evidence.

## 2. Challenge → feature → code → test

| Challenge phrase | Feature | Source | Tests |
|---|---|---|---|
| Accessible | No sign-up; labelled numerator/denominator fields; keyboard and screen-reader support (spoken fractions such as "three quarters", `aria-live` feedback, skip link, visible focus); reasoning **choices** so typing is never required; plain English | [`src/web/components/QuestionCard.tsx`](src/web/components/QuestionCard.tsx), [`src/web/components/Fraction.tsx`](src/web/components/Fraction.tsx), [`src/web/messages.ts`](src/web/messages.ts) | [`tests/web/screens.test.tsx`](tests/web/screens.test.tsx) (axe, keyboard), [`tests/e2e/smoke.spec.ts`](tests/e2e/smoke.spec.ts) |
| Personalised / adapt | The next action is chosen from **this learner's own history**: first matching error → follow-up; matching follow-up → explanation; correct follow-up → more evidence; transfer results → improving/secure | [`src/engine/progression.ts`](src/engine/progression.ts) | [`tests/engine/progression.test.ts`](tests/engine/progression.test.ts) |
| Interactive | Fraction bars the learner steps through (Previous/Next); tap or keyboard answers | [`src/web/components/ExplanationPanel.tsx`](src/web/components/ExplanationPanel.tsx), [`src/web/components/FractionBars.tsx`](src/web/components/FractionBars.tsx) | [`tests/engine/families.test.ts`](tests/engine/families.test.ts) (bar quantities = exact arithmetic) |
| Effective | A **transfer question with new numbers** checks the idea, not a memorised answer; "secure" needs two correct transfers in a row without a hint. Progress shows the actual attempts. No claims of proven learning gains | [`src/engine/progression.ts`](src/engine/progression.ts), [`src/engine/families/`](src/engine/families/) | [`tests/engine/progression.test.ts`](tests/engine/progression.test.ts) |
| Assist educators | Teacher view groups learners by likely misconception; shows **observed** answers separately from the **inferred** label, plus one reteach activity per family | [`src/engine/teacher.ts`](src/engine/teacher.ts), [`src/web/components/TeacherView.tsx`](src/web/components/TeacherView.tsx) | [`tests/engine/progression.test.ts`](tests/engine/progression.test.ts) (teacher grouping), [`tests/web/screens.test.tsx`](tests/web/screens.test.tsx) |
| Increase engagement | Short steps, immediate feedback, a visible "Ideas mastered" path for the three ideas. Nothing elaborate | [`src/web/components/ProgressPath.tsx`](src/web/components/ProgressPath.tsx), [`src/web/components/StudentFlow.tsx`](src/web/components/StudentFlow.tsx) | [`tests/e2e/smoke.spec.ts`](tests/e2e/smoke.spec.ts) |

## 3. Walkthrough

**Student**
1. Open the app. A learner profile is created on the device; there is no sign-up.
2. Answer a short question (e.g. `1/2 + 1/3`) in the labelled top/bottom boxes, or by choosing an option.
3. Optionally pick how you worked it out ("I added the tops and the bottoms", "Bigger bottom number means bigger", …) or type a short reason (max 200 characters).
4. If the answer matches a known error pattern, the app says it is a **possible** idea, never a diagnosis, and asks **one check question** built to separate that idea from a slip (for F1, same denominators: `1/5 + 2/5`).
5. If the check question shows the same pattern, the label becomes "likely" and the learner steps through **fraction bars** (e.g. re-cutting halves and thirds into sixths), with one or two supporting sentences.
6. A **new-numbers question** follows. Correct without a hint → "improving" and a harder one; two in a row → "secure", then on to the next idea.
7. A hint is available on new-numbers questions; answers given with a hint do not count toward "secure".

**Teacher (same device only; the UI says so)**
- "Teacher view" groups learners by idea: *May need reteaching* (likely/possible) and *Improving*, with each learner's actual answers listed.
- The label column is marked "Inferred (suggested, not a diagnosis)"; the answers column is "Observed".
- Five **Sample** learners (badged "Sample") show how grouping looks; a checkbox hides them. They are built separately and never feed the real learner's data.

## 4. Three learner contexts, three different next actions

Reproducible with `DEMO_SEED = 20261119` in [`src/engine/demo.ts`](src/engine/demo.ts), asserted in [`tests/engine/progression.test.ts`](tests/engine/progression.test.ts):

| Context | What happened | Next action |
|---|---|---|
| 1. New learner, one matching error | Gives `2/5` for an addition item (adds across) | `ask_followup`: a check question; label only "possible" |
| 2. Same F1 error on item **and** follow-up | Adds across twice | `show_explanation` with fraction bars, then a transfer question |
| 3. Correct transfer after the explanation | Answers the new-numbers question correctly, no hint | `ask_harder_transfer`; family marked "improving" (a second in a row → "secure", next family) |

## 5. Architecture and who decides what

```
src/engine   pure TypeScript: exact rationals, 3 families (generator, detector, follow-up, visual, transfer), progression, teacher grouping
src/ai       Gemini adapter, prompts, Zod schemas, verified fallback templates, guarded service (timeout, retry, budget, cache)
src/server   Express: /healthz, /api/status, /api/interpret, /api/explain, static frontend, security headers, rate limit
src/web      React + Vite: student flow, fraction bars, teacher view, messages (all strings), localStorage module
tests/       engine, api + AI contract, web (axe), e2e (Playwright)
```

| Code decides (always) | Gemini may do (optional) |
|---|---|
| Arithmetic, answer checking, pattern detection | Map the learner's optional free-text reason to `F1`/`F2`/`F3`/`none` |
| Question generation and all numbers shown | Choose one of the family's two explanation template ids |
| Fraction-bar quantities | Write at most two short supporting sentences, adjusted for hint use |
| Labels, state transitions, next action, when evidence is enough | — |

- A model suggestion about free text can **only prompt a follow-up question**, exactly like a tapped reasoning choice; it can never set a label (tested).
- The free-text call happens **only** when the answer is wrong *and* matches no pattern *and* no reasoning choice was tapped. Answer checking and the next-step choice never call the model.
- Model output is validated with Zod: unknown template id, more than two sentences, sentences over 160 characters, **any digit**, `<`/`>` or links → rejected and the verified template is used. Digits are banned so that every number on screen comes from code.
- Model text is rendered as plain React text (no `dangerouslySetInnerHTML` anywhere).
- Without a key, or on timeout (6 s), quota/provider error, invalid output or an exhausted budget, the app uses the hand-written explanation and shows **"Offline explanations"**. Fallback text is never presented as a live model response.
- Model: `GEMINI_MODEL` env var, default `gemini-3.5-flash-lite`, via the official `@google/genai` SDK with structured JSON output, a 256-token output cap and thinking disabled.

## 6. Maths assumptions and progression heuristics

**Maths**
- Integers only; denominators ≥ 1; inputs are whole numbers 0–999 (`/^\d{1,4}$/` then a range check). Zero denominators, decimals, negatives, `1e3`, hex and slashes inside a box are rejected with a specific message.
- Answers are compared by cross-multiplication, never by floating point. Equivalent answers are accepted (`10/12` for `5/6`).
- Generated operands have denominators 2–12 (F1, F2) and numerators/denominators ≤ 24 (all families); F1 sums stay ≤ 1 so they fit one bar.
- Every generated item is checked to **discriminate**: the misconception answer differs from the correct answer (and, for F3, from the other wrong pattern). F2 items never have the bigger denominator as the bigger fraction. Options are never duplicated.

**Families**
- **F1** adds numerators and denominators (`1/2 + 1/3 → 2/5`). Follow-up: same denominators (`1/5 + 2/5`), where adding the bottoms still gives a different answer.
- **F2** thinks a bigger denominator means a bigger fraction (`1/8 > 1/4`). Items use equal numerators; the follow-up is a roti-sharing context.
- **F3** equivalent fractions: changes only one number (`1/2 = ?/6 → 1`), adds instead of multiplying (`→ 5`), or says `1/2 ≠ 2/4`. Item: missing numerator; follow-up: "are these equal?"; transfer: missing denominator.

**Progression (MVP heuristics, not validated mastery measures)**, in [`src/engine/progression.ts`](src/engine/progression.ts):
- First matching error → "possible" → follow-up.
- Follow-up matches → "likely" → explanation → transfer. A second matching item after a correct follow-up also → "likely".
- Follow-up correct → needs more evidence → a different item from the same family.
- Wrong answer matching no pattern → needs more evidence, never a label; after `UNMATCHED_BEFORE_SUPPORT = 2` such answers the explanation is shown without a label.
- Transfer correct without a hint → "improving"; `SECURE_STREAK = 2` in a row → "secure". A learner with no errors at all becomes secure after item + transfer.
- No confidence percentages anywhere.

## 7. Security, privacy and deployment limits

**What is stored and what is sent** (also shown in the app under "Your data"):
- *Stored on this device only (localStorage, versioned schema, validated on load):* answers, questions seen and progress per idea. No name, email or account. "Reset my progress" deletes it.
- *Sent to the server:* the idea id and hint level, to fetch explanation sentences; and only in the case above, the free-text reason (≤ 200 characters) for classification.
- *Never sent:* answers, progress or identifiers. The server does not log request bodies or learner text.

**Server hardening**
- Every body validated with strict Zod schemas (unknown fields rejected); JSON body limit 2 kB (→ 413).
- Helmet headers with a strict CSP (`default-src 'self'`, no inline scripts or styles, `frame-ancestors 'none'`), tested against the built app.
- Per-IP rate limit on `/api` (30 requests/minute) → 429 with `Retry-After`.
- Per-instance model budget (300 calls/hour), 6 s timeout, one retry on transient 5xx/network errors only, LRU cache (32 entries) keyed on family + template + hint level — **never** on learner text — and de-duplication of identical in-flight requests (server and browser).
- **Limitation:** the rate limit, budget and cache are **per Cloud Run instance**, not deployment-wide; with `--max-instances 3` the effective limits are up to 3× higher.
- The API key is read from the environment (Cloud Run Secret Manager reference); `.env` is gitignored and `.env.example` holds placeholders only.

## 8. Accessibility

English only for this MVP. All strings are in [`src/web/messages.ts`](src/web/messages.ts), so another language can be added without touching components; `<html lang="en">`.

- Automated: axe-core finds **zero violations** on the question, explanation, teacher and data screens ([`tests/web/screens.test.tsx`](tests/web/screens.test.tsx)). Colour contrast cannot be computed in jsdom and is checked by hand below.
- Keyboard walkthrough (manual): MANUAL_A11Y_PLACEHOLDER

## 9. Run, test, build, deploy

Requires Node 24 (tested with v24.22.2) and npm.

```bash
npm ci
npm run typecheck && npm run lint && npm test   # unit, API, AI-contract and axe tests
npm run test:coverage
npm run build && npm start                      # http://localhost:8080 (offline explanations without a key)
npx playwright install chromium && npm run test:e2e   # mobile, keyboard-only smoke test against the build
```

Optional live explanations: copy `.env.example` to `.env`, set `GEMINI_API_KEY`, and start with `node --env-file=.env dist/server/server/index.js`.

Docker:
```bash
docker build -t misconception-detective .
docker run --rm -p 8080:8080 -e GEMINI_API_KEY=... misconception-detective
```

Cloud Run (see [`deploy.sh`](deploy.sh)):
```bash
gcloud auth login
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
printf '%s' "$GEMINI_API_KEY" | gcloud secrets create gemini-api-key --data-file=-
gcloud secrets add-iam-policy-binding gemini-api-key --member="serviceAccount:PROJECT_NUMBER-compute@developer.gserviceaccount.com" --role=roles/secretmanager.secretAccessor
gcloud run deploy misconception-detective --source . --region asia-south1 --allow-unauthenticated \
  --memory 512Mi --max-instances 3 --set-secrets GEMINI_API_KEY=gemini-api-key:latest
```

The container is multi-stage (`node:24-slim`), runs as the non-root `node` user, listens on `0.0.0.0:$PORT`, exposes `/healthz`, shuts down gracefully on SIGTERM and writes nothing to disk.

## 10. Verification results (measured)

RESULTS_PLACEHOLDER

## 11. Known limitations

- Three misconception families only, English only, fractions only.
- The teacher view shows learners on **this device** only; there are no accounts or shared classrooms by design.
- Progression thresholds are MVP heuristics and have not been validated with students; no learning-gain claims are made.
- Rate limit, model budget and cache are per instance.
- The free-text interpretation depends on the model; when it is unavailable, free text is simply not used (reasoning choices still work).
