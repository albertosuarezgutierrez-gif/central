-- 2026-07-10 — Limpieza del flag `requiere_revision` zombie.
--
-- La ingesta pone `requiere_revision = true` en los movimientos ambiguos, pero al CONFIRMAR el
-- destino (endpoint /api/banca/confirmar) NO se limpiaba el flag (sí lo hacían el agente contable
-- y /finanzas/categorias/asignar, pero no el confirmar de banca). Resultado: ~1.200 movimientos
-- ya clasificados y confirmados seguían con requiere_revision=true, y el banner del dashboard
-- (getGastosSinClasificar) los contaba como "sin clasificar" → falso aviso "58.097,99€ sin
-- clasificar / 38 gastos por revisar" cuando en realidad 0€ estaban sin clasificar.
--
-- Un movimiento con destino_confirmado=true YA está clasificado: el flag sobra. Esta limpieza es
-- idempotente y reversible en la práctica (solo baja un flag en filas ya confirmadas). A partir de
-- ahora el propio endpoint de confirmar limpia el flag, así que el zombie no vuelve a crecer.
UPDATE movimientos_bancarios
SET requiere_revision = false
WHERE requiere_revision = true
  AND COALESCE(destino_confirmado, false) = true;
