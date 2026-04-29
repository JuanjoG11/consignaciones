import React, { useState } from 'react';
import { mockAuth, AUXILIARES } from '../lib/supabase';
import { Lock, Mail, ShieldCheck, IdCard, Users, ClipboardList, ChevronRight } from 'lucide-react';

// Ordenar auxiliares alfabéticamente para el dropdown
const AUXILIARES_SORTED = [...AUXILIARES].sort((a, b) => a.nombre.localeCompare(b.nombre));

const ROLES = [
  { id: 'auxiliar', label: 'Auxiliar',  icon: '👷', color: 'var(--neon-blue)',   desc: 'Login con cédula' },
  { id: 'cajera',   label: 'Cajera',    icon: '👩‍💼', color: 'var(--neon-green)',  desc: 'Login con correo' },
  { id: 'admin',    label: 'Admin',     icon: '🛡️', color: 'var(--neon-purple)', desc: 'Login con correo' },
];

const Login = ({ onLogin }) => {
  const [selectedRole, setSelectedRole] = useState(null);

  // Auxiliar
  const [cedula, setCedula]   = useState('');

  // Cajera / Admin
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  const handleRoleSelect = (role) => {
    setSelectedRole(role);
    setError('');
    setCedula('');
    setEmail('');
    setPassword('');
  };

  // ── Submit Auxiliar ───────────────────────────────────────────────────────
  const handleAuxiliarSubmit = async (e) => {
    e.preventDefault();
    if (!cedula.trim()) { setError('Ingresa tu número de cédula'); return; }
    setLoading(true);
    setError('');
    try {
      const { user, error } = await mockAuth.signIn(null, null, cedula.trim());
      if (error) setError(error.message);
      else if (user) onLogin(user);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit Cajera / Admin ─────────────────────────────────────────────────
  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { user, error } = await mockAuth.signIn(email, password);
      if (error) setError(error.message);
      else if (user) onLogin(user);
    } catch {
      setError('Error de conexión');
    } finally {
      setLoading(false);
    }
  };

  const roleInfo = ROLES.find(r => r.id === selectedRole);

  return (
    <div className="page animate-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 4rem)' }}>
      <div className="mobile-container">
        <div className="card" style={{ padding: '2.5rem 2rem', textAlign: 'center', background: 'rgba(30, 41, 59, 0.5)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.05)' }}>

          {/* Header */}
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              width: 64, height: 64,
              background: 'linear-gradient(135deg, var(--neon-blue) 0%, var(--neon-purple) 100%)',
              borderRadius: '20px', margin: '0 auto 1rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 30px rgba(79, 142, 255, 0.3)',
            }}>
              <ShieldCheck size={32} color="white" />
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>ConsigControl</h1>
            <p style={{ color: 'var(--text-3)', fontSize: '0.875rem' }}>Gestión de consignaciones bancarias</p>
          </div>

          {/* ── PASO 1: Selección de rol ── */}
          {!selectedRole && (
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: '1rem', textAlign: 'center' }}>
                ¿Quién eres?
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {ROLES.map(r => (
                  <button
                    key={r.id}
                    onClick={() => handleRoleSelect(r.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '1rem',
                      background: 'rgba(255,255,255,0.03)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '1rem 1.25rem',
                      color: 'var(--text-1)', fontFamily: 'inherit',
                      cursor: 'pointer', transition: 'all 0.2s var(--ease)',
                      textAlign: 'left',
                    }}
                    onMouseOver={e => { e.currentTarget.style.background = `${r.color}14`; e.currentTarget.style.borderColor = `${r.color}55`; }}
                    onMouseOut={e =>  { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                  >
                    <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>{r.icon}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 700, fontSize: '1rem' }}>{r.label}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>{r.desc}</span>
                    </span>
                    <ChevronRight size={16} style={{ color: 'var(--text-3)' }} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── PASO 2A: Formulario Auxiliar (por cédula) ── */}
          {selectedRole === 'auxiliar' && (
            <form onSubmit={handleAuxiliarSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Badge de rol */}
              <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '2rem' }}>👷</span>
                <p style={{ fontWeight: 700, color: 'var(--neon-blue)', fontSize: '0.85rem', marginTop: '0.25rem' }}>Acceso de Auxiliar</p>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <IdCard size={14} /> Número de Cédula
                </label>
                <input
                  id="cedula-input"
                  type="text"
                  inputMode="numeric"
                  className="form-control"
                  placeholder="Ej. 1088253407"
                  value={cedula}
                  onChange={e => { setCedula(e.target.value); setError(''); }}
                  autoFocus
                  style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '0.05em' }}
                />
                {/* Mini vista previa del nombre si la cédula ya coincide */}
                {cedula.trim() && (() => {
                  const found = AUXILIARES.find(a => a.cedula === cedula.trim());
                  return found ? (
                    <div style={{ marginTop: '0.5rem', padding: '0.6rem 0.875rem', background: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 'var(--radius-sm)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1rem' }}>✅</span>
                      <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--neon-green)' }}>{found.nombre}</span>
                    </div>
                  ) : null;
                })()}
              </div>

              {error && (
                <div style={{ background: 'rgba(255,77,109,0.1)', border: '1px solid rgba(255,77,109,0.25)', color: 'var(--neon-red)', padding: '0.75rem 1rem', borderRadius: 'var(--radius-sm)', fontSize: '0.85rem', textAlign: 'center' }}>
                  {error}
                </div>
              )}

              <button type="submit" className="btn btn-primary w-full" style={{ padding: '0.875rem' }} disabled={loading}>
                {loading ? <div className="spinner" /> : 'Ingresar al Sistema'}
              </button>

              <button type="button" onClick={() => { setSelectedRole(null); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center', padding: '0.25rem' }}>
                ← Volver
              </button>
            </form>
          )}

          {/* ── PASO 2B: Formulario Cajera / Admin (email + contraseña) ── */}
          {(selectedRole === 'cajera' || selectedRole === 'admin') && (
            <form onSubmit={handleStaffSubmit} style={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Badge de rol */}
              <div style={{ textAlign: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '2rem' }}>{roleInfo?.icon}</span>
                <p style={{ fontWeight: 700, color: roleInfo?.color, fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  Acceso de {roleInfo?.label}
                </p>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Mail size={14} /> Correo Electrónico
                </label>
                <input
                  id="staff-email"
                  type="email"
                  className="form-control"
                  placeholder="ejemplo@empresa.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Lock size={14} /> Contraseña
                </label>
                <input
                  id="staff-password"
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

              <button type="submit" className="btn btn-primary w-full" style={{ padding: '0.875rem' }} disabled={loading}>
                {loading ? <div className="spinner" /> : 'Ingresar al Sistema'}
              </button>

              <button type="button" onClick={() => { setSelectedRole(null); setError(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'center', padding: '0.25rem' }}>
                ← Volver
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  );
};

export default Login;
