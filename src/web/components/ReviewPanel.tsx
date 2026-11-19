import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_HINTS, needsProactiveSupport, type Step } from '../../engine/progression.js';
import { questionToProblem } from '../../engine/solver/fromQuestion.js';
import { solve } from '../../engine/solver/solve.js';
import type { CauseId } from '../../engine/solver/check.js';
import type { PatternId } from '../../engine/types.js';
import type { Explanation } from '../api.js';
import { messages } from '../messages.js';
import { QuestionPrompt } from './QuestionCard.js';
import { SolutionView } from './SolutionView.js';

type ReviewStep = Extract<Step, { kind: 'review' }>;

interface Props {
  step: ReviewStep;
  /** Short supporting sentences (live or built-in), shown with the explanation. Null while loading. */
  explanation: Explanation | null;
  onTryAgain: () => void;
  onHint: () => void;
  onExplain: () => void;
  onSimilar: () => void;
  onContinue: () => void;
  aiConfigured: boolean;
  onAiSource: (source: 'gemini' | 'fallback') => void;
}

/** The engine's practice patterns, as the possible mistakes the help selector may offer. Only ever tentative. */
const PATTERN_CAUSE: Record<PatternId, CauseId | null> = {
  add_across: 'added_across',
  bigger_denominator: 'bigger_denominator',
  scale_one_part: 'changed_one_number',
  additive_scaling: 'added_same_number',
  not_equivalent: null,
};

const m = messages.review;

/**
 * Shown after an answer that needs another look. The original question stays on screen, the feedback says what was
 * observed, and the learner chooses what happens next: try again, a hint, the explanation, or moving on.
 */
export function ReviewPanel({ step, explanation, onTryAgain, onHint, onExplain, onSimilar, onContinue, aiConfigured, onAiSource }: Props) {
  const { question, run } = step;
  const solution = useMemo(() => solve(questionToProblem(question)), [question]);
  const [hidden, setHidden] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const correct = step.outcome === 'correct';
  const planned = run.planned ?? 'ask_transfer';
  const text = messages.feedback(step.outcome, planned, question.family, step.answerDisplay);
  const explained = run.solutionViewed && !hidden;
  const assisted = run.hints > 0 || run.solutionViewed;
  const mapped = step.pattern === null ? null : PATTERN_CAUSE[step.pattern];
  const causes: CauseId[] = mapped === null ? [] : [mapped];

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="card review" aria-labelledby="review-heading">
      <h2 id="review-heading" ref={headingRef} tabIndex={-1}>{correct ? m.correctNow(step.answerDisplay) : m.heading}</h2>
      <div className="review-grid">
        <div className="review-question">
          <p className="stage-label">
            <span className={`stage-pill stage-${question.stage}`}>{messages.stageLabel[question.stage]}</span>
            <span>{messages.familyName(question.family)}</span>
          </p>
          <div className="prompt" aria-label={m.original}>
            <QuestionPrompt question={question} />
          </div>
          <dl className="answer-compare">
            <div className={`answer-tile ${correct ? 'right' : 'wrong'}`}>
              <dt>{m.yourAnswer}</dt>
              <dd>{step.answerDisplay}</dd>
            </div>
          </dl>
        </div>

        <div className="review-help">
          {!correct && (
            <div className={`feedback outcome-${step.outcome} reveal`} role="status" aria-live="polite">
              <p className="feedback-title">{text.title}</p>
              <p>{text.body}</p>
              {run.solutionViewed && needsProactiveSupport(run) && <p>{m.supportShown}</p>}
            </div>
          )}

          {run.hints > 0 && (
            <section aria-label={m.hintsHeading}>
              <h3>{m.hintsHeading}</h3>
              <ol className="hint-list">
                {solution.hints.slice(0, run.hints).map((hint) => (
                  <li key={hint} className="reveal">{hint}</li>
                ))}
              </ol>
            </section>
          )}

          {!correct && (
            <div className="actions">
              <button type="button" className="primary inline" onClick={onTryAgain}>{m.tryAgain}</button>
              {run.hints < MAX_HINTS && (
                <button type="button" className="secondary" onClick={onHint}>{run.hints === 0 ? m.hint : m.anotherHint}</button>
              )}
              {!explained && (
                <button type="button" className="secondary" onClick={run.solutionViewed ? () => setHidden(false) : onExplain}>{m.explain}</button>
              )}
              {explained && <button type="button" className="secondary" onClick={() => setHidden(true)}>{m.hideExplain}</button>}
              <button type="button" className="secondary" onClick={onSimilar}>{m.similar}</button>
            </div>
          )}

          {explained && (
            <div className="reveal">
              <SolutionView
                solution={solution}
                initial="all"
                onSimilar={onSimilar}
                showHelp
                aiConfigured={aiConfigured}
                causes={causes}
                onAiSource={onAiSource}
              />
              <div className="ai-text">
                {explanation === null ? (
                  <p>{m.aiLoading}</p>
                ) : (
                  <>
                    <h3>{m.aiTitle(explanation.templateId)}</h3>
                    {explanation.sentences.map((sentence) => (
                      <p key={sentence}>{sentence}</p>
                    ))}
                    <p className={explanation.source === 'gemini' ? 'source live' : 'source offline'}>
                      {explanation.source === 'gemini' ? messages.explanationsLive : messages.explanationsOffline}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {assisted && <p className="hint-text">{m.assistedNote}</p>}

          <div className="continue">
            <p className="hint-text">{m.whyContinue(planned)}</p>
            <button type="button" className={correct ? 'primary inline' : 'secondary'} onClick={onContinue}>{m.continueLabel(planned)}</button>
          </div>
        </div>
      </div>
    </section>
  );
}
