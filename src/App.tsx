import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './lib/session.tsx';
import { useIsMobile } from './hooks/useIsMobile.ts';
import { Login } from './pages/Login.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ImportPage } from './pages/Import.tsx';
import { Settings } from './pages/Settings.tsx';
import { Scenarios } from './pages/Scenarios.tsx';
import { Registra } from './pages/Registra.tsx';
import { Layout } from './components/Layout.tsx';
import { MobileLayout } from './components/MobileLayout.tsx';

function Protected({ children }: { children: React.ReactNode }) {
  const { isUnlocked } = useSession();
  const location = useLocation();
  const isMobile = useIsMobile();
  if (!isUnlocked) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  const Shell = isMobile ? MobileLayout : Layout;
  return <Shell>{children}</Shell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/registra" element={<Protected><Registra /></Protected>} />
      <Route path="/scenari" element={<Protected><Scenarios /></Protected>} />
      <Route path="/import" element={<Protected><ImportPage /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
