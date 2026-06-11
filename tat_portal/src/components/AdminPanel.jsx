import React, { useState, useEffect } from 'react';
import { Download, TrendingUp, Clock, Building2, ListChecks, CheckCircle2, XCircle, AlertCircle, Search, Filter, LayoutGrid, List, Trash2 } from 'lucide-react';
import { mockDB } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import toast from 'react-hot-toast';

const money = (n) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

const KNOWN_BANCOS_TAT = ['Bancolombia TAT 4247', 'DAVIVIENDA TAT 8283', 'Buzon Atlas', 'Gasto', 'Retención'];

const AdminPanel = ({ user }) => {
	const [consignaciones, setConsignaciones] = useState([]);
	const [loading, setLoading] = useState(true);
	const [search, setSearch]   = useState('');
	const [dateRange, setDateRange] = useState({ start: '', end: '' });
	const [empresaFilter, setEmpresaFilter] = useState('');
	const [cajeraFilter, setCajeraFilter] = useState('');
	const [bancoFilter, setBancoFilter] = useState('');
	const [zipByBank, setZipByBank] = useState(false);
	const [viewMode, setViewMode] = useState('list');
	const [showFilters, setShowFilters] = useState(false);

	const fetchConsignaciones = async (silent = false) => {
		if (!silent) setLoading(true);
		const data = await mockDB.getConsignaciones();
		// Asegurar que este panel admin solo vea registros de TAT
		const tatOnly = (data || []).filter(d => d.empresa === 'TAT' || d.empresa === undefined && d.auxiliar_id && String(d.auxiliar_id).startsWith('aux_'));
		setConsignaciones(tatOnly);
		if (!silent) setLoading(false);
	};

	const handleDelete = async (id) => {
		if (!window.confirm('¿Estás seguro de que deseas eliminar permanentemente esta consignación?')) return;
		const tid = toast.loading('Eliminando consignación...');
		try { await mockDB.deleteConsignacion(id); toast.success('Consignación eliminada 🗑️', { id: tid }); fetchConsignaciones(true); } catch (e) { toast.error('Error al eliminar', { id: tid }); }
	};

	useEffect(() => { fetchConsignaciones(); const interval = setInterval(() => fetchConsignaciones(true), 5000); return () => clearInterval(interval); }, []);

	const exportToExcel = async (onlyFiltered = false, includeAll = false) => {
		let listToExport;
		if (includeAll) listToExport = onlyFiltered ? filtered.filter(c => c.file_url) : consignaciones.filter(c => c.file_url);
		else if (onlyFiltered) listToExport = filtered.filter(c => String(c.estado || '').trim().toLowerCase() === 'cuadrado');
		else listToExport = consignaciones.filter(c => String(c.estado || '').trim().toLowerCase() === 'cuadrado');
		if (listToExport.length === 0) return;
		const tid = toast.loading('Generando respaldo (ZIP)...');
		try {
			const zip = new JSZip();
			// Root folder explicit para identificar como TAT
			const rootFolder = zip.folder('TAT_comprobantes');
			const photosFolder = rootFolder.folder('comprobantes_por_fecha');
			const data = listToExport.map(c => ({ Fecha: format(new Date(c.fecha), 'yyyy-MM-dd HH:mm'), Auxiliar: c.auxiliar_name, Banco: c.banco, Valor: c.valor, Comprobante: c.numero_comprobante, Estado: c.estado, Motivo_Rechazo: c.motivo_rechazo || '', Carpeta_Local: format(new Date(c.fecha), 'yyyy-MM-dd') }));
			const ws = XLSX.utils.json_to_sheet(data);
			const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Consignaciones');
			const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }); zip.file(`Reporte_Consignaciones.xlsx`, excelBuffer);
			const downloadPromises = listToExport.map(async (c) => { if (!c.file_url) return; try { const response = await fetch(c.file_url); const blob = await response.blob(); const dateStr = format(new Date(c.fecha), 'yyyy-MM-dd'); let destinationFolder = photosFolder.folder(dateStr); const ext = c.file_url.split('.').pop().split('?')[0] || 'png'; const safeName = `${c.auxiliar_name.replace(/\s+/g,'_')}_${c.banco.replace(/\s+/g,'_')}_${c.numero_comprobante}_${c.valor}.${ext}`; destinationFolder.file(safeName, blob); } catch (err) { console.error(err); } });
			await Promise.all(downloadPromises);
				const content = await zip.generateAsync({ type: 'blob' }); saveAs(content, `Respaldo_TAT_Consignaciones_${format(new Date(), 'yyyy-MM-dd_HH-mm-ss')}.zip`);
			toast.success('¡Respaldo ZIP descargado! 📂', { id: tid });
		} catch (err) { console.error(err); toast.error('Error al generar el respaldo', { id: tid }); }
	};

	const filtered = consignaciones.filter(c => {
		const s = search.trim(); let okSearch = true;
		if (s) { const auxName = (c.auxiliar_name || '').toLowerCase(); const comprobante = String(c.numero_comprobante || ''); const valorStr = String(c.valor != null ? c.valor : ''); const sLower = s.toLowerCase(); const sNum = Number(s); okSearch = auxName.includes(sLower) || comprobante.includes(s) || valorStr.includes(s) || (!isNaN(sNum) && c.valor != null && Math.abs(c.valor - sNum) < 0.01); }
		const dateStr = c.fecha ? c.fecha.substring(0,10) : ''; const okStart = dateRange.start ? dateStr >= dateRange.start : true; const okEnd = dateRange.end ? dateStr <= dateRange.end : true; const okBanco = bancoFilter ? (c.banco && c.banco.trim().toLowerCase() === bancoFilter.trim().toLowerCase()) : true; const okEmpresa = empresaFilter ? c.empresa === empresaFilter : true; const okCajera = cajeraFilter ? c.cajera_name === cajeraFilter : true;
		return okSearch && okStart && okEnd && okBanco && okEmpresa && okCajera;
	});

	// Mostrar total de 'Validado' sobre todas las consignaciones TAT (no solo el filtro de búsqueda)
	const totalValidado = consignaciones.filter(c => String(c.estado || '').trim().toLowerCase() === 'validado').reduce((a,b)=>a + (Number(b.valor) || 0),0);
	const heroTotal = totalValidado;

	return (
		<div className="page animate-in">
			<div className="hero-card">
				<div className="hero-label">🛡️ Panel Administrativo (TAT)</div>
				<div className="hero-value">{money(heroTotal)}</div>
				<div className="hero-sub">{consignaciones.length} registros</div>
			</div>

			<div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
				<div className="search-wrap" style={{ flex: 1 }}>
					<Search size={16} className="search-icon" />
					<input type="text" className="form-control" placeholder="Buscar por auxiliar, comprobante o valor..." value={search} onChange={e=>setSearch(e.target.value)} />
				</div>
				<button className="btn btn-ghost" onClick={()=>setShowFilters(!showFilters)}><Filter size={16} />{showFilters ? ' Ocultar' : ' Filtros'}</button>
			</div>

			{showFilters && (
				<div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
					<div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:'1rem' }}>
						<div className="form-group">
							<label className="form-label">Desde</label>
							<input type="date" className="form-control" value={dateRange.start} onChange={e=>setDateRange(prev=>({...prev,start:e.target.value}))} />
						</div>
						<div className="form-group">
							<label className="form-label">Hasta</label>
							<input type="date" className="form-control" value={dateRange.end} onChange={e=>setDateRange(prev=>({...prev,end:e.target.value}))} />
						</div>
						<div className="form-group">
							<label className="form-label">Banco</label>
							<select className="form-control" value={bancoFilter} onChange={e=>setBancoFilter(e.target.value)}>
								<option value="">Todos los Bancos</option>
								{[...new Set([...consignaciones.map(c=>c.banco).filter(Boolean), ...KNOWN_BANCOS_TAT])].sort().map(b=><option key={b} value={b}>{b}</option>)}
							</select>
						</div>
						<div className="form-group">
							<label className="form-label">Cajera</label>
							<select className="form-control" value={cajeraFilter} onChange={e=>setCajeraFilter(e.target.value)}>
								<option value="">Todas</option>
								{[...new Set(consignaciones.map(c=>c.cajera_name).filter(Boolean))].map(name=><option key={name} value={name}>{name}</option>)}
							</select>
						</div>
						<div style={{ display:'flex', alignItems:'flex-end', gap:'0.5rem' }}>
							<button className="btn btn-ghost w-full" onClick={()=>{ setSearch(''); setDateRange({start:'',end:''}); setEmpresaFilter(''); setCajeraFilter(''); setBancoFilter(''); }} >Limpiar Búsqueda</button>
							<button className="btn btn-ghost w-full" onClick={()=>setZipByBank(prev=>!prev)}>{zipByBank?'ZIP por Banco':'ZIP por Fecha'}</button>
						</div>
					</div>
				</div>
			)}

			<div className="card" style={{ marginTop:'1rem' }}>
				<div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
					<div><strong>{filtered.length}</strong> resultados</div>
					<div style={{ display:'flex', gap:'0.5rem' }}>
						<button className="btn btn-primary" onClick={()=>exportToExcel(true,false)}>Exportar Filtrado</button>
						<button className="btn btn-ghost" onClick={()=>exportToExcel(false,true)}>Exportar Fotos (All)</button>
						{user && user.role === 'admin' && (
							<a className="btn btn-primary" href="/tat_portal.zip" download>Descargar Portal TAT (ZIP)</a>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default AdminPanel;