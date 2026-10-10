-- Portal de Grupo ASegura — las pólizas que APORTA el cliente se quitan sin perderse (10/10/2026).
--
-- ⚠️ SIN APLICAR. 🚨 Se aplica ANTES del merge/despliegue de asegura-portal que la usa: el
-- `schema.prisma` del portal ya declara `eliminada_en` y el modelo del historial, y sin ellos
-- CUALQUIER consulta a `portal_poliza_declarada` cae con 42703 (columna inexistente) — la bóveda
-- entera, la hoja QR, los partes y el calendario. Orden seguro: aplicar este SQL → merge.
-- Es ADITIVA: el código viejo sigue funcionando sobre ella (no lee la columna ni la tabla nueva).
--
-- ── Por qué ──────────────────────────────────────────────────────────────────
-- Alberto (10/10/2026): el portal es para que cada persona CONTROLE SUS SEGUROS, estén o no con
-- nosotros. Lo que sube puede modificarlo y eliminarlo, pero NADA se pierde: todo queda registrado
-- para poder restaurar si se equivoca. Hasta hoy el DELETE era físico y la edición no dejaba
-- rastro: un toque de pulgar equivocado y la póliza (y sus recordatorios) desaparecían.
--
-- 1. `portal_poliza_declarada.eliminada_en`: borrado LÓGICO. NULL = en la bóveda; con fecha = la
--    quitó él y está en «Eliminadas», de donde la puede restaurar. Sin `eliminada_por`: la única
--    que puede quitarla es su propia identidad (el `middleware` veta el DELETE en modo corredor) y
--    quién/cuándo/qué había ya lo cuenta el historial. Sin `motivo`: no hay pantalla que lo pida, y
--    una columna que nadie rellena se lee como «no hubo motivo».
-- 2. `portal_poliza_declarada_historial`: APPEND-ONLY (el rol solo INSERTA y LEE, como
--    `portal_consentimiento`). Una fila por creación, edición, eliminación y restauración, con el
--    ANTES y el DESPUÉS de los campos que cambiaron (no un volcado de la fila: sin
--    `extraccion_bruta` ni `coberturas`).
--
-- ── 🚨 Por qué `poliza_id` NO tiene FK ────────────────────────────────────────
-- El historial existe para sobrevivir a lo que le pase a la póliza. Con FK:
--   · `ON DELETE CASCADE` → un borrado físico futuro (un script, otra app, un backfill) se llevaría
--     el rastro justo cuando más falta hace — lo contrario de para qué sirve la tabla.
--   · `ON DELETE RESTRICT/NO ACTION` → bloquearía cualquier borrado físico legítimo de la póliza
--     (una limpieza a mano del corredor) y convertiría el registro en un candado.
--   · `ON DELETE SET NULL` → filas de historial que no dicen de qué póliza hablan.
-- Así que `poliza_id` es un uuid suelto, con índice. El AISLAMIENTO no depende de la FK: lo da el
-- código (todo se lee y escribe por `identidad_id` de la cookie).
--
-- `identidad_id` SÍ lleva FK `ON DELETE CASCADE`, con la MISMA política que todas las `portal_*`:
-- el historial es dato de ESA persona, y cuando se ejecuta su supresión (derecho al olvido) tiene
-- que irse con ella. Dejarlo vivo sería conservar sus pólizas por la puerta de atrás.
--
-- ── GRANTs ───────────────────────────────────────────────────────────────────
-- · `prisma_asegura_portal` tiene grant a nivel de TABLA sobre `portal_poliza_declarada`
--   (`2026-09-02_portal_rol_vinculo_grants.sql`): la columna nueva queda cubierta sola (mismo
--   caso que `2026-09-03_portal_poliza_vehiculo.sql`). Se repite por columna por si alguien
--   revocara el de tabla: es idempotente y no amplía nada.
-- · `prisma_seguros` lee esta tabla POR COLUMNAS (`2026-09-07_portal_declarada_titular.sql`): se le
--   concede `eliminada_en` para que la correduría pueda dejar de tratar como viva una que el cliente
--   quitó. ⚠️ Concederla no la filtra: los lectores de `apps/asegura` siguen viendo las eliminadas
--   hasta que se filtren allí (pendiente aparte).
-- · Tabla nueva `portal_*` → `REVOKE ALL … FROM crm_seguros` (`test/regression-portal-sin-crm.test.ts`).

