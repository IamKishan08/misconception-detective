import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { MAX_PROBLEM_CHARS, parseProblem } from '../../engine/solver/parse.js';
import { checkAnswer, type AnswerCheck } from '../../engine/solver/check.js';
import { describeProblem, problemText, type Problem } from '../../engine/solver/problem.js';
import { similarProblem } from '../../engine/solver/similar.js';
import { solve, type Solution } from '../../engine/solver/solve.js';
import type { HistoryEvent } from '../../engine/history.js';
import { messages } from '../messages.js';
import { ProblemDisplay } from './ProblemDisplay.js';
import { SolutionView, type InitialReveal } from './SolutionView.js';

export interface Draft {
  problem: string;
  answer: string;
  working: string;
}

interface Props {
  draft: Draft;
  onDraft: (draft: Draft) => void;
  /** True when a Gemini key is configured on the server; follow-up questions are only offered then. */
  aiConfigured: boolean;
  onAiSource: (source: 'gemini' | 'fallback') => void;
  /** Records real activity for My progress. */
  onHistory: (event: HistoryEvent) => void;
}

interface Session {
  readonly problem: Problem;
  readonly solution: Solution;
  readonly check: AnswerCheck | null;
  readonly mode: 'check' | 'start';
  readonly nonce: number;
  /** Identifies this problem attempt in the student's history, so repeated checks never create duplicates. */
  readonly key: string;
}

const m = messages.solve;

