-- 2026-09-21 — Colisión CIMA ↔ volcado: pólizas que el emparejador no puede resolver
--
-- 🔍 SOLO LECTURA. No hay UPDATE aquí a propósito: ver el final del fichero.
--    Contexto y alcance en docs/CIMA-CUARENTENA.md, apartado del 21/09/2026.
--
-- QUÉ MIDE: grupos de pólizas que comparten la clave de emparejamiento
-- (`numero_poliza` normalizado + `codigo_entidad_dgs`) DENTRO de la misma correduría.
-- `matchReciboPoliza()` y `matchSiniestroPoliza()` exigen candidato ÚNICO, así que
-- cualquier grupo de ≥2 manda a cuarentena todo lo que reclame ese número — y lo
-- registra como `sin_poliza_en_cartera`, que en ese caso es falso.
--
-- 🚨 LA CLAVE TIENE QUE SER LA DEL EMPAREJADOR, NO UNA PARECIDA. Réplica exacta de
-- `normalizePolizaNumber()` (`poliza-matching.ts`): minúsculas CON su puntuación —
-- devuelve `lower`, no `alnum`—, fuera `JUNK_POLIZA_NUMBERS`, fuera longitud
-- alfanumérica < 5, y fuera los placeholders de `isPlaceholderPolizaNumber()` (sin
-- ningún dígito, o un solo carácter repetido). Una clave «parecida» —p. ej. quitar la
-- puntuación, o no filtrar `pendiente`— cuenta colisiones que el emparejador no ve y
-- se calla las que sí. El DGS va `upper(btrim())`, como `normCodigoDgs()`.
--
-- 🚨 Y «cuál de las dos filas es la buena» NO es `import_ref IS NULL`. Esa fue la
-- primera versión de este fichero y era un bug: cuando CIMA trae una póliza que YA
-- estaba en el volcado, actualiza la vieja y le DEJA su `import_ref` (caso medido:
-- la 3021700291186 de Reale C0613). El criterio es `esCarteraViva()` de
-- `@central/module-seguros`: `import_ref IS NULL OR eiac_xml_hash IS NOT NULL`.

with base as (
  select
    p.id,
    p.correduria_id,
    p.numero_poliza,
    p.aseguradora,
    p.estado,
    p.import_ref,
    p.eiac_xml_hash,
    lower(btrim(p.numero_poliza))                                             as lower_num,
    regexp_replace(lower(btrim(p.numero_poliza)), '[^0-9a-z]', '', 'g')       as alnum,
    nullif(upper(btrim(coalesce(p.codigo_entidad_dgs, ''))), '')              as dgs
  from seguros.polizas p
),
candidatas as (
  select *, (import_ref is null or eiac_xml_hash is not null) as es_viva
  from base
  where dgs is not null
    and lower_num is not null and lower_num <> ''
    and lower_num not in ('0', '1', '5', '21', '367')   -- JUNK_POLIZA_NUMBERS
    and length(alnum) >= 5                              -- MIN_PLAUSIBLE_POLIZA_LENGTH
    and alnum ~ '[0-9]'                                 -- isPlaceholder: sin dígitos
    and alnum !~ '^(.)\1+$'                             -- isPlaceholder: un char repetido
)
select
  correduria_id,
  lower_num                                          as clave_emparejador,
  dgs,
  count(*)                                           as filas,
  count(*) filter (where es_viva)                    as vivas,
  count(*) filter (where not es_viva)                as no_vivas,
  string_agg(distinct coalesce(aseguradora, '—'), ' | ')  as aseguradoras,
  case
    when count(*) filter (where es_viva) = 1
      then 'RESCATABLE: 1 viva + histórica(s) — degradando la histórica queda candidata única'
    when count(*) filter (where es_viva) = 0
      then 'SIN CIMA: las dos son volcado — no hay fila viva a la que ceder el sitio'
    else 'DOS VIVAS: no lo arregla degradar nada — mirar una a una'
  end                                                as veredicto
from candidatas
group by correduria_id, lower_num, dgs
having count(*) > 1
order by vivas desc, clave_emparejador;

-- Medido el 21/09/2026 sobre la correduría de Alberto:
--   RESCATABLE → 19 (10 Occident C0468, 8 Mapfre C0058, 1 Allianz C0109)
--   SIN CIMA   → 10
--   DOS VIVAS  → 0
-- Coste ya pagado por las de Occident: 40 recibos en cuarentena (REC 12/07 y 15/09).
--
-- ─────────────────────────────────────────────────────────────────────────────────
-- POR QUÉ AQUÍ NO HAY `UPDATE`
--
-- La primera versión de este fichero traía uno (vaciar `codigo_entidad_dgs` en la fila
-- histórica de cada par) y la revisión le encontró SEIS defectos, uno de ellos capaz de
-- dejar muda una póliza VIVA para siempre. Un `.sql` con `begin/commit` dentro invita a
-- ejecutarse entero, y la comprobación «obligatoria antes del commit» que llevaba no
-- podía frenar nada: el `commit` iba detrás pasara lo que pasara.
--
-- La corrección de verdad no es de datos sino de CÓDIGO, y vive en el repo de la
-- ingesta (`albertosuarezgutierrez-gif/asegura`), donde hay tests del emparejador:
--
--   a) `persist-recibo.ts` / `persist-siniestro.ts` — separar `poliza_ambigua` de
--      `sin_poliza_en_cartera`. Hoy comparten etiqueta y por eso este problema se
--      diagnosticó durante meses como «hay que llamar a la compañía».
--   b) `recibo-matching.ts` / `siniestro-matching.ts` — con ≥2 candidatos, si
--      EXACTAMENTE UNO es cartera viva, ese gana. No relaja nada (sigue exigiendo un
--      único ganador) y arregla también las colisiones que aún no han ocurrido.
--
-- (b) cambia dónde se cuelga un recibo: es cambio de alto riesgo y necesita OK de
-- Alberto y su propio PR con tests. Esta consulta es para decidirlo con el dato
-- delante, no para aplicar nada.
