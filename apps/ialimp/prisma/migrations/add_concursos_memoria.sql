-- Memoria técnica generada (F4 del módulo de concursos). Se guarda junto al
-- concurso, como ficha/checklist. Estructura: { secciones: [...] }.
alter table concursos add column if not exists memoria jsonb;
