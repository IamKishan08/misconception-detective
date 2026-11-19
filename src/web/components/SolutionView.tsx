import { useEffect, useId, useRef, useState } from 'react';
import type { Solution } from '../../engine/solver/solve.js';
import type { FollowUp } from '../api.js';
import { MAX_QUESTION_CHARS } from '../../ai/schemas.js';
import { messages, speakMath } from '../messages.js';
import { VisualView } from './VisualView.js';

export type InitialReveal = 'all' | 'progressive' | 'collapsed';

export interface StudentAnswerInfo {
  readonly text: string;
  readonly correct: boolean;
}

interface Props {
  solution: Solution;
  initial: InitialReveal;
  /** The student's own answer, shown apart from the correct answer. */
  studentAnswer?: StudentAnswerInfo | null;
  /** Show the progressive hints first (for "Help me get started"). */
  showHints?: boolean;
  /** Called when the worked steps first become visible. Guided practice uses it to record that the solution was seen. */
  onSolutionShown?: () => void;
  onSimilar?: () => void;
  /** Present only when Gemini is configured. */
  ask?: (question: string, signal: AbortSignal) => Promise<FollowUp>;
  onAskSource?: (source: FollowUp['source']) => void;
}

const m = messages.solve;

function MathLine({ text }: { text: string }) {
  return (
    <span className="math-line">
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">{speakMath(text)}</span>
    </span>
  );
}

type AskState = { status: 'idle' } | { status: 'loading' } | { status: 'done'; answer: string } | { status: 'unavailable' };

/**
 * One follow-up question about the current solution. Protected against stale and duplicate work:
 * one request at a time, aborted when the solution changes or the view is left, and always able to recover.
 */
