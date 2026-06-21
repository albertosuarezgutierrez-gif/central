-- Apartado de DEDUCCIONES FISCALES del módulo /finanzas (apps/plataforma).
-- Datos familiares/fiscales por cuenta (no existían en la BD) + novedades normativas
-- detectadas por el vigilante `.claude/skills/fiscal-novedades` + justificantes + histórico.
-- Multi-tenant: TODO cuelga de cuentas(id). Aplicar en Supabase wswbehlcuxqxyinousql.

-- Situación fiscal/familiar (1 fila por cuenta).
CREATE TABLE IF NOT EXISTS public.fiscal_perfil (
  cuenta_id                   uuid PRIMARY KEY REFERENCES public.cuentas(id) ON DELETE CASCADE,
  comunidad_autonoma          text        NOT NULL DEFAULT 'andalucia',
  declaracion_conjunta        boolean     NOT NULL DEFAULT true,
  familia_numerosa            text,                       -- 'general' | 'especial' | NULL
  conyuge_trabaja             boolean     NOT NULL DEFAULT false, -- madre autónoma/cuenta ajena
  gasto_guarderia_anual       numeric     NOT NULL DEFAULT 0,
  aportacion_plan_pensiones   numeric     NOT NULL DEFAULT 0,
  grado_discapacidad_titular  integer     NOT NULL DEFAULT 0,
  grado_discapacidad_conyuge  integer     NOT NULL DEFAULT 0,
  ascendientes_a_cargo        integer     NOT NULL DEFAULT 0,
  ascendientes_mayores_75     integer     NOT NULL DEFAULT 0,
  donativos_anual             numeric     NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- Descendientes (hijos) que dan derecho a mínimos/deducciones.
CREATE TABLE IF NOT EXISTS public.fiscal_descendientes (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id           uuid        NOT NULL REFERENCES public.cuentas(id) ON DELETE CASCADE,
  nombre              text        NOT NULL,
  fecha_nacimiento    date        NOT NULL,
  grado_discapacidad  integer     NOT NULL DEFAULT 0,
  computo_completo    boolean     NOT NULL DEFAULT true, -- false = 50 % (custodia compartida)
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fiscal_descendientes_cuenta ON public.fiscal_descendientes(cuenta_id);

-- Cambios normativos detectados por el vigilante BOE/BOJA (alimentan el aviso en pantalla).
CREATE TABLE IF NOT EXISTS public.fiscal_novedades (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anio             integer     NOT NULL,
  clave            text        NOT NULL,            -- 'maternidad', 'fn_general', ...
  importe_anterior numeric,
  importe_nuevo    numeric,
  beneficia        boolean     NOT NULL DEFAULT false,
  ambito           text        NOT NULL DEFAULT 'estatal', -- 'estatal' | 'andalucia'
  fuente_url       text,
  detectado_at     timestamptz NOT NULL DEFAULT now(),
  descartado       boolean     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_fiscal_novedades_activas ON public.fiscal_novedades(beneficia, descartado);

-- Justificantes vinculados (se apoya en la skill facturas-correo: archiva en Drive).
CREATE TABLE IF NOT EXISTS public.fiscal_justificantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid        NOT NULL REFERENCES public.cuentas(id) ON DELETE CASCADE,
  anio          integer     NOT NULL,
  clave         text        NOT NULL,               -- deducción a la que justifica
  drive_file_id text,
  url           text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fiscal_justificantes_cuenta ON public.fiscal_justificantes(cuenta_id, anio);

-- Histórico interanual: cuánto se ahorró cada año / por deducción.
CREATE TABLE IF NOT EXISTS public.fiscal_historico (
  cuenta_id            uuid        NOT NULL REFERENCES public.cuentas(id) ON DELETE CASCADE,
  anio                 integer     NOT NULL,
  cuota_liquida        numeric     NOT NULL DEFAULT 0,
  deducciones_total    numeric     NOT NULL DEFAULT 0,
  ahorro_por_deduccion jsonb       NOT NULL DEFAULT '{}'::jsonb,
  resultado            numeric     NOT NULL DEFAULT 0,
  actualizado_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cuenta_id, anio)
);
