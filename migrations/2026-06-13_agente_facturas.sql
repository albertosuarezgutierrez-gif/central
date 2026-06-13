-- Agente de facturas SIVRA — migración aditiva (DB COMPARTIDA con ialimp).
-- Solo columnas nullable + tablas nuevas. NO toca RLS, buckets ni GRANTs.

-- gastos: columnas aditivas (irpf, confianza, revisado YA existen)
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS irpf_porcentaje numeric;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS origen text;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS motivo_revision text;
CREATE INDEX IF NOT EXISTS idx_gastos_fingerprint ON public.gastos(fingerprint);
CREATE INDEX IF NOT EXISTS idx_gastos_revisado ON public.gastos(revisado);

-- reglas aprendidas (memoria del agente)
CREATE TABLE IF NOT EXISTS public.gastos_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text UNIQUE NOT NULL,
  proveedor text, nif_proveedor text,
  propiedad text, categoria text,
  iva_porcentaje numeric, irpf_porcentaje numeric,
  importe_esperado numeric, importe_min numeric, importe_max numeric,
  periodicidad text DEFAULT 'mensual',
  vistas int DEFAULT 1,
  ultima_fecha date,
  activa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- auditoría del agente
CREATE TABLE IF NOT EXISTS public.agente_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente text, fingerprint text, gasto_id uuid,
  decision text, confianza numeric, motivo text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- seed: alquiler Kutxabank (Bustos Tavera 22) — recurrente mensual
INSERT INTO public.gastos_reglas
  (fingerprint, proveedor, nif_proveedor, propiedad, categoria, iva_porcentaje, irpf_porcentaje, importe_esperado, importe_min, importe_max, periodicidad, vistas, activa)
VALUES
  ('gutierrez alcala maria:derecha','GUTIERREZ ALCALA, MARIA',NULL,'prop_luxury_busto','ALQUILER',21,19,309.38,300,320,'mensual',2,true),
  ('gutierrez alcala maria:izquierda','GUTIERREZ ALCALA, MARIA',NULL,'prop_busto_reform','ALQUILER',21,19,259.16,250,270,'mensual',2,true)
ON CONFLICT (fingerprint) DO NOTHING;

-- seed: gastos PERSONALES recurrentes (no pisos) → prop_personal, entran directos
INSERT INTO public.gastos_reglas
  (fingerprint, proveedor, nif_proveedor, propiedad, categoria, iva_porcentaje, irpf_porcentaje, importe_esperado, importe_min, importe_max, periodicidad, vistas, activa)
VALUES
  ('A85677342','CODEOSCOPIC S.A.','A85677342','prop_personal','OTRO',21,0,769.56,720,820,'variable',2,true),
  ('A81864498','TIREA / CIMA','A81864498','prop_personal','OTRO',21,0,181.50,165,200,'puntual',2,true),
  ('asisa','ASISA',NULL,'prop_personal','SEGURO',0,0,211.60,195,230,'mensual',2,true)
ON CONFLICT (fingerprint) DO NOTHING;
