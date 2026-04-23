import React, { useState, useEffect } from 'react';
import { UploadCloud, CheckCircle2, Image as ImageIcon, FileText, Loader2, Camera, Banknote, Hash, ChevronRight, ArrowLeft, History, Clock } from 'lucide-react';
import { mockDB } from '../lib/supabase';
import toast from 'react-hot-toast';
import imageCompression from 'browser-image-compression';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// ─── Estructura de bancos ───────────────────────────────────────────────────
const BANCOS_PRIMARY = [
  {
    id: 'bancolombia',
    label: 'Bancolombia',
    sub: 'Cta. 6061',
    color: '#ffd166',
    bg: 'rgba(255,209,102,0.12)',
    emoji: '🟡',
    value: 'Bancolombia 6061', // valor final
  },
  {
    id: 'davivienda',
    label: 'Davivienda',
    sub: 'Cta. 8703',
    color: '#ff4d6d',
    bg: 'rgba(255,77,109,0.12)',
    emoji: '🔴',
    value: 'Davivienda 8703',
  },
  {
    id: 'alpina',
    label: 'Alpina',
    sub: 'Selecciona cuenta →',
    color: '#4f8eff',
    bg: 'rgba(79,142,255,0.12)',
    emoji: '🔵',
    value: null, // tiene sub-opciones
    children: [
      { id: 'alpina_agrario',      label: 'Alpina Agrario',      color: '#4f8eff', bg: 'rgba(79,142,255,0.12)',  emoji: '🌾', value: 'Alpina Agrario' },
      { id: 'alpina_davivienda',   label: 'Alpina Davivienda',   color: '#ff4d6d', bg: 'rgba(255,77,109,0.12)', emoji: '🏦', value: 'Alpina Davivienda' },
      { id: 'alpina_bancolombia',  label: 'Alpina Bancolombia',  color: '#ffd166', bg: 'rgba(255,209,102,0.12)',emoji: '🏧', value: 'Alpina Bancolombia' },
    ],
  },
  {
    id: 'buzon',
    label: 'Buzón',
    sub: 'Depósito buzón',
    color: '#00e5a0',
    bg: 'rgba(0,229,160,0.12)',
    emoji: '📬',
    value: 'Buzón',
  },
  {
    id: 'nutresa',
    label: 'Serv. Nutresa',
    sub: 'Cárnicos',
    color: '#9b5cff',
    bg: 'rgba(155,92,255,0.12)',
    emoji: '🥩',
    value: 'Servicios Nutresa Cárnicos',
  },
];

