-- Ofertas multicompañía DENTRO de la oportunidad → presupuesto único al cliente (05/10/2026, F2).
--
-- Plan: «Ofertas multicompañía dentro de la oportunidad» (F2). Alberto tarifica comunidades/pymes en
-- varias compañías y recibe PDFs heterogéneos; aquí se suben a la oportunidad, la IA los lee (con cita
-- de página), el corredor los REVISA y se consolidan en UN presupuesto de los de siempre.
--
-- ⚠️ NO APLICADA. Aplicar ANTES de desplegar el código que la nombra (orden de la casa: primero la BD,
--    después el puerto): asegura declara `origen`, `oportunidad_id`, `estudio` y `oferta_id` en su
--    schema Prisma, y un `findFirst` sin `select` sobre `presupuesto` moriría en producción con la
--    columna aún sin crear. Al revés no rompe nada: todo es aditivo y con DEFAULT, y la única columna
--    que se relaja (`tarificacion_id`) la siguen escribiendo SIEMPRE los presupuestos de Codeoscopic
--    (lo exige el CHECK `presupuesto_codeoscopic_con_tarificacion`).
--
-- Qué hace (una transacción; si algo falla a medias no queda nada a medio poner):
--   1. `seguros.oportunidad_oferta`: el STAGING. Una fila por PDF subido (la póliza actual del cliente
--      o la oferta de una compañía). Aquí se lee y se revisa; no toca el flujo vivo de presupuestos.
--   2. `presupuesto`: `tarificacion_id` pasa a NULLABLE, y `origen` dice de dónde salen los precios:
--      `codeoscopic` (tarificación pagada en Avant2, lo de siempre) u `ofertas` (PDFs de compañías
--      revisados por el corredor). CHECK: codeoscopic ⇒ con tarificación; ofertas ⇒ SIN tarificación
--      (así ningún camino que llegue a Codeoscopic por `tarificacion_id` —emisión, ReRate, cuenta
--      firmada, «simulado»— puede casar un presupuesto de ofertas: NULL no es igual a nada).
--      `oportunidad_id` (ofertas: de qué oportunidad sale; los de Codeoscopic la heredan de su
--      tarificación y la dejan a NULL) y `estudio` (la comparación congelada + la narrativa).
--   3. `presupuesto_opcion.oferta_id`: la oferta de la que sale la opción (snapshot, igual que
--      `precio_id` con `tarificacion_precios`). Una opción sale de UN sitio: o precio o oferta.
--      Y un papel nuevo de portada, `recomendada`: la que el CORREDOR recomienda tras revisar (no un
--      cálculo). No necesita `grupo_cobertura`: no afirma un nivel, afirma una recomendación firmada
--      por quien asesora.
--   4. El trigger `presupuesto_no_enviar_simulado()` se reescribe (CREATE OR REPLACE): la rama de
--      Codeoscopic queda EXACTA a `2026-09-21b_presupuesto_trigger_no_simulado_fix.sql`; la de
--      `ofertas` exige que TODA opción visible salga de una oferta REVISADA de su misma oportunidad.
--      Nada de lo que no ha visto el corredor sale de casa.
--   5. Permisos: `prisma_seguros` (la app). El portal (`prisma_asegura_portal`) solo recibe
--      `SELECT (origen)` del presupuesto, para pintar distinto lo que no se emite por Avant2. La tabla
--      de ofertas NO se le concede: lleva la evidencia literal de los PDFs y las notas de revisión.
--
-- Se deshace con: drop trigger/func (y re-aplicar 2026-09-21b), drop constraint ×7, drop column ×4,
-- `alter column tarificacion_id set not null` (solo si no hay filas `ofertas`), drop table.
BEGIN;

