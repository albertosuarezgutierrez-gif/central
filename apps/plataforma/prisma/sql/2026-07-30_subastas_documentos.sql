-- Documentos adjuntos a la ficha del BOE, listados en la ficha de la app.
-- Hasta ahora solo se guardaban las NOTAS extraídas de su texto (`notas_edicto`):
-- el listado en sí (edicto, certificación de cargas, cesión del crédito…) se
-- descartaba, así que la pantalla no podía decir QUÉ documentación tiene la
-- subasta ni enlazarla. Cada elemento:
--   { "titulo": "CERTIFICACIÓN DE CARGAS", "url": "https://…", "legible": false }
-- `legible=false` = PDF escaneado sin capa de texto (no se ha podido leer
-- automáticamente; hay que abrirlo a mano).
ALTER TABLE subastas
  ADD COLUMN IF NOT EXISTS documentos jsonb;
