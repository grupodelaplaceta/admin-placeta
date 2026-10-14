-- ═══════════════════════════════════════════════════════════════════════
--  FIX CRÍTICO · Placeta Junior
--  La tabla junior_transacciones tiene una CHECK constraint antigua
--  (junior_transacciones_tipo_check) que solo permitía: canje, ganar, rbu.
--
--  La app Android y la web guardan ahora los nuevos tipos y el INSERT
--  falla con error 23514:
--    "new row for relation junior_transacciones violates check
--     constraint junior_transacciones_tipo_check"
--
--  Ese fallo produce exactamente:
--   • Actividades: "No se pudo guardar el resultado" al terminar.
--   • Canje de puntos: HTTP 503 "El banco confirmó el abono, pero no se
--     pudo registrar el canje. Contacta con soporte antes de repetirlo."
--
--  EJECUTAR UNA SOLA VEZ en el SQL Editor de Supabase (proyecto RSP).
--  Es seguro re-ejecutarlo (usa IF EXISTS y los valores existentes
--  canje/ganar/rbu están incluidos en la nueva lista).
-- ═══════════════════════════════════════════════════════════════════════

-- (Opcional) Ver la definición actual del constraint:
-- SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--  WHERE conname = 'junior_transacciones_tipo_check';

-- 1) Eliminar la constraint antigua (si existe)
ALTER TABLE junior_transacciones
  DROP CONSTRAINT IF EXISTS junior_transacciones_tipo_check;

-- 2) Recrearla admitiendo TODOS los tipos que usa el servidor
--    (incluye los históricos canje/ganar/rbu más los nuevos)
ALTER TABLE junior_transacciones
  ADD CONSTRAINT junior_transacciones_tipo_check
  CHECK (tipo IN (
    'punto_verde',        -- puntos verdes de una actividad
    'punto_rojo',         -- puntos rojos de una actividad
    'canje_puntos',       -- canje de puntos por Placetas
    'recompensa_actividad',-- recompensa abonada al terminar una actividad
    'compra_actividad',   -- compra de actividad premium
    'rbu',                -- Renta Básica Universal Junior
    'transferencia',      -- envío entre amigos
    'ganar',              -- legado: recompensas antiguas / recibos
    'canje'               -- legado: canjes antiguos
  ));
