import type { Rational } from '../../engine/rational.js';
import { messages } from '../messages.js';

/** A stacked fraction with a spoken text alternative ("three quarters"). Whole numbers and negatives are shown correctly. */
export function Fraction({ value }: { value: Rational }) {
  const negative = value.n < 0;
  const top = Math.abs(value.n);
  return (
    <span className="fraction-wrap" role="img" aria-label={messages.fractionSpeech(value)}>
      {negative && <span className="fraction-sign" aria-hidden="true">{'\u2212'}</span>}
      {value.d === 1 ? (
        <span className="fraction-whole" aria-hidden="true">{top}</span>
      ) : (
        <span className="fraction" aria-hidden="true">
          <span className="fraction-top">{top}</span>
          <span className="fraction-bottom">{value.d}</span>
        </span>
      )}
    </span>
  );
}
