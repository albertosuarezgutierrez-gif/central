-- Rebote ≠ baja (07/11/2026, decisión de Alberto). SIN APLICAR: la aplica Alberto.
--
-- 🚨 ORDEN: este SQL ANTES de desplegar el código. El modelo Prisma de `Cliente` gana tres columnas y toda
-- lectura de la ficha sin `select` (o con `include`) las pide: desplegado sin el SQL, esas lecturas fallan con
-- «column does not exist». Aplicado antes, el código viejo no lo nota (columnas nuevas y nulas).
--
-- Qué cambia:
--  · `email_opt_out_at` vuelve a significar SOLO «no quiere» (enlace de baja, One-Click, lo pidió, queja de spam).
--  · Un rebote duro o una supresión de Resend marcan el EMAIL como malo: `email_rebotado_at` + `email_rebotado_motivo`
--    ('rebote' | 'rebote:<subtipo>' | 'suprimido') + `email_rebotado_hash` (índice ciego de la dirección que rebotó,
--    NULL = no se pudo calcular). Ningún envío automático escribe a una ficha marcada (igual que con la baja).
--  · Si la dirección de la ficha CAMBIA, la marca se limpia sola (triggers de abajo); la baja NO se limpia nunca.
--  · `felicitacion.resend_message_id`: el id de Resend de la felicitación, para su embudo.
BEGIN;

ALTER TABLE seguros.clientes ADD COLUMN IF NOT EXISTS email_rebotado_at timestamptz;
ALTER TABLE seguros.clientes ADD COLUMN IF NOT EXISTS email_rebotado_motivo varchar(60);
ALTER TABLE seguros.clientes ADD COLUMN IF NOT EXISTS email_rebotado_hash text;
CREATE INDEX IF NOT EXISTS idx_clientes_email_rebotado ON seguros.clientes (email_rebotado_at) WHERE email_rebotado_at IS NOT NULL;

ALTER TABLE seguros.felicitacion ADD COLUMN IF NOT EXISTS resend_message_id text;
-- El UPDATE de la felicitación sigue acotado por columnas: canal (ya estaba) y el id de Resend.
GRANT UPDATE (canal, resend_message_id) ON seguros.felicitacion TO prisma_seguros;

-- ── Limpieza automática de la marca al cambiar la dirección ──────────────────────────────────────────────────
-- Se compara el ÍNDICE CIEGO, no el texto cifrado: cifrar la misma dirección dos veces da textos distintos (IV
-- aleatorio) y un «guardar» sin cambios no puede borrar la marca. Si la ficha no tiene hash en ninguno de los dos
-- lados, se cae a comparar el texto. La dirección nueva igual a la que rebotó (mismo hash) NO limpia.
CREATE OR REPLACE FUNCTION seguros.limpiar_rebote_al_cambiar_email() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.email_rebotado_at IS NOT NULL
     AND (
       (NEW.email_lookup_hash IS DISTINCT FROM OLD.email_lookup_hash
         AND NEW.email_lookup_hash IS DISTINCT FROM NEW.email_rebotado_hash)
       OR (NEW.email_lookup_hash IS NULL AND OLD.email_lookup_hash IS NULL AND NEW.email IS DISTINCT FROM OLD.email)
     )
     -- Quien escribe la marca en la misma sentencia (el webhook) no se la borra a sí mismo.
     AND NEW.email_rebotado_at IS NOT DISTINCT FROM OLD.email_rebotado_at
  THEN
    NEW.email_rebotado_at := NULL;
    NEW.email_rebotado_motivo := NULL;
    NEW.email_rebotado_hash := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_clientes_limpiar_rebote ON seguros.clientes;
CREATE TRIGGER trg_clientes_limpiar_rebote
  BEFORE UPDATE OF email, email_lookup_hash ON seguros.clientes
  FOR EACH ROW EXECUTE FUNCTION seguros.limpiar_rebote_al_cambiar_email();

