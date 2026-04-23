-- schema.sql
-- Ejecuta esto en el SQL Editor de tu proyecto Supabase (https://supabase.com/dashboard/project/zlhbvmlylzxeovtkedws/sql)

-- 1. Tabla de Consignaciones
CREATE TABLE IF NOT EXISTS public.consignaciones (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  banco TEXT NOT NULL, -- Ej: 'Bancolombia 6061', 'Alpina Agrario', etc.
  valor NUMERIC NOT NULL,
  numero_comprobante TEXT NOT NULL,
  file_url TEXT NOT NULL,
  estado TEXT CHECK (estado IN ('Pendiente', 'Validado', 'Rechazado')) DEFAULT 'Pendiente',
  auxiliar_id TEXT NOT NULL, -- ID del usuario que envía
  auxiliar_name TEXT NOT NULL, -- Nombre para visualización rápida
  motivo_rechazo TEXT,
  cajera_id TEXT -- ID de la cajera que valida
);

-- Habilitar RLS (Row Level Security) - Por ahora permitimos todo para que pruebes rápido
ALTER TABLE public.consignaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for now" ON public.consignaciones
  FOR ALL USING (true) WITH CHECK (true);

-- 2. Configurar el Storage para las imágenes (Opcional, pero recomendado)
-- Ve a la sección 'Storage' en Supabase y crea un Bucket llamado 'comprobantes' y ponlo como PUBLIC.
