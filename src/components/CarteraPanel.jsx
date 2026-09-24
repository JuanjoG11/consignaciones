import React, { useState, useEffect } from 'react';
import { Search, XCircle, Eye, X, Clock, SlidersHorizontal, CheckCircle } from 'lucide-react';
import { supabase, mockDB } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import toast from 'react-hot-toast';

const BANCO_COLORS = {
  'Bancolombia TAT 4247':  { color: '#ffd166', bg: 'rgba(255,209,102,0.15)', emoji: '🟡' },
  'DAVIVIENDA TAT 8283':   { color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)',  emoji: '🔴' },
  'Buzon Atlas':           { color: '#00e5a0', bg: 'rgba(0,229,160,0.15)',   emoji: '📬' },
  'Bancolombia 6061':      { color: '#ffd166', bg: 'rgba(255,209,102,0.15)', emoji: '🟡' },
  'Davivienda 8703':       { color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)',  emoji: '🔴' },
  'Gasto':                 { color: '#ff9f1c', bg: 'rgba(255,159,28,0.15)',  emoji: '💸' },
  'Retención':             { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', emoji: '📄' },
};

const ESTADOS = ['Pendiente', 'Validado', 'Cuadrado', 'Rechazado'];

// IDs de los auxiliares que Diana (cartera) puede ver.
// Son los auxiliar_id que tienen empresa TAT más el propio id de Diana como auxiliar.
// El filtro se aplica por auxiliar_id de las consignaciones.
// Cédulas de las 4 vendedoras que Diana (cartera) puede ver
const CEDULAS_VENDEDORAS = ['30415268', '42149772', '1047467581', '25181643'];

const CarteraPanel = ({ user }) => {
  const [consignaciones, setConsignaciones] = useState([]);
  const [loading, setLoading]               = useState(true);
  const [search, setSearch]                 = useState('');
  const [estadoFilter, setEstadoFilter]     = useState('');
  const [bancoFilter, setBancoFilter]       = useState('');
  const [dateRange, setDateRange] = useState(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const daysInMonth = new Date(year, now.getMonth() + 1, 0).getDate();
    return { start: `${year}-${month}-01`, end: `${year}-${month}-${daysInMonth}` };
  });
  const [showFilters, setShowFilters] = useState(false);
  const [selected, setSelected]       = useState(null);

  // Modal rechazar
  const [rejectModal, setRejectModal] = useState({ open: false, id: null, motivo: '' });

  // Modal cuadrar (con número de cuadre)
  const [cuadrarModal, setCuadrarModal] = useState({ open: false, id: null, numeroCuadre: '' });

  // IDs permitidos: solo las 4 vendedoras (empresa TAT) + Diana misma como auxiliar TAT
  const vendedorasIds = CEDULAS_VENDEDORAS.map(c => `aux_${c}_TAT`);
  const dianaAuxId    = `aux_42131453_TAT`;
  const allowedIds    = [...new Set([...vendedorasIds, dianaAuxId])];

  const fetchData = async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await mockDB.getConsignaciones();
    // Solo consignaciones de las vendedoras + Diana como auxiliar
    const filtered = data.filter(c => allowedIds.includes(c.auxiliar_id));
    setConsignaciones(filtered);
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    fetchData();
    const iv = setInterval(() => fetchData(true), 15000);

    const channel = supabase
      .channel('cartera_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consignaciones' }, () => {
        fetchData(true);
      })
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, []);

  // ── Acciones ────────────────────────────────────────────────────────────────

  const handleRechazar = (id) => {
    setRejectModal({ open: true, id, motivo: '' });
  };

  const confirmReject = async () => {
    const motivo = String(rejectModal.motivo || '').trim();
    if (!motivo) { toast.error('Ingresa el motivo del rechazo'); return; }
    setRejectModal(prev => ({ ...prev, open: false }));
    const tid = toast.loading('Rechazando...');
    try {
      const latest = await mockDB.getConsignacionById(rejectModal.id);
      if (latest.estado === 'Rechazado') {
        toast.error('Ya estaba rechazada', { id: tid });
        fetchData(true);
        setSelected(null);
        return;
      }
      await mockDB.updateConsignacion(rejectModal.id, {
        estado: 'Rechazado',
        motivo_rechazo: motivo,
        cajera_name: user.full_name,
      });
      toast.success('❌ Rechazada', { id: tid });
      fetchData(true);
      setSelected(null);
    } catch (e) {
      toast.error('Error al rechazar', { id: tid });
      console.error(e);
    }
    setRejectModal({ open: false, id: null, motivo: '' });
  };

  const handleCuadrar = (id) => {
    setCuadrarModal({ open: true, id, numeroCuadre: '' });
  };

  const confirmCuadrar = async () => {
    const numeroCuadre = String(cuadrarModal.numeroCuadre || '').trim();
    if (!numeroCuadre) { toast.error('Ingresa el número de cuadre'); return; }
    setCuadrarModal(prev => ({ ...prev, open: false }));
    const tid = toast.loading('Cuadrando...');
    try {
      const latest = await mockDB.getConsignacionById(cuadrarModal.id);
      if (latest.estado === 'Cuadrado') {
        toast.error('Ya estaba cuadrada', { id: tid });
        fetchData(true);
        setSelected(null);
        return;
      }
      await mockDB.updateConsignacion(cuadrarModal.id, {
        estado: 'Cuadrado',
        numero_cuadre: numeroCuadre,
        fecha_cuadrado: new Date().toISOString(),
        cajera_name: user.full_name,
      });
      toast.success('✅ Cuadrada', { id: tid });
      fetchData(true);
      setSelected(null);
    } catch (e) {
      toast.error('Error al cuadrar', { id: tid });
      console.error(e);
    }
    setCuadrarModal({ open: false, id: null, numeroCuadre: '' });
  };

  // ── Filtrado ─────────────────────────────────────────────────────────────────

  const filtered = consignaciones.filter(c => {
    const okBanco  = bancoFilter ? c.banco === bancoFilter : true;
    const est      = String(c.estado || '').trim().toLowerCase();
    const okEstado = estadoFilter ? est === estadoFilter.toLowerCase() : true;
    const sLow     = search.toLowerCase();
    const okSearch = search
      ? (c.auxiliar_name || '').toLowerCase().includes(sLow) ||
        String(c.numero_comprobante || '').includes(search) ||
        String(c.valor || '').includes(search.replace(/[.,\s]/g, '')) ||
        (c.nombre_cliente || '').toLowerCase().includes(sLow)
      : true;
    const dateStr  = (c.fecha || '').split('T')[0];
    const okStart  = dateRange.start ? dateStr >= dateRange.start : true;
    const okEnd    = dateRange.end   ? dateStr <= dateRange.end   : true;
    return okBanco && okEstado && okSearch && okStart && okEnd;
  });

  const pendientes = consignaciones.filter(c => String(c.estado || '').toLowerCase() === 'pendiente').length;
  const cuadradas  = consignaciones.filter(c => String(c.estado || '').toLowerCase() === 'cuadrado').length;

  const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

  const badgeClass = (e) => {
    const v = String(e || '').trim().toLowerCase();
    return v === 'pendiente' ? 'badge-pending' : v === 'validado' ? 'badge-validated' : v === 'cuadrado' ? 'badge-squared' : 'badge-rejected';
  };

  const renderActionButtons = (isMobile = false) => {
    if (!selected) return null;
    const pad      = isMobile ? '0.75rem' : '1rem';
    const selState = String(selected.estado || '').trim().toLowerCase();

    if (selState === 'pendiente' || selState === 'validado') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem' }}>
          <button className="btn btn-danger" onClick={() => handleRechazar(selected.id)} style={{ padding: pad }}>
            <XCircle size={18} /> Rechazar
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleCuadrar(selected.id)}
            style={{ padding: pad, background: 'var(--gradient-success)', color: '#00120d', boxShadow: 'var(--shadow-glow-green)' }}
          >
            <CheckCircle size={18} /> Cuadrar
          </button>
        </div>
      );
    }

    if (selState === 'rechazado') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem' }}>
          <button className="btn btn-danger" style={{ padding: pad, opacity: 0.4, cursor: 'default' }} disabled>
            <XCircle size={18} /> Rechazada
          </button>
          <button
            className="btn btn-primary"
            onClick={() => handleCuadrar(selected.id)}
            style={{ padding: pad, background: 'var(--gradient-success)', color: '#00120d', boxShadow: 'var(--shadow-glow-green)' }}
          >
            <CheckCircle size={18} /> Cuadrar
          </button>
        </div>
      );
    }

    if (selState === 'cuadrado') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: pad, background: 'rgba(0,229,160,0.08)', border: '1px solid var(--neon-green)', borderRadius: 'var(--radius-sm)', color: 'var(--neon-green)', fontWeight: 700, fontSize: '0.85rem', gap: '0.5rem' }}>
          <CheckCircle size={16} /> Cuadrada{selected.numero_cuadre ? ` · #${selected.numero_cuadre}` : ''}
        </div>
      );
    }

    return null;
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="page animate-in">

      {/* Hero */}
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #9b5cff 0%, #4f8eff 100%)', boxShadow: 'var(--shadow-glow-purple)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hero-label">💼 Panel Cartera · TAT</div>
          {pendientes > 0 && (
            <div className="pulse-badge" style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: '0 0 10px #fff', animation: 'pulse 1.5s infinite' }} />
              EN LÍNEA
            </div>
          )}
        </div>
        <div className="hero-value">{pendientes}</div>
        <div className="hero-sub">{pendientes === 1 ? 'consignación pendiente' : 'consignaciones pendientes'} · {cuadradas} cuadradas</div>
      </div>

      {/* Búsqueda + filtros toggle */}
      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0 0.5rem' }}>
        <div className="search-wrap" style={{ flex: 1, margin: 0 }}>
          <Search size={15} className="search-icon" />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Buscar vendedor, cliente, comprobante..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => setShowFilters(v => !v)}
          style={showFilters ? { background: 'rgba(155,92,255,0.15)', borderColor: 'var(--neon-purple)', color: 'var(--neon-purple)' } : {}}
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

      {/* Filtros colapsables */}
      {showFilters && (
        <div className="card animate-in" style={{ padding: '1rem', marginBottom: '1rem', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.7rem' }}>Desde</label>
              <input type="date" className="form-control" value={dateRange.start} onChange={e => setDateRange(p => ({ ...p, start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.7rem' }}>Hasta</label>
              <input type="date" className="form-control" value={dateRange.end} onChange={e => setDateRange(p => ({ ...p, end: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.7rem' }}>Banco</label>
              <select className="form-control" value={bancoFilter} onChange={e => setBancoFilter(e.target.value)}>
                <option value="">Todos los bancos</option>
                {Object.keys(BANCO_COLORS).map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button className="btn btn-ghost w-full" style={{ fontSize: '0.75rem' }} onClick={() => { setBancoFilter(''); setDateRange({ start: '', end: '' }); setSearch(''); }}>
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal rechazar */}
      {rejectModal.open && (
        <div className="modal-overlay" onClick={() => setRejectModal({ open: false, id: null, motivo: '' })}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Motivo del rechazo</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setRejectModal({ open: false, id: null, motivo: '' })}><X size={20} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <textarea
                value={rejectModal.motivo}
                onChange={e => setRejectModal(p => ({ ...p, motivo: e.target.value }))}
                placeholder="Describe el motivo del rechazo"
                style={{ width: '100%', minHeight: 110, padding: '0.75rem' }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setRejectModal({ open: false, id: null, motivo: '' })}>Cancelar</button>
                <button className="btn btn-danger" onClick={confirmReject}>Confirmar Rechazo</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cuadrar */}
      {cuadrarModal.open && (
        <div className="modal-overlay" onClick={() => setCuadrarModal({ open: false, id: null, numeroCuadre: '' })}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.1rem' }}>Número de Cuadre</h2>
              <button className="btn btn-ghost btn-icon" onClick={() => setCuadrarModal({ open: false, id: null, numeroCuadre: '' })}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-3)', marginBottom: '1rem' }}>
              Ingresa el número de cuadre para esta consignación.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <input
                type="text"
                className="form-control"
                placeholder="Ej. 20240924-001"
                value={cuadrarModal.numeroCuadre}
                onChange={e => setCuadrarModal(p => ({ ...p, numeroCuadre: e.target.value }))}
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter') confirmCuadrar(); }}
                style={{ fontSize: '1.1rem', fontWeight: 700 }}
              />
              <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setCuadrarModal({ open: false, id: null, numeroCuadre: '' })}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  onClick={confirmCuadrar}
                  style={{ background: 'var(--gradient-success)', color: '#00120d', boxShadow: 'var(--shadow-glow-green)' }}
                >
                  <CheckCircle size={16} /> Cuadrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Split layout */}
      <div className="cajera-split-layout">

        {/* Lista */}
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
                const bc       = BANCO_COLORS[c.banco] || { bg: 'rgba(148,163,184,0.15)', emoji: '🏦' };
                const isActive = selected?.id === c.id;
                return (
                  <div
                    key={c.id}
                    className={`consign-item ${isActive ? 'active-item' : ''}`}
                    onClick={() => setSelected(c)}
                    style={isActive ? { background: 'rgba(155,92,255,0.08)', borderLeft: '3px solid var(--neon-purple)' } : {}}
                  >
                    <div className="consign-icon" style={{ background: bc.bg }}>
                      <span style={{ fontSize: '1.2rem' }}>{bc.emoji}</span>
                    </div>
                    <div className="consign-info">
                      <div className="consign-name">{c.auxiliar_name}</div>
                      {c.nombre_cliente && (
                        <div style={{ fontSize: '0.7rem', color: 'var(--neon-purple)', fontWeight: 700 }}>👤 {c.nombre_cliente}</div>
                      )}
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

        {/* Detalle (desktop) */}
        <div className={`cajera-detail-pane ${selected ? 'visible' : ''}`}>
          {selected ? (
            <div className="card" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
              <div style={{ marginBottom: '1.25rem' }}>
                <h1 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>{selected.auxiliar_name}</h1>
                {selected.nombre_cliente && (
                  <p style={{ fontSize: '0.9rem', color: 'var(--neon-purple)', fontWeight: 700, marginBottom: '0.4rem' }}>
                    👤 Cliente: {selected.nombre_cliente}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span className={`badge ${badgeClass(selected.estado)}`} style={{ fontSize: '0.9rem', padding: '0.4rem 1rem' }}>{selected.estado}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>
                    {format(new Date(selected.fecha), "d 'de' MMMM yyyy, h:mm a", { locale: es })}
                  </span>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Valor total</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neon-purple)', margin: 0 }}>{money(selected.valor)}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
                {/* Info + acciones */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                    <h3 style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem', textTransform: 'uppercase' }}>Información</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3)' }}>Entidad</span>
                        <span style={{ fontWeight: 700 }}>{selected.banco}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3)' }}>Nº Comprobante</span>
                        <span style={{ fontWeight: 700 }}>{selected.numero_comprobante}</span>
                      </div>
                      {selected.numero_cuadre && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: 'var(--text-3)' }}>Nº Cuadre</span>
                          <span style={{ fontWeight: 700, color: 'var(--neon-green)' }}>{selected.numero_cuadre}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3)' }}>Fecha</span>
                        <span style={{ fontWeight: 700 }}>{format(new Date(selected.fecha), 'd/MM/yyyy, h:mm a')}</span>
                      </div>
                    </div>
                  </div>

                  {selected.motivo_rechazo && (
                    <div style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid var(--neon-red)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}>
                      <p style={{ color: 'var(--neon-red)', fontWeight: 700, marginBottom: '0.25rem' }}>Motivo de Rechazo:</p>
                      <p style={{ color: 'var(--text-1)' }}>{selected.motivo_rechazo}</p>
                    </div>
                  )}

                  {renderActionButtons(false)}
                </div>

                {/* Evidencia */}
                <div>
                  <h3 style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Evidencia del Comprobante</h3>
                  {selected.file_url ? (
                    selected.file_url.includes('pdf') ? (
                      <div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)' }}>
                        <Clock size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                        <p>Documento PDF Adjunto</p>
                        <a href={selected.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ marginTop: '1rem' }}>Ver PDF completo</a>
                      </div>
                    ) : (
                      <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', background: '#000', display: 'flex', justifyContent: 'center' }}>
                        <img src={selected.file_url} alt="Evidencia" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
                        <a href={selected.file_url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost" style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
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
              <p style={{ fontSize: '1.1rem' }}>Selecciona una consignación para ver los detalles</p>
            </div>
          )}
        </div>
      </div>

      {/* Modal detalle móvil */}
      <div className="mobile-only-detail">
        {selected && (
          <div className="modal-overlay" onClick={() => setSelected(null)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.2rem' }}>Detalle de Consignación</h2>
                <button className="btn btn-ghost btn-icon" onClick={() => setSelected(null)}><X size={20} /></button>
              </div>
              <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-3)', marginBottom: '0.25rem' }}>Enviado por {selected.auxiliar_name}</p>
                {selected.nombre_cliente && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--neon-purple)', fontWeight: 700, marginBottom: '0.75rem' }}>👤 {selected.nombre_cliente}</p>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                  <div className="card" style={{ padding: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-3)' }}>Banco</span>
                      <span style={{ fontWeight: 700 }}>{selected.banco}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-3)' }}>Valor</span>
                      <span style={{ fontWeight: 700, color: 'var(--neon-purple)' }}>{money(selected.valor)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-3)' }}>Comprobante</span>
                      <span style={{ fontWeight: 700 }}>#{selected.numero_comprobante}</span>
                    </div>
                    {selected.numero_cuadre && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-3)' }}>Nº Cuadre</span>
                        <span style={{ fontWeight: 700, color: 'var(--neon-green)' }}>{selected.numero_cuadre}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-3)' }}>Fecha</span>
                      <span style={{ fontWeight: 700 }}>{format(new Date(selected.fecha), 'd/MM/yyyy, h:mm a')}</span>
                    </div>
                  </div>

                  {selected.motivo_rechazo && (
                    <div style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid var(--neon-red)', borderRadius: 'var(--radius-md)', padding: '1rem' }}>
                      <p style={{ color: 'var(--neon-red)', fontWeight: 700, marginBottom: '0.25rem' }}>Motivo de Rechazo:</p>
                      <p style={{ color: 'var(--text-1)', fontSize: '0.9rem' }}>{selected.motivo_rechazo}</p>
                    </div>
                  )}

                  {selected.file_url && !selected.file_url.includes('pdf') && (
                    <img src={selected.file_url} style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }} alt="Comprobante" />
                  )}

                  <div style={{ marginTop: '0.5rem' }}>
                    {renderActionButtons(true)}
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

export default CarteraPanel;
