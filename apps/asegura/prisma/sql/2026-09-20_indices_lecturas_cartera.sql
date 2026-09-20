-- ============================================================================
-- Índices para las TRES lecturas de cartera del puerto del operador
-- (/api/operador/vencimientos · /impagados · /comisiones), schema `seguros`.
--
-- ✅ APLICADO el 20/09/2026 contra wswbehlcuxqxyinousql, schema `seguros`, uno
--    por uno (CONCURRENTLY va FUERA de transacción). Los tres que quedan están
--    `indisvalid = true`. El #2 se aplicó, se MIDIÓ que no lo usaba nadie y se
--    retiró en el acto — ver su bloque.
--
-- Todo lo de aquí está medido el 20/09/2026 contra la base real
-- (wswbehlcuxqxyinousql, schema `seguros`) con EXPLAIN (ANALYZE): las cifras de
-- cada bloque son de esa ejecución, no estimaciones.
--
-- Lo que YA existe y por eso NO se propone (`pg_indexes`, 20/09/2026):
--   · polizas          → idx_polizas_vencimiento (fecha_vencimiento),
--                        idx_polizas_correduria, idx_polizas_estado, …
--   · poliza_recibos   → idx_poliza_recibos_correduria, idx_poliza_recibos_poliza
--   · poliza_coberturas→ idx_poliza_coberturas_poliza
--   · cuenta_efectivo  → idx_cuenta_efectivo_correduria +
--                        uq_cuenta_efectivo_correduria_entidad_periodo
--   · liquidaciones    → idx_liquidaciones_correduria, idx_liquidaciones_cuenta
--   · retencion_descartes → idx_retencion_descartes_poliza_vigente (poliza_id, vence_at)
-- ============================================================================


-- ── 1. EL ÚNICO URGENTE: `polizasSinRecibo()` ───────────────────────────────
-- `lib/cartera-impagados.ts` lo llama en CADA carga de la cola de retención —
-- la pantalla que se abre cada mañana.
--
-- MEDIDO: **870 ms**, `Seq Scan on polizas` descartando **28.725 filas** para
-- quedarse con 157, y encima el anti-join contra poliza_recibos por cada una.
-- No hay índice utilizable porque el filtro es la CARTERA VIVA, que es una
-- condición compuesta (`import_ref IS NULL OR eiac_xml_hash IS NOT NULL`), no
-- una columna.
--
-- 🚨 El predicado tiene que ser LITERALMENTE el de `sqlCarteraViva()` de
-- `@central/module-seguros` (cartera-viva.ts). Si aquel cambia y este no, el
-- planificador deja de usar el índice EN SILENCIO — vuelve el Seq Scan y lo
-- único que se nota es que la pantalla tarda más.
create index concurrently if not exists idx_polizas_cartera_viva
  on seguros.polizas (correduria_id)
  where merged_into_poliza_id is null
    and (import_ref is null or eiac_xml_hash is not null);


-- ── 2. RETIRADO: era redundante, y se midió ───────────────────────────────
-- `correduria_id` + `situacion IN ('devuelto','pendiente')` + ORDER BY
-- `fecha_vencimiento`. La idea era que la fecha fuera EN el índice para que el
-- LIMIT cortara sin ordenar.
--
-- 🚨 MEDIDO el 20/09/2026, y NO era así: con los dos índices creados, el
-- planificador eligió el **#3** (`..._situacion_fecha`) para esta consulta y
-- dejó el #2 sin usar. Se retiró (`drop index concurrently`) y se repitió el
-- EXPLAIN: **plan idéntico**, mismo Index Scan por el #3 + un quicksort de 29
-- filas. Los dos comparten el prefijo `(correduria_id, situacion)`, y con esta
-- cardinalidad la tercera columna no decide nada.
--
-- Vuelve a plantearse cuando el sort deje de ser trivial (hoy 29 filas de 372,
-- ~106 recibos/mes de CIMA). Mismo criterio que el #5: un índice que el plan no
-- usa solo paga escrituras. No se deja «por si acaso».
--
-- create index concurrently if not exists idx_poliza_recibos_situacion_venc
--   on seguros.poliza_recibos (correduria_id, situacion, fecha_vencimiento);


