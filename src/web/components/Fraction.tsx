import type { Rational } from '../../engine/rational.js';
import { messages } from '../messages.js';

/** A stacked fraction with a spoken text alternative ("three quarters"). */
export function Fraction({ value }: { value: Rational }) {
  return (
    <span className="fraction" role="img" aria-label={messages.fractionSpeech(value)}>
      <span className="fraction-top" aria-hidden="true">{value.n}</span>
      <span className="fraction-bottom" aria-hidden="true">{value.d}</span>
    </span>
  );
}
