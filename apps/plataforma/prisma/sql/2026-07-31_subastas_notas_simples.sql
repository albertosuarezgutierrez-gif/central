-- «Nota simple viva»: la certificación de cargas que el juzgado adjunta a la
-- ficha del BOE es de hace años (la de Belmonte, de agosto de 2020) y las cargas
-- se mueven — se cancelan hipotecas, caducan anotaciones y aparecen otras. Antes
-- de pujar en serio, una nota simple actualizada cuesta unos euros y responde
-- justo a lo que el art. 86 LH deja en el aire.
--
-- Aquí se guarda CADA nota simple que sube Alberto, con el cuadro que leyó el
-- lector registral y el diff contra la certificación (`compararCuadros` del
-- módulo). Es histórico: nunca se pisa la anterior, porque comparar dos notas
-- separadas en el tiempo es en sí mismo información.
--
-- 🚨 Es PROPIEDAD DE LA CUENTA (la paga quien la pide), a diferencia de las
-- columnas `cargas_*` de `subastas`, que son el corpus GLOBAL compartido. Por eso
-- vive en su tabla con `cuenta_id` y NO sobreescribe lo que dice el BOE: la ficha
-- enseña las dos cosas, la oficial y la tuya, con su fecha.
CREATE TABLE IF NOT EXISTS subastas_notas_simples (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id     uuid NOT NULL,
  dedupe_key    text NOT NULL,
  -- Fecha de la nota según el registro (la que importa para el art. 86 LH).
  -- NULL = no se pudo leer; NO se sustituye por la de subida, que diría otra cosa.
  fecha_nota    date,
  cuadro        jsonb NOT NULL,
  cambios       jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Lo que hereda el adjudicatario SEGÚN ESTA NOTA. NULL = no se puede afirmar
  -- (misma regla que `subastas.cargas`: un 0 se leería como «libre»).
  importe_subsistente numeric(14,2),
  resumen       text,
  confianza     numeric(3,2),
  creada_en     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notas_simples_cuenta_subasta
  ON subastas_notas_simples (cuenta_id, dedupe_key, creada_en DESC);

-- Solo la app (rol con BYPASSRLS) toca esta tabla, como el resto de `subastas_*`:
-- ni el cliente anónimo ni el autenticado tienen nada que hacer aquí.
REVOKE ALL ON TABLE subastas_notas_simples FROM anon, authenticated;

COMMENT ON TABLE subastas_notas_simples IS
  'Notas simples actualizadas subidas por la cuenta para una subasta, con el cuadro de cargas leído y el diff contra la certificación del BOE. Histórico: no se pisa. Ver apps/plataforma/lib/subastas/nota-simple.ts';
