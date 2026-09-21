-- 2026-09-21 — Colisión CIMA ↔ volcado: la póliza duplicada que nadie puede emparejar
--
-- ⚠️ ESCRITA Y SIN APLICAR. Necesita OK explícito de Alberto: escribe en la cartera
--    viva de la correduría. Ver docs/CIMA-CUARENTENA.md, apartado del 21/09/2026.
--
-- PROBLEMA (medido 21/09/2026): 19 números de póliza tienen DOS filas con el mismo
-- `codigo_entidad_dgs` — una creada por CIMA (`import_ref IS NULL`) y otra del volcado
-- histórico. `matchReciboPoliza()` / `matchSiniestroPoliza()` exigen candidato ÚNICO, así
-- que con dos devuelven `null` y el objeto se va a cuarentena. Coste medido: 40 recibos de
-- Occident (ficheros REC del 12/07 y del 15/09). Y el motivo que se registra es
-- `sin_poliza_en_cartera`, que es FALSO: está, pero dos veces.
--
-- QUÉ HACE: vacía `codigo_entidad_dgs` SOLO en la fila del VOLCADO de cada par en colisión,
-- dejando la de CIMA como candidata única. No borra ni fusiona filas: solo hace la histórica
-- inalcanzable para el emparejador, que es como estaba antes del relleno de Plus Ultra del
-- 06/09 y por lo que entonces sí entraban.
--
-- LAS GUARDAS (sin ellas esto rompe lo que funciona, que es el fallo del 06/09 repetido):
--   a) el grupo tiene EXACTAMENTE UNA fila de CIMA  → si hay 0, no hay a quién ceder el
--      sitio; si hay 2, el empate no lo desharía esto.
--   b) solo se toca la fila cuyo `import_ref` NO es NULL → la de CIMA nunca se toca.
--   c) se excluye el centinela `pendiente`, que no es un número de póliza.

begin;

with claves as (
  select lower(btrim(numero_poliza)) as clave, codigo_entidad_dgs
  from seguros.polizas
  where codigo_entidad_dgs is not null
    and numero_poliza is not null
    and lower(btrim(numero_poliza)) not in ('', 'pendiente')
  group by 1, 2
  having count(*) > 1
     and count(*) filter (where import_ref is null) = 1   -- guarda (a)
)
update seguros.polizas p
   set codigo_entidad_dgs = null,
       updated_at = now()
  from claves c
 where lower(btrim(p.numero_poliza)) = c.clave
   and p.codigo_entidad_dgs = c.codigo_entidad_dgs
   and p.import_ref is not null;                          -- guarda (b)

-- COMPROBACIÓN OBLIGATORIA ANTES DEL COMMIT: debe devolver 0 filas.
-- Si devuelve alguna, hacer ROLLBACK: queda un grupo ambiguo y el arreglo no ha servido.
select lower(btrim(numero_poliza)) as clave, codigo_entidad_dgs, count(*)
  from seguros.polizas
 where codigo_entidad_dgs is not null
   and lower(btrim(numero_poliza)) not in ('', 'pendiente')
 group by 1, 2
having count(*) > 1
   and count(*) filter (where import_ref is null) >= 1;

commit;

-- VUELTA ATRÁS: no hace falta tabla de lápidas para las de Occident —las 242 filas «Plus
-- Ultra» se rellenaron el 06/09 y su rollback ya está documentado en docs/CIMA-CUARENTENA.md—
-- pero las de Mapfre (C0058) y Allianz (C0109) traían el código del volcado ORIGINAL, así que
-- para ellas SÍ hay que guardar el valor antes. Ejecutar esto ANTES del update de arriba:
--
--   create table if not exists seguros._lapidas_dgs_colision_20260921 as
--   select id, numero_poliza, codigo_entidad_dgs, import_ref, now() as guardado_at
--     from seguros.polizas
--    where codigo_entidad_dgs is not null and import_ref is not null;
--
-- y para revertir:
--
--   update seguros.polizas p set codigo_entidad_dgs = l.codigo_entidad_dgs
--     from seguros._lapidas_dgs_colision_20260921 l
--    where l.id = p.id and p.codigo_entidad_dgs is null;
