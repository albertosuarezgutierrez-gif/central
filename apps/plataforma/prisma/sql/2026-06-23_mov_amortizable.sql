-- Marca de "amortizable" (inmovilizado) en movimientos bancarios.
-- Un cargo deducible que es MOBILIARIO/OBRA/EQUIPO no se deduce al 100% el año de compra: se
-- amortiza en varios años (mobiliario 10%, inmueble 3%…). Por eso el control de gastos de /finanzas
-- lo separa del gasto deducible del ejercicio y lo lista aparte para la asesoría.
-- Ejemplo: ventilador de techo CREATE (123,45 €) para un piso turístico → turistico_pisos + amortizable.
ALTER TABLE movimientos_bancarios
  ADD COLUMN IF NOT EXISTS amortizable BOOLEAN NOT NULL DEFAULT false;
