-- ENERGIA XXI (comercializadora regulada de Endesa) = luz de la VIVIENDA HABITUAL Monte Carmelo 68
-- → personal, NO deducible (confirmado por Alberto, 02/07/2026). ✅ APLICADO en prod el 02/07/2026.
--
-- OJO clave específica: 'ENERGIA XXI', NUNCA 'ENERGIA' a secas — arrastraría los conceptos
-- "ENDESA ENERGIA" de la luz de los pisos (lección del 23/06/2026 con la regla «ELECTRICIDAD»).
-- La detección determinista equivalente vive en lib/destino.ts (auto-confirmado, cualquier banco).

BEGIN;

-- 1) Regla aprendida por comercio para la(s) cuenta(s) de Alberto (no cónyuge).
INSERT INTO banca_destino_reglas (cuenta_id, clave, destino)
SELECT DISTINCT cb.cuenta_id, 'ENERGIA XXI', 'personal'
FROM movimientos_bancarios mb JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
WHERE mb.concepto ILIKE '%ENERGIA XXI%' AND cb.titular <> 'conyuge'
  AND NOT EXISTS (
    SELECT 1 FROM banca_destino_reglas r WHERE r.cuenta_id = cb.cuenta_id AND upper(r.clave) = 'ENERGIA XXI'
  );

-- 2) Confirmar los cargos existentes (salen de la bandeja «Por revisar»).
UPDATE movimientos_bancarios mb
SET destino = 'personal', destino_confirmado = true, requiere_revision = false
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id AND cb.titular <> 'conyuge'
  AND mb.concepto ILIKE '%ENERGIA XXI%';

COMMIT;
