import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import AuxiliarPanel from './components/AuxiliarPanel';
import CajeraPanel from './components/CajeraPanel';
import AdminPanel from './components/AdminPanel';
import { mockAuth } from './lib/supabase';
import { LogOut, ShieldCheck, LayoutDashboard, ClipboardCheck, BarChart3, PlusCircle, User } from 'lucide-react';
import { Toaster } from 'react-hot-toast';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loggedInUser = mockAuth.getUser();
    if (loggedInUser) setUser(loggedInUser);
    setLoading(false);
  }, []);

  const handleLogin = (user) => setUser(user);

  const handleLogout = async () => {
    await mockAuth.signOut();
    setUser(null);
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="spinner" style={{ width: 36, height: 36, borderWidth: 3 }} />
    </div>
  );

  if (!user) return <Login onLogin={handleLogin} />;

  const roleLabel = { auxiliar: 'Auxiliar', cajera: 'Cajera', admin: 'Admin' }[user.role];
  const roleColor = { auxiliar: 'var(--neon-blue)', cajera: 'var(--neon-green)', admin: 'var(--neon-purple)' }[user.role];

  return (
    <div className="app-shell">
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1a1a2e',
            color: '#f0f0ff',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            fontFamily: 'Plus Jakarta Sans, sans-serif',
            fontWeight: 600,
            fontSize: '0.875rem',
            maxWidth: '340px',
          },
          success: { iconTheme: { primary: '#00e5a0', secondary: '#060612' } },
          error: { iconTheme: { primary: '#ff4d6d', secondary: '#060612' } },
        }}
      />

      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-content">
          <div className="topbar-brand">
            <div className="topbar-logo">
              <ShieldCheck size={20} color="white" />
            </div>
            <span className="topbar-name">ConsigControl</span>
          </div>

          <div className="topbar-right">
            {/* User pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '99px',
              padding: '0.3rem 0.75rem 0.3rem 0.4rem',
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: `${roleColor}22`,
                border: `1px solid ${roleColor}44`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <User size={13} color={roleColor} />
              </div>
              <span className="hidden sm:inline" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--text-1)', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.full_name.split(' ')[0]}
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: roleColor, background: `${roleColor}18`, padding: '1px 6px', borderRadius: '99px' }}>
                {roleLabel}
              </span>
            </div>

            <button className="avatar-btn" onClick={handleLogout} title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="app-content">
        {user.role === 'auxiliar' && (
          <div className="mobile-container">
            <AuxiliarPanel user={user} />
          </div>
        )}
        {user.role === 'cajera'   && <CajeraPanel   user={user} />}
        {user.role === 'admin'    && <AdminPanel     user={user} />}
      </main>
    </div>
  );
}

export default App;
