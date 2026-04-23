import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, Clock, Building2, ListChecks, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { mockDB } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

const money = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

const BANCO_COLORS = {
  'Bancolombia 6061': '#ffd166',
  'Davivienda 8703': '#ff4d6d',
  'Alpina Agrario': '#4f8eff',
  'Alpina Davivienda': '#ff4d6d',
  'Alpina Bancolombia': '#ffd166',
  'Buzón': '#00e5a0',
  'Servicios Nutresa Cárnicos': '#9b5cff',
  'Gasto': '#ff9f1c',
  'Retención': '#94a3b8',
};

const AdminPanel = ({ user }) => {
  const [consignaciones, setConsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const data = await mockDB.getConsignaciones();
      setConsignaciones(data);
      setLoading(false);
    })();
  }, []);

  const exportToExcel = async () => {
    if (consignaciones.length === 0) return;

    const tid = toast.loading('Generando respaldo completo (ZIP)... Esto puede tardar si hay muchas fotos.');

    try {
      const zip = new JSZip();
      const photosFolder = zip.folder("comprobantes_por_fecha");

      // 1. Preparar datos para Excel
      const data = consignaciones.map(c => ({
        Fecha: format(new Date(c.fecha), "yyyy-MM-dd HH:mm"),
        Auxiliar: c.auxiliar_name,
        Banco: c.banco,
        Valor: c.valor,
        Comprobante: c.numero_comprobante,
        Estado: c.estado,
        Motivo_Rechazo: c.motivo_rechazo || '',
        Carpeta_Local: format(new Date(c.fecha), "yyyy-MM-dd") // Referencia a la carpeta en el ZIP
      }));

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Consignaciones");

      const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      zip.file("Reporte_Consignaciones.xlsx", excelBuffer);

      // 2. Descargar y organizar fotos
      const downloadPromises = consignaciones.map(async (c, index) => {
        if (!c.file_url) return;

        try {
          const response = await fetch(c.file_url);
          const blob = await response.blob();

          const dateStr = format(new Date(c.fecha), "yyyy-MM-dd");
          const dayFolder = photosFolder.folder(dateStr);

          // Nombre de archivo descriptivo: Auxiliar_Banco_Numero.ext
          const ext = c.file_url.split('.').pop().split('?')[0] || 'png';
          const safeName = `${c.auxiliar_name.replace(/\s+/g, '_')}_${c.banco.replace(/\s+/g, '_')}_${c.numero_comprobante}.${ext}`;

          dayFolder.file(safeName, blob);
        } catch (err) {
          console.error(`Error bajando foto ${c.id}:`, err);
        }
      });

      await Promise.all(downloadPromises);

      // 3. Generar y guardar el ZIP
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `Respaldo_Consignaciones_${format(new Date(), "yyyy-MM-dd")}.zip`);

      toast.success('¡Respaldo ZIP descargado con éxito! 📂', { id: tid });
    } catch (err) {
      console.error("Error en backup:", err);
      toast.error('Error al generar el respaldo', { id: tid });
    }
  };

  const badgeClass = (e) => e === 'Pendiente' ? 'badge-pending' : e === 'Validado' ? 'badge-valid' : 'badge-rejected';

  const filtered = consignaciones.filter(c => {
    const okSearch = search ? (
      c.auxiliar_name.toLowerCase().includes(search.toLowerCase()) ||
      c.numero_comprobante.includes(search)
    ) : true;
    
    const cDate = new Date(c.fecha);
    const okStart = dateRange.start ? cDate >= new Date(dateRange.start) : true;
    const okEnd   = dateRange.end   ? cDate <= new Date(dateRange.end + 'T23:59:59') : true;
    
    return okSearch && okStart && okEnd;
  });

  const totalValidado = filtered.filter(c => c.estado === 'Validado').reduce((a, b) => a + b.valor, 0);
  const pendientesCount = filtered.filter(c => c.estado === 'Pendiente').length;
  const rechazados = filtered.filter(c => c.estado === 'Rechazado').length;

  const byBank = filtered.filter(c => c.estado === 'Validado').reduce((acc, c) => {
    acc[c.banco] = (acc[c.banco] || 0) + c.valor;
    return acc;
  }, {});
  const topBank = Object.entries(byBank).sort((a, b) => b[1] - a[1])[0] || ['—', 0];

  const STATS = [
    {
      label: 'Total Validado',
      value: money(totalValidado),
      icon: <TrendingUp size={18} />,
      color: 'var(--neon-green)',
      bg: 'rgba(0,229,160,0.12)',
    },
    {
      label: 'Pendientes',
      value: pendientesCount,
      icon: <Clock size={18} />,
      color: 'var(--neon-yellow)',
      bg: 'rgba(255,209,102,0.12)',
    },
    {
      label: 'Rechazados',
      value: rechazados,
      icon: <XCircle size={18} />,
      color: 'var(--neon-red)',
      bg: 'rgba(255,77,109,0.12)',
    },
    {
      label: 'Total Registros',
      value: consignaciones.length,
      icon: <ListChecks size={18} />,
      color: 'var(--neon-blue)',
      bg: 'rgba(79,142,255,0.12)',
    },
  ];

  return (
    <div className="page animate-in">
      {/* Filters & Search Bar */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center' }}>
        <div className="search-wrap" style={{ flex: 1, margin: 0 }}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem' }}
            placeholder="Buscar por auxiliar o número de comprobante..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button 
          className="btn btn-ghost" 
          onClick={() => setShowFilters(!showFilters)}
          style={{ height: '42px', gap: '0.5rem', ...(showFilters ? { color: 'var(--neon-blue)', borderColor: 'var(--neon-blue)' } : {}) }}
        >
          <Filter size={16} /> {showFilters ? 'Ocultar Filtros' : 'Filtros'}
        </button>
      </div>

      {showFilters && (
        <div className="card animate-in" style={{ padding: '1.25rem', marginBottom: '1.5rem', background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Desde la fecha</label>
              <input 
                type="date" 
                className="form-control" 
                value={dateRange.start} 
                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} 
              />
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Hasta la fecha</label>
              <input 
                type="date" 
                className="form-control" 
                value={dateRange.end} 
                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} 
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end' }}>
              <button 
                className="btn btn-ghost w-full" 
                onClick={() => { setSearch(''); setDateRange({ start: '', end: '' }); }}
              >
                Limpiar Búsqueda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hero */}
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #9b5cff 0%, #4f8eff 100%)', boxShadow: 'var(--shadow-glow-purple)' }}>
        <div className="hero-label">🛡️ Panel Administrativo</div>
        <div className="hero-value">{money(totalValidado)}</div>
        <div className="hero-sub">total validado · {consignaciones.length} registros en sistema</div>
      </div>

      {/* Top section: Metrics and Leaderboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
        {/* KPI Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
          {STATS.map(s => (
            <div key={s.label} className="stat-card animate-in" style={{ margin: 0 }}>
              <div className="stat-card-icon" style={{ background: s.bg }}>
                <span style={{ color: s.color }}>{s.icon}</span>
              </div>
              <div className="stat-card-value" style={{ fontSize: '1.25rem' }}>{s.value}</div>
              <div className="stat-card-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Top bank + Export Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {topBank[0] !== '—' && (
            <div className="card" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1.5rem', padding: '1.5rem' }}>
              <div style={{ width: 60, height: 60, borderRadius: 'var(--radius-md)', background: `${BANCO_COLORS[topBank[0]] || '#4f8eff'}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Building2 size={32} color={BANCO_COLORS[topBank[0]] || 'var(--neon-blue)'} />
              </div>
              <div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Banco con más movimiento</p>
                <div style={{ fontWeight: 800, fontSize: '1.5rem', color: 'var(--text-1)', margin: '2px 0' }}>{topBank[0]}</div>
                <div style={{ fontSize: '1rem', color: BANCO_COLORS[topBank[0]] || 'var(--neon-blue)', fontWeight: 700 }}>{money(topBank[1])}</div>
              </div>
            </div>
          )}

          <button
            className="btn btn-success w-full"
            style={{ padding: '1.25rem', fontSize: '1rem' }}
            onClick={exportToExcel}
            disabled={loading || filtered.length === 0}
          >
            <Download size={20} />
            Descargar Respaldo Completo (ZIP)
          </button>
        </div>
      </div>

      {/* Transactions list */}
      <div className="section-header">
        <span className="section-title">Resultados ({filtered.length})</span>
        <span className="text-muted text-xs">Filtros aplicados</span>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
            <AlertCircle size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <p>No se encontraron registros con estos filtros</p>
          </div>
        ) : (
          filtered.slice(0, 50).map(c => (
            <div key={c.id} className="consign-item">
              <div className="consign-icon" style={{ background: `${BANCO_COLORS[c.banco] || '#4f8eff'}18` }}>
                <Building2 size={18} color={BANCO_COLORS[c.banco] || 'var(--neon-blue)'} />
              </div>
              <div className="consign-info">
                <div className="consign-name">{c.auxiliar_name}</div>
                <div className="consign-meta">{c.banco} · {format(new Date(c.fecha), "d MMM, h:mm a", { locale: es })}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                <span className="consign-amount">{money(c.valor)}</span>
                <span className={`badge ${badgeClass(c.estado)}`}>{c.estado}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
