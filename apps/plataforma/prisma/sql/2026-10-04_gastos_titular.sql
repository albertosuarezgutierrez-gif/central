-- ⛔ NO APLICADA (04/10/2026). DDL en producción: requiere PR-review + segundo par de ojos antes de
--    pegarla. Hasta que se aplique, NADA del código la usa (el helper `asignar-titular.ts` es puro y
--    el cableado en `procesar.ts`/`imputar.ts` se hace DESPUÉS, en otro cambio).
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
-- `negocio_id` puede quedar NULL con sociedad asignada: gasto compartido de los pisos, personal, o
-- de la correduría (que hoy NO es un negocio en plataforma: Grupo ASegura es Alberto persona
-- física, mismo NIF que los pisos). NULL ahí = «actividad sin determinar», no «ninguna».

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS sociedad_id       uuid NULL REFERENCES public.sociedades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS negocio_id        uuid NULL REFERENCES public.negocios(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS titular_fuente    text NULL,
  ADD COLUMN IF NOT EXISTS titular_pendiente text NULL;

ALTER TABLE public.gastos
  ADD CONSTRAINT gastos_titular_fuente_chk CHECK (
    titular_fuente IS NULL OR titular_fuente IN
      ('nif_receptor', 'nombre_receptor', 'propiedad', 'propiedad_compartida', 'propiedad_personal', 'manual')),
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
ALTER TABLE public.sociedades
  ADD CONSTRAINT sociedades_estado_chk CHECK (estado IN ('activa', 'paralizada', 'disuelta'));

-- Punto y Coma Gestión SL: dormida desde finales de 2025, no disuelta (skill perfil-fiscal).
-- Por CIF, no por nombre; el UPDATE debe afectar a 1 fila (comprobar antes con SELECT).
UPDATE public.sociedades SET estado = 'paralizada' WHERE cif = 'B90446683';
