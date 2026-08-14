-- 2026-08-14 — Congelar la referencia PriceLabs en el día de su desconexión real.
--
-- PriceLabs se desconectó de Smoobu el 10/08/2026 (Alberto, toggles OFF en los 4 pisos). El upsert
-- diario de `pricing/apply` seguía re-capturando `pricing_pl_referencia` desde `rate_snapshots`,
-- que lee Smoobu — es decir, desde el 10/08 la "referencia PL" capturaba los precios del PROPIO
-- motor: un suelo autorreferente (85% de sí mismo) que jamás caducaba, porque `captured_at` se
-- refrescaba cada día y el corte de PL_REF_MAX_AGE_DAYS (120 días) nunca llegaba a aplicar.
--
-- El upsert se elimina del código en este mismo PR. Esta migración deja el reloj honesto: todo lo
-- capturado después de la desconexión se fecha en el último día en que PL escribió de verdad.
-- Con ello el suelo PL caduca solo el 08/12/2026, que era el diseño original.
--
-- Idempotente. APLICADA por Supabase MCP el 14/08/2026.

UPDATE pricing_pl_referencia
SET captured_at = '2026-08-10'
WHERE captured_at > '2026-08-10';
