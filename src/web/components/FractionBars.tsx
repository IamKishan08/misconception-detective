import type { Bar } from '../../engine/types.js';
import { messages } from '../messages.js';

const WIDTH = 300;
const HEIGHT = 40;

/** Draws one bar per engine-computed quantity. Widths come straight from parts and shaded counts. */
export function FractionBars({ bars }: { bars: readonly Bar[] }) {
  return (
    <ul className="bars">
      {bars.map((bar, index) => {
        const partWidth = WIDTH / bar.parts;
        return (
          <li key={`${index}-${bar.role}-${bar.parts}-${bar.shaded}`} className={`bar-row role-${bar.role}`}>
            <span className="bar-caption" aria-hidden="true">
              {messages.explanation.barCaption(bar.role, bar.value)}
            </span>
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className="bar"
              role="img"
              aria-label={`${messages.explanation.barCaption(bar.role, bar.value)}. ${messages.explanation.barLabel(bar.value, bar.parts, bar.shaded)}`}
              preserveAspectRatio="none"
            >
              {Array.from({ length: bar.parts }, (_, i) => (
                <rect key={i} x={i * partWidth} y={0} width={partWidth} height={HEIGHT} className={i < bar.shaded ? 'part shaded' : 'part'} />
              ))}
            </svg>
          </li>
        );
      })}
    </ul>
  );
}
