import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, Clock, Building2, ListChecks, CheckCircle2, XCircle, AlertCircle, Search, Filter, LayoutGrid, List, Trash2 } from 'lucide-react';
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
  'Cenas': '#ff6b6b',
  'Gasto': '#ff9f1c',
  'Retención': '#94a3b8',
};

const KNOWN_BANCOS_TAT = ['Bancolombia TAT 4247', 'DAVIVIENDA TAT 8283', 'Buzon Atlas', 'Gasto', 'Retención'];
const KNOWN_BANCOS_GENERAL = ['Bancolombia 6061', 'Davivienda 8703', 'Alpina Agrario', 'Alpina Davivienda', 'Alpina Bancolombia', 'Buzón', 'Servicios Nutresa Cárnicos', 'Cenas', 'Gasto', 'Retención'];

const AdminPanel = ({ user }) => {
  const [consignaciones, setConsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [empresaFilter, setEmpresaFilter] = useState('');
  const [cajeraFilter, setCajeraFilter] = useState('');
  const [bancoFilter, setBancoFilter] = useState(''); // New bank filter
  const [zipByBank, setZipByBank] = useState(false); // Export option
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grid'
  const [showFilters, setShowFilters] = useState(false);

  // Helper to set date range for a given month (June or May)
  const setMonthRange = (month) => {
    const year = new Date().getFullYear();
    const monthIdx = month === 'June' ? 5 : 4; // June=5, May=4 (0-indexed)
    const start = `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`;
    const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
    const end = `${year}-${String(monthIdx + 1).padStart(2, '0')}-${daysInMonth}`;
    setDateRange({ start, end });
  };

  // Set default to June on mount
  useEffect(() => {
    setMonthRange('June');
  }, []);

  const fetchConsignaciones = async (silent = false) => {
    if (!silent) setLoading(true);
    const data = await mockDB.getConsignaciones();
    console.log('Fetched consignaciones', data);
    // Si el usuario es admin en la app principal, mostrar según su empresa
    if (user && user.role === 'admin') {
      if (user.empresa === 'TAT') {
        setConsignaciones((data || []).filter(d => d.empresa === 'TAT'));
      } else {
        setConsignaciones((data || []).filter(d => d.empresa !== 'TAT'));
      }
    } else {
      setConsignaciones(data);
    }
    if (!silent) setLoading(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar permanentemente esta consignación? Esta acción no se puede deshacer y los totales se actualizarán de inmediato.')) {
      return;
    }
    const tid = toast.loading('Eliminando consignación...');
    try {
      await mockDB.deleteConsignacion(id);
      toast.success('Consignación eliminada correctamente 🗑️', { id: tid });
      fetchConsignaciones(true);
    } catch (e) {
      console.error(e);
      toast.error('Error al eliminar la consignación', { id: tid });
    }
  };

  useEffect(() => {
    fetchConsignaciones();
    const interval = setInterval(() => fetchConsignaciones(true), 5000);
    return () => clearInterval(interval);
  }, []);

  const exportToExcel = async (onlyFiltered = false, includeAll = false) => {
    let listToExport;
    if (includeAll) {
      // Include all consignaciones that have an uploaded file, regardless of estado
      listToExport = onlyFiltered ? filtered.filter(c => c.file_url) : consignaciones.filter(c => c.file_url);
    } else if (onlyFiltered) {
      // Include only Cuadrado consignaciones that match active UI filters
      listToExport = filtered.filter(c => c.estado === 'Cuadrado');
    } else {
      // Include all Cuadrado consignaciones
      listToExport = consignaciones.filter(c => c.estado === 'Cuadrado');
    }
    if (listToExport.length === 0) return;

    const modeLabel = includeAll ? 'Todo' : (onlyFiltered ? 'Filtrado' : 'Completo');
    const tid = toast.loading(`Generando respaldo ${modeLabel.toLowerCase()} (ZIP)... Esto puede tardar si hay muchas fotos.`);

    try {
      const zip = new JSZip();
      const photosFolder = zip.folder("comprobantes_por_fecha");

      // 1. Preparar datos para Excel (solo los filtrados o todos según corresponda)
      const data = listToExport.map(c => ({
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
      zip.file(`Reporte_Consignaciones_${modeLabel}.xlsx`, excelBuffer);

      // 2. Descargar y organizar fotos
      const downloadPromises = listToExport.map(async (c, index) => {
        if (!c.file_url) return;

        try {
          const response = await fetch(c.file_url);
          const blob = await response.blob();

          const dateStr = format(new Date(c.fecha), "yyyy-MM-dd");
          let destinationFolder;
          if (zipByBank) {
            const bankFolder = zip.folder(`banco_${c.banco}`);
            destinationFolder = bankFolder.folder(dateStr);
          } else {
            destinationFolder = photosFolder.folder(dateStr);
          }

          const ext = c.file_url.split('.').pop().split('?')[0] || 'png';
          const safeName = `${c.auxiliar_name.replace(/\s+/g, '_')}_${c.banco.replace(/\s+/g, '_')}_${c.numero_comprobante}_${c.valor}.${ext}`;

          destinationFolder.file(safeName, blob);
        } catch (err) {
          console.error(`Error bajando foto ${c.id}:`, err);
        }
      });

      await Promise.all(downloadPromises);

      // 3. Generar y guardar el ZIP
      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `Respaldo_Consignaciones_${modeLabel}_${format(new Date(), "yyyy-MM-dd_HH-mm-ss")}.zip`);

      toast.success(`¡Respaldo ZIP ${modeLabel.toLowerCase()} descargado con éxito! 📂`, { id: tid });
    } catch (err) {
      console.error("Error en backup:", err);
      toast.error('Error al generar el respaldo', { id: tid });
    }
  };

  const badgeClass = (e) => e === 'Pendiente' ? 'badge-pending' : e === 'Validado' ? 'badge-valid' : 'badge-rejected';


  const filtered = consignaciones.filter(c => {
    const s = search.trim();
    let okSearch = true;
    if (s) {
      const auxName = (c.auxiliar_name || '').toLowerCase();
      const comprobante = String(c.numero_comprobante || '');
      const valorStr = String(c.valor != null ? c.valor : '');
      const sLower = s.toLowerCase();
      const sNum = Number(s);

      okSearch =
        auxName.includes(sLower) ||
        comprobante.includes(s) ||
        valorStr.includes(s) ||
        (!isNaN(sNum) && c.valor != null && Math.abs(c.valor - sNum) < 0.01);
    }
    
    const dateStr = c.fecha ? c.fecha.substring(0, 10) : '';
    const okStart = dateRange.start ? dateStr >= dateRange.start : true;
    const okEnd   = dateRange.end   ? dateStr <= dateRange.end : true;
    const okBanco = bancoFilter ? (c.banco && c.banco.trim().toLowerCase() === bancoFilter.trim().toLowerCase()) : true;
    const okEmpresa = empresaFilter ? c.empresa === empresaFilter : true;
    const okCajera = cajeraFilter ? c.cajera_name === cajeraFilter : true;
    
    return okSearch && okStart && okEnd && okBanco && okEmpresa && okCajera;
  });



  const totalValidado = filtered.filter(c => c.estado === 'Validado').reduce((a, b) => a + b.valor, 0);
  const totalFiltrado = filtered.reduce((a, b) => a + b.valor, 0);
  const isSearching = search.trim().length > 0;
  const heroTotal = isSearching ? totalFiltrado : totalValidado;
  const heroLabel = isSearching ? 'total encontrado' : 'total validado';
  const pendientesCount = filtered.filter(c => c.estado === 'Pendiente').length;
  const rechazados = filtered.filter(c => c.estado === 'Rechazado').length;
  const filteredCuadradoCount = filtered.filter(c => c.estado === 'Cuadrado').length;
  const totalCuadradoCount = consignaciones.filter(c => c.estado === 'Cuadrado').length;
  const totalUploadedCount = consignaciones.filter(c => c.file_url).length;
  const filteredUploadedCount = filtered.filter(c => c.file_url).length;

  const byBank = filtered.filter(c => c.estado === 'Validado').reduce((acc, c) => {
    acc[c.banco] = (acc[c.banco] || 0) + c.valor;
    return acc;
  }, {});
  const topBank = Object.entries(byBank).sort((a, b) => b[1] - a[1])[0] || ['—', 0];

  // Cuadre diario (Totales validados agrupados por día)
  const dailyTotals = consignaciones
    .filter(c => c.estado === 'Validado')
    .reduce((acc, c) => {
      const dateStr = format(new Date(c.fecha), "yyyy-MM-dd");
      acc[dateStr] = (acc[dateStr] || 0) + c.valor;
      return acc;
    }, {});

  const dailyBreakdown = Object.entries(dailyTotals)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 7);

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
        <div className="search-wrap" style={{ flex: 1, margin: 0, position: 'relative' }}>
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="form-control"
            style={{ paddingLeft: '2.5rem', paddingRight: '4rem' }}
            placeholder="Buscar por auxiliar, comprobante o valor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {/* Show formatted amount when input is numeric */}
          {/^\d+$/.test(search) && (
            <span
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--neon-green)',
                fontWeight: 'bold',
              }}
            >
              {money(Number(search))}
            </span>
          )}
        </div>
        <button 
          className="btn btn-ghost" 
          onClick={() => setShowFilters(!showFilters)}
          style={{ height: '42px', gap: '0.5rem', ...(showFilters ? { color: 'var(--neon-blue)', borderColor: 'var(--neon-blue)' } : {}) }}
        >
          <Filter size={16} /> {showFilters ? 'Ocultar Filtros' : 'Filtros'}
        </button>
        <div style={{ display: 'flex', background: 'rgba(255,255,255,0.05)', borderRadius: 'var(--radius-md)', padding: '2px' }}>
          <button 
            className={`btn btn-icon ${viewMode === 'list' ? 'active' : ''}`} 
            onClick={() => setViewMode('list')}
            style={{ borderRadius: 'var(--radius-sm)', background: viewMode === 'list' ? 'var(--neon-blue)' : 'transparent', color: viewMode === 'list' ? '#000' : 'var(--text-3)' }}
          >
            <List size={18} />
          </button>
          <button 
            className={`btn btn-icon ${viewMode === 'grid' ? 'active' : ''}`} 
            onClick={() => setViewMode('grid')}
            style={{ borderRadius: 'var(--radius-sm)', background: viewMode === 'grid' ? 'var(--neon-blue)' : 'transparent', color: viewMode === 'grid' ? '#000' : 'var(--text-3)' }}
          >
            <LayoutGrid size={18} />
          </button>
        </div>
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
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Banco</label>
            <select
              className="form-control"
              value={bancoFilter}
              onChange={e => setBancoFilter(e.target.value)}
            >
              <option value="">Todos los Bancos</option>
              {[...new Set([
                ...consignaciones.map(c => c.banco).filter(Boolean),
                ...(user?.empresa === 'TAT' ? KNOWN_BANCOS_TAT : KNOWN_BANCOS_GENERAL)
              ])]
                .sort()
                .map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
            </select>
            </div>
            <div className="form-group">
              <label className="form-label" style={{ fontSize: '0.72rem' }}>Cajera</label>
              <select 
                className="form-control" 
                value={cajeraFilter} 
                onChange={e => setCajeraFilter(e.target.value)}
              >
                <option value="">Todas</option>
                {[...new Set(consignaciones.map(c => c.cajera_name).filter(Boolean))].map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
                        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
              <button
                className="btn btn-ghost w-full"
                onClick={() => {
                  setSearch('');
                  setDateRange({ start: '', end: '' });
                  setEmpresaFilter('');
                  setCajeraFilter('');
                  setBancoFilter('');
                }}
                style={{ padding: '0.6rem 1.25rem', fontSize: '0.8rem', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-3)', background: 'rgba(255,255,255,0.02)' }}
              >
                Limpiar Búsqueda
              </button>
              <button
                className="btn btn-ghost w-full"
                onClick={() => setMonthRange('May')}
                style={{ padding: '0.6rem 1.25rem', fontSize: '0.8rem', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-3)', background: 'rgba(255,255,255,0.02)' }}
              >
                Ver historial de Mayo
              </button>
            </div>
            </div>
          </div>
 )}

      {/* Hero */}
      <div className="hero-card" style={{ background: 'linear-gradient(135deg, #9b5cff 0%, #4f8eff 100%)', boxShadow: 'var(--shadow-glow-purple)' }}>
        <div className="hero-label">🛡️ Panel Administrativo</div>
        <div className="hero-value">{money(heroTotal)}</div>
        <div className="hero-sub">{heroLabel} · {consignaciones.length} registros en sistema</div>
      </div>

          {/* Sección de datos por mes */}
          <div style={{ display: 'flex', gap: '2rem', marginBottom: '2rem' }}>
            {/* Datos de Junio */}
            <div className="card" style={{ flex: 1, padding: '1rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Datos de Junio</h3>
              <p>Total consignaciones: {consignaciones.filter(c => {
                const d = new Date(c.fecha);
                return d.getMonth() === 5; // Junio (0-indexed)
              }).length}</p>
            </div>
            {/* Histórico de Mayo */}
            <div className="card" style={{ flex: 1, padding: '1rem' }}>
              <h3 style={{ marginBottom: '0.5rem' }}>Histórico de Mayo</h3>
              <p>Total consignaciones: {consignaciones.filter(c => {
                const d = new Date(c.fecha);
                return d.getMonth() === 4; // Mayo
              }).length}</p>
            </div>
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

          {filtered.length < consignaciones.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
              <button
                className="btn btn-success w-full animate-in"
                style={{ 
                  padding: '1rem 1.25rem', 
                  fontSize: '0.92rem', 
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', 
                  border: 'none', 
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.2)',
                  color: '#00120d'
                }}
                onClick={() => exportToExcel(true)}
                disabled={loading || filteredCuadradoCount === 0}
              >
                <Download size={18} />
                Descargar Filtrado (ZIP · {filteredCuadradoCount} reg.)
              </button>

              <button
                className="btn btn-ghost w-full"
                style={{ 
                  padding: '0.6rem 1.25rem', 
                  fontSize: '0.8rem', 
                  borderColor: 'rgba(255,255,255,0.08)', 
                  color: 'var(--text-3)',
                  background: 'rgba(255,255,255,0.02)'
                }}
                onClick={() => exportToExcel(true, true)}
                disabled={loading || filteredUploadedCount === 0}
              >
                <Download size={14} />
                Descargar Todo (ZIP · {filteredUploadedCount} reg.)
              </button>

              <button
                className="btn btn-ghost w-full"
                style={{ 
                  padding: '0.6rem 1.25rem', 
                  fontSize: '0.8rem', 
                  borderColor: 'rgba(255,255,255,0.08)', 
                  color: 'var(--text-3)',
                  background: 'rgba(255,255,255,0.02)'
                }}
                onClick={() => exportToExcel(false)}
                disabled={loading || totalCuadradoCount === 0}
              >
                <Download size={14} />
                Descargar Respaldo Completo (ZIP · {totalCuadradoCount} reg.)
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', width: '100%' }}>
              <button
                className="btn btn-success w-full"
                style={{ padding: '1.25rem', fontSize: '1rem' }}
                onClick={() => exportToExcel(false)}
                disabled={loading || totalCuadradoCount === 0}
              >
                <Download size={20} />
                Descargar Respaldo Completo (ZIP · {totalCuadradoCount} reg.)
              </button>
              <button
                className="btn btn-ghost w-full"
                style={{ padding: '0.8rem 1rem', fontSize: '0.9rem', borderColor: 'rgba(255,255,255,0.08)', color: 'var(--text-3)', background: 'rgba(255,255,255,0.02)' }}
                onClick={() => exportToExcel(false, true)}
                disabled={loading || totalUploadedCount === 0}
              >
                <Download size={16} />
                Descargar Todo (ZIP · {totalUploadedCount} reg.)
              </button>
            </div>
          )}
        </div>

        {/* Cuadre Diario (Día a Día) */}
        <div className="card animate-in" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.25rem' }}>
            <Clock size={16} color="var(--neon-green)" />
            <span style={{ fontSize: '0.8rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Cuadre Diario (Validados)</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '180px', overflowY: 'auto' }}>
            {dailyBreakdown.length === 0 ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-3)', textAlign: 'center', padding: '1rem' }}>No hay registros validados</div>
            ) : (
              dailyBreakdown.map(item => (
                <div key={item.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.5rem', background: 'rgba(255,255,255,0.02)', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.03)' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-2)' }}>
                    {format(new Date(item.date + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })}
                  </span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--neon-green)' }}>
                    {money(item.total)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Transactions list */}
      <div className="section-header">
        <span className="section-title">Resultados ({filtered.length})</span>
        <span className="text-muted text-xs">Filtros aplicados</span>
      </div>

      <div className={viewMode === 'grid' ? 'grid-view' : 'list-view'}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
            <AlertCircle size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <p>No se encontraron registros con estos filtros</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '1rem' }}>
            {filtered.map(c => (
              <div key={c.id} className="card animate-in" style={{ padding: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ position: 'relative', height: '180px', borderRadius: 'var(--radius-sm)', overflow: 'hidden', background: '#000' }}>
                  {c.file_url ? (
                    c.file_url.includes('pdf') ? (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--neon-blue)' }}>📄 PDF</div>
                    ) : (
                      <img src={c.file_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    )
                  ) : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>Sin foto</div>}
                  <a href={c.file_url} target="_blank" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 2 }} />
                </div>
                <div style={{ padding: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.auxiliar_name}>{c.auxiliar_name}</div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-3)' }}>{money(c.valor)} · {c.empresa || 'GEN'}</div>
                  </div>
                  <button 
                    onClick={() => handleDelete(c.id)}
                    className="btn btn-ghost"
                    title="Eliminar consignación"
                    style={{ padding: '4px', height: 'auto', minWidth: 'auto', border: 'none', color: 'var(--neon-red)', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="card">
            {filtered.slice(0, 50).map(c => (
              <div key={c.id} className="consign-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div className="consign-icon" style={{ background: `${BANCO_COLORS[c.banco] || '#4f8eff'}18`, flexShrink: 0 }}>
                    <Building2 size={18} color={BANCO_COLORS[c.banco] || 'var(--neon-blue)'} />
                  </div>
                  <div className="consign-info" style={{ flex: 1 }}>
                    <div className="consign-name">{c.auxiliar_name}</div>
                    <div className="consign-meta">{c.banco} · #{c.numero_comprobante} · {format(new Date(c.fecha), "d MMM, h:mm a", { locale: es })}</div>
                    {c.estado === 'Validado' && c.cajera_name && (
                      <div style={{ fontSize: '0.65rem', color: 'var(--neon-green)', fontWeight: 600, marginTop: '2px' }}>
                        Validado por: {c.cajera_name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem', flexShrink: 0 }}>
                    <span className="consign-amount">{money(c.valor)}</span>
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.6rem', padding: '2px 6px', borderRadius: '4px', background: c.empresa === 'ALPINA' ? 'rgba(79,142,255,0.15)' : 'rgba(255,159,28,0.15)', color: c.empresa === 'ALPINA' ? 'var(--neon-blue)' : 'var(--neon-orange)', fontWeight: 800 }}>{c.empresa || 'GENERAL'}</span>
                      <span className={`badge ${badgeClass(c.estado)}`}>{c.estado}</span>
                      <button 
                        onClick={() => handleDelete(c.id)}
                        className="btn btn-ghost"
                        title="Eliminar consignación"
                        style={{ padding: '2px', height: 'auto', minWidth: 'auto', border: 'none', color: 'var(--neon-red)', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                    {c.motivo_rechazo && (
                      <span style={{ fontSize: '0.62rem', color: 'var(--neon-red)', maxWidth: 120, textAlign: 'right' }}>{c.motivo_rechazo}</span>
                    )}
                  </div>
                </div>
                {/* Imagen del comprobante */}
                {c.file_url && (
                  c.file_url.includes('pdf') ? (
                    <a
                      href={c.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-sm)',
                        background: 'rgba(79,142,255,0.1)', border: '1px solid rgba(79,142,255,0.25)',
                        color: 'var(--neon-blue)', fontSize: '0.75rem', fontWeight: 700,
                        textDecoration: 'none', width: 'fit-content'
                      }}
                    >
                      📄 Ver PDF del comprobante
                    </a>
                  ) : (
                    <a href={c.file_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                      <img
                        src={c.file_url}
                        alt="Comprobante"
                        style={{
                          width: '100%',
                          maxHeight: '220px',
                          objectFit: 'contain',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border)',
                          background: '#000',
                          cursor: 'zoom-in'
                        }}
                      />
                      <span style={{ fontSize: '0.65rem', color: 'var(--text-3)', marginTop: '0.25rem', display: 'block' }}>
                        🔍 Clic para ver en tamaño completo
                      </span>
                    </a>
                  )
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
