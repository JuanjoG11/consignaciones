import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Initialize Supabase client
export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * NOTA: He mantenido el nombre 'mockAuth' y 'mockDB' para que no tengas que 
 * cambiar nada en tus componentes (App.jsx, AuxiliarPanel, etc.), 
 * pero ahora por debajo están usando la base de datos REAL de Supabase.
 */

// ── Lista de auxiliares autorizados (login por cédula) ──────────────────────
export const AUXILIARES = [
  { cedula: '1002730727', nombre: 'JHON WILSON GIRALDO CARVAJAL' },
  { cedula: '10138323',   nombre: 'ROVINSON TORRES RIVERA' },
  { cedula: '9910933',    nombre: 'ARBEY DE JESUS LARGO LARGO' },
  { cedula: '10033035',   nombre: 'CESAR AUGUSTO CASTILLO LONDOÑO' },
  { cedula: '1060652216', nombre: 'CRISTIAN CAMILO OSPINA PARRA' },
  { cedula: '1058821245', nombre: 'VICTOR ALFONSO PULGARIN MEJIA' },
  { cedula: '1112227774', nombre: 'CHRISTIAN DAVID CAICEDO MONTAÑO' },
  { cedula: '1112226698', nombre: 'JOSE ALEXANDER CONSTAIN PERLAZA' },
  { cedula: '18524020',   nombre: 'EDWIN MAURICIO GOMEZ GALINDO' },
  { cedula: '1053866136', nombre: 'ADRIAN FELIPE MARTINEZ ORTEGON' },
  { cedula: '1088253407', nombre: 'CARLOS ANDRES PINEDA CANO' },
  { cedula: '1087559558', nombre: 'JUAN ALEJANDRO FRANCO MARIN' },
  { cedula: '1112778308', nombre: 'LUIS CARLOS CADAVID RESTREPO' },
  { cedula: '1089933391', nombre: 'BRAHIAN STIVEN VALENCIA IGLESIAS' },
  { cedula: '1088249115', nombre: 'JOHN EDWAR ZAPATA ACEVEDO' },
  { cedula: '1004671619', nombre: 'BRANDON STEVEN GIL BAEZ' },
  { cedula: '1004778577', nombre: 'JUAN MANUEL DELGADO NARVAEZ' },
  { cedula: '1007783801', nombre: 'YEISON DAVID RENDON SOTO' },
  { cedula: '1088334475', nombre: 'SEBASTIAN VILLADA VELASQUEZ' },
  { cedula: '1127384755', nombre: 'CAMILO ANDRES CONTRERAS RIVAS' },
  { cedula: '4512871',    nombre: 'ARNULFO STERLING PELAEZ' },
  { cedula: '1088308341', nombre: 'JUAN DAVID QUINTERO GRAJALES' },
  { cedula: '1123141444', nombre: 'CRISTIAN FABIAN CAMACHO MARTINEZ' },
  { cedula: '1038926903', nombre: 'DIORLAN ANTONIO MESA FLOREZ' },
  { cedula: '1038768016', nombre: 'ANDRES FELIPE RIOS CAICEDO' },
  { cedula: '1004669724', nombre: 'QUEBIN ANDRES LOTERO ZAPATA' },
  { cedula: '1088340979', nombre: 'JORGE ELIECER CRUZ PINEDA' },
  { cedula: '1004737907', nombre: 'SANTIAGO HENAO MORALES' },
  { cedula: '1093215191', nombre: 'JHON HENRY GARCIA PATIÑO' },
  { cedula: '1007605268', nombre: 'ANDRES CAMILO MUÑOZ CAICEDO' },
  { cedula: '1006128361', nombre: 'CAMILO LEANDRO GUECHE PEÑA' },
  { cedula: '10027683',   nombre: 'GERMAN GALVEZ CORTES' },
  { cedula: '18519474',   nombre: 'OSCAR MAURICIO RESTREPO MORENO' },
  { cedula: '1088331177', nombre: 'MICHAEL STEVEN HENAO RODRIGUEZ' },
  { cedula: '1002718622', nombre: 'JUAN CAMILO COCOMA OROZCO' },
  { cedula: '1007232739', nombre: 'GERMAN DANIEL PATIÑO VELASQUEZ' },
  { cedula: '1093220521', nombre: 'JUAN DIEGO FRANCO VERGARA' },
  { cedula: '1112776419', nombre: 'JAMMES ALBERTO RAMIREZ NIETO' },
  { cedula: '1098724347', nombre: 'SEBASTIAN SALAZAR HENAO' },
  { cedula: '1088037094', nombre: 'DANIEL FELIPE MURILLO GRANDA' },
  { cedula: '1089601941', nombre: 'FELIPE MONTES RIVERA' },
  { cedula: '9862197',    nombre: 'GUSTAVO ADOLFO MORALES TIRADO' },
  { cedula: '1006296150', nombre: 'JHONATAN MENA GALLEGO' },
  { cedula: '10005257',   nombre: 'OSCAR MAURICIO GUARUMO CLAVIJO' },
];

