import { useCallback, useEffect, useState } from 'react';
import type { LearnerState } from '../engine/progression.js';
import { fetchStatus, type AiHealth } from './api.js';
import { SolveFlow, type Draft } from './components/SolveFlow.js';
import { StudentFlow } from './components/StudentFlow.js';
import { TeacherView } from './components/TeacherView.js';
import { messages } from './messages.js';
import { applyTheme, loadLearner, loadSettings, resetLearner, saveLearner, saveSettings, THEME_CHOICES, type ThemeChoice } from './storage.js';

type View = 'solve' | 'practise' | 'teacher' | 'data';
const VIEWS: readonly View[] = ['solve', 'practise', 'teacher', 'data'];
const EMPTY_DRAFT: Draft = { problem: '', answer: '', working: '' };

export function App() {
  const [view, setView] = useState<View>('solve');
  const [state, setState] = useState<LearnerState>(loadLearner);
  const [settings, setSettings] = useState(loadSettings);
  const [aiStatus, setAiStatus] = useState<AiHealth | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  // Bumped on reset so the practice screen is rebuilt and any request still in flight is cancelled with it.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    void fetchStatus().then(setAiStatus);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // The badge follows what really happened: "live" only after a real model reply was used, never merely because a key exists.
  const onAiSource = useCallback((source: 'gemini' | 'fallback') => setAiStatus(source === 'gemini' ? 'live' : 'failing'), []);

  function update(next: LearnerState) {
    setState(next);
    setStorageOk(saveLearner(next));
  }

  function reset() {
    if (!window.confirm(messages.controls.resetConfirm)) return;
    setEpoch((n) => n + 1);
    update(resetLearner());
    setView('practise');
    setAnnouncement(messages.controls.resetDone);
  }

  function changeSettings(patch: Partial<typeof settings>) {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  }

  return (
    <>
      <a className="skip-link" href="#main">{messages.skipToContent}</a>
      <header className="site-header">
        <div className="brand">
          <svg className="logo" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <rect width="32" height="32" rx="8" className="logo-bg" />
            <rect x="5" y="9" width="11" height="6" className="logo-fill" />
            <rect x="16" y="9" width="11" height="6" className="logo-line" />
            <rect x="5" y="18" width="7.3" height="6" className="logo-fill" />
            <rect x="12.3" y="18" width="7.3" height="6" className="logo-line" />
            <rect x="19.6" y="18" width="7.4" height="6" className="logo-line" />
          </svg>
          <div>
            <h1>{messages.appName}</h1>
            <p className="tagline">{messages.tagline}</p>
          </div>
        </div>
        <div className="header-tools">
          {aiStatus !== null && aiStatus !== 'untested' && (
            <p className={`status-pill ${aiStatus === 'live' ? 'live' : 'offline'}`}>
              {aiStatus === 'live' ? messages.explanationsLive : messages.explanationsOffline}
              {aiStatus !== 'live' && <span className="visually-hidden"> {messages.explanationsOfflineDetail}</span>}
            </p>
          )}
          <label className="theme-picker">
            <span>{messages.theme.label}</span>
            <select value={settings.theme} onChange={(e) => changeSettings({ theme: THEME_CHOICES.find((t) => t === e.target.value) ?? 'system' })}>
              {THEME_CHOICES.map((t: ThemeChoice) => (
                <option key={t} value={t}>{messages.theme[t]}</option>
              ))}
            </select>
          </label>
        </div>
        <nav aria-label="Main">
          <ul className="tabs">
            {VIEWS.map((v) => (
              <li key={v}>
                <button type="button" className="tab" aria-current={view === v ? 'page' : undefined} onClick={() => setView(v)}>
                  {messages.nav[v]}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        {!storageOk && <p className="note" role="note">{messages.controls.storageWarning}</p>}
        <p className="visually-hidden" role="status">{announcement}</p>
        {view === 'solve' && <SolveFlow draft={draft} onDraft={setDraft} aiConfigured={aiStatus !== null && aiStatus !== 'offline'} onAiSource={onAiSource} />}
        {view === 'practise' && <StudentFlow key={epoch} state={state} onChange={update} onExplanationSource={onAiSource} />}
        {view === 'teacher' && <TeacherView state={state} showSamples={settings.showSamples} onToggleSamples={(showSamples) => changeSettings({ showSamples })} />}
        {view === 'data' && (
          <section className="card" aria-labelledby="data-heading">
            <h2 id="data-heading">{messages.data.heading}</h2>
            <p>{messages.data.stored}</p>
            <p>{messages.data.sent}</p>
            <p>{messages.data.notSent}</p>
            <p>{messages.data.reset}</p>
          </section>
        )}
        {view === 'practise' && (
          <p className="reset-row">
            <button type="button" className="secondary" onClick={reset}>{messages.controls.reset}</button>
          </p>
        )}
      </main>
    </>
  );
}
