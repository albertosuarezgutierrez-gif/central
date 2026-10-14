-- 2026-10-14b — El nº de recibo de Occident casa con su devolución aunque CIMA le ponga sufijo.
--
-- CIMA guarda los recibos de Occident (DGS C0468) en `poliza_recibos.id_recibo` como `400000001-K`
-- (sufijo `-<LETRA>`; 229 de 245 recibos de C0468 el 14/10/2026), pero el correo de devolución de
-- Occident trae `400000001`. Todo el emparejado comparaba `ltrim(id_recibo, '0')` y para Occident
-- nunca casaba: el trigger no protegía el `devuelto` frente a la ingesta ni enlazaba la devolución.
--
-- Regla ÚNICA (la misma que `normalizarIdRecibo()` de `@central/module-seguros` y que
-- `apps/asegura/lib/id-recibo-sql.ts`):  regexp_replace(ltrim(x, '0'), '-[A-Z]$', '')
--
-- Colisiones medidas el 14/10/2026 (solo lectura): 0 pares de recibos DISTINTOS de la misma correduría
-- y compañía con el mismo nº normalizado; 0 devoluciones con guion en `recibo_devolucion`. Aun así:
-- · el puerto (`registrarDevoluciones`) devuelve `ambiguo` y no registra si dos recibos casan;
-- · los triggers de abajo NO tocan nada si el nº es ambiguo (no eligen uno).
--
-- Aditiva y sin pérdida: cambia la expresión de la columna generada (PG ≥ 17, `SET EXPRESSION` la
-- recalcula en las filas existentes y reconstruye el índice) y reescribe las dos funciones de trigger.
-- El código desplegado funciona igual ANTES y DESPUÉS de aplicarla (escribe la expresión entera).
--
-- Reversión (deja todo como en 2026-09-29c/g):
--   ALTER TABLE seguros.recibo_devolucion ALTER COLUMN id_recibo_norm SET EXPRESSION AS (ltrim(id_recibo, '0'));
--   y volver a ejecutar las funciones de 2026-09-29c_recibo_devolucion.sql y 2026-09-29g_recibo_devolucion_enlace_insert.sql.
--   (Antes de revertir: ninguna devolución abierta con guion, o el índice único podría chocar.)

BEGIN;

-- Guarda: si con la regla nueva dos devoluciones ABIERTAS colapsan al mismo nº, el índice único
-- `recibo_devolucion_abierta` fallaría a mitad. Se para antes, con el motivo.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM seguros.recibo_devolucion
     WHERE resuelta_at IS NULL
     GROUP BY correduria_id, codigo_entidad_dgs, regexp_replace(ltrim(id_recibo, '0'), '-[A-Z]$', '')
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'recibo_devolucion: dos devoluciones abiertas colapsan al mismo nº sin sufijo; resolverlas a mano antes';
  END IF;
END $$;

ALTER TABLE seguros.recibo_devolucion
  ALTER COLUMN id_recibo_norm SET EXPRESSION AS (regexp_replace(ltrim(id_recibo, '0'), '-[A-Z]$', ''));

-- BEFORE INSERT OR UPDATE: igual que 2026-09-29c salvo la normalización y la guarda de ambigüedad.
CREATE OR REPLACE FUNCTION seguros.recibo_respeta_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seguros, pg_temp
AS $$
DECLARE
  d seguros.recibo_devolucion%ROWTYPE;
  dia_cima date;
  norm text;
