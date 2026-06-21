-- Migración: añadir nota_general a comandas
-- La nota_general se propaga a todos los destinos de la comanda (todos los tickets/secciones)
-- Sintaxis de voz: "nota todo [texto]" | "nota [sección] [texto]" | "nota [producto] [texto]"

ALTER TABLE comandas
  ADD COLUMN IF NOT EXISTS nota_general TEXT;

COMMENT ON COLUMN comandas.nota_general IS
  'Nota libre que se muestra en TODOS los tickets/KDS de esta comanda, independientemente de la sección. Ej: "sin sal en todo", "cliente celíaca al gluten". Extraída por BRAIN con keyword "nota todo" o añadida manualmente en /edge.';