SET search_path = seguros, public;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. Las ofertas de la oportunidad (staging)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.oportunidad_oferta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  oportunidad_id  uuid NOT NULL REFERENCES seguros.oportunidades (id) ON DELETE CASCADE,
  -- El PDF del que sale. NULL = el fichero se borró DESPUÉS: la oferta y su evidencia literal quedan.
  documento_id    uuid REFERENCES seguros.documentos (id) ON DELETE SET NULL,
  -- `actual` = la póliza que el cliente tiene hoy (contra la que se compara); `oferta` = una compañía.
  rol             text NOT NULL CHECK (rol IN ('actual', 'oferta')),
  -- 🚨 NULL = «no figura en el documento / no se ha leído», NUNCA «no hay» ni 0.
  compania        text,
  producto        text,
  prima_neta      numeric(12, 2) CHECK (prima_neta IS NULL OR prima_neta >= 0),
  prima_total     numeric(12, 2) CHECK (prima_total IS NULL OR prima_total >= 0),
  -- Formato `OfertaNormalizada.garantias` de @central/module-seguros (comparar-ofertas.ts): clave
  -- canónica (o texto literal de la compañía si no casa con la taxonomía) → {estado, capital, limite,
  -- franquicia, evidencia:{pagina, texto}}. NULL = no se ha podido leer; '{}' = leída y sin garantías.
  garantias       jsonb CHECK (garantias IS NULL OR jsonb_typeof(garantias) = 'object'),
  -- Lo demás que se leyó (franquicia general, vigencia, forma de pago, texto literal por garantía,
  -- motivo si la IA no pudo leerla…). Sin PII del tomador.
  datos_extra     jsonb CHECK (datos_extra IS NULL OR jsonb_typeof(datos_extra) = 'object'),
  estado          text NOT NULL DEFAULT 'extraida' CHECK (estado IN ('extraida', 'revisada', 'descartada')),
  recomendada     boolean NOT NULL DEFAULT false,
  revisada_at     timestamptz,
  revisada_por    text,
  creado_por      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Revisar es firmar que se ha mirado: con quién y cuándo, y una compañía legible.
  CONSTRAINT oferta_revisada_con_sello CHECK (
    estado <> 'revisada' OR (revisada_at IS NOT NULL AND revisada_por IS NOT NULL AND compania IS NOT NULL)
  ),
  -- Se recomienda una OFERTA viva; la póliza actual no se «recomienda».
  CONSTRAINT oferta_recomendada_viva CHECK (NOT recomendada OR (rol = 'oferta' AND estado <> 'descartada'))
);

-- Una sola recomendada por oportunidad, y una sola póliza actual viva.
CREATE UNIQUE INDEX IF NOT EXISTS oportunidad_oferta_una_recomendada
  ON seguros.oportunidad_oferta (oportunidad_id) WHERE recomendada;
CREATE UNIQUE INDEX IF NOT EXISTS oportunidad_oferta_una_actual
  ON seguros.oportunidad_oferta (oportunidad_id) WHERE rol = 'actual' AND estado <> 'descartada';
CREATE INDEX IF NOT EXISTS oportunidad_oferta_por_oportunidad
  ON seguros.oportunidad_oferta (correduria_id, oportunidad_id, created_at);

COMMENT ON TABLE seguros.oportunidad_oferta IS
  'Ofertas (PDF) subidas a una oportunidad: póliza actual o presupuesto de una compañía, leídas por IA '
  'con evidencia y REVISADAS por el corredor antes de consolidarse en un presupuesto (origen ofertas). '
  'NULL = no figura / no leído, nunca 0. No se borran: se descartan.';
COMMENT ON COLUMN seguros.oportunidad_oferta.garantias IS
  'OfertaNormalizada.garantias (module-seguros/comparar-ofertas.ts) con evidencia {pagina, texto}. '
  'NULL = no se pudo leer; {} = leída sin garantías.';

ALTER TABLE seguros.oportunidad_oferta ENABLE ROW LEVEL SECURITY;
-- La ingesta de Manuel (`crm_seguros`) recibe DML en `seguros` por privilegios por defecto: se le quita.
REVOKE ALL ON seguros.oportunidad_oferta FROM PUBLIC, anon, authenticated, crm_seguros;
-- Sin DELETE a propósito: una oferta que ya se consolidó es el origen de lo que se le enseñó a alguien.
GRANT SELECT, INSERT, UPDATE ON seguros.oportunidad_oferta TO prisma_seguros;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. El presupuesto: origen, tarificación opcional, oportunidad y estudio
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.presupuesto ALTER COLUMN tarificacion_id DROP NOT NULL;

ALTER TABLE seguros.presupuesto ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'codeoscopic';
ALTER TABLE seguros.presupuesto ADD COLUMN IF NOT EXISTS oportunidad_id uuid REFERENCES seguros.oportunidades (id);
ALTER TABLE seguros.presupuesto ADD COLUMN IF NOT EXISTS estudio jsonb;

ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_origen_valido;
ALTER TABLE seguros.presupuesto
  ADD CONSTRAINT presupuesto_origen_valido CHECK (origen IN ('codeoscopic', 'ofertas'));

