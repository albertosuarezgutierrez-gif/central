-- Backfill: cuota RETA de Alberto (BBVA) mal clasificada como destino='personal'.
--
-- lib/destino.ts ya clasifica correctamente una cuota TGSS en BBVA como destino='seguros'
-- (deducible, Art. 30.2.1ª LIRPF), pero estas 4 filas quedaron con destino='personal' y
-- destino_confirmado=true (confirmadas antes de que existiera esa regla o por error manual),
-- así que nunca volvieron a pasar por la clasificación automática ni por la bandeja "por
-- revisar". 1.314,95€ de cuota de autónomos llevaban meses contando como consumo personal
-- (no deducible) en vez de gasto de la correduría.
--
-- Además una compra suelta ("COMPRA EN GRUPO VIVO DIAGNOSTICO", tarjeta Kutxa, gasto médico
-- puntual) tenía subcategoria='seguro_salud' — código reservado a pólizas de correduría, ni
-- siquiera está en la lista canónica de subcategorías personales (lib/categorias-personales.ts)
-- — por eso salía con el icono genérico "•" en el desglose de "En qué gasto". destino='personal'
-- SÍ es correcto ahí (es un gasto médico con tarjeta, no una póliza); solo se corrige la
-- subcategoría a 'otros_gasto'.
--
-- Hallado al auditar el epígrafe 🏠 Personal recién añadido a /banca (PR #1000, 18/07/2026).

UPDATE movimientos_bancarios
SET destino = 'seguros', subcategoria = 'cuota_autonomos'
WHERE id IN (
  '35e24f67-8445-40fc-a399-d2ce2ea93554', -- 30/06/2026 -388.95
  '8e6c50f5-1f0f-4010-96e8-e72869bcb899', -- 29/05/2026 -388.95
  'd17ab20f-c61f-4c06-8efe-4b9c8eaa321b', -- 30/04/2026 -388.95
  'd454c3a0-bd2c-4eb1-a0a4-905b1859f1ff'  -- 31/03/2026 -148.10
);

UPDATE movimientos_bancarios
SET subcategoria = 'otros_gasto'
WHERE id = 'ecd81a17-951d-471a-ba91-327c6d42154e'; -- 22/06/2026 -125.00 GRUPO VIVO DIAGNOSTICO

-- Aplicado en Supabase MCP el 18/07/2026. Este archivo es solo constancia (idempotente si se
-- re-ejecuta: los WHERE apuntan a ids fijos).
