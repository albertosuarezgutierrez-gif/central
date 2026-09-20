-- Sesiones por DISPOSITIVO en plataforma (19/09/2026).
-- Hasta hoy `cuentas.session_jti` guardaba UN jti: cada login lo pisaba y expulsaba al resto de
-- dispositivos (entrar desde el PC echaba al móvil y viceversa). Ahora vale una lista acotada.
-- `session_jti` NO se borra: asegura/transporte/alquiler/almacen/mariscos la declaran en su
-- schema de Prisma (sin leerla ni escribirla) y un SELECT sin `select` la pediría.
-- Aplicar como postgres por el Supabase MCP. Idempotente.

ALTER TABLE public.cuentas
  ADD COLUMN IF NOT EXISTS session_jtis text[] NOT NULL DEFAULT '{}';

-- La sesión viva de hoy sigue valiendo: no obliga a volver a entrar en ningún sitio.
UPDATE public.cuentas
   SET session_jtis = ARRAY[session_jti]
 WHERE session_jti IS NOT NULL AND cardinality(session_jtis) = 0;
