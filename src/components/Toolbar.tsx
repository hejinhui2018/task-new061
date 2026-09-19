import { useEffect } from 'react';
import { useStore } from '../state/store';
import { exportSrt } from '../domain/codec';

export function Toolbar({ onOpen }: { onOpen: (modal: 'delay' | 'shift' | 'versions') => void }) {
  const { state, undo, redo, canUndo, canRedo, dispatch, importFile } = useStore();
  const hasOverlap = state.history.present.transcript.cues.length > 0;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  return (
    <div className="topbar">
      <div className="brand">
        <span className="logo" />
        CaptionFlow <small>字幕时间轴校对台</small>
      </div>

      <button onClick={undo} disabled={!canUndo} title="撤销 (Ctrl+Z)">
        ↶ 撤销
      </button>
      <button onClick={redo} disabled={!canRedo} title="重做 (Ctrl+Shift+Z)">
        ↷ 重做
      </button>

      <span style={{ width: 1, height: 22, background: 'var(--border)' }} />

      <button onClick={() => onOpen('delay')}>⏱ 插入延迟</button>
      <button onClick={() => onOpen('shift')}>⇄ 批量平移</button>
      <button
        className="danger"
        disabled={!hasOverlap}
        title="裁切方式修复全时间轴的所有重叠"
        onClick={() => dispatch({ type: 'repair', mode: 'trim' })}
      >
        一键修复重叠
      </button>
      <button onClick={() => onOpen('versions')}>
        🕓 版本对比 <span className="count" style={{ marginLeft: 4 }}>{state.history.past.length + 1}</span>
      </button>

      <div className="spacer" />

      <LanguageSwitch />

      <span style={{ width: 1, height: 22, background: 'var(--border)' }} />

      <ImportButton onFile={importFile} />
      <ExportMenu />
      <button className="ghost" title="清空当前会话并重新载入内置示例" onClick={() => {
        if (confirm('重置为内置示例？当前历史会被清空（浏览器存储也会覆盖）。')) {
          dispatch({ type: 'resetSample' });
        }
      }}>
        重置示例
      </button>
    </div>
  );
}

function LanguageSwitch() {
  const { state, dispatch } = useStore();
  const langs: Array<{ code: typeof state.language; label: string }> = [
    { code: 'en', label: 'EN' },
    { code: 'zh', label: '中' },
    { code: 'es', label: 'ES' },
  ];
  return (
    <div className="lang-switch">
      {langs.map((l) => (
        <button
          key={l.code}
          className={state.language === l.code ? 'active' : ''}
          onClick={() => dispatch({ type: 'selectLanguage', language: l.code })}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function ImportButton({ onFile }: { onFile: (file: File) => Promise<void> }) {
  return (
    <label className="ghost" style={{ border: '1px solid var(--border-strong)', borderRadius: 6, padding: '5px 12px', cursor: 'pointer' }}>
      ⤓ 导入
      <input
        type="file"
        accept=".json,.srt,application/json"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function ExportMenu() {
  const { transcript, state } = useStore();

  function download(name: string, content: string) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        title="导出全部语言的项目 JSON"
        onClick={() => download('captionflow-project.json', JSON.stringify(transcript, null, 2))}
      >
        ⤒ 导出 JSON
      </button>
      <button
        title={`导出当前语言（${state.language.toUpperCase()}）SRT`}
        onClick={() => download(`captions-${state.language}.srt`, exportSrt(transcript, state.language))}
      >
        ⤒ SRT
      </button>
    </>
  );
}
