-- ⛔ NO APLICADA (04/10/2026). DDL en producción: requiere PR-review + segundo par de ojos antes de
--    pegarla. ORDEN: 1) este fichero · 2) `2026-10-04_gastos_titular_backfill.sql` (REGENERADO con
--    `scripts/backfill-gastos-titular.ts` justo antes de pegarlo).
--    El código ya está cableado pero DETECTA el esquema (`lib/agente-facturas/esquema-titular.ts`,
--    information_schema, cacheado): sin estas columnas inserta exactamente como antes. Los informes
--    filtran descartados con `sqlGastoVigente()`, que funciona con y sin la columna.
--    Todo va en UNA transacción: o entra entero o nada (la detección mira varias columnas a la vez).
--
-- A quién va cada gasto. `gastos` no tiene sociedad, negocio ni cuenta: 37 de 73 gastos de los
-- últimos 90 días ni siquiera traen `propiedad`, y aun con propiedad solo se puede subir a la
-- jerarquía Cuenta → Sociedad → Negocio por `negocios.ref_ext` (los cuatro pisos), no para lo
-- compartido, lo personal ni la correduría.
--
-- Por qué columnas y no una vista derivada al vuelo:
--   · el NIF del receptor solo vive en `raw_extraction` (salida del extractor, ruidosa) y la
--     decisión tiene que poder CORREGIRSE a mano sin que la vista la vuelva a pisar;
--   · el estado «pendiente de asignar» (p. ej. Punto y Coma paralizada) es un hecho con aviso, no
--     un cálculo: tiene que quedar escrito.
--
-- Tres estados (regla del monorepo, NULL = «no se sabe», nunca «no hay»):
--   · sin evaluar      → sociedad_id NULL, titular_fuente NULL, titular_pendiente NULL (todo lo antiguo)
--   · evaluado sin dato→ sociedad_id NULL, titular_pendiente = motivo ('sociedad_paralizada', …)
--   · asignado         → sociedad_id NOT NULL, titular_fuente = de dónde salió
--
-- `negocio_id` puede quedar NULL con sociedad asignada: gasto compartido de los pisos o personal
-- (`titular_fuente` *_compartida / *_personal lo distingue), o actividad sin determinar. La
-- correduría SÍ pasa a ser un negocio (abajo), bajo Alberto persona física (mismo NIF que los pisos).

