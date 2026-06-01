import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseKey);

// Auxiliares TAT
export const AUXILIARES = [
  { cedula: '75071571',   nombre: 'LUIS ALFONSO RIOS GONZALEZ', empresa: 'TAT' },
  { cedula: '42161511',   nombre: 'JUDY FRANCY BUITRAGO', empresa: 'TAT' },
  { cedula: '1193105349', nombre: 'MICHAEL CONTRERAS HURTADO', empresa: 'TAT' },
  { cedula: '1089097145', nombre: 'MANUEL ALEJANDRO RAMIREZ OVALLE', empresa: 'TAT' },
  { cedula: '1088305468', nombre: 'JULIAN DAVID RODRIGUEZ MONTOYA', empresa: 'TAT' },
  { cedula: '1094956074', nombre: 'YERFREY FLORES ARROYAVE', empresa: 'TAT' },
  { cedula: '10030398',   nombre: 'JOHN RAUL GRAJALES CANO', empresa: 'TAT' },
  { cedula: '1004667097', nombre: 'JUAN GUILLERMO FERNANDEZ GIRALDO', empresa: 'TAT' },
  { cedula: '1055831421', nombre: 'SAMUEL ANDRES ARIAS ARCILA', empresa: 'TAT' },
  { cedula: '1004680120', nombre: 'VALENTINA GARCIA GOMEZ', empresa: 'TAT' },
  { cedula: '80433929',   nombre: 'LINO LOPEZ SIMONS', empresa: 'TAT' },
  { cedula: '30397740',   nombre: 'LUZ MARINA GUZMAN TORO', empresa: 'TAT' },
  { cedula: '1004670448', nombre: 'BRANDON ESTIVEN ALZATE GONZALEZ', empresa: 'TAT' },
  { cedula: '1076350176', nombre: 'DANIELA CASTIBLANCO RAMIREZ', empresa: 'TAT' },
  { cedula: '1060586518', nombre: 'NELLY YURANNY SALDARRIAGA CAÑAS', empresa: 'TAT' },
];

export const mockAuth = {
  signIn: async (email, password, cedula = null) => {
    if (cedula) {
      const aux = AUXILIARES.find(a => a.cedula === cedula.trim());
      if (!aux) return { user: null, error: { message: 'Cédula no registrada en TAT' } };
      const user = { id: `aux_${aux.cedula}`, cedula: aux.cedula, role: 'auxiliar', full_name: aux.nombre, empresa: 'TAT' };
      localStorage.setItem('consignaciones_user', JSON.stringify(user));
      return { user, error: null };
    }

    const productionUsers = [
      { id: 'cajera-daniel', email: 'daniel.tat@consigcontrol.com', role: 'cajera', full_name: 'Daniel (TAT)', pass: 'Tat*2026D', empresa: 'TAT' },
      { id: 'admin-tat', email: 'admin.tat@consigcontrol.com', role: 'admin', full_name: 'Admin TAT', pass: 'TatAdmin*2026' },
    ];

    const found = productionUsers.find(u => u.email === email && u.pass === password);
    if (found) { const { pass, ...userSession } = found; localStorage.setItem('consignaciones_user', JSON.stringify(userSession)); return { user: userSession, error: null }; }
    return { user: null, error: { message: 'Credenciales inválidas' } };
  },
  signOut: async () => { localStorage.removeItem('consignaciones_user'); return { error: null }; },
  getUser: () => { const userStr = localStorage.getItem('consignaciones_user'); if (!userStr) return null; return JSON.parse(userStr); }
};

export const mockDB = {
  getConsignaciones: async () => {
    const PAGE_SIZE = 1000; let allData = []; let from = 0; let keepFetching = true;
    while (keepFetching) {
      const { data, error } = await supabase.from('consignaciones').select('*').order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1);
      if (error) { console.error(error); return allData; }
      allData = allData.concat(data);
      if (data.length < PAGE_SIZE) keepFetching = false; else from += PAGE_SIZE;
    }
    return allData.map(c => ({ ...c, fecha: (c.estado === 'Cuadrado' && c.fecha_cuadrado) ? c.fecha_cuadrado : c.created_at }));
  },
  getConsignacionById: async (id) => { const { data, error } = await supabase.from('consignaciones').select('*').eq('id', id).single(); if (error) throw error; return { ...data, fecha: (data.estado === 'Cuadrado' && data.fecha_cuadrado) ? data.fecha_cuadrado : data.created_at }; },
  checkDuplicate: async (numero_comprobante, excludeId = null) => { let query = supabase.from('consignaciones').select('id').eq('numero_comprobante', numero_comprobante).neq('estado', 'Rechazado'); if (excludeId) query = query.neq('id', excludeId); const { data, error } = await query.limit(1); if (error) throw error; return data && data.length > 0; },
  addConsignacion: async (formData) => { const { data, error } = await supabase.from('consignaciones').insert([ { banco: formData.banco, valor: formData.valor, numero_comprobante: formData.numero_comprobante, file_url: formData.file_url, auxiliar_id: formData.auxiliar_id, auxiliar_name: formData.auxiliar_name, empresa: formData.empresa || 'TAT', estado: 'Pendiente' } ]).select(); if (error) throw error; return { data: data[0], error: null }; },
  updateConsignacion: async (id, updateData) => { const { error } = await supabase.from('consignaciones').update(updateData).eq('id', id); if (error) throw error; return { error: null }; },
  updateConsignacionStatus: async (id, estado, motivo = null, cajera_id = null, cajera_name = null) => { const updateData = { estado }; if (estado === 'Validado') { updateData.motivo_rechazo = null; if (cajera_name) updateData.cajera_name = cajera_name; } else if (estado === 'Rechazado') { if (motivo) updateData.motivo_rechazo = motivo; if (cajera_name) updateData.cajera_name = cajera_name; } else if (estado === 'Cuadrado') { updateData.fecha_cuadrado = new Date().toISOString(); } const { error } = await supabase.from('consignaciones').update(updateData).eq('id', id); if (error) throw error; return { error: null }; },
  deleteConsignacion: async (id) => { const { error } = await supabase.from('consignaciones').delete().eq('id', id); if (error) throw error; return { error: null }; },
  uploadFile: async (file) => { const fileExt = file.name.split('.').pop(); const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`; const filePath = `${fileName}`; const { error: uploadError } = await supabase.storage.from('comprobantes').upload(filePath, file); if (uploadError) throw uploadError; const { data } = supabase.storage.from('comprobantes').getPublicUrl(filePath); return data.publicUrl; }
};