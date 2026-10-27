-- 2026-10-27_sivra_facturas_huesped.sql — Facturas a HUÉSPEDES de los pisos turísticos (sivra), emitidas por plataforma.
--
-- Hasta hoy se hacían a mano en Smoobu. A partir de aquí plataforma es la ÚNICA fuente de numeración de esta serie:
-- 🚨 no se puede seguir emitiendo en Smoobu con la misma serie (habría dos contadores y saldrían duplicados/huecos).
--
-- Flujo: solicitud (enlace con token) → el huésped rellena sus datos fiscales → BORRADOR (sin número) → Telegram a
-- Alberto → ✅ → se asigna número (aquí, y solo aquí) → emitida → correo con el PDF → enviada.
--
-- Tres tablas:
--   · sivra_factura_series     — configuración de la serie (prefijo, año, siguiente número, tipo de IVA).
--                                FAIL-CLOSED: `siguiente_numero` NULL o `tipo_iva` NULL = «Alberto aún no lo ha dicho»
--                                → se pueden preparar borradores, pero NO se emite.
--   · sivra_factura_solicitudes — una por reserva viva; el `token` es el del enlace público /factura/<token>.
--   · sivra_facturas_huesped    — la factura (borrador mutable · emitida/enviada INMUTABLE, lo garantiza un trigger).
--
-- Numeración correlativa sin huecos ni duplicados:
--   1) la app hace `SELECT … FROM sivra_factura_series … FOR UPDATE` dentro de la misma transacción que numera
--      (serializa dos ✅ simultáneos) y sube `siguiente_numero` en esa transacción (si algo falla, rollback de ambos);
--   2) índice único (serie_id, numero) como red si alguien salta el paso 1;
--   3) trigger `sivra_factura_numero_correlativo`: el número que se asigna DEBE ser el siguiente_numero de la serie
--      y no puede dejar hueco respecto al máximo ya emitido.
--
-- Rectificativas: FUERA de v1. Queda previsto `tipo='rectificativa'`, `rectifica_a` y el estado `rectificada`.
-- VeriFactu: FUERA de v1 (`verifactu_huella` queda NULL; ver TODO en lib/sivra/facturas/emitir.ts).
--
-- Idempotente. NO aplicado a la BD real desde la sesión que lo escribió: lo aplica Alberto (o la sesión principal con su OK).

BEGIN;

CREATE TABLE IF NOT EXISTS public.sivra_factura_series (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL REFERENCES public.cuentas(id) ON DELETE RESTRICT,
  prefijo          text NOT NULL CHECK (prefijo ~ '^[A-Z0-9]{1,8}$'),
  anio             integer NOT NULL CHECK (anio BETWEEN 2024 AND 2100),
  -- NULL = número inicial PENDIENTE de Alberto (no se emite). Una vez emitida la primera, lo sube la app.
  siguiente_numero integer CHECK (siguiente_numero IS NULL OR siguiente_numero >= 1),
  -- NULL = tipo de IVA PENDIENTE de Alberto (no se emite). 0 exige `mencion_iva` (causa de exención/no sujeción).
  tipo_iva         numeric(5,2) CHECK (tipo_iva IS NULL OR (tipo_iva >= 0 AND tipo_iva <= 21)),
  mencion_iva      text,
  activa           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sivra_factura_series_exencion CHECK (tipo_iva IS NULL OR tipo_iva > 0 OR length(btrim(coalesce(mencion_iva, ''))) >= 10)
);
CREATE UNIQUE INDEX IF NOT EXISTS sivra_factura_series_unica ON public.sivra_factura_series (cuenta_id, prefijo, anio);
-- Una sola serie ACTIVA por cuenta y año: la emisión no tiene que elegir.
CREATE UNIQUE INDEX IF NOT EXISTS sivra_factura_series_activa ON public.sivra_factura_series (cuenta_id, anio) WHERE activa;

