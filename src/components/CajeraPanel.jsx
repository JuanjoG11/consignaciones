import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, X, Clock, SlidersHorizontal } from 'lucide-react';
import { supabase, mockDB } from '../lib/supabase';
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
  'Cenas':                 { color: '#ff6b6b', bg: 'rgba(255,107,107,0.15)', emoji: '🍽️' },
  'Gasto':                 { color: '#ff9f1c', bg: 'rgba(255,159,28,0.15)',  emoji: '💸' },
  'Retención':             { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', emoji: '📄' },
  // TAT banks
  'Bancolombia TAT 4247':  { color: '#ffd166', bg: 'rgba(255,209,102,0.15)', emoji: '🟡' },
  'DAVIVIENDA TAT 8283':   { color: '#ff4d6d', bg: 'rgba(255,77,109,0.15)',  emoji: '🔴' },
  'Buzon Atlas':           { color: '#00e5a0', bg: 'rgba(0,229,160,0.15)',   emoji: '📬' },
};

const ESTADOS = ['Pendiente', 'Validado', 'Cuadrado', 'Rechazado'];
const BANCOS_FULL = ['Bancolombia 6061', 'Davivienda 8703', 'Bancolombia TAT 4247', 'DAVIVIENDA TAT 8283', 'Alpina Agrario', 'Alpina Davivienda', 'Alpina Bancolombia', 'Buzón', 'Buzon Atlas', 'Servicios Nutresa Cárnicos', 'Cenas', 'Gasto', 'Retención'];

