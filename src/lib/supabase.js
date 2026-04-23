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

export const mockAuth = {
  signIn: async (email, password) => {
    // Intentar login real con Supabase
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    
    if (error) {
      // Si falla el real (porque quizás no has creado los usuarios en Auth), 
      // mantenemos el fallback para que puedas seguir probando.
      console.warn("Auth real falló, usando lógica de prueba:", error.message);
      
      const mockUsers = [
        { id: '1', email: 'aux@test.com', role: 'auxiliar', full_name: 'Ana Auxiliar', password: '123' },
        { id: '2', email: 'cajera@test.com', role: 'cajera', full_name: 'Carmen Cajera', password: '123' },
        { id: '3', email: 'admin@test.com', role: 'admin', full_name: 'Admin Jefe', password: '123' }
      ];
      
      const user = mockUsers.find(u => u.email === email && u.password === password);
      if (user) {
        localStorage.setItem('consignaciones_user', JSON.stringify(user));
        return { user, error: null };
      }
      return { user: null, error: { message: 'Credenciales inválidas' } };
    }
    
    // Si el login real funciona, necesitamos obtener el rol (asumiendo tabla 'profiles' o metadata)
    // Por ahora, simulamos el rol basado en el email para que la app funcione de una
    const role = email.includes('admin') ? 'admin' : email.includes('cajera') ? 'cajera' : 'auxiliar';
    const user = {
      id: data.user.id,
      email: data.user.email,
      role: role,
      full_name: data.user.user_metadata?.full_name || email.split('@')[0]
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
  }
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

  // AGREGAR CONSIGNACIÓN (REAL)
  addConsignacion: async (formData) => {
    // 1. Subir imagen al Storage si es necesario (opcional, aquí enviamos la URL ya generada o el blob)
    // Por ahora insertamos directamente los datos en la tabla
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
