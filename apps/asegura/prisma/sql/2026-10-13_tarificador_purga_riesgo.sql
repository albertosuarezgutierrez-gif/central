-- Purga de los DATOS PERSONALES del riesgo del tarificador en lo YA CERRADO (13/10/2026).
--
-- ⚠️ NO APLICADA. La aplica Alberto tras revisarla. Va DESPUÉS de desplegar el código (que ya purga al cerrar y ya
--    escribe `tarificaciones.peticion` recortada): así lo que se cierre entre medias también queda limpio (y el barrido
--    del tarificador tiene su propio respaldo).
--
-- Qué hace (una transacción; IDEMPOTENTE: solo toca filas cuyo JSON aún tiene algo fuera de la lista; re-aplicada → 0 y 0):
--   1. `tarificacion_trabajos.riesgo` de los trabajos CERRADOS (ok, error_definitivo, cancelado, emitido).
--      Excepción: el ORIGEN posible de una emisión (`ok` de tarificar de Allianz Comunidades) solo si está LIBERADO:
--      sin emisión suya abierta y (con alguna emisión suya `emitido`, o a los 30 días de su ok). Una emisión rechazada o
--      caducada (`cancelado`) NO lo libera: dentro del plazo se puede volver a pedir.
--   Un riesgo/petición que NO es un objeto JSON (NULL incluido) no se toca: nunca se convierte en `{}`.
--      NO toca requiere_humano ni error_reintentable (el reintento necesita el riesgo), ni lo vivo.
--   2. `tarificaciones.peticion` de canal `rpa` (copia del riesgo del trabajo): la misma lista, siempre (nadie lee de ahí
--      datos personales; los lectores de `peticion` buscan la forma de Avant2, que una petición de portal no tiene).
--   La LISTA BLANCA va en `pg_temp.riesgo_sin_datos_personales` (solo existe en esta sesión): se conservan SOLO las claves
--   de la lista del ramo y, dentro de los objetos conocidos, sus sub-claves; cada hoja tiene que ser un valor simple
--   (texto, número, sí/no o null). Lo que no está en la lista (también una clave nueva) se BORRA.
--
-- 🚨 La lista es la de `packages/module-tarificacion/src/purga-riesgo.ts`. El cepo
--    `test/regression-tarificador-purga-riesgo.test.ts` exige que las de aquí (marcadas `/*lista:...*/`) sean IGUALES.
--
-- No se deshace (es un borrado de datos personales a propósito). `updated_at` no se toca (ordena avisos y bandejas).
--
-- (14/10/2026) Añadida a la lista de vehículo la clave `vehiculoConfirmado` (sub-claves origen, denominacion, cv, cc, puertas,
--    fechaInicio; SIN matrícula ni bastidor) para que siga IGUAL que el código. Solo CONSERVA más: no hace falta re-aplicarla
--    (ningún trabajo cerrado la tenía); si se re-aplica, sigue siendo idempotente.

SET search_path = seguros, public;

