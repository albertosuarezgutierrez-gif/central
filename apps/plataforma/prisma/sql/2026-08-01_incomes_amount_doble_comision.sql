-- La comisión de Booking se descontaba DOS VECES. Saneo del histórico.
--
-- QUÉ PASABA (01/08/2026). `incomes` tiene un trigger BEFORE INSERT/UPDATE (`incomes_compute_net`,
-- función `compute_income_net()`) que copia a `amount_gross` lo que llegue en `amount` y después
-- calcula `amount = amount_gross × (1 − commission_pct/100)` con la tasa de `portal_rates`.
-- Para BOOKING esa tasa es 19,72% y es CORRECTA: 15% de comisión + 1,3% de servicio de pagos, con
-- el 21% de IVA encima (verificado contra la factura de marzo de 2026).
--
-- El fallo estaba en `lib/sivra/smoobu-sync.ts`, que aplicaba ESE MISMO factor antes de escribir:
--
--     Smoobu 244,86€ → la app escribía 196,57€ en `amount`
--                    → el trigger lo tomaba por el BRUTO y dejaba `amount` = 157,81€
--
-- Resultado: `amount` un 20% por debajo del ingreso real, y `amount_gross` guardando un NETO
-- disfrazado de bruto. El ratio `amount/amount_gross` sale 0,8028 en 1.282 de 1.313 filas (el
-- resto, 0,8027/0,8029, es redondeo), así que el sesgo es uniforme y el histórico recuperable.
--
-- CÓMO SE COMPROBÓ, antes de tocar nada:
--   1. Desglose real de la extranet de Booking (Luxury, 6-8 nov 2026): precio total 244,86€,
--      comisión 36,73€ + 3,18€ de servicio de pagos, +21% IVA = 48,29€ → **neto 196,57€**, que es
--      exactamente el `amount_gross` guardado. Confirma la tasa Y el doble conteo.
--   2. De los pagos de Booking identificables uno a uno en el banco, **14 de 15 casan al céntimo
--      con `amount_gross`** y solo 1 con `amount`.
--   3. Agregado ene-jul 2026 del Dúplex (100% Booking): banco 13.465,27€ · `amount_gross`
--      13.977,34€ · `amount` 11.221,02€. El desfase contra el bruto es de calendario (Booking paga
--      tras el checkout) y solo puede dejar el banco por DEBAJO; que quede un 20% por ENCIMA de
--      `amount` es la prueba.
--   4. No hay ni un solo cargo de comisión de Booking en el banco: se descuenta del pago, no se
--      factura aparte. No existía ningún gasto que justificara el segundo descuento.
--
-- IMPACTO: `amount` es la columna que suman `lib/financiero.ts::getResumenSivra` y
-- `lib/sivra/pl-mensual.ts` — P&L por piso, dashboard, break-even y **base imponible del IRPF**.
-- Solo en 2026: 151 reservas y 17.723,22€ de ingreso que no se estaba contando. El motor de
-- precios NO estaba afectado (lee `amount_gross`, que era el neto y servía de ancla razonable).
--
-- QUÉ HACE ESTE SANEO: devuelve a `amount_gross` el BRUTO real (deshaciendo el factor que la app
-- había aplicado de más). No toca `amount` a mano: al cambiar `amount_gross` el trigger lo
-- recalcula solo con la tasa de `portal_rates`, que es la fuente única y correcta.
--
--     amount_gross := amount_gross / 0,8028   → 196,57 vuelve a 244,86
--     (trigger)     amount := 244,86 × 0,8028 → 196,57  ← el neto de la extranet
--
-- NO ES IDEMPOTENTE: relanzarlo volvería a dividir. El `WHERE` se apoya en que, tras la pasada,
-- ninguna fila de BOOKING conserva la marca del doble conteo — pero si tienes dudas, comprueba
-- antes con `SELECT ROUND((amount/amount_gross)::numeric,4), COUNT(*) ... GROUP BY 1`: el ratio
-- debe seguir siendo 0,8028 (lo pone el trigger) y `amount_gross` debe rondar el precio de Smoobu.
--
-- REVERSIBLE: `UPDATE incomes SET amount_gross = ROUND((amount_gross * 0.8028)::numeric, 2)
-- WHERE portal = 'BOOKING'` (el trigger recalcula `amount` solo).

UPDATE incomes
   SET amount_gross = ROUND((amount_gross / 0.8028)::numeric, 2)::double precision
 WHERE portal = 'BOOKING'
   AND amount_gross IS NOT NULL
   AND amount_gross > 0;

COMMENT ON COLUMN incomes.amount_gross IS
  'BRUTO de la reserva: lo que paga el huesped, tal cual lo publica Smoobu. NO le apliques ninguna comision antes de escribirlo — el trigger incomes_compute_net calcula amount a partir de aqui con la tasa de portal_rates. Ver 2026-08-01_incomes_amount_doble_comision.sql.';

COMMENT ON COLUMN incomes.amount IS
  'NETO de la reserva. Lo calcula SIEMPRE el trigger incomes_compute_net como amount_gross x (1 - portal_rates.commission_pct/100). Para BOOKING la tasa es 19,72% (15% + 1,3% servicio de pagos, +21% IVA). NUNCA lo escribas ya descontado.';
