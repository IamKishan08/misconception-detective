import { securedCount, type LearnerState } from '../../engine/progression.js';
import { FAMILY_ORDER, type FamilyId } from '../../engine/types.js';
import { messages } from '../messages.js';

interface Props {
  state: LearnerState;
  onPick: (family: FamilyId) => void;
}

const m = messages.progress;

export function ProgressPath({ state, onPick }: Props) {
  return (
    <nav className="path" aria-labelledby="path-heading">
      <h2 id="path-heading">{m.heading}</h2>
      <p>{m.count(securedCount(state), FAMILY_ORDER.length)}</p>
      <ol>
        {FAMILY_ORDER.map((family) => {
          const status = state.families[family].status;
          const current = state.activeFamily === family && state.step.kind !== 'finished';
          return (
            <li key={family} className={`path-item status-${status}`}>
              <button type="button" className="link" onClick={() => onPick(family)} aria-current={current ? 'step' : undefined}
                aria-label={`${m.practise(family)}: ${messages.status(status)}`}>
                <span className="path-name">{messages.familyName(family)}</span>
                <span className="path-status">{messages.status(status)}{current ? ` (${m.current})` : ''}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
