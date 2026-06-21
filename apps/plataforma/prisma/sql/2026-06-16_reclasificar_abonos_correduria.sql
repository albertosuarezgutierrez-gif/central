-- Banca · reclasificación del "destino" de los ABONOS (entradas) para arreglar los ingresos de la
-- correduría. Bug: en las transferencias RECIBIDAS el banco rotula el abono con el nombre del
-- TITULAR como contraparte (primera línea del concepto N43), así que la antigua regla
-- "contraparte = titular ⇒ traspaso interno" se tragaba TODAS las comisiones entrantes de la
-- correduría (LIQ.COMISIONES, G.65792 LIQ GENERALI, -FRA-COMIS-, LIQ. OP. Nº, ...) y, al excluirse
-- los traspasos del P&L, la correduría mostraba +668 € de ingresos en vez de ~10.695 €.
--
-- El arreglo de código vive en lib/destino.ts (clasificarDestino ahora distingue abono/cargo).
-- Este script reaplica esa lógica SOLO a los ABONOS ya guardados (los CARGOS conservan su destino
-- ya curado: contienen gastos de pisos —SI QUE BRILLA, lavandería, alquiler— que NO casan con las
-- palabras clave y se moverían mal). Idempotente (solo escribe si cambia). Ya aplicado por Supabase MCP.
WITH calc AS (
  SELECT mb.id,
    CASE
      WHEN upper(coalesce(mb.concepto,'')||' '||coalesce(mb.contraparte,'')) ~ '(TARJ\.?\s*CR[EÉ]?DTO)|(PAGO RECIBO 466)|(466203201)|(PAGO DE TARJETA)|(LIQUIDACION? (DE )?TARJETA)' THEN 'traspaso_interno'
      WHEN upper(coalesce(mb.concepto,'')||' '||coalesce(mb.contraparte,'')) ~ '(\yPENSI[OÓ]N\y)|(INGRESO POR N[OÓ]MINA)|(\yBIZUM\y)' THEN 'personal'
      WHEN upper(coalesce(mb.concepto,'')||' '||coalesce(mb.contraparte,'')) ~ '(LIQ\.?\s*COMIS)|(LIQUIDACI[OÓ]N\s+(DE\s+)?COMIS)|(COMISION)|(FRA-?\s*COMIS)|(G\.\d{3,}\s*LIQ)|(LIQ\.?\s*OP\.?\s*N)'
           OR upper(coalesce(mb.concepto,'')||' '||coalesce(mb.contraparte,'')) ~ '\y(GENERALI|ALLIANZ|MAPFRE|CASER|AXA|ZURICH|REALE|MUTUA|LINEA DIRECTA|SANITAS|ADESLAS|SEGURCAIXA|DKV|ASISA|CATALANA OCCIDENTE|OCCIDENT|LIBERTY|HELVETIA|PLUS ULTRA|SANTALUCIA|OCASO|PELAYO|VERTI|GENESIS|FENIX|DIVINA PASTORA|FIATC|SEGUROS BILBAO|NATIONALE|VIDACAIXA|ANTARES|ARAG|ASEFA|PREVENTIVA|SURNE|QUALITAS|SEGURO|SEGUROS)\y' THEN 'seguros'
      WHEN upper(coalesce(mb.concepto,'')||' '||coalesce(mb.contraparte,'')) ~ '\y(BOOKING|EXPEDIA|TRAVELSCAPE|AGODA|AIRBNB|STRIPE|HOTELBEDS|HOMETOGO|RENTALIA|VRBO|HOLIDU|SMOOBU|PRICELABS|DYNAPRICE|HOMEEXCHANG|IONOS|IKEA|LEROY|BRICO|FERRETER|D CULTO|DCULTO|SIQUE|EMASESA|ENDESA|DIGI|DIMITRI)\y' THEN 'turistico_pisos'
      WHEN cb.banco ILIKE '%BBVA%' THEN CASE WHEN upper(coalesce(mb.concepto,'')||' '||coalesce(mb.contraparte,'')) ~ '\y(COMUNIDAD|PASAJE FRANCISCO|ENDESA|FINETWORK|EMASESA|IBERDROLA|NATURGY|MOVISTAR|VODAFONE|ORANGE|DIGI|AYUNTAMIENTO|AYTO|IKEA|LEROY|BRICO|FERRETER|SMOOBU|PRICELABS|BOOKING|EXPEDIA|TRAVELSCAPE|AGODA|AIRBNB|STRIPE)\y' THEN 'turistico_duplex' ELSE 'seguros' END
      ELSE 'personal'
    END AS destino_new
  FROM movimientos_bancarios mb
  JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
  WHERE mb.importe >= 0
)
UPDATE movimientos_bancarios m
SET destino = calc.destino_new
FROM calc
WHERE m.id = calc.id AND m.destino IS DISTINCT FROM calc.destino_new;
