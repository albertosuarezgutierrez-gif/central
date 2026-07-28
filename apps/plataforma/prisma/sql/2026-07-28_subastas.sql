-- Radar de subastas de inmuebles (`/subastas`) — 28/07/2026
--
-- POR QUÉ: hasta hoy no había NADA que cubriera subastas. `/sivra/inversion`
-- (tabla `inmuebles_busqueda`) tiene un flag `es_subasta`, pero es un lector
-- pasivo y manual de correos de portales: 192 filas, 6 marcadas como subasta y
-- sin alimentarse desde el 19/05/2026. Este módulo es lo contrario: ingesta
-- automática de fuentes oficiales, cálculo del coste real y aviso por Telegram.
--
-- REPARTO (calcado del de concursos, que ya funciona en producción):
--   · `subastas`            → corpus GLOBAL, sin tenant. Una fila por anuncio.
--   · `subastas_criterios`  → qué busca cada cuenta.
--   · `subastas_radar`      → lo que casó, por cuenta, con snapshot jsonb.
--   · `subastas_seguidas`   → lo que Alberto marca como interesante.
--
-- MULTI-FUENTE A PROPÓSITO: la columna `fuente` permite añadir BOP, Junta,
-- Sareb o servicers sin tocar scoring, radar, avisos ni UI — solo un adaptador
-- nuevo en `lib/subastas/`.
--
-- SCOPE: `cuenta_id` (NO el `empresa_id` heredado de ialimp en concursos).
-- `requireEmpresaId()` de lib/tenant.ts devuelve exactamente ese id.
--
-- Rol prisma_plataforma es BYPASSRLS -> sin RLS. NUNCA exponer por REST/anon.

-- ── Corpus global ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subastas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Identificador de la fuente (SUB-JA-2026-123456, BOE-B-…, o el id del portal).
  dedupe_key text NOT NULL UNIQUE,
  fuente text NOT NULL DEFAULT 'boe',
  identificador text,
  boe_id text,
  -- judicial | notarial | agencia_tributaria | seguridad_social | administrativa
  -- | concursal | venta_adjudicado | otra
  tipo text NOT NULL DEFAULT 'otra',
  autoridad text,                       -- juzgado, notaría, organismo o servicer
  provincia text,
  municipio text,
  descripcion text,
  url text,

  fecha_inicio timestamptz,
  fecha_fin timestamptz,                -- conclusión: alimenta el aviso de cierre

  valor_subasta numeric,
  tasacion numeric,
  puja_minima numeric,
  tramos numeric,
  deposito numeric,                     -- 5% del valor de subasta

  cargas numeric,                       -- cargas preferentes que NO se cancelan
  cargas_texto text,
  cargas_conocidas boolean,             -- false = el anuncio NO las publica

  -- libre | ocupada | ocupada_desconocida | desconocida
  situacion_posesoria text,
  ejecutado text,                       -- fisica | juridica | desconocido (ITP vs IVA+AJD)
  porcentaje_subastado numeric,         -- <100 = proindiviso
  sin_visita boolean NOT NULL DEFAULT false,

  -- Llave para enriquecer con el Catastro y deduplicar el MISMO inmueble
  -- llegado por fuentes distintas (BOE + Sareb, p. ej.).
  ref_catastral text,
  superficie numeric,
  anio_construccion int,
  -- Valor de referencia del Catastro: base imponible del ITP desde enero 2022.
  valor_referencia numeric,

  lotes int,
  es_inmueble boolean NOT NULL DEFAULT true,

  -- Resultado, cuando la fuente lo publica. Calibra el scoring con realidad.
  resultado text,                       -- adjudicada | desierta | suspendida | cancelada
  importe_adjudicacion numeric,

  fts tsvector,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_subastas_fin ON public.subastas (fecha_fin);
CREATE INDEX IF NOT EXISTS ix_subastas_provincia ON public.subastas (provincia);
CREATE INDEX IF NOT EXISTS ix_subastas_fuente ON public.subastas (fuente);
CREATE INDEX IF NOT EXISTS ix_subastas_ref_catastral ON public.subastas (ref_catastral) WHERE ref_catastral IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_subastas_fts ON public.subastas USING gin (fts);
REVOKE ALL ON public.subastas FROM anon, authenticated;

