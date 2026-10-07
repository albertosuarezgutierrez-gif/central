-- PROPUESTA DE ESCENARIOS (07/10/2026): varios presupuestos de la MISMA oportunidad que se le
-- enseñan al cliente juntos. Caso real: el Mercedes de Rafael con dos escenarios
--   P1 · Ana tomadora y conductora, Rafael propietario
--   P2 · Rafael tomador y propietario, Ana conductora
--
-- ⚠️ SIN APLICAR. Aplicar ANTES de desplegar el código que la nombra (orden de la casa: primero la
--    BD, después el puerto). Sin las tablas, `/api/operador/presupuesto/propuesta` responde
--    `sin_tabla` (503) y la pantalla lo dice: no es «no hay propuestas», es «no se han podido mirar».
--
-- Qué es y qué NO es:
--   · Es un LOTE: una fila con su referencia propia (`ASP-AA-NNNN`) + una tabla puente con los
--     presupuestos, en el orden en que se eligieron. Todo aditivo, nada se borra.
--   · NO copia precios ni figuras: el documento se arma leyendo cada `presupuesto` (sus opciones
--     visibles, congeladas) y su `tarificaciones.peticion`. Una copia sería una segunda verdad.
--   · NO tiene estado propio de envío por presupuesto: cada presupuesto del lote se sella IGUAL que
--     en el envío individual (`enviado_at`, `enlace_generado_at`, eventos). Aquí solo queda cuándo y
--     por qué canal se avisó DEL LOTE, para enseñarlo en la ficha.
--   · Un borrador por defecto: crearla no avisa a nadie. El aviso lo pulsa Alberto.
--
-- 🛡️ Aislamiento: `correduria_id` en las DOS tablas, y un trigger que exige que propuesta, item y
--    presupuesto sean de la MISMA correduría (con BYPASSRLS un id ajeno no falla: devuelve lo de
--    otro). Que todos los presupuestos sean de la MISMA oportunidad lo comprueba el código al crear
--    (vía `tarificaciones.oportunidad_id`), dentro de la misma transacción.
--
-- 🚪 Permisos: solo `prisma_seguros` (el puerto de asegura). Ni el portal (`prisma_asegura_portal`:
--    darle lectura es un PR con su cepo en test/regression-portal-aislamiento.test.ts), ni la ingesta
--    de Manuel (`crm_seguros`, que recibe DML en `seguros` por privilegios por defecto: se le QUITA),
--    ni `anon`/`authenticated`. RLS activada sin políticas, como las hermanas.
--
-- Se deshace con: drop table ×3 (item, propuesta, contador), drop function ×4.
BEGIN;

SET search_path = seguros, public;


-- ════════════════════════════════════════════════════════════════════════════
-- 1. El contador de la referencia (correduría + año), aparte del de presupuestos
-- ════════════════════════════════════════════════════════════════════════════
-- Aparte a propósito: compartir el de `AS-AA-NNNN` gastaría números de presupuesto, y la
-- referencia de un presupuesto es lo que el cliente tiene apuntado.
CREATE TABLE IF NOT EXISTS seguros.presupuesto_propuesta_contador (
  correduria_id uuid     NOT NULL,
  anio          smallint NOT NULL,
  ultimo        integer  NOT NULL CHECK (ultimo >= 1),
  PRIMARY KEY (correduria_id, anio)
);

COMMENT ON TABLE seguros.presupuesto_propuesta_contador IS
  'Último número ASP-AA-NNNN por correduría y año. Solo lo escribe '
  'seguros.siguiente_referencia_propuesta(); a mano, nunca (se repetirían referencias).';

-- Año de Madrid, como el de presupuestos. Sin carreras: el ON CONFLICT bloquea la fila del contador
-- hasta el final de la transacción.
CREATE OR REPLACE FUNCTION seguros.siguiente_referencia_propuesta(p_correduria uuid, p_momento timestamptz)
RETURNS text LANGUAGE plpgsql AS $fn$
DECLARE
  v_anio smallint := extract(year from (coalesce(p_momento, now()) at time zone 'Europe/Madrid'))::smallint;
  v_n    integer;
