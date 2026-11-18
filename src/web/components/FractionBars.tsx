import type { Bar } from '../../engine/types.js';
import { messages } from '../messages.js';

const WIDTH = 300;
const HEIGHT = 36;

/** Draws one bar per engine-computed quantity. Widths come straight from parts and shaded counts. */
export function FractionBars({ bars }: { bars: readonly Bar[] }) {
  return (
    <ul className="bars">
      {bars.map((bar, index) => {
        const partWidth = WIDTH / bar.parts;
        return (
          <li key={`${index}-${bar.parts}-${bar.shaded}`} className="bar-row">
            <svg
              viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
              className={`bar bar-${bar.role}`}
              role="img"
              aria-label={messages.explanation.barLabel(bar.value, bar.parts, bar.shaded)}
              preserveAspectRatio="none"
            >
              {Array.from({ length: bar.parts }, (_, i) => (
                <rect
                  key={i}
                  x={i * partWidth}
                  y={0}
                  width={partWidth}
                  height={HEIGHT}
                  className={i < bar.shaded ? 'part shaded' : 'part'}
                />
              ))}
            </svg>
            <span className="bar-value" aria-hidden="true">
              {bar.value.n}/{bar.value.d}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
