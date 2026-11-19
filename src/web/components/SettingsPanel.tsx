import { useEffect, useRef } from 'react';
import { messages } from '../messages.js';
import { THEME_CHOICES, type ThemeChoice } from '../storage.js';

interface Props {
  theme: ThemeChoice;
  onTheme: (theme: ThemeChoice) => void;
  onDeleteHistory: () => void;
  onResetPractice: () => void;
  onDeleteAll: () => void;
  onClose: () => void;
}

const m = messages.settings;

/** Settings: appearance, what is stored and sent, and deletion controls. Closes with the button or Escape. */
export function SettingsPanel({ theme, onTheme, onDeleteHistory, onResetPractice, onDeleteAll, onClose }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <section
      id="settings-panel"
      className="card settings"
      aria-labelledby="settings-heading"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <div className="settings-head">
        <h2 id="settings-heading" tabIndex={-1} ref={heading}>{m.heading}</h2>
        <button type="button" className="secondary" onClick={onClose}>{m.close}</button>
      </div>

      <div className="settings-grid">
        <div>
          <h3>{m.themeHeading}</h3>
          <label className="theme-picker">
            <span>{messages.theme.label}</span>
            <select value={theme} onChange={(e) => onTheme(THEME_CHOICES.find((t) => t === e.target.value) ?? 'system')}>
              {THEME_CHOICES.map((t) => (
                <option key={t} value={t}>{messages.theme[t]}</option>
              ))}
            </select>
          </label>

          <h3>{m.deleteHeading}</h3>
          <p className="hint-text">{messages.data.deleting}</p>
          <div className="actions">
            <button type="button" className="secondary" onClick={onDeleteHistory}>{m.deleteHistory}</button>
            <button type="button" className="secondary" onClick={onResetPractice}>{m.reset}</button>
            <button type="button" className="secondary danger" onClick={onDeleteAll}>{m.deleteAll}</button>
          </div>
        </div>

        <div>
          <h3>{m.dataHeading}</h3>
          <p>{messages.data.stored}</p>
          <p>{messages.data.sent}</p>
          <p>{messages.data.notSent}</p>
        </div>
      </div>
    </section>
  );
}
