-- Oferta económica del licitador (F5 del módulo de concursos). Guarda los datos
-- de entrada (coste, margen objetivo, importe ofertado y, opcional, ofertas de
-- la competencia). La evaluación se recalcula en vivo con el módulo puro.
alter table concursos add column if not exists oferta jsonb;
