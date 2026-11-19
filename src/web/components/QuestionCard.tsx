import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { REASON_IDS, MAX_HINTS, type ReasonId, type Run } from '../../engine/progression.js';
import { questionToProblem } from '../../engine/solver/fromQuestion.js';
import { solve } from '../../engine/solver/solve.js';
import type { Answer, ChoiceId, Question } from '../../engine/types.js';
import { MAX_REASON_CHARS } from '../../ai/schemas.js';
import { messages } from '../messages.js';
import { Fraction } from './Fraction.js';
import { SolutionView } from './SolutionView.js';

export interface Submission {
  answer: Answer;
  reasonId: ReasonId | null;
  reasonText: string;
}

interface Props {
  question: Question;
  /** Support used so far on this question; kept by the engine so it survives a reload. */
  run: Run;
  busy: boolean;
  onSubmit: (submission: Submission) => void;
  onHint: () => void;
  onExplain: () => void;
  onSimilar: () => void;
  /** Put the cursor in the first answer box (used when coming back to the same question to try again). */
  focusOnMount?: boolean;
}

const m = messages.question;

/** The question text and expression. Also shown again when a wrong answer is reviewed, so the question never disappears. */
export function QuestionPrompt({ question }: { question: Question }) {
  const b = question.body;
  switch (b.type) {
    case 'add':
      return (
        <>
          <p>{m.add}</p>
          <p className="expression">
            <Fraction value={b.a} /> <span aria-hidden="true">+</span>
            <span className="visually-hidden">plus</span> <Fraction value={b.b} />
          </p>
        </>
      );
    case 'compare':
      return <p>{b.context === 'share' ? m.compareShare(b.first, b.second) : m.comparePlain}</p>;
    case 'missing_numerator':
      return (
        <>
          <p>{m.missingNumerator}</p>
          <p className="expression">
            <Fraction value={b.known} /> <span aria-hidden="true">=</span>
            <span className="visually-hidden">equals a missing number over {b.targetDen}</span>
            <span className="fraction" aria-hidden="true">
              <span className="fraction-top">?</span>
              <span className="fraction-bottom">{b.targetDen}</span>
            </span>
          </p>
        </>
      );
    case 'missing_denominator':
      return (
        <>
          <p>{m.missingDenominator}</p>
          <p className="expression">
            <Fraction value={b.known} /> <span aria-hidden="true">=</span>
            <span className="visually-hidden">equals {b.targetNum} over a missing number</span>
            <span className="fraction" aria-hidden="true">
              <span className="fraction-top">{b.targetNum}</span>
              <span className="fraction-bottom">?</span>
            </span>
          </p>
        </>
      );
    case 'equal_check':
      return (
        <>
          <p>{m.equalCheck}</p>
          <p className="expression">
            <Fraction value={b.first} /> <span aria-hidden="true">and</span>
            <span className="visually-hidden">and</span> <Fraction value={b.second} />
          </p>
        </>
      );
  }
}

function choiceLabel(question: Question, id: ChoiceId) {
  const b = question.body;
  if (b.type === 'compare') {
    if (id === 'equal') return m.optionEqual;
    return <Fraction value={id === 'first' ? b.first : b.second} />;
  }
  if (b.type === 'equal_check') {
    if (id === 'equal') return m.optionEqual;
    return id === 'first' ? m.optionEqualCheckFirst(b.first) : m.optionEqualCheckSecond(b.second);
  }
  return null;
}

