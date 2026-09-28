-- Calidad medible del agente de huéspedes (28/09/2026).
-- Hasta hoy, al enviar desde Telegram solo se ponía `auto_sent = true`: el texto que Alberto editaba
-- se perdía y `edited` era siempre false (0 de 142 filas en 30 días). Sin eso no se puede saber
-- cuántos borradores salen tal cual, que es la medida para decidir dónde darle más autonomía.
ALTER TABLE public.mensajes_log ADD COLUMN IF NOT EXISTS respuesta_enviada TEXT;

-- Calidad por categoría, últimos 30 días. Solo cuenta como «medido» lo enviado desde que existe
-- `respuesta_enviada`: las filas anteriores tienen `edited = false` por defecto, no porque se midiera.
CREATE OR REPLACE VIEW public.v_agente_huesped_calidad AS
SELECT categoria,
       count(*)                                                          AS mensajes,
       count(*) FILTER (WHERE auto_sent AND NOT needs_human)             AS enviados_solos,
       count(*) FILTER (WHERE needs_human)                               AS escalados,
       count(*) FILTER (WHERE needs_human AND respuesta_enviada IS NOT NULL)            AS escalados_medidos,
       count(*) FILTER (WHERE needs_human AND respuesta_enviada IS NOT NULL AND NOT edited) AS aprobados_sin_tocar,
       round(100.0 * count(*) FILTER (WHERE needs_human AND respuesta_enviada IS NOT NULL AND NOT edited)
             / nullif(count(*) FILTER (WHERE needs_human AND respuesta_enviada IS NOT NULL), 0), 0) AS pct_sin_tocar
FROM public.mensajes_log
WHERE created_at > now() - interval '30 days'
GROUP BY categoria;

REVOKE ALL ON public.v_agente_huesped_calidad FROM anon, authenticated;
GRANT SELECT ON public.v_agente_huesped_calidad TO prisma_plataforma;
