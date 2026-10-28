import React, { useState, useCallback, useEffect } from 'react';
import { FileSearch, Download, RefreshCw } from 'lucide-react';
import { mockDB } from '../lib/supabase';
import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import toast from 'react-hot-toast';

const money = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

// ── Utilidades compartidas ───────────────────────────────────────────────────

/** Normaliza valor colombiano "1.234.567,00" o "$ 1.234.567,00" o "-1.234.567" → número */
const normVal = (str) => {
  if (!str) return NaN;
  let s = String(str).replace(/\s|\$|COP/g, '').trim();
  const neg = s.startsWith('-');
  s = s.replace(/^-/, '');
  // 1.234.567,00 → 1234567
  if (/^\d{1,3}(\.\d{3})*(,\d{1,2})?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  // 1,234,567.00 → 1234567
  else if (/^\d{1,3}(,\d{3})+(\.\d{1,2})?$/.test(s)) s = s.replace(/,/g, '');
  const n = parseFloat(s);
  return neg ? -n : n;
};

/** Parsea fecha DD/MM/YYYY, M/D/YYYY, YYYY-MM-DD o "1-sep-26" → Date | null */
const parseFecha = (str) => {
  if (!str) return null;
  str = str.trim();
  // DD/MM/YYYY o D/M/YYYY
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2] - 1, +m[1]);
  // M/D/YYYY (americano) — solo si mes ≤ 12 y día ≤ 31
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return new Date(+m[3], +m[1] - 1, +m[2]);
  // YYYY-MM-DD
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  // "1-sep-26"
  const MESES = { jan:0,feb:1,mar:2,apr:3,may:4,jun:5,jul:6,aug:7,sep:8,oct:9,nov:10,dec:11,
                  ene:0,abr:3,ago:7 };
  m = str.toLowerCase().match(/^(\d{1,2})[-\s]([a-z]{3})[-\s](\d{2,4})$/);
  if (m && MESES[m[2]] !== undefined)
    return new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], MESES[m[2]], +m[1]);
  return null;
};

/** Construye índices de búsqueda sobre las consignaciones */
const buildIndices = (consignaciones) => {
  const porValor = {}, porCedula = {}, porComprobante = {};
  for (const c of consignaciones) {
    const v = String(Math.round(Number(c.valor)));
    if (!porValor[v]) porValor[v] = [];
    porValor[v].push(c);

    const ced = c.auxiliar_id ? String(c.auxiliar_id).replace(/^aux_/, '').replace(/_.*$/, '') : '';
    if (ced) { if (!porCedula[ced]) porCedula[ced] = []; porCedula[ced].push(c); }

    const k = String(c.numero_comprobante || '').trim();
    if (k) porComprobante[k] = c;
  }
  return { porValor, porCedula, porComprobante };
};

/** Cruce estándar: comprobante exacto → cédula+valor → valor+fecha (solo si permitido) */
const cruzar = ({ comprobante, cedula, valor, fechaDate, permitirSoloValor = true }, { porValor, porCedula, porComprobante }) => {
  const vKey = String(Math.round(valor));

  // 1. Comprobante exacto
  if (comprobante && porComprobante[comprobante]) {
    const match = porComprobante[comprobante];
    const vr = Number(match.valor);
    const dif = Math.abs(vr - valor);
    return { estado: dif <= Math.max(500, vr * 0.01) ? 'ok' : 'valor_diferente', registro: match, valorRegistrado: vr, diferencia: dif, metodo: 'comprobante exacto' };
  }

  // 2. Cédula + valor (con desempate por fecha)
  const cands = (cedula && porCedula[cedula]) ? porCedula[cedula] : [];
  if (cands.length > 0) {
    const exactos = cands.filter(c => Math.abs(Number(c.valor) - valor) <= Math.max(500, Number(c.valor) * 0.005));
    if (exactos.length >= 1) {
      const match = exactos.length === 1 ? exactos[0] : (fechaDate
        ? exactos.reduce((a, b) => Math.abs(new Date(a.fecha) - fechaDate) <= Math.abs(new Date(b.fecha) - fechaDate) ? a : b)
        : exactos[0]);
      const vr = Number(match.valor);
      return { estado: 'ok', registro: match, valorRegistrado: vr, diferencia: Math.abs(vr - valor), metodo: exactos.length > 1 ? `cédula+valor+fecha (${exactos.length})` : 'cédula+valor' };
    }
    const nearest = cands.reduce((a, b) => Math.abs(Number(a.valor) - valor) <= Math.abs(Number(b.valor) - valor) ? a : b);
    const vr = Number(nearest.valor);
    return { estado: 'valor_diferente', registro: nearest, valorRegistrado: vr, diferencia: Math.abs(vr - valor), metodo: 'cédula (valor ≠)' };
  }

  // 3. Solo valor (+fecha desempate) — solo si está permitido explícitamente
  if (!permitirSoloValor) {
    return { estado: 'no_encontrado', registro: null, valorRegistrado: undefined, diferencia: undefined, metodo: 'sin ancla' };
  }
  const pool = porValor[vKey] || [];
  if (pool.length === 0) return { estado: 'no_encontrado', registro: null, valorRegistrado: undefined, diferencia: undefined, metodo: '—' };
  const match = pool.length === 1 ? pool[0] : (fechaDate
    ? pool.reduce((a, b) => Math.abs(new Date(a.fecha) - fechaDate) <= Math.abs(new Date(b.fecha) - fechaDate) ? a : b)
    : pool[0]);
  const vr = Number(match.valor);
  return { estado: 'ok', registro: match, valorRegistrado: vr, diferencia: Math.abs(vr - valor), metodo: pool.length > 1 ? `valor+fecha (${pool.length} coinciden)` : 'valor único' };
};

