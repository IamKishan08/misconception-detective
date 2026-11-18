import { useEffect, useState } from 'react';
import type { LearnerState } from '../engine/progression.js';
import { fetchStatus } from './api.js';
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
  const [aiStatus, setAiStatus] = useState<'live' | 'offline' | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setStorageOk(saveLearner(state));
  }, [state]);

  useEffect(() => {
    void fetchStatus().then(setAiStatus);
  }, []);

  function reset() {
    if (!window.confirm(messages.controls.resetConfirm)) return;
    setState(resetLearner());
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
        <div>
          <h1>{messages.appName}</h1>
          <p className="tagline">{messages.tagline}</p>
        </div>
        {aiStatus !== null && (
          <p className={`status-pill ${aiStatus}`}>
            {aiStatus === 'live' ? messages.explanationsLive : messages.explanationsOffline}
            {aiStatus === 'offline' && <span className="visually-hidden"> {messages.explanationsOfflineDetail}</span>}
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
        {view === 'practise' && <StudentFlow state={state} onChange={setState} />}
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
