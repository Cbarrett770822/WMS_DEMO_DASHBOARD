import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import App from './App';

function ProtectedApp() {
  const { isAuthenticated, isLoading, user, logout } = useAuth();

  const isDev = import.meta.env.DEV;

  if (!isDev && isLoading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      }}>
        <div style={{ color: 'white', fontSize: '18px' }}>Loading...</div>
      </div>
    );
  }

  if (!isDev && !isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      {!isDev && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          padding: '10px 20px',
          background: 'rgba(255, 255, 255, 0.9)',
          borderBottomLeftRadius: '8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '15px'
        }}>
          <span style={{ fontSize: '14px', color: '#666' }}>
            {user?.firstName} {user?.lastName}
          </span>
          <button
            onClick={logout}
            style={{
              padding: '6px 12px',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Logout
          </button>
        </div>
      )}
      <App />
    </div>
  );
}

export default function AppWrapper() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={<ProtectedApp />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
