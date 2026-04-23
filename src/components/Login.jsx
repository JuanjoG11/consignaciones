import React, { useState } from 'react';
import { mockAuth } from '../lib/supabase';
import { Lock, Mail, ShieldCheck } from 'lucide-react';

const Login = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { user, error } = await mockAuth.signIn(email, password);
      if (error) {
        setError(error.message);
      } else if (user) {
        onLogin(user);
      }
    } catch (err) {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = (e, qEmail) => {
    e.preventDefault();
    setEmail(qEmail);
    setPassword('123');
  };

  return (
    <div className="page animate-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem)' }}>
      <div className="mobile-container">
        <div className="card" style={{ padding: '2.5rem 2rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.5)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              width: 64, height: 64, background: 'linear-gradient(135deg, var(--neon-blue) 0%, var(--neon-purple) 100%)',
              borderRadius: '20px', margin: '0 auto 1rem', display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(79, 142, 255, 0.3)'
            }}>
              <ShieldCheck size={32} color="white" />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>ConsigControl</h1>
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>Gestión de consignaciones bancarias</p>
          </div>

          <form onSubmit={handleSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Mail size={14} /> Correo Electrónico
              </label>
              <input
                type="email"
                className="form-control"
                placeholder="ejemplo@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Lock size={14} /> Contraseña
              </label>
              <input
                type="password"
                className="form-control"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div style={{ background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.25)', color: 'var(--neon-red)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', textAlign: 'center' }}>
                {error}
              </div>
            )}

            <button type="submit" className="btn btn-primary w-full" style={{ padding: '0.875rem', marginTop: '0.5rem' }} disabled={loading}>
              {loading ? <div className="spinner" /> : 'Ingresar al Sistema'}
            </button>
          </form>

          <div style={{ marginTop: '2.5rem' }}>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', fontWeight: 600 }}>Acceso Rápido (Demo)</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {[
                { r: 'auxiliar', label: 'Auxiliar', icon: '👷', email: 'aux@test.com' },
                { r: 'cajera', label: 'Cajera', icon: '👩‍💼', email: 'cajera@test.com' },
                { r: 'admin', label: 'Admin', icon: '🛡️', email: 'admin@test.com' },
              ].map(fast => (
                <button
                  key={fast.r}
                  onClick={(e) => quickLogin(e, fast.email)}
                  style={{
                    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', padding: '0.75rem 0.25rem', color: 'var(--text-2)',
                    fontSize: '0.7rem', fontWeight: 600, transition: 'all 0.2s', cursor: 'pointer'
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'var(--text-3)'; }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                >
                  <div style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>{fast.icon}</div>
                  {fast.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
