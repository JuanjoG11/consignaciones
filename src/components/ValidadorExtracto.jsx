import React, { useState, useCallback, useEffect } from 'react';
import { FileSearch, Download, RefreshCw, History, X, ChevronDown, ChevronUp } from 'lucide-react';
import { mockDB, historialDB } from '../lib/supabase';
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
  // DD/MM/YYYY o D/M/YYYY — primero intentar como colombiano si día > 12
  let m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const a = +m[3] < 100 ? 2000 + +m[3] : +m[3];
    const x = +m[1], y = +m[2];
    // Si el primer número > 12, es DD/MM (colombiano)
    if (x > 12) return new Date(a, y - 1, x);
    // Si el segundo > 12, es MM/DD (americano Atlas)
    if (y > 12) return new Date(a, x - 1, y);
    // Ambos ≤ 12: asumir DD/MM (colombiano por defecto)
    return new Date(a, y - 1, x);
  }
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
const PanelBancolombia = ({ consignaciones, onGuardar }) => {
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
    onGuardar?.(res);
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
    x1        {resultados && <div style={{ marginTop: '1rem' }}><TablaResultados resultados={resultados} filtro={filtro} setFiltro={setFiltro} onExportar={() => exportarXlsx(resultados, 'Bancolombia')} onExportarPendientes={() => exportarXlsx(resultados, 'Bancolombia', true)} banco="Bancolombia" /></div>}
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// PANEL DAVIVIENDA
// ════════════════════════════════════════════════════════════════════════════
// PANEL DAVIVIENDA
//
// Formato real del extracto (17 columnas TSV):
// Fecha | Doc. | Tran | Ofi. | Jor. | Hora | Mot. | Desc Mot. | Valor Total |
// Valor Cheque | ID Origen/Destino | Referencia 1 | Referencia 2 | Terminal |
// Fecha Movto. | Ciudad | Valor Saldo
//
// Ingresos = "Notas Credito" o "Deposito Especial" (col 2 = Tran)
// Ignorar  = "Notas Debito" (GMF, PSE, cobros)
// Ignorar  = Doc 99999999 / 99999998 (ajustes internos)
//
// Cruce:
//   - Doc como comprobante exacto (auxiliar registra el nro de movimiento)
//   - ID Origen/Destino como cédula + valor (transferencias App Davivienda)
//   - Valor + fecha como fallback
// ════════════════════════════════════════════════════════════════════════════
const PanelDavivienda = ({ consignaciones, onGuardar }) => {
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
      // Necesitamos al menos: Fecha(0) Doc(1) Tran(2) ... Valor Total(8)
      if (cols.length < 9) continue;

      const fecha     = cols[0]?.trim();
      const doc       = cols[1]?.trim();
      const tran      = cols[2]?.trim(); // "Notas Credito", "Notas Debito", "Deposito Especial"
      const hora      = cols[5]?.trim();
      const descMot   = cols[7]?.trim(); // descripción completa del movimiento
      const valorRaw  = cols[8]?.trim(); // "Valor Total"
      const idOrigen  = cols[10]?.trim(); // ID Origen/Destino (cédula/NIT del remitente)
      const ref1      = cols[11]?.trim(); // Referencia 1

      // Solo ingresos
      if (tran === 'Notas Debito') continue;
      if (!tran || (!tran.includes('Credito') && !tran.includes('Deposito'))) continue;

      // Ignorar ajustes internos del banco
      if (doc === '99999999' || doc === '99999998') continue;
      // Ignorar débitos/cobros disfrazados en notas crédito
      if (/cobro|gmf|gravamen/i.test(descMot)) continue;

      const valor = normVal(valorRaw);
      if (isNaN(valor) || valor < 1000) continue;

      const clave = `${doc}|${valor}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);

      // Limpiar ID Origen: viene como "41870988" o vacío
      const idLimpio = (idOrigen || '').replace(/^'+/, '').replace(/^0+/, '').trim();
      const esCedula = idLimpio && /^\d{6,12}$/.test(idLimpio) && idLimpio !== '0';

      // Extraer nombre del remitente desde descMot si existe
      // "Abono Transferencia 41870988 DIANA PAT AGUIRRE" → "DIANA PAT AGUIRRE"
      const mNombre = descMot.match(/\d{6,12}\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ\s]+)$/);
      const nombreRemitente = mNombre ? mNombre[1].trim() : '';

      filas.push({
        fecha, doc, hora, tran, descMot, valor,
        cedula: esCedula ? idLimpio : null,
        refDisplay: nombreRemitente
          ? `${nombreRemitente} (${idLimpio}) · ${doc}`
          : `Doc: ${doc}${idLimpio ? ' · ID: ' + idLimpio : ''}`,
      });
    }

    if (filas.length === 0) {
      toast.error('No se encontraron ingresos válidos. Verifica que el extracto sea Davivienda y que haya filas de "Notas Credito" o "Deposito Especial".');
      return;
    }

    const res = filas.map(f => {
      const fechaDate = parseFecha(f.fecha);
      const cruce = cruzar(
        { comprobante: f.doc, cedula: f.cedula, valor: f.valor, fechaDate, permitirSoloValor: true },
        indices
      );
      return { ...f, ...cruce, comprobante: cruce.registro?.numero_comprobante || f.doc || '—' };
    });

    setResultados(res);
    const ok  = res.filter(r => r.estado === 'ok').length;
    const dif = res.filter(r => r.estado === 'valor_diferente').length;
    const no  = res.filter(r => r.estado === 'no_encontrado').length;
    toast.success(`Davivienda: ${res.length} movimientos · ${ok} ✅ · ${dif} ⚠️ · ${no} ❌`);
    onGuardar?.(res);
  }, [texto, indices]);

  return (
    <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'Pega el extracto Davivienda.\n\nFormato TSV (17 columnas):\nFecha\tDoc.\tTran\tOfi.\tJor.\tHora\tMot.\tDesc Mot.\tValor Total\tValor Cheque\tID Origen/Destino\tReferencia 1\tReferencia 2\tTerminal\tFecha Movto.\tCiudad\tValor Saldo\n\nEjemplo:\n23/10/2026\t10023179\tNotas Credito\tApp Davivienda\tNormal\t10:02:31\t6\tAbono Transferencia 41870988 DIANA PAT AGUIRRE\t$ 29.388,00\t$ 0,00\t41870988\t...\n\nSolo se procesan Notas Credito y Deposito Especial (ingresos).'}
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
const PanelBuzon = ({ consignaciones, onGuardar }) => {
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
      // Formato real Buzón Atlas (muchas columnas de denominaciones):
      // Client(0) | Date(1) | vacío(2) | User(3) | Barcode(4) | TransType(5) | Amount(6) |
      // 20(7) | 50(8) | ... | SerialNumber | DropIn | TotalValue | Description
      // Mínimo necesitamos Date, User, TransType, Amount → al menos 7 cols
      if (cols.length < 7) continue;

      // Ignorar encabezado
      if (cols[1] === 'Date' || cols[3] === 'User') continue;
      // Ignorar totales "Atlas Recaudo"
      if (linea.toLowerCase().includes('atlas recaudo')) continue;

      // Transaction type debe ser "Deposit"
      const transType = cols[5] || '';
      if (!/deposit/i.test(transType)) continue;

      // Fecha: cols[1] — formato "10/1/2026 08:14" (M/D/YYYY H:MM)
      const fechaRaw = cols[1] || '';
      // Extraer solo la parte de fecha sin hora
      const fechaSolo = fechaRaw.split(' ')[0]; // "10/1/2026"

      // Amount: cols[6] — formato "9.170.000,00"
      const valorRaw = cols[6] || '';
      const valor = normVal(valorRaw);
      if (isNaN(valor) || valor < 1000) continue;

      // User: cols[3] — "JOHN EDWAR ZAPATA ACEVEDO (V1088249115)"
      const userCol = cols[3] || '';
      const cedulaMatch = userCol.match(/\([VTvt]?(\d{6,12})\)/);
      const cedula = cedulaMatch ? cedulaMatch[1] : null;
      const nombreLimpio = userCol.replace(/\s*\([^)]+\)\s*$/, '').trim();

      if (!cedula) continue; // sin cédula no podemos cruzar

      // Barcode: cols[4]
      const barcode = cols[4] || '';

      filas.push({
        fecha: fechaSolo,
        cedula,
        nombre: nombreLimpio,
        barcode,
        valor,
        refDisplay: `${nombreLimpio} (${cedula})`,
      });
    }

    if (filas.length === 0) {
      toast.error('No se encontraron depósitos con cédula válida. Verifica el formato Buzón Atlas.');
      return;
    }

    const res = filas.map(f => {
      const fechaDate = parseFecha(f.fecha);
      const cruce = cruzar({ comprobante: null, cedula: f.cedula, valor: f.valor, fechaDate }, indices);
      return { ...f, ...cruce, comprobante: cruce.registro?.numero_comprobante || '—' };
    });

    setResultados(res);
    const ok  = res.filter(r => r.estado === 'ok').length;
    const dif = res.filter(r => r.estado === 'valor_diferente').length;
    const no  = res.filter(r => r.estado === 'no_encontrado').length;
    toast.success(`Buzón Atlas: ${res.length} depósitos · ${ok} ✅ · ${dif} ⚠️ · ${no} ❌`);
    onGuardar?.(res);
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
//
// Formato real del reporte SAP (8 columnas TSV):
// Número de documento(0) | Referencia(1) | Tipo de documento(2) | Fecha creación(3) |
// Vencimiento(4) | Días vencidos(5) | Valor(6) | Moneda(7)
//
// Solo se procesan filas tipo "Recaudos en Bancos"
// Los valores son negativos en SAP — se toma el valor absoluto
// Cruce: Número de documento como numero_comprobante en ConsigControl
// ════════════════════════════════════════════════════════════════════════════
const PanelZenu = ({ consignaciones, onGuardar }) => {
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

      // Ignorar encabezado
      if (/número de documento|nro.*doc/i.test(cols[0])) continue;
      // Ignorar fila de total (solo tiene valor al final)
      if (!cols[0] || !/^\d/.test(cols[0])) continue;

      const nroDoc  = cols[0].trim();           // "1600241444"
      const tipo    = cols[2]?.trim() || '';    // " Recaudos en Bancos"
      const fecha   = cols[3]?.trim() || '';    // "28/09/2026"
      const valorRaw = cols[6]?.trim() || '';   // "-$2.000.000,00"

      // Solo Recaudos en Bancos
      if (!tipo.toLowerCase().includes('recaud')) continue;

      const valorBruto = normVal(valorRaw);
      const valor = Math.abs(valorBruto);
      if (isNaN(valor) || valor < 1000) continue;

      if (vistas.has(nroDoc)) continue;
      vistas.add(nroDoc);

      filas.push({
        fecha,
        numConsig: nroDoc,
        nomase: '',
        valor,
        refDisplay: `${nroDoc} · Recaudo`,
        descripcion: 'Recaudos en Bancos',
      });
    }

    if (filas.length === 0) {
      toast.error('No se encontraron recaudos. Verifica que el reporte tenga filas tipo "Recaudos en Bancos".');
      return;
    }

    const res = filas.map(f => {
      const fechaDate = parseFecha(f.fecha);
      const cruce = cruzar(
        { comprobante: f.numConsig, cedula: null, valor: f.valor, fechaDate, permitirSoloValor: true },
        indices
      );
      return {
        ...f,
        ...cruce,
        comprobante: cruce.registro?.numero_comprobante || f.numConsig,
      };
    });

    setResultados(res);
    const ok  = res.filter(r => r.estado === 'ok').length;
    const dif = res.filter(r => r.estado === 'valor_diferente').length;
    const no  = res.filter(r => r.estado === 'no_encontrado').length;
    toast.success(`Zenú SAP: ${res.length} recaudos · ${ok} ✅ · ${dif} ⚠️ · ${no} ❌`);
    onGuardar?.(res);
  }, [texto, indices]);

  return (
    <div>
      <textarea value={texto} onChange={e => setTexto(e.target.value)}
        placeholder={'Pega el reporte de cartera Zenú SAP.\n\nFormato TSV (8 columnas):\nNúmero de documento\tReferencia\tTipo de documento\tFecha creación\tVencimiento\tDías vencidos\tValor\tMoneda\n\nEjemplo:\n1600241444\t16-0186\t Recaudos en Bancos\t28/09/2026\t28/09/2026\t1\t-$2.000.000,00\tCOP\n\nSolo se procesan filas tipo "Recaudos en Bancos". Facturas y Notas Crédito se ignoran.'}
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

  // Historial
  const [verHistorial, setVerHistorial] = useState(false);
  const [historial, setHistorial] = useState([]);
  const [loadingHistorial, setLoadingHistorial] = useState(false);
  const [detalleAbierto, setDetalleAbierto] = useState(null); // id de la validación expandida
  const [detalleData, setDetalleData] = useState(null);

  const consignaciones = (consignacionesAdmin && consignacionesAdmin.length > 0)
    ? consignacionesAdmin
    : consignacionesPropias;

  // Función que los paneles llaman después de analizar
  const guardarEnHistorial = useCallback(async (bancoPar, resultados) => {
    if (!user || !resultados || resultados.length === 0) return;
    const { error } = await historialDB.guardar({
      adminId:             user.id,
      adminName:           user.full_name,
      banco:               bancoPar,
      periodoDesdePeriodo: rangeActive.start,
      periodoHasta:        rangeActive.end,
      resultados,
    });
    if (!error) toast.success('✅ Validación guardada en historial');
    else toast.error('No se pudo guardar en historial');
  }, [user, rangeActive]);

  const abrirHistorial = async () => {
    setVerHistorial(true);
    setLoadingHistorial(true);
    const data = await historialDB.listar({ limit: 100 });
    setHistorial(data);
    setLoadingHistorial(false);
  };

  const abrirDetalle = async (id) => {
    if (detalleAbierto === id) { setDetalleAbierto(null); setDetalleData(null); return; }
    setDetalleAbierto(id);
    setDetalleData(null);
    const data = await historialDB.detalle(id);
    setDetalleData(data);
  };

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
          {/* Atajo 2 meses — útil para Zenú que tiene recaudos de mes anterior */}
          {(() => {
            const now = new Date();
            const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const y1 = prev.getFullYear();
            const m1 = String(prev.getMonth() + 1).padStart(2, '0');
            const y2 = now.getFullYear();
            const m2 = String(now.getMonth() + 1).padStart(2, '0');
            const days2 = new Date(y2, now.getMonth() + 1, 0).getDate();
            const r = { start: `${y1}-${m1}-01`, end: `${y2}-${m2}-${days2}` };
            const isActive = rangeActive.start === r.start && rangeActive.end === r.end;
            return (
              <button className="btn btn-ghost" onClick={() => { setRangeDraft(r); setRangeActive(r); cargar(r); }}
                style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', ...(isActive ? { borderColor: 'var(--neon-purple)', color: 'var(--neon-purple)' } : {}), borderStyle: 'dashed' }}
                title="Útil para Zenú: recaudos de mes anterior registrados este mes">
                2 meses
              </button>
            );
          })()}
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

      {/* ── Sub-pestañas por banco + botón historial ──────────────────── */}
      <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: '0.75rem', alignItems: 'center' }}>
        {BANCOS.map(b => (
          <button key={b.id} onClick={() => { setBanco(b.id); setVerHistorial(false); }} style={{
            padding: '0.45rem 1.1rem', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.82rem',
            cursor: 'pointer', border: 'none',
            background: banco === b.id && !verHistorial ? b.color : 'rgba(255,255,255,0.05)',
            color: banco === b.id && !verHistorial ? '#000' : 'var(--text-2)',
            transition: 'all 0.2s',
          }}>
            {b.label}
          </button>
        ))}
        <button
          onClick={() => verHistorial ? setVerHistorial(false) : abrirHistorial()}
          style={{
            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.45rem 1rem', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.78rem',
            cursor: 'pointer', border: '1px solid',
            borderColor: verHistorial ? 'var(--neon-purple)' : 'var(--border)',
            background: verHistorial ? 'rgba(155,92,255,0.15)' : 'transparent',
            color: verHistorial ? 'var(--neon-purple)' : 'var(--text-3)',
          }}
        >
          <History size={14} /> Historial
        </button>
      </div>

      {/* ── Vista historial ───────────────────────────────────────────── */}
      {verHistorial && (
        <div className="animate-in">
          {loadingHistorial ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}><div className="spinner" /></div>
          ) : historial.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-3)' }}>
              No hay validaciones guardadas aún.
            </div>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.04)', borderBottom: '1px solid var(--border)' }}>
                    {['Fecha', 'Admin', 'Banco', 'Período', '✅', '⚠️', '❌', 'Total', ''].map(h => (
                      <th key={h} style={{ padding: '0.65rem', textAlign: 'left', fontWeight: 800, fontSize: '0.64rem', textTransform: 'uppercase', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {historial.map((h, i) => (
                    <>
                      <tr key={h.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', background: i % 2 ? 'rgba(255,255,255,0.015)' : 'transparent', cursor: 'pointer' }}
                        onClick={() => abrirDetalle(h.id)}>
                        <td style={{ padding: '0.55rem 0.65rem', color: 'var(--text-3)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                          {new Date(h.created_at).toLocaleString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ padding: '0.55rem 0.65rem', fontWeight: 600 }}>{h.admin_name}</td>
                        <td style={{ padding: '0.55rem 0.65rem' }}>{h.banco}</td>
                        <td style={{ padding: '0.55rem 0.65rem', fontSize: '0.7rem', color: 'var(--text-3)' }}>
                          {h.periodo_desde} → {h.periodo_hasta}
                        </td>
                        <td style={{ padding: '0.55rem 0.65rem', color: 'var(--neon-green)', fontWeight: 700 }}>{h.total_coinciden}</td>
                        <td style={{ padding: '0.55rem 0.65rem', color: 'var(--neon-yellow)', fontWeight: 700 }}>{h.total_revisar}</td>
                        <td style={{ padding: '0.55rem 0.65rem', color: 'var(--neon-red)', fontWeight: 700 }}>{h.total_no_encontrados}</td>
                        <td style={{ padding: '0.55rem 0.65rem', fontWeight: 700 }}>
                          {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(h.suma_total)}
                        </td>
                        <td style={{ padding: '0.55rem 0.65rem' }}>
                          {detalleAbierto === h.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </td>
                      </tr>
                      {detalleAbierto === h.id && (
                        <tr key={`${h.id}-det`}>
                          <td colSpan={9} style={{ padding: '0.75rem 1rem', background: 'rgba(155,92,255,0.06)', borderBottom: '1px solid var(--border)' }}>
                            {!detalleData ? (
                              <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                            ) : (
                              <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                  <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--neon-purple)' }}>
                                    {detalleData.detalle?.length} movimientos — {h.banco} — {h.periodo_desde} → {h.periodo_hasta}
                                  </span>
                                  <button className="btn btn-ghost" style={{ fontSize: '0.7rem', padding: '0.2rem 0.6rem' }}
                                    onClick={() => {
                                      // Exportar detalle a Excel
                                      const XLSX = window.__XLSX__;
                                      const filas = (detalleData.detalle || []).map(r => ({
                                        Fecha: r.f, Descripcion: r.d, Valor: r.v,
                                        Estado: r.e === 1 ? 'COINCIDE' : r.e === 2 ? 'REVISAR' : 'NO ENCONTRADO',
                                        Valor_Registrado: r.vr ?? '', Diferencia: r.dif ?? '',
                                        Auxiliar: r.aux ?? '', Banco_App: r.bco ?? '',
                                        Metodo: r.m ?? '', Comprobante: r.comp ?? '',
                                      }));
                                      import('xlsx').then(({ default: XLSXmod, utils, writeFile }) => {
                                        const ws = utils.json_to_sheet(filas);
                                        const wb = utils.book_new();
                                        utils.book_append_sheet(wb, ws, h.banco);
                                        writeFile(wb, `Historial_${h.banco}_${h.periodo_desde}.xlsx`);
                                      });
                                    }}>
                                    <Download size={12} /> Exportar
                                  </button>
                                </div>
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.72rem' }}>
                                    <thead>
                                      <tr style={{ background: 'rgba(255,255,255,0.04)' }}>
                                        {['Estado', 'Fecha', 'Descripción', 'Valor', 'Valor App', 'Diferencia', 'Auxiliar', 'Banco App'].map(col => (
                                          <th key={col} style={{ padding: '0.4rem 0.5rem', textAlign: 'left', color: 'var(--text-3)', fontSize: '0.62rem', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{col}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {(detalleData.detalle || []).map((r, idx) => {
                                        const col = r.e === 1 ? 'var(--neon-green)' : r.e === 2 ? 'var(--neon-yellow)' : 'var(--neon-red)';
                                        const lbl = r.e === 1 ? '✅' : r.e === 2 ? '⚠️' : '❌';
                                        const fmt = n => n != null ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n) : '—';
                                        return (
                                          <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                            <td style={{ padding: '0.35rem 0.5rem', color: col, fontWeight: 700 }}>{lbl}</td>
                                            <td style={{ padding: '0.35rem 0.5rem', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{r.f}</td>
                                            <td style={{ padding: '0.35rem 0.5rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.d}>{r.d}</td>
                                            <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap', fontWeight: 700 }}>{fmt(r.v)}</td>
                                            <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap', color: r.e === 1 ? 'var(--neon-green)' : 'var(--text-3)' }}>{fmt(r.vr)}</td>
                                            <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap', color: r.dif > 0 ? 'var(--neon-yellow)' : 'var(--text-3)' }}>{r.dif ? fmt(r.dif) : '—'}</td>
                                            <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap', fontSize: '0.68rem' }}>{r.aux || '—'}</td>
                                            <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap', fontSize: '0.68rem' }}>{r.bco || '—'}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Panel activo ──────────────────────────────────────────────── */}
      {!verHistorial && (
      <div className="card" style={{ padding: '1.25rem' }}>
        {banco === 'bancolombia' && <PanelBancolombia consignaciones={consignaciones} onGuardar={(r) => guardarEnHistorial('Bancolombia', r)} />}
        {banco === 'davivienda'  && <PanelDavivienda  consignaciones={consignaciones} onGuardar={(r) => guardarEnHistorial('Davivienda', r)} />}
        {banco === 'buzon'       && <PanelBuzon       consignaciones={consignaciones} onGuardar={(r) => guardarEnHistorial('Buzon_Atlas', r)} />}
        {banco === 'zenu'        && <PanelZenu        consignaciones={consignaciones} onGuardar={(r) => guardarEnHistorial('Zenu_SAP', r)} />}
      </div>
      )}
    </div>
  );
};

export default ValidadorExtracto;