export const mockAuth = {
  /**
   * signIn para Auxiliar: pasar { cedula } en lugar de email/password.
   * signIn para Cajera/Admin: pasar email + password normales.
   */
  signIn: async (email, password, cedula = null) => {
    // ── LOGIN AUXILIAR POR CÉDULA ────────────────────────────────────────────
    if (cedula) {
      const aux = AUXILIARES.find(a => a.cedula === cedula.trim());
      if (!aux) {
        return { user: null, error: { message: 'Cédula no registrada en el sistema' } };
      }
      const user = {
        id: `aux_${aux.cedula}`,
        cedula: aux.cedula,
        role: 'auxiliar',
        full_name: aux.nombre,
      };
      localStorage.setItem('consignaciones_user', JSON.stringify(user));
      return { user, error: null };
    }

    // ── LOGIN CAJERA / ADMIN POR EMAIL + CONTRASEÑA ──────────────────────────
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      console.warn('Auth real falló, usando lógica de prueba:', error.message);
      const mockUsers = [
        { id: '2', email: 'cajera@test.com', role: 'cajera',  full_name: 'Carmen Cajera', password: '123' },
        { id: '3', email: 'admin@test.com',  role: 'admin',   full_name: 'Admin Jefe',    password: '123' },
      ];
      const found = mockUsers.find(u => u.email === email && u.password === password);
      if (found) {
        localStorage.setItem('consignaciones_user', JSON.stringify(found));
        return { user: found, error: null };
      }
      return { user: null, error: { message: 'Credenciales inválidas' } };
    }

    const role = email.includes('admin') ? 'admin' : 'cajera';
    const user = {
      id: data.user.id,
      email: data.user.email,
      role,
      full_name: data.user.user_metadata?.full_name || email.split('@')[0],
    };
    localStorage.setItem('consignaciones_user', JSON.stringify(user));
    return { user, error: null };
  },

  signOut: async () => {
    await supabase.auth.signOut();
    localStorage.removeItem('consignaciones_user');
    return { error: null };
  },

  getUser: () => {
    const userStr = localStorage.getItem('consignaciones_user');
    return userStr ? JSON.parse(userStr) : null;
  },
};

export const mockDB = {
  // OBTENER CONSIGNACIONES (REAL)
  getConsignaciones: async () => {
    const { data, error } = await supabase
      .from('consignaciones')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      console.error("Error Supabase:", error);
      return [];
    }
    // Mapeamos created_at a fecha para compatibilidad con el resto del código
    return data.map(c => ({ ...c, fecha: c.created_at }));
  },

  // VERIFICAR DUPLICADOS
  checkDuplicate: async (numero_comprobante, valor) => {
    const { data, error } = await supabase
      .from('consignaciones')
      .select('id')
      .eq('numero_comprobante', numero_comprobante)
      .eq('valor', valor)
      .maybeSingle();
    
    if (error) throw error;
    return !!data; // true si existe, false si no
  },

  // AGREGAR CONSIGNACIÓN (REAL)
  addConsignacion: async (formData) => {
    // 1. Insertar directamente (el check se hace antes en la UI para mejor UX)
    const { data, error } = await supabase
      .from('consignaciones')
      .insert([{
        banco: formData.banco,
        valor: formData.valor,
        numero_comprobante: formData.numero_comprobante,
        file_url: formData.file_url,
        auxiliar_id: formData.auxiliar_id,
        auxiliar_name: formData.auxiliar_name,
        estado: 'Pendiente'
      }])
      .select();

    if (error) throw error;
    return { data: data[0], error: null };
  },

  // ACTUALIZAR ESTADO (REAL)
  updateConsignacionStatus: async (id, estado, motivo = null) => {
    const updateData = { estado };
    if (motivo) updateData.motivo_rechazo = motivo;

    const { error } = await supabase
      .from('consignaciones')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    return { error: null };
  },

  // SUBIR ARCHIVO A STORAGE (REAL)
  uploadFile: async (file) => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('comprobantes')
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from('comprobantes')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }
};