function AskBox({ ask, onSource }: { ask: NonNullable<Props['ask']>; onSource?: Props['onAskSource'] }) {
  const id = useId();
  const [text, setText] = useState('');
  const [state, setState] = useState<AskState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  async function submit() {
    const question = text.trim();
    if (busy.current || question === '') return;
    busy.current = true;
    const mine = new AbortController();
    controller.current = mine;
    setState({ status: 'loading' });
    try {
      const reply = await ask(question, mine.signal);
      if (mine.signal.aborted) return;
      onSource?.(reply.source);
      setState(reply.answer === null ? { status: 'unavailable' } : { status: 'done', answer: reply.answer });
    } catch {
      if (!mine.signal.aborted) setState({ status: 'unavailable' });
    } finally {
      if (controller.current === mine) {
        controller.current = null;
        busy.current = false;
      }
    }
  }

  return (
    <form
      className="ask"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={`${id}-q`}>{m.askLabel}</label>
      <div className="ask-row">
        <input id={`${id}-q`} type="text" autoComplete="off" maxLength={MAX_QUESTION_CHARS} value={text} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-note`} />
        <button type="submit" className="secondary" disabled={state.status === 'loading' || text.trim() === ''}>
          {state.status === 'loading' ? m.asking : m.ask}
        </button>
      </div>
      <p id={`${id}-note`} className="hint-text">{m.askNote}</p>
      <div role="status" aria-live="polite" className="ask-result">
        {state.status === 'done' && (
          <p className="ai-answer">
            <span className="source live">{m.askChecked}</span> {state.answer}
          </p>
        )}
        {state.status === 'unavailable' && <p className="note">{m.askUnavailable}</p>}
      </div>
    </form>
  );
}

export function SolutionView({ solution, initial, studentAnswer, showHints = false, onSolutionShown, onSimilar, ask, onAskSource }: Props) {
  const total = solution.steps.length;
  const [revealed, setRevealed] = useState(initial === 'all' ? total : initial === 'progressive' ? 0 : 0);
  const [hintsShown, setHintsShown] = useState(showHints ? 1 : 0);
  const [simple, setSimple] = useState(false);
  const [why, setWhy] = useState(false);
  const [visuals, setVisuals] = useState(initial === 'all');
  const headings = useRef<(HTMLHeadingElement | null)[]>([]);
  const previous = useRef(revealed);
  const announced = useRef(false);
  const heading = useId();

  // Tell the caller once the worked steps have been seen (they are never counted as independent work).
  useEffect(() => {
    if (revealed > 0 && !announced.current) {
      announced.current = true;
      onSolutionShown?.();
    }
  }, [revealed, onSolutionShown]);

  // Move focus to a newly revealed step so keyboard and screen-reader users land on it.
  useEffect(() => {
    if (revealed > previous.current && previous.current > 0) headings.current[revealed - 1]?.focus();
    previous.current = revealed;
  }, [revealed]);

  const allShown = revealed >= total;
  const hasVisual = solution.steps.some((s) => s.visual !== undefined);
  const hintsLeft = solution.hints.length - hintsShown;

  return (
    <div className="solution" aria-labelledby={heading}>
      <h3 id={heading} className="visually-hidden">{m.solutionHeading}</h3>

      {(studentAnswer != null || allShown) && (
        <dl className="answer-compare">
          {studentAnswer != null && (
            <div className={`answer-tile ${studentAnswer.correct ? 'right' : 'wrong'}`}>
              <dt>{m.yourAnswer}</dt>
              <dd>{studentAnswer.text}</dd>
            </div>
          )}
          {allShown && (
            <div className="answer-tile right">
              <dt>{m.correctAnswer}</dt>
              <dd>{solution.answerText}</dd>
            </div>
          )}
        </dl>
      )}

      {hintsShown > 0 && (
        <section className="hints" aria-label={m.hintsHeading}>
          <h4>{m.hintsHeading}</h4>
          <ol>
            {solution.hints.slice(0, hintsShown).map((hint) => (
              <li key={hint} className="reveal">{hint}</li>
            ))}
          </ol>
        </section>
      )}

      {revealed > 0 && (
        <div className="toolbar" role="group" aria-label={m.toolbarLabel}>
          <button type="button" className="secondary" aria-pressed={simple} onClick={() => setSimple((v) => !v)}>{m.moreSimply}</button>
          <button type="button" className="secondary" aria-pressed={why} onClick={() => setWhy((v) => !v)}>{m.whyThisStep}</button>
          <button type="button" className="secondary" aria-pressed={visuals} onClick={() => setVisuals((v) => !v)}>
            {visuals ? m.hideVisual : m.showVisual}
          </button>
          {onSimilar !== undefined && (
            <button type="button" className="secondary" onClick={onSimilar}>{m.similar}</button>
          )}
        </div>
      )}
      {revealed > 0 && visuals && !hasVisual && <p className="note">{m.noVisual}</p>}

      {revealed > 0 && (
        <ol className="steps">
          {solution.steps.slice(0, revealed).map((step, i) => (
            <li key={step.id} className="step reveal">
              <h4 tabIndex={-1} ref={(el) => { headings.current[i] = el; }}>
                <span className="step-num">{m.stepOf(i + 1, total)}</span> {step.title}
              </h4>
              {step.lines.map((line) => (
                <p key={line.text} className="math"><MathLine text={line.text} /></p>
              ))}
              <p className="step-text">{simple ? step.simple : step.why}</p>
              {why && <p className="step-reason"><strong>{m.whyThisStep}</strong> {step.reason}</p>}
              {visuals && step.visual !== undefined && <VisualView visual={step.visual} />}
            </li>
          ))}
        </ol>
      )}

      <p role="status" className="visually-hidden">{revealed > 0 ? m.stepsShown(revealed, total) : ''}</p>

      <div className="reveal-controls">
        {initial === 'collapsed' && revealed === 0 && (
          <button type="button" className="secondary" onClick={() => setRevealed(total)}>{m.showHow}</button>
        )}
        {showHints && hintsLeft > 0 && (
          <button type="button" className="secondary" onClick={() => setHintsShown((n) => n + 1)}>{m.anotherHint}</button>
        )}
        {initial === 'progressive' && revealed < total && (
          <>
            <button type="button" className="secondary" onClick={() => setRevealed((n) => n + 1)}>
              {revealed === 0 ? m.showFirstStep : m.showNextStep}
            </button>
            <button type="button" className="secondary" onClick={() => setRevealed(total)}>{m.showAllSteps}</button>
          </>
        )}
      </div>

      {allShown && total > 0 && <p className="final-answer"><strong>{m.finalAnswer}</strong> {solution.answerText}</p>}

      {ask !== undefined && <AskBox ask={ask} onSource={onAskSource} />}
    </div>
  );
}
