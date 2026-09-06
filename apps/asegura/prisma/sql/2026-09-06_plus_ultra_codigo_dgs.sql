-- 2026-09-06 — Plus Ultra ES Occident: rellenar `codigo_entidad_dgs` donde NO cree ambigüedad
--
-- ── Por qué ─────────────────────────────────────────────────────────────────
-- El emparejador de CIMA (`siniestro-matching.ts` / `recibo-matching.ts` del CRM)
-- resuelve la póliza de un siniestro o un recibo por
--     numero_poliza normalizado  +  codigo_entidad_dgs = <la entidad que lo manda>
-- y exige EXACTAMENTE un candidato: 0 → cuarentena, ≥2 → cuarentena. Nunca inventa
-- la FK, que es lo correcto.
--
-- Las 242 pólizas del volcado cuya `aseguradora` dice «Plus Ultra» tienen
-- `codigo_entidad_dgs` a NULL (medido 06/09/2026: 242 de 242). Occident absorbió
-- la marca, así que CIMA manda sus siniestros y recibos como **C0468** — y
-- `NULL = 'C0468'` es falso en SQL, de modo que esas pólizas son INALCANZABLES
-- para el emparejador. No es que no estén: es que no se las puede nombrar.
-- Consecuencia medida: 6 de las 20 pólizas que reclaman los 43 ficheros en
-- cuarentena SÍ están en la cartera, y son justo estas.
--
-- ── Por qué NO se rellenan las 242 ──────────────────────────────────────────
-- 🚨 Rellenar a lo bruto ROMPE lo que hoy funciona. Medido antes de escribir:
--   · 11 de las 242 comparten número normalizado con una póliza VIVA de Occident.
--     Al ponerles el código, el emparejador pasaría de 1 candidato a 2 → «ambiguo»
--     → cuarentena. O sea, se mandarían al agujero siniestros que hoy entran bien.
--   · 7 números están repetidos ENTRE las propias Plus Ultra (14+ filas), con el
--     mismo efecto. El volcado `intranet:` reutiliza números — ya avisa `CLAUDE.md`
--     de los 2.123 pares con número repetido que NO son duplicados.
-- Por eso la guarda no es «es Plus Ultra», sino **«su número la identifica sola»**:
-- se rellena únicamente si el número normalizado no aparece en ninguna otra fila
-- que vaya a llevar C0468. 216 entran, 26 se quedan fuera A PROPÓSITO.
--
-- ── Guarda de identidad ─────────────────────────────────────────────────────
-- (1) `aseguradora` normalizada = 'plus ultra'  → el texto lo dice, no se infiere
-- (2) `codigo_entidad_dgs IS NULL`              → no se pisa ningún código puesto
-- (3) `merged_into_poliza_id IS NULL`           → no se tocan lápidas
-- (4) número normalizado de ≥5 caracteres       → misma longitud mínima que el
--     `normalizePolizaNumber` del CRM; un «pendiente» o un «0000» no genera clave
-- (5) ese número no lo lleva ninguna C0468 existente
-- (6) ese número no se repite entre las propias candidatas
--
-- ── Vuelta atrás ────────────────────────────────────────────────────────────
-- No hace falta tabla de lápidas: el cambio es NULL → 'C0468' y el conjunto se
-- identifica solo, porque las pólizas de Occident que vienen de CIMA llevan
-- `aseguradora` = 'Occident' (19 de 19), nunca 'Plus Ultra'. Deshacer es:
--     update seguros.polizas set codigo_entidad_dgs = null
--     where lower(btrim(aseguradora)) = 'plus ultra' and codigo_entidad_dgs = 'C0468';
--
-- ⚠️ Esto NO resucita ninguna póliza: las 242 son volcado histórico y `esCarteraViva()`
-- las sigue dejando fuera (ninguna tiene `eiac_xml_hash`). Solo las hace NOMBRABLES.

begin;

create temporary table _pu_afectadas on commit drop as
with cand as (
  select id, regexp_replace(lower(btrim(numero_poliza)), '[^0-9a-z]', '', 'g') as k
  from seguros.polizas
  where merged_into_poliza_id is null
    and numero_poliza is not null
    and lower(btrim(aseguradora)) = 'plus ultra'
    and codigo_entidad_dgs is null
),
ocupados as (
  select regexp_replace(lower(btrim(numero_poliza)), '[^0-9a-z]', '', 'g') as k
  from seguros.polizas
  where merged_into_poliza_id is null
    and numero_poliza is not null
    and codigo_entidad_dgs = 'C0468'
)
select c.id
from cand c
where length(c.k) >= 5
  and not exists (select 1 from ocupados o where o.k = c.k)
  and (select count(*) from cand c2 where c2.k = c.k) = 1;

update seguros.polizas p
set codigo_entidad_dgs = 'C0468'
from _pu_afectadas a
where p.id = a.id;

commit;