// ─── Componente ─────────────────────────────────────────────────────────────
const AuxiliarPanel = ({ user }) => {
  const [primarySelected, setPrimarySelected] = useState(null); // objeto del banco principal
  const [banco, setBanco]       = useState('');  // valor final seleccionado
  const [showSub, setShowSub]   = useState(false); // mostrando sub-opciones Alpina
  const [valor, setValor]       = useState('');
  const [numero, setNumero]     = useState('');
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [compressing, setCompressing] = useState(false);
  const [history, setHistory]     = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  const fetchHistory = async () => {
    try {
      const data = await mockDB.getConsignaciones();
      // Filtrar por el ID del auxiliar actual
      const userHistory = data.filter(c => c.auxiliar_id === user.id);
      setHistory(userHistory);
    } catch (err) {
      console.error("Error al cargar historial", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
    // Actualizar cada 30 segundos por si la cajera valida algo
    const interval = setInterval(fetchHistory, 30000);
    return () => clearInterval(interval);
  }, [user.id]);

  const formatCurrency = (val) => {
    const clean = val.replace(/\D/g, '');
    if (!clean) return '';
    return new Intl.NumberFormat('es-CO').format(parseInt(clean, 10));
  };

  const handleValorChange = (e) => setValor(formatCurrency(e.target.value));

  const handleFileChange = async (e) => {
    if (e.target.files?.[0]) {
      const orig = e.target.files[0];
      if (orig.type.startsWith('image/')) {
        setCompressing(true);
        const options = {
          maxSizeMB: 0.2, // Reducido a 200KB (ideal para miles de fotos)
          maxWidthOrHeight: 1280, // Resolución suficiente para leer texto
          useWebWorker: true,
          initialQuality: 0.6 // Calidad inicial optimizada
        };
        try {
          const compressed = await imageCompression(orig, options);
          setFile(compressed);
          toast.success('Imagen optimizada (Ultra-ligera) ⚡');
        } catch { setFile(orig); }
        finally { setCompressing(false); }
      } else {
        setFile(orig);
      }
    }
  };

  // Selección banco principal
  const handlePrimarySelect = (b) => {
    setPrimarySelected(b);
    if (b.children) {
      // Alpina → mostrar sub-opciones
      setBanco('');
      setShowSub(true);
    } else {
      setBanco(b.value);
      setShowSub(false);
    }
  };

  // Selección sub-opción (Alpina)
  const handleSubSelect = (child) => {
    setBanco(child.value);
  };

  // Volver al selector principal
  const handleBack = () => {
    setPrimarySelected(null);
    setBanco('');
    setShowSub(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!banco || !valor || !numero || !file) {
      toast.error('Completa todos los campos');
      return;
    }
    setLoading(true);
    const tid = toast.loading('Guardando consignación...');
    try {
      // 1. Subir archivo real a Supabase Storage
      const publicUrl = await mockDB.uploadFile(file);
      
      // 2. Guardar registro en la DB con la URL real
      await mockDB.addConsignacion({
        banco,
        valor: parseInt(valor.replace(/\./g, ''), 10),
        numero_comprobante: numero,
        file_url: publicUrl, // URL real y persistente
        auxiliar_id: user.id,
        auxiliar_name: user.full_name,
      });
      toast.success('¡Consignación registrada! 🎉', { id: tid });
      setSuccess(true);
    } catch (err) {
      console.error("Error al subir/guardar:", err);
      toast.error('Error al guardar: ' + (err.message || 'Error desconocido'), { id: tid });
    } finally {
      setLoading(false);
      fetchHistory(); // Recargar historial tras guardar
    }
  };

  const reset = () => {
    setSuccess(false);
    setPrimarySelected(null);
    setBanco('');
    setShowSub(false);
    setValor('');
    setNumero('');
    setFile(null);
  };

  if (success) return (
    <div className="success-screen animate-in">
      <div className="success-icon-wrap">
        <CheckCircle2 size={44} color="var(--neon-green)" />
      </div>
      <h2 style={{ marginBottom: '0.5rem' }}>¡Consignación Enviada!</h2>
      <p style={{ maxWidth: 260, margin: '0 auto 0.5rem' }}>
        Registrado en <strong style={{ color: 'var(--text-1)' }}>{banco}</strong>
      </p>
      <p style={{ maxWidth: 260, margin: '0 auto 2rem', fontSize: '0.8rem' }}>
        Pendiente de validación por la cajera.
      </p>
      <button className="btn btn-primary" onClick={reset}>Registrar otra</button>
    </div>
  );

  const today = new Date().toLocaleDateString('es-CO', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="page animate-in">
      {/* Hero */}
      <div className="hero-card">
        <div className="hero-label">📅 {today}</div>
        <div className="hero-value" style={{ fontSize: '1.4rem', marginTop: '0.25rem' }}>Nueva Consignación</div>
        <div className="hero-sub">Registra el comprobante para validación 🏦</div>
      </div>

      {/* Resumen rápido Auxiliar */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ padding: '0.8rem', borderLeft: '3px solid var(--neon-blue)' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700 }}>Total Enviado</p>
          <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-1)' }}>
            {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(history.reduce((acc, curr) => acc + curr.valor, 0))}
          </p>
        </div>
        <div className="card" style={{ padding: '0.8rem', borderLeft: '3px solid var(--neon-yellow)' }}>
          <p style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700 }}>Pendientes</p>
          <p style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--text-1)' }}>
            {history.filter(c => c.estado === 'Pendiente').length} {history.filter(c => c.estado === 'Pendiente').length === 1 ? 'registro' : 'registros'}
          </p>
        </div>
      </div>

      {/* ── SELECTOR DE BANCO ── */}
      <div className="section-header">
        {showSub ? (
          <button
            type="button"
            onClick={handleBack}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: 'none', border: 'none', color: 'var(--neon-blue)', fontFamily: 'inherit', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}
          >
            <ArrowLeft size={15} /> Volver a bancos
          </button>
        ) : (
          <span className="section-title">Selecciona el banco</span>
        )}
        {banco && (
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neon-green)', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.25)', padding: '2px 10px', borderRadius: '99px' }}>
            ✓ {banco}
          </span>
        )}
      </div>

      {/* Selector primario */}
      {!showSub && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem', marginBottom: '1.25rem' }}>
          {BANCOS_PRIMARY.map(b => {
            const isSelected = primarySelected?.id === b.id;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handlePrimarySelect(b)}
                style={{
                  padding: '1rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected ? b.bg : 'var(--bg-card)',
                  border: `2px solid ${isSelected ? b.color : 'var(--border)'}`,
                  color: isSelected ? b.color : 'var(--text-2)',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s var(--ease)',
                  textAlign: 'left',
                  transform: isSelected ? 'scale(1.02)' : 'scale(1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.2rem',
                }}
              >
                <span style={{ fontSize: '1.3rem', lineHeight: 1 }}>{b.emoji}</span>
                <span>{b.label}</span>
                <span style={{ fontSize: '0.68rem', fontWeight: 500, color: isSelected ? b.color : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 2 }}>
                  {b.sub}
                  {b.children && <ChevronRight size={11} />}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Sub-opciones Alpina */}
      {showSub && primarySelected?.children && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-2)', marginBottom: '0.25rem' }}>
            Selecciona la cuenta Alpina:
          </p>
          {primarySelected.children.map(child => {
            const isSelected = banco === child.value;
            return (
              <button
                key={child.id}
                type="button"
                onClick={() => handleSubSelect(child)}
                style={{
                  padding: '1rem 1.25rem',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected ? child.bg : 'var(--bg-card)',
                  border: `2px solid ${isSelected ? child.color : 'var(--border)'}`,
                  color: isSelected ? child.color : 'var(--text-1)',
                  fontFamily: 'inherit',
                  fontWeight: 700,
                  fontSize: '0.95rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s var(--ease)',
                  textAlign: 'left',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <span style={{ fontSize: '1.4rem' }}>{child.emoji}</span>
                <span style={{ flex: 1 }}>{child.label}</span>
                {isSelected && <CheckCircle2 size={18} />}
              </button>
            );
          })}
        </div>
      )}

      {/* ── FORM ── */}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {/* Valor */}
        <div>
          <label className="form-label">
            <Banknote size={12} style={{ display: 'inline', marginRight: 4 }} />
            Valor Consignado ($)
          </label>
          <input
            type="text"
            inputMode="numeric"
            className="form-control"
            placeholder="0"
            value={valor}
            onChange={handleValorChange}
            style={{ fontSize: '1.1rem', fontWeight: 700 }}
            required
          />
        </div>

        {/* Número comprobante */}
        <div>
          <label className="form-label">
            <Hash size={12} style={{ display: 'inline', marginRight: 4 }} />
            Número de Comprobante
          </label>
          <input
            type="text"
            className="form-control"
            placeholder="Ej. 987654321"
            value={numero}
            onChange={e => setNumero(e.target.value)}
            required
          />
        </div>

        {/* File Upload */}
        <div>
          <label className="form-label">
            <Camera size={12} style={{ display: 'inline', marginRight: 4 }} />
            Foto o PDF del Comprobante
          </label>
          <label
            className={`file-drop ${file ? 'has-file' : ''}`}
            style={{ display: 'block', cursor: compressing ? 'not-allowed' : 'pointer', opacity: compressing ? 0.6 : 1 }}
          >
            <input type="file" accept="image/*,.pdf" onChange={handleFileChange} disabled={compressing} />
            {compressing ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <Loader2 size={32} style={{ color: 'var(--neon-blue)', animation: 'spin 0.7s linear infinite' }} />
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--neon-blue)' }}>Optimizando...</span>
              </div>
            ) : file ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.4rem' }}>
                {file.type.includes('pdf')
                  ? <FileText size={32} color="var(--neon-green)" />
                  : <ImageIcon size={32} color="var(--neon-green)" />}
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--neon-green)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-2)' }}>{(file.size / 1024 / 1024).toFixed(2)} MB · Toca para cambiar</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem' }}>
                <UploadCloud size={36} style={{ color: 'var(--text-2)' }} />
                <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>Tomar foto o subir archivo</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-2)' }}>Usa tu cámara o selecciona de la galería</span>
              </div>
            )}
          </label>
        </div>

        <button
          type="submit"
          className="btn btn-primary w-full"
          style={{ padding: '1rem', fontSize: '1rem', marginTop: '0.5rem' }}
          disabled={loading || compressing || !file || !banco}
        >
          {loading
            ? <><div className="spinner" /> Guardando...</>
            : <>Guardar Consignación 🚀</>
          }
        </button>
      </form>

      {/* ── HISTORIAL ── */}
      <div className="section-header" style={{ marginTop: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <History size={18} className="text-blue" />
          <span className="section-title">Mis Registros Recientes</span>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        {loadingHistory ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : history.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>
            <Clock size={32} style={{ marginBottom: '0.75rem', opacity: 0.3 }} />
            <p style={{ fontSize: '0.85rem' }}>Aún no has enviado consignaciones</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {history.slice(0, 10).map((item) => (
              <div key={item.id} className="consign-item" style={{ borderBottom: '1px solid var(--border)', padding: '1rem 0' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-1)' }}>{item.banco}</span>
                    <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-1)' }}>
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(item.valor)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>Comprobante: {item.numero_comprobante}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-3)' }}>
                        {format(new Date(item.fecha), "d MMM, h:mm a", { locale: es })}
                      </span>
                    </div>
                    <span className={`badge ${
                      item.estado === 'Pendiente' ? 'badge-pending' : 
                      item.estado === 'Validado' ? 'badge-valid' : 'badge-rejected'
                    }`} style={{ fontSize: '0.6rem', padding: '2px 8px' }}>
                      {item.estado}
                    </span>
                  </div>
                  {item.motivo_rechazo && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,77,109,0.05)', borderRadius: '6px', borderLeft: '2px solid var(--neon-red)' }}>
                      <p style={{ fontSize: '0.7rem', color: 'var(--neon-red)' }}>
                        <strong>Rechazado:</strong> {item.motivo_rechazo}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ))}
            {history.length > 10 && (
              <p style={{ textAlign: 'center', fontSize: '0.7rem', color: 'var(--text-3)', marginTop: '1rem' }}>
                Mostrando los últimos 10 registros
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuxiliarPanel;
