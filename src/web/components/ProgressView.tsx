import { useMemo, useState } from 'react';
import { outcomeOf, summarise, type History, type HistoryEntry } from '../../engine/history.js';
import type { LearnerState } from '../../engine/progression.js';
import { problemText } from '../../engine/solver/problem.js';
import { solve } from '../../engine/solver/solve.js';
import { FAMILY_ORDER } from '../../engine/types.js';
import { messages } from '../messages.js';
import { ProblemDisplay } from './ProblemDisplay.js';
import { SolutionView } from './SolutionView.js';

interface Props {
  history: History;
  learner: LearnerState;
  /** Open this problem in Solve my problem so it can be tried again. */
  onPractiseAgain: (text: string) => void;
  onDeleteHistory: () => void;
}

const m = messages.myProgress;

function when(at: number | null): string {
  if (at === null) return m.earlier;
  return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function Entry({ entry, onPractiseAgain }: { entry: HistoryEntry; onPractiseAgain: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const outcome = outcomeOf(entry);
  const solution = useMemo(() => solve(entry.problem), [entry.problem]);
  return (
    <li className="history-item">
      <div className="history-head">
        <ProblemDisplay problem={entry.problem} />
        <p className={`outcome-badge outcome-${outcome}`} title={m.outcomeNote[outcome]}>{m.outcomeLabel[outcome]}</p>
      </div>
      <p className="hint-text">
        {m.source[entry.source]} &middot; {m.topicLabel[entry.topic]} &middot; {when(entry.at)}
        {entry.answer !== null && <> &middot; {m.yourAnswer}: {entry.answer}</>}
      </p>
      <p className="hint-text">{m.outcomeNote[outcome]}</p>
      <div className="actions">
        <button type="button" className="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? m.hideReview : m.review}
        </button>
        <button type="button" className="secondary" onClick={() => onPractiseAgain(problemText(entry.problem))}>{m.practiseAgain}</button>
      </div>
      {open && <SolutionView solution={solution} initial="all" />}
    </li>
  );
}

/**
 * The student's own activity: no sample data, no scores, no mastery claims. Outcomes separate a correct answer made
 * independently from a retry and from help, and merely opening a solution is never treated as understanding.
 */
export function ProgressView({ history, learner, onPractiseAgain, onDeleteHistory }: Props) {
  const topics = useMemo(() => summarise(history), [history]);
  const recent = useMemo(() => [...history.entries].reverse(), [history]);
  const practised = FAMILY_ORDER.filter((f) => learner.families[f].attempts.length > 0);

  if (history.entries.length === 0 && practised.length === 0) {
    return (
      <section className="card" aria-labelledby="progress-heading">
        <h2 id="progress-heading">{m.heading}</h2>
        <p className="lead">{m.intro}</p>
        <div className="empty-state">
          <h3>{m.emptyTitle}</h3>
          <p>{m.emptyBody}</p>
        </div>
      </section>
    );
  }

  const revisit = topics.filter((t) => t.revisit);
  return (
    <div className="progress">
      <section className="card" aria-labelledby="progress-heading">
        <h2 id="progress-heading">{m.heading}</h2>
        <p className="lead">{m.intro}</p>

        <h3>{m.topicsHeading}</h3>
        {topics.length === 0 && <p className="muted">{m.noHistory}</p>}
        {topics.length > 0 && <div className="table-wrap" role="region" aria-label={m.topicsHeading} tabIndex={0}>
          <table>
            <caption className="visually-hidden">{m.topicsHeading}</caption>
            <thead>
              <tr>
                <th scope="col">{m.table.topic}</th>
                <th scope="col">{m.table.total}</th>
                {(['independent', 'retry', 'with_help', 'incorrect', 'explored'] as const).map((o) => (
                  <th scope="col" key={o}>{m.outcomeLabel[o]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topics.map((t) => (
                <tr key={t.topic}>
                  <th scope="row">{m.topicLabel[t.topic]}</th>
                  <td>{t.total}</td>
                  {(['independent', 'retry', 'with_help', 'incorrect', 'explored'] as const).map((o) => (
                    <td key={o}>{t.counts[o]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>}

        <h3>{m.revisitHeading}</h3>
        {revisit.length === 0 ? (
          <p className="muted">{m.revisitNone}</p>
        ) : (
          <>
            <p className="muted">{m.revisitBody}</p>
            <ul className="revisit">
              {revisit.map((t) => (
                <li key={t.topic}>{m.topicLabel[t.topic]}</li>
              ))}
            </ul>
          </>
        )}

        {practised.length > 0 && (
          <>
            <h3>{m.practiceHeading}</h3>
            <p className="muted">{m.practiceNote}</p>
            <ul className="revisit">
              {practised.map((f) => (
                <li key={f}>
                  {messages.familyName(f)}: {messages.status(learner.families[f].status)}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {recent.length > 0 && (
        <section className="card" aria-labelledby="recent-heading">
          <h2 id="recent-heading">{m.recentHeading}</h2>
          <p className="hint-text">{m.count(recent.length)} &middot; {m.boundedNote}</p>
          <ul className="history">
            {recent.map((e) => (
              <Entry key={e.key} entry={e} onPractiseAgain={onPractiseAgain} />
            ))}
          </ul>
          <div className="actions">
            <button type="button" className="secondary" onClick={onDeleteHistory}>{m.deleteHistory}</button>
          </div>
        </section>
      )}
    </div>
  );
}
