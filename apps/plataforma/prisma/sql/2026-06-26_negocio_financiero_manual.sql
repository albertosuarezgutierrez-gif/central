-- Cifras financieras MANUALES por negocio (para negocios que aún no están en ninguna app).
-- Si `app` es null y hay valores aquí, el dashboard los usa como financiero del negocio.
-- Aditivo y nullable: no afecta a ningún negocio existente (siguen leyendo por su `app`).
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS ingresos_manual numeric;
ALTER TABLE negocios ADD COLUMN IF NOT EXISTS gastos_manual   numeric;
