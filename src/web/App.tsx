import { useCallback, useEffect, useRef, useState } from 'react';
import { applyEvent, emptyHistory, type History, type HistoryEvent } from '../engine/history.js';
import type { LearnerState } from '../engine/progression.js';
import { fetchStatus, type AiHealth } from './api.js';
import { ProgressView } from './components/ProgressView.js';
import { SettingsPanel } from './components/SettingsPanel.js';
import { SolveFlow, type Draft } from './components/SolveFlow.js';
import { StudentFlow } from './components/StudentFlow.js';
import { messages } from './messages.js';
import {
  applyTheme,
  clearAllData,
  clearHistory,
  loadHistory,
  loadLearner,
  loadSettings,
  resetLearner,
  saveHistory,
  saveLearner,
  saveSettings,
  type ThemeChoice,
} from './storage.js';

type View = 'solve' | 'practise' | 'progress';
const VIEWS: readonly View[] = ['solve', 'practise', 'progress'];
const EMPTY_DRAFT: Draft = { problem: '', answer: '', working: '' };

export function App() {
  const [view, setView] = useState<View>('solve');
  const [state, setState] = useState<LearnerState>(loadLearner);
  const [history, setHistory] = useState<History>(() => loadHistory(state));
  const historyRef = useRef(history);
  const [settings, setSettings] = useState(loadSettings);
  const [aiStatus, setAiStatus] = useState<AiHealth | null>(null);
  const [storageOk, setStorageOk] = useState(true);
  const [announcement, setAnnouncement] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  // Bumped on reset so the practice screen is rebuilt and any request still in flight is cancelled with it.
  const [epoch, setEpoch] = useState(0);

  useEffect(() => {
    void fetchStatus().then(setAiStatus);
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  // The badge follows what really happened: "live" only after a model choice was accepted, never merely because a key exists.
  const onAiSource = useCallback((source: 'gemini' | 'fallback') => setAiStatus(source === 'gemini' ? 'live' : 'failing'), []);

  /** Records one real event in the student's history. Safe to repeat: entries are keyed, so nothing is counted twice. */
  const record = useCallback((event: HistoryEvent) => {
    const next = applyEvent(historyRef.current, event, Date.now());
    if (next === historyRef.current) return;
    historyRef.current = next;
    setHistory(next);
    if (!saveHistory(next)) setStorageOk(false);
  }, []);

  function update(next: LearnerState) {
    setState(next);
    setStorageOk(saveLearner(next));
  }

  function replaceHistory(next: History) {
    historyRef.current = next;
    setHistory(next);
  }

  function deleteHistory() {
    if (!window.confirm(messages.settings.deleteHistoryConfirm)) return;
    replaceHistory(clearHistory());
    setAnnouncement(messages.settings.historyDeleted);
  }

  function resetPractice() {
    if (!window.confirm(messages.settings.resetConfirm)) return;
    setEpoch((n) => n + 1);
    update(resetLearner());
    setAnnouncement(messages.settings.resetDone);
  }

  function deleteAll() {
    if (!window.confirm(messages.settings.deleteAllConfirm)) return;
    clearAllData();
    setEpoch((n) => n + 1);
    replaceHistory(emptyHistory());
    clearHistory();
    update(resetLearner());
    setSettings({ theme: 'system' });
    setDraft(EMPTY_DRAFT);
    setAnnouncement(messages.settings.allDeleted);
  }

  function changeTheme(theme: ThemeChoice) {
    const next = { ...settings, theme };
    setSettings(next);
    saveSettings(next);
  }

  function closeSettings() {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  }

  function practiseAgain(text: string) {
    setDraft({ problem: text, answer: '', working: '' });
    setView('solve');
  }

  const aiConfigured = aiStatus !== null && aiStatus !== 'offline';

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
          <button
            type="button"
            ref={settingsButton}
            className="secondary settings-button"
            aria-expanded={settingsOpen}
            aria-controls="settings-panel"
            onClick={() => (settingsOpen ? closeSettings() : setSettingsOpen(true))}
          >
            {messages.settings.open}
          </button>
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
        {settingsOpen && (
          <SettingsPanel
            theme={settings.theme}
            onTheme={changeTheme}
            onDeleteHistory={deleteHistory}
            onResetPractice={resetPractice}
            onDeleteAll={deleteAll}
            onClose={closeSettings}
          />
        )}
        {view === 'solve' && <SolveFlow draft={draft} onDraft={setDraft} aiConfigured={aiConfigured} onAiSource={onAiSource} onHistory={record} />}
        {view === 'practise' && (
          <StudentFlow key={epoch} state={state} onChange={update} onExplanationSource={onAiSource} onHistory={record} aiConfigured={aiConfigured} />
        )}
        {view === 'progress' && <ProgressView history={history} learner={state} onPractiseAgain={practiseAgain} onDeleteHistory={deleteHistory} />}
      </main>
    </>
  );
}
