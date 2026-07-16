-- 2026-07-15 — Segunda pasada de limpieza del flag `requiere_revision` zombie.
--
-- El saneo del 2026-07-10 (2026-07-10_limpiar_requiere_revision_confirmados.sql) bajó el flag en
-- todas las filas ya confirmadas y arregló el endpoint /api/banca/confirmar para que no volviera a
-- crecer. Pero quedó UN productor de zombies sin tapar: /api/banca/destino (reclasificar el negocio
-- desde el libro de /banca o el desglose de la correduría) marcaba `destino_confirmado = true` SIN
-- limpiar `requiere_revision`. Así, un cargo personal reclasificado (p. ej. la compra de CORTEFIEL
-- en la tarjeta BBVA, que por descarte había caído a 'seguros' + requiere_revision) seguía saliendo
-- en la bandeja «🏷️ Gastos por revisar · categoría» pese a estar ya clasificado y confirmado.
--
-- Ahora /api/banca/destino limpia el flag (como el resto de rutas de confirmar) y la propia bandeja
-- (lib/banca.ts::listarPorRevisar) filtra `destino_confirmado = false` como ya hacían getAlertas,
-- el health-check y /finanzas/gastos. Esta limpieza es idempotente y solo baja un flag en filas ya
-- confirmadas.
UPDATE movimientos_bancarios
SET requiere_revision = false
WHERE requiere_revision = true
  AND COALESCE(destino_confirmado, false) = true;
