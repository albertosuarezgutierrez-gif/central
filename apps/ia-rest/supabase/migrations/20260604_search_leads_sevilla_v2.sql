-- search_leads_sevilla_nuevos v2 (sobre la función realmente desplegada).
-- Añade: catering/eventos/banquete y leads de Apify (origen) entran aunque sean
-- de un solo sitio sin aforo grande. Mantiene email obligatorio y los filtros de
-- no-duplicado (sin baja ni tracking previos). leads_locales usa lead_id + aforo.
CREATE OR REPLACE FUNCTION public.search_leads_sevilla_nuevos(limit_count integer DEFAULT 3)
 RETURNS TABLE(id uuid, nombre text, email text, ciudad text, tipo_negocio text, web text, num_locales bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    l.id,
    l.nombre,
    l.email,
    l.ciudad,
    l.tipo_negocio,
    l.web,
    COUNT(DISTINCT ll.id) as num_locales
  FROM leads l
  LEFT JOIN leads_locales ll ON ll.lead_id = l.id
  LEFT JOIN leads_unsubscribes lu ON lu.lead_id = l.id
  LEFT JOIN leads_web_tracking lwt ON lwt.lead_id = l.id
  WHERE
    l.ciudad ILIKE '%Sevilla%'
    AND COALESCE(l.tipo_negocio, '') != 'hotel'
    AND l.email IS NOT NULL
    AND l.email != ''
    AND lu.lead_id IS NULL   -- no desuscrito
    AND lwt.lead_id IS NULL  -- no contactado por email CRM
  GROUP BY l.id, l.nombre, l.email, l.ciudad, l.tipo_negocio, l.web, l.origen
  HAVING
    COUNT(DISTINCT ll.id) >= 2
    OR (COUNT(DISTINCT ll.id) <= 1 AND COALESCE(MAX(ll.aforo::int), 0) > 60)
    OR l.tipo_negocio IN ('catering', 'eventos', 'banquete')
    OR l.origen = 'apify_google_places'
  ORDER BY
    CASE
      WHEN l.tipo_negocio = 'catering' AND COUNT(DISTINCT ll.id) >= 5 THEN 1
      WHEN l.tipo_negocio = 'catering' AND COUNT(DISTINCT ll.id) >= 2 THEN 2
      WHEN l.tipo_negocio IN ('eventos', 'banquete') THEN 3
      ELSE 4
    END,
    RANDOM()
  LIMIT limit_count;
END;
$function$;
