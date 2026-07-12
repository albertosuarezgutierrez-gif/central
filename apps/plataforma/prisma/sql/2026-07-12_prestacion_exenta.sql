-- 2026-07-12 · Prestación de paternidad (baja) EXENTA de IRPF fuera de la base imponible.
--
-- CONTEXTO: la prestación por nacimiento y cuidado del menor (paternidad) que Alberto cobró como
-- autónomo corredor entró en la correduría (destino='seguros') — correcto como ingreso de su actividad,
-- PERO está EXENTA de IRPF (Art. 7.h LIRPF). Contaba como rendimiento gravable e inflaba la base.
--
-- Solución: se marca `subcategoria='exento'`. `lib/finanzas.ts::getResumenFinanciero` excluye lo
-- exento de la base imponible y de los trimestres (M130), pero lo sigue mostrando como "cobrado"
-- (dinero real) + una línea "Prestaciones exentas (no tributan)". Son 5 abonos (nov 2025–mar 2026,
-- DNI 28823484E), 5.474,28€. Aplicada en prod vía Supabase MCP. Idempotente.

UPDATE movimientos_bancarios
SET subcategoria = 'exento'
WHERE destino = 'seguros'
  AND importe > 0
  AND concepto ILIKE '%28823484E%'
  AND COALESCE(duplicado_estado, '') <> 'ignorado';
