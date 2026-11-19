import { speakMath } from '../messages.js';

/** One line of working, read aloud sensibly ("two quarters plus one quarter equals three quarters"). */
export function MathLine({ text }: { text: string }) {
  return (
    <span className="math-line">
      <span aria-hidden="true">{text}</span>
      <span className="visually-hidden">{speakMath(text)}</span>
    </span>
  );
}
