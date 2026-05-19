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
  { cedula: '1023378066', nombre: 'ANDRES MATEO VILLALBA DIAZ', empresa: 'ALPINA' },
  { cedula: '1002730727', nombre: 'JHON WILSON GIRALDO CARVAJAL', empresa: 'ALPINA' },
  { cedula: '10138323',   nombre: 'ROVINSON TORRES RIVERA', empresa: 'ALPINA' },
  { cedula: '1088352440', nombre: 'JUAN ESTEBAN GALLEGO DIEZ', empresa: 'ALPINA' },
  { cedula: '1004545355', nombre: 'YEISON LEANDRO TABARES CALLE', empresa: 'ALPINA' },
  { cedula: '1099204769', nombre: 'MILTON GILMER OSORIO CALLE', empresa: 'ALPINA' },
  { cedula: '9910933',    nombre: 'ARBEY DE JESUS LARGO LARGO', empresa: 'ALPINA' },
  { cedula: '10033035',   nombre: 'CESAR AUGUSTO CASTILLO LONDOÑO', empresa: 'ALPINA' },
  { cedula: '1060652216', nombre: 'CRISTIAN CAMILO OSPINA PARRA', empresa: 'ALPINA' },
  { cedula: '1058821245', nombre: 'VICTOR ALFONSO PULGARIN MEJIA', empresa: 'ALPINA' },
  { cedula: '1112227774', nombre: 'CHRISTIAN DAVID CAICEDO MONTAÑO', empresa: 'ALPINA' },
  { cedula: '1112226698', nombre: 'JOSE ALEXANDER CONSTAIN PERLAZA', empresa: 'ALPINA' },
  { cedula: '18524020',   nombre: 'EDWIN MAURICIO GOMEZ GALINDO', empresa: 'ALPINA' },
  { cedula: '1053866136', nombre: 'ADRIAN FELIPE MARTINEZ ORTEGON', empresa: 'ALPINA' },
  { cedula: '1088253407', nombre: 'CARLOS ANDRES PINEDA CANO', empresa: 'ALPINA' },
  { cedula: '1087559558', nombre: 'JUAN ALEJANDRO FRANCO MARIN', empresa: 'ALPINA' },
  { cedula: '1112778308', nombre: 'LUIS CARLOS CADAVID RESTREPO', empresa: 'ALPINA' },
  { cedula: '1089933391', nombre: 'BRAHIAN STIVEN VALENCIA IGLESIAS', empresa: 'ALPINA' },
  { cedula: '1088249115', nombre: 'JOHN EDWAR ZAPATA ACEVEDO', empresa: 'ALPINA' },
  { cedula: '1004671619', nombre: 'BRANDON STEVEN GIL BAEZ', empresa: 'ALPINA' },
  { cedula: '1004778577', nombre: 'JUAN MANUEL DELGADO NARVAEZ', empresa: 'ALPINA' },
  { cedula: '1007783801', nombre: 'YEISON DAVID RENDON SOTO', empresa: 'ALPINA' },
  { cedula: '1088334475', nombre: 'SEBASTIAN VILLADA VELASQUEZ', empresa: 'ALPINA' },
  { cedula: '1127384755', nombre: 'CAMILO ANDRES CONTRERAS RIVAS', empresa: 'ALPINA' },
  { cedula: '1088308341', nombre: 'JUAN DAVID QUINTERO GRAJALES', empresa: 'ALPINA' },
  { cedula: '1123141444', nombre: 'CRISTIAN FABIAN CAMACHO MARTINEZ', empresa: 'ALPINA' },
  { cedula: '1038926903', nombre: 'DIORLAN ANTONIO MESA FLOREZ', empresa: 'ALPINA' },
  { cedula: '1038768016', nombre: 'ANDRES FELIPE RIOS CAICEDO', empresa: 'ALPINA' },
  { cedula: '1004669724', nombre: 'QUEBIN ANDRES LOTERO ZAPATA', empresa: 'ALPINA' },
  { cedula: '1004737907', nombre: 'SANTIAGO HENAO MORALES', empresa: 'ALPINA' },
  { cedula: '1093215191', nombre: 'JHON HENRY GARCIA PATIÑO', empresa: 'ALPINA' },
  { cedula: '1007605268', nombre: 'ANDRES CAMILO MUÑOZ CAICEDO', empresa: 'ALPINA' },
  { cedula: '1006128361', nombre: 'CAMILO LEANDRO GUECHE PEÑA', empresa: 'ALPINA' },
  { cedula: '10027683',   nombre: 'GERMAN GALVEZ CORTES', empresa: 'ALPINA' },
  { cedula: '18519474',   nombre: 'OSCAR MAURICIO RESTREPO MORENO', empresa: 'ALPINA' },
  { cedula: '1088331177', nombre: 'MICHAEL STEVEN HENAO RODRIGUEZ', empresa: 'ALPINA' },
  { cedula: '1002718622', nombre: 'JUAN CAMILO COCOMA OROZCO', empresa: 'ALPINA' },
  { cedula: '1093220521', nombre: 'JUAN DIEGO FRANCO VERGARA', empresa: 'ALPINA' },
  { cedula: '1112776419', nombre: 'JAMMES ALBERTO RAMIREZ NIETO', empresa: 'ZENU' },
  { cedula: '1098724347', nombre: 'SEBASTIAN SALAZAR HENAO', empresa: 'ZENU' },
  { cedula: '1088037094', nombre: 'DANIEL FELIPE MURILLO GRANDA', empresa: 'ZENU' },
  { cedula: '1089601941', nombre: 'FELIPE MONTES RIVERA', empresa: 'ZENU' },
  { cedula: '9862197',    nombre: 'GUSTAVO ADOLFO MORALES TIRADO', empresa: 'ZENU' },
  { cedula: '1006296150', nombre: 'JHONATAN MENA GALLEGO', empresa: 'ZENU' },
  { cedula: '10005257',   nombre: 'OSCAR MAURICIO GUARUMO CLAVIJO', empresa: 'ZENU' },
  { cedula: '1004701171', nombre: 'JUAN SEBASTIAN TAMAYO PULGARIN', empresa: 'ZENU' },
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
        empresa: aux.empresa || 'GENERAL',
      };
      localStorage.setItem('consignaciones_user', JSON.stringify(user));
      return { user, error: null };
    }

    // ── LOGIN CAJERA / ADMIN POR EMAIL + CONTRASEÑA ──────────────────────────
    // ── LOGIN CAJERA / ADMIN POR EMAIL + CONTRASEÑA ──────────────────────────
    // Intentamos login real primero
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Si el login real falla (o Supabase está caído), usamos estos usuarios de producción:
      const productionUsers = [
        { id: 'cajera-eli',  email: 'eliana@consigcontrol.com',  role: 'cajera', full_name: 'Eliana (Alpina)',  pass: 'Alpina*2026E', empresa: 'ALPINA' },
        { id: 'cajera-nat',  email: 'nataly@consigcontrol.com',  role: 'cajera', full_name: 'Nataly (Alpina)',  pass: 'Alpina*2026N', empresa: 'ALPINA' },
        { id: 'cajera-cris', email: 'cristina@consigcontrol.com', role: 'cajera', full_name: 'Cristina (Zenu)',  pass: 'Zenu*2026C',   empresa: 'ZENU'   },
        { id: 'admin-1',     email: 'gerencia@consigcontrol.com', role: 'admin',  full_name: 'Dirección Operativa', pass: 'Control*2026G' },
      ];

      const found = productionUsers.find(u => u.email === email && u.pass === password);
      if (found) {
        const { pass, ...userSession } = found; // No guardamos la pass en el estado
        localStorage.setItem('consignaciones_user', JSON.stringify(userSession));
        return { user: userSession, error: null };
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
    if (!userStr) return null;
    const user = JSON.parse(userStr);
    
    // Auto-reparar sesiones viejas de auxiliares sin empresa correcta
    if (user.role === 'auxiliar') {
      const aux = AUXILIARES.find(a => a.cedula === user.cedula);
      if (aux) {
        let needsUpdate = false;
        if (user.empresa !== aux.empresa) {
          user.empresa = aux.empresa || 'GENERAL';
          needsUpdate = true;
        }
        if (user.full_name !== aux.nombre) {
          user.full_name = aux.nombre;
          needsUpdate = true;
        }
        if (needsUpdate) {
          localStorage.setItem('consignaciones_user', JSON.stringify(user));
        }
      }
    }
    return user;
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

  getConsignacionById: async (id) => {
    const { data, error } = await supabase
      .from('consignaciones')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) throw error;
    return { ...data, fecha: data.created_at };
  },

  // VERIFICAR DUPLICADOS
  // Solo bloquea si el número de comprobante ya existe (sin importar el valor).
  // Mismo valor con diferente número de comprobante → se PERMITE.
  checkDuplicate: async (numero_comprobante) => {
    const { data, error } = await supabase
      .from('consignaciones')
      .select('id')
      .eq('numero_comprobante', numero_comprobante)
      .neq('estado', 'Rechazado')
      .limit(1);
    
    if (error) throw error;
    return data && data.length > 0; // true si el número existe y no está rechazado
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
        empresa: formData.empresa || 'GENERAL',
        estado: 'Pendiente'
      }])
      .select();

    if (error) throw error;
    return { data: data[0], error: null };
  },

  // ACTUALIZAR ESTADO (REAL)
  updateConsignacionStatus: async (id, estado, motivo = null, cajera_id = null, cajera_name = null) => {
    const updateData = { estado };
    
    // Si se está validando, nos aseguramos de limpiar cualquier motivo de rechazo previo
    // y guardamos quién lo hizo
    if (estado === 'Validado') {
      updateData.motivo_rechazo = null;
      if (cajera_name) updateData.cajera_name = cajera_name;
    } else if (estado === 'Rechazado') {
      if (motivo) updateData.motivo_rechazo = motivo;
      if (cajera_name) updateData.cajera_name = cajera_name;
    }

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