function Feedback({ check, onSimilar }: { check: AnswerCheck; onSimilar: () => void }) {
  if (check.verdict === 'correct') {
    return (
      <div className="feedback outcome-correct reveal" role="status">
        <p className="feedback-title">{m.correctTitle}</p>
        <p>{m.correctBody(check.shown)}</p>
        <p><button type="button" className="link" onClick={onSimilar}>{m.similar}</button></p>
      </div>
    );
  }
  if (check.verdict === 'correct_unsimplified') {
    return (
      <div className="feedback outcome-correct reveal" role="status">
        <p className="feedback-title">{m.correctTitle}</p>
        <p>{m.unsimplifiedBody(check.shown, check.simplest ?? '')}</p>
        <p><button type="button" className="link" onClick={onSimilar}>{m.similar}</button></p>
      </div>
    );
  }
  return (
    <div className="feedback outcome-needs_more_evidence reveal" role="status">
      <p className="feedback-title">{m.incorrectTitle}</p>
      <p>{m.observed(check.shown)}</p>
      {check.observations.length > 0 && (
        <ul>
          {check.observations.map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
      )}
      {check.causes.length > 0 && (
        <div className="possible">
          <h3>{m.possibleHeading}</h3>
          {check.causes.map((c) => (
            <div key={c.id}>
              <p>{m.possibleLead} {c.text}</p>
              <p className="hint-text">{c.evidenceText}</p>
            </div>
          ))}
          <p>
            {m.similarOffer}{' '}
            <button type="button" className="link" onClick={onSimilar}>{m.similar}</button>
          </p>
        </div>
      )}
      <p>{m.mistakesUseful}</p>
    </div>
  );
}

export function SolveFlow({ draft, onDraft, aiConfigured, onAiSource, onHistory }: Props) {
  const ids = useId();
  const [touched, setTouched] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const problemRef = useRef<HTMLInputElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const nonce = useRef(0);
  const similarCount = useRef(0);
  const attempt = useRef<{ text: string | null; key: string }>({ text: null, key: '' });

  const preview = useMemo(() => (draft.problem.trim() === '' ? null : parseProblem(draft.problem)), [draft.problem]);

  // Move focus to the result when a new one appears so the explanation is read out and easy to find.
  const sessionNonce = session?.nonce;
  useEffect(() => {
    if (sessionNonce !== undefined) resultRef.current?.focus();
  }, [sessionNonce]);

  function run(mode: 'check' | 'start', event?: FormEvent) {
    event?.preventDefault();
    setTouched(true);
    setNotice(null);
    const parsed = parseProblem(draft.problem);
    if (!parsed.ok) {
      setSession(null);
      problemRef.current?.focus();
      return;
    }
    const solution = solve(parsed.problem);
    let check: AnswerCheck | null = null;
    if (mode === 'check') {
      check = checkAnswer(solution, draft.answer, draft.working);
      if (check.verdict === 'blank' || check.verdict === 'invalid') {
        setSession(null);
        setNotice(check.verdict === 'blank' ? m.needAnswer : (check.message ?? m.needAnswer));
        answerRef.current?.focus();
        return;
      }
    }
    // One history entry per problem attempt: the same problem keeps its key until a new problem is chosen.
    const text = problemText(parsed.problem);
    if (attempt.current.text !== text) attempt.current = { text, key: `solve-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` };
    const key = attempt.current.key;
    if (check !== null) onHistory({ type: 'check', key, source: 'solve', problem: parsed.problem, correct: check.verdict !== 'incorrect', answer: check.shown });
    else onHistory({ type: 'help', key, source: 'solve', problem: parsed.problem, kind: 'hint' });
    nonce.current += 1;
    setSession({ problem: parsed.problem, solution, check, mode, nonce: nonce.current, key });
    setAnnouncement(m.readAs(describeProblem(parsed.problem)));
  }

  function pickExample(text: string) {
    onDraft({ problem: text, answer: '', working: '' });
    setSession(null);
    setNotice(null);
    setTouched(false);
    similarCount.current = 0;
    attempt.current = { text: null, key: '' };
    answerRef.current?.focus();
  }

  function offerSimilar() {
    if (session === null) return;
    const next = similarProblem(session.problem, similarCount.current);
    similarCount.current += 1;
    const text = problemText(next);
    onDraft({ problem: text, answer: '', working: '' });
    setSession(null);
    setNotice(null);
    setTouched(false);
    attempt.current = { text: null, key: '' };
    setAnnouncement(m.similarReady(describeProblem(next)));
    answerRef.current?.focus();
  }

  let initial: InitialReveal = 'progressive';
  if (session?.mode === 'check') initial = session.check?.verdict === 'incorrect' ? 'all' : 'collapsed';
  const showError = touched && preview !== null && !preview.ok;
  const answerInfo =
    session?.check != null && session.check.verdict !== 'blank' && session.check.verdict !== 'invalid'
      ? { text: session.check.shown, correct: session.check.verdict !== 'incorrect' }
      : null;

  return (
    <div className="solve">
      <p className="visually-hidden" role="status">{announcement}</p>
      <form className="card input-card" onSubmit={(e) => run('check', e)} noValidate>
        <h2>{m.heading}</h2>
        <p className="lead">{m.intro}</p>

        <label htmlFor={`${ids}-problem`} className="field-label">{m.problemLabel}</label>
        <input
          ref={problemRef}
          id={`${ids}-problem`}
          className="big-input"
          type="text"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          maxLength={MAX_PROBLEM_CHARS + 20}
          placeholder={m.placeholder}
          value={draft.problem}
          aria-invalid={showError}
          aria-describedby={`${ids}-read ${ids}-formats`}
          onChange={(e) => onDraft({ ...draft, problem: e.target.value })}
          onBlur={() => setTouched(true)}
        />
        <div id={`${ids}-read`} className="read-as" aria-live="polite">
          {preview?.ok === true && (
            <div>
              <p><span className="read-label">{m.readAsLabel}</span> {describeProblem(preview.problem)}</p>
              <ProblemDisplay problem={preview.problem} />
            </div>
          )}
          {showError && preview?.ok === false && <p className="error" role="alert">{preview.message}</p>}
        </div>

        <details id={`${ids}-formats`} className="formats">
          <summary>{m.formatsSummary}</summary>
          <ul>
            {m.formatsRows.map(([what, example]) => (
              <li key={what}><strong>{what}:</strong> <code>{example}</code></li>
            ))}
          </ul>
          <p className="hint-text">{m.formatsNote}</p>
        </details>

        <div className="answer-fields">
          <div>
            <label htmlFor={`${ids}-answer`} className="field-label">{m.answerLabel}</label>
            <input
              ref={answerRef}
              id={`${ids}-answer`}
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={24}
              value={draft.answer}
              aria-describedby={`${ids}-answer-help`}
              onChange={(e) => onDraft({ ...draft, answer: e.target.value })}
            />
            <p id={`${ids}-answer-help`} className="hint-text">{m.answerHelp}</p>
          </div>
          <div>
            <label htmlFor={`${ids}-working`} className="field-label">{m.workingLabel}</label>
            <textarea
              id={`${ids}-working`}
              rows={2}
              maxLength={300}
              value={draft.working}
              aria-describedby={`${ids}-working-help`}
              onChange={(e) => onDraft({ ...draft, working: e.target.value })}
            />
            <p id={`${ids}-working-help`} className="hint-text">{m.workingHelp}</p>
          </div>
        </div>

        {notice !== null && <p className="error" role="alert">{notice}</p>}

        <div className="actions">
          <button type="submit" className="primary">{m.check}</button>
          <button type="button" className="secondary" onClick={() => run('start')}>{m.start}</button>
        </div>

        <div className="examples">
          <p className="field-label" id={`${ids}-examples`}>{m.examplesLabel}</p>
          <ul aria-labelledby={`${ids}-examples`}>
            {m.examples.map((example) => (
              <li key={example}>
                <button type="button" className="chip-button" onClick={() => pickExample(example)}>{example}</button>
              </li>
            ))}
          </ul>
        </div>
      </form>

      <div className="result-col">
        {session === null ? (
          <section className="card placeholder" aria-labelledby={`${ids}-how`}>
            <h2 id={`${ids}-how`}>{m.howHeading}</h2>
            <ol>
              {m.howSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ) : (
          <section className="card result" aria-labelledby={`${ids}-result`}>
            <h2 id={`${ids}-result`} tabIndex={-1} ref={resultRef}>{m.resultHeading}</h2>
            <ProblemDisplay problem={session.problem} />
            <p className="muted read-back">
              {describeProblem(session.problem)}{' '}
              <button type="button" className="link" onClick={() => problemRef.current?.focus()}>{m.edit}</button>
            </p>
            {session.check !== null && <Feedback check={session.check} onSimilar={offerSimilar} />}
            <SolutionView
              key={session.nonce}
              solution={session.solution}
              initial={initial}
              showHints={session.mode === 'start'}
              studentAnswer={answerInfo}
              onSimilar={offerSimilar}
              showHelp
              aiConfigured={aiConfigured}
              causes={session.check?.causes.map((c) => c.id) ?? []}
              onAiSource={onAiSource}
              onSolutionShown={() => onHistory({ type: 'help', key: session.key, source: 'solve', problem: session.problem, kind: 'solution' })}
            />
          </section>
        )}
      </div>
    </div>
  );
}
