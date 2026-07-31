-- El «valor de mercado» de una subasta manda sobre todo lo demás (descuento,
-- puntuación, margen del flip, puja máxima). Cuando el €/m² sale de la mediana
-- de un municipio grande y desigual —Sevilla, Jerez, Málaga…— ese número no
-- describe al inmueble concreto y no puede sostener una decisión.
--
-- Se marca aquí para que el cron de avisos lo sepa sin recalcular nada.
-- Lo escribe `clasificarSubastas`; la regla vive en
-- packages/module-subastas/src/valoracion.ts.
--
-- Aplicada en Supabase el 30/07/2026.
ALTER TABLE subastas ADD COLUMN IF NOT EXISTS valor_orientativo boolean;

COMMENT ON COLUMN subastas.valor_orientativo IS
  'true = el €/m² de mercado sale de una zona demasiado gruesa (mediana municipal de una ciudad desigual) para tasar este inmueble. Se enseña, pero no sostiene aviso ni flip apto. Ver packages/module-subastas/src/valoracion.ts';
