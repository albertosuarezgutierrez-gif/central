-- 2026-09-23 — `seguros.auditoria`: una fila por cada escritura AUTORIZADA del puerto de operador
-- (Fase 1b de ASegura OS, pieza b). La escribe `apps/asegura/lib/auditoria.ts` (`auditado()`).
--
-- Qué responde: QUIÉN (cabecera `x-actor` que manda plataforma: humano:<cuentaId>, agente:<id>,
-- sistema:<origen>, o `desconocido` con el motivo), QUÉ ruta y método, QUÉ ids tocó (solo UUIDs
-- de claves `id`/`…Id`) y CÓMO acabó (código HTTP). Todavía NO el antes/después de cada campo:
-- eso es la pieza (c), que añadirá su columna aquí.
--
-- Append-only: el trigger rechaza UPDATE/DELETE y `prisma_seguros` solo tiene SELECT/INSERT
-- (dos barreras). Sin datos personales a propósito — ni cuerpo, ni query entera —, así que una
-- supresión RGPD no obliga a tocar esta tabla. Retención prevista: 24 meses; la purga se hará con
-- una función propia cuando haga falta (hoy son decenas de filas al día).
--
-- ADITIVA y reversible: `DROP TABLE seguros.auditoria; DROP FUNCTION seguros.auditoria_reject_modification();`

CREATE TABLE IF NOT EXISTS seguros.auditoria (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  actor_tipo   text NOT NULL CHECK (actor_tipo IN ('humano', 'agente', 'sistema', 'desconocido')),
  actor_id     text NOT NULL,
  metodo       text NOT NULL,
  ruta         text NOT NULL,
  estado_http  integer NOT NULL,
  ids          jsonb NOT NULL DEFAULT '{}'::jsonb,
  duracion_ms  integer
);

CREATE INDEX IF NOT EXISTS idx_auditoria_created ON seguros.auditoria (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_ids ON seguros.auditoria USING gin (ids jsonb_path_ops);

CREATE OR REPLACE FUNCTION seguros.auditoria_reject_modification()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $reject$
BEGIN
  RAISE EXCEPTION 'seguros.auditoria es append-only (intento de % en %)', tg_op, tg_table_name;
END;
$reject$;

DROP TRIGGER IF EXISTS auditoria_reject_modification ON seguros.auditoria;
CREATE TRIGGER auditoria_reject_modification
  BEFORE UPDATE OR DELETE ON seguros.auditoria
  FOR EACH ROW EXECUTE FUNCTION seguros.auditoria_reject_modification();

ALTER TABLE seguros.auditoria ENABLE ROW LEVEL SECURITY;

-- Los privilegios por defecto del schema dan todo a `prisma_seguros` Y a `crm_seguros` (el CRM de
-- Manuel). El CRM no puede ni leerla ni meter filas con un actor inventado; asegura lee e inserta.
REVOKE ALL ON seguros.auditoria FROM crm_seguros;
REVOKE ALL ON seguros.auditoria FROM anon, authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON seguros.auditoria FROM prisma_seguros;
GRANT SELECT, INSERT ON seguros.auditoria TO prisma_seguros;