SET search_path = seguros, public;

BEGIN;

-- ─── 1. Borrado lógico ───────────────────────────────────────────────────────
ALTER TABLE seguros.portal_poliza_declarada
  ADD COLUMN IF NOT EXISTS eliminada_en timestamptz;

COMMENT ON COLUMN seguros.portal_poliza_declarada.eliminada_en IS
  'Borrado LOGICO. NULL = en la boveda. Con fecha = el cliente la quito (sale en «Eliminadas» y la puede restaurar). Toda lectura del portal filtra eliminada_en IS NULL (DECLARADA_NO_ELIMINADA de lib/declaradas-eliminadas.ts).';

-- Las lecturas de la bóveda van SIEMPRE por identidad y casi siempre sin las eliminadas.
CREATE INDEX IF NOT EXISTS idx_portal_poliza_identidad_viva
  ON seguros.portal_poliza_declarada (identidad_id)
  WHERE eliminada_en IS NULL;

GRANT SELECT (eliminada_en), UPDATE (eliminada_en)
  ON seguros.portal_poliza_declarada TO prisma_asegura_portal;
GRANT SELECT (eliminada_en)
  ON seguros.portal_poliza_declarada TO prisma_seguros;

-- ─── 2. Historial (append-only) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_poliza_declarada_historial (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SIN FK a propósito (ver cabecera): el rastro sobrevive a cualquier borrado físico de la póliza.
  poliza_id    uuid NOT NULL,
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  accion       text NOT NULL CHECK (accion IN ('creada', 'editada', 'eliminada', 'restaurada')),
  -- Solo los campos que cambiaron (o la foto entera en `eliminada`). NULL = no aplica (`creada`
  -- no tiene «antes»), nunca `{}`.
  antes        jsonb,
  despues      jsonb,
  creado_en    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portal_poliza_historial_poliza
  ON seguros.portal_poliza_declarada_historial (identidad_id, poliza_id, creado_en DESC);

COMMENT ON TABLE seguros.portal_poliza_declarada_historial IS
  'Append-only. Que hizo el cliente con cada poliza que aporto (creada/editada/eliminada/restaurada), con antes/despues de los campos cambiados. poliza_id sin FK para sobrevivir a un borrado fisico.';

-- Append-only: sin UPDATE ni DELETE. Un registro que se puede reescribir no prueba nada.
GRANT SELECT, INSERT ON seguros.portal_poliza_declarada_historial TO prisma_asegura_portal;
-- La correduría lo LEE (auditoría, exportación RGPD).
GRANT SELECT ON seguros.portal_poliza_declarada_historial TO prisma_seguros;

-- Los privilegios por defecto del schema dan DML a `crm_seguros` en cada tabla nueva: se le quitan
-- (landmine de `apps/asegura-portal/CLAUDE.md`, 24/09/2026).
REVOKE ALL ON seguros.portal_poliza_declarada_historial FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'seguros' AND table_name = 'portal_poliza_declarada' AND column_name = 'eliminada_en';
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name = 'portal_poliza_declarada_historial';
-- SELECT has_column_privilege('prisma_asegura_portal', 'seguros.portal_poliza_declarada', 'eliminada_en', 'UPDATE');
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- 🚨 Primero se REVIERTE EL CÓDIGO (el schema.prisma que declara la columna): quitar la columna con
-- el código nuevo desplegado tumba toda lectura de declaradas con 42703.
-- Y antes de quitar la columna: las filas con `eliminada_en IS NOT NULL` volverían a la bóveda como
-- vivas al borrarla. Decidir antes qué hacer con ellas (restaurarlas o borrarlas a mano sabiendo
-- que su rastro queda en el historial).
--   DROP INDEX IF EXISTS seguros.idx_portal_poliza_identidad_viva;
--   ALTER TABLE seguros.portal_poliza_declarada DROP COLUMN IF EXISTS eliminada_en;
--   -- El historial se puede conservar (no estorba al código viejo). Si de verdad se quiere quitar:
--   DROP TABLE IF EXISTS seguros.portal_poliza_declarada_historial;
