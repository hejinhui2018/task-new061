import { useEffect, useState } from 'react';
import { StoreProvider, useStore } from './state/store';
import { Toolbar } from './components/Toolbar';
import { Timeline } from './components/Timeline';
import { CueTable } from './components/CueTable';
import { IssuesPanel } from './components/IssuesPanel';
import { ImpactPanel } from './components/ImpactPanel';
import { Modals, type ModalKind } from './components/Modals';

function Workbench() {
  const [modal, setModal] = useState<ModalKind | null>(null);
  return (
    <div className="app">
      <Toolbar onOpen={setModal} />
      <div className="main">
        <div className="center">
          <Timeline />
          <CueTable />
        </div>
        <div className="right">
          <IssuesPanel />
          <ImpactPanel />
        </div>
      </div>
      <Modals kind={modal} onClose={() => setModal(null)} />
      <Notice />
    </div>
  );
}

function Notice() {
  const { state, dispatch } = useStore();
  const notice = state.notice;
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => dispatch({ type: 'notice', notice: null }), 3500);
    return () => clearTimeout(t);
  }, [notice, dispatch]);
  if (!notice) return null;
  return <div className={`notice ${notice.kind}`}>{notice.text}</div>;
}

export default function App() {
  return (
    <StoreProvider>
      <Workbench />
    </StoreProvider>
  );
}
