-- Vertical TALLER — 0013: TRAZA del vencimiento del seguro del vehículo (07/11/2026). Requiere 0001-0012. IDEMPOTENTE y ADITIVA.
-- ⛔ NO APLICADA desde el código: se aplica a mano como `postgres` (preview → prod tras OK de Alberto).
--
-- `vehiculos.seguro_hasta` ya existe desde 0001 (NULL = «no se sabe», nunca un valor por defecto). Lo teclea el recepcionista
-- en la RECEPCIÓN o en la ENTREGA (helper puro `validarVencimientoSeguro`/`cambioVencimientoSeguro` de module-taller,
-- ± 730 días respecto a hoy). Aquí solo se añade QUIÉN, CUÁNDO y DESDE QUÉ MOMENTO lo puso.
-- Sin datos por defecto, sin backfill: las filas antiguas quedan con la traza a NULL («no consta quién»).
-- El dato no sale del taller: al back office de Grupo ASegura solo con el consentimiento `asegura` vigente (spec §6); hoy no
-- hay transporte de leads (F3). RLS de `vehiculos` intacto (no se toca ninguna política).
BEGIN;

ALTER TABLE taller.vehiculos ADD COLUMN IF NOT EXISTS seguro_hasta_por uuid;
ALTER TABLE taller.vehiculos ADD COLUMN IF NOT EXISTS seguro_hasta_en timestamptz;
ALTER TABLE taller.vehiculos ADD COLUMN IF NOT EXISTS seguro_hasta_origen text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehiculos_seguro_hasta_por_fk') THEN
    ALTER TABLE taller.vehiculos ADD CONSTRAINT vehiculos_seguro_hasta_por_fk
      FOREIGN KEY (taller_id, seguro_hasta_por) REFERENCES taller.usuarios_taller(taller_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehiculos_seguro_hasta_origen_chk') THEN
    -- ≡ ORIGENES_VENCIMIENTO_SEGURO de module-taller (cepo test/esquema-sql-0013.test.ts).
    ALTER TABLE taller.vehiculos ADD CONSTRAINT vehiculos_seguro_hasta_origen_chk
      CHECK (seguro_hasta_origen IS NULL OR seguro_hasta_origen IN ('recepcion', 'entrega'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehiculos_seguro_hasta_traza_chk') THEN
    -- La traza va entera o no va: cuándo y desde dónde, juntos (quién puede faltar solo en filas sin persona identificada).
    ALTER TABLE taller.vehiculos ADD CONSTRAINT vehiculos_seguro_hasta_traza_chk
      CHECK ((seguro_hasta_en IS NULL) = (seguro_hasta_origen IS NULL));
  END IF;
END $$;

GRANT UPDATE (seguro_hasta, seguro_hasta_por, seguro_hasta_en, seguro_hasta_origen, actualizado_en) ON taller.vehiculos TO prisma_taller;

COMMIT;
