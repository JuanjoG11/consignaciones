import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import AuxiliarPanel from './components/AuxiliarPanel';
import CajeraPanel from './components/CajeraPanel';
import AdminPanel from './components/AdminPanel';
import { mockAuth } from './lib/supabase';
import { LogOut, User } from 'lucide-react';
import { Toaster } from 'react-hot-toast';
import ReloadPrompt from './components/ReloadPrompt';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loggedInUser = mockAuth.getUser();
    if (loggedInUser) setUser(loggedInUser);
    setLoading(false);
  }, []);

  const handleLogin = (user) => setUser(user);
  const handleLogout = async () => { await mockAuth.signOut(); setUser(null); };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div className="spinner"/></div>;
  if (!user) return <><Login onLogin={handleLogin} /><ReloadPrompt/></>;

  const roleLabel = { auxiliar: 'Auxiliar', cajera: 'Cajera', admin: 'Admin' }[user.role];
  const roleColor = { auxiliar: 'var(--neon-blue)', cajera: 'var(--neon-green)', admin: 'var(--neon-purple)' }[user.role];

  return (
    <div className="app-shell">
      <Toaster position="top-center" />
      <ReloadPrompt />
      <header className="topbar">
        <div className="topbar-content">
          <div className="topbar-brand">
            <div className="topbar-logo" />
            <span className="topbar-name">ConsigControl - TAT</span>
          </div>
          <div className="topbar-right">
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: `${roleColor}22`, border: `1px solid ${roleColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={13} color={roleColor} />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700 }}>{user.full_name.split(' ')[0]}</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: roleColor }}>{roleLabel}</span>
            </div>
            <button className="avatar-btn" onClick={handleLogout} title="Cerrar sesión"><LogOut size={16} /></button>
          </div>
        </div>
      </header>
      <main className="app-content">
        {user.role === 'auxiliar' && <div className="mobile-container"><AuxiliarPanel user={user} /></div>}
        {user.role === 'cajera' && <CajeraPanel user={user} />}
        {user.role === 'admin' && <AdminPanel user={user} />}
      </main>
    </div>
  );
}

export default App;