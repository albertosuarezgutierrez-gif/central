-- Tabla `gastos_fijos` — plantillas de gastos recurrentes mensuales de importe
-- conocido (alquileres, comunidades, seguros…). El cron /api/expenses/fijos/generar
-- (vercel.json, "0 6 1 * *") las imputa en `gastos` el día configurado de cada mes.
--
-- Las tablas raw de sivra (gastos, gastos_reglas, agente_log, gastos_fijos) NO viven
-- en prisma/schema.prisma: se crean directo en Supabase. Este fichero es el registro
-- versionado del DDL aplicado (migración `create_gastos_fijos`).
--
-- RLS habilitado SIN políticas, igual que `gastos`: solo accesible por la conexión
-- directa (Prisma de sivra). La anon key de ialimp (BD compartida) NO la ve.

CREATE TABLE IF NOT EXISTS public.gastos_fijos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concepto        text NOT NULL,
  proveedor       text,
  nif_proveedor   text,
  categoria       text NOT NULL DEFAULT 'OTRO',
  propiedad       text,
  base_imponible  numeric,
  iva             numeric,
  iva_porcentaje  numeric,
  irpf            numeric,
  irpf_porcentaje numeric,
  total           numeric NOT NULL,
  dia_mes         integer NOT NULL DEFAULT 1,
  activo          boolean NOT NULL DEFAULT true,
  notas           text,
  fingerprint     text,            -- casa con gastos_reglas y con la factura real
  origen          text,            -- 'seed' | 'regla' | 'manual'
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

ALTER TABLE public.gastos_fijos ENABLE ROW LEVEL SECURITY;

-- Una sola plantilla por huella (evita importar dos veces la misma regla).
CREATE UNIQUE INDEX IF NOT EXISTS gastos_fijos_fingerprint_uidx
  ON public.gastos_fijos (fingerprint) WHERE fingerprint IS NOT NULL;

-- Sincronización (la hace también el cron vía sincronizarReglasFijas):
-- importa las reglas mensuales aprendidas que aún no estén, casando por fingerprint.
--   INSERT INTO public.gastos_fijos (...) SELECT ... FROM public.gastos_reglas r
--   WHERE r.activa AND r.periodicidad='mensual' AND r.fingerprint IS NOT NULL
--     AND NOT EXISTS (SELECT 1 FROM public.gastos_fijos f WHERE f.fingerprint = r.fingerprint);

-- Rollback: DROP TABLE public.gastos_fijos;
