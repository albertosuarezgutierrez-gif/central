-- 29/08/2026 — IONOS: infraestructura de la correduría, no gasto de los pisos.
--
-- HALLAZGO (Alberto pregunta por los 2 avisos de la bandeja del 29/08). IONOS (dominios, DNS,
-- correo, VPS + Plesk, SSL) vivía en RE_PISOS de lib/destino.ts porque ahí está alojado el dominio
-- housesevillana.es. Consecuencia: los 12 cargos que hay en BD (feb–jul 2026, 310,98 €, todos por
-- PayPal contra la TARJETA de Kutxabank) se repartían solos entre 'turistico_pisos' (9) y 'seguros'
-- (3, reclasificados a mano en junio) — el mismo proveedor contado en dos negocios distintos.
--
-- Es infraestructura de desarrollo, igual que Vercel/Anthropic (que Alberto ya lleva a 'seguros'
-- también cuando se pagan desde N26, no solo desde BBVA). Arreglo en dos piezas:
--   1) lib/destino.ts: IONOS sale de RE_PISOS y entra en RE_SOFTWARE (cubre el caso BBVA).
--   2) este backfill: regla aprendida `IONOS → seguros` + reclasificación de lo ya ingestado.
-- Hace falta la regla porque RE_SOFTWARE solo aplica en BBVA y el cobro real llega por la tarjeta
-- de Kutxabank; es el mismo camino que ya usa la regla `VERCEL → seguros`. Y hace falta el UPDATE
-- explícito porque 10 de los 12 movimientos tienen destino_confirmado=true: una fila confirmada NO
-- se re-clasifica sola nunca (mismo patrón que 2026-07-18_fix_cuota_autonomos_personal.sql).

INSERT INTO banca_destino_reglas (cuenta_id, clave, destino)
SELECT DISTINCT cuenta_id, 'IONOS', 'seguros'
FROM banca_destino_reglas
WHERE clave = 'VERCEL'
ON CONFLICT (cuenta_id, clave) DO UPDATE SET destino = EXCLUDED.destino;

UPDATE movimientos_bancarios
SET destino            = 'seguros',
    subcategoria       = 'informatica',
    destino_confirmado = true,
    requiere_revision  = false
WHERE (COALESCE(concepto, '') || ' ' || COALESCE(contraparte, '')) ~* '\yIONOS\y'
  AND importe < 0
  AND (destino IS DISTINCT FROM 'seguros'
       OR subcategoria IS DISTINCT FROM 'informatica'
       OR requiere_revision
       OR NOT destino_confirmado);

-- Segunda pieza del mismo lío: en 2 de las 5 facturas que el agente de correo sí llegó a leer, el
-- extractor guardó como `nif_proveedor` el NIF del CLIENTE (28823484E, el de Alberto) en vez del de
-- IONOS (B-85049435). La huella del gasto se construye con ese NIF, así que las facturas de IONOS
-- quedaron partidas en DOS proveedores y ninguna acumula historial → «Proveedor nuevo, sin regla
-- aprendida» para siempre. El código ya lo detecta desde el 26/08 (receptor.ts::nifProveedorEsNuestro);
-- esto sanea las filas que entraron antes.
UPDATE gastos
SET nif_proveedor = 'B-85049435',
    fingerprint   = 'B85049435'
WHERE proveedor ILIKE '%IONOS%'
  AND regexp_replace(COALESCE(nif_proveedor, ''), '[^A-Za-z0-9]', '', 'g') = '28823484E';
