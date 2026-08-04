-- 2026-07-12 · Limpieza de reglas-trampa de banca_destino_reglas + reclasificación de las comisiones
-- de la correduría que quedaron mal parkeadas en turistico_pisos.
--
-- CONTEXTO (incidente): la correduría mostraba «Cobrado: 0,00€» en julio 2026 pese a haber comisiones
-- cobradas (Generali 9,15€, Caser 12,66€, Occident 279,68€…). Causa: la tabla banca_destino_reglas
-- (reglas aprendidas clave→destino, que se aplican por SUBSTRING con prioridad sobre el clasificador)
-- se envenenó con una regla «TRANSF → turistico_pisos» (6 chars) que es substring de todo
-- «TRANSFERENCIAS // TRANSFERENCIA RECIBIDA // …» → secuestraba TODA transferencia recibida de BBVA,
-- incluidas las comisiones de seguros, mandándolas a pisos. Como la correduría suma solo
-- destino='seguros', desaparecían.
--
-- El código ya está arreglado (lib/destino.ts amplía los marcadores de agente; lib/correduria.ts
-- añade claveReglaValida() y se aplica en los puntos de aprendizaje + como filtro al aplicar reglas).
-- Esta migración limpia el DATO histórico. Idempotente. Aplicar por Supabase MCP (rol postgres).
--
-- Verificado en READ-ONLY antes de escribir (12/07/2026): sobre los abonos BBVA activos hoy en
-- turistico_pisos → 29 son seguros (2.408,41€), 24 son turistico_duplex/Booking (9.137,85€) y 65 son
-- «Transferencia recibida» a secas (22.924,59€, 2025→2026-03: PREVIOS al bug, ambiguos, año cerrado)
-- → estos NO se reclasifican, solo se marcan para revisión manual. Los gemelos Excel de las comisiones
-- ya están duplicado_estado='ignorado' (no hay doble conteo: el activo es el feed psd2).

BEGIN;

-- ── 1) Borrar las reglas-trampa (claves genéricas que colisionan por substring) ─────────────────
-- Espejo de lib/correduria.ts::claveReglaValida: claves de <4 chars, o compuestas SOLO de términos
-- genéricos del banco. Se listan explícitamente las detectadas + un barrido por longitud/genéricas.
DELETE FROM banca_destino_reglas
WHERE upper(clave) IN (
  'TRANSF','TRANSFER','TRANSFERENCIA','TRANSFERENCIAS','TRASPASO','ABONO','PAGO','RECIBO','RECEIPT',
  'ADEUDO','CARGO','SALDO','INGRESO','COMPRA','MOVIMIENTO','SEPA','TARJETA','TARJ','TOTAL','VARIOS',
  'OTROS','OTRO','GASTO','GASTOS','MODA','RESTAURANTE','RESTAURANTES','RECIBIDA','RECIBIDO','BIZUM'
)
   OR length(trim(clave)) < 4;

-- ── 2) Corregir reglas con destino SEMÁNTICAMENTE erróneo ───────────────────────────────────────
-- GOOGLE ONE (suscripción personal) y PEPEPHONE (telecom personal) estaban marcados como 'seguros'
-- por un clic equivocado. Se borran las reglas (PEPEPHONE ya se resuelve a personal por keyword) y se
-- corrigen los movimientos que hubieran quedado en seguros por ellas.
DELETE FROM banca_destino_reglas WHERE upper(clave) IN ('GOOGLE ONE','PEPEPHONE');

UPDATE movimientos_bancarios mb
SET destino = 'personal', destino_confirmado = false, compania_seguros = NULL
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id
  AND mb.destino = 'seguros'
  AND (upper(coalesce(mb.concepto,'')) LIKE '%GOOGLE ONE%' OR upper(coalesce(mb.concepto,'')) LIKE '%PEPEPHONE%');