BEGIN
  INSERT INTO seguros.presupuesto_propuesta_contador AS c (correduria_id, anio, ultimo)
  VALUES (p_correduria, v_anio, 1)
  ON CONFLICT (correduria_id, anio) DO UPDATE SET ultimo = c.ultimo + 1
  RETURNING c.ultimo INTO v_n;
  RETURN 'ASP-' || lpad((v_anio % 100)::text, 2, '0') || '-' || lpad(v_n::text, 4, '0');
END;
$fn$;


-- ════════════════════════════════════════════════════════════════════════════
-- 2. La propuesta (el lote)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.presupuesto_propuesta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id   uuid NOT NULL REFERENCES seguros.corredurias (id),
  oportunidad_id  uuid NOT NULL REFERENCES seguros.oportunidades (id) ON DELETE CASCADE,
  -- La pone la BD (trigger), nunca la app. Única por correduría e inmutable.
  referencia      text NOT NULL,
  creado_at       timestamptz NOT NULL DEFAULT now(),
  creado_por      text NOT NULL,
  -- El ÚLTIMO aviso del lote que consta. NULL = no se ha avisado por ningún canal (borrador).
  -- 🚨 `whatsapp_enlace` + `avisado_at` = se abrió WhatsApp, NO que saliera: lo que salió de verdad
  --    está en el `enviado_at` de cada presupuesto (Alberto confirma «ya lo he mandado»).
  canal_aviso     text CHECK (canal_aviso IN ('email', 'whatsapp_enlace')),
  avisado_at      timestamptz,
  retirada_at     timestamptz,
  CONSTRAINT presupuesto_propuesta_referencia_formato CHECK (referencia ~ '^ASP-[0-9]{2}-[0-9]{4,}$'),
  CONSTRAINT presupuesto_propuesta_aviso_completo CHECK ((canal_aviso IS NULL) = (avisado_at IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_presupuesto_propuesta_referencia
  ON seguros.presupuesto_propuesta (correduria_id, referencia);
CREATE INDEX IF NOT EXISTS idx_presupuesto_propuesta_oportunidad
  ON seguros.presupuesto_propuesta (correduria_id, oportunidad_id, creado_at DESC);

COMMENT ON TABLE seguros.presupuesto_propuesta IS
  'Lote de presupuestos de UNA oportunidad que se enseñan juntos (escenarios: otro tomador, otro '
  'conductor…). Sin copia de precios: el documento lee cada presupuesto. Crearla no avisa a nadie.';


-- ════════════════════════════════════════════════════════════════════════════
-- 3. La tabla puente (qué presupuestos, en qué orden)
-- ════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS seguros.presupuesto_propuesta_item (
  propuesta_id    uuid NOT NULL REFERENCES seguros.presupuesto_propuesta (id) ON DELETE CASCADE,
  -- `restrict`: un presupuesto que está en una propuesta no desaparece dejándola a medias.
  presupuesto_id  uuid NOT NULL REFERENCES seguros.presupuesto (id) ON DELETE RESTRICT,
  correduria_id   uuid NOT NULL,
  orden           smallint NOT NULL CHECK (orden BETWEEN 1 AND 10),
  PRIMARY KEY (propuesta_id, presupuesto_id),
  CONSTRAINT presupuesto_propuesta_item_orden_unico UNIQUE (propuesta_id, orden)
);

CREATE INDEX IF NOT EXISTS idx_presupuesto_propuesta_item_presupuesto
  ON seguros.presupuesto_propuesta_item (presupuesto_id);


-- ════════════════════════════════════════════════════════════════════════════
-- 4. Triggers: referencia, inmutabilidad y misma correduría
-- ════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION seguros.presupuesto_propuesta_referencia()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.referencia IS NULL THEN
      NEW.referencia := seguros.siguiente_referencia_propuesta(NEW.correduria_id, coalesce(NEW.creado_at, now()));
    END IF;
  ELSIF NEW.referencia IS DISTINCT FROM OLD.referencia
     OR NEW.correduria_id IS DISTINCT FROM OLD.correduria_id
     OR NEW.oportunidad_id IS DISTINCT FROM OLD.oportunidad_id THEN
    RAISE EXCEPTION 'propuesta %: referencia, correduría y oportunidad no se cambian', OLD.id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS presupuesto_propuesta_referencia ON seguros.presupuesto_propuesta;
CREATE TRIGGER presupuesto_propuesta_referencia
  BEFORE INSERT OR UPDATE ON seguros.presupuesto_propuesta
  FOR EACH ROW EXECUTE FUNCTION seguros.presupuesto_propuesta_referencia();

-- Item, propuesta y presupuesto: la MISMA correduría, o no entra. El fallo seguro es negarse.
CREATE OR REPLACE FUNCTION seguros.presupuesto_propuesta_item_misma_correduria()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE
  v_prop uuid;
  v_pres uuid;
BEGIN
  SELECT correduria_id INTO v_prop FROM seguros.presupuesto_propuesta WHERE id = NEW.propuesta_id;
  SELECT correduria_id INTO v_pres FROM seguros.presupuesto WHERE id = NEW.presupuesto_id;
  IF v_prop IS DISTINCT FROM NEW.correduria_id OR v_pres IS DISTINCT FROM NEW.correduria_id THEN
    RAISE EXCEPTION 'propuesta %: el presupuesto % no es de la misma correduría', NEW.propuesta_id, NEW.presupuesto_id;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS presupuesto_propuesta_item_misma_correduria ON seguros.presupuesto_propuesta_item;
CREATE TRIGGER presupuesto_propuesta_item_misma_correduria
  BEFORE INSERT OR UPDATE ON seguros.presupuesto_propuesta_item
  FOR EACH ROW EXECUTE FUNCTION seguros.presupuesto_propuesta_item_misma_correduria();


-- ════════════════════════════════════════════════════════════════════════════
-- 5. RLS y permisos
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE seguros.presupuesto_propuesta_contador ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.presupuesto_propuesta          ENABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.presupuesto_propuesta_item     ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON seguros.presupuesto_propuesta_contador FROM PUBLIC, anon, authenticated, crm_seguros;
REVOKE ALL ON seguros.presupuesto_propuesta          FROM PUBLIC, anon, authenticated, crm_seguros;
REVOKE ALL ON seguros.presupuesto_propuesta_item     FROM PUBLIC, anon, authenticated, crm_seguros;

-- Sin DELETE en la propuesta: se RETIRA (`retirada_at`), no se borra (es lo que se le enseñó a alguien).
GRANT SELECT, INSERT, UPDATE ON seguros.presupuesto_propuesta_contador TO prisma_seguros;
GRANT SELECT, INSERT, UPDATE ON seguros.presupuesto_propuesta          TO prisma_seguros;
GRANT SELECT, INSERT         ON seguros.presupuesto_propuesta_item     TO prisma_seguros;
GRANT EXECUTE ON FUNCTION seguros.siguiente_referencia_propuesta(uuid, timestamptz) TO prisma_seguros;
-- Los default privileges del schema (`prisma_seguros=arwd`, ver 2026-10-06c) dan DELETE/UPDATE a toda tabla
-- nueva aunque el GRANT de arriba sea más corto: se quitan a mano. El item es la FOTO de lo que se enseñó
-- (solo SELECT + INSERT). REVOKE es idempotente.
REVOKE DELETE, TRUNCATE ON seguros.presupuesto_propuesta_contador FROM prisma_seguros;
REVOKE DELETE, TRUNCATE ON seguros.presupuesto_propuesta          FROM prisma_seguros;
REVOKE DELETE, TRUNCATE ON seguros.presupuesto_propuesta_item     FROM prisma_seguros;
REVOKE UPDATE           ON seguros.presupuesto_propuesta_item     FROM prisma_seguros;

COMMIT;


-- ════════════════════════════════════════════════════════════════════════════
-- Comprobación tras aplicar (las dos tienen que dar 0 filas):
--   select id from seguros.presupuesto_propuesta where referencia !~ '^ASP-[0-9]{2}-[0-9]{4,}$';
--   select i.* from seguros.presupuesto_propuesta_item i
--     join seguros.presupuesto_propuesta p on p.id = i.propuesta_id
--     join seguros.presupuesto pr on pr.id = i.presupuesto_id
--    where p.correduria_id <> i.correduria_id or pr.correduria_id <> i.correduria_id;
-- ════════════════════════════════════════════════════════════════════════════