CREATE TABLE IF NOT EXISTS public.sivra_factura_solicitudes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL REFERENCES public.cuentas(id) ON DELETE RESTRICT,
  token            text NOT NULL CHECK (length(token) >= 32),
  reservation_id   text NOT NULL,
  property_id      text NOT NULL,
  origen           text NOT NULL CHECK (origen IN ('agente', 'manual')),
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'completada', 'cancelada')),
  -- Datos fiscales del huésped (NULL hasta que los rellena él o Alberto). Validados en la app (`validarReceptor`).
  receptor_tipo    text CHECK (receptor_tipo IS NULL OR receptor_tipo IN ('empresa', 'particular')),
  receptor_nombre  text,
  receptor_nif     text,
  receptor_pais    text CHECK (receptor_pais IS NULL OR receptor_pais ~ '^[A-Z]{2}$'),
  receptor_email   text,
  receptor_direccion jsonb,
  expira_at        timestamptz NOT NULL DEFAULT now() + interval '90 days',
  completada_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sivra_factura_solicitudes_token ON public.sivra_factura_solicitudes (token);
-- Una solicitud viva por reserva: el agente y el alta manual reutilizan la misma (mismo enlace).
CREATE UNIQUE INDEX IF NOT EXISTS sivra_factura_solicitudes_reserva ON public.sivra_factura_solicitudes (reservation_id) WHERE estado <> 'cancelada';

