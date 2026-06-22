import React, { useState, useEffect } from 'react';
import { Search, CheckCircle, XCircle, Eye, X, Clock, SlidersHorizontal } from 'lucide-react';
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
  'Alpina Agrario':        { color: '#4f8eff', bg: 'rgba(79,142,255,0.15)',  emoji: '🌾' },
  'Alpina Davivienda':     { color: '#60b8ff', bg: 'rgba(96,184,255,0.15)',  emoji: '🏦' },
  'Alpina Bancolombia':    { color: '#ffd166', bg: 'rgba(255,209,102,0.12)', emoji: '🏧' },
  'Buzón':                 { color: '#00e5a0', bg: 'rgba(0,229,160,0.15)',   emoji: '📬' },
  'Servicios Nutresa Cárnicos': { color: '#9b5cff', bg: 'rgba(155,92,255,0.15)', emoji: '🥩' },
  'Cenas':                 { color: '#ff6b6b', bg: 'rgba(255,107,107,0.15)', emoji: '🍽️' },
  'Gasto':                 { color: '#ff9f1c', bg: 'rgba(255,159,28,0.15)',  emoji: '💸' },
  'Retención':             { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', emoji: '📄' },
};

const ESTADOS = ['Pendiente', 'Validado', 'Cuadrado', 'Rechazado'];
const BANCOS = ['Bancolombia TAT 4247', 'DAVIVIENDA TAT 8283', 'Buzon Atlas', 'Bancolombia 6061', 'Davivienda 8703', 'Alpina Agrario', 'Alpina Davivienda', 'Alpina Bancolombia', 'Buzón', 'Servicios Nutresa Cárnicos', 'Cenas', 'Gasto', 'Retención'];

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

  const fetch = async (silent = false) => { if (!silent) setLoading(true); const data = await mockDB.getConsignaciones(); setConsignaciones(data); if (!silent) setLoading(false); };

  useEffect(() => {
    fetch();
    const iv = setInterval(() => fetch(true), 15000);
    const channel = supabase.channel('consignaciones_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'consignaciones' }, (payload) => { fetch(true); if (payload.eventType === 'INSERT') { const newItem = payload.new; if (user.empresa && newItem.empresa === user.empresa) { toast('🔔 Nueva consignación entrante', { icon: '🆕' }); } } }).subscribe();
    return () => { clearInterval(iv); supabase.removeChannel(channel); };
  }, [user.empresa]);

  const handleAction = async (id, estado) => {
    let motivo = null;
    if (estado === 'Rechazado') { motivo = prompt('Motivo del rechazo:'); if (!motivo) return; }
    const tid = toast.loading('Verificando estado...');
    try {
      const latest = await mockDB.getConsignacionById(id);
      const isTransitionValid = latest.estado !== estado;
      if (!isTransitionValid) { toast.error(`Esta consignación ya tiene el estado ${latest.estado.toLowerCase()} por ${latest.cajera_name || 'otra persona'}.`, { id: tid }); fetch(true); setSelected(null); return; }
      toast.loading('Actualizando...', { id: tid }); await mockDB.updateConsignacionStatus(id, estado, motivo, user.id, user.full_name); toast.success(estado === 'Validado' ? '✅ Aprobada' : estado === 'Cuadrado' ? '✅ Cuadrada' : '❌ Rechazada', { id: tid }); fetch(true); setSelected(null);
    } catch (e) { toast.error('Error al actualizar', { id: tid }); console.error(e); }
  };

  const filtered = consignaciones
    .filter(c => user.empresa ? c.empresa === user.empresa : true)
    .filter(c => {
      const okBanco = bancoFilter ? c.banco === bancoFilter : true;
      let okEstado;
      if (estadoFilter && !search) okEstado = c.estado === estadoFilter;
      else if (user && user.role === 'cajera') okEstado = c.estado === 'Pendiente' || c.estado === 'Validado' || c.estado === 'Cuadrado';
      else okEstado = true;
      const okSearch = search ? (c.auxiliar_name.toLowerCase().includes(search.toLowerCase()) || c.numero_comprobante.includes(search)) : true;
      const cDateStr = c.fecha.split('T')[0];
      const okStart = dateRange.start ? cDateStr >= dateRange.start : true;
      const okEnd = dateRange.end ? cDateStr <= dateRange.end : true;
      const okEmpresa = empresaFilter ? c.empresa === empresaFilter : true;
      return okBanco && okEstado && okSearch && okStart && okEnd && okEmpresa;
    });

  const companyConsignaciones = consignaciones.filter(c => user.empresa ? c.empresa === user.empresa : true);
  const pendientes = companyConsignaciones.filter(c => c.estado === 'Pendiente').length;
  const validadasPorCuadrar = companyConsignaciones.filter(c => c.estado === 'Validado').length;
  const cuadradas = companyConsignaciones.filter(c => c.estado === 'Cuadrado').length;

  const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
  const badgeClass = (e) => e === 'Pendiente' ? 'badge-pending' : e === 'Validado' ? 'badge-validated' : e === 'Cuadrado' ? 'badge-squared' : 'badge-rejected';

  const renderActionButtons = (isMobile = false) => {
    if (!selected) return null;
    const selState = String(selected.estado || '').trim().toLowerCase();
    if (selState === 'pendiente') return (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem', marginTop: 'auto' }}><button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')}><XCircle size={18} /> Rechazar</button><button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')}><CheckCircle size={18} /> Validar y Aprobar</button></div>);
    if (selState === 'validado') return (<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: isMobile ? '0.75rem' : '1rem', marginTop: 'auto' }}><button className="btn btn-danger" onClick={() => handleAction(selected.id, 'Rechazado')}><XCircle size={18} /> Rechazar</button><button className="btn btn-primary" onClick={() => handleAction(selected.id, 'Cuadrado')}><CheckCircle size={18} /> Cuadrar Consignación</button></div>);
    if (selState === 'rechazado') return (<div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: isMobile ? '0.75rem' : '1rem', marginTop: 'auto' }}><button className="btn btn-success" onClick={() => handleAction(selected.id, 'Validado')}><CheckCircle size={18} /> Corregir y Validar</button></div>);
    if (selState === 'cuadrado') return (<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', background: 'rgba(0, 229, 160, 0.08)', border: '1px solid var(--neon-green)', borderRadius: 'var(--radius-sm)', color: 'var(--neon-green)', fontWeight: 700 }}> <CheckCircle size={16} /> Consignación cuadrada y conciliada</div>);
    return null;
  };

  return (
    <div className="page animate-in">
      <div className="hero-card"><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div className="hero-label">👩‍💼 Panel Cajera (TAT)</div></div><div className="hero-value">{pendientes}</div><div className="hero-sub">{pendientes === 1 ? 'consignación pendiente' : 'consignaciones pendientes'} de validación{validadasPorCuadrar > 0 && ` · ${validadasPorCuadrar} por cuadrar`}</div></div>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0 0.5rem' }}>
        <div className="search-wrap" style={{ flex: 1, margin: 0 }}><Search size={15} className="search-icon" /><input type="text" className="form-control" style={{ paddingLeft: '2.5rem' }} placeholder="Buscar auxiliar o comprobante..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        <button className={`btn btn-ghost btn-icon`} onClick={() => setShowFilters(v => !v)} style={{ flexShrink: 0 }}><SlidersHorizontal size={17} /></button>
      </div>

      <div className="chip-row"><button className={`chip ${estadoFilter === '' ? 'active' : ''}`} onClick={() => setEstadoFilter('')}>Todos</button>{ESTADOS.map(e => (<button key={e} className={`chip ${estadoFilter === e ? 'active' : ''}`} onClick={() => setEstadoFilter(e)}>{e}</button>))}</div>

      {showFilters && (<div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}><div className="form-group"><label className="form-label">Desde</label><input type="date" className="form-control" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} /></div><div className="form-group"><label className="form-label">Hasta</label><input type="date" className="form-control" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} /></div><div className="form-group"><label className="form-label">Banco</label><select className="form-control" value={bancoFilter} onChange={e => setBancoFilter(e.target.value)}><option value="">Todos los bancos</option>{BANCOS.map(b => <option key={b} value={b}>{b}</option>)}</select></div><div className="form-group"><label className="form-label">Empresa</label><select className="form-control" value={empresaFilter} onChange={e => setEmpresaFilter(e.target.value)}><option value="">Todas</option><option value="ALPINA">ALPINA</option><option value="ZENU">ZENU</option><option value="TAT">TAT</option></select></div><div style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn btn-ghost w-full" onClick={() => { setBancoFilter(''); setDateRange({ start: '', end: '' }); setSearch(''); setEmpresaFilter(''); }} style={{ fontSize: '0.75rem' }}>Limpiar Filtros</button></div></div></div>)}

      <div className="cajera-split-layout">
        <div className="cajera-list-pane"><div className="card" style={{ height: '100%', overflowY: 'auto' }}>{loading && consignaciones.length === 0 ? (<div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>) : filtered.length === 0 ? (<div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}><Clock size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} /><p>Sin resultados</p></div>) : (filtered.map(c => { const bc = BANCO_COLORS[c.banco] || BANCO_COLORS['Bancolombia 6061']; const isActive = selected?.id === c.id; return (<div key={c.id} className={`consign-item ${isActive ? 'active-item' : ''}`} onClick={() => setSelected(c)} style={isActive ? { background: 'rgba(79,142,255,0.08)', borderLeft: '3px solid var(--neon-blue)' } : {}}><div className="consign-icon" style={{ background: bc.bg }}><span style={{ fontSize: '1.2rem' }}>{bc.emoji}</span></div><div className="consign-info"><div className="consign-name">{c.auxiliar_name}</div><div className="consign-meta">{c.banco} · #{c.numero_comprobante}</div></div><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}><span className="consign-amount">{money(c.valor)}</span><div style={{ display: 'flex', gap: '0.3rem' }}><span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: c.empresa === 'ALPINA' ? 'rgba(79,142,255,0.15)' : 'rgba(255,159,28,0.15)', color: c.empresa === 'ALPINA' ? 'var(--neon-blue)' : 'var(--neon-orange)', fontWeight: 800 }}>{c.empresa || 'GEN'}</span><span className={`badge ${badgeClass(c.estado)}`}>{c.estado}</span></div></div></div>); }))}</div></div>

        <div className={`cajera-detail-pane ${selected ? 'visible' : ''}`}>{selected ? (<div className="card" style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}><div><h1 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>{selected.auxiliar_name}</h1><div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}><span className={`badge ${badgeClass(selected.estado)}`} style={{ fontSize: '0.9rem', padding: '0.4rem 1rem' }}>{selected.estado}</span><span style={{ color: 'var(--text-3)', fontSize: '0.85rem' }}>{format(new Date(selected.fecha), "d 'de' MMMM yyyy, h:mm a", { locale: es })}</span></div></div><div style={{ textAlign: 'right' }}><p style={{ fontSize: '0.75rem', color: 'var(--text-3)', textTransform: 'uppercase', fontWeight: 700 }}>Valor total</p><p style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neon-blue)' }}>{money(selected.valor)}</p></div></div><div style={{ display: 'grid', gridTemplateColumns: '350px 1fr', gap: '2rem' }}><div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}><div style={{ background: 'rgba(255,255,255,0.02)', padding: '1.25rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}><h3 style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '1rem', textTransform: 'uppercase' }}>Información del Banco</h3><div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-3)' }}>Entidad</span><span style={{ fontWeight: 700 }}>{selected.banco}</span></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-3)' }}>Nº Comprobante</span><span style={{ fontWeight: 700 }}>{selected.numero_comprobante}</span></div><div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: 'var(--text-3)' }}>Fecha</span><span style={{ fontWeight: 700 }}>{format(new Date(selected.fecha), "d/MM/yyyy, h:mm a")}</span></div></div></div>{selected.motivo_rechazo && (<div style={{ background: 'rgba(255,77,109,0.08)', border: '1px solid var(--neon-red)', borderRadius: 'var(--radius-md)', padding: '1.25rem' }}><p style={{ color: 'var(--neon-red)', fontWeight: 700, marginBottom: '0.25rem' }}>Motivo de Rechazo:</p><p style={{ color: 'var(--text-1)' }}>{selected.motivo_rechazo}</p></div>)}{renderActionButtons(false)}</div><div><h3 style={{ fontSize: '0.85rem', color: 'var(--text-2)', marginBottom: '0.5rem', textTransform: 'uppercase' }}>Evidencia del Comprobante</h3>{selected.file_url ? (selected.file_url.includes('pdf') ? (<div style={{ background: 'var(--bg-card)', borderRadius: 'var(--radius-md)', padding: '3rem', textAlign: 'center', border: '2px dashed var(--border)' }}><Clock size={40} style={{ opacity: 0.2, marginBottom: '1rem' }} /><p>Documento PDF Adjunto</p><a href={selected.file_url} target="_blank" className="btn btn-ghost" style={{ marginTop: '1rem' }}>Ver PDF completo</a></div>) : (<div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--border)', background: '#000', display: 'flex', justifyContent: 'center' }}><img src={selected.file_url} alt="Evidencia" style={{ width: '100%', maxHeight: '75vh', objectFit: 'contain' }} /><a href={selected.file_url} target="_blank" className="btn btn-ghost" style={{ position: 'absolute', bottom: '1rem', right: '1rem', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}><Eye size={16} /> Ver original</a></div>)) : (<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>Sin imagen adjunta</div>)}</div></div></div>) : (<div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-3)', textAlign: 'center' }}><Clock size={48} style={{ opacity: 0.1, marginBottom: '1rem' }} /><p style={{ fontSize: '1.1rem' }}>Selecciona una consignación para ver los detalles y validarla</p></div>)}</div>
      </div>

    </div>
  );
};

export default CajeraPanel;