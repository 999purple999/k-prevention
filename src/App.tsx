import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useSession } from './lib/session.tsx';
import { Login } from './pages/Login.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ImportPage } from './pages/Import.tsx';
import { Settings } from './pages/Settings.tsx';
import { Layout } from './components/Layout.tsx';

function Protected({ children }: { children: React.ReactNode }) {
  const { isUnlocked } = useSession();
  const location = useLocation();
  if (!isUnlocked) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Layout>{children}</Layout>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/import" element={<Protected><ImportPage /></Protected>} />
      <Route path="/settings" element={<Protected><Settings /></Protected>} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
