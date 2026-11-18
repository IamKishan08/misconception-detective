import { useEffect, useRef, useState } from 'react';
import { FAMILIES } from '../../engine/families/index.js';
import { continueAfterExplanation, hintLevel, startFamily, submitAnswer, type LearnerState, type NextAction } from '../../engine/progression.js';
import type { FamilyId, InvalidReason, Outcome } from '../../engine/types.js';
import { fetchExplanation, interpretReason, suggestedTemplateId, type Explanation } from '../api.js';
import { messages } from '../messages.js';
import { ExplanationPanel } from './ExplanationPanel.js';
import { ProgressPath } from './ProgressPath.js';
import { QuestionCard, type Submission } from './QuestionCard.js';

interface Props {
  state: LearnerState;
  onChange: (state: LearnerState) => void;
  /** Reports where the latest explanation came from, so the header badge reflects reality. */
  onExplanationSource: (source: Explanation['source']) => void;
}

interface Feedback {
  outcome: Outcome;
  action: NextAction;
  family: FamilyId;
  display: string;
  invalidReason?: InvalidReason;
}

export function StudentFlow({ state, onChange, onExplanationSource }: Props) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [explanation, setExplanation] = useState<Explanation | null>(null);
  const step = state.step;
  const explainKey = step.kind === 'explanation' ? `${step.question.id}|${hintLevel(state.families[step.question.family])}` : null;
  const requested = useRef<string | null>(null);

  // Fetch the supporting sentences once per explanation step (also after a reload).
  useEffect(() => {
    if (step.kind !== 'explanation' || explainKey === null || requested.current === explainKey) return;
    requested.current = explainKey;
    const family = step.question.family;
    let cancelled = false;
    void fetchExplanation(family, suggestedTemplateId(step.question), hintLevel(state.families[family])).then((result) => {
      if (cancelled) return;
      setExplanation(result);
      onExplanationSource(result.source);
    });
    return () => {
      cancelled = true;
      requested.current = null;
    };
  }, [explainKey, step, state.families, onExplanationSource]);

  async function handleSubmit(submission: Submission) {
    if (step.kind !== 'question') return;
    const question = step.question;
    setBusy(true);
    try {
      // Only ask the model about free text when the answer is wrong and matches no known pattern;
      // its suggestion can at most prompt a follow-up question.
      let suggestedFamily: FamilyId | null = null;
      const evaluation = FAMILIES[question.family].evaluate(question, submission.answer);
      if (evaluation.valid && !evaluation.correct && evaluation.pattern === null && submission.reasonText !== '' && submission.reasonId === null) {
        suggestedFamily = await interpretReason(submission.reasonText);
      }
      const result = submitAnswer(state, submission.answer, {
        reasonId: submission.reasonId,
        suggestedFamily,
        hintUsed: submission.hintUsed,
      });
      setFeedback({
        outcome: result.outcome,
        action: result.action,
        family: question.family,
        display: evaluation.valid ? evaluation.display : '',
        invalidReason: result.invalidReason,
      });
      if (result.action === 'show_explanation') setExplanation(null);
      onChange(result.state);
    } finally {
      setBusy(false);
    }
  }

  function handleContinue() {
    setFeedback(null);
    setExplanation(null);
    onChange(continueAfterExplanation(state));
  }

  function handlePick(family: FamilyId) {
    setFeedback(null);
    setExplanation(null);
    onChange(startFamily(state, family));
  }

  const text = feedback === null ? null : messages.feedback(feedback.outcome, feedback.action, feedback.family, feedback.display);

  return (
    <div className="student">
      <ProgressPath state={state} onPick={handlePick} />

      <div className={`feedback ${feedback === null ? 'empty' : `outcome-${feedback.outcome}`}`} role="status" aria-live="polite">
        {feedback !== null && text !== null && (
          <>
            <p className="feedback-title">{text.title}</p>
            {feedback.invalidReason !== undefined ? <p>{messages.invalid(feedback.invalidReason)}</p> : text.body !== '' && <p>{text.body}</p>}
          </>
        )}
      </div>

      {step.kind === 'question' && (
        <QuestionCard key={`${step.question.id}-${state.counter}`} question={step.question} busy={busy} onSubmit={(s) => void handleSubmit(s)} />
      )}
      {step.kind === 'explanation' && (
        <ExplanationPanel
          key={step.question.id}
          question={step.question}
          labelled={step.labelled}
          learnerAnswer={state.families[step.question.family].attempts.findLast((a) => a.question.id === step.question.id)?.answerDisplay ?? null}
          explanation={explanation}
          onContinue={handleContinue}
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