-- 🚨 El cinturón de todo lo que llega a Codeoscopic: un presupuesto de Avant2 SIEMPRE tiene su
-- tarificación (era el NOT NULL), y uno de ofertas NUNCA (así no casa con ninguna emisión/ReRate).
ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_codeoscopic_con_tarificacion;
ALTER TABLE seguros.presupuesto
  ADD CONSTRAINT presupuesto_codeoscopic_con_tarificacion CHECK (origen <> 'codeoscopic' OR tarificacion_id IS NOT NULL);
ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_ofertas_sin_tarificacion;
ALTER TABLE seguros.presupuesto
  ADD CONSTRAINT presupuesto_ofertas_sin_tarificacion CHECK (origen <> 'ofertas' OR tarificacion_id IS NULL);
-- Un presupuesto de ofertas sale de una oportunidad y lleva su estudio congelado (sin él, el PDF no
-- puede decir qué se comparó). La FK sin ON DELETE: borrar la oportunidad de un presupuesto ya
-- preparado falla en voz alta, que es lo que tiene que pasar.
ALTER TABLE seguros.presupuesto DROP CONSTRAINT IF EXISTS presupuesto_ofertas_con_oportunidad;
ALTER TABLE seguros.presupuesto
  ADD CONSTRAINT presupuesto_ofertas_con_oportunidad CHECK (origen <> 'ofertas' OR (oportunidad_id IS NOT NULL AND estudio IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_presupuesto_oportunidad
  ON seguros.presupuesto (oportunidad_id) WHERE oportunidad_id IS NOT NULL;

COMMENT ON COLUMN seguros.presupuesto.origen IS
  'De dónde salen los precios: codeoscopic (tarificación pagada en Avant2; tarificacion_id obligatorio) '
  'u ofertas (PDFs de compañías revisados; SIN tarificación, NUNCA se emite ni re-tarifica por Avant2: '
  'se emite en la compañía).';
COMMENT ON COLUMN seguros.presupuesto.estudio IS
  'Solo origen ofertas: la comparación congelada (compararOfertas) y la narrativa validada contra sus cifras.';


-- ════════════════════════════════════════════════════════════════════════════
-- 3. Las opciones: de qué oferta salen, y el papel «recomendada»
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.presupuesto_opcion
  ADD COLUMN IF NOT EXISTS oferta_id uuid REFERENCES seguros.oportunidad_oferta (id);

ALTER TABLE seguros.presupuesto_opcion DROP CONSTRAINT IF EXISTS opcion_de_un_solo_origen;
ALTER TABLE seguros.presupuesto_opcion
  ADD CONSTRAINT opcion_de_un_solo_origen CHECK (oferta_id IS NULL OR precio_id IS NULL);

ALTER TABLE seguros.presupuesto_opcion DROP CONSTRAINT IF EXISTS papeles_conocidos;
ALTER TABLE seguros.presupuesto_opcion ADD CONSTRAINT papeles_conocidos CHECK (
  papeles <@ ARRAY['equivalente', 'mas_barata', 'mejor_cubierta', 'recomendada']::text[]
);
-- 🚨 Sin subconsultas (Postgres no las admite en un CHECK: ver 2026-09-21_presupuesto.sql).
ALTER TABLE seguros.presupuesto_opcion DROP CONSTRAINT IF EXISTS papeles_sin_repetir;
ALTER TABLE seguros.presupuesto_opcion ADD CONSTRAINT papeles_sin_repetir CHECK (
  cardinality(papeles) =
    (CASE WHEN 'equivalente'    = ANY (papeles) THEN 1 ELSE 0 END)
  + (CASE WHEN 'mas_barata'     = ANY (papeles) THEN 1 ELSE 0 END)
  + (CASE WHEN 'mejor_cubierta' = ANY (papeles) THEN 1 ELSE 0 END)
  + (CASE WHEN 'recomendada'    = ANY (papeles) THEN 1 ELSE 0 END)
);
-- Los papeles CALCULADOS siguen exigiendo nivel leído; `recomendada` (decisión del corredor) no.
ALTER TABLE seguros.presupuesto_opcion DROP CONSTRAINT IF EXISTS portada_con_grupo;
ALTER TABLE seguros.presupuesto_opcion ADD CONSTRAINT portada_con_grupo CHECK (
  papeles <@ ARRAY['recomendada']::text[] OR grupo_cobertura IS NOT NULL
);

COMMENT ON COLUMN seguros.presupuesto_opcion.oferta_id IS
  'La oferta (oportunidad_oferta) de la que sale la opción en un presupuesto de origen ofertas. '
  'Snapshot: editar la oferta después no cambia lo que se le enseñó al cliente.';


-- ════════════════════════════════════════════════════════════════════════════
-- 4. El trigger de salida: simulado (Codeoscopic) / sin revisar (ofertas)
-- ════════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER, como antes. El portal solo hace UPDATE(visto_at): con los sellos de salida sin
-- cambiar sale por el atajo y NO lee ninguna tabla (por eso no necesita GRANT sobre las ofertas).
CREATE OR REPLACE FUNCTION seguros.presupuesto_no_enviar_simulado()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  es_simulado boolean;
  n_visibles integer;
  n_sin_revisar integer;
BEGIN
  IF NEW.enviado_at IS NULL AND NEW.enlace_generado_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.enviado_at IS NOT DISTINCT FROM OLD.enviado_at
     AND NEW.enlace_generado_at IS NOT DISTINCT FROM OLD.enlace_generado_at THEN
    RETURN NEW;
  END IF;

  -- Ofertas de compañías: no hay tarificación que mirar. Lo que no sale es lo que el corredor no ha
  -- REVISADO: toda opción visible tiene que venir de una oferta revisada de SU oportunidad, y tiene
  -- que haber al menos una.
  IF NEW.origen = 'ofertas' THEN
    SELECT count(*)::int,
           count(*) FILTER (WHERE f.id IS NULL OR f.estado <> 'revisada'
                                  OR f.oportunidad_id IS DISTINCT FROM NEW.oportunidad_id)::int
      INTO n_visibles, n_sin_revisar
      FROM seguros.presupuesto_opcion o
      LEFT JOIN seguros.oportunidad_oferta f ON f.id = o.oferta_id
     WHERE o.presupuesto_id = NEW.id AND o.oculta_at IS NULL;
    IF n_visibles = 0 OR n_sin_revisar > 0 THEN
      RAISE EXCEPTION
        'presupuesto %: hay opciones que no salen de una oferta revisada (o no hay ninguna); lo que el corredor no ha revisado no se le enseña a un cliente',
        NEW.id;
    END IF;
    RETURN NEW;
  END IF;

  -- Un origen que no se conoce no se da por bueno (el CHECK ya lo impide; esto es el cinturón).
  IF NEW.origen IS DISTINCT FROM 'codeoscopic' THEN
    RAISE EXCEPTION 'presupuesto %: origen % desconocido; no se envía', NEW.id, NEW.origen;
  END IF;

  SELECT t.simulado INTO es_simulado
    FROM seguros.tarificaciones t
   WHERE t.id = NEW.tarificacion_id;

  IF es_simulado IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'presupuesto %: su tarificación es simulada (o no se ha podido comprobar); un precio que no ha dado ninguna compañía no se le enseña a un cliente',
      NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;


-- ════════════════════════════════════════════════════════════════════════════
-- 5. Permisos del portal
-- ════════════════════════════════════════════════════════════════════════════
-- El portal lee por COLUMNAS (apps/asegura-portal/prisma/sql/2026-09-21_portal_presupuesto_grants.sql).
-- `origen` sí: decide si la aceptación dice «se emite en la compañía». `oportunidad_id`, `estudio` y
-- `presupuesto_opcion.oferta_id` NO: son internos (el estudio para el cliente sale en el PDF).
GRANT SELECT (origen) ON seguros.presupuesto TO prisma_asegura_portal;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar (todas 0 filas):
--   select id from seguros.presupuesto where origen = 'codeoscopic' and tarificacion_id is null;
--   select id from seguros.presupuesto where origen not in ('codeoscopic', 'ofertas');
--   select oportunidad_id from seguros.oportunidad_oferta where recomendada group by 1 having count(*) > 1;
-- Ensayo del trigger (dentro de un BEGIN … ROLLBACK): un presupuesto ofertas con una opción cuya
-- oferta esté 'extraida' → `update … set enlace_generado_at = now()` tiene que dar P0001.
-- ════════════════════════════════════════════════════════════════════════════
