import { useEffect, useMemo, useRef, useState } from 'react';
import { FAMILIES } from '../../engine/families/index.js';
import type { Question } from '../../engine/types.js';
import type { Explanation } from '../api.js';
import { messages } from '../messages.js';
import { FractionBars } from './FractionBars.js';

interface Props {
  question: Question;
  labelled: boolean;
  explanation: Explanation | null;
  onContinue: () => void;
}

const m = messages.explanation;

export function ExplanationPanel({ question, labelled, explanation, onContinue }: Props) {
  const steps = useMemo(() => FAMILIES[question.family].visual(question), [question]);
  const [index, setIndex] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const step = steps[Math.min(index, steps.length - 1)];
  const last = index >= steps.length - 1;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="card" aria-labelledby="explain-heading">
      <h2 id="explain-heading" ref={headingRef} tabIndex={-1}>{m.heading}</h2>
      <p>{labelled ? m.labelledIntro(question.family) : m.supportIntro}</p>

      {step !== undefined && (
        <div className="visual">
          <p className="step-count">{m.step(index + 1, steps.length)}</p>
          <FractionBars bars={step.bars} />
          <p aria-live="polite" className="step-note">{m.note(step.note)}</p>
          <div className="step-controls">
            <button type="button" className="secondary" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
              {m.previous}
            </button>
            <button type="button" className="secondary" onClick={() => setIndex((i) => Math.min(steps.length - 1, i + 1))} disabled={last}>
              {m.next}
            </button>
          </div>
        </div>
      )}

      <div className="ai-text">
        {explanation === null ? (
          <p>{m.loading}</p>
        ) : (
          <>
            <h3>{m.templateTitle(explanation.templateId)}</h3>
            {explanation.sentences.map((sentence) => (
              <p key={sentence}>{sentence}</p>
            ))}
            <p className={explanation.source === 'gemini' ? 'source live' : 'source offline'}>
              {explanation.source === 'gemini' ? messages.explanationsLive : messages.explanationsOffline}
              {explanation.networkError === true ? ` · ${messages.controls.networkError}` : ''}
            </p>
          </>
        )}
      </div>

      <button type="button" className="primary" onClick={onContinue}>
        {m.continue}
      </button>
    </section>
  );
}
