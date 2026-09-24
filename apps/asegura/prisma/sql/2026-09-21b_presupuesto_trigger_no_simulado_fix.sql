-- Fix del trigger `presupuesto_no_enviar_simulado()` de `2026-09-21_presupuesto.sql`
-- (PR 1). APLICADA el 21/09/2026, en la revisión del PR 2.
--
-- El trigger es SECURITY INVOKER y hace `SELECT t.simulado FROM
-- seguros.tarificaciones` salvo que AMBOS sellos (`enviado_at`,
-- `enlace_generado_at`) sigan a NULL. Eso significa que un `UPDATE` que SOLO
-- toca `visto_at` sobre una fila YA enviada sigue disparando ese SELECT — y el
-- rol del portal (`prisma_asegura_portal`, que es quien hace ese UPDATE en el
-- PR 2) no tenía GRANT sobre `seguros.tarificaciones`, así que el sello moría
-- con `42501 permission denied`, un fallo que ni `tsc` ni los tests ven porque
-- vive dentro de un trigger.
--
-- Root-fix: el SELECT solo hace falta cuando los sellos de SALIDA cambian de
-- verdad (un INSERT, o un UPDATE que toca `enviado_at`/`enlace_generado_at`).
-- Con esto, el `GRANT SELECT (tarificacion_id) ON presupuesto` +
-- `GRANT SELECT (id, simulado) ON tarificaciones` que añade
-- `apps/asegura-portal/prisma/sql/2026-09-21_portal_presupuesto_grants.sql`
-- pasa de necesario a cinturón — se dejan puestos porque no exponen nada
-- sensible (un booleano y un uuid), pero ya no los necesita el `UPDATE(visto_at)`.
CREATE OR REPLACE FUNCTION seguros.presupuesto_no_enviar_simulado()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  es_simulado boolean;
BEGIN
  IF NEW.enviado_at IS NULL AND NEW.enlace_generado_at IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.enviado_at IS NOT DISTINCT FROM OLD.enviado_at
     AND NEW.enlace_generado_at IS NOT DISTINCT FROM OLD.enlace_generado_at THEN
    RETURN NEW;
  END IF;

  SELECT t.simulado INTO es_simulado
    FROM seguros.tarificaciones t
   WHERE t.id = NEW.tarificacion_id;

  IF es_simulado IS DISTINCT FROM false THEN
    RAISE EXCEPTION
      'presupuesto %: su tarificación es simulada (o no se ha podido comprobar); un precio que no ha dado ninguna compañía no se le enseña a un cliente',
      NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;
