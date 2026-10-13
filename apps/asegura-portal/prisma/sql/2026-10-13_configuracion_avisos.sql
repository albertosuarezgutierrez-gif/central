-- ⏳ SIN APLICAR. Portal de Grupo ASegura — «Configuración → Avisos» (13/10/2026, fase A).
--
-- Se aplica ANTES de desplegar el código que la usa (mismo paso que el despliegue). Sin ella:
--   · `/configuracion` y la bienvenida de avisos responden error al leer/guardar (ruidoso);
--   · los crons `avisos-push` y `avisos-cima` fallan al leer las preferencias (500 / `fallos`), no
--     mandan con valores inventados.
-- Es ADITIVA: una tabla nueva; nada existente cambia.
--
-- Una fila por identidad, y SOLO cuando la persona toca algo. 🚨 `NULL` = «no lo ha configurado»,
-- nunca «no quiere»: sin fila o con la columna a NULL manda lo de antes (push activo, 7 días, sin
-- franja). Reglas en `packages/module-seguros-portal/src/preferencias-avisos.ts`.
--
--   canal                       'movil' | 'correo' | 'ambos'. Hoy solo lo leen los crons de PUSH del
--                               portal; el correo de vencimiento (`apps/asegura`) todavía no.
--   dias_antelacion             3 | 7 | 15 | 30: cuántos días antes de la fecha accionable sale el push.
--   no_molestar_desde/_hasta    minutos desde medianoche (0..1439), HORA DE MADRID; las dos o ninguna.
--   bienvenida_pospuesta_en     último «Ahora no» de la bienvenida de avisos: no se vuelve a preguntar
--                               en 14 días (`DIAS_POSPONER_BIENVENIDA`).
--   bienvenida_pospuesta_vista  en qué situación se dijo: 'inactivas' (se podía activar) o
--                               'instalar_ios' (iPhone sin instalar). Un «Ahora no» dicho a la guía de
--                               instalación NO tapa la pregunta cuando ya la abre instalada.
--
-- El consentimiento NO va aquí: va en `portal_consentimiento` (append-only, tipo `avisos`).
SET search_path = seguros, public;

BEGIN;

CREATE TABLE IF NOT EXISTS seguros.portal_preferencias_avisos (
  identidad_id               uuid PRIMARY KEY REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  canal                      text CHECK (canal IN ('movil', 'correo', 'ambos')),
  dias_antelacion            smallint CHECK (dias_antelacion IN (3, 7, 15, 30)),
  no_molestar_desde          smallint CHECK (no_molestar_desde BETWEEN 0 AND 1439),
  no_molestar_hasta          smallint CHECK (no_molestar_hasta BETWEEN 0 AND 1439),
  bienvenida_pospuesta_en    timestamptz,
  bienvenida_pospuesta_vista text CHECK (bienvenida_pospuesta_vista IN ('inactivas', 'instalar_ios')),
  actualizado_en             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_preferencias_avisos_franja_completa
    CHECK ((no_molestar_desde IS NULL) = (no_molestar_hasta IS NULL)),
  CONSTRAINT portal_preferencias_avisos_franja_no_vacia
    CHECK (no_molestar_desde IS NULL OR no_molestar_desde <> no_molestar_hasta)
);

-- Como el resto de `portal_*`: el aislamiento lo da el CÓDIGO (todo `where` lleva `identidadId` de la
-- cookie), no RLS. Explícito para que un activado automático no deje al rol (SIN BYPASSRLS) leyendo vacío.
ALTER TABLE seguros.portal_preferencias_avisos DISABLE ROW LEVEL SECURITY;

-- Sin DELETE: la fila muere con la identidad (ON DELETE CASCADE, supresión incluida).
GRANT SELECT, INSERT, UPDATE ON seguros.portal_preferencias_avisos TO prisma_asegura_portal;

-- Los privilegios por defecto del schema dan DML a `crm_seguros` en cada tabla nueva: se le quitan
-- (landmine de `apps/asegura-portal/CLAUDE.md`, 24/09/2026).
REVOKE ALL ON seguros.portal_preferencias_avisos FROM crm_seguros;

COMMIT;

-- ── Verificación tras aplicar (solo lectura) ─────────────────────────────────
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--  WHERE table_schema = 'seguros' AND table_name = 'portal_preferencias_avisos' ORDER BY 1, 2;
-- SELECT relrowsecurity FROM pg_class WHERE oid = 'seguros.portal_preferencias_avisos'::regclass;
--
-- ── Marcha atrás ─────────────────────────────────────────────────────────────
-- Antes, revertir el código (los crons y `/configuracion` la leen). Se pierden las preferencias
-- guardadas; los consentimientos siguen en `portal_consentimiento`:
--   DROP TABLE IF EXISTS seguros.portal_preferencias_avisos;