export function QuestionCard({ question, run, busy, onSubmit, onHint, onExplain, onSimilar, focusOnMount = false }: Props) {
  const ids = useId();
  const [numerator, setNumerator] = useState('');
  const [denominator, setDenominator] = useState('');
  const [whole, setWhole] = useState('');
  const [choice, setChoice] = useState('');
  const [reasonId, setReasonId] = useState<ReasonId | null>(null);
  const [reasonText, setReasonText] = useState('');
  const solution = useMemo(() => solve(questionToProblem(question)), [question]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (focusOnMount) formRef.current?.querySelector<HTMLElement>('input')?.focus();
  }, [focusOnMount]);
  const b = question.body;

  function answer(): Answer {
    if (b.type === 'add') return { kind: 'fraction', numerator, denominator };
    if (b.type === 'compare' || b.type === 'equal_check') return { kind: 'choice', optionId: choice };
    return { kind: 'whole', value: whole };
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    onSubmit({ answer: answer(), reasonId, reasonText: reasonText.trim() });
  }

  return (
    <form ref={formRef} className="card" onSubmit={submit} aria-describedby={`${ids}-prompt`} noValidate>
      <p className="stage-label">
        <span className={`stage-pill stage-${question.stage}`}>{messages.stageLabel[question.stage]}</span>
        <span>{messages.familyName(question.family)}</span>
      </p>
      <div id={`${ids}-prompt`} className="prompt">
        <QuestionPrompt question={question} />
      </div>

      <fieldset className="answer">
        <legend>{m.answerGroup}</legend>
        {b.type === 'add' && (
          <div className="fraction-input">
            <div className="fraction-box">
              <label htmlFor={`${ids}-n`} className="visually-hidden">{m.numerator}</label>
              <input id={`${ids}-n`} inputMode="numeric" autoComplete="off" maxLength={3} value={numerator}
                onChange={(e) => setNumerator(e.target.value)} />
              <span className="fraction-line" aria-hidden="true" />
              <label htmlFor={`${ids}-d`} className="visually-hidden">{m.denominator}</label>
              <input id={`${ids}-d`} inputMode="numeric" autoComplete="off" maxLength={3} value={denominator}
                onChange={(e) => setDenominator(e.target.value)} />
            </div>
            <div className="fraction-hints" aria-hidden="true">
              <span>{m.top}</span>
              <span>{m.bottom}</span>
            </div>
          </div>
        )}
        {(b.type === 'missing_numerator' || b.type === 'missing_denominator') && (
          <div className="whole-input">
            <label htmlFor={`${ids}-w`}>{m.missingNumber}</label>
            <input id={`${ids}-w`} inputMode="numeric" autoComplete="off" maxLength={3} value={whole}
              onChange={(e) => setWhole(e.target.value)} />
          </div>
        )}
        {(b.type === 'compare' || b.type === 'equal_check') && (
          <div className="choices">
            {b.order.map((id) => (
              <label key={id} className="choice">
                <input type="radio" name={`${ids}-choice`} value={id} checked={choice === id} onChange={() => setChoice(id)} />
                <span>{choiceLabel(question, id)}</span>
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <details className="reasons">
        <summary>{m.reasonToggle}</summary>
        <fieldset>
          <legend className="visually-hidden">{m.reasonGroup}</legend>
          <div className="chips">
            {REASON_IDS.map((id) => (
              <label key={id} className="chip">
                <input type="radio" name={`${ids}-reason`} value={id} checked={reasonId === id} onChange={() => setReasonId(id)} />
                <span>{messages.reason(id)}</span>
              </label>
            ))}
          </div>
          <label htmlFor={`${ids}-text`} className="text-label">{m.reasonText}</label>
          <textarea id={`${ids}-text`} rows={2} maxLength={MAX_REASON_CHARS} value={reasonText}
            aria-describedby={`${ids}-count`} onChange={(e) => setReasonText(e.target.value.slice(0, MAX_REASON_CHARS))} />
          <p id={`${ids}-count`} className="hint-text">{m.reasonCount(reasonText.length, MAX_REASON_CHARS)}</p>
        </fieldset>
      </details>

      <section className="support" aria-label={m.supportLabel}>
        <p className="support-intro">{m.notSure}</p>
        <div className="support-actions">
          {run.hints < MAX_HINTS && (
            <button type="button" className="secondary" onClick={onHint}>{run.hints === 0 ? m.hint : m.anotherHint}</button>
          )}
          {!run.solutionViewed && <button type="button" className="secondary" onClick={onExplain}>{m.explain}</button>}
          <button type="button" className="secondary" onClick={onSimilar}>{m.similar}</button>
        </div>
        {run.hints > 0 && (
          <ol className="hint-list">
            {solution.hints.slice(0, run.hints).map((hint) => (
              <li key={hint} role="note" className="reveal">{hint}</li>
            ))}
          </ol>
        )}
        {(run.hints > 0 || run.solutionViewed) && <p className="hint-text">{m.hintNote}</p>}
        {run.solutionViewed && <SolutionView solution={solution} initial="all" />}
      </section>

      <button type="submit" className="primary" disabled={busy}>
        {busy ? m.checking : m.check}
      </button>
    </form>
  );
}