CREATE TABLE IF NOT EXISTS public.sivra_facturas_huesped (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id        uuid NOT NULL REFERENCES public.cuentas(id) ON DELETE RESTRICT,
  solicitud_id     uuid REFERENCES public.sivra_factura_solicitudes(id) ON DELETE RESTRICT,
  reservation_id   text NOT NULL,
  property_id      text NOT NULL,
  tipo             text NOT NULL DEFAULT 'ordinaria' CHECK (tipo IN ('ordinaria', 'rectificativa')),
  rectifica_a      uuid REFERENCES public.sivra_facturas_huesped(id) ON DELETE RESTRICT,
  estado           text NOT NULL DEFAULT 'borrador' CHECK (estado IN ('borrador', 'emitida', 'enviada', 'rectificada')),
  serie_id         uuid REFERENCES public.sivra_factura_series(id) ON DELETE RESTRICT,
  serie_prefijo    text,
  anio             integer,
  numero           integer CHECK (numero IS NULL OR numero >= 1),
  numero_completo  text,
  fecha_expedicion date,
  fecha_operacion_desde date,
  fecha_operacion_hasta date,
  concepto         text NOT NULL,
  emisor           jsonb NOT NULL,
  receptor         jsonb NOT NULL,
  -- TOTAL que pagó el huésped, IVA INCLUIDO (de `incomes.amount_gross`). Base y cuota se derivan del total al emitir.
  total            numeric(12,2) NOT NULL CHECK (total > 0),
  base             numeric(12,2),
  tipo_iva         numeric(5,2),
  cuota            numeric(12,2),
  mencion_iva      text,
  pdf              bytea,
  verifactu_huella text,
  telegram_message_id bigint,
  emitida_at       timestamptz,
  enviada_at       timestamptz,
  envio_en_curso_at timestamptz,
  envio_intentos   integer NOT NULL DEFAULT 0,
  envio_error      text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Emitida = todo lo fiscal presente.
  CONSTRAINT sivra_facturas_huesped_emitida_completa CHECK (
    estado = 'borrador' OR (
      serie_id IS NOT NULL AND serie_prefijo IS NOT NULL AND anio IS NOT NULL AND numero IS NOT NULL
      AND numero_completo IS NOT NULL AND fecha_expedicion IS NOT NULL AND base IS NOT NULL
      AND tipo_iva IS NOT NULL AND cuota IS NOT NULL AND pdf IS NOT NULL AND emitida_at IS NOT NULL)),
  -- Un borrador NO lleva número: el número se asigna SOLO al aprobar.
  CONSTRAINT sivra_facturas_huesped_borrador_sin_numero CHECK (estado <> 'borrador' OR (numero IS NULL AND numero_completo IS NULL)),
  CONSTRAINT sivra_facturas_huesped_cuadre CHECK (base IS NULL OR cuota IS NULL OR base + cuota = total),
  CONSTRAINT sivra_facturas_huesped_enviada CHECK (estado <> 'enviada' OR enviada_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS sivra_facturas_huesped_numero ON public.sivra_facturas_huesped (serie_id, numero) WHERE numero IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sivra_facturas_huesped_numero_completo ON public.sivra_facturas_huesped (cuenta_id, numero_completo) WHERE numero_completo IS NOT NULL;
-- Una factura ordinaria viva por reserva (la corrección de una emitida será una rectificativa).
CREATE UNIQUE INDEX IF NOT EXISTS sivra_facturas_huesped_reserva ON public.sivra_facturas_huesped (reservation_id) WHERE tipo = 'ordinaria' AND estado <> 'rectificada';
CREATE INDEX IF NOT EXISTS sivra_facturas_huesped_listado ON public.sivra_facturas_huesped (cuenta_id, fecha_expedicion);

-- ── Inmutabilidad de la emitida ──────────────────────────────────────────────────────────────────────────────────
-- Una vez fuera de 'borrador', lo fiscal no cambia NUNCA. Solo se permite: emitida→enviada (y los campos de envío),
-- y →rectificada (cuando exista la rectificativa). Tampoco se borra.
CREATE OR REPLACE FUNCTION public.sivra_factura_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.estado <> 'borrador' THEN
      RAISE EXCEPTION 'factura % emitida: no se borra (se rectifica)', OLD.numero_completo;
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.estado <> 'borrador' THEN
    IF (NEW.cuenta_id, NEW.reservation_id, NEW.property_id, NEW.tipo, NEW.serie_id, NEW.serie_prefijo, NEW.anio,
        NEW.numero, NEW.numero_completo, NEW.fecha_expedicion, NEW.fecha_operacion_desde, NEW.fecha_operacion_hasta,
        NEW.concepto, NEW.emisor, NEW.receptor, NEW.total, NEW.base, NEW.tipo_iva, NEW.cuota, NEW.mencion_iva,
        NEW.pdf, NEW.emitida_at, NEW.verifactu_huella)
       IS DISTINCT FROM
       (OLD.cuenta_id, OLD.reservation_id, OLD.property_id, OLD.tipo, OLD.serie_id, OLD.serie_prefijo, OLD.anio,
        OLD.numero, OLD.numero_completo, OLD.fecha_expedicion, OLD.fecha_operacion_desde, OLD.fecha_operacion_hasta,
        OLD.concepto, OLD.emisor, OLD.receptor, OLD.total, OLD.base, OLD.tipo_iva, OLD.cuota, OLD.mencion_iva,
        OLD.pdf, OLD.emitida_at, OLD.verifactu_huella) THEN
      RAISE EXCEPTION 'factura % emitida: inmutable (las correcciones van por rectificativa)', OLD.numero_completo;
    END IF;
    IF NEW.estado = 'borrador' THEN
      RAISE EXCEPTION 'factura % emitida: no vuelve a borrador', OLD.numero_completo;
    END IF;
    IF OLD.estado = 'enviada' AND NEW.estado = 'emitida' THEN
      RAISE EXCEPTION 'factura % ya enviada: no vuelve a emitida', OLD.numero_completo;
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sivra_factura_inmutable ON public.sivra_facturas_huesped;
CREATE TRIGGER sivra_factura_inmutable BEFORE UPDATE OR DELETE ON public.sivra_facturas_huesped
  FOR EACH ROW EXECUTE FUNCTION public.sivra_factura_inmutable();

-- ── Correlatividad ───────────────────────────────────────────────────────────────────────────────────────────────
-- Al pasar de borrador a emitida, el número debe ser EXACTAMENTE el `siguiente_numero` de su serie y, si ya hay
-- emitidas en la serie, el máximo + 1 (sin huecos). La app ya lo hace bajo FOR UPDATE; esto es la red.
CREATE OR REPLACE FUNCTION public.sivra_factura_numero_correlativo() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  s public.sivra_factura_series%ROWTYPE;
  maximo integer;
BEGIN
  IF OLD.estado = 'borrador' AND NEW.estado <> 'borrador' THEN
    SELECT * INTO s FROM public.sivra_factura_series WHERE id = NEW.serie_id;
    IF NOT FOUND OR s.siguiente_numero IS NULL OR s.tipo_iva IS NULL THEN
      RAISE EXCEPTION 'serie sin configurar: no se emite';
    END IF;
    IF NEW.cuenta_id <> s.cuenta_id OR NEW.serie_prefijo <> s.prefijo OR NEW.anio <> s.anio THEN
      RAISE EXCEPTION 'la factura no casa con su serie';
    END IF;
    IF NEW.numero <> s.siguiente_numero THEN
      RAISE EXCEPTION 'número % fuera de orden (siguiente de la serie: %)', NEW.numero, s.siguiente_numero;
    END IF;
    SELECT max(numero) INTO maximo FROM public.sivra_facturas_huesped WHERE serie_id = NEW.serie_id AND numero IS NOT NULL;
    IF maximo IS NOT NULL AND NEW.numero <> maximo + 1 THEN
      RAISE EXCEPTION 'número % dejaría hueco (último emitido: %)', NEW.numero, maximo;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sivra_factura_numero_correlativo ON public.sivra_facturas_huesped;
CREATE TRIGGER sivra_factura_numero_correlativo BEFORE UPDATE ON public.sivra_facturas_huesped
  FOR EACH ROW EXECUTE FUNCTION public.sivra_factura_numero_correlativo();

-- La serie: el contador nunca baja (bajarlo reabriría números ya usados).
CREATE OR REPLACE FUNCTION public.sivra_factura_serie_contador() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.siguiente_numero IS NOT NULL AND (NEW.siguiente_numero IS NULL OR NEW.siguiente_numero < OLD.siguiente_numero) THEN
    RAISE EXCEPTION 'el siguiente número de la serie no puede bajar (% → %)', OLD.siguiente_numero, NEW.siguiente_numero;
  END IF;
  IF (NEW.cuenta_id, NEW.prefijo, NEW.anio) IS DISTINCT FROM (OLD.cuenta_id, OLD.prefijo, OLD.anio)
     AND EXISTS (SELECT 1 FROM public.sivra_facturas_huesped WHERE serie_id = OLD.id AND numero IS NOT NULL) THEN
    RAISE EXCEPTION 'la serie ya tiene facturas emitidas: prefijo/año no cambian';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sivra_factura_serie_contador ON public.sivra_factura_series;
CREATE TRIGGER sivra_factura_serie_contador BEFORE UPDATE ON public.sivra_factura_series
  FOR EACH ROW EXECUTE FUNCTION public.sivra_factura_serie_contador();

-- Datos personales de huéspedes: fuera del alcance de anon/authenticated (la BD es compartida con ialimp y su anon key).
ALTER TABLE public.sivra_factura_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sivra_factura_solicitudes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sivra_facturas_huesped ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sivra_factura_series, public.sivra_factura_solicitudes, public.sivra_facturas_huesped FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.sivra_factura_series TO prisma_plataforma;
GRANT SELECT, INSERT, UPDATE ON public.sivra_factura_solicitudes TO prisma_plataforma;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sivra_facturas_huesped TO prisma_plataforma;

COMMIT;

-- ── Configuración PENDIENTE DE ALBERTO (no se ejecuta: plantilla) ────────────────────────────────────────────────
-- Cuenta de Alberto = la dueña de los negocios con ref_ext = prop_* (medido el 27/10/2026: una sola cuenta).
-- INSERT INTO public.sivra_factura_series (cuenta_id, prefijo, anio, siguiente_numero, tipo_iva, mencion_iva)
-- SELECT s.cuenta_id, 'HS', 2026, <NUMERO_INICIAL>, <TIPO_IVA>, <MENCION_SI_IVA_0>
--   FROM public.negocios n JOIN public.sociedades s ON s.id = n.sociedad_id WHERE n.ref_ext = 'prop_house_sevillana';
-- Cada año nuevo necesita su fila (sin ella, el ✅ avisa «falta configurar la serie de <año>»).