-- ── 3. Los recibos cobrados de `comisionesCartera()` ────────────────────────
-- `correduria_id` + `situacion = 'cobrado'` + `fecha_situacion >= desde`.
-- MEDIDO: 0,4 ms hoy, también por `Seq Scan` (52 filas de 372). Mismo motivo
-- que el anterior: es barato mientras la tabla sea pequeña.
--
-- Índice aparte del #2 y no uno solo `(correduria_id, situacion)`: son dos
-- columnas de fecha DISTINTAS (`fecha_vencimiento` manda en la cola de
-- impagados, `fecha_situacion` en el libro de comisiones) y la tercera columna
-- es lo que hace que cada consulta pueda recortar por rango.
create index concurrently if not exists idx_poliza_recibos_situacion_fecha
  on seguros.poliza_recibos (correduria_id, situacion, fecha_situacion);


-- ── 4. `polizasDescartadas()` de la cola de retención ───────────────────────
-- `correduria_id = … and vence_at > now()`. El índice que hay,
-- `idx_retencion_descartes_poliza_vigente`, lidera por `poliza_id` y NO sirve
-- para este barrido.
--
-- Hoy la tabla es diminuta, pero crece UNA FILA POR DESCARTE PARA SIEMPRE (no
-- se purga: el histórico es la auditoría de «ya llamé»), mientras que las filas
-- VIVAS son siempre un puñado. O sea: el escaneo se hace más caro cada semana
-- para devolver más o menos lo mismo. El índice parcial deja fuera las caducadas.
--
-- ⚠️ `now()` NO es inmutable, así que NO puede ir en el WHERE del índice (Postgres
-- lo rechaza). El predicado se deja abierto y filtra el índice, no la tabla.
create index concurrently if not exists idx_retencion_descartes_correduria_vence
  on seguros.retencion_descartes (correduria_id, vence_at);


-- ── 5. OPCIONAL, y hoy NO hace falta: `vencimientosProximos()` ──────────────
-- 🚦 MEDIDO en 60 ms con el índice que YA existe: `idx_polizas_vencimiento`
-- resuelve el rango de fechas (48 filas escaneadas, 29 útiles) y el resto del
-- WHERE se aplica como filtro. No es un problema.
--
-- Este índice lo mejoraría (correduria y fusionadas dejarían de ser post-filtro,
-- y serviría también a `vencidasFueraDeVentana()`, que es el mismo WHERE con la
-- fecha por el otro lado), pero **no se aplica por rendimiento hoy**: se deja
-- escrito para cuando la cartera crezca. Aplicar índices que no hacen falta
-- cuesta escrituras en cada INSERT de CIMA.
--
-- create index concurrently if not exists idx_polizas_correduria_vencimiento
--   on seguros.polizas (correduria_id, fecha_vencimiento)
--   where merged_into_poliza_id is null;


-- ── Lo que NO se propone, y por qué ─────────────────────────────────────────
-- · `cuenta_efectivo` y `liquidaciones`: **9 y 12 filas EN TODA LA BASE**
--   (medido). Un índice sobre una tabla que cabe en una página no se usa, y el
--   único `uq_cuenta_efectivo_correduria_entidad_periodo` ya lidera por
--   `correduria_id`. Si algún día crecen (≈60 filas/año a 5 compañías), el
--   candidato es `(correduria_id, periodo_inicio)`.
-- · El `groupBy` de cobertura de `comisionesCartera()`: devuelve UNA fila por
--   compañía (5 hoy, 15 en `companias_dgs`), no una por recibo.
-- · El anti-join de `polizasSinRecibo()` contra `poliza_recibos`: ya lo resuelve
--   `idx_poliza_recibos_poliza` con un Index Only Scan.


-- ── Cómo comprobar que sirvieron ────────────────────────────────────────────
-- Repetir los EXPLAIN (ANALYZE) y mirar que el plan cambia de `Seq Scan` a
-- `Index Scan`.
--
-- ✅ COMPROBADO el 20/09/2026, tras aplicar y hacer ANALYZE de las tres tablas:
--   · #1 `polizasSinRecibo()`: `Seq Scan on polizas` **870 ms** → `Index Scan
--     using idx_polizas_cartera_viva`, 157 filas, **0,58 ms**.
--   · #3: `Index Scan using idx_poliza_recibos_situacion_fecha`, sin Seq Scan.
--   · #2: se usó el #3 en su lugar → retirado (arriba).
--
-- 🚨 Un índice que NO se usa no da error: el plan sigue en Seq Scan y todo
-- funciona igual, solo que se paga la escritura sin cobrar la lectura. Si tras
-- aplicar esto el plan no cambia, el índice sobra o su predicado no casa con el
-- del código — no se deja «por si acaso».
