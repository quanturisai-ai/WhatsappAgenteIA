import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AgentConfig } from './pages/AgentConfig';
import { WhatsAppStatus } from './pages/WhatsAppStatus';
import { Documents } from './pages/Documents';
import { Medias } from './pages/Medias';
import { Indexing } from './pages/Indexing';

function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/config" element={<AgentConfig />} />
          <Route path="/whatsapp" element={<WhatsAppStatus />} />
          <Route path="/documents" element={<Documents />} />
          <Route path="/medias" element={<Medias />} />
          <Route path="/indexing" element={<Indexing />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;

