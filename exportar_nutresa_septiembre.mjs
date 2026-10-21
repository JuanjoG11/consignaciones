// Script para exportar registros de Servicios Nutresa Cárnicos de Septiembre
// Filtra por valores de 1 millón, 2 millones y 3 millones
// Genera un ZIP con fotos (comprobantes) + Excel, separados por valor

import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import fs from 'fs';
import path from 'path';

// ── Configuración Supabase (desde .env) ──────────────────────────────────────
const SUPABASE_URL = 'https://zlhbvmlylzxeovtkedws.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpsaGJ2bWx5bHp4ZW92dGtlZHdzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5NzM2OTYsImV4cCI6MjA5MjU0OTY5Nn0.59M2v9iJhcG4BA7NMxQzmIEY1rzSSDu3l1ChzPXa7ZM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Parámetros ───────────────────────────────────────────────────────────────
// Septiembre 2026 (la fecha actual es octubre 2026)
const YEAR = 2026;
const MONTH = 9; // Septiembre (1-9)

// Rango de fechas con padding de 1 día para compensar UTC vs Colombia (UTC-5)
const dateFrom = `${YEAR}-${String(MONTH).padStart(2, '0')}-01`;
const dateTo = `${YEAR}-${String(MONTH).padStart(2, '0')}-30`;
const dateFromPadded = (() => {
  const d = new Date(`${dateFrom}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().split('T')[0];
})();
const dateToPadded = (() => {
  const d = new Date(`${dateTo}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
})();

const BANCO_OBJETIVO = 'Servicios Nutresa Cárnicos';

// Valores objetivo (en COP)
const VALORES = [
  { label: '1_Millon',  valor: 1000000, descripcion: '1 Millón' },
  { label: '2_Millones', valor: 2000000, descripcion: '2 Millones' },
  { label: '3_Millones', valor: 3000000, descripcion: '3 Millones' },
];

// ── Helper para convertir created_at a fecha local Colombia (UTC-5) ───────────
const fechaColombia = (isoStr) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  return new Date(d.getTime() - 5 * 60 * 60 * 1000).toISOString().substring(0, 10);
};

const estaEnSeptiembre = (registro) => {
  // Priorizar fecha_cuadrado si está cuadrado, sino created_at
  const fechaEfetiva = (registro.estado === 'Cuadrado' && registro.fecha_cuadrado)
    ? registro.fecha_cuadrado
    : registro.created_at;
  const fechaLocal = fechaColombia(fechaEfetiva);
  return fechaLocal >= `${YEAR}-09-01` && fechaLocal <= `${YEAR}-09-30`;
};

const money = (n) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);

// ── 1. Obtener registros de Supabase ─────────────────────────────────────────
async function obtenerRegistros() {
  console.log(`\n🔍 Consultando Supabase...`);
  console.log(`   Banco: ${BANCO_OBJETIVO}`);
  console.log(`   Período: Septiembre ${YEAR}`);

  const SELECT_COLS = 'id,banco,valor,numero_comprobante,file_url,auxiliar_id,auxiliar_name,empresa,estado,motivo_rechazo,cajera_name,nombre_cliente,created_at,fecha_cuadrado';
  const PAGE_SIZE = 1000;

  const fetchAllPages = async (applyFilters) => {
    let acc = [];
    let from = 0;
    let keepGoing = true;
    while (keepGoing) {
      let q = supabase.from('consignaciones').select(SELECT_COLS).order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      q = applyFilters(q);
      const { data, error } = await q;
      if (error) {
        console.error('Error Supabase:', JSON.stringify(error));
        return { data: acc, error: true };
      }
      acc = acc.concat(data);
      if (data.length < PAGE_SIZE) keepGoing = false;
      else from += PAGE_SIZE;
    }
    return { data: acc, error: false };
  };

  // Query 1: registros creados en el rango
  const res1 = await fetchAllPages((q) => {
    return q
      .ilike('banco', BANCO_OBJETIVO)
      .gte('created_at', `${dateFromPadded}T00:00:00.000Z`)
      .lte('created_at', `${dateToPadded}T23:59:59.999Z`);
  });
  let allData = res1.data;

  // Query 2: cuadrados por fecha_cuadrado que pudieron crearse en otro mes
  if (!res1.error) {
    const res2 = await fetchAllPages((q) => {
      return q
        .ilike('banco', BANCO_OBJETIVO)
        .eq('estado', 'Cuadrado')
        .gte('fecha_cuadrado', `${dateFromPadded}T00:00:00.000Z`)
        .lte('fecha_cuadrado', `${dateToPadded}T23:59:59.999Z`);
    });
    if (!res2.error && res2.data.length > 0) {
      const seen = new Set(allData.map(r => r.id));
      for (const row of res2.data) {
        if (!seen.has(row.id)) {
          allData.push(row);
          seen.add(row.id);
        }
      }
    }
  }

  // Re-filtrar por fecha de septiembre en hora Colombia y por banco exacto
  const filtrados = allData.filter(c => {
    const bancoMatch = c.banco && c.banco.trim().toLowerCase() === BANCO_OBJETIVO.trim().toLowerCase();
    return bancoMatch && estaEnSeptiembre(c);
  });

  console.log(`   Total registros encontrados (Nutresa, Septiembre): ${filtrados.length}`);

  return filtrados;
}

