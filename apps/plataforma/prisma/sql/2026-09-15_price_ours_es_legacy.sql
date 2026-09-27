-- 2026-09-15 · `rate_snapshots.price_ours` NO es «nuestro precio»: es el motor RETIRADO.
--
-- El motor vivo es `apps/plataforma/app/api/sivra/pricing/apply` y sus decisiones viven en
-- `pricing_decisiones`. `price_ours` lo escribe el motor sombra de sivra, retirado el 18/07/2026
-- (su ruta devuelve 410). La vista `v_precio_vivo` ya lo renombra a `precio_sombra_legacy`, pero
-- la columna física conserva el nombre engañoso y es la que se ve al consultar la tabla a pelo.
--
-- 🚨 Caso fundacional (15/09/2026): consultando `rate_snapshots` para responder por el precio de
-- Semana Santa 2027 del Dúplex se leyó `price_ours` como «lo que pide nuestro motor» y se informó
-- de 612€/575€ para el sábado 27 y el domingo 28. La última decisión REAL del agente para el 27
-- era 358€, y para el 28 no había ninguna. Con esos números se estuvo a punto de fijar precio a un
-- cliente por WhatsApp.
--
-- NO se renombra la columna: la escriben y la leen `rates/snapshot`, `pricing/experiments` y la
-- página de pricing en las dos apps, y un rename es un corte de servicio a cambio de nada. Lo que
-- se arregla es que el nombre deje de poder leerse solo.
COMMENT ON COLUMN rate_snapshots.price_ours IS
  'MOTOR SOMBRA LEGACY (sivra, retirado 18/07/2026). NO es el precio del motor vivo: ese vive en '
  'pricing_decisiones (apps/plataforma /api/sivra/pricing/apply). El precio publicado es price_live.';

-- 🚨 Corregido el mismo 15/09/2026, a instancia de Alberto («pricelabs ya no estamos conectado»).
-- La primera versión de este COMMENT decía «hoy lo fija PriceLabs»: FALSO. PriceLabs se desconectó
-- el 10/08/2026 y no queda ni un cliente HTTP suyo en el repo. Quien fija el precio publicado es
-- NUESTRO motor (`/api/sivra/pricing/apply` → Smoobu). El error es el mismo que provocó este
-- fichero —leer el nombre de una columna como si fuera su contenido— cometido al redactar el
-- arreglo. El nombre `price_pricelabs` es un fósil: hoy guarda el precio VIVO leído de Smoobu.
COMMENT ON COLUMN rate_snapshots.price_live IS
  'Precio PUBLICADO en el canal esa noche. Lo fija NUESTRO motor (/api/sivra/pricing/apply -> '
  'Smoobu); PriceLabs se desconecto el 10/08/2026 y ya no escribe nada. Es lo que ve el huesped.';

COMMENT ON TABLE pricing_decisiones IS
  'Decisiones del motor de pricing VIVO. dry_run=true significa que NO se aplicó al canal: una fila '
  'dry_run no es el precio publicado (ese es rate_snapshots.price_live).';
