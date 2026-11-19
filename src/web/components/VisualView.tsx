import type { Frac } from '../../engine/solver/frac.js';
import type { BarSpec, Visual } from '../../engine/solver/solve.js';
import { messages } from '../messages.js';

const BAR_W = 300;
const BAR_H = 26;
const BAR_GAP = 6;

/** One bar per whole: a value of 5/4 is drawn as one full bar plus a bar with one part shaded, never squeezed into one whole. */
function Bar({ spec }: { spec: BarSpec }) {
  const wholes = Math.max(1, Math.ceil(spec.shaded / spec.parts));
  const partW = BAR_W / spec.parts;
  const height = wholes * BAR_H + (wholes - 1) * BAR_GAP;
  return (
    <li className={`bar-row tone-${spec.tone}`}>
      <span className="bar-caption" aria-hidden="true">{spec.label}</span>
      <svg
        viewBox={`0 0 ${BAR_W} ${height}`}
        className="bar"
        style={{ aspectRatio: `${BAR_W} / ${height}` }}
        role="img"
        aria-label={messages.solve.barLabel(spec.label, spec.shaded, spec.parts, wholes)}
      >
        {Array.from({ length: wholes }, (_, w) =>
          Array.from({ length: spec.parts }, (_, i) => (
            <rect
              key={`${w}-${i}`}
              x={i * partW}
              y={w * (BAR_H + BAR_GAP)}
              width={partW}
              height={BAR_H}
              className={w * spec.parts + i < spec.shaded ? 'part shaded' : 'part'}
            />
          )),
        )}
      </svg>
    </li>
  );
}

const LINE_W = 320;
const PAD = 18;
const AXIS_Y = 44;

function LineView({ visual }: { visual: Extract<Visual, { kind: 'line' }> }) {
  const span = visual.max - visual.min;
  const pos = (v: number) => PAD + ((v - visual.min) / span) * (LINE_W - 2 * PAD);
  const x = (f: Frac) => pos(f.n / f.d);
  const wholes = Array.from({ length: span + 1 }, (_, i) => visual.min + i);
  const minor = visual.tickDen === null ? [] : Array.from({ length: span * visual.tickDen + 1 }, (_, i) => visual.min + i / (visual.tickDen ?? 1));
  const description = visual.marks.map((m) => `${m.label}`).join(', ');
  return (
    <svg
      viewBox={`0 0 ${LINE_W} 78`}
      className="numberline"
      role="img"
      aria-label={messages.solve.lineLabel(visual.min, visual.max, description)}
    >
      <line x1={PAD} x2={LINE_W - PAD} y1={AXIS_Y} y2={AXIS_Y} className="axis" />
      {minor.map((v) => (
        <line key={`m${v}`} x1={pos(v)} x2={pos(v)} y1={AXIS_Y - 4} y2={AXIS_Y + 4} className="tick minor" />
      ))}
      {wholes.map((w) => (
        <g key={`w${w}`}>
          <line x1={pos(w)} x2={pos(w)} y1={AXIS_Y - 8} y2={AXIS_Y + 8} className="tick" />
          <text x={pos(w)} y={AXIS_Y + 22} textAnchor="middle" className="tick-label">{w < 0 ? `\u2212${-w}` : w}</text>
        </g>
      ))}
      {visual.arrow !== undefined && (
        <path
          d={`M ${x(visual.arrow.from)} ${AXIS_Y - 10} Q ${(x(visual.arrow.from) + x(visual.arrow.to)) / 2} ${AXIS_Y - 40} ${x(visual.arrow.to)} ${AXIS_Y - 10}`}
          className="jump"
          fill="none"
        />
      )}
      {visual.marks.map((m, i) => (
        <g key={`${m.label}-${i}`} className={`mark tone-${m.tone}`}>
          <circle cx={x(m.value)} cy={AXIS_Y} r={5} />
          <text x={x(m.value)} y={i % 2 === 0 ? 14 : 70} textAnchor="middle" className="mark-label">{m.label}</text>
        </g>
      ))}
    </svg>
  );
}

export function VisualView({ visual }: { visual: Visual }) {
  return (
    <figure className="visual">
      {visual.kind === 'bars' ? (
        <ul className="bars">
          {visual.bars.map((b, i) => (
            <Bar key={`${i}-${b.label}`} spec={b} />
          ))}
        </ul>
      ) : (
        <LineView visual={visual} />
      )}
      <figcaption>{visual.caption}</figcaption>
    </figure>
  );
}
