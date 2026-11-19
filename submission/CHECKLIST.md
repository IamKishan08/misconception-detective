# Submission checklist

Status as of 2026-11-19. Items marked **needs you** cannot be completed from the repository.

## Requirements
- **Competition:** Prompt War Challenge, AI Geeks Community, track **AI for Education** (event page: https://hack2skill.com/event/promptwars-x-aigeeks).
- [ ] **Submission URL: to be confirmed. needs you.** The event page above was provided; the direct submission link has not been confirmed.
- [ ] **Deadline: to be confirmed. needs you.**
- [ ] **Required form fields, word limits, video or deck requirements: to be confirmed. needs you.** Nothing about them is known from the repository, and none are assumed.
- [ ] **Rubric and eligibility rules: not checked.** They were not found in the repository, and eligibility is not claimed.
- [ ] **Educator feature?** An earlier README recorded the challenge as *"make learning accessible, personalised, interactive and effective; adapt to each learner, assist educators, and increase engagement."* That is not an official rubric. The Teacher view and sample learners were **removed**, because no documented requirement was found and My progress must contain only the student's real activity. If the rules do require an educator view, say so; shared engine logic was kept and a clearly labelled optional view could be rebuilt.

## Materials (complete)
- [x] Repository link: https://github.com/IamKishan08/misconception-detective
- [x] Live demo link, verified working on 2026-11-19 (revision `misconception-detective-00003-gk9`): https://misconception-detective-612071683004.asia-south1.run.app
- [x] `submission/PROJECT_SUMMARY.md`: problem, audience, solution, role of AI, technical approach, limitations, next steps
- [x] `submission/DEMO_SCRIPT.md`: 2–3 minute walkthrough
- [x] `submission/VERIFICATION.md`: dated checks, counts, environment, tested commit and build, live smoke results, unresolved items
- [x] `submission/screenshots/`: 7 genuine screenshots (desktop, mobile, dark theme, AI-selected help, built-in fallback, My progress, Practise review)
- [x] README with links at the top, accurate behaviour, limits, setup, environment variable names, fallback behaviour and deployment
- [x] No secrets in the repository (`.env` is git-ignored; only `.env.example` with empty placeholders is tracked)

## Evidence that is real, and what is not claimed
- [x] Live Gemini verified under strict criteria: 7/7 cases accepted and relevant, plus the template check, on `gemini-3.5-flash-lite`, and a real accepted request on the deployed service
- [x] 360 unit/integration tests, 26 browser tests, typecheck, lint, build all passing locally (CI status: see `VERIFICATION.md`)
- [ ] Not claimed (not done): student testing, learning-outcome evidence, screen-reader testing, load testing, testimonials, judging scores

## Before you submit
1. Provide the competition link and rules so the requirements above can be checked against them.
2. Record a short screen capture following `DEMO_SCRIPT.md` if the form asks for a video (none was fabricated).
3. Re-open the live demo once yourself; if Gemini credits or the key change, the app falls back to built-in help and says so.
4. Confirm the repository is public (or shared as the rules require) and that the latest commit is pushed.