-- ── 3) Reclasificar los abonos BBVA (importe>0) mal parkeados en turistico_pisos ────────────────
-- 3a) Comisiones/liquidaciones de la correduría → seguros (marcadores de lib/destino.ts).
UPDATE movimientos_bancarios mb
SET destino = 'seguros', destino_confirmado = true, requiere_revision = false
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id AND cb.banco = 'BBVA'
  AND mb.importe > 0 AND mb.destino = 'turistico_pisos'
  AND coalesce(mb.duplicado_estado,'') <> 'ignorado'
  -- NO tocar el cobro de Booking del Dúplex ("LIQ. OP. Nº"): eso es 3b.
  AND NOT (upper(coalesce(mb.concepto,'')) ~ 'LIQ\.?\s*OP\.?\s*N'
           AND upper(coalesce(mb.concepto,'')) !~ 'GENERALI|ALLIANZ|MAPFRE|CASER|AXA|OCCIDENT|CATALANA|ASISA|LIBERTY|ZURICH|REALE|MUTUA|PELAYO|HELVETIA|PLUS ULTRA|SEGURO')
  AND (
        upper(coalesce(mb.concepto,'')) ~ 'GENERALI|ALLIANZ|MAPFRE|CASER|AXA|OCCIDENT|CATALANA|ASISA|LIBERTY|ZURICH|REALE|MUTUA|PELAYO|HELVETIA|PLUS ULTRA|SEGURO'
     OR upper(coalesce(mb.concepto,'')) ~ 'LIQ\.?\s*COMIS|LIQUIDACI[OÓ]N\s+(DE\s+)?COMIS|COMISION|FRA-?\s*COMIS|G\.[0-9]{3,}\s*LIQ'
     OR upper(coalesce(mb.concepto,'')) ~ 'SALDO AGENTE|REMSALDO|SALDO CUENTA|PAGO SALDO CTA|PD005|SALDO\.\s*[A-Z0-9]|M[0-9]{4,}|[0-9]/[0-9]{4,}'
  );

-- 3b) Cobro de Booking del Dúplex ("LIQ. OP. Nº …", sin nombre de aseguradora) → turistico_duplex.
UPDATE movimientos_bancarios mb
SET destino = 'turistico_duplex', destino_confirmado = true, requiere_revision = false
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id AND cb.banco = 'BBVA'
  AND mb.importe > 0 AND mb.destino = 'turistico_pisos'
  AND coalesce(mb.duplicado_estado,'') <> 'ignorado'
  AND upper(coalesce(mb.concepto,'')) ~ 'LIQ\.?\s*OP\.?\s*N'
  AND upper(coalesce(mb.concepto,'')) !~ 'GENERALI|ALLIANZ|MAPFRE|CASER|AXA|OCCIDENT|CATALANA|ASISA|LIBERTY|ZURICH|REALE|MUTUA|PELAYO|HELVETIA|PLUS ULTRA|SEGURO';

-- ── 4) «Transferencia recibida» a secas (BBVA, importe>0) → NO se adivina el negocio ─────────────
-- Son PREVIAS al bug (2025→2026-03), ambiguas (correduría / Dúplex viejo / personal) y del año cerrado.
-- Se marcan para revisión manual (aparecerán en la bandeja de ingresos por revisar) sin cambiar su
-- destino: que Alberto decida. NO se auto-mueven 22.924€ de golpe.
UPDATE movimientos_bancarios mb
SET requiere_revision = true, destino_confirmado = false
FROM cuentas_bancarias cb
WHERE cb.id = mb.cuenta_bancaria_id AND cb.banco = 'BBVA'
  AND mb.importe > 0 AND mb.destino = 'turistico_pisos'
  AND coalesce(mb.duplicado_estado,'') <> 'ignorado'
  AND upper(regexp_replace(coalesce(mb.concepto,''), '\s+', ' ', 'g')) = 'TRANSFERENCIA RECIBIDA';

COMMIT;
