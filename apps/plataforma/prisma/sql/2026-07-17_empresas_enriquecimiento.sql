-- Fase 2 "Empresas en dificultad": enriquecimiento (eInforma) + ficha cualitativa manual + ledger de coste.
-- Aplicada por Supabase MCP como postgres el 2026-07-17.
-- Corpus GLOBAL (como borme_eventos / concursos_licitaciones): herramienta interna, sin cuenta_id.
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon (BD compartida con anon de ialimp).

-- Datos financieros que SOLO llegan por el enriquecimiento de pago (cuentas depositadas + morosidad).
-- 1 fila por empresa (empresa_norm = clave de enlace con borme_eventos). Vacía hasta contratar eInforma.
CREATE TABLE IF NOT EXISTS public.empresas_enriquecimiento (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_norm     text UNIQUE NOT NULL,
  cif              text,
  razon_social     text,
  cnae             text,
  facturacion      numeric,              -- € del último ejercicio (para el filtro de facturación)
  n_empleados      int,
  patrimonio_neto  numeric,              -- < 0 o ~0 = señal
  ebitda_n         numeric,              -- último ejercicio
  ebitda_n1        numeric,              -- ejercicio anterior (para "negativo 2 años")
  fondo_maniobra   numeric,              -- activo corriente - pasivo corriente
  ultimo_deposito  date,                 -- fecha del último depósito de cuentas (retraso = hoy - fecha)
  incidencias_pago boolean,              -- RAI / ASNEF / impagos registrados
  incidencias_detalle text,
  deuda_financiera numeric,
  deuda_ebitda     numeric,              -- ratio deuda financiera / EBITDA (> 6 = señal)
  refinanciaciones int,                  -- nº de refinanciaciones/novaciones detectadas
  fuente           text NOT NULL DEFAULT 'einforma',
  coste_eur        numeric NOT NULL DEFAULT 0,
  payload          jsonb,                -- respuesta cruda del proveedor (auditoría)
  actualizado_en   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empresas_enriq_cnae_idx ON public.empresas_enriquecimiento (cnae);
CREATE INDEX IF NOT EXISTS empresas_enriq_fact_idx ON public.empresas_enriquecimiento (facturacion);

-- Capa CUALITATIVA MANUAL (bloque E del diseño): la rellena Alberto a mano, ninguna API la da.
-- Usable YA, sin depender de eInforma.
CREATE TABLE IF NOT EXISTS public.empresas_ficha (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_norm       text UNIQUE NOT NULL,
  ceo_edad           int,
  consejo_edad_media int,
  salud_nota         text,               -- texto libre (p.ej. "socio mayoritario enfermo")
  descendencia       boolean,            -- relevo generacional Sí/No
  preconcurso        boolean,            -- comunicación art. 5 bis
  notas              text,
  actualizado_en     timestamptz NOT NULL DEFAULT now()
);

-- Ledger de coste del enriquecimiento (para el tope de gasto mensual). 1 fila por consulta de pago.
CREATE TABLE IF NOT EXISTS public.empresas_enriquecimiento_coste (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_norm text NOT NULL,
  coste_eur    numeric NOT NULL,
  fuente       text NOT NULL,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS empresas_enriq_coste_fecha_idx ON public.empresas_enriquecimiento_coste (creado_en);

REVOKE ALL ON public.empresas_enriquecimiento       FROM anon, authenticated;
REVOKE ALL ON public.empresas_ficha                 FROM anon, authenticated;
REVOKE ALL ON public.empresas_enriquecimiento_coste FROM anon, authenticated;