const CajeraPanel = ({ user }) => {
  const [consignaciones, setConsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bancoFilter, setBancoFilter]   = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
  const [search, setSearch]             = useState('');
  const [dateRange, setDateRange]       = useState({ start: '', end: '' });
  const [empresaFilter, setEmpresaFilter] = useState('');
  const [selected, setSelected]         = useState(null);
  const [showFilters, setShowFilters]   = useState(false);
  const [prevPendientes, setPrevPendientes] = useState(0);

  // DEBUG: inspeccionar estado crudo cuando se selecciona una consignación
  useEffect(() => {
    if (selected) {
      try {
        console.log('DEBUG selected.estado raw:', selected.estado, 'typeof:', typeof selected.estado, 'repr:', JSON.stringify(selected.estado));
      } catch (e) {
        console.log('DEBUG selected.estado (stringify failed)', selected.estado);
      }
    }
  }, [selected]);

  const [rejectModal, setRejectModal] = useState({ open: false, id: null, motivo: '' });

  const fetch = async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await mockDB.getConsignaciones();
    console.log(`Fetched ${data.length} consignaciones. Earliest: ${data.length ? new Date(data[data.length - 1].fecha).toISOString() : 'N/A'}, Latest: ${data.length ? new Date(data[0].fecha).toISOString() : 'N/A'}`);
    setConsignaciones(data);
    if (!silent) setLoading(false);
  };

  // Bancos visibles según la empresa del usuario
  const visibleBancos = (() => {
    if (!user || !user.empresa) return BANCOS_FULL.filter(b => !String(b).toLowerCase().includes('tat'));
    const company = String(user.empresa).toUpperCase();
    if (company === 'TAT') {
      // Mostrar solo bancos TAT para usuarios TAT
      return BANCOS_FULL.filter(b => String(b).toLowerCase().includes('tat'));
    }
    let list = BANCOS_FULL.slice();
    // Ocultar bancos TAT a quienes no son TAT
    list = list.filter(b => !String(b).toLowerCase().includes('tat'));
    // Ocultar 'Servicios Nutresa Cárnicos' y 'Cenas' a ALPINA
    if (company === 'ALPINA') {
      list = list.filter(b => !String(b).toLowerCase().includes('nutresa'));
      list = list.filter(b => !String(b).toLowerCase().includes('cenas'));
    }
    // Ocultar cuentas Alpina a ZENU
    if (company === 'ZENU') list = list.filter(b => !String(b).toLowerCase().includes('alpina'));
    return list;
  })();



  useEffect(() => {
    fetch();
    // 1. Polling de respaldo (cada 15s es suficiente con Realtime)
    const iv = setInterval(() => fetch(true), 15000);

    // 2. SUSCRIPCIÓN REALTIME (Instante)
    const channel = supabase
      .channel('consignaciones_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'consignaciones' },
        (payload) => {
          console.log('Cambio detectado en Realtime:', payload);
          fetch(true); // Refrescar lista ante cualquier cambio
          
          // Si el cambio es una inserción y es de mi empresa, avisar
          if (payload.eventType === 'INSERT') {
            const newItem = payload.new;
            if (user.empresa && newItem.empresa === user.empresa) {
              toast('🔔 Nueva consignación entrante', { icon: '🆕' });
            }
          }
        }
      )
      .subscribe();

    return () => {
      clearInterval(iv);
      supabase.removeChannel(channel);
    };
  }, [user.empresa]);

  const handleAction = async (id, estado, motivoParam = null) => {
    let motivo = null;
    if (estado === 'Rechazado') {
      if (motivoParam) {
        motivo = motivoParam;
      } else {
        try {
          motivo = prompt('Motivo del rechazo:');
        } catch (err) {
          // prompt not supported in this environment -> open internal modal
          setRejectModal({ open: true, id, motivo: '' });
          return;
        }
        if (!motivo) return;
      }
    }
    const tid = toast.loading('Verificando estado...');
    try {
      // 1. Verificar si alguien ya tomó acción mientras el modal estaba abierto
      const latest = await mockDB.getConsignacionById(id);
      
      // Permitir cualquier transición siempre y cuando el estado sea diferente
      const isTransitionValid = latest.estado !== estado;

      if (!isTransitionValid) {
        toast.error(`Esta consignación ya tiene el estado ${latest.estado.toLowerCase()} por ${latest.cajera_name || 'otra persona'}.`, { id: tid });
        fetch(true);
        setSelected(null);
        return;
      }

      toast.loading('Actualizando...', { id: tid });
      await mockDB.updateConsignacionStatus(id, estado, motivo, user.id, user.full_name);
      toast.success(estado === 'Validado' ? '✅ Aprobada' : estado === 'Cuadrado' ? '✅ Cuadrada' : '❌ Rechazada', { id: tid });
      fetch(true);
      setSelected(null);
    } catch (e) { 
      toast.error('Error al actualizar', { id: tid }); 
      console.error(e);
    }
  };

  const confirmReject = async () => {
    if (!rejectModal.id) return;
    const motivo = String(rejectModal.motivo || '').trim();
    if (!motivo) {
      toast.error('Ingrese el motivo del rechazo');
      return;
    }
    setRejectModal(prev => ({ ...prev, open: false }));
    await handleAction(rejectModal.id, 'Rechazado', motivo);
    setRejectModal({ open: false, id: null, motivo: '' });
  };
  const filtered = consignaciones
  .filter(c => user.empresa ? c.empresa === user.empresa : true)
  .filter(c => {
    const okBanco = bancoFilter ? c.banco === bancoFilter : true;
    const est = String(c.estado || '').trim().toLowerCase();
    let okEstado;
    if (estadoFilter) {
      // Apply selected state filter regardless of search input
      okEstado = est === String(estadoFilter).trim().toLowerCase();
    } else if (user && user.role === 'cajera') {
      // Cajera view without a specific filter includes all four states
      okEstado = ['pendiente', 'validado', 'cuadrado', 'rechazado'].includes(est);
    } else {
      okEstado = true;
    }
    const okSearch = search ? (c.auxiliar_name.toLowerCase().includes(search.toLowerCase()) || c.numero_comprobante.includes(search)) : true;
    const cDateStr = c.fecha.split('T')[0];
    const okStart = dateRange.start ? cDateStr >= dateRange.start : true;
    const okEnd = dateRange.end ? cDateStr <= dateRange.end : true;
    const okEmpresa = empresaFilter ? c.empresa === empresaFilter : true;
    return okBanco && okEstado && okSearch && okStart && okEnd && okEmpresa;
  });