-- Una dirección NUEVA en `cliente_emails` (distinta de la que rebotó) también limpia: hay algo nuevo que probar.
-- Volver a guardar la misma (borrar e insertar al editar) no limpia: mismo hash. SECURITY DEFINER porque quien
-- inserta el email (incluido el CRM de ingesta) no tiene por qué poder tocar estas tres columnas de `clientes`.
CREATE OR REPLACE FUNCTION seguros.limpiar_rebote_por_email_nuevo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = seguros, pg_temp AS $$
BEGIN
  UPDATE seguros.clientes c
     SET email_rebotado_at = NULL, email_rebotado_motivo = NULL, email_rebotado_hash = NULL
   WHERE c.id = NEW.cliente_id
     AND c.correduria_id = NEW.correduria_id
     AND c.email_rebotado_at IS NOT NULL
     AND NEW.email_lookup_hash IS DISTINCT FROM c.email_rebotado_hash;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION seguros.limpiar_rebote_por_email_nuevo() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_cliente_emails_limpiar_rebote ON seguros.cliente_emails;
CREATE TRIGGER trg_cliente_emails_limpiar_rebote
  AFTER INSERT OR UPDATE OF email_lookup_hash ON seguros.cliente_emails
  FOR EACH ROW EXECUTE FUNCTION seguros.limpiar_rebote_por_email_nuevo();

-- ── Backfill 1: el id de Resend de las felicitaciones ya enviadas ────────────────────────────────────────────
-- La felicitación y su `correo_envio` (tipo 'felicitacion') son de la misma ficha y el mismo día de Madrid; hay
-- una felicitación por persona y año. Solo se rellena si hay EXACTAMENTE un envío con id ese día (sin ambigüedad).
UPDATE seguros.felicitacion f
   SET resend_message_id = ce.resend_id
  FROM (
    SELECT e.correduria_id, e.cliente_id, (e.creado_en AT TIME ZONE 'Europe/Madrid')::date AS dia,
           min(e.resend_id) AS resend_id, count(*) AS n
      FROM seguros.correo_envio e
     WHERE e.tipo = 'felicitacion' AND e.resend_id IS NOT NULL AND e.estado = 'enviado'
     GROUP BY 1, 2, 3
  ) ce
 WHERE f.resend_message_id IS NULL
   AND f.canal = 'correo'
   AND ce.n = 1
   AND ce.correduria_id = f.correduria_id
   AND ce.cliente_id = f.cliente_id
   AND ce.dia = f.dia;