// ── Tabla de resultados compartida ──────────────────────────────────────────
const TablaResultados = ({ resultados, filtro, setFiltro, onExportar, onExportarPendientes, banco }) => {
  if (!resultados) return null;
  const totalOk   = resultados.filter(r => r.estado === 'ok').length;
  const totalDif  = resultados.filter(r => r.estado === 'valor_diferente').length;
  const totalNo   = resultados.filter(r => r.estado === 'no_encontrado').length;
  const sumaTotal = resultados.reduce((a, b) => a + b.valor, 0);
  const sumaOk    = resultados.filter(r => r.estado === 'ok').reduce((a, b) => a + b.valor, 0);

  const filtradas = resultados.filter(r =>
    filtro === 'todos' ? true :
    filtro === 'ok' ? r.estado === 'ok' :
    filtro === 'diferente' ? r.estado === 'valor_diferente' :
    r.estado === 'no_encontrado'
  );

  return (
    <>
      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
        {[
          { label: `Total ${banco}`, value: resultados.length, color: 'var(--neon-blue)', sub: money(sumaTotal) },
          { label: '✅ Coinciden', value: totalOk, color: 'var(--neon-green)', sub: money(sumaOk) },
          { label: '⚠️ Revisar', value: totalDif, color: 'var(--neon-yellow)', sub: '' },
          { label: '❌ No encontradas', value: totalNo, color: 'var(--neon-red)', sub: '' },
        ].map(s => (
          <div key={s.label} className="stat-card animate-in" style={{ margin: 0 }}>
            <div className="stat-card-value" style={{ fontSize: '1.5rem', color: s.color }}>{s.value}</div>
            <div className="stat-card-label" style={{ fontSize: '0.68rem' }}>{s.label}</div>
            {s.sub && <div style={{ fontSize: '0.7rem', color: s.color, fontWeight: 700 }}>{s.sub}</div>}
          </div>
        ))}
      </div>

      {/* Filtros + exportar */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
        {[
          { id: 'todos', label: `Todos (${resultados.length})` },
          { id: 'ok', label: `✅ (${totalOk})` },
          { id: 'diferente', label: `⚠️ (${totalDif})` },
          { id: 'noEncontrado', label: `❌ (${totalNo})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)} style={{
            padding: '0.3rem 0.8rem', borderRadius: 'var(--radius-md)', fontSize: '0.75rem', fontWeight: 700,
            cursor: 'pointer', border: '1px solid',
            borderColor: filtro === f.id ? 'var(--neon-blue)' : 'var(--border)',
            background: filtro === f.id ? 'rgba(79,142,255,0.15)' : 'transparent',
            color: filtro === f.id ? 'var(--neon-blue)' : 'var(--text-3)',
          }}>{f.label}</button>
        ))}
        <button className="btn btn-success" onClick={onExportar} style={{ marginLeft: 'auto', padding: '0.3rem 0.9rem', fontSize: '0.75rem' }}>
          <Download size={13} /> Exportar .xlsx
        </button>
        {totalNo > 0 && (
          <button className="btn btn-ghost" onClick={onExportarPendientes} style={{ padding: '0.3rem 0.9rem', fontSize: '0.75rem', borderColor: 'var(--neon-red)', color: 'var(--neon-red)' }}>
            <Download size={13} /> ❌ Exportar No Encontradas ({totalNo})
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)' }}>
                {['Estado', 'Fecha', 'Auxiliar / Ref', 'Comprobante App', 'Valor Extracto', 'Valor Registrado', 'Diferencia', 'Auxiliar App', 'Banco App', 'Método'].map(h => (
                  <th key={h} style={{ padding: '0.65rem', textAlign: 'left', fontWeight: 800, fontSize: '0.64rem', textTransform: 'uppercase', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0
                ? <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-3)' }}>Sin resultados</td></tr>
                : filtradas.map((r, i) => {
                  const col = r.estado === 'ok' ? 'var(--neon-green)' : r.estado === 'valor_diferente' ? 'var(--neon-yellow)' : 'var(--neon-red)';
                  const bg  = r.estado === 'ok' ? 'rgba(0,229,160,0.08)' : r.estado === 'valor_diferente' ? 'rgba(255,209,102,0.08)' : 'rgba(255,77,109,0.08)';
                  const ico = r.estado === 'ok' ? '✅' : r.estado === 'valor_diferente' ? '⚠️' : '❌';
                  const lbl = r.estado === 'ok' ? 'Coincide' : r.estado === 'valor_diferente' ? 'Revisar' : 'No encontrada';
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent' }}>
                      <td style={{ padding: '0.55rem 0.65rem' }}>
                        <span style={{ display: 'inline-flex', gap: 4, padding: '2px 7px', borderRadius: 5, background: bg, color: col, fontWeight: 700, fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{ico} {lbl}</span>
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', color: 'var(--text-3)', fontSize: '0.68rem', whiteSpace: 'nowrap' }}>{r.fecha || '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', color: 'var(--text-2)', fontSize: '0.68rem', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.refDisplay}>{r.refDisplay || '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-1)', fontSize: '0.72rem' }}>
                        {r.registro
                          ? <a href={r.registro.file_url || '#'} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--neon-blue)', textDecoration: 'none' }}>{r.comprobante || '—'}</a>
                          : (r.comprobante || '—')}
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', fontWeight: 700, whiteSpace: 'nowrap' }}>{money(r.valor)}</td>
                      <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap', color: r.registro ? (r.estado === 'ok' ? 'var(--neon-green)' : 'var(--neon-yellow)') : 'var(--text-3)' }}>
                        {r.registro ? money(r.valorRegistrado) : '—'}
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', whiteSpace: 'nowrap', color: r.diferencia > 0 ? 'var(--neon-yellow)' : 'var(--text-3)' }}>
                        {r.diferencia !== undefined ? (r.diferencia === 0 ? '—' : money(r.diferencia)) : '—'}
                      </td>
                      <td style={{ padding: '0.55rem 0.65rem', color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: '0.7rem' }}>{r.registro?.auxiliar_name ?? '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', color: 'var(--text-2)', whiteSpace: 'nowrap', fontSize: '0.7rem' }}>{r.registro?.banco ?? '—'}</td>
                      <td style={{ padding: '0.55rem 0.65rem', fontSize: '0.65rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{r.metodo || '—'}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

// ── Exportar a Excel ─────────────────────────────────────────────────────────
const exportarXlsx = (resultados, banco, soloNoEncontradas = false) => {
  if (!resultados) return;
  const datos = soloNoEncontradas
    ? resultados.filter(r => r.estado === 'no_encontrado')
    : resultados;
  const rows = datos.map(r => ({
    Banco_Extracto: banco,
    Fecha_Extracto: r.fecha || '',
    Descripcion: r.descripcion || '',
    Ref_Extracto: r.refDisplay || '',
    Valor_Extracto: r.valor,
    Estado: r.estado === 'ok' ? 'COINCIDE' : r.estado === 'valor_diferente' ? 'REVISAR' : 'NO REGISTRADO EN APP',
    Valor_Registrado: r.valorRegistrado ?? '',
    Diferencia: r.diferencia ?? '',
    Auxiliar: r.registro?.auxiliar_name ?? '',
    Banco_App: r.registro?.banco ?? '',
    Estado_Consignacion: r.registro?.estado ?? '',
    Metodo_Cruce: r.metodo || '',
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `${banco}`);
  const sufijo = soloNoEncontradas ? '_NO_REGISTRADAS' : '';
  XLSX.writeFile(wb, `Validacion_${banco}${sufijo}_${format(new Date(), 'yyyy-MM-dd_HH-mm')}.xlsx`);
};

// ════════════════════════════════════════════════════════════════════════════
// PANEL BANCOLOMBIA
//
// Formato real del portal (columnas detectadas por contenido, no por posición):
//   FECHA | DESCRIPCION | CIUDAD | REF1 | REF2 | REF3 | VALOR | [secondary-menu] | [extras...]
//
// Estrategia de parseo:
//   - Col 0 = fecha (patrón d-mes-aa o dd/mm/yyyy)
//   - Valor = primera columna que sea un número con posible punto de miles / signo
//   - REFs = columnas entre descripción y valor que contienen dígitos (o "- -")
//   - Se ignoran columnas "secondary-menu" y basura al final
//
// Dos tipos de ingresos relevantes:
//   1. "Consig local referen efectivo" / "Consig nal referencia efectivo"
//      → REF1 es NIT de la cuenta destino (900973932, etc.) — cruzar por valor+fecha
//   2. "Transferencia desde nequi" / "Pago interbanc" / "Pago de prov" con auxiliar
//      → REF1 puede ser cédula del auxiliar o nombre "Nombre apellido 1234"
//      → extraer cédula del nombre si tiene 4 dígitos al final, o usar REF1 si es numérico
// ════════════════════════════════════════════════════════════════════════════
const PanelBancolombia = ({ consignaciones }) => {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const indices = React.useMemo(() => buildIndices(consignaciones), [consignaciones]);

  const analizar = useCallback(() => {
    if (!texto.trim()) return;
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const filas = [];
    const vistas = new Set();
    const cedulasConocidas = new Set(Object.keys(indices.porCedula));

    // ── Helpers ──────────────────────────────────────────────────────────────
    // Valor monetario colombiano: tiene punto de miles, coma decimal, signo, o espacios bordeando
    // NO debe confundirse con NITs/cédulas que son dígitos puros sin puntos de miles
    const esValor = (s) => {
      if (!s) return false;
      const t = s.trim();
      // Debe tener al menos un punto (miles) o coma (decimal) O tener signo negativo
      // Descarta números puros tipo "900973932" que son NITs
      const tieneFormato = /[.,]/.test(t) || t.startsWith('-');
      if (!tieneFormato) return false;
      const limpio = t.replace(/\s|\$|COP/g, '');
      const n = normVal(limpio);
      return !isNaN(n);
    };
    // ¿Es una referencia útil (solo dígitos, sin "- -")?
    const esRefNum = (s) => s && s !== '- -' && s !== '-' && /^\d{4,}$/.test(s.trim());
    // ¿Parece fecha de Bancolombia? "1-oct-26", "27-oct-26", "01/10/2026", "1/10/2026"
    // Acepta mayúsculas, minúsculas, guion o barra, año 2 o 4 dígitos
    const esFecha = (s) => {
      if (!s) return false;
      const t = s.trim();
      return (
        /^\d{1,2}-[a-záéíóúA-Z]{3}-\d{2,4}$/.test(t) ||   // 1-oct-26 / 27-OCT-2026
        /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)              // 01/10/2026
      );
    };

    // ── Primera pasada: frecuencia de REFs para detectar NITs destino ────────
    // Un NIT que aparece >5 veces es cuenta propia / cuenta Alpina, no un auxiliar
    const freqRef = {};
    for (const linea of lineas) {
      const cols = linea.split('\t').map(c => c.trim());
      // Encontrar índice del valor (primera col monetaria después de col 1)
      const idxValor = cols.findIndex((c, i) => i >= 2 && esValor(c));
      if (idxValor < 0) continue;
      const v = normVal(cols[idxValor]);
      if (isNaN(v) || v < 1000) continue;
      // REFs son las columnas entre descripción (col 2 aprox) e idxValor
      for (let i = Math.max(2, idxValor - 4); i < idxValor; i++) {
        const r = cols[i]?.trim();
        if (esRefNum(r)) freqRef[r] = (freqRef[r] || 0) + 1;
      }
    }
    const esNitDestino = (ref) => ref && (freqRef[ref] || 0) > 5;

    // ── Segunda pasada: extraer filas relevantes ──────────────────────────────
    for (const linea of lineas) {
      const cols = linea.split('\t').map(c => c.trim());
      if (cols.length < 3) continue;

      // Col 0 debe ser fecha
      if (!esFecha(cols[0])) continue;
      const fecha = cols[0].trim();

      // Buscar columna del valor: primera columna monetaria desde índice 2
      // El valor positivo es ingreso, negativo es egreso — ignoramos egresos
      let idxValor = -1;
      for (let i = 2; i < cols.length; i++) {
        if (esValor(cols[i])) { idxValor = i; break; }
      }
      if (idxValor < 0) continue;

      const valor = normVal(cols[idxValor]);
      if (isNaN(valor) || valor <= 0) continue; // solo ingresos positivos

      // Columnas reales: FECHA | CIUDAD | DESCRIPCION | REF1 | REF2 | REF3 | VALOR | secondary-menu
      // cols[1] = CIUDAD, cols[2] = DESCRIPCION
      const descripcion = cols[2] || cols[1] || '';

      // REFs: todas las columnas entre índice 2 y idxValor que sean numéricas o "- -"
      const refs = [];
      for (let i = 2; i < idxValor; i++) {
        const r = cols[i].trim();
        if (r && r !== '- -' && r !== '-') refs.push(r);
      }

      // ── Detectar cédula y comprobante ────────────────────────────────────
      let cedula = null;
      let comprobante = null;
      let refDisplay = descripcion;

      const esConsigDirecta = /consig.*referen/i.test(descripcion);

      if (esConsigDirecta) {
        // Consignación directa al banco: las REFs son NITs de cuenta destino (900973932, etc.)
        // NO usar como cédula ni comprobante — cruzar solo por valor+fecha
        // El comprobante lo tiene el auxiliar en su recibo físico, no aparece en el extracto
        refDisplay = refs[0] ? `${refs[0]} · ${descripcion}` : descripcion;

      } else if (/nequi|transferencia desde/i.test(descripcion)) {
        // Transferencia Nequi: REF puede ser "Nombre apellido 1234" — los 4 dígitos son
        // los últimos del celular Nequi, NO de la cédula. Solo asignar si REF es cédula exacta.
        for (const r of refs) {
          if (esRefNum(r) && cedulasConocidas.has(r)) { cedula = r; refDisplay = r; break; }
        }

      } else {
        // Otros movimientos (Pago interbanc, Pago de prov, etc.)
        // REF puede ser cédula directa de auxiliar
        for (const r of refs) {
          if (!esRefNum(r)) continue;
          if (cedulasConocidas.has(r) && !esNitDestino(r)) { cedula = r; break; }
          if (!esNitDestino(r) && !comprobante) { comprobante = r; }
        }
        refDisplay = refs.length > 0 ? `${refs[0]} · ${descripcion}` : descripcion;
      }

      // Incluir TODOS los ingresos positivos del extracto.
      // El objetivo es verificar si cada peso que entró al banco está registrado en ConsigControl.
      // Solo excluir egresos (ya filtrados por valor <= 0) y comisiones/impuestos propios del banco.
      const esGastoBanco = /impto gobierno|cobro iva|comision rec|iva comision|cuota manejo|cuota plan canal|servicio pago|servicio por pago/i.test(descripcion);
      if (esGastoBanco) continue;

      // Todo ingreso pasa — cruzar por cédula si se tiene, sino por valor+fecha
      const permitirSoloValor = true;

      const clave = `${fecha}|${valor}|${refs[0] || ''}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      filas.push({ fecha, descripcion, refs, cedula, comprobante, valor, refDisplay });
    }

    if (filas.length === 0) {
      toast.error('No se encontraron movimientos de auxiliares. Verifica que el rango de fechas del validador coincida con el extracto.');
      return;
    }

    const res = filas.map(f => {
      const fechaDate = parseFecha(f.fecha);
      // Lógica de cruce para Bancolombia:
      // - Si tenemos cédula identificada → cruzar cédula+valor (confiable)
      // - Si es consignación directa al banco → cruzar valor+fecha (acotado al día)
      // - Transferencias Nequi sin cédula → no cruzar (sin ancla)
      const esConsigDirecta2 = /consig.*referen/i.test(f.descripcion);
      const tieneCedula = !!f.cedula;
      const cruce = cruzar(
        { comprobante: f.comprobante, cedula: f.cedula, valor: f.valor, fechaDate, permitirSoloValor: true },
        indices
      );
      return {
        ...f,
        ...cruce,
        comprobante: cruce.registro?.numero_comprobante || f.comprobante || f.refs[0] || '—',
        refDisplay: f.refDisplay,
      };
    });

    setResultados(res);
    const ok  = res.filter(r => r.estado === 'ok').length;
    const dif = res.filter(r => r.estado === 'valor_diferente').length;
    const no  = res.filter(r => r.estado === 'no_encontrado').length;
    toast.success(`Bancolombia: ${filas.length} movimientos · ${ok} ✅ · ${dif} ⚠️ · ${no} ❌`);
  }, [texto, indices]);

  return (
    <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'Pega el extracto Bancolombia (copia con Ctrl+A, Ctrl+C desde el portal).\n\nFormato real del portal:\nFECHA\tDESCRIPCION\tCIUDAD\tREF1\tREF2\tREF3\tVALOR\tsecondary-menu\n\nEjemplo:\n27-oct-26\tTransferencia desde nequi\tDosquebradas\tJuan ramirez 9025\t- -\t- -\t 181.473 \tsecondary-menu\n\nSolo se procesan ingresos (valores positivos ≥ $1.000).'}
        style={{ width: '100%', minHeight: 160, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-1)', padding: '0.75rem', lineHeight: 1.6, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button className="btn btn-primary" onClick={analizar} disabled={!texto.trim()} style={{ flex: 1 }}><FileSearch size={15} /> Analizar</button>
        <button className="btn btn-ghost" onClick={() => { setTexto(''); setResultados(null); setFiltro('todos'); }}>Limpiar</button>
      </div>
      {resultados && <div style={{ marginTop: '1rem' }}><TablaResultados resultados={resultados} filtro={filtro} setFiltro={setFiltro} onExportar={() => exportarXlsx(resultados, 'Bancolombia')} onExportarPendientes={() => exportarXlsx(resultados, 'Bancolombia', true)} banco="Bancolombia" /></div>}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// PANEL DAVIVIENDA
// Formato TSV: FECHA | DOC | HORA | VALOR TOTAL | ID ORIGEN | REF1 | REF2 | TERMINAL
// Cruce: DOC como comprobante exacto → ID Origen como cédula + valor → valor + fecha
// ════════════════════════════════════════════════════════════════════════════
const PanelDavivienda = ({ consignaciones }) => {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const indices = React.useMemo(() => buildIndices(consignaciones), [consignaciones]);

  const analizar = useCallback(() => {
    if (!texto.trim()) return;
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const filas = [];
    const vistas = new Set();

    for (const linea of lineas) {
      const cols = linea.split('\t').map(c => c.trim());
      // Formato: FECHA | DOC | HORA | VALOR | ID | REF1 | REF2 | TERMINAL (8 cols)
      // o variantes con menos columnas
      if (cols.length < 4) continue;

      // Intentar detectar columnas por contenido
      // Col 0 = fecha (contiene /)
      // Col 1 = Doc (número)
      // Col 2 = hora (contiene :) o puede faltar
      // Col 3 = Valor (contiene $ o número)
      let fecha = '', doc = '', hora = '', valorRaw = '', idOrigen = '';

      if (cols.length >= 8) {
        // 8 cols estándar
        [fecha, doc, hora, valorRaw, idOrigen] = cols;
      } else if (cols.length >= 4) {
        fecha = cols[0];
        doc = cols[1];
        // cols[2] puede ser hora o valor
        if (cols[2].includes(':') && cols.length >= 5) {
          hora = cols[2]; valorRaw = cols[3]; idOrigen = cols[4] || '';
        } else {
          valorRaw = cols[2]; idOrigen = cols[3] || '';
        }
      }

      const valor = normVal(valorRaw);
      if (isNaN(valor) || valor < 1000) continue; // solo ingresos

      // Doc 99999999 = ajuste de saldo, ignorar
      if (doc === '99999999' || doc === '99999998') continue;

      const clave = `${doc}|${valor}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      // Limpiar cédula del ID Origen (puede venir con apóstrofe o vacío)
      const cedLimpia = idOrigen.replace(/^'/, '').replace(/^0+/, '') || null;
      const esCedula = cedLimpia && /^\d{6,12}$/.test(cedLimpia) && cedLimpia !== '0';

      filas.push({
        fecha, doc, hora, valor,
        cedula: esCedula ? cedLimpia : null,
        refDisplay: `Doc: ${doc}${hora ? ' ' + hora : ''}${esCedula ? ' · ID: ' + cedLimpia : ''}`,
        lineaOriginal: linea,
      });
    }

    if (filas.length === 0) { toast.error('No se encontraron movimientos válidos. Verifica el formato Davivienda.'); return; }

    const res = filas.map(f => {
      const fechaDate = parseFecha(f.fecha);
      // Para Davivienda el Doc es el número que el auxiliar puede haber registrado
      const cruce = cruzar({ comprobante: f.doc, cedula: f.cedula, valor: f.valor, fechaDate }, indices);
      return { ...f, ...cruce, comprobante: cruce.registro?.numero_comprobante || f.doc || '—' };
    });

    setResultados(res);
    const ok = res.filter(r => r.estado === 'ok').length;
    const dif = res.filter(r => r.estado === 'valor_diferente').length;
    const no = res.filter(r => r.estado === 'no_encontrado').length;
    toast.success(`Davivienda: ${ok} ✅ · ${dif} ⚠️ · ${no} ❌`);
  }, [texto, indices]);

  return (
    <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'Pega el extracto Davivienda.\n\nFormato TSV esperado:\nFECHA\tDOC\tHORA\tVALOR TOTAL\tID ORIGEN/DESTINO\tREFERENCIA 1\tREFERENCIA 2\tTERMINAL\n\nEjemplo:\n25/09/2026\t13164740\t13:16:47\t$ 29.388,00\t41870988\t...'}
        style={{ width: '100%', minHeight: 160, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-1)', padding: '0.75rem', lineHeight: 1.6, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button className="btn btn-primary" onClick={analizar} disabled={!texto.trim()} style={{ flex: 1 }}><FileSearch size={15} /> Analizar</button>
        <button className="btn btn-ghost" onClick={() => { setTexto(''); setResultados(null); setFiltro('todos'); }}>Limpiar</button>
      </div>
      {resultados && <div style={{ marginTop: '1rem' }}><TablaResultados resultados={resultados} filtro={filtro} setFiltro={setFiltro} onExportar={() => exportarXlsx(resultados, 'Davivienda')} onExportarPendientes={() => exportarXlsx(resultados, 'Davivienda', true)} banco="Davivienda" /></div>}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// PANEL BUZÓN ATLAS
// Formato TSV: DATE | (vacío) | USER "NOMBRE (V/Tcedula)" | BARCODE | AMOUNT
// Cruce: cédula extraída del User + valor + fecha (muy confiable)
// ════════════════════════════════════════════════════════════════════════════
const PanelBuzon = ({ consignaciones }) => {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const indices = React.useMemo(() => buildIndices(consignaciones), [consignaciones]);

  const analizar = useCallback(() => {
    if (!texto.trim()) return;
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const filas = [];

    for (const linea of lineas) {
      const cols = linea.split('\t').map(c => c.trim());
      // Formato: DATE | (vacío posible) | USER | BARCODE | AMOUNT
      // A veces la col "vacío" no está → 4 cols en lugar de 5
      // Detectamos por: última col = amount (número), anteúltima = barcode (dígitos largos),
      // antes = user (texto con paréntesis), antes = fecha
      if (cols.length < 4) continue;

      // Última columna: amount
      const amountRaw = cols[cols.length - 1];
      const valor = normVal(amountRaw);
      if (isNaN(valor) || valor < 1000) continue;

      // Ignorar la fila "Atlas Recaudo (atlas)" — son totales de bolsa
      if (linea.toLowerCase().includes('atlas recaudo')) continue;

      // Columna user: puede ser cols[2] (5 cols) o cols[1] (4 cols)
      // La reconocemos porque contiene paréntesis con cédula
      const userCol = cols.find(c => /\([VTvt]?\d{6,12}\)/.test(c)) || '';

      // Extraer cédula: "(V1088308341)" o "(T1002576440)" o "(1004669887)"
      const cedulaMatch = userCol.match(/\([VTvt]?(\d{6,12})\)/);
      const cedula = cedulaMatch ? cedulaMatch[1] : null;

      // Nombre limpio (sin la cédula)
      const nombreLimpio = userCol.replace(/\s*\([^)]+\)\s*$/, '').trim();

      // Fecha: cols[0]
      const fecha = cols[0] || '';

      // Barcode: cols[cols.length-2]
      const barcode = cols[cols.length - 2] || '';

      if (!cedula) continue; // sin cédula no podemos cruzar

      filas.push({ fecha, cedula, nombre: nombreLimpio, barcode, valor, refDisplay: `${nombreLimpio} (${cedula})`, lineaOriginal: linea });
    }

    if (filas.length === 0) { toast.error('No se encontraron filas con cédula válida. Verifica el formato Buzón Atlas.'); return; }

    const res = filas.map(f => {
      const fechaDate = parseFecha(f.fecha);
      const cruce = cruzar({ comprobante: null, cedula: f.cedula, valor: f.valor, fechaDate }, indices);
      return { ...f, ...cruce, comprobante: cruce.registro?.numero_comprobante || '—' };
    });

    setResultados(res);
    const ok = res.filter(r => r.estado === 'ok').length;
    const dif = res.filter(r => r.estado === 'valor_diferente').length;
    const no = res.filter(r => r.estado === 'no_encontrado').length;
    toast.success(`Buzón Atlas: ${ok} ✅ · ${dif} ⚠️ · ${no} ❌`);
  }, [texto, indices]);

  return (
    <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'Pega el reporte Buzón Atlas.\n\nFormato TSV esperado:\nDATE\t\tUSER\tNOTE BAG BARCODE\tAMOUNT\n\nEjemplo:\n9/1/2026 13:14\t\tJUAN DAVID QUINTERO GRAJALES (V1088308341)\t9999900006843\t5.045.000,00\n\nLa cédula se extrae del campo User (entre paréntesis).'}
        style={{ width: '100%', minHeight: 160, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-1)', padding: '0.75rem', lineHeight: 1.6, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button className="btn btn-primary" onClick={analizar} disabled={!texto.trim()} style={{ flex: 1 }}><FileSearch size={15} /> Analizar</button>
        <button className="btn btn-ghost" onClick={() => { setTexto(''); setResultados(null); setFiltro('todos'); }}>Limpiar</button>
      </div>
      {resultados && <div style={{ marginTop: '1rem' }}><TablaResultados resultados={resultados} filtro={filtro} setFiltro={setFiltro} onExportar={() => exportarXlsx(resultados, 'Buzon_Atlas')} onExportarPendientes={() => exportarXlsx(resultados, 'Buzon_Atlas', true)} banco="Buzón Atlas" /></div>}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// PANEL ZENÚ SAP
// Formato TSV: NRO DOC | REFERENCIA | TIPO | FECHA | VENCIMIENTO | DÍAS | VALOR | MONEDA
// Solo se toman los "Recaudos en Bancos" (valores negativos = recaudos aplicados)
// Cruce: Nro. Documento como numero_comprobante → valor + fecha
// ════════════════════════════════════════════════════════════════════════════
const PanelZenu = ({ consignaciones }) => {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState(null);
  const [filtro, setFiltro] = useState('todos');

  const indices = React.useMemo(() => buildIndices(consignaciones), [consignaciones]);

  const analizar = useCallback(() => {
    if (!texto.trim()) return;
    const lineas = texto.split('\n').map(l => l.trim()).filter(Boolean);
    const filas = [];
    const vistas = new Set();

    for (const linea of lineas) {
      const cols = linea.split('\t').map(c => c.trim());
      if (cols.length < 6) continue;

      // Cols: NRO DOC | REFERENCIA | TIPO | FECHA | VENCIMIENTO | DÍAS | VALOR | MONEDA
      const nroDoc    = cols[0];
      const referencia = cols[1];
      const tipo      = cols[2];
      const fecha     = cols[3];
      // Valor puede ser col 6 (8 cols) o col 5 (7 cols) — buscamos la col con $
      const valorRaw  = cols.find(c => c.includes('$') || /^-?\$?[\d.,]+$/.test(c.replace(/\s/,''))) || cols[cols.length - 2];

      const valorBruto = normVal(valorRaw);
      // En SAP los recaudos vienen como negativos (aplican contra facturas)
      // Tomamos el valor absoluto para comparar contra lo registrado
      const valor = Math.abs(valorBruto);
      if (isNaN(valor) || valor < 1000) continue;

      // Solo procesar Recaudos (ignorar Facturas y Notas Crédito)
      if (!tipo.toLowerCase().includes('recaud')) continue;

      if (vistas.has(nroDoc)) continue;
      vistas.add(nroDoc);

      filas.push({
        fecha, nroDoc, referencia, tipo, valor,
        refDisplay: `${nroDoc} · ${referencia}`,
        lineaOriginal: linea,
      });
    }

    if (filas.length === 0) { toast.error('No se encontraron recaudos válidos. Verifica el formato Zenú SAP (solo filas "Recaudos en Bancos").'); return; }

    const res = filas.map(f => {
      const fechaDate = parseFecha(f.fecha);
      // Nro. Documento SAP es el que los auxiliares registran como comprobante en la app
      const cruce = cruzar({ comprobante: f.nroDoc, cedula: null, valor: f.valor, fechaDate }, indices);
      return { ...f, ...cruce, comprobante: cruce.registro?.numero_comprobante || f.nroDoc || '—' };
    });

    setResultados(res);
    const ok = res.filter(r => r.estado === 'ok').length;
    const dif = res.filter(r => r.estado === 'valor_diferente').length;
    const no = res.filter(r => r.estado === 'no_encontrado').length;
    toast.success(`Zenú SAP: ${ok} ✅ · ${dif} ⚠️ · ${no} ❌`);
  }, [texto, indices]);

  return (
    <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'Pega el reporte de cartera Zenú SAP.\n\nFormato TSV esperado:\nNÚMERO DE DOCUMENTO\tREFERENCIA\tTIPO\tFECHA CREACIÓN\tVENCIMIENTO\tDÍAS VENCIDOS\tVALOR\tMONEDA\n\nSolo se procesan filas tipo "Recaudos en Bancos". Las facturas se ignoran.'}
        style={{ width: '100%', minHeight: 160, resize: 'vertical', fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-1)', padding: '0.75rem', lineHeight: 1.6, boxSizing: 'border-box' }}
      />
      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
        <button className="btn btn-primary" onClick={analizar} disabled={!texto.trim()} style={{ flex: 1 }}><FileSearch size={15} /> Analizar</button>
        <button className="btn btn-ghost" onClick={() => { setTexto(''); setResultados(null); setFiltro('todos'); }}>Limpiar</button>
      </div>
      {resultados && <div style={{ marginTop: '1rem' }}><TablaResultados resultados={resultados} filtro={filtro} setFiltro={setFiltro} onExportar={() => exportarXlsx(resultados, 'Zenu_SAP')} onExportarPendientes={() => exportarXlsx(resultados, 'Zenu_SAP', true)} banco="Zenú SAP" /></div>}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL EXPORTADO
// Autónomo: tiene su propio selector de fechas y carga sus propias consignaciones
// ════════════════════════════════════════════════════════════════════════════
const BANCOS = [
  { id: 'bancolombia', label: '🟡 Bancolombia', color: '#ffd166' },
  { id: 'davivienda',  label: '🔴 Davivienda',  color: '#ff4d6d' },
  { id: 'buzon',       label: '📬 Buzón Atlas',  color: '#00e5a0' },
  { id: 'zenu',        label: '🟣 Zenú SAP',     color: '#9b5cff' },
];

const getDefaultRange = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const days = new Date(y, now.getMonth() + 1, 0).getDate();
  return { start: `${y}-${m}-01`, end: `${y}-${m}-${days}` };
};

const ValidadorExtracto = ({ user, consignacionesAdmin }) => {
  const [banco, setBanco] = useState('bancolombia');

  // Rango propio — inicia en el mes actual
  const [rangeDraft, setRangeDraft] = useState(getDefaultRange);
  const [rangeActive, setRangeActive] = useState(getDefaultRange);

  // Consignaciones: usa las del admin si están disponibles, sino carga propias
  const [consignacionesPropias, setConsignacionesPropias] = useState([]);
  const [loading, setLoading] = useState(false);

  const consignaciones = (consignacionesAdmin && consignacionesAdmin.length > 0)
    ? consignacionesAdmin
    : consignacionesPropias;

  const cargar = useCallback(async (range) => {
    // Solo cargar si no tenemos datos del admin
    if (consignacionesAdmin && consignacionesAdmin.length > 0) return;
    setLoading(true);
    const data = await mockDB.getConsignaciones({ dateFrom: range.start, dateTo: range.end });
    let filtered = data || [];
    if (user?.empresa === 'TAT') filtered = filtered.filter(d => d.empresa === 'TAT');
    else if (user?.role === 'admin' && user?.empresa !== 'TAT') filtered = filtered.filter(d => d.empresa !== 'TAT');
    setConsignacionesPropias(filtered);
    setLoading(false);
  }, [user, consignacionesAdmin]);

  useEffect(() => { cargar(rangeActive); }, []);

  const aplicar = () => {
    setRangeActive(rangeDraft);
    cargar(rangeDraft);
  };

  const rangoLabel = `${rangeActive.start} → ${rangeActive.end}`;
  const dirty = rangeDraft.start !== rangeActive.start || rangeDraft.end !== rangeActive.end;

  return (
    <div className="animate-in">
      {/* ── Selector de fechas propio ──────────────────────────────────── */}
      <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '1.25rem', background: 'rgba(79,142,255,0.06)', border: '1px solid rgba(79,142,255,0.2)' }}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.72rem' }}>Desde</label>
            <input
              type="date"
              className="form-control"
              style={{ width: 160, ...(dirty && rangeDraft.start !== rangeActive.start ? { borderColor: 'var(--neon-orange)' } : {}) }}
              value={rangeDraft.start}
              onChange={e => setRangeDraft(p => ({ ...p, start: e.target.value }))}
            />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" style={{ fontSize: '0.72rem' }}>Hasta</label>
            <input
              type="date"
              className="form-control"
              style={{ width: 160, ...(dirty && rangeDraft.end !== rangeActive.end ? { borderColor: 'var(--neon-orange)' } : {}) }}
              value={rangeDraft.end}
              onChange={e => setRangeDraft(p => ({ ...p, end: e.target.value }))}
            />
          </div>
          <button
            className="btn btn-primary"
            onClick={aplicar}
            disabled={loading || !dirty}
            style={{ opacity: dirty ? 1 : 0.45, display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            {loading ? <><span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> Cargando…</> : <><RefreshCw size={14} /> Cargar período</>}
          </button>
          {/* Accesos rápidos de mes */}
          {[-1, 0].map(offset => {
            const d = new Date();
            d.setMonth(d.getMonth() + offset);
            const y = d.getFullYear();
            const m = d.getMonth();
            const mStr = String(m + 1).padStart(2, '0');
            const days = new Date(y, m + 1, 0).getDate();
            const label = d.toLocaleDateString('es-CO', { month: 'short' }).replace(/^\w/, c => c.toUpperCase());
            const r = { start: `${y}-${mStr}-01`, end: `${y}-${mStr}-${days}` };
            const isActive = rangeActive.start === r.start && rangeActive.end === r.end;
            return (
              <button key={offset} className="btn btn-ghost" onClick={() => { setRangeDraft(r); setRangeActive(r); cargar(r); }}
                style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', ...(isActive ? { borderColor: 'var(--neon-blue)', color: 'var(--neon-blue)' } : {}) }}>
                {label}
              </button>
            );
          })}
        </div>
        {/* Info del rango activo */}
        <div style={{ marginTop: '0.6rem', fontSize: '0.72rem', color: 'var(--text-3)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          {loading
            ? <span>⏳ Cargando consignaciones…</span>
            : consignaciones.length > 0
            ? <span>✅ <strong style={{ color: 'var(--neon-green)' }}>{consignaciones.length}</strong> consignaciones cargadas para <strong style={{ color: 'var(--neon-blue)' }}>{rangoLabel}</strong></span>
            : <span style={{ color: 'var(--neon-yellow)' }}>⚠️ Sin consignaciones para <strong>{rangoLabel}</strong> — cambia el rango o verifica que haya registros en ese período.</span>
          }
        </div>
      </div>

      {/* ── Sub-pestañas por banco ─────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem' }}>
        {BANCOS.map(b => (
          <button key={b.id} onClick={() => setBanco(b.id)} style={{
            padding: '0.45rem 1.1rem', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.82rem',
            cursor: 'pointer', border: 'none',
            background: banco === b.id ? b.color : 'rgba(255,255,255,0.05)',
            color: banco === b.id ? '#000' : 'var(--text-2)',
            transition: 'all 0.2s',
          }}>
            {b.label}
          </button>
        ))}
      </div>

      {/* ── Panel activo ──────────────────────────────────────────────── */}
      <div className="card" style={{ padding: '1.25rem' }}>
        {banco === 'bancolombia' && <PanelBancolombia consignaciones={consignaciones} />}
        {banco === 'davivienda'  && <PanelDavivienda  consignaciones={consignaciones} />}
        {banco === 'buzon'       && <PanelBuzon       consignaciones={consignaciones} />}
        {banco === 'zenu'        && <PanelZenu        consignaciones={consignaciones} />}
      </div>
    </div>
  );
};

export default ValidadorExtracto;