console.log('Date range filter:', dateRange);
console.log('Filtered consignaciones count:', filtered.length);

  function okEndFunc(cDate, end) {
    if (!end) return true;
    const eDate = new Date(end);
    eDate.setHours(23, 59, 59, 999);
    return cDate <= eDate;
  }

  const companyConsignaciones = consignaciones.filter(c => user.empresa ? c.empresa === user.empresa : true);
  const pendientes = companyConsignaciones.filter(c => String(c.estado || '').trim().toLowerCase() === 'pendiente').length;
  const validadasPorCuadrar = companyConsignaciones.filter(c => String(c.estado || '').trim().toLowerCase() === 'validado').length;
  const cuadradas = companyConsignaciones.filter(c => String(c.estado || '').trim().toLowerCase() === 'cuadrado').length;

  const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

  const badgeClass = (e) => {
    const v = String(e || '').trim().toLowerCase();
    return v === 'pendiente' ? 'badge-pending' : v === 'validado' ? 'badge-validated' : v === 'cuadrado' ? 'badge-squared' : 'badge-rejected';
  };

  const renderActionButtons = (isMobile = false) => {
    const pad = isMobile ? '0.75rem' : '1rem';
    
    const selState = String(selected.estado || '').trim().toLowerCase();
    if (selState === 'pendiente') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem' }}>
          <button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')} style={{ padding: pad }}>
            <XCircle size={18} /> Rechazar
          </button>
          <button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')} style={{ padding: pad }}>
            <CheckCircle size={18} /> Validar y Aprobar
          </button>
        </div>
      );
    }
    
    if (selState === 'validado') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem' }}>
          <button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')} style={{ padding: pad }}>
            <XCircle size={18} /> Rechazar
          </button>
          <button className="btn btn-primary" onClick={() => handleAction(selected.id, 'Cuadrado')} style={{ padding: pad, background: 'var(--gradient-success)', color: '#00120d', boxShadow: 'var(--shadow-glow-green)' }}>
            <CheckCircle size={18} /> Cuadrar Consignación
          </button>
        </div>
      );
    }
    
    if (selState === 'rechazado') {
      return (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isMobile ? '0.75rem' : '1rem' }}>
          <button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')} style={{ padding: pad }}>
            <CheckCircle size={18} /> Corregir y Validar
          </button>
        </div>
      );
    }
    
    if (selState === 'cuadrado') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: pad, background: 'rgba(0, 229, 160, 0.08)', border: '1px solid var(--neon-green)', borderRadius: 'var(--radius-sm)', color: 'var(--neon-green)', fontWeight: 700, fontSize: '0.85rem', gap: '0.5rem' }}>
          <CheckCircle size={16} /> Consignación cuadrada y conciliada
        </div>
      );
    }
    
    return null;
  };

  return (
    <div className="page animate-in">
      {/* Hero */}
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #00e5a0 0%, #00b4d8 100%)', boxShadow: 'var(--shadow-glow-green)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hero-label">👩‍💼 Panel Cajera</div>
          {pendientes > 0 && (
            <div className="pulse-badge" style={{ background: 'rgba(255,255,255,0.2)', padding: '4px 12px', borderRadius: '99px', fontSize: '0.7rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', boxShadow: '0 0 10px #fff', animation: 'pulse 1.5s infinite' }} />
              EN LÍNEA
            </div>
          )}
        </div>
        <div className="hero-value">{pendientes}</div>
        <div className="hero-sub">
          {pendientes === 1 ? 'consignación pendiente' : 'consignaciones pendientes'} de validación
          {validadasPorCuadrar > 0 && ` · ${validadasPorCuadrar} por cuadrar`}
        </div>
      </div>
      {/* New card for Cuadrado count */}
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #ff9f1c 0%, #ff4d6d 100%)', boxShadow: 'var(--shadow-glow-red)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="hero-label">🟢 Cuadrado</div>
        </div>
        <div className="hero-value">{cuadradas}</div>
        <div className="hero-sub">
          {cuadradas === 1 ? 'consignación cuadrada' : 'consignaciones cuadradas'}
        </div>
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
                {visibleBancos.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            {/* Empresa */}
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.7rem' }}>Empresa</label>
              <select 
                className="form-control" 
                value={empresaFilter} 
                onChange={e => setEmpresaFilter(e.target.value)}
              >
                <option value="">Todas</option>
                <option value="ALPINA">ALPINA</option>
                <option value="ZENU">ZENU</option>
                <option value="GENERAL">GENERAL</option>
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
                  setEmpresaFilter('');
                }}
              >
                Limpiar Filtros
              </button>
            </div>
          </div>
        </div>
      )}

        {/* Internal Reject Modal (fallback when prompt() unsupported) */}
        {rejectModal.open && (
          <div className="modal-overlay" onClick={() => setRejectModal({ open: false, id: null, motivo: '' })}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontSize: '1.1rem' }}>Motivo del rechazo</h2>
                <button className="btn btn-ghost btn-icon" onClick={() => setRejectModal({ open: false, id: null, motivo: '' })}><X size={20} /></button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <textarea value={rejectModal.motivo} onChange={e => setRejectModal(prev => ({ ...prev, motivo: e.target.value }))} placeholder="Describe el motivo del rechazo" style={{ width: '100%', minHeight: 120, padding: '0.75rem' }} />
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => setRejectModal({ open: false, id: null, motivo: '' })}>Cancelar</button>
                  <button className="btn btn-danger" onClick={confirmReject}>Confirmar Rechazo</button>
                </div>
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
                      <div style={{ display: 'flex', gap: '0.3rem' }}>
                        <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: c.empresa === 'ALPINA' ? 'rgba(79,142,255,0.15)' : 'rgba(255,159,28,0.15)', color: c.empresa === 'ALPINA' ? 'var(--neon-blue)' : 'var(--neon-orange)', fontWeight: 800 }}>{c.empresa || 'GEN'}</span>
                        <span className={`badge ${badgeClass(c.estado)}`}>{c.estado}</span>
                      </div>
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
              <div style={{ marginBottom: '1.25rem' }}>
                <h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{selected.auxiliar_name}</h1>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <span className={`badge ${badgeClass(selected.estado)}`} style={{ fontSize: '0.9rem', padding: '0.4rem 1rem' }}>{selected.estado}</span>
                  <span style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{format(new Date(selected.fecha), "d 'de' MMMM yyyy, h:mm a", { locale: es })}</span>
                </div>
                <div>
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Valor total</p>
                  <p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neon-blue)', margin: 0 }}>{money(selected.valor)}</p>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'var(--text-3)' }}>Fecha</span>
                        <span style={{ fontWeight: 700 }}>{format(new Date(selected.fecha), "d/MM/yyyy, h:mm a")}</span>
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
                      <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', background: '#000', display: 'flex', justifyContent: 'center' }}>
                        <img src={selected.file_url} alt="Evidencia" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} />
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: 'var(--text-3)' }}>Comprobante</span>
                      <span style={{ fontWeight: 700 }}>#{selected.numero_comprobante}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: 'var(--text-3)' }}>Fecha</span>
                      <span style={{ fontWeight: 700 }}>{format(new Date(selected.fecha), "d/MM/yyyy, h:mm a")}</span>
                    </div>
                  </div>

                  {selected.file_url && !selected.file_url.includes('pdf') && (
                    <img src={selected.file_url} style={{ width: '100%', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }} />
                  )}

                  {(() => {
                    const selState = String(selected.estado || '').trim().toLowerCase();
                    if (selState === 'pendiente') {
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                          <button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')}>Rechazar</button>
                          <button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')}>Validar</button>
                        </div>
                      );
                    }

                    if (selState === 'validado') {
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '1rem' }}>
                          <button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')}>Rechazar</button>
                          <button className="btn btn-primary" onClick={() => handleAction(selected.id, 'Cuadrado')}>Cuadrar Consignación</button>
                        </div>
                      );
                    }

                    if (selState === 'rechazado') {
                      return (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginTop: '1rem' }}>
                          <button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')}>Corregir y Aprobar</button>
                        </div>
                      );
                    }

                    if (selState === 'cuadrado') {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0.75rem', background: 'rgba(0, 229, 160, 0.08)', border: '1px solid var(--neon-green)', borderRadius: 'var(--radius-sm)', color: 'var(--neon-green)', fontWeight: 700 }}>
                          <CheckCircle size={16} /> Consignación cuadrada y conciliada
                        </div>
                      );
                    }

                    return null;
                  })()}
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