// ── 2. Descargar una foto (comprobante) ──────────────────────────────────────
async function descargarFoto(fileUrl) {
  if (!fileUrl) return null;
  try {
    const response = await fetch(fileUrl);
    if (!response.ok) {
      console.error(`   ❌ HTTP ${response.status} al descargar: ${fileUrl.substring(0, 80)}...`);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (err) {
    console.error(`   ❌ Error bajando foto: ${err.message}`);
    return null;
  }
}

// ── 3. Generar Excel para un grupo de registros ──────────────────────────────
function generarExcel(registros, nombreHoja) {
  const data = registros.map(c => ({
    Fecha: c.fechaLocal + ' ' + new Date(c.created_at).toISOString().substring(11, 16),
    Auxiliar: c.auxiliar_name || '',
    Banco: c.banco,
    Valor: c.valor,
    Comprobante: c.numero_comprobante,
    Estado: c.estado,
    Cajera: c.cajera_name || '',
    'Nombre Cliente': c.nombre_cliente || '',
    Empresa: c.empresa || 'GENERAL',
    'Motivo Rechazo': c.motivo_rechazo || '',
  }));

  const ws = XLSX.utils.json_to_sheet(data);

  // Auto-ancho de columnas
  const colWidths = Object.keys(data[0] || { Fecha: '' }).map(key => ({
    wch: Math.max(key.length, ...data.map(r => String(r[key] ?? '').length)) + 2
  }));
  ws['!cols'] = colWidths;

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, nombreHoja.substring(0, 31));
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
}

// ── 4. Generar el ZIP ─────────────────────────────────────────────────────────
async function main() {
  const registros = await obtenerRegistros();

  if (registros.length === 0) {
    console.log('\n⚠️  No se encontraron registros de Servicios Nutresa Cárnicos en septiembre.');
    console.log('   Verifica el año/mes o el nombre del banco.');
    return;
  }

  // Mapear fecha local (Colombia) para cada registro
  registros.forEach(c => {
    const fechaEfetiva = (c.estado === 'Cuadrado' && c.fecha_cuadrado) ? c.fecha_cuadrado : c.created_at;
    c.fechaLocal = fechaColombia(fechaEfetiva);
  });

  // Resumen de valores encontrados
  console.log('\n📊 Distribución por valor:');
  const porValor = {};
  registros.forEach(c => {
    const k = String(c.valor);
    porValor[k] = (porValor[k] || 0) + 1;
  });
  Object.entries(porValor).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([v, count]) => {
    console.log(`   ${money(Number(v))}  →  ${count} registro(s)`);
  });

  const zip = new JSZip();
  let totalDescargadas = 0;
  let totalFallidas = 0;

  for (const config of VALORES) {
    const grupo = registros.filter(c => Number(c.valor) === config.valor);
    console.log(`\n📁 Procesando ${config.descripcion} (${config.valor}) — ${grupo.length} registro(s)`);

    if (grupo.length === 0) {
      console.log(`   ⏭️  Sin registros para ${config.descripcion}, carpeta omitida.`);
      continue;
    }

    const carpeta = zip.folder(config.label);

    // Excel para este valor
    const excelBuffer = generarExcel(grupo, `Nutresa_${config.label}`);
    carpeta.file(`Registros_Nutresa_${config.descripcion.replace(/\s+/g, '_')}.xlsx`, excelBuffer);

    // Carpeta de comprobantes (fotos) organizados por fecha
    const comprobantesFolder = carpeta.folder('comprobantes_por_fecha');

    let i = 0;
    for (const c of grupo) {
      i++;
      if (!c.file_url) {
        console.log(`   ⏭️  [${i}/${grupo.length}] Sin foto: ${c.auxiliar_name} #${c.numero_comprobante}`);
        continue;
      }

      const fechaStr = c.fechaLocal || 'sin_fecha';
      const fechaFolder = comprobantesFolder.folder(fechaStr);

      const ext = c.file_url.split('.').pop().split('?')[0] || 'png';
      const safeAux = (c.auxiliar_name || 'aux').replace(/\s+/g, '_');
      const safeComp = String(c.numero_comprobante || 's/n').replace(/\s+/g, '_');
      const safeName = `${safeAux}_${safeComp}_${c.valor}.${ext}`;

      process.stdout.write(`   📸 [${i}/${grupo.length}] ${safeName.substring(0, 60)}... `);
      const foto = await descargarFoto(c.file_url);
      if (foto) {
        fechaFolder.file(safeName, foto);
        totalDescargadas++;
        console.log('✅');
      } else {
        totalFallidas++;
        console.log('❌');
      }
    }
  }

  // Excel consolidado (todos los valores en un solo archivo, en la raíz del ZIP)
  const excelConsolidado = generarExcel(registros, 'Nutresa_Consolidado');
  zip.file(`Nutresa_Septiembre_${YEAR}_Consolidado.xlsx`, excelConsolidado);

  // Generar y guardar el ZIP
  console.log('\n🗜️  Generando archivo ZIP...');
  const contenido = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

  const nombreZip = `Nutresa_Septiembre_${YEAR}_1M_2M_3M.zip`;
  const rutaZip = path.join(process.cwd(), nombreZip);
  fs.writeFileSync(rutaZip, contenido);

  console.log(`\n✅ ¡ZIP generado con éxito!`);
  console.log(`   📂 Archivo: ${rutaZip}`);
  console.log(`   📸 Fotos descargadas: ${totalDescargadas}`);
  if (totalFallidas > 0) console.log(`   ⚠️  Fotos fallidas: ${totalFallidas}`);
  console.log(`   📊 Total registros: ${registros.length}`);
}

main().catch(err => {
  console.error('\n💥 Error fatal:', err);
  process.exit(1);
});
