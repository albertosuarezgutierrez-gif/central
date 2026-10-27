-- ⛔ SIN APLICAR. 🚨 Se aplica ANTES (o en el MISMO paso) que el despliegue de asegura-portal que la usa: el
--    `schema.prisma` del portal ya declara `PortalVehiculoQr` y `PortalVehiculoPublico`, y sin esta DDL cualquier
--    consulta a esos modelos cae con 42P01 / 42501 (el `/v/<token>` y las rutas `/api/vehiculos/*`).
--
-- QR por VEHÍCULO — FASE 1 (27/10/2026). Spec: `docs/superpowers/specs/2026-10-27-qr-vehiculo-flota.md` §2 (tablas 0-2).
-- ADITIVA: un CHECK y un índice único parcial en `portal_bien` y dos tablas nuevas. El código viejo no lee nada de esto.
-- F2 (personas autorizadas y notas: `portal_vehiculo_acceso`, `portal_vehiculo_nota`) NO va aquí.
--
-- ── Reglas que sostiene esta DDL (el código no puede garantizarlas solo) ─────
--  0. `portal_bien` de PERSONA con `tipo='vehiculo'` y matrícula: matrícula NORMALIZADA (`normalizarMatricula`) y
--     única por identidad. Es la clave con la que `asegurarVehiculoDePoliza` crea la ficha bajo demanda de forma
--     IDEMPOTENTE (dos pestañas a la vez → el índice decide, 23505 → se relee). El de empresa ya lo tenía
--     (`portal_bien_empresa_vehiculo` + `idx_portal_bien_empresa_matricula`, 2026-10-05).
--  1. `portal_vehiculo_qr`: una fila por ETIQUETA impresa. El token va HASHEADO (`hashCanal`, 64 hex, UNIQUE).
--     Anular es un UPDATE (`anulado_en`), nunca un DELETE: el rol no lo tiene. `bien_id` ON DELETE CASCADE a
--     propósito: suprimir a una persona (RGPD) borra sus bienes, y sin cascada su propio QR lo bloquearía.
--  2. `portal_vehiculo_publico`: QUÉ ve quien escanea. Una fila por DUEÑO (`bien_id NULL` = su defecto) y,
--     opcional, una por vehículo (excepción). Dueño = persona XOR empresa (CHECK `..._un_dueno`, mismo patrón que
--     `portal_bien_un_dueno`); el código lo COPIA del `portal_bien` en el servidor, nunca del cuerpo. Los tres
--     interruptores son NOT NULL con el defecto del código (`INTERRUPTORES_DEFECTO`): una columna NULL no existe.
--  3. Rol `prisma_asegura_portal`: GRANT por COLUMNAS y SIN DELETE en las dos tablas. `crm_seguros`: REVOKE ALL
--     (el CRM no lee QR ni preferencias de nadie). `prisma_seguros`: REVOKE ALL (los defaults del schema le dan
--     escritura; apps/asegura no tiene nada que hacer con esto).
--
-- ── Aislamiento ──────────────────────────────────────────────────────────────
-- El rol NO tiene BYPASSRLS y esto NO añade RLS: lo da el CÓDIGO. Toda escritura pasa por
-- `puedeGestionarVehiculo()` (`lib/vehiculo-acceso.ts`); la ÚNICA lectura sin identidad es `vehiculoPorToken()`
-- (`lib/vehiculo-token.ts`, EXENTO declarado en `test/regression-portal-aislamiento.test.ts`), filtrada por el hash
-- de un token de 256 bits que se normaliza ANTES de tocar la BD.
SET search_path = seguros, public;

BEGIN;

