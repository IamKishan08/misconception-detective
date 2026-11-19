import { useEffect, useId, useRef, useState } from 'react';
import { MAX_QUESTION_CHARS } from '../../ai/schemas.js';
import { applicableConcepts, builtInSelect, renderHelp, type HelpContent, type HelpContext, type HelpSelection } from '../../engine/solver/help.js';
import { askForHelp } from '../api.js';
import { messages } from '../messages.js';
import { MathLine } from './MathLine.js';
import { VisualView } from './VisualView.js';

/**
 * Where the choice of help came from. The CONTENT is always built-in and verified; this says who picked it.
 * - ai: Gemini picked it and the server and browser both validated the choice for this problem.
 * - fallback: AI was tried (or is configured) but was unavailable or rejected, so the app matched the question itself.
 * - builtin: no AI is configured; the app matched the question itself.
 * - button: the student picked a built-in suggestion.
 */
export type HelpOrigin = 'ai' | 'fallback' | 'builtin' | 'button';

interface Shown {
  readonly content: HelpContent;
  readonly origin: HelpOrigin;
}

interface Props {
  ctx: HelpContext;
  aiConfigured: boolean;
  onAiSource?: (source: 'gemini' | 'fallback') => void;
}

const m = messages.help;

function HelpView({ shown, onPick }: { shown: Shown; onPick: (selection: HelpSelection) => void }) {
  const { content, origin } = shown;
  return (
    <div className={`help-card origin-${origin} reveal`}>
      <p className={`origin-badge ${origin === 'ai' ? 'ai' : 'builtin'}`}>{m.origin[origin]}</p>
      <h4>{content.title}</h4>
      {content.paragraphs.map((p) => (
        <p key={p}>{p}</p>
      ))}
      {content.lines.map((line) => (
        <p key={line} className="math">
          <MathLine text={line} />
        </p>
      ))}
      {content.visual !== undefined && <VisualView visual={content.visual} />}
      {content.nextHelp.length > 0 && (
        <div className="next-help">
          <p className="hint-text">{m.moreHelp}</p>
          <ul>
            {content.nextHelp.map((n) => (
              <li key={n.label}>
                <button type="button" className="chip-button" onClick={() => onPick(n.selection)}>{n.label}</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/**
 * Ask a short question about the current problem. The question picks which reviewed explanation to show; nothing the
 * model writes is displayed. Protected against stale and duplicate work: one request at a time, aborted when the
 * solution changes or the view is left, and always able to recover.
 */
export function HelpPanel({ ctx, aiConfigured, onAiSource }: Props) {
  const id = useId();
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState<Shown | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);

  useEffect(
    () => () => {
      controller.current?.abort();
    },
    [],
  );

  function show(selection: HelpSelection, origin: HelpOrigin) {
    setShown({ content: renderHelp(selection, ctx), origin });
  }

  async function submit() {
    const question = text.trim();
    if (busy.current || question === '') return;
    setNotice(null);
    if (!aiConfigured) {
      show(builtInSelect(question, ctx), 'builtin');
      return;
    }
    busy.current = true;
    const mine = new AbortController();
    controller.current = mine;
    setLoading(true);
    try {
      const choice = await askForHelp(ctx, question, mine.signal);
      if (mine.signal.aborted) return;
      if (choice.selection !== null) {
        onAiSource?.('gemini');
        show(choice.selection, 'ai');
      } else {
        onAiSource?.('fallback');
        setNotice(choice.reason === 'no_key' ? m.notConfigured : m.unavailable);
        show(builtInSelect(question, ctx), 'fallback');
      }
    } catch {
      if (!mine.signal.aborted) {
        setNotice(m.unavailable);
        show(builtInSelect(question, ctx), 'fallback');
      }
    } finally {
      if (controller.current === mine) {
        controller.current = null;
        busy.current = false;
        setLoading(false);
      }
    }
  }

  const suggestions = applicableConcepts(ctx.solution)
    .filter((c) => c !== 'zero_denominator')
    .slice(0, 3);

  return (
    <form
      className="ask"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <label htmlFor={`${id}-q`}>{m.label}</label>
      <div className="ask-row">
        <input id={`${id}-q`} type="text" autoComplete="off" maxLength={MAX_QUESTION_CHARS} value={text} placeholder={m.placeholder} onChange={(e) => setText(e.target.value)} aria-describedby={`${id}-note`} />
        <button type="submit" className="secondary" disabled={loading || text.trim() === ''}>
          {loading ? m.asking : m.ask}
        </button>
      </div>
      <p id={`${id}-note`} className="hint-text">{aiConfigured ? m.noteAi : m.noteBuiltIn}</p>
      <div role="status" aria-live="polite" className="ask-result">
        {notice !== null && <p className="note">{notice}</p>}
        {shown !== null && <HelpView shown={shown} onPick={(s) => show(s, 'button')} />}
      </div>
      {shown === null && suggestions.length > 0 && (
        <div className="next-help">
          <p className="hint-text">{m.tryAsking}</p>
          <ul>
            {suggestions.map((c) => {
              const content = renderHelp({ intent: 'explain_concept', conceptId: c }, ctx);
              return (
                <li key={c}>
                  <button type="button" className="chip-button" onClick={() => show({ intent: 'explain_concept', conceptId: c }, 'button')}>{content.title}</button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </form>
  );
}
