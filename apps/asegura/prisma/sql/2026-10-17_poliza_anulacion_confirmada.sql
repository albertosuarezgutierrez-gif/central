-- 2026-10-17 — «Anulación confirmada por la compañía» sobre la póliza VIEJA de una sustitución.
--
-- Caso (17/10/2026): Allianz 031698897 confirmada por escrito el 30/09 con efecto 01/11/2026; CIMA aún la da
-- en vigor y el digest «Seguimiento de sustituciones» la anunciaba cada día como posible DOBLE SEGURO.
--
-- Columnas PROPIAS (la ingesta de CIMA no las toca), como `sustituida_at`. NO se reutiliza `baja_verificada_*`:
-- esas son «el cliente se va» (la póliza pasa a `cancelada` YA y el trigger `poliza_respeta_baja_verificada`
-- fuerza `cancelada` sobre cualquier vigente que traiga CIMA). Aquí la vieja sigue cubriendo hasta su efecto y
-- el ESTADO lo sigue mandando CIMA: esto solo la saca del aviso de doble seguro.
--
--   anulacion_confirmada_at / _por  → cuándo y quién lo selló
--   anulacion_confirmada_motivo     → de dónde sale la confirmación (OBLIGATORIO, CHECK)
--   anulacion_efecto                → fecha de efecto de la baja según la compañía (opcional; NULL = no se sabe)
--
-- ✅ Aplicada el 17/10/2026. El código es tolerante sin ella (`hayAnulacionConfirmada()`): el digest se calcula como
-- antes salvo el «vence cuando empieza la nueva», y POST /api/operador/sustituciones responde 503 `sin_migracion`.
-- Idempotente. Deshacer un sello = poner las cuatro a NULL en el MISMO UPDATE.

ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS anulacion_confirmada_at timestamptz;
ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS anulacion_confirmada_por text;
ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS anulacion_confirmada_motivo text;
ALTER TABLE seguros.polizas ADD COLUMN IF NOT EXISTS anulacion_efecto date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'polizas_anulacion_confirmada_con_motivo'
                   AND conrelid = 'seguros.polizas'::regclass) THEN
    ALTER TABLE seguros.polizas ADD CONSTRAINT polizas_anulacion_confirmada_con_motivo
      CHECK (anulacion_confirmada_at IS NULL OR length(btrim(coalesce(anulacion_confirmada_motivo, ''))) > 0);
  END IF;
END $$;
