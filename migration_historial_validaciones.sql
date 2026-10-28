-- ══════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Tabla historial_validaciones
-- Ejecutar en: https://supabase.com/dashboard/project/zlhbvmlylzxeovtkedws/sql
-- ══════════════════════════════════════════════════════════════════
--
-- Guarda cada validación de extracto bancario realizada desde el
-- Validador Extracto del AdminPanel.
--
-- Diseño compacto:
--   - Una fila por validación (no una fila por movimiento)
--   - El detalle completo se guarda como JSONB comprimido
--   - Solo se guardan los campos mínimos necesarios por movimiento
--
-- Espacio estimado por validación:
--   - 300 movimientos × ~150 bytes/mov ≈ 45 KB por validación
--   - 12 meses × 4 bancos = 48 validaciones/año ≈ 2.2 MB/año
-- ══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.historial_validaciones (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Quién validó
  admin_id      TEXT NOT NULL,        -- user.id del admin
  admin_name    TEXT NOT NULL,        -- user.full_name

  -- Qué se validó
  banco         TEXT NOT NULL,        -- 'Bancolombia', 'Davivienda', 'Buzon_Atlas', 'Zenu_SAP'
  periodo_desde DATE,                 -- rango de fechas del extracto
  periodo_hasta DATE,

  -- Resumen (para listado rápido sin leer el detalle)
  total_movimientos  INTEGER NOT NULL DEFAULT 0,
  total_coinciden    INTEGER NOT NULL DEFAULT 0,
  total_revisar      INTEGER NOT NULL DEFAULT 0,
  total_no_encontrados INTEGER NOT NULL DEFAULT 0,
  suma_total         NUMERIC NOT NULL DEFAULT 0,
  suma_coinciden     NUMERIC NOT NULL DEFAULT 0,

  -- Detalle comprimido: array de objetos con solo los campos necesarios
  -- Cada objeto: { f: fecha, d: descripcion, v: valor, e: estado,
  --               vr: valorRegistrado, dif: diferencia,
  --               aux: auxiliar_name, bco: banco_app, m: metodo, comp: comprobante }
  detalle       JSONB
);

-- Índice para consultas por admin y banco
CREATE INDEX IF NOT EXISTS idx_historial_admin
  ON public.historial_validaciones (admin_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_historial_banco
  ON public.historial_validaciones (banco, created_at DESC);

-- RLS: solo admins pueden leer/escribir
ALTER TABLE public.historial_validaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for now" ON public.historial_validaciones
  FOR ALL USING (true) WITH CHECK (true);
