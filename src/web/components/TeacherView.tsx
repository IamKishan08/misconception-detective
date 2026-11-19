import { useMemo } from 'react';
import { buildSampleLearners } from '../../engine/demo.js';
import type { LearnerState } from '../../engine/progression.js';
import { groupByFamily, type LearnerEvidence, type TeacherLearner } from '../../engine/teacher.js';
import { messages } from '../messages.js';

interface Props {
  state: LearnerState;
  showSamples: boolean;
  onToggleSamples: (show: boolean) => void;
}

const m = messages.teacher;

function EvidenceTable({ rows, caption }: { rows: readonly LearnerEvidence[]; caption: string }) {
  if (rows.length === 0) return <p className="muted">{m.none}</p>;
  return (
    <div className="table-wrap">
      <table>
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">{m.learner}</th>
            <th scope="col">{m.inferred}</th>
            <th scope="col">{m.observed}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.learnerId}>
              <th scope="row">
                {row.displayName} {row.sample && <span className="badge">{m.sampleBadge}</span>}
              </th>
              <td>{messages.status(row.status)}</td>
              <td>
                <ul className="attempts">
                  {row.observed.map((a) => (
                    <li key={a.seq}>
                      {m.stage(a.stage)}: {messages.questionSummary(a.question)} — {m.answered} {a.answerDisplay} ({m.outcome(a.outcome)}
                      {a.hintUsed ? `, ${m.hintUsed}` : a.independent ? '' : `, ${m.repeat}`})
                    </li>
                  ))}
                </ul>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TeacherView({ state, showSamples, onToggleSamples }: Props) {
  // Samples are built from the engine with fixed seeds; they are separate objects and never touch `state`.
  const samples = useMemo(() => buildSampleLearners(), []);
  const groups = useMemo(() => {
    const learners: TeacherLearner[] = [{ id: 'you', displayName: m.you, sample: false, state }];
    if (showSamples) learners.push(...samples.map((s) => ({ ...s, sample: true })));
    return groupByFamily(learners);
  }, [state, samples, showSamples]);

  return (
    <section aria-labelledby="teacher-heading">
      <h2 id="teacher-heading">{m.heading}</h2>
      <p className="note" role="note">{m.limits}</p>
      <p className="muted">{m.deviceNote}</p>
      <label className="toggle">
        <input type="checkbox" checked={showSamples} onChange={(e) => onToggleSamples(e.target.checked)} />
        {m.showSamples}
      </label>
      <p className="muted">{m.samplesNote}</p>

      {groups.map((group) => (
        <section key={group.family} className="card" aria-labelledby={`group-${group.family}`}>
          <h3 id={`group-${group.family}`}>{messages.familyName(group.family)}</h3>
          <p className="muted">{messages.familyIdea(group.family)}</p>
          <h4>{m.needsReteach}</h4>
          <EvidenceTable rows={group.needsReteach} caption={`${messages.familyName(group.family)}: ${m.needsReteach}`} />
          <h4>{m.improving}</h4>
          <EvidenceTable rows={group.improving} caption={`${messages.familyName(group.family)}: ${m.improving}`} />
          <p>{m.secure(group.secureCount)}</p>
          <div className="activity">
            <h4>{m.activity}</h4>
            <p>{messages.reteach(group.family)}</p>
          </div>
        </section>
      ))}
    </section>
  );
}
