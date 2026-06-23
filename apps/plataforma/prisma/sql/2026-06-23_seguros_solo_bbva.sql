-- La correduría (destino='seguros') es SIEMPRE BBVA (23/06/2026).
--
-- Un "RECIBO GENERALI/OCCIDENT/LIBERTY SEGUROS" en Kutxabank (u otro banco) es el seguro PROPIO de
-- Alberto (coche/hogar), NO una comisión de la correduría. El clasificador (lib/destino.ts) marcaba
-- como 'seguros' cualquier movimiento con nombre de aseguradora en cualquier banco → metía esos
-- recibos personales en la matriz de correduría. Arreglado en código: 'seguros' solo se asigna en BBVA.
--
-- Data: sacar de 'seguros' los movimientos que NO son de BBVA y pasarlos a 'personal'. (Si alguno
-- fuese el seguro de un piso turístico, se reclasifica a 'turistico_pisos' desde el desglose.)
-- YA APLICADO por MCP a la BD compartida. Eran 13 (12 Kutxa: Generali/Occident/Liberty; 1 N26 Cabify).

UPDATE movimientos_bancarios mb
SET destino = 'personal',
    requiere_revision = false,
    analizado_at = COALESCE(mb.analizado_at, now())
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id
  AND mb.destino = 'seguros'
  AND cb.banco NOT ILIKE '%BBVA%';