-- ─── 0. portal_bien del PARTICULAR ──────────────────────────────────────────
-- Comprobado antes de escribirlo: hasta hoy solo `lib/flota.ts` escribe `matricula`, y solo en bienes de EMPRESA;
-- ninguna fila de persona la tiene, así que el CHECK no choca con datos existentes (verificación abajo).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'portal_bien_persona_vehiculo') THEN
    ALTER TABLE seguros.portal_bien ADD CONSTRAINT portal_bien_persona_vehiculo CHECK (
      identidad_id IS NULL OR tipo <> 'vehiculo' OR matricula IS NULL OR matricula ~ '^[A-Z0-9]{4,}$'
    );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_bien_persona_matricula
  ON seguros.portal_bien (identidad_id, matricula)
  WHERE identidad_id IS NOT NULL AND tipo = 'vehiculo' AND matricula IS NOT NULL;

-- La ficha bajo demanda la crea el portal (`asegurarVehiculoDePoliza`): necesita escribir estas columnas de un bien
-- de persona. El rol ya tiene SELECT/INSERT/UPDATE/DELETE de TABLA sobre `portal_bien`
-- (`2026-09-02_portal_rol_vinculo_grants.sql`), que las cubre: no hace falta GRANT nuevo.

-- ─── 1. El QR del vehículo ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_vehiculo_qr (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bien_id                  uuid NOT NULL REFERENCES seguros.portal_bien (id) ON DELETE CASCADE,
  token_hash               text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  creado_por_identidad_id  uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  creado_en                timestamptz NOT NULL DEFAULT now(),
  ultimo_uso_en            timestamptz,
  anulado_en               timestamptz,
  anulado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  -- Quien anula queda escrito SOLO si hay anulación (una fila viva no tiene «anulador»).
  CONSTRAINT portal_vehiculo_qr_anulador_con_fecha CHECK (anulado_por_identidad_id IS NULL OR anulado_en IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_portal_vehiculo_qr_bien ON seguros.portal_vehiculo_qr (bien_id, creado_en);
-- Una sola etiqueta VIVA por vehículo: «reimprimir» anula la anterior en la misma transacción (el papel pegado deja
-- de valer). Dos pestañas a la vez → la segunda choca (23505) y la pantalla pide repetir; no quedan dos vivas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_vehiculo_qr_un_vivo
  ON seguros.portal_vehiculo_qr (bien_id) WHERE anulado_en IS NULL;

-- ─── 2. Qué ve el PÚBLICO ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seguros.portal_vehiculo_publico (
  id                           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dueno_identidad_id           uuid REFERENCES seguros.portal_identidad (id) ON DELETE CASCADE,  -- particular
  cliente_id                   uuid REFERENCES seguros.clientes (id),                             -- empresa
  bien_id                      uuid REFERENCES seguros.portal_bien (id) ON DELETE CASCADE,        -- NULL = defecto del dueño
  datos_carretera              boolean NOT NULL DEFAULT true,
  estado_al_dia                boolean NOT NULL DEFAULT true,
  recordatorios_pendientes     boolean NOT NULL DEFAULT false,
  actualizado_por_identidad_id uuid REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL,
  actualizado_en               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_vehiculo_publico_un_dueno CHECK (num_nonnulls(dueno_identidad_id, cliente_id) = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_vehiculo_publico_defecto_persona
  ON seguros.portal_vehiculo_publico (dueno_identidad_id) WHERE bien_id IS NULL AND dueno_identidad_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_vehiculo_publico_defecto_empresa
  ON seguros.portal_vehiculo_publico (cliente_id) WHERE bien_id IS NULL AND cliente_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_vehiculo_publico_vehiculo
  ON seguros.portal_vehiculo_publico (bien_id) WHERE bien_id IS NOT NULL;

-- ─── 3. Permisos ────────────────────────────────────────────────────────────
ALTER TABLE seguros.portal_vehiculo_qr      DISABLE ROW LEVEL SECURITY;
ALTER TABLE seguros.portal_vehiculo_publico DISABLE ROW LEVEL SECURITY;

-- QR: nace (INSERT) y después solo se sella el uso o se ANULA. Nunca se borra.
GRANT SELECT (id, bien_id, token_hash, creado_por_identidad_id, creado_en, ultimo_uso_en, anulado_en, anulado_por_identidad_id)
  ON seguros.portal_vehiculo_qr TO prisma_asegura_portal;
GRANT INSERT (bien_id, token_hash, creado_por_identidad_id)
  ON seguros.portal_vehiculo_qr TO prisma_asegura_portal;
GRANT UPDATE (ultimo_uso_en, anulado_en, anulado_por_identidad_id)
  ON seguros.portal_vehiculo_qr TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_vehiculo_qr FROM crm_seguros;
REVOKE ALL ON seguros.portal_vehiculo_qr FROM prisma_seguros;

-- Interruptores: se crean y se cambian; el dueño y el bien de una fila no se cambian (UPDATE solo de los valores).
GRANT SELECT (id, dueno_identidad_id, cliente_id, bien_id, datos_carretera, estado_al_dia, recordatorios_pendientes,
              actualizado_por_identidad_id, actualizado_en)
  ON seguros.portal_vehiculo_publico TO prisma_asegura_portal;
GRANT INSERT (dueno_identidad_id, cliente_id, bien_id, datos_carretera, estado_al_dia, recordatorios_pendientes,
              actualizado_por_identidad_id, actualizado_en)
  ON seguros.portal_vehiculo_publico TO prisma_asegura_portal;
GRANT UPDATE (datos_carretera, estado_al_dia, recordatorios_pendientes, actualizado_por_identidad_id, actualizado_en)
  ON seguros.portal_vehiculo_publico TO prisma_asegura_portal;
REVOKE ALL ON seguros.portal_vehiculo_publico FROM crm_seguros;
REVOKE ALL ON seguros.portal_vehiculo_publico FROM prisma_seguros;

COMMENT ON TABLE seguros.portal_vehiculo_qr IS
  'QR por vehiculo (F1, 27/10/2026). Token hasheado (hashCanal). Anular = UPDATE anulado_en; una sola viva por bien. Lectura publica solo por vehiculoPorToken (lib/vehiculo-token.ts).';
COMMENT ON TABLE seguros.portal_vehiculo_publico IS
  'Que ve quien escanea el QR del vehiculo. bien_id NULL = defecto del dueno (persona XOR empresa); con bien_id = excepcion del vehiculo. Allow-list de salida en vehiculo-publico.ts.';

COMMIT;

-- ── Verificación ANTES de aplicar (solo lectura): el CHECK del paso 0 no puede chocar ──
-- SELECT count(*) FROM seguros.portal_bien
--  WHERE identidad_id IS NOT NULL AND tipo = 'vehiculo' AND matricula IS NOT NULL AND matricula !~ '^[A-Z0-9]{4,}$';  -- 0
-- SELECT identidad_id, matricula, count(*) FROM seguros.portal_bien
--  WHERE identidad_id IS NOT NULL AND tipo = 'vehiculo' AND matricula IS NOT NULL GROUP BY 1, 2 HAVING count(*) > 1;  -- 0 filas
--
-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT table_name, grantee, privilege_type, count(*) FROM information_schema.column_privileges
--  WHERE table_schema = 'seguros' AND table_name IN ('portal_vehiculo_qr', 'portal_vehiculo_publico')
--  GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
--   -- prisma_asegura_portal: qr SELECT 8 · INSERT 3 · UPDATE 3; publico SELECT 9 · INSERT 8 · UPDATE 5.
--   -- crm_seguros y prisma_seguros: 0 filas. Ningún DELETE.
-- SELECT conname FROM pg_constraint WHERE conname IN
--   ('portal_bien_persona_vehiculo', 'portal_vehiculo_publico_un_dueno', 'portal_vehiculo_qr_anulador_con_fecha');
--
-- ── Marcha atrás (solo si no hay etiquetas impresas: borrarlas deja papeles pegados que no abren nada) ──
--   DROP TABLE seguros.portal_vehiculo_publico; DROP TABLE seguros.portal_vehiculo_qr;
--   DROP INDEX seguros.idx_portal_bien_persona_matricula;
--   ALTER TABLE seguros.portal_bien DROP CONSTRAINT portal_bien_persona_vehiculo;
