import { useCallback, useEffect, useState } from 'react';
import type { LearnerState } from '../engine/progression.js';
import { fetchStatus, type AiHealth } from './api.js';
import { StudentFlow } from './components/StudentFlow.js';
import { TeacherView } from './components/TeacherView.js';
import { messages } from './messages.js';
import { loadLearner, loadSettings, resetLearner, saveLearner, saveSettings } from './storage.js';

type View = 'practise' | 'teacher' | 'data';
const VIEWS: readonly View[] = ['practise', 'teacher', 'data'];

export function App() {
  const [view, setView] = useState<View>('practise');
  const [state, setState] = useState<LearnerState>(loadLearner);
  const [settings, setSettings] = useState(loadSettings);
  const [aiStatus, setAiStatus] = useState<AiHealth | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    void fetchStatus().then(setAiStatus);
  }, []);

  // The badge follows the latest real explanation; "live" is never shown before a model call has succeeded.
  const onExplanationSource = useCallback((source: 'gemini' | 'fallback') => setAiStatus(source === 'gemini' ? 'live' : 'failing'), []);

  function update(next: LearnerState) {
    setState(next);
    setStorageOk(saveLearner(next));
  }

  function reset() {
    if (!window.confirm(messages.controls.resetConfirm)) return;
    update(resetLearner());
    setView('practise');
    setAnnouncement(messages.controls.resetDone);
  }

  function toggleSamples(showSamples: boolean) {
    const next = { ...settings, showSamples };
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
        {aiStatus !== null && aiStatus !== 'untested' && (
          <p className={`status-pill ${aiStatus === 'live' ? 'live' : 'offline'}`}>
            {aiStatus === 'live' ? messages.explanationsLive : messages.explanationsOffline}
            {aiStatus !== 'live' && <span className="visually-hidden"> {messages.explanationsOfflineDetail}</span>}
          </p>
        )}
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
        {view === 'practise' && <StudentFlow state={state} onChange={update} onExplanationSource={onExplanationSource} />}
        {view === 'teacher' && <TeacherView state={state} showSamples={settings.showSamples} onToggleSamples={toggleSamples} />}
        {view === 'data' && (
          <section className="card" aria-labelledby="data-heading">
            <h2 id="data-heading">{messages.data.heading}</h2>
            <p>{messages.data.stored}</p>
            <p>{messages.data.sent}</p>
            <p>{messages.data.notSent}</p>
            <p>{messages.data.reset}</p>
          </section>
        )}
        <p className="reset-row">
          <button type="button" className="secondary" onClick={reset}>{messages.controls.reset}</button>
        </p>
      </main>
    </>
  );
}
