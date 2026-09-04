-- Recuperación por PARECIDO en el agente de huéspedes (04/09/2026).
--
-- Alberto: «he respondido varias veces a preguntas similares y no ha aprendido». Medido: no había
-- ninguna búsqueda por parecido en todo el circuito. `contexto.ts` volcaba al prompt las 8 últimas
-- filas de `mensajes_aprendizaje` del piso (`ORDER BY created_at DESC LIMIT 8`) sin mirar si tenían
-- algo que ver con la pregunta, así que ocho «gracias a ti» enterraban lo enseñado. Y `registrarGap`
-- comparaba la pregunta con `=` exacto: los cuatro avisos de phishing de finales de agosto quedaron
-- como cuatro filas de `veces = 1` en vez de una de 4, así que ningún hueco recurrente destacaba.
--
-- pg_trgm ya estaba instalado (1.6, schema `extensions`). Aquí solo se añaden los índices. Las
-- consultas cualifican `extensions.word_similarity(...)` a propósito: el `search_path` del rol de la
-- app no tiene por qué incluir `extensions`, y un fallo ahí se leería como «este piso no tiene nada
-- aprendido», que es justo la mentira que la regla del NULL prohíbe.
--
-- `word_similarity(corta, larga)` y no `similarity`: esta última normaliza por la longitud de AMBOS
-- textos, así que una pregunta corta contra una respuesta larga puntúa bajísimo aunque la respuesta
-- la cubra entera. `word_similarity` busca el mejor tramo de la larga que se parece a la corta.
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

CREATE INDEX IF NOT EXISTS mensajes_aprendizaje_pregunta_trgm
  ON mensajes_aprendizaje USING gin (pregunta_norm extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS mensajes_hechos_hecho_trgm
  ON mensajes_hechos USING gin (hecho extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS mensajes_hechos_pregunta_trgm
  ON mensajes_hechos USING gin (pregunta extensions.gin_trgm_ops);

CREATE INDEX IF NOT EXISTS mensajes_guia_gaps_pregunta_trgm
  ON mensajes_guia_gaps USING gin (pregunta extensions.gin_trgm_ops);
