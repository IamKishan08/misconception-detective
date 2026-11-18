import { securedCount, type FamilyStatus, type LearnerState } from '../../engine/progression.js';
import { FAMILY_ORDER, type FamilyId } from '../../engine/types.js';
import { messages } from '../messages.js';

interface Props {
  state: LearnerState;
  onPick: (family: FamilyId) => void;
}

const m = messages.progress;

/** Decorative marker per status; the status is also given in text. */
function marker(status: FamilyStatus, index: number): string {
  if (status === 'secure') return '✓';
  return String(index + 1);
}

export function ProgressPath({ state, onPick }: Props) {
  const secured = securedCount(state);
  return (
    <nav className="path" aria-labelledby="path-heading">
      <div className="path-head">
        <h2 id="path-heading">{m.heading}</h2>
        <p className="path-count">{m.count(secured, FAMILY_ORDER.length)}</p>
      </div>
      <ol>
        {FAMILY_ORDER.map((family, index) => {
          const status = state.families[family].status;
          const current = state.activeFamily === family && state.step.kind !== 'finished';
          return (
            <li key={family} className={`path-item status-${status}${current ? ' current' : ''}`}>
              <button type="button" className="path-button" onClick={() => onPick(family)} aria-current={current ? 'step' : undefined}
                aria-label={`${m.practise(family)}: ${messages.status(status)}${current ? ` (${m.current})` : ''}`}>
                <span className="path-marker" aria-hidden="true">{marker(status, index)}</span>
                <span className="path-text" aria-hidden="true">
                  <span className="path-name">{messages.familyName(family)}</span>
                  <span className="path-status">{messages.status(status)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