-- ── Criterios por cuenta ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subastas_criterios (
  cuenta_id uuid PRIMARY KEY,
  activo boolean NOT NULL DEFAULT false,
  provincias text[] NOT NULL DEFAULT '{}',      -- p.ej. {Sevilla,Huelva,Cádiz}
  palabras_clave text[] NOT NULL DEFAULT '{}',
  tipos text[] NOT NULL DEFAULT '{}',           -- vacío = todos
  precio_min numeric,
  precio_max numeric,
  descuento_min int NOT NULL DEFAULT 0,         -- % mínimo para avisar
  excluir_ocupadas boolean NOT NULL DEFAULT false,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.subastas_criterios FROM anon, authenticated;

-- ── Matches por cuenta ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subastas_radar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  -- Snapshot: sobrevive a la poda del corpus y al cambio de criterios.
  subasta jsonb NOT NULL,
  puntuacion int,                       -- NULL = no calculable (sin tasación)
  motivos jsonb NOT NULL DEFAULT '[]',
  avisos jsonb NOT NULL DEFAULT '[]',
  coste_total numeric,                  -- coste "puerta abierta" al detectarlo
  descuento numeric,
  visto boolean NOT NULL DEFAULT false,
  descartado boolean NOT NULL DEFAULT false,   -- alimenta el aprendizaje de criterios
  avisado_at timestamptz,               -- idempotencia del cron de avisos
  fecha_fin timestamptz,                -- denormalizada
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS ix_subastas_radar_cuenta ON public.subastas_radar (cuenta_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_subastas_radar_por_avisar ON public.subastas_radar (cuenta_id) WHERE avisado_at IS NULL;
REVOKE ALL ON public.subastas_radar FROM anon, authenticated;

-- ── Seguimiento ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subastas_seguidas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id uuid NOT NULL,
  dedupe_key text NOT NULL,
  subasta jsonb NOT NULL,
  -- interesado | analizando | pujando | descartada | adjudicada | perdida
  estado text NOT NULL DEFAULT 'interesado',
  notas text,
  -- Puja máxima que Alberto se fija. Alimenta el aviso de tesorería (5% por subasta).
  puja_maxima numeric,
  fecha_fin timestamptz,
  recordatorio_cierre_at timestamptz,   -- idempotencia del cron de cierre
  creado_en timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cuenta_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS ix_subastas_seguidas_cuenta ON public.subastas_seguidas (cuenta_id, fecha_fin);
REVOKE ALL ON public.subastas_seguidas FROM anon, authenticated;

-- ── Ampliación (28/07/2026): datos extraídos de la descripción registral ────
-- Las descripciones del BOE son texto de registro de la propiedad: densas pero
-- muy regulares. Extraerlas a columnas es lo que permite FILTRAR de verdad
-- («viviendas de más de 100 m² con 3 dormitorios en Sevilla») y educar al
-- agente con criterios reales, en vez de depender de una búsqueda de texto.
ALTER TABLE public.subastas
  ADD COLUMN IF NOT EXISTS tipo_bien text,            -- vivienda|parcela|local|garaje|trastero|nave|finca_rustica|edificio|otro
  ADD COLUMN IF NOT EXISTS direccion text,
  ADD COLUMN IF NOT EXISTS finca_registral text,
  ADD COLUMN IF NOT EXISTS registro_propiedad text,
  ADD COLUMN IF NOT EXISTS dormitorios int,
  ADD COLUMN IF NOT EXISTS banos int,
  ADD COLUMN IF NOT EXISTS planta text,
  ADD COLUMN IF NOT EXISTS cuota_participacion numeric,  -- % en propiedad horizontal
  ADD COLUMN IF NOT EXISTS busqueda_origen text,         -- qué búsqueda guardada del BOE la encontró
  ADD COLUMN IF NOT EXISTS estado_portal text,           -- Celebrándose | Próxima apertura | Concluida…
  ADD COLUMN IF NOT EXISTS enriquecida_at timestamptz;   -- última pasada de ficha/Catastro

CREATE INDEX IF NOT EXISTS ix_subastas_tipo_bien ON public.subastas (tipo_bien);
CREATE INDEX IF NOT EXISTS ix_subastas_superficie ON public.subastas (superficie);

-- ── Enriquecimiento externo (28/07/2026): ficha del portal + Catastro ───────
ALTER TABLE public.subastas
  ADD COLUMN IF NOT EXISTS cantidad_reclamada numeric,        -- deuda reclamada en el procedimiento
  ADD COLUMN IF NOT EXISTS arrendamiento_inscrito boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telefono_autoridad text,
  ADD COLUMN IF NOT EXISTS email_autoridad text,
  ADD COLUMN IF NOT EXISTS codigo_postal text,
  ADD COLUMN IF NOT EXISTS superficie_catastro numeric,       -- m² oficiales (≠ escritura)
  ADD COLUMN IF NOT EXISTS uso_catastral text,
  ADD COLUMN IF NOT EXISTS direccion_catastro text;
