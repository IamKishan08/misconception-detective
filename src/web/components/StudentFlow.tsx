import { useCallback, useEffect, useRef, useState } from 'react';
import { FAMILIES } from '../../engine/families/index.js';
import type { HistoryEvent } from '../../engine/history.js';
import { questionToProblem } from '../../engine/solver/fromQuestion.js';
import {
  continueFromReview,
  hintLevel,
  markSolutionViewed,
  requestHint,
  similarQuestion,
  startFamily,
  submitAnswer,
  tryAgain,
  type LearnerState,
  type NextAction,
} from '../../engine/progression.js';
import type { FamilyId, InvalidReason, Outcome } from '../../engine/types.js';
import { fetchExplanation, interpretReason, suggestedTemplateId, type Explanation } from '../api.js';
import { messages } from '../messages.js';
import { ProgressPath } from './ProgressPath.js';
import { QuestionCard, type Submission } from './QuestionCard.js';
import { ReviewPanel } from './ReviewPanel.js';

interface Props {
  state: LearnerState;
  onChange: (state: LearnerState) => void;
  /** Reports where the latest explanation came from, so the header badge reflects reality. */
  onExplanationSource: (source: Explanation['source']) => void;
  /** Records real activity for My progress. */
  onHistory: (event: HistoryEvent) => void;
  /** True when a Gemini key is configured on the server. */
  aiConfigured: boolean;
}

/** A short banner above the next question: the previous answer was correct, or could not be read. */
interface Banner {
  outcome: Outcome;
  action: NextAction;
  family: FamilyId;
  display: string;
  invalidReason?: InvalidReason;
}

