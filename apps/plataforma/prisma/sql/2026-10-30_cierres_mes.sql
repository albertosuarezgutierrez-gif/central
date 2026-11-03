-- 2026-10-30_cierres_mes.sql — Cierre contable MENSUAL por unidad (piso o negocio) + titularidad de los pisos.
--
-- F1 del cierre mensual (lógica pura en `lib/cierre-mes.ts`, lecturas en `lib/cierre-mes-db.ts`, cron
-- `/api/cron/cierre-mes` los días 5 y 15). Dos tablas:
--
--   · cierres_mes            — una fila por (cuenta, mes 'AAAA-MM', unidad). `unidad` = id del piso (`prop_*`,
--                              igual que `properties.id` / `gastos.propiedad`) o `negocio:<ref_ext>` para un negocio.
--                              `checks` guarda la última evaluación (lista de checks con estado ok | pendiente |
--                              no_se_sabe, `aceptado` y detalle). Un mes `cerrado` bloquea (409) las escrituras de
--                              `gastos` de esa unidad y mes hasta que se REABRE con motivo.
--   · propiedad_titularidad  — porcentaje de cada titular en cada piso (base del reparto de la renta en F3).
--
-- Reglas:
--   · El mes cerrado es un SNAPSHOT: el cron no recalcula una fila `cerrado` (WHERE en el upsert de la app).
--   · `reabierto` exige motivo (CHECK). Reabrir no borra `cerrado_at`: queda el rastro del cierre anterior.
--   · Sin FK a `properties`: esa tabla es de sivra (otra app la gestiona); la coherencia de ids la vigila la app.
--
-- Idempotente. NO aplicado a la BD real desde la sesión que lo escribió: lo aplica Alberto (o la sesión
-- principal con su OK).

BEGIN;

CREATE TABLE IF NOT EXISTS public.cierres_mes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL REFERENCES public.cuentas(id) ON DELETE RESTRICT,
  mes              text NOT NULL CHECK (mes ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  unidad           text NOT NULL CHECK (unidad ~ '^(prop_[a-z0-9_]+|negocio:[A-Za-z0-9_-]+)$'),
  estado           text NOT NULL DEFAULT 'abierto'
                   CHECK (estado IN ('abierto', 'en_revision', 'cerrado', 'reabierto')),
  -- Última evaluación: [{id, titulo, estado, aceptado, detalle, items[]}]. NULL = aún no evaluado (≠ []).
  checks           jsonb,
  -- 'cuadra' | 'pendiente' | 'no_se_sabe'. NULL = aún no evaluado.
  veredicto        text CHECK (veredicto IS NULL OR veredicto IN ('cuadra', 'pendiente', 'no_se_sabe')),
  calculado_at     timestamptz,
  cerrado_at       timestamptz,
  cerrado_por      text,
  reabierto_at     timestamptz,
  reabierto_motivo text,
  reabierto_por    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cierres_mes_unico UNIQUE (cuenta_id, mes, unidad),
  CONSTRAINT cierres_mes_cerrado_con_fecha CHECK (estado <> 'cerrado' OR cerrado_at IS NOT NULL),
  CONSTRAINT cierres_mes_reabierto_con_motivo
    CHECK (estado <> 'reabierto' OR (reabierto_at IS NOT NULL AND length(btrim(coalesce(reabierto_motivo, ''))) >= 5))
);

-- El guard de escrituras pregunta «¿está cerrado (mes, unidad)?» en cada alta/edición/borrado de gasto.
CREATE INDEX IF NOT EXISTS cierres_mes_cerrados_idx ON public.cierres_mes (mes, unidad) WHERE estado = 'cerrado';

COMMENT ON TABLE public.cierres_mes IS
  'Cierre contable mensual por unidad (piso prop_* o negocio:<ref>). Mes cerrado = gastos de esa unidad/mes bloqueados (409) salvo reapertura con motivo. Ver lib/cierre-mes.ts.';

CREATE TABLE IF NOT EXISTS public.propiedad_titularidad (
  propiedad_id text NOT NULL CHECK (propiedad_id ~ '^prop_[a-z0-9_]+$'),
  titular      text NOT NULL CHECK (titular IN ('alberto', 'pilar')),
  porcentaje   numeric(5,2) NOT NULL CHECK (porcentaje > 0 AND porcentaje <= 100),
  -- 'propiedad' = el inmueble es suyo · 'arrendamiento' = lo explota arrendado a su nombre (subarriendo turístico).
  regimen      text NOT NULL CHECK (regimen IN ('propiedad', 'arrendamiento')),
  -- NULL = «desde que consta» (no se sabe la fecha exacta; no inventar una).
  desde        date,
  notas        text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (propiedad_id, titular)
);

COMMENT ON TABLE public.propiedad_titularidad IS
  'Porcentaje de cada titular por piso (suma 100 por propiedad_id; lo comprueba la app). Base del reparto de la renta (F3).';

-- Valores iniciales (Alberto, 30/10/2026). ON CONFLICT DO NOTHING: si alguien ya los corrigió, no se pisan.
INSERT INTO public.propiedad_titularidad (propiedad_id, titular, porcentaje, regimen, notas) VALUES
  ('prop_house_sevillana', 'alberto', 50,  'propiedad',     'Casa Socorro (Calle Socorro 24): 50 % Alberto / 50 % Pilar'),
  ('prop_house_sevillana', 'pilar',   50,  'propiedad',     'Casa Socorro (Calle Socorro 24): 50 % Alberto / 50 % Pilar'),
  ('prop_duplex_center',   'alberto', 100, 'propiedad',     NULL),
  ('prop_luxury_busto',    'alberto', 100, 'arrendamiento', 'Bustos Tavera 22 Bajo Dcha, arrendado a nombre de Alberto'),
  ('prop_busto_reform',    'alberto', 100, 'arrendamiento', 'Bustos Tavera 22 Bajo Izda, arrendado a nombre de Alberto')
ON CONFLICT (propiedad_id, titular) DO NOTHING;

COMMIT;

-- Verificación tras aplicar:
--   SELECT propiedad_id, sum(porcentaje) FROM propiedad_titularidad GROUP BY 1;   -- todas = 100
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.cierres_mes'::regclass;
