# Project summary: Misconception Detective

**Repository:** https://github.com/IamKishan08/misconception-detective
**Live demo:** https://misconception-detective-612071683004.asia-south1.run.app (verified 2026-11-19)

## Problem
Students in classes 5–8 often get fractions wrong for a reason that "marking it wrong" does not fix, for example adding the tops and the bottoms (`1/2 + 1/4 = 2/6`). Most practice tools only ask fixed questions, so a student who wants to understand *their own* homework problem has nowhere to go. Help that vanishes after a wrong answer, or a confident explanation that is itself wrong, makes things worse.

## Audience
Students aged about 10–14 working on fractions, on a phone or laptop, who need an explanation of a specific problem. (Educator tooling is not part of this version.)

## What it does
- **Solve my problem:** type a fraction problem (add, subtract, multiply, divide, compare, or find a missing number in an equal fraction). The app shows how it read the problem, then explains it step by step or checks the student's answer. The original problem stays visible; the student's answer is shown apart from the correct one.
- **Practise:** an adaptive sequence where a wrong answer never removes the question. Try again, hints, a worked explanation and a similar problem are always available, before and after answering.
- **My progress:** the student's own activity only, with each item labelled correct on their own, correct on a retry, correct with help, not yet correct, or help only. Using a hint or opening a solution is never counted as mastery. No scores or sample data.

## The role of AI
Gemini **interprets the student's question and selects** which reviewed explanation to show: an intent (explain a step, a concept, a simpler version, a picture, a possible mistake, where to start, a clarifying question, or "out of scope") plus identifiers from a menu built for that exact problem. Different questions lead to different explanations (for example "why do denominators have to match?" versus "why do we flip the divisor?").

Gemini writes **no text that is displayed**. Every number, equation and sentence of mathematics is rendered from the deterministic engine or from reviewed concept templates. The choice is validated for this problem on the server and again in the browser. The interface says who picked the help (AI-selected, built-in fallback, or no AI) and shows "AI-selected help" in the header only after a validated reply.

Rationale: free prose from a model cannot be verified in general. An earlier version checked numbers and equations in model text but still accepted false sentences ("Add the denominators when adding fractions"). Selecting from verified content avoids the problem instead of trying to detect it.

## Technical approach
- TypeScript throughout. React + Vite front end; Express API; Zod schemas; Gemini via `@google/genai` with structured JSON output and minimal thinking.
- Deterministic engine: hand-written parser (no `eval`), exact fraction arithmetic bounded to 0–999 inputs, answer checking by cross-multiplication, steps whose every equation carries a machine-checked claim, visuals (stacked bars, number line) that match the calculation.
- Server hardening: strict request schemas, body and rate limits, timeouts, per-instance call budget, classified failures (auth, quota, unavailable model, timeout, malformed, rejected) with only categories logged, no retries for authentication or billing errors, API key in Secret Manager.
- Privacy: progress and history stay in the browser; typed working and AI questions are never stored; what is sent is documented in the app (Settings) and the README.
- Accessibility: labelled inputs, spoken fractions and equations, live-region announcements, focus management, reduced-motion support, light/dark/system theme; automated axe checks including colour contrast in both themes.
- Tests: 348 unit and integration tests, 26 browser tests (desktop and phone viewports), and a live Gemini smoke test. See `VERIFICATION.md`.

## Limitations
- Two fractions per problem, inputs up to 999, positive inputs only (answers may be negative); no decimals or mixed-number inputs.
- The app checks the final answer; it does not verify arbitrary written working.
- Possible-reason patterns are a short fixed list. A wrong answer alone is never presented as a confirmed diagnosis.
- Gemini's role is narrow by design; it does not answer open-ended questions.
- English only; single device; no accounts or class view.
- **Not validated with students.** No learning-gain claims are made. Accessibility was tested automatically, not with screen-reader users.

## Next steps
1. Try it with a small group of students and teachers and record what confuses them.
2. Test with screen readers and on low-end phones.
3. Add mixed numbers and decimals as supported inputs.
4. Review the concept explanations with a maths teacher.
5. Decide, with real users, whether an educator view is worth building and what it should show.