export function StudentFlow({ state, onChange, onExplanationSource, onHistory, aiConfigured }: Props) {
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [explanation, setExplanation] = useState<{ key: string; value: Explanation } | null>(null);

  // Guards for asynchronous work. `latest` is what is on screen now; the others identify the one request allowed to apply.
  const latest = useRef(state);
  const mounted = useRef(false);
  const requestId = useRef(0);
  const inFlight = useRef(false);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  /** Cancels any pending request so its response can never apply. Used on topic change, reset and unmount. */
  const invalidate = useCallback(() => {
    requestId.current += 1;
    controller.current?.abort();
    controller.current = null;
    inFlight.current = false;
    setBusy(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      requestId.current += 1;
      controller.current?.abort();
      controller.current = null;
      inFlight.current = false;
    };
  }, []);

  const step = state.step;
  const explaining = step.kind === 'review' && step.run.solutionViewed ? step.question : null;
  const explainFamily = explaining?.family ?? null;
  const explainLevel = explaining === null ? 0 : hintLevel(state.families[explaining.family]);
  const explainTemplate = explaining === null ? null : suggestedTemplateId(explaining);
  const explainKey = explaining === null ? null : `${explaining.id}|${explainLevel}`;

  // Fetch the supporting sentences once per explanation (also after a reload); a changed key cancels the old fetch.
  useEffect(() => {
    if (explainKey === null || explainFamily === null || explainTemplate === null) return;
    let cancelled = false;
    void fetchExplanation(explainFamily, explainTemplate, explainLevel).then((result) => {
      if (cancelled) return;
      setExplanation({ key: explainKey, value: result });
      onExplanationSource(result.source);
    });
    return () => {
      cancelled = true;
    };
  }, [explainKey, explainFamily, explainTemplate, explainLevel, onExplanationSource]);

  async function handleSubmit(submission: Submission) {
    const current = latest.current;
    if (inFlight.current || current.step.kind !== 'question') return;
    const question = current.step.question;
    const counter = current.counter;
    inFlight.current = true;
    const mine = ++requestId.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    try {
      // Only ask the model about free text when the answer is wrong and matches no known pattern;
      // its suggestion can at most prompt a follow-up question.
      let suggestedFamily: FamilyId | null = null;
      const evaluation = FAMILIES[question.family].evaluate(question, submission.answer);
      if (evaluation.valid && !evaluation.correct && evaluation.pattern === null && submission.reasonText !== '' && submission.reasonId === null) {
        suggestedFamily = await interpretReason(submission.reasonText, abort.signal);
      }
      // The learner may have switched topic, reset, or left while we waited; if so this response is stale and is dropped.
      const stale = mine !== requestId.current || !mounted.current;
      const now = latest.current;
      if (stale || now.counter !== counter || now.step.kind !== 'question' || now.step.question.id !== question.id) return;

      const result = submitAnswer(now, submission.answer, { reasonId: submission.reasonId, suggestedFamily });
      if (result.outcome === 'correct' || result.outcome === 'invalid_input') {
        setBanner({
          outcome: result.outcome,
          action: result.action,
          family: question.family,
          display: evaluation.valid ? evaluation.display : '',
          invalidReason: result.invalidReason,
        });
      } else {
        setBanner(null);
      }
      if (result.outcome !== 'invalid_input' && now.step.kind === 'question') {
        const key = `${question.id}@${now.step.run.started}`;
        const problem = questionToProblem(question);
        onHistory({ type: 'check', key, source: 'practice', problem, correct: result.outcome === 'correct', answer: evaluation.valid ? evaluation.display : '' });
        // Support the engine showed by itself (repeated mistakes) counts as the solution having been viewed.
        if (result.state.step.kind === 'review' && result.state.step.run.solutionViewed) onHistory({ type: 'help', key, source: 'practice', problem, kind: 'solution' });
      }
      latest.current = result.state;
      onChange(result.state);
    } finally {
      // Always recover from errors, but only the request that is still current may clear the loading state.
      if (mine === requestId.current) {
        inFlight.current = false;
        controller.current = null;
        setBusy(false);
      }
    }
  }

  /** Hint or solution requested on the question or review that is on screen. */
  function support(kind: 'hint' | 'solution') {
    const current = state.step;
    if (current.kind === 'finished') return;
    onHistory({ type: 'help', key: `${current.question.id}@${current.run.started}`, source: 'practice', problem: questionToProblem(current.question), kind });
    change(kind === 'hint' ? requestHint(state) : markSolutionViewed(state));
  }

  function change(next: LearnerState) {
    setBanner(null);
    latest.current = next;
    onChange(next);
  }

  function handlePick(family: FamilyId) {
    invalidate();
    change(startFamily(state, family));
  }

  const bannerText = banner === null ? null : messages.feedback(banner.outcome, banner.action, banner.family, banner.display);
  const review = step.kind === 'review' ? step : null;
  const shownExplanation = explanation !== null && explanation.key === explainKey ? explanation.value : null;

  return (
    <div className="student">
      <ProgressPath state={state} onPick={handlePick} />

      <div className={`feedback ${banner === null ? 'empty' : `outcome-${banner.outcome}`}`} role="status" aria-live="polite">
        {banner !== null && bannerText !== null && (
          <>
            <p className="feedback-title">{bannerText.title}</p>
            {banner.invalidReason !== undefined ? <p>{messages.invalid(banner.invalidReason)}</p> : bannerText.body !== '' && <p>{bannerText.body}</p>}
          </>
        )}
      </div>

      {step.kind === 'question' && (
        <QuestionCard
          key={`${step.question.id}-${state.counter}`}
          question={step.question}
          run={step.run}
          busy={busy}
          focusOnMount={step.run.tries > 0}
          onSubmit={(s) => void handleSubmit(s)}
          onHint={() => support('hint')}
          onExplain={() => support('solution')}
          onSimilar={() => change(similarQuestion(state))}
        />
      )}
      {review !== null && (
        <ReviewPanel
          key={`${review.question.id}-${state.counter}`}
          step={review}
          explanation={shownExplanation}
          onTryAgain={() => change(tryAgain(state))}
          onHint={() => support('hint')}
          onExplain={() => support('solution')}
          onSimilar={() => change(similarQuestion(state))}
          onContinue={() => change(continueFromReview(state))}
          aiConfigured={aiConfigured}
          onAiSource={onExplanationSource}
        />
      )}
      {step.kind === 'finished' && (
        <section className="card">
          <h2>{messages.finished.heading}</h2>
          <p>{messages.finished.body}</p>
        </section>
      )}
    </div>
  );
}
