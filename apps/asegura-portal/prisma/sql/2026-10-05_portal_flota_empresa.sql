-- Portal de Grupo ASegura — mínimo de EMPRESA (05/10/2026): flota + jefe de flota.
--
-- ✅ APLICADA en `central` el 05/10/2026 (MCP Supabase, antes del merge de #4289). 🚨 Se aplica ANTES (o en el mismo paso) que el
-- despliegue de asegura-portal que la usa: el `schema.prisma` del portal ya
-- declara las columnas nuevas de `portal_bien`, y sin ellas cualquier consulta
-- a ese modelo cae con 42703. Es ADITIVA: el código viejo sigue funcionando
-- sobre ella (no lee `cliente_id` y nunca escribe `flota`).
--
-- ── QUÉ HACE ─────────────────────────────────────────────────────────────────
--
-- 1. `portal_bien` puede ser de una EMPRESA (ficha jurídica de la cartera) y no
--    solo de una identidad. Es el ANCLA del vehículo de la flota: el spec dice
--    que el bien —no la póliza— es lo que sobrevive a un cambio de compañía, y
--    la fecha de matriculación (la que necesita la ITV) es del vehículo.
--    · `cliente_id`: la empresa dueña del bien. Exactamente UNO de
--      (`identidad_id`, `cliente_id`) va relleno (CHECK `portal_bien_un_dueno`,
--      mismo patrón que `portal_autorizacion_destinatario_unico`). Por eso
--      `identidad_id` deja de ser NOT NULL: si el bien de la empresa colgara de
--      la identidad que lo anotó, se borraría en CASCADA con ella y aparecería
--      en SU exportación RGPD como si fuera suyo.
--    · `matricula`: NORMALIZADA (`normalizarMatricula`: mayúsculas, solo A-Z0-9)
--      y obligatoria en los bienes de empresa: es la clave del vehículo dentro
--      de la empresa (índice único parcial). El vehículo se reconoce por la
--      matrícula, no por la póliza, que cambia al cambiar de compañía.
--    · `fecha_matriculacion date` NULLABLE: NULL = «no se sabe». Sin valor por
--      defecto ni centinelas. La valida el código (`fechaMatriculacionValida`).
--    · `creado_por_identidad_id` / `actualizado_por_identidad_id` /
--      `actualizado_en`: quién la escribió (dueño o jefe de flota). ON DELETE
--      SET NULL: borrar a la persona no borra el dato del vehículo.
--
-- 2. `portal_autorizacion.alcance` admite `flota` (el JEFE DE FLOTA): la sociedad
--    deja a una persona ver y gestionar SUS VEHÍCULOS y nada más. Exige ficha
--    entera (`poliza_id IS NULL`) y título (`titulo_representacion`): es
--    representación de una sociedad, y si actúa tiene que constar con qué título.
--    🚨 `flota` NO entra en `ALCANCES` del módulo puro a propósito: todos los
--    lectores existentes ignoran el alcance que no conocen, así que esta fila
--    NO abre la bóveda de la empresa (cepo en `flota.test.ts`).
--    Doble aceptación como siempre: nace pendiente y no abre nada hasta que el
--    autorizado la acepta.
--
-- ── GRANT: no hace falta ninguno nuevo (comprobado en el SQL, no supuesto) ────
-- `prisma_asegura_portal` tiene `SELECT, INSERT, UPDATE, DELETE` a nivel de
-- TABLA sobre `portal_bien` (`2026-09-02_portal_rol_vinculo_grants.sql`) y
-- `portal_autorizacion` (`2026-09-03_portal_autorizacion.sql`), que cubren las
-- columnas nuevas. No se crea ninguna tabla `portal_*`, así que no aplica el
-- `REVOKE … FROM crm_seguros` (el barrido del 24/09 ya la cubrió).
--
-- ── Aislamiento ──────────────────────────────────────────────────────────────
-- El rol NO tiene BYPASSRLS y esto NO añade RLS: el aislamiento entre clientes
-- lo da el código (`lib/flota.ts`: la empresa sale SIEMPRE de `accesosFlota()`,
-- resuelto desde la cookie; el id de la URL solo se busca dentro).

SET search_path = seguros, public;

BEGIN;

-- ─── 1. El ancla del vehículo de la empresa ─────────────────────────────────
ALTER TABLE seguros.portal_bien ALTER COLUMN identidad_id DROP NOT NULL;
ALTER TABLE seguros.portal_bien
  ADD COLUMN IF NOT EXISTS cliente_id                   uuid REFERENCES seguros.clientes(id),
  ADD COLUMN IF NOT EXISTS matricula                    text,
  ADD COLUMN IF NOT EXISTS fecha_matriculacion          date,
  ADD COLUMN IF NOT EXISTS creado_por_identidad_id      uuid REFERENCES seguros.portal_identidad(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizado_por_identidad_id uuid REFERENCES seguros.portal_identidad(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS actualizado_en               timestamptz;

ALTER TABLE seguros.portal_bien
  ADD CONSTRAINT portal_bien_un_dueno CHECK (num_nonnulls(identidad_id, cliente_id) = 1);

-- Un bien de empresa es un VEHÍCULO con matrícula normalizada (hoy es lo único
-- que el portal ancla a una empresa; un local o la propia empresa llegarán con
-- su propio CHECK cuando haya pantalla que los cree).
ALTER TABLE seguros.portal_bien
  ADD CONSTRAINT portal_bien_empresa_vehiculo CHECK (
    cliente_id IS NULL
    OR (tipo = 'vehiculo' AND matricula IS NOT NULL AND matricula ~ '^[A-Z0-9]{4,}$')
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_bien_empresa_matricula
  ON seguros.portal_bien (cliente_id, matricula)
  WHERE cliente_id IS NOT NULL;

COMMENT ON COLUMN seguros.portal_bien.cliente_id IS
  'Empresa (ficha juridica) duena del bien. Exactamente uno de identidad_id / cliente_id (CHECK portal_bien_un_dueno). Lo leen y escriben el dueno y el jefe de flota via lib/flota.ts.';
COMMENT ON COLUMN seguros.portal_bien.fecha_matriculacion IS
  'NULL = no se sabe. Declarada por el dueno o el jefe de flota; la de la compania (EIAC) gana si existe. Base del calculo de la ITV, que es una estimacion, nunca un "al dia".';

-- ─── 2. El jefe de flota ─────────────────────────────────────────────────────
ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_alcance_check;
ALTER TABLE seguros.portal_autorizacion ADD CONSTRAINT portal_autorizacion_alcance_check
  CHECK (alcance IN ('ver', 'ver_economico', 'partes', 'documentos', 'total', 'flota'));

ALTER TABLE seguros.portal_autorizacion
  ADD CONSTRAINT portal_autorizacion_flota_entera CHECK (
    alcance <> 'flota' OR (poliza_id IS NULL AND titulo_representacion IS NOT NULL)
  );

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT column_name, is_nullable FROM information_schema.columns
--  WHERE table_schema = 'seguros' AND table_name = 'portal_bien' ORDER BY ordinal_position;
-- SELECT conname FROM pg_constraint
--  WHERE conname IN ('portal_bien_un_dueno', 'portal_bien_empresa_vehiculo', 'portal_autorizacion_flota_entera');
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- Solo si no hay filas `flota` ni bienes de empresa (si las hay, se revocan /
-- se archivan antes: borrarlas es perder la prueba de quién gestionó qué):
--   ALTER TABLE seguros.portal_autorizacion DROP CONSTRAINT portal_autorizacion_flota_entera;
--   (y volver el CHECK de alcance a la lista del 25/09/2026)
--   DROP INDEX seguros.idx_portal_bien_empresa_matricula;
--   ALTER TABLE seguros.portal_bien DROP CONSTRAINT portal_bien_empresa_vehiculo, DROP CONSTRAINT portal_bien_un_dueno;
--   ALTER TABLE seguros.portal_bien DROP COLUMN cliente_id, … ; ALTER COLUMN identidad_id SET NOT NULL;
