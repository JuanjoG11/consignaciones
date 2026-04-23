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
};

const AdminPanel = ({ user }) => {
  const [consignaciones, setConsignaciones] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const totalValidado = consignaciones.filter(c => c.estado === 'Validado').reduce((a, b) => a + b.valor, 0);
  const pendientesCount = consignaciones.filter(c => c.estado === 'Pendiente').length;
  const rechazados = consignaciones.filter(c => c.estado === 'Rechazado').length;

  const byBank = consignaciones.filter(c => c.estado === 'Validado').reduce((acc, c) => {
    acc[c.banco] = (acc[c.banco] || 0) + c.valor;
    return acc;
  }, {});
  const topBank = Object.entries(byBank).sort((a, b) => b[1] - a[1])[0] || ['—', 0];

  const badgeClass = (e) => e === 'Pendiente' ? 'badge-pending' : e === 'Validado' ? 'badge-valid' : 'badge-rejected';

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
            disabled={loading || consignaciones.length === 0}
          >
            <Download size={20} />
            Descargar Reporte Consolidado
          </button>
        </div>
      </div>

      {/* Transactions list */}
      <div className="section-header">
        <span className="section-title">Últimas Transacciones</span>
      </div>

      <div className="card">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <div className="spinner" />
          </div>
        ) : consignaciones.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-2)' }}>
            <AlertCircle size={32} style={{ marginBottom: '0.75rem', opacity: 0.4 }} />
            <p>Sin registros aún</p>
          </div>
        ) : (
          consignaciones.slice(0, 20).map(c => (
            <div key={c.id} className="consign-item">
              <div className="consign-icon" style={{ background: `${BANCO_COLORS[c.banco] || '#4f8eff'}18` }}>
                <Building2 size={18} color={BANCO_COLORS[c.banco] || 'var(--neon-blue)'} />
              </div>
              <div className="consign-info">
                <div className="consign-name">{c.auxiliar_name}</div>
                <div className="consign-meta">{c.banco} · {format(new Date(c.fecha), "d MMM", { locale: es })}</div>
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