-- ── 0. La lista blanca (función TEMPORAL de la sesión: no cambia nada de la BD) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.riesgo_sin_datos_personales(r jsonb, ramo text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $f$
  -- Lo que no es objeto se devuelve TAL CUAL (los UPDATE además lo excluyen): NULL no se convierte en {}.
  SELECT CASE WHEN r IS NULL OR jsonb_typeof(r) <> 'object' THEN r ELSE (
    SELECT coalesce(jsonb_object_agg(e.key,
             CASE
               WHEN e.key IN ('direccion', 'seleccionVehiculo', 'eleccionVersion', 'eleccionVersionIa', 'vehiculoConfirmado') AND jsonb_typeof(e.value) = 'object' THEN (
                 SELECT coalesce(jsonb_object_agg(s.key, s.value), '{}'::jsonb)
                 FROM jsonb_each(e.value) s
                 WHERE s.key = ANY (CASE e.key
                                      WHEN 'direccion' THEN /*lista:sub:direccion*/ array['codigoPostal','municipio','provincia']::text[]
                                      WHEN 'seleccionVehiculo' THEN /*lista:sub:seleccionVehiculo*/ array['marca','modelo','clase','cilindradaCc','descripcion']::text[]
                                      WHEN 'eleccionVersion' THEN /*lista:sub:eleccionVersion*/ array['codigo','etiqueta']::text[]
                                      WHEN 'vehiculoConfirmado' THEN /*lista:sub:vehiculoConfirmado*/ array['origen','denominacion','cv','cc','puertas','fechaInicio']::text[]
                                      ELSE /*lista:sub:eleccionVersionIa*/ array['origen','clave']::text[] END)
                   AND jsonb_typeof(s.value) IN ('string', 'number', 'boolean', 'null'))
               ELSE e.value
             END), '{}'::jsonb)
    FROM jsonb_each(r) e
    WHERE e.key = ANY (CASE
                         WHEN lower(trim(ramo)) = 'comunidades' THEN /*lista:comunidades*/ array['ramo','direccion','fechaEfecto','fechaTermino','m2Construidos','anioConstruccion','anioRehabilitacion','tipoVivienda','uso','plantas','plantasBajoRasante','sotanos','numEdificios','contiguos','numViviendasYLocales','numViviendas','numLocales','numGarajes','listaPropietarios','instalacionesAnexas','formaPagoPrimerRecibo','formaPagoSucesivos','comision','capitalContinente','capitalContenido','asistenciaPlagas','asesoramientoJuridico','impagoCuotas','ite','modalidad','opciones','ascensor','piscina','zonasAjardinadas','calidadConstruccion','siniestrosUltimos3Anios','companiaActual']::text[]
                         WHEN lower(trim(ramo)) IN ('moto', 'auto') THEN /*lista:vehiculo*/ array['ramo','codigoPostal','poblacion','eleccionPoblacion','seleccionVehiculo','eleccionVersion','eleccionVersionIa','vehiculoConfirmado']::text[]
                         ELSE /*lista:otro*/ array['ramo']::text[] END)
      AND CASE
            WHEN e.key IN ('direccion', 'seleccionVehiculo', 'eleccionVersion', 'eleccionVersionIa', 'vehiculoConfirmado') THEN jsonb_typeof(e.value) IN ('object', 'null')
            ELSE jsonb_typeof(e.value) IN ('string', 'number', 'boolean', 'null')
          END
  ) END
$f$;

-- ¿Es un origen de emisión AÚN NO liberado? (se conserva). Misma regla que `origenEmisionLiberado` + `esOrigenDeEmision`.
CREATE OR REPLACE FUNCTION pg_temp.origen_emision_retenido(t seguros.tarificacion_trabajos)
RETURNS boolean
LANGUAGE sql
STABLE
AS $f$
  SELECT t.estado = 'ok'
     AND coalesce(to_jsonb(t)->>'modo', 'tarificar') = 'tarificar'
     AND (t.compania || '::' || t.ramo) = ANY (/*lista:emision*/ array['allianz::comunidades']::text[])
     AND (
       -- alguna emisión suya ABIERTA
       EXISTS (SELECT 1 FROM seguros.tarificacion_trabajos e
               WHERE e.correduria_id = t.correduria_id AND to_jsonb(e)->>'modo' = 'emision'
                 AND to_jsonb(e)->>'trabajo_origen_id' = t.id::text
                 AND e.estado <> ALL (/*lista:estados*/ array['ok','error_definitivo','cancelado','emitido']::text[]))
       -- o ninguna `emitido` y aún dentro del plazo desde el ok (sin fecha de fin: se conserva)
       OR (NOT EXISTS (SELECT 1 FROM seguros.tarificacion_trabajos e
                       WHERE e.correduria_id = t.correduria_id AND to_jsonb(e)->>'modo' = 'emision'
                         AND to_jsonb(e)->>'trabajo_origen_id' = t.id::text AND e.estado = 'emitido')
           AND (t.terminado_at IS NULL OR t.terminado_at > now() - /*dias_origen_emision*/ 30 * interval '1 day'))
     )
$f$;

-- ── Recuento PREVIO (no cambia nada; ejecutar tras el bloque 0, en la misma sesión) ─────────────────────────────────
-- select 'trabajos' as tabla, t.estado, t.ramo,
--        count(*) filter (where pg_temp.origen_emision_retenido(t)) as origen_emision_retenido,
--        count(*) filter (where not pg_temp.origen_emision_retenido(t)
--                           and t.riesgo is distinct from pg_temp.riesgo_sin_datos_personales(t.riesgo, t.ramo)) as se_purgaria,
--        count(*) as total
-- from seguros.tarificacion_trabajos t
-- where t.estado in ('ok', 'error_definitivo', 'cancelado', 'emitido') and jsonb_typeof(t.riesgo) = 'object'
-- group by 2, 3
-- union all
-- select 'tarificaciones rpa', null, x.ramo::text, null,
--        count(*) filter (where x.peticion is distinct from pg_temp.riesgo_sin_datos_personales(x.peticion, x.ramo::text)),
--        count(*)
-- from seguros.tarificaciones x
-- where coalesce(to_jsonb(x)->>'canal', 'codeoscopic') = 'rpa' and jsonb_typeof(x.peticion) = 'object'
-- group by 3
-- order by 1, 2, 3;

BEGIN;

-- 1. Trabajos cerrados.
UPDATE seguros.tarificacion_trabajos t
SET riesgo = pg_temp.riesgo_sin_datos_personales(t.riesgo, t.ramo)
WHERE t.estado = ANY (/*lista:estados*/ array['ok','error_definitivo','cancelado','emitido']::text[])
  AND jsonb_typeof(t.riesgo) = 'object'
  AND NOT pg_temp.origen_emision_retenido(t)
  AND t.riesgo IS DISTINCT FROM pg_temp.riesgo_sin_datos_personales(t.riesgo, t.ramo);
-- psql: «UPDATE n» = trabajos cerrados a los que se les quitó algo.

-- 2. Peticiones guardadas del canal RPA (copia del riesgo).
UPDATE seguros.tarificaciones x
SET peticion = pg_temp.riesgo_sin_datos_personales(x.peticion, x.ramo::text)
WHERE coalesce(to_jsonb(x)->>'canal', 'codeoscopic') = 'rpa'
  AND jsonb_typeof(x.peticion) = 'object'
  AND x.peticion IS DISTINCT FROM pg_temp.riesgo_sin_datos_personales(x.peticion, x.ramo::text);
-- psql: «UPDATE m» = tarificaciones RPA recortadas.

COMMIT;
