-- Resumen IA del buscador (feature D): cachea el resumen en lenguaje claro de
-- cada licitación del corpus compartido (es por anuncio, no por empresa). Aditiva.
ALTER TABLE concursos_licitaciones ADD COLUMN IF NOT EXISTS resumen_ia text;
