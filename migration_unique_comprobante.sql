-- MIGRACIÓN: Índice único parcial para numero_comprobante
-- Ejecuta esto en el SQL Editor de Supabase:
-- https://supabase.com/dashboard/project/zlhbvmlylzxeovtkedws/sql
--
-- Este índice impide a nivel de base de datos que se inserte un mismo número de
-- comprobante en dos registros que no estén en estado 'Rechazado'.
-- Un comprobante rechazado puede ser re-registrado; los activos (Pendiente/Validado/Cuadrado) no.

CREATE UNIQUE INDEX IF NOT EXISTS idx_comprobante_unico
  ON public.consignaciones (numero_comprobante)
  WHERE estado <> 'Rechazado';