BEGIN
  IF NEW.id_recibo IS NULL OR NEW.codigo_entidad_dgs IS NULL THEN
    RETURN NEW;
  END IF;
  norm := regexp_replace(ltrim(NEW.id_recibo, '0'), '-[A-Z]$', '');
  SELECT * INTO d FROM seguros.recibo_devolucion
   WHERE correduria_id = NEW.correduria_id
     AND codigo_entidad_dgs = NEW.codigo_entidad_dgs
     AND id_recibo_norm = norm
     AND resuelta_at IS NULL
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Ambiguo: otro recibo DISTINTO de la compañía casa con el mismo nº (`…-A` / `…-B`). No se elige:
  -- ni se enlaza ni se protege; lo resuelve una persona.
  IF EXISTS (
    SELECT 1 FROM seguros.poliza_recibos o
     WHERE o.correduria_id = NEW.correduria_id
       AND o.codigo_entidad_dgs = NEW.codigo_entidad_dgs
       AND o.id IS DISTINCT FROM NEW.id
       AND o.id_recibo IS DISTINCT FROM NEW.id_recibo
       AND regexp_replace(ltrim(o.id_recibo, '0'), '-[A-Z]$', '') = norm
  ) THEN
    RAISE WARNING 'recibo_respeta_devolucion (recibo %): nº ambiguo, no se toca', NEW.id;
    RETURN NEW;
  END IF;

  -- Solo en UPDATE: en un INSERT la fila aún no existe y la FK lo rechazaría (el enlace lo hace
  -- `recibo_enlaza_devolucion`, AFTER INSERT).
  IF TG_OP = 'UPDATE' AND d.recibo_id IS DISTINCT FROM NEW.id THEN
    UPDATE seguros.recibo_devolucion SET recibo_id = NEW.id, poliza_id = NEW.poliza_id WHERE id = d.id;
  END IF;

  IF NEW.situacion::text = 'devuelto' THEN
    RETURN NEW;
  END IF;

  dia_cima := (NEW.fecha_situacion AT TIME ZONE 'Europe/Madrid')::date;
  IF d.resolucion_auto AND dia_cima IS NOT NULL AND dia_cima > d.fecha_devolucion THEN
    -- CIMA sabe algo POSTERIOR a la devolución (un cobro, una anulación): manda CIMA.
    UPDATE seguros.recibo_devolucion
       SET resuelta_at = now(), resuelta_motivo = 'cima:' || NEW.situacion::text, resuelta_por = 'sistema:cima'
     WHERE id = d.id;
    RETURN NEW;
  END IF;

  -- Dato de CIMA igual o anterior a la devolución: no la deshace.
  NEW.situacion := 'devuelto';
  NEW.fecha_situacion := (d.fecha_devolucion::timestamp AT TIME ZONE 'Europe/Madrid');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'recibo_respeta_devolucion (recibo %): % — se deja pasar la escritura', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION seguros.recibo_respeta_devolucion() FROM PUBLIC;

-- AFTER INSERT: igual que 2026-09-29g salvo la normalización y la guarda de ambigüedad.
CREATE OR REPLACE FUNCTION seguros.recibo_enlaza_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = seguros, pg_temp
AS $$
DECLARE
  norm text;
BEGIN
  IF NEW.id_recibo IS NULL OR NEW.codigo_entidad_dgs IS NULL THEN
    RETURN NULL;
  END IF;
  norm := regexp_replace(ltrim(NEW.id_recibo, '0'), '-[A-Z]$', '');
  IF EXISTS (
    SELECT 1 FROM seguros.poliza_recibos o
     WHERE o.correduria_id = NEW.correduria_id
       AND o.codigo_entidad_dgs = NEW.codigo_entidad_dgs
       AND o.id IS DISTINCT FROM NEW.id
       AND o.id_recibo IS DISTINCT FROM NEW.id_recibo
       AND regexp_replace(ltrim(o.id_recibo, '0'), '-[A-Z]$', '') = norm
  ) THEN
    RAISE WARNING 'recibo_enlaza_devolucion (recibo %): nº ambiguo, no se enlaza', NEW.id;
    RETURN NULL;
  END IF;
  UPDATE seguros.recibo_devolucion
     SET recibo_id = NEW.id, poliza_id = NEW.poliza_id
   WHERE correduria_id = NEW.correduria_id
     AND codigo_entidad_dgs = NEW.codigo_entidad_dgs
     AND id_recibo_norm = norm
     AND resuelta_at IS NULL
     AND recibo_id IS NULL;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'recibo_enlaza_devolucion (recibo %): % — se deja pasar la escritura', NEW.id, SQLERRM;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION seguros.recibo_enlaza_devolucion() FROM PUBLIC;

-- Los triggers ya existen (2026-09-29c/g) y apuntan a estas funciones: no se recrean.

COMMIT;
