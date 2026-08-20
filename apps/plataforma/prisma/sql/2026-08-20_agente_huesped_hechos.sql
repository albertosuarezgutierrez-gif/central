-- Agente de huéspedes: hechos permanentes del piso + registro de conflictos guía↔override.
-- Entregas 2 y 4 del spec 2026-08-20-agente-huesped-autonomo-design.md.

-- Conflicto detectado entre una sección de la guía de Smoobu y una regla de negocio nuestra
-- (hoy: PARKING). Se avisa UNA vez por piso+sección en vez de resolverlo en silencio.
CREATE TABLE IF NOT EXISTS mensajes_conflictos_guia (
  property_id TEXT NOT NULL,
  seccion     TEXT NOT NULL,
  avisado_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (property_id, seccion)
);

-- HECHOS del piso: afirmaciones sobre la vivienda que Alberto enseña al agente (o que se minan del
-- histórico de conversaciones). Van SIEMPRE al prompt, a diferencia de `mensajes_aprendizaje`, que
-- guarda ejemplos de ESTILO y solo aporta los últimos 8 → los hechos se perdían debajo de los
-- "gracias" (el "las llaves se dejan en la mesa alta de la cocina" del 20/07/2026).
CREATE TABLE IF NOT EXISTS mensajes_hechos (
  id          BIGSERIAL PRIMARY KEY,
  property_id TEXT NOT NULL,
  pregunta    TEXT NOT NULL DEFAULT '',
  hecho       TEXT NOT NULL,
  origen      TEXT NOT NULL DEFAULT 'alberto',    -- alberto | historico
  estado      TEXT NOT NULL DEFAULT 'confirmado', -- confirmado | propuesto | descartado
  booking_ref TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_hechos_prop_estado ON mensajes_hechos (property_id, estado, created_at DESC);
-- Un mismo hecho no se guarda dos veces para el mismo piso (el minado del histórico es repetible).
CREATE UNIQUE INDEX IF NOT EXISTS ux_hechos_prop_texto ON mensajes_hechos (property_id, md5(lower(hecho)));
