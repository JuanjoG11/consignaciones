import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, X, Clock, SlidersHorizontal } from 'lucide-react';
import { mockDB } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

const BANCO_COLORS = {
  'Bancolombia 6061':      { color: '#ffd166', bg: 'rgba(255,209,102,0.15)', emoji: '🟡' },
  'Davivienda 8703':       { color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)',  emoji: '🔴' },
  'Alpina Agrario':        { color: '#4f8eff', bg: 'rgba(79,142,255,0.15)',  emoji: '🌾' },
  'Alpina Davivienda':     { color: '#60b8ff', bg: 'rgba(96,184,255,0.15)',  emoji: '🏦' },
  'Alpina Bancolombia':    { color: '#ffd166', bg: 'rgba(255,209,102,0.12)', emoji: '🏧' },
  'Buzón':                 { color: '#00e5a0', bg: 'rgba(0,229,160,0.15)',   emoji: '📬' },
  'Servicios Nutresa Cárnicos': { color: '#9b5cff', bg: 'rgba(155,92,255,0.15)', emoji: '🥩' },
  'Gasto':                 { color: '#ff9f1c', bg: 'rgba(255,159,28,0.15)',  emoji: '💸' },
  'Retención':             { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', emoji: '📄' },
};

const ESTADOS = ['Pendiente', 'Validado', 'Rechazado'];
const BANCOS = ['Bancolombia 6061', 'Davivienda 8703', 'Alpina Agrario', 'Alpina Davivienda', 'Alpina Bancolombia', 'Buzón', 'Servicios Nutresa Cárnicos', 'Gasto', 'Retención'];

const CajeraPanel = ({ user }) => {
  const [consignaciones, setConsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bancoFilter, setBancoFilter]   = useState('');
  const [estadoFilter, setEstadoFilter] = useState('Pendiente');
  const [search, setSearch]             = useState('');
  const [dateRange, setDateRange]       = useState({ start: '', end: '' });
  const [selected, setSelected]         = useState(null);
  const [showFilters, setShowFilters]   = useState(false);

  const fetch = async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await mockDB.getConsignaciones();
    setConsignaciones(data);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetch();
    const iv = setInterval(() => fetch(true), 5000);
    return () => clearInterval(iv);
  }, []);

  const handleAction = async (id, estado) => {
    let motivo = null;
    if (estado === 'Rechazado') {
      motivo = prompt('Motivo del rechazo:');
      if (!motivo) return;
    }
    const tid = toast.loading('Actualizando...');
    try {
      await mockDB.updateConsignacionStatus(id, estado, motivo);
      toast.success(estado === 'Validado' ? '✅ Aprobada' : '❌ Rechazada', { id: tid });
      fetch(true);
      setSelected(null);
    } catch { toast.error('Error', { id: tid }); }
  };

  const filtered = consignaciones.filter(c => {
    const okBanco   = bancoFilter  ? c.banco === bancoFilter : true;
    const okEstado  = estadoFilter ? c.estado === estadoFilter : true;
    const okSearch  = search ? (
      c.auxiliar_name.toLowerCase().includes(search.toLowerCase()) || 
      c.numero_comprobante.includes(search)
    ) : true;
    
    // Filtro por fecha
    const cDate = new Date(c.fecha);
    const okStart = dateRange.start ? cDate >= new Date(dateRange.start) : true;
    const okEnd   = dateRange.end   ? cDate <= new Date(dateRange.end + 'T23:59:59') : true;
    
    return okBanco && okEstado && okSearch && okStart && okEnd;
  });

  const pendientes = consignaciones.filter(c => c.estado === 'Pendiente').length;

  const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

  const badgeClass = (e) => e === 'Pendiente' ? 'badge-pending' : e === 'Validado' ? 'badge-valid' : 'badge-rejected';

  return (
    <div className="page animate-in">
      {/* Hero */}
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #00e5a0 0%, #00b4d8 100%)', boxShadow: 'var(--shadow-glow-green)' }}>
        <div className="hero-label">👩‍💼 Panel Cajera</div>
        <div className="hero-value">{pendientes}</div>
        <div className="hero-sub">{pendientes === 1 ? 'consignación pendiente' : 'consignaciones pendientes'} de validación</div>
      </div>



      {/* Search + Filter toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0 0.5rem' }}>
        <div className="search-wrap" style={{ flex: 1, margin: 0 }}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Buscar auxiliar o comprobante..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          className={`btn btn-ghost btn-icon`}
          onClick={() => setShowFilters(v => !v)}
          style={{ flexShrink: 0, ...(showFilters ? { background: 'rgba(79,142,255,0.15)', borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)' } : {}) }}
        >
          <SlidersHorizontal size={17} />
        </button>
      </div>

      {/* Chips estado */}
      <div className="chip-row">
        <button className={`chip ${estadoFilter === '' ? 'active' : ''}`} onClick={() => setEstadoFilter('')}>Todos</button>
        {ESTADOS.map(e => (
          <button key={e} className={`chip ${estadoFilter === e ? 'active' : ''}`} onClick={() => setEstadoFilter(e)}>{e}</button>
        ))}
      </div>

      {/* Banco filters (collapsible) */}
      {showFilters && (
        <div className="card animate-in" style={{ padding: '1rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            {/* Fechas */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.7rem' }}>Desde</label>
              <input 
                type="date" 
                className="form-control" 
                value={dateRange.start} 
                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.7rem' }}>Hasta</label>
              <input 
                type="date" 
                className="form-control" 
                value={dateRange.end} 
                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
              />
            </div>
            {/* Bancos */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.7rem' }}>Banco</label>
              <select 
                className="form-control" 
                value={bancoFilter} 
                onChange={e => setBancoFilter(e.target.value)}
              >
                <option value="">Todos los bancos</option>
                {BANCOS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {/* Reset */}
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button 
                className="btn btn-ghost w-full" 
                style={{ fontSize: '0.75rem' }}
                onClick={() => {
                  setBancoFilter('');
                  setDateRange({ start: '', end: '' });
                  setSearch('');
                }}
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Split Layout container */}
      <div className="cajera-split-layout">
        {/* Left Column: List */}
        <div className="cajera-list-pane">
          <div className="card" style={{ height: '100%', overflowY: 'auto' }}>
            {loading && consignaciones.length === 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <div className="spinner" />
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
                <Clock size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
                <p>Sin resultados</p>
              </div>
            ) : (
              filtered.map(c => {
                const bc = BANCO_COLORS[c.banco] || BANCO_COLORS['No Aplica'];
                const isActive = selected?.id === c.id;
                return (
                  <div 
                    key={c.id} 
                    className={`consign-item ${isActive ? 'active-item' : ''}`} 
                    onClick={() => setSelected(c)}
                    style={isActive ? { background: 'rgba(79,142,255,0.08)', borderLeft: '3px solid var(--neon-blue)' } : {}}
                  >
                    <div className="consign-icon" style={{ background: bc.bg }}>
                      <span style={{ fontSize: '1.2rem' }}>{bc.emoji}</span>
                    </div>
                    <div className="consign-info">
                      <div className="consign-name">{c.auxiliar_name}</div>
                      <div className="consign-meta">{c.banco} · #{c.numero_comprobante}</div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                      <span className="consign-amount">{money(c.valor)}</span>
                      <span className={`badge ${badgeClass(c.estado)}`}>{c.estado}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Detail (Only visible on PC when something is selected) */}
        <div className={`cajera-detail-pane ${selected ? 'visible' : ''}`}>
          {selected ? (
            <div className="card" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
                <div>
                  <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{selected.auxiliar_name}</h1>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <span className={`badge ${badgeClass(selected.estado)}`} style={{ fontSize: '0.9rem', padding: '0.4rem 1rem' }}>{selected.estado}</span>
                    <span style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{format(new Date(selected.fecha), "d 'de' MMMM yyyy, h:mm a", { locale: es })}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Valor total</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neon-blue)' }}>{money(selected.valor)}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Details list */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem', textTransform: 'uppercase' }}>Información del Banco</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3)' }}>Entidad</span>
                        <span style={{ fontWeight: 700 }}>{selected.banco}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3)' }}>Nº Comprobante</span>
                        <span style={{ fontWeight: 700 }}>{selected.numero_comprobante}</span>
                      </div>
                    </div>
                  </div>

                  {selected.motivo_rechazo && (
                    <div style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid var(--neon-red)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                      <p style={{ color: 'var(--neon-red)', fontWeight: 700, marginBottom: '0.25rem' }}>Motivo de Rechazo:</p>
                      <p style={{ color: 'var(--text-1)' }}>{selected.motivo_rechazo}</p>
                    </div>
                  )}

                  {selected.estado === 'Pendiente' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: 'auto' }}>
                      <button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')} style={{ padding: '1rem' }}>
                        <XCircle size={18} /> Rechazar Consignación
                      </button>
                      <button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')} style={{ padding: '1rem' }}>
                        <CheckCircle size={18} /> Validar y Aprobar
                      </button>
                    </div>
                  )}
                </div>

                {/* Evidence */}
                <div>
                  <h3 style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Evidencia del Comprobante</h3>
                  {selected.file_url ? (
                    selected.file_url.includes('pdf') ? (
                      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)' }}>
                        <Clock size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p>Documento PDF Adjunto</p>
                        <a href={selected.file_url} target="_blank" className="btn btn-ghost" style={{ marginTop: '1rem' }}>Ver PDF completo</a>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', background: '#000' }}>
                        <img src={selected.file_url} alt="Evidencia" style={{ width: '100%', maxHeight: '500px', objectFit: 'contain' }} />
                        <a href={selected.file_url} target="_blank" className="btn btn-ghost" style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
                          <Eye size={16} /> Ver original
                        </a>
                      </div>
                    )
                  ) : (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>Sin imagen adjunta</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', textAlign: 'center' }}>
              <Clock size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} />
              <p style={{ fontSize: '1.1rem' }}>Selecciona una consignación para ver los detalles y validarla</p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Modal (Only on small screens) */}
      <div className="mobile-only-detail">
        {selected && (
          <div className="modal-overlay" onClick={() => setSelected(null)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="sheet-handle" />
              {/* ... resto del detalle móvil ... */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem' }}>Detalle de Consignación</h2>
                <button className="btn btn-ghost btn-icon" onClick={() => setSelected(null)}><X size={20} /></button>
              </div>
              <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginBottom: '1rem' }}>Enviado por {selected.auxiliar_name}</p>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div className="card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-3)' }}>Banco</span>
                      <span style={{ fontWeight: 700 }}>{selected.banco}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-3)' }}>Valor</span>
                      <span style={{ fontWeight: 700, color: 'var(--neon-blue)' }}>{money(selected.valor)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-3)' }}>Comprobante</span>
                      <span style={{ fontWeight: 700 }}>#{selected.numero_comprobante}</span>
                    </div>
                  </div>

                  {selected.file_url && !selected.file_url.includes('pdf') && (
                    <img src={selected.file_url} style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }} />
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                    <button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')}>Rechazar</button>
                    <button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')}>Validar</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CajeraPanel;