-- ── Backfill 2: bajas que en realidad fueron REBOTES → marca de email malo ───────────────────────────────────
-- Conservador: solo se mueve una baja si TODO esto se cumple, y si no, se deja como está (sigue sin recibir).
--  a) La ficha tiene una nota automática de rebote en `historial_interno` («…RECHAZADO… baja automática de
--     correo», textos de `aplicarBajaPorRebote` y `aplicarBajaCampanaPorRebote`) y un evento `email.bounced` o
--     `email.suppressed` de un correo SUYO (recaptación, campaña o `correo_envio`) ANTES de la baja.
--  b) La baja (`email_opt_out_at`) cae a ±10 minutos de esa nota (la escribía la misma llamada del webhook).
--  c) Nada dice «no quiere»: ni queja de spam de ningún correo suyo, ni baja por enlace en la campaña, ni nota
--     de baja por el propio cliente, ni `email_opt_out_source` (la pone quien recoge la baja pedida).
-- Las fichas HERMANAS (mismo `email_lookup_hash`) que se dieron de baja en la misma llamada (`bajaDeFicha` de la
-- campaña) no se tocan aquí: no llevan nota propia y no se puede probar el origen. Siguen de baja.
CREATE TEMP TABLE _rebote_backfill ON COMMIT DROP AS
WITH envios AS (
  SELECT r.correduria_id, r.cliente_id, r.resend_message_id AS resend_id FROM seguros.recaptacion_envios r
   WHERE r.resend_message_id IS NOT NULL AND r.canal = 'email'
  UNION
  SELECT k.correduria_id, k.cliente_id, k.resend_message_id FROM seguros.campana_envio k WHERE k.resend_message_id IS NOT NULL
  UNION
  SELECT e.correduria_id, e.cliente_id, e.resend_id FROM seguros.correo_envio e WHERE e.resend_id IS NOT NULL AND e.cliente_id IS NOT NULL
),
rebotes AS (
  SELECT en.correduria_id, en.cliente_id, min(ev.ocurrido_en) AS primero,
         bool_or(ev.tipo = 'email.suppressed' AND NOT EXISTS (
           SELECT 1 FROM seguros.correo_evento b WHERE b.resend_id = en.resend_id AND b.tipo = 'email.bounced')) AS solo_suprimido
    FROM envios en JOIN seguros.correo_evento ev ON ev.resend_id = en.resend_id
   WHERE ev.tipo IN ('email.bounced', 'email.suppressed')
   GROUP BY 1, 2
)
SELECT c.id AS cliente_id, c.correduria_id, rb.primero, rb.solo_suprimido, c.email_lookup_hash
  FROM seguros.clientes c
  JOIN rebotes rb ON rb.cliente_id = c.id AND rb.correduria_id = c.correduria_id
 WHERE c.email_opt_out_at IS NOT NULL
   AND c.email_opt_out_source IS NULL
   AND c.email_rebotado_at IS NULL
   AND rb.primero <= (c.email_opt_out_at AT TIME ZONE current_setting('TimeZone')) + interval '1 minute'
   AND EXISTS (
     SELECT 1 FROM seguros.historial_interno h
      WHERE h.cliente_id = c.id AND h.correduria_id = c.correduria_id AND h.deleted_at IS NULL
        AND h.texto LIKE '%RECHAZADO%baja automática de correo%'
        AND h.created_at BETWEEN c.email_opt_out_at - interval '10 minutes' AND c.email_opt_out_at + interval '10 minutes')
   AND NOT EXISTS (
     SELECT 1 FROM envios en JOIN seguros.correo_evento q ON q.resend_id = en.resend_id
      WHERE en.cliente_id = c.id AND en.correduria_id = c.correduria_id AND q.tipo = 'email.complained')
   AND NOT EXISTS (
     SELECT 1 FROM seguros.campana_envio k WHERE k.cliente_id = c.id AND k.correduria_id = c.correduria_id AND k.baja_en IS NOT NULL)
   AND NOT EXISTS (
     SELECT 1 FROM seguros.historial_interno h
      WHERE h.cliente_id = c.id AND h.correduria_id = c.correduria_id AND h.deleted_at IS NULL
        AND (h.texto LIKE '%spam%' OR h.texto LIKE '%por el propio cliente%'));

-- Vista previa (ejecútala sola ANTES del COMMIT si quieres ver a quién toca):
--   select count(*), count(*) filter (where solo_suprimido) from _rebote_backfill;

UPDATE seguros.clientes c
   SET email_rebotado_at = b.primero,
       email_rebotado_motivo = CASE WHEN b.solo_suprimido THEN 'suprimido' ELSE 'rebote' END,
       email_rebotado_hash = b.email_lookup_hash,
       email_opt_out_at = NULL
  FROM _rebote_backfill b
 WHERE c.id = b.cliente_id AND c.correduria_id = b.correduria_id;

INSERT INTO seguros.historial_interno (correduria_id, cliente_id, tipo, texto)
SELECT b.correduria_id, b.cliente_id, 'gestion',
       'Correo: la baja automática por rebote pasa a «email malo» (07/11/2026: rebote ≠ baja). Se limpia sola si cambia el email.'
  FROM _rebote_backfill b;

COMMIT;

-- Comprobación tras aplicar:
--   select count(*) from seguros.clientes where email_rebotado_at is not null;
--   select tgname from pg_trigger where tgname in ('trg_clientes_limpiar_rebote', 'trg_cliente_emails_limpiar_rebote');
--   select count(*) filter (where resend_message_id is not null), count(*) filter (where canal = 'correo') from seguros.felicitacion;
-- Prueba del trigger (en un bloque que se revierte):
--   begin; update seguros.clientes set email_rebotado_at = now(), email_rebotado_hash = 'x' where id = '<id>';
--          update seguros.clientes set email_lookup_hash = 'otro' where id = '<id>';
--          select email_rebotado_at from seguros.clientes where id = '<id>';  -- debe ser NULL
--   rollback;