BEGIN;

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS sociedad_id       uuid NULL REFERENCES public.sociedades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS negocio_id        uuid NULL REFERENCES public.negocios(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS titular_fuente    text NULL,
  ADD COLUMN IF NOT EXISTS titular_pendiente text NULL;

-- Constraints re-ejecutables: DROP IF EXISTS + ADD (Postgres no tiene ADD CONSTRAINT IF NOT EXISTS).
ALTER TABLE public.gastos
  DROP CONSTRAINT IF EXISTS gastos_titular_fuente_chk,
  DROP CONSTRAINT IF EXISTS gastos_titular_pendiente_chk,
  DROP CONSTRAINT IF EXISTS gastos_titular_coherente_chk;
ALTER TABLE public.gastos
  -- 'proveedor*' = regla explícita por proveedor (`REGLAS_PROVEEDOR` de asignar-titular.ts).
  ADD CONSTRAINT gastos_titular_fuente_chk CHECK (
    titular_fuente IS NULL OR titular_fuente IN
      ('nif_receptor', 'nombre_receptor', 'propiedad', 'propiedad_compartida', 'propiedad_personal',
       'proveedor', 'proveedor_compartida', 'proveedor_personal', 'manual')),
  ADD CONSTRAINT gastos_titular_pendiente_chk CHECK (
    titular_pendiente IS NULL OR titular_pendiente IN
      ('sociedad_paralizada', 'conflicto_titular', 'receptor_no_titular', 'sin_datos')),
  -- Asignado y pendiente a la vez no tiene sentido; el negocio sin sociedad tampoco.
  ADD CONSTRAINT gastos_titular_coherente_chk CHECK (
    NOT (sociedad_id IS NOT NULL AND titular_pendiente IS NOT NULL)
    AND NOT (negocio_id IS NOT NULL AND sociedad_id IS NULL));

CREATE INDEX IF NOT EXISTS gastos_sociedad_id_idx ON public.gastos (sociedad_id) WHERE sociedad_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS gastos_titular_pendiente_idx ON public.gastos (titular_pendiente) WHERE titular_pendiente IS NOT NULL;

-- Estado de la sociedad: una paralizada NO recibe gastos automáticamente. `sociedades` la comparten
-- sivra e ialimp; la columna lleva DEFAULT, así que no rompe a quien no la lea. NO se añade al
-- `schema.prisma` a propósito: Prisma selecciona todas las columnas del modelo, y declararla antes
-- de aplicar este SQL tumbaría /api/sociedades, conciliación y el briefing. Se lee por SQL crudo.
ALTER TABLE public.sociedades
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'activa';
ALTER TABLE public.sociedades DROP CONSTRAINT IF EXISTS sociedades_estado_chk;
ALTER TABLE public.sociedades
  ADD CONSTRAINT sociedades_estado_chk CHECK (estado IN ('activa', 'paralizada', 'disuelta'));

-- Punto y Coma Gestión SL: dormida desde finales de 2025, no disuelta (skill perfil-fiscal).
-- Por CIF, no por nombre; el UPDATE debe afectar a 1 fila (comprobar antes con SELECT).
UPDATE public.sociedades SET estado = 'paralizada' WHERE cif = 'B90446683';

-- ── Negocio «Grupo ASegura (correduría)» ────────────────────────────────────────────────────────
-- Decisión de Alberto (04/10/2026): la correduría es un negocio APARTE de los pisos y del Dúplex,
-- bajo Alberto persona física (CIF 28823484E de la cuenta de Alberto). Columnas = las reales de
-- `negocios` (id/created_at por defecto; sin cifras manuales). `ref_ext = 'grupo_asegura'` es la
-- clave con la que lo busca `asignarTitular` (REF_NEGOCIO_CORREDURIA). `app = 'asegura'` no tiene
-- proveedor de KPIs en `lib/financiero.ts` → su resumen sale «sin datos», no 0.
-- Idempotente: no hay índice único en (sociedad_id, ref_ext), así que WHERE NOT EXISTS.
INSERT INTO public.negocios (sociedad_id, nombre, sector, ref_ext, app)
SELECT s.id, 'Grupo ASegura (correduría)', 'seguros', 'grupo_asegura', 'asegura'
FROM public.sociedades s
WHERE s.cif = '28823484E'
  AND s.cuenta_id = '4fdc993a-dde7-4200-8fc6-0e8840802ff1'
  AND NOT EXISTS (
    SELECT 1 FROM public.negocios n WHERE n.sociedad_id = s.id AND n.ref_ext = 'grupo_asegura');

-- Exactamente UNO (si la sociedad no casara, el INSERT no haría nada en silencio y las reglas por
-- proveedor no aplicarían: mejor abortar la transacción entera).
DO $$
BEGIN
  IF (SELECT count(*) FROM public.negocios n JOIN public.sociedades s ON s.id = n.sociedad_id
      WHERE n.ref_ext = 'grupo_asegura' AND s.cuenta_id = '4fdc993a-dde7-4200-8fc6-0e8840802ff1') <> 1 THEN
    RAISE EXCEPTION 'negocio grupo_asegura: se esperaba exactamente 1 en la cuenta de Alberto';
  END IF;
  IF (SELECT count(*) FROM public.sociedades WHERE cif = 'B90446683' AND estado = 'paralizada') <> 1 THEN
    RAISE EXCEPTION 'Punto y Coma: se esperaba exactamente 1 sociedad paralizada';
  END IF;
END $$;

-- ── Descarte suave de duplicados ───────────────────────────────────────────────────────────────
-- El botón «Quitar duplicado» de Telegram (`gdup_del`) NO borra: marca. Así se puede deshacer y
-- queda rastro. NULL = vigente. Los informes lo excluyen con `sqlGastoVigente()`.
ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS descartado_at     timestamptz NULL,
  ADD COLUMN IF NOT EXISTS descartado_motivo text NULL;

COMMIT;
